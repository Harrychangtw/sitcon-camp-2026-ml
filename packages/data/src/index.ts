// @camp/data — dataset & model loaders for precomputed artifacts.
// The browser only READS artifacts here; it never produces them.

export { loadJSON } from "./loadJSON";

export { loadManifest } from "./loadManifest";
export type {
  CourseManifest,
  ManifestArtifact,
} from "./loadManifest";

export { loadOnnxSession } from "./loadOnnxSession";
export type { LoadOnnxOptions } from "./loadOnnxSession";
