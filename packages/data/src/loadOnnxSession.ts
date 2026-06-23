import type { InferenceSession } from "onnxruntime-web";

export interface LoadOnnxOptions {
  /** Ordered execution providers. Default `["wasm"]` (broadest browser support). */
  executionProviders?: string[];
}

/**
 * Thin, SSR-guarded wrapper around onnxruntime-web's session creation.
 *
 * The browser only ever runs LIGHT inference on small models that precompute
 * exported — it never trains. Heavy lifting happens ahead of time in Python.
 *
 * SSR-safety: this throws if called outside the browser, and onnxruntime-web is
 * dynamically imported so it is never pulled into a server bundle. Call it from
 * an effect / event handler, never during render or at module scope.
 *
 * Example:
 *   useEffect(() => {
 *     let session: InferenceSession | undefined;
 *     loadOnnxSession("/data/course2/rnn/model.onnx").then((s) => { session = s; });
 *     return () => { session?.release?.(); };
 *   }, []);
 */
export async function loadOnnxSession(
  url: string,
  options: LoadOnnxOptions = {},
): Promise<InferenceSession> {
  if (typeof window === "undefined") {
    throw new Error(
      "loadOnnxSession must run in the browser — guard the call (e.g. inside useEffect).",
    );
  }
  const ort = await import("onnxruntime-web");
  return ort.InferenceSession.create(url, {
    executionProviders: options.executionProviders ?? ["wasm"],
  });
}
