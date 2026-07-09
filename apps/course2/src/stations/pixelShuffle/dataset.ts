/* Dataset decode for the pixel-shuffle station. The pack ships as raw gzipped
   pixel bytes (cifar10.bin.gz) plus meta.json, same format as the morning
   class, deliberately NOT a PNG sprite (see @camp/data loadGzipBinary's note on
   canvas read-back going black in headless contexts).

   Bytes are stored sample-major, each sample HWC-interleaved:
   byte(s, y, x, c) = s*inputDim + (y*tile + x)*depth + c. That layout reshapes
   straight back to an image for the viz, and a first-hidden weight row uses
   the identical layout so its "template" renders as a picture. Values are
   v/255 then per-channel mean-subtracted (mean shipped in meta.json). */

import { loadGzipBinary, loadJSON } from "@camp/data";
import type { PackedPixels } from "./protocol";

/** meta.json, the single source of truth for π, the split and the
    hyperparams (written by `camp-precompute pixel-shuffle`). */
export interface PixelShuffleMeta {
  tile: number;
  depth: number;
  trainN: number;
  valN: number;
  /** class per sample (train samples first, then validation). */
  labels: number[];
  /** per-channel train mean, over v/255; length === depth. */
  mean: number[];
  classNames_en: string[];
  classNames_zh: string[];
  /** π over the tile² pixel positions: shuffled position p shows original
      pixel permutation[p]. RGB triplets move together. */
  permutation: number[];
  permutationSeed: number;
  arch: { inputDim: number; hidden: number[]; classes: number };
  train: { lr: number; momentum: number; batchSize: number };
  /** The experiment's defined endpoint: the worker auto-pauses here (the same
      horizon the baked reference curves cover). */
  maxSteps: number;
}

/** The baked numpy mirror of the twin experiment (dashed 參考曲線). */
export interface ReferenceRuns {
  steps: number;
  evalEvery: number;
  xs: number[];
  runs: {
    normal: { loss: number[]; valAcc: number[] };
    shuffled: { loss: number[]; valAcc: number[] };
  };
  finalValAcc: { normal: number; shuffled: number };
}

const BASE = "/data/course2/pixel-shuffle";
export const META_URL = `${BASE}/meta.json`;
export const PACK_URL = `${BASE}/cifar10.bin.gz`;
export const REFERENCE_URL = `${BASE}/reference-runs.json`;

/** Raw display bytes for one sample (0–255, HWC), the input painter reads
    these straight from the pack, no mean math. */
export function sampleBytes(
  bytes: Uint8Array,
  meta: PixelShuffleMeta,
  index: number,
): Uint8Array {
  const dim = meta.tile * meta.tile * meta.depth;
  return bytes.subarray(index * dim, (index + 1) * dim);
}

/** Convert the raw sample-major pixel bytes into one flat mean-subtracted
    tensor (what both nets train on, in ORIGINAL pixel order). Pure. */
export function packFrom(meta: PixelShuffleMeta, bytes: Uint8Array): PackedPixels {
  const { tile, depth } = meta;
  const total = meta.trainN + meta.valN;
  const inputDim = tile * tile * depth;
  const mean = meta.mean;
  const data = new Float32Array(total * inputDim);
  const labels = new Int32Array(total);

  for (let s = 0; s < total; s++) {
    const base = s * inputDim;
    for (let k = 0; k < inputDim; k++) {
      data[base + k] = bytes[base + k]! / 255 - mean[k % depth]!;
    }
    labels[s] = meta.labels[s]!;
  }

  return { tile, depth, inputDim, trainN: meta.trainN, valN: meta.valN, data, labels };
}

/** Fetch + gunzip + validate the whole artifact set. */
export async function loadPixelShuffleData(): Promise<{
  meta: PixelShuffleMeta;
  bytes: Uint8Array;
  packed: PackedPixels;
}> {
  const [meta, bytes] = await Promise.all([
    loadJSON<PixelShuffleMeta>(META_URL),
    loadGzipBinary(PACK_URL),
  ]);
  const expected = (meta.trainN + meta.valN) * meta.tile * meta.tile * meta.depth;
  if (bytes.length !== expected) {
    throw new Error(
      `pixel-shuffle pack byte length ${bytes.length} !== expected ${expected}`,
    );
  }
  if (meta.permutation.length !== meta.tile * meta.tile) {
    throw new Error(
      `pixel-shuffle permutation length ${meta.permutation.length} !== ${meta.tile * meta.tile}`,
    );
  }
  return { meta, bytes, packed: packFrom(meta, bytes) };
}
