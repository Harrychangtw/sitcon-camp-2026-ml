// @camp/data — dataset & model loaders for precomputed artifacts.
// The browser only READS artifacts here; it never produces them.

export { loadJSON } from "./loadJSON";

export { loadGzipBinary } from "./loadGzipBinary";

export { loadManifest } from "./loadManifest";
export type {
  CourseManifest,
  ManifestArtifact,
} from "./loadManifest";

export { loadOnnxSession } from "./loadOnnxSession";
export type { LoadOnnxOptions } from "./loadOnnxSession";

export {
  liveInfer,
  liveInferTimed,
  liveInferOutcome,
  liveInferenceEnabled,
  liveInferenceUrl,
  setUnauthorizedHandler,
} from "./liveInfer";
export type { LiveResult, LiveOutcome, LiveFailReason } from "./liveInfer";
