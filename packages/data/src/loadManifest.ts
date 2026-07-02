import { loadJSON } from "./loadJSON";

/** One precomputed artifact listed in a course manifest. */
export interface ManifestArtifact {
  /** Stable id a station references, e.g. "mlp-loss". */
  id: string;
  /** Artifact kind, e.g. "json" | "onnx" | "bin". */
  kind: string;
  /** Path relative to the manifest, e.g. "mlp/loss.json". */
  path: string;
  /** Optional station id this artifact belongs to, e.g. "next-token". */
  station?: string;
  /** Optional size in bytes, for display. */
  bytes?: number;
}

/**
 * The manifest written by the precompute pipeline
 * (`uv run camp-precompute make-data`). It is the index a station reads to
 * discover which artifacts exist before loading them.
 */
export interface CourseManifest {
  course: string;
  /** Schema version; bump when this shape changes. */
  version: number;
  /** Tool that produced the file. */
  generator: string;
  /** ISO timestamp, if the generator stamped one. */
  generatedAt?: string;
  /** Free-form note (the current make-data writes a hello message here). */
  note?: string;
  artifacts: ManifestArtifact[];
}

/**
 * Load the Course 2 data manifest. `baseUrl` is the public URL prefix the app
 * serves `public/data/course2/` from (default `/data/course2`). Call this from
 * the browser (it uses `fetch`).
 */
export async function loadManifest(
  baseUrl = "/data/course2",
): Promise<CourseManifest> {
  return loadJSON<CourseManifest>(`${baseUrl}/manifest.json`);
}
