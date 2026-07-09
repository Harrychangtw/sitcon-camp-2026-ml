/* The twin training Web Worker, the station's one sanctioned in-browser
   training loop (see CLAUDE.md's golden-rule carve-out). Owns BOTH nets and
   both dataset tensors, and trains them in lockstep: each tick draws batch
   indices ONCE and feeds the same samples to net A (real pixels) and net B
   (π-moved pixels). Net B starts from the π-relabeled copy of net A's init
   (permuted-copy construction), so the two runs are the same arithmetic under
   renamed wires, the curves coincide by theorem, up to float summation-order
   drift. Posts cheap metrics every tick and a throttled snapshot; all net
   access goes through here, the UI only talks to TwinNetClient.

   Ported from the morning class's cnn/trainer.worker.ts (same cadence
   constants), widened to two nets. */

import { MlpNet } from "./net";
import type { MlpArch } from "./net";
import { applyScalarPerm, expandPerm, relabelFirstLayer } from "./permute";
import type {
  FromWorker,
  NetId,
  PackedPixels,
  ToWorker,
  TrainOpts,
  TwinMetrics,
} from "./protocol";

const TICK_MS = 33;
const BATCHES_PER_TICK = 3; // ×2 nets per batch, verified smooth on the UI thread
const SNAPSHOT_EVERY = 6; // ticks
const VAL_EVERY = 18; // ticks

// The batch schedule's OWN seed, reset together with the nets so ↺ 重來
// replays the exact same experiment (unlike the morning playground, which
// deliberately re-rolls, here reproducibility IS the lesson).
const BATCH_RNG_SEED = 12345;

let dataA: PackedPixels | null = null;
let dataB: Float32Array | null = null; // π applied once, same labels as A
let netA: MlpNet | null = null;
let netB: MlpNet | null = null;
let scalarPerm: Int32Array | null = null;
let arch: MlpArch | null = null;
let opts: TrainOpts = { lr: 0.05, momentum: 0.9, batchSize: 16 };
let seed = 20260709;
// The experiment's defined endpoint (from meta.json): the run auto-pauses
// here. Past the plateau this lr/momentum recipe starts to oscillate hard, so
// an unbounded run would eventually spike its loss and dilute the lesson.
let maxSteps = 4000;
let running = false;
let step = 0;
let tick = 0;
let curInput = 0;
let lastValA: number | null = null;
let lastValB: number | null = null;
// running metric estimates (EMA) so the readout is smooth between ticks.
let emaLossA = 0;
let emaLossB = 0;
let emaAccA = 0;
let emaAccB = 0;
let rngState = BATCH_RNG_SEED;
let timer: ReturnType<typeof setInterval> | null = null;

function post(msg: FromWorker) {
  (self as unknown as Worker).postMessage(msg);
}

function rnd(): number {
  rngState ^= rngState << 13;
  rngState >>>= 0;
  rngState ^= rngState >> 17;
  rngState ^= rngState << 5;
  rngState >>>= 0;
  return rngState / 4294967296;
}

function sampleView(data: Float32Array, dim: number, index: number): Float32Array {
  return data.subarray(index * dim, (index + 1) * dim);
}

/** (Re)build both nets: A from the seed, B as A's π-relabeled copy (biases and
    deeper layers are exact copies, same-seed construction makes them equal
    already; relabelFirstLayer rewires layer 0). */
function buildNets() {
  if (!arch || !scalarPerm) return;
  netA = new MlpNet(arch, seed);
  netB = new MlpNet(arch, seed); // identical weights everywhere…
  relabelFirstLayer(netB, netA, scalarPerm);
  step = 0;
  tick = 0;
  emaLossA = emaLossB = emaAccA = emaAccB = 0;
  lastValA = lastValB = null;
  rngState = BATCH_RNG_SEED;
}

function trainOneTick() {
  if (!netA || !netB || !dataA || !dataB) return;
  const bs = opts.batchSize;
  const dim = dataA.inputDim;
  for (let b = 0; b < BATCHES_PER_TICK && step < maxSteps; b++) {
    // ONE draw of indices, the shared batch schedule both nets see.
    const xsA: Float32Array[] = [];
    const xsB: Float32Array[] = [];
    const ys: number[] = [];
    for (let i = 0; i < bs; i++) {
      const idx = Math.floor(rnd() * dataA.trainN);
      xsA.push(sampleView(dataA.data, dim, idx));
      xsB.push(sampleView(dataB, dim, idx));
      ys.push(dataA.labels[idx]!);
    }
    const rA = netA.trainBatch(xsA, ys, opts.lr, opts.momentum);
    const rB = netB.trainBatch(xsB, ys, opts.lr, opts.momentum);
    emaLossA = emaLossA === 0 ? rA.loss : emaLossA * 0.9 + rA.loss * 0.1;
    emaLossB = emaLossB === 0 ? rB.loss : emaLossB * 0.9 + rB.loss * 0.1;
    emaAccA = emaAccA === 0 ? rA.acc : emaAccA * 0.9 + rA.acc * 0.1;
    emaAccB = emaAccB === 0 ? rB.acc : emaAccB * 0.9 + rB.acc * 0.1;
    step++;
  }
}

