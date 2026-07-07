/**
 * The trained policy's forward pass — the ONLY "model" code the browser runs.
 * A 12→64→64→5 tanh MLP is a few matmuls (~5k parameters); this is the "light
 * inference" the golden rule allows. Weights come from policies.json
 * (precomputed by `camp-precompute train-rl` / `rl-export`).
 *
 * Playback is deterministic argmax (matches how checkpoints were evaluated).
 * The obs/action masks are the station's "poke it" knobs: they blindfold or
 * handcuff a FIXED policy — no retraining, so students see that the agent only
 * knows what it senses.
 */

import type { PolicyWeights } from "./types";

/** What the agent can perceive/do — one perturbation at a time keeps the
 * cause→effect readable in class. */
export type Handicap = "none" | "blind_gems" | "blind_lava" | "no_left" | "no_up";

// Obs channel groups (indices into OBS_LAYOUT — see env.ts / rl.py).
const GEM_CHANNELS = [2, 3, 4];
const LAVA_CHANNELS = [5, 6, 7];

// Action ids (see env.ts).
const LEFT = 3;
const UP = 1;

/** Zero the masked sense channels IN PLACE (obs arrays are per-step scratch). */
export function maskObs(obs: number[], handicap: Handicap): number[] {
  if (handicap === "blind_gems") {
    for (const i of GEM_CHANNELS) obs[i] = 0;
    obs[4] = 1; // "nearest gem" reads as maximally far, like an empty world
  } else if (handicap === "blind_lava") {
    for (const i of LAVA_CHANNELS) obs[i] = 0;
    obs[7] = 1;
  }
  return obs;
}

export function forward(w: PolicyWeights, obs: number[]): number[] {
  const h0 = layer(w.W0, w.b0, obs, true);
  const h1 = layer(w.W1, w.b1, h0, true);
  return layer(w.W2, w.b2, h1, false);
}

function layer(W: number[][], b: number[], x: number[], tanh: boolean): number[] {
  const out = new Array<number>(W.length);
  for (let r = 0; r < W.length; r++) {
    const row = W[r]!;
    let acc = b[r]!;
    for (let c = 0; c < row.length; c++) acc += row[c]! * x[c]!;
    out[r] = tanh ? Math.tanh(acc) : acc;
  }
  return out;
}

/** Deterministic argmax over the non-banned logits. */
export function selectAction(logits: number[], handicap: Handicap): number {
  const banned = handicap === "no_left" ? LEFT : handicap === "no_up" ? UP : -1;
  let best = -1;
  let bestV = -Infinity;
  for (let a = 0; a < logits.length; a++) {
    if (a === banned) continue;
    const v = logits[a]!;
    if (v > bestV) {
      bestV = v;
      best = a;
    }
  }
  return best;
}

/** One playback decision: mask senses → forward → argmax minus banned actions. */
export function policyAction(
  w: PolicyWeights,
  obs: number[],
  handicap: Handicap,
): number {
  return selectAction(forward(w, maskObs(obs, handicap)), handicap);
}
