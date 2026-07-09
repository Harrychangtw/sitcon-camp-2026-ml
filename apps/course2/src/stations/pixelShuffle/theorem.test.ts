/**
 * The permutation theorem, pinned in JS, THE guard on the twin-experiment
 * construction the station's worker performs (the Python bake asserts the same
 * thing in float64 before shipping artifacts; this covers the TS port).
 *
 * Build net A, build net B from the same seed, relabel B's first layer by a
 * random pixel permutation π, then train both in lockstep, A on random
 * "images", B on the same images with π applied. If the construction is right,
 * the two runs are the same arithmetic under renamed wires:
 *   - per-batch losses match to float noise,
 *   - after training, B's first-layer rows un-shuffle (π⁻¹) back onto A's,
 *   - per-sample probabilities match.
 * Float32 summation order differs slightly between the two (A sums inputs in
 * original order, B in shuffled order), so tolerances are small-but-not-zero.
 */
import { describe, expect, it } from "vitest";
import { MlpNet } from "./net";
import {
  applyScalarPerm,
  expandPerm,
  invertScalarPerm,
  relabelFirstLayer,
} from "./permute";

const TILE = 8; // 8×8×3 keeps the test fast; the math is dimension-agnostic
const DEPTH = 3;
const DIM = TILE * TILE * DEPTH;
const ARCH = { inputDim: DIM, hidden: [16], classes: 10 };

function xorshift(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

describe("pixel-shuffle twin construction", () => {
  it("permuted-copy init + shared batches ⇒ the same run under renamed wires", () => {
    const rnd = xorshift(99);
    // a fixed random permutation of the pixel positions
    const perm = Array.from({ length: TILE * TILE }, (_, i) => i);
    for (let i = perm.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [perm[i]!, perm[j]!] = [perm[j]!, perm[i]!];
    }
    const scalar = expandPerm(perm, DEPTH);
    const inv = invertScalarPerm(scalar);

    const netA = new MlpNet(ARCH, 20260709);
    const netB = new MlpNet(ARCH, 20260709);
    relabelFirstLayer(netB, netA, scalar);

    // random dataset (values in the mean-subtracted ballpark)
    const N = 64;
    const data: Float32Array[] = [];
    const labels: number[] = [];
    for (let s = 0; s < N; s++) {
      const x = new Float32Array(DIM);
      for (let k = 0; k < DIM; k++) x[k] = rnd() - 0.5;
      data.push(x);
      labels.push(Math.floor(rnd() * ARCH.classes));
    }
    const dataShuf = data.map((x) => applyScalarPerm(x, scalar));

    // lockstep training on a shared batch schedule
    for (let step = 0; step < 60; step++) {
      const xsA: Float32Array[] = [];
      const xsB: Float32Array[] = [];
      const ys: number[] = [];
      for (let i = 0; i < 8; i++) {
        const idx = Math.floor(rnd() * N);
        xsA.push(data[idx]!);
        xsB.push(dataShuf[idx]!);
        ys.push(labels[idx]!);
      }
      const rA = netA.trainBatch(xsA, ys, 0.05, 0.9);
      const rB = netB.trainBatch(xsB, ys, 0.05, 0.9);
      expect(Math.abs(rA.loss - rB.loss)).toBeLessThan(1e-4);
      expect(rA.acc).toBe(rB.acc);
    }

    // B's trained first-layer rows un-shuffle back onto A's (the 還原排列 beat)
    for (const neuron of [0, 7, 15]) {
      const rowA = netA.weightsInto(0, neuron);
      const rowB = applyScalarPerm(netB.weightsInto(0, neuron), inv);
      for (let k = 0; k < DIM; k++) {
        expect(Math.abs(rowA[k]! - rowB[k]!)).toBeLessThan(1e-4);
      }
    }

    // deeper layer identical-by-index, and per-sample probs match
    const w2A = netA.weightsInto(1, 3);
    const w2B = netB.weightsInto(1, 3);
    for (let k = 0; k < w2A.length; k++) {
      expect(Math.abs(w2A[k]! - w2B[k]!)).toBeLessThan(1e-4);
    }
    const pA = netA.predictProbs(data[0]!);
    const pB = netB.predictProbs(dataShuf[0]!);
    for (let c = 0; c < ARCH.classes; c++) {
      expect(Math.abs(pA[c]! - pB[c]!)).toBeLessThan(1e-4);
    }
  });
});