function valAccuracy(net: MlpNet, data: Float32Array): number {
  if (!dataA) return 0;
  const dim = dataA.inputDim;
  let ok = 0;
  for (let i = 0; i < dataA.valN; i++) {
    const idx = dataA.trainN + i;
    if (net.predict(sampleView(data, dim, idx)) === dataA.labels[idx]!) ok++;
  }
  return dataA.valN ? ok / dataA.valN : 0;
}

function metrics(): TwinMetrics {
  return {
    step,
    done: step >= maxSteps,
    lossA: emaLossA,
    lossB: emaLossB,
    accA: emaAccA,
    accB: emaAccB,
    valAccA: lastValA,
    valAccB: lastValB,
  };
}

function sendSnapshot() {
  if (!netA || !netB || !dataA || !dataB) return;
  const dim = dataA.inputDim;
  const { as: actsA } = netA.forward(sampleView(dataA.data, dim, curInput));
  const { as: actsB } = netB.forward(sampleView(dataB, dim, curInput));
  // acts[0] is a subarray VIEW into the multi-MB dataset buffer, postMessage
  // structured-clones a view's ENTIRE backing buffer, so replace it with a
  // compact copy before posting (the deeper acts own their buffers already).
  actsA[0] = actsA[0]!.slice();
  actsB[0] = actsB[0]!.slice();
  post({
    type: "snapshot",
    snapshot: {
      inputIndex: curInput,
      label: dataA.labels[curInput]!,
      actsA,
      actsB,
      probsA: actsA[actsA.length - 1]!,
      probsB: actsB[actsB.length - 1]!,
    },
  });
}

function loop() {
  if (!running) return;
  trainOneTick();
  tick++;
  const done = step >= maxSteps;
  if (done || tick % VAL_EVERY === 0) {
    if (netA && netB && dataA && dataB) {
      lastValA = valAccuracy(netA, dataA.data);
      lastValB = valAccuracy(netB, dataB);
    }
  }
  if (done) {
    // the experiment reached its endpoint: auto-pause with a final readout.
    running = false;
    stopTimer();
  }
  post({ type: "metrics", metrics: metrics() });
  if (done || tick % SNAPSHOT_EVERY === 0) sendSnapshot();
}

function loopOnce() {
  if (step >= maxSteps) return; // 單步 can't push past the endpoint either
  trainOneTick();
  tick++;
  if (netA && netB && dataA && dataB) {
    lastValA = valAccuracy(netA, dataA.data);
    lastValB = valAccuracy(netB, dataB);
  }
  post({ type: "metrics", metrics: metrics() });
  sendSnapshot();
}

function startTimer() {
  if (timer != null) return;
  timer = setInterval(loop, TICK_MS);
}
function stopTimer() {
  if (timer != null) {
    clearInterval(timer);
    timer = null;
  }
}

function ready() {
  if (!dataA || !netA) return;
  post({
    type: "ready",
    info: {
      trainN: dataA.trainN,
      valN: dataA.valN,
      tile: dataA.tile,
      depth: dataA.depth,
      inputDim: dataA.inputDim,
      layers: netA.layerSummary(),
      firstVal: dataA.trainN,
    },
  });
}

function netOf(id: NetId): MlpNet | null {
  return id === "A" ? netA : netB;
}

self.onmessage = (ev: MessageEvent<ToWorker>) => {
  const m = ev.data;
  try {
    switch (m.type) {
      case "init": {
        running = false;
        stopTimer();
        dataA = m.packed;
        arch = m.arch;
        opts = m.opts;
        seed = m.seed;
        maxSteps = m.maxSteps;
        scalarPerm = expandPerm(m.permutation, dataA.depth);
        // Run B's dataset: π applied once to every sample (train AND val).
        const dim = dataA.inputDim;
        const total = dataA.trainN + dataA.valN;
        dataB = new Float32Array(dataA.data.length);
        for (let s = 0; s < total; s++) {
          dataB.set(applyScalarPerm(sampleView(dataA.data, dim, s), scalarPerm), s * dim);
        }
        curInput = dataA.trainN;
        buildNets();
        ready();
        sendSnapshot();
        break;
      }
      case "reset": {
        running = false;
        stopTimer();
        buildNets();
        post({ type: "metrics", metrics: metrics() });
        sendSnapshot();
        break;
      }
      case "setInput": {
        curInput = m.index;
        sendSnapshot();
        break;
      }
      case "reqWeights": {
        const net = netOf(m.net);
        if (!net || !dataA) break;
        post({
          type: "weights",
          weights: {
            net: m.net,
            layer: m.layer,
            neuron: m.neuron,
            row: net.weightsInto(m.layer, m.neuron),
            tile: dataA.tile,
            depth: dataA.depth,
          },
        });
        break;
      }
      case "start": {
        running = true;
        startTimer();
        break;
      }
      case "pause": {
        running = false;
        stopTimer();
        break;
      }
      case "step": {
        running = false;
        stopTimer();
        loopOnce();
        break;
      }
    }
  } catch (e) {
    post({ type: "error", message: e instanceof Error ? e.message : String(e) });
  }
};
