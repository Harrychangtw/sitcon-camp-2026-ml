/* Typed message protocol between the station (main thread) and the twin
   training Web Worker. The worker owns BOTH nets, both dataset tensors and the
   lockstep training loop; the main thread only sends control messages and
   receives cheap metrics plus throttled viz snapshots. Keeping this union in
   one file is the contract both sides import (ported from the morning class's
   cnn/protocol.ts, widened to a twin run). */

import type { MlpArch } from "./net";

/** A = 原始像素 (real pixels), B = 打亂像素 (π-moved pixels). */
export type NetId = "A" | "B";

/** one layer block for the diagram: input, hidden×N, output. */
export interface LayerMeta {
  type: "input" | "hidden" | "output";
  size: number;
}

/** The decoded dataset in ORIGINAL pixel order, packed into flat transferable
    buffers (train samples first, then val). The worker derives run B's copy by
    applying π once. */
export interface PackedPixels {
  tile: number;
  depth: number;
  inputDim: number;
  trainN: number;
  valN: number;
  /** (trainN+valN) * inputDim, sample-major HWC, v/255 − mean[c]. */
  data: Float32Array;
  labels: Int32Array;
}

export interface TrainOpts {
  lr: number;
  momentum: number;
  batchSize: number;
}

/* ----------------------------------------------------- main → worker.
   `init` carries the decoded pack, the main thread decodes (fetch +
   DecompressionStream), the worker owns the tensors from then on. */
export type ToWorker =
  | {
      type: "init";
      packed: PackedPixels;
      /** π over pixel POSITIONS (length tile², from meta.json). */
      permutation: number[];
      arch: MlpArch;
      opts: TrainOpts;
      seed: number;
      /** auto-pause horizon; the worker never trains past this step count. */
      maxSteps: number;
    }
  | { type: "start" }
  | { type: "pause" }
  | { type: "step" } // advance one tick then pause
  | { type: "reset" } // re-init both nets from the SAME seed, 重來 reproduces
  | { type: "setInput"; index: number }
  | { type: "reqWeights"; net: NetId; layer: number; neuron: number };

/* ----------------------------------------------------- worker → main */
export interface ReadyInfo {
  trainN: number;
  valN: number;
  tile: number;
  depth: number;
  inputDim: number;
  layers: LayerMeta[];
  /** first-validation-image index, the default current image. */
  firstVal: number;
}

/** Per-tick twin metrics. Loss/acc are EMA-smoothed like the morning class. */
export interface TwinMetrics {
  step: number;
  /** true once the run hit maxSteps; the worker has auto-paused. */
  done: boolean;
  lossA: number;
  lossB: number;
  accA: number;
  accB: number;
  valAccA: number | null;
  valAccB: number | null;
}

/** activations for the current input through BOTH nets (acts[0] = the net's
    own input view, acts[L] = probs). */
export interface TwinSnapshot {
  inputIndex: number;
  label: number;
  actsA: Float32Array[];
  actsB: Float32Array[];
  probsA: Float32Array;
  probsB: Float32Array;
}

export interface WeightsMsg {
  net: NetId;
  layer: number;
  neuron: number;
  row: Float32Array;
  tile: number;
  depth: number;
}

export type FromWorker =
  | { type: "ready"; info: ReadyInfo }
  | { type: "metrics"; metrics: TwinMetrics }
  | { type: "snapshot"; snapshot: TwinSnapshot }
  | { type: "weights"; weights: WeightsMsg }
  | { type: "error"; message: string };
