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
 * to `null`, so every caller falls back to the precomputed artifact and a dead
 * server degrades gracefully instead of breaking the class.
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
 * contract: any failure resolves to `null`.
 */
export async function liveInferTimed<T>(
  path: string,
  body: unknown,
  timeoutMs = 5000,
): Promise<LiveResult<T> | null> {
  const base = liveInferenceUrl();
  if (!base) return null;

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
    if (!res.ok) return null;
    const data = (await res.json()) as T;
    return { data, ms: Math.round(performance.now() - start) };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
