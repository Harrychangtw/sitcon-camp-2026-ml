/* Dense MLP for the pixel-shuffle twin experiment: input(3072) → fc → relu →
   fc(10) → softmax, trained with mini-batch SGD + momentum on softmax
   cross-entropy. Ported from the morning class's hand-rolled trainer
   (sitcon-camp-2026-ml-pt1 · cnn/net.ts) so the station literally re-stages
   the net students trained that morning: flat Float32Arrays so a 3072-dim
   CIFAR input stays fast, pure + deterministic (xorshift seed). No DOM, no
   worker deps, safe to run in the Web Worker.

   This is the ONE sanctioned in-browser training surface (see CLAUDE.md's
   golden-rule carve-out): toy scale (~200k params, 2,200 tiny images),
   worker-only. */

export interface MlpArch {
  /** flattened input length: 3072 (32×32×3). */
  inputDim: number;
  /** hidden layer widths, in order. */
  hidden: number[];
  classes: number;
}

/** One fully-connected layer: out×in weight matrix (row-major) + out biases,
    with SGD-momentum velocity buffers alongside. */
interface FcLayer {
  inDim: number;
  outDim: number;
  W: Float32Array; // outDim * inDim, row o at [o*inDim, o*inDim+inDim)
  b: Float32Array; // outDim
  vW: Float32Array;
  vb: Float32Array;
}

/** Gradients for one batch, matched positionally to net.layers. */
export interface Grads {
  gW: Float32Array[];
  gb: Float32Array[];
}

export class MlpNet {
  readonly arch: MlpArch;
  readonly layers: FcLayer[];

  constructor(arch: MlpArch, seed = 20260709) {
    this.arch = arch;
    const sizes = [arch.inputDim, ...arch.hidden, arch.classes];
    let s = seed >>> 0;
    const rnd = () => {
      s ^= s << 13;
      s >>>= 0;
      s ^= s >> 17;
      s ^= s << 5;
      s >>>= 0;
      return s / 4294967296; // [0,1)
    };
    // gaussian via Box–Muller, seeded.
    const gauss = () => {
      const u = Math.max(rnd(), 1e-12);
      const v = rnd();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    };
    this.layers = [];
    for (let l = 0; l < sizes.length - 1; l++) {
      const inDim = sizes[l]!;
      const outDim = sizes[l + 1]!;
      // He-style init (matches the relu activation).
      const std = Math.sqrt(2 / inDim);
      const W = new Float32Array(outDim * inDim);
      for (let i = 0; i < W.length; i++) W[i] = gauss() * std;
      this.layers.push({
        inDim,
        outDim,
        W,
        b: new Float32Array(outDim),
        vW: new Float32Array(outDim * inDim),
        vb: new Float32Array(outDim),
      });
    }
  }

  /** Forward pass. Returns pre-activations per fc layer and activations per
      layer where as[0] is the input and as[L] is the softmax output. */
  forward(x: Float32Array): { zs: Float32Array[]; as: Float32Array[] } {
    const L = this.layers.length;
    const as: Float32Array[] = [x];
    const zs: Float32Array[] = [];
    let a = x;
    for (let l = 0; l < L; l++) {
      const { W, b, inDim, outDim } = this.layers[l]!;
      const last = l === L - 1;
      const z = new Float32Array(outDim);
      const out = new Float32Array(outDim);
      for (let o = 0; o < outDim; o++) {
        let acc = b[o]!;
        const base = o * inDim;
        for (let i = 0; i < inDim; i++) acc += W[base + i]! * a[i]!;
        z[o] = acc;
      }
      zs.push(z);
      if (last) {
        softmaxInto(z, out);
      } else {
        for (let o = 0; o < outDim; o++) out[o] = Math.max(z[o]!, 0); // relu
      }
      as.push(out);
      a = out;
    }
    return { zs, as };
  }

  /** softmax probabilities for a single input. */
  predictProbs(x: Float32Array): Float32Array {
    const { as } = this.forward(x);
    return as[as.length - 1]!;
  }

  predict(x: Float32Array): number {
    return argmax(this.predictProbs(x));
  }

