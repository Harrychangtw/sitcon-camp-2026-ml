/**
 * liveInfer — the opt-in client for the live inference server (`server/`).
 *
 * The golden rule stands: fixed-input stations only replay precomputed
 * artifacts. The live server exists solely for CUSTOM student input the
 * precomputed lookup tables can't cover, and it answers in the SAME shape as
 * the artifact it substitutes for, so callers render live results through the
 * exact same viz path.
 *
 * Failure model: this helper NEVER throws. Any problem — env var unset,
 * network error, timeout, non-2xx (including 422 input rejections) — resolves
 * to a failure value, so every caller falls back to the precomputed artifact
 * and a dead server degrades gracefully instead of breaking the class.
 *
 * Two shapes for the same call:
 * - `liveInferTimed` returns `LiveResult<T> | null` (legacy; null on any fail).
 * - `liveInferOutcome` returns a tagged `LiveOutcome<T>` that distinguishes a
 *   reachable server that REJECTED this input (4xx → `reason: "rejected"`, e.g.
 *   a sentence over the token cap) from a server that is simply unreachable
 *   (`reason: "offline"`). The station needs that split to show "shorten your
 *   input" instead of the misleading "offline · showing precomputed" line.
 *
 * Every failure is also `console.warn`'d with the path + status + server detail
 * so a fallback is never silent when you open the console.
 */

interface LiveEnv {
  VITE_LIVE_INFERENCE_URL?: string;
  VITE_LIVE_INFERENCE_TOKEN?: string;
}

/** Vite injects `import.meta.env`; outside Vite (or during SSR in the shell
 * app) `env` is simply absent and live inference stays off.
 *
 * The cast must stay INLINE around `import.meta`: Vite (and esbuild in prod
 * builds) only recognises the literal `import.meta.env` member expression, so
 * aliasing `import.meta` to a variable first leaves `env` undefined and
 * silently disables live inference everywhere. */
function liveEnv(): LiveEnv {
  return (import.meta as { env?: LiveEnv }).env ?? {};
}

/** The configured server base URL (no trailing slash), or null when the
 * station should stay precomputed-only. */
export function liveInferenceUrl(): string | null {
  const url = liveEnv().VITE_LIVE_INFERENCE_URL?.trim();
  return url ? url.replace(/\/+$/, "") : null;
}

/** Whether custom input should even offer the live path. */
export function liveInferenceEnabled(): boolean {
  return liveInferenceUrl() !== null;
}

/** A live server response plus the wall-clock round-trip that produced it —
 * the honest "a GPU computed this, and it took N ms" number for the UI. */
export interface LiveResult<T> {
  data: T;
  ms: number;
}

/** Why a live call did not yield data.
 * - `rejected`: the server was reached and answered 4xx — THIS input is bad
 *   (over the token cap, empty, malformed). Actionable: change the input.
 * - `offline`: no usable server (env unset), network error, timeout, or 5xx.
 *   Not the student's fault; fall back to the precomputed artifact quietly. */
export type LiveFailReason = "rejected" | "offline";

/** Tagged outcome of a live call — success carries the timed data, failure
 * carries a reason (+ HTTP status and the server's `detail` when it 4xx'd). */
export type LiveOutcome<T> =
  | { ok: true; data: T; ms: number }
  | { ok: false; reason: LiveFailReason; status?: number; detail?: string };

/** Pull a human string out of a FastAPI error body: `{detail: "..."}` or the
 * `{detail: [{msg}...]}` validation shape. Never throws. */
async function readErrorDetail(res: Response): Promise<string | undefined> {
  try {
    const body = (await res.json()) as { detail?: unknown };
    const d = body?.detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d)) {
      const msg = d
        .map((e) => (e && typeof e === "object" ? (e as { msg?: string }).msg : null))
        .filter(Boolean)
        .join("; ");
      return msg || undefined;
    }
  } catch {
    /* non-JSON error body — nothing useful to surface */
  }
  return undefined;
}

/**
 * POST `body` to the live server. Resolves to the parsed response, or `null`
 * on ANY failure (caller falls back to precomputed data).
 *
 * @param path - endpoint path, e.g. `/embedding/lookup`
 * @param body - JSON-serialisable request body
 * @param timeoutMs - abort budget; the models are tiny, so a healthy server
 *   answers in well under a second even on CPU
 */
export async function liveInfer<T>(
  path: string,
  body: unknown,
  timeoutMs = 5000,
): Promise<T | null> {
  const timed = await liveInferTimed<T>(path, body, timeoutMs);
  return timed ? timed.data : null;
}

/**
 * Like `liveInfer`, but also reports the round-trip latency. Same never-throws
 * contract: any failure resolves to `null`. Thin wrapper over
 * `liveInferOutcome` for callers that don't need the rejected/offline split.
 */
export async function liveInferTimed<T>(
  path: string,
  body: unknown,
  timeoutMs = 5000,
): Promise<LiveResult<T> | null> {
  const out = await liveInferOutcome<T>(path, body, timeoutMs);
  return out.ok ? { data: out.data, ms: out.ms } : null;
}

/**
 * POST `body` to the live server and report a tagged outcome (never throws).
 * A 4xx means the server rejected THIS input → `reason: "rejected"` with the
 * server's detail; anything else (env unset, network, timeout, 5xx) →
 * `reason: "offline"`. Every failure is logged to the console.
 */
export async function liveInferOutcome<T>(
  path: string,
  body: unknown,
  timeoutMs = 5000,
): Promise<LiveOutcome<T>> {
  const base = liveInferenceUrl();
  if (!base) return { ok: false, reason: "offline" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const start = performance.now();
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    const token = liveEnv().VITE_LIVE_INFERENCE_TOKEN?.trim();
    if (token) headers["X-Camp-Token"] = token;

    const res = await fetch(`${base}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = await readErrorDetail(res);
      // 4xx = the server ran and rejected this input (bad request / over cap);
      // 5xx = the server itself is unhealthy → treat as offline and fall back.
      const reason: LiveFailReason = res.status < 500 ? "rejected" : "offline";
      console.warn(
        `[liveInfer] ${path} → ${res.status} (${reason})${detail ? `: ${detail}` : ""}`,
      );
      return { ok: false, reason, status: res.status, detail };
    }
    const data = (await res.json()) as T;
    return { ok: true, data, ms: Math.round(performance.now() - start) };
  } catch (e) {
    const aborted = e instanceof DOMException && e.name === "AbortError";
    console.warn(
      `[liveInfer] ${path} → ${aborted ? `timeout after ${timeoutMs}ms` : `network error: ${String(e)}`} (offline)`,
    );
    return { ok: false, reason: "offline" };
  } finally {
    clearTimeout(timer);
  }
}
