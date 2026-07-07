/**
 * Types for the rl-playground station's precomputed artifact
 * (public/data/course2/rl-playground/policies.json, written by
 * `camp-precompute rl-export`).
 */

export type RecipeId = "forager" | "couch_potato" | "magnetized" | "speedster";

export interface PolicyWeights {
  /** [64][17] */ W0: number[][];
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
  /** Mean head-to-head gem margin vs the strength-eval panel (self-play
   * recipes only — the number the ladder is ordered by). */
  vsPanelMargin?: number;
  weights: PolicyWeights;
}

export interface RecipeArtifact {
  id: RecipeId;
  label: string;
  isGood: boolean;
  /** Trained against frozen copies of itself (forager) — solo otherwise. */
  selfPlay: boolean;
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
  /** The opponent-absent sentinel (documentation — env.ts owns the value). */
  oppAbsent: number[];
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

/** parity.json — the Python↔TS determinism fixture (two scripted critters,
 * so the opponent obs channels are exercised, not just physics). */
export interface ParityCritterStep {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ate: number;
  lava: boolean;
  obs: number[];
  reward: number;
}

export interface ParityTraceStep {
  a: ParityCritterStep;
  b: ParityCritterStep;
  gems: number[][];
}

export interface ParityArtifact {
  seed: number;
  nGems: number;
  nLava: number;
  layout: { gems: number[][]; lava: number[][]; critters: number[][] };
  stats: { eats: number; lavaHits: number; steps: number };
  /** Per step: [actionA, actionB] — replayed A first, then B. */
  actions: number[][];
  trace: ParityTraceStep[];
}