  /** Accumulate gradients + loss + correct-count over a batch, WITHOUT applying
      an update. Loss is the summed cross-entropy over the batch. */
  gradients(xs: Float32Array[], ys: number[]): { grads: Grads; loss: number; correct: number } {
    const L = this.layers.length;
    const gW = this.layers.map((ly) => new Float32Array(ly.W.length));
    const gb = this.layers.map((ly) => new Float32Array(ly.b.length));
    let loss = 0;
    let correct = 0;
    for (let n = 0; n < xs.length; n++) {
      const y = ys[n]!;
      const { zs, as } = this.forward(xs[n]!);
      const probs = as[L]!;
      loss += -Math.log(Math.max(probs[y]!, 1e-12));
      if (argmax(probs) === y) correct++;
      // output layer: dL/dz = probs - onehot(y)
      let delta = new Float32Array(probs.length);
      for (let o = 0; o < probs.length; o++) delta[o] = probs[o]!;
      delta[y]! -= 1;
      for (let l = L - 1; l >= 0; l--) {
        const { W, inDim, outDim } = this.layers[l]!;
        const aPrev = as[l]!;
        const gWl = gW[l]!;
        const gbl = gb[l]!;
        for (let o = 0; o < outDim; o++) {
          const d = delta[o]!;
          gbl[o]! += d;
          const base = o * inDim;
          for (let i = 0; i < inDim; i++) gWl[base + i]! += d * aPrev[i]!;
        }
        if (l > 0) {
          const zPrev = zs[l - 1]!;
          const nd = new Float32Array(inDim);
          for (let i = 0; i < inDim; i++) {
            let sum = 0;
            for (let o = 0; o < outDim; o++) sum += W[o * inDim + i]! * delta[o]!;
            nd[i] = sum * (zPrev[i]! > 0 ? 1 : 0); // relu derivative
          }
          delta = nd;
        }
      }
    }
    return { grads: { gW, gb }, loss, correct };
  }

  /** One mini-batch SGD+momentum update. Returns mean loss and accuracy over
      the batch (pre-update, i.e. the loss that produced this step). */
  trainBatch(
    xs: Float32Array[],
    ys: number[],
    lr: number,
    momentum: number,
  ): { loss: number; acc: number } {
    const N = xs.length;
    if (N === 0) return { loss: 0, acc: 0 };
    const { grads, loss, correct } = this.gradients(xs, ys);
    for (let l = 0; l < this.layers.length; l++) {
      const ly = this.layers[l]!;
      const gWl = grads.gW[l]!;
      const gbl = grads.gb[l]!;
      for (let i = 0; i < ly.W.length; i++) {
        const g = gWl[i]! / N;
        ly.vW[i] = momentum * ly.vW[i]! - lr * g;
        ly.W[i]! += ly.vW[i]!;
      }
      for (let o = 0; o < ly.b.length; o++) {
        const g = gbl[o]! / N;
        ly.vb[o] = momentum * ly.vb[o]! - lr * g;
        ly.b[o]! += ly.vb[o]!;
      }
    }
    return { loss: loss / N, acc: correct / N };
  }

  /** the incoming weight row for one neuron in fc `layer` (0 = first hidden).
      Length = that layer's inDim; for layer 0 it reshapes to the input image. */
  weightsInto(layer: number, neuron: number): Float32Array {
    const ly = this.layers[layer]!;
    return ly.W.slice(neuron * ly.inDim, neuron * ly.inDim + ly.inDim);
  }

  /** layer readout for the diagram: input, then each fc's activation + output. */
  layerSummary(): { type: "input" | "hidden" | "output"; size: number }[] {
    const out: { type: "input" | "hidden" | "output"; size: number }[] = [
      { type: "input", size: this.arch.inputDim },
    ];
    this.arch.hidden.forEach((h) => out.push({ type: "hidden", size: h }));
    out.push({ type: "output", size: this.arch.classes });
    return out;
  }
}

function softmaxInto(z: Float32Array, out: Float32Array): void {
  let max = -Infinity;
  for (const v of z) if (v > max) max = v;
  let sum = 0;
  for (let i = 0; i < z.length; i++) {
    const e = Math.exp(z[i]! - max);
    out[i] = e;
    sum += e;
  }
  const inv = 1 / sum;
  for (let i = 0; i < out.length; i++) out[i]! *= inv;
}

export function argmax(a: ArrayLike<number>): number {
  let bi = 0;
  for (let i = 1; i < a.length; i++) if (a[i]! > a[bi]!) bi = i;
  return bi;
}
