/* TwinNetClient, the main-thread proxy around the twin training Web Worker.
   The station holds ONE of these in a ref and never touches MlpNet/Worker
   directly. It buffers twin loss/val-accuracy histories + the latest
   metrics/snapshot, and fires a single `onEvent` callback the component uses
   to schedule repaints. Ported from the morning class's cnn/client.ts,
   widened to the twin run (dataset decode lives in dataset.ts / the station's
   load effect, so this class stays a thin postMessage seam). */

import type { MlpArch } from "./net";
import type {
  FromWorker,
  NetId,
  PackedPixels,
  ReadyInfo,
  TrainOpts,
  TwinSnapshot,
  WeightsMsg,
} from "./protocol";

export type ClientEvent = FromWorker["type"];

const HIST_CAP = 4000;

/** The station's fixed net-init seed: ↺ 重來 rebuilds from the SAME seed so
    every run of the experiment is reproducible (and comparable to the baked
    reference curves). */
export const NET_SEED = 20260709;

export class TwinNetClient {
  private worker: Worker;

  /** Metric histories, one entry per worker metrics tick; stepHist carries the
      real step count for the LossCurve x-axis. */
  stepHist: number[] = [];
  lossHistA: number[] = [];
  lossHistB: number[] = [];
  valAccA: number | null = null;
  valAccB: number | null = null;
  step = 0;
  /** true once the worker auto-paused at the run's maxSteps endpoint. */
  done = false;
  lossA = 0;
  lossB = 0;
  accA = 0;
  accB = 0;
  ready: ReadyInfo | null = null;
  snapshot: TwinSnapshot | null = null;
  lastError: string | null = null;
  /** cache of hover weight-templates, keyed `net:layer:neuron`; cleared on reset. */
  weights = new Map<string, WeightsMsg>();

  /** the component sets this to be told when state changed (schedule a repaint). */
  onEvent: ((ev: ClientEvent) => void) | null = null;

  constructor() {
    this.worker = new Worker(new URL("./trainer.worker.ts", import.meta.url), {
      type: "module",
    });
    this.worker.onmessage = (e: MessageEvent<FromWorker>) => this.handle(e.data);
  }

  private handle(m: FromWorker) {
    switch (m.type) {
      case "ready":
        this.ready = m.info;
        this.weights.clear();
        break;
      case "metrics": {
        const t = m.metrics;
        this.step = t.step;
        this.done = t.done;
        this.lossA = t.lossA;
        this.lossB = t.lossB;
        this.accA = t.accA;
        this.accB = t.accB;
        this.valAccA = t.valAccA;
        this.valAccB = t.valAccB;
        if (t.step > 0) {
          this.stepHist.push(t.step);
          this.lossHistA.push(t.lossA);
          this.lossHistB.push(t.lossB);
          if (this.stepHist.length > HIST_CAP) {
            this.stepHist.splice(0, HIST_CAP / 2);
            this.lossHistA.splice(0, HIST_CAP / 2);
            this.lossHistB.splice(0, HIST_CAP / 2);
          }
        } else {
          this.clearHist();
        }
        break;
      }
      case "snapshot":
        this.snapshot = m.snapshot;
        break;
      case "weights":
        this.weights.set(
          `${m.weights.net}:${m.weights.layer}:${m.weights.neuron}`,
          m.weights,
        );
        break;
      case "error":
        this.lastError = m.message;
        break;
    }
    this.onEvent?.(m.type);
  }

  private clearHist() {
    this.stepHist = [];
    this.lossHistA = [];
    this.lossHistB = [];
    this.step = 0;
    this.done = false;
    this.lossA = 0;
    this.lossB = 0;
    this.accA = 0;
    this.accB = 0;
    this.valAccA = null;
    this.valAccB = null;
  }

  /** Hand the decoded pack + π to the worker (buffers are cloned, not
      transferred, the station keeps the raw bytes for painting). */
  init(
    packed: PackedPixels,
    permutation: number[],
    arch: MlpArch,
    opts: TrainOpts,
    maxSteps: number,
  ) {
    this.clearHist();
    this.weights.clear();
    this.worker.postMessage({
      type: "init",
      packed,
      permutation,
      arch,
      opts,
      seed: NET_SEED,
      maxSteps,
    });
  }

  /** Deterministic 重來: same seed, same batch schedule, same experiment. */
  reset() {
    this.clearHist();
    this.weights.clear();
    this.worker.postMessage({ type: "reset" });
  }

  start() {
    this.worker.postMessage({ type: "start" });
  }
  pause() {
    this.worker.postMessage({ type: "pause" });
  }
  stepOnce() {
    this.worker.postMessage({ type: "step" });
  }
  setInput(index: number) {
    this.worker.postMessage({ type: "setInput", index });
  }
  /** `force` skips the cache, the station refreshes the inspected neuron's
      row on every snapshot so a template never goes stale mid-training. */
  reqWeights(net: NetId, layer: number, neuron: number, force = false) {
    if (!force && this.weights.has(`${net}:${layer}:${neuron}`)) return;
    this.worker.postMessage({ type: "reqWeights", net, layer, neuron });
  }

  dispose() {
    this.worker.terminate();
  }
}
