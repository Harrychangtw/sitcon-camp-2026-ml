/**
 * Types for the rl-playground station's precomputed artifact
 * (public/data/course2/rl-playground/policies.json, written by
 * `camp-precompute rl-export`).
 */

export type RecipeId = "forager" | "couch_potato" | "magnetized" | "speedster";

export interface PolicyWeights {
  /** [64][12] */ W0: number[][];
  /** [64] */ b0: number[];
  /** [64][64] */ W1: number[][];
  /** [64] */ b1: number[];
  /** [5][64] */ W2: number[][];
  /** [5] */ b2: number[];
}

export interface PolicyCheckpoint {
  /** Actual training steps at snapshot time (≥ target). */
  step: number;
  /** The step milestone this checkpoint represents (0 = untrained). */
  target: number;
  /** Display label, e.g. "5k" / "500k(最終)". */
  label: string;
  /** Mean eval-episode return on the ROUNDED weights (argmax playback). */
  returnMean: number;
  /** Mean gems eaten per eval episode. */
  gemsMean: number;
  weights: PolicyWeights;
}

export interface RecipeArtifact {
  id: RecipeId;
  label: string;
  isGood: boolean;
  rewardDesc: string;
  totalSteps: number;
  /** x values (training steps) for returnCurve, downsampled. */
  curveSteps: number[];
  /** Mean episode return over training, aligned with curveSteps. */
  returnCurve: number[];
  checkpoints: PolicyCheckpoint[];
}

export interface DefaultLayout {
  gems: number[][];
  lava: number[][];
  agent: number[];
  human: number[];
}

export interface EnvSpecArtifact {
  dt: number;
  accel: number;
  drag: number;
  vmax: number;
  critterR: number;
  gemR: number;
  lavaR: number;
  knockback: number;
  nGems: number;
  nLava: number;
  horizon: number;
  obsLayout: string[];
  actions: string[];
  defaultLayout: DefaultLayout;
}

export interface PoliciesArtifact {
  generator: string;
  generatedAt: string;
  station: string;
  note: string;
  env: EnvSpecArtifact;
  policy: { arch: number[]; activation: string; actionSelect: string };
  recipes: RecipeArtifact[];
}

/** parity.json — the Python↔TS determinism fixture. */
export interface ParityTraceStep {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ate: number;
  lava: boolean;
  obs: number[];
  reward: number;
  gems: number[][];
}

export interface ParityArtifact {
  seed: number;
  nGems: number;
  nLava: number;
  layout: { gems: number[][]; lava: number[][]; critter: number[] };
  stats: { eats: number; lavaHits: number; steps: number };
  actions: number[];
  trace: ParityTraceStep[];
}
