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
}

/**
 * Called when a live call comes back 401 (no valid session). The app registers
 * a handler that re-shows the password screen; liveInfer itself still returns a
 * graceful failure so the station falls back to precomputed JSON in the
 * meantime. No secret is involved — auth is a server-set HttpOnly cookie.
 */
type UnauthorizedHandler = () => void;
let onUnauthorized: UnauthorizedHandler | null = null;

/** Register (or clear, with `null`) the 401 handler. */
export function setUnauthorizedHandler(fn: UnauthorizedHandler | null): void {
  onUnauthorized = fn;
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
    const res = await fetch(`${base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Send the HttpOnly session cookie minted by /auth. No client secret is
      // read or set here — the bundle carries no token.
      credentials: "include",
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = await readErrorDetail(res);
      // A 401 means the session is missing/expired — not this input's fault.
      // Signal the app to re-show the login screen, and classify as "offline"
      // so the station shows "offline · showing precomputed", never a
      // misleading "too long" while the student is really just logged out.
      if (res.status === 401) onUnauthorized?.();
      // Classify the rest for the caller's status line:
      // - a normal 4xx = the server ran and rejected THIS input (bad request /
      //   over the token cap) → "rejected" (station tells the student to
      //   shorten their input).
      // - 429 (the backend's rate / concurrency limit) and 503 are CAPACITY
      //   conditions — the input is fine, the GPU is just busy — so they must
      //   read as "offline" (→ "offline · showing precomputed"), NOT a
      //   misleading "too long".
      // - 401 (logged out) and 5xx (unhealthy server) → "offline".
      const capacity = res.status === 429 || res.status === 503;
      const reason: LiveFailReason =
        res.status < 500 && res.status !== 401 && !capacity
          ? "rejected"
          : "offline";
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
