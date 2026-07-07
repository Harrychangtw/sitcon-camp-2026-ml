/**
 * Critter Arena environment — the TS twin of camp_precompute/rl.py.
 *
 * THE PARITY CONTRACT (load-bearing): this file and the Python reference env
 * implement the SAME dynamics with the SAME constants, the SAME operation
 * order, and the SAME integer RNG, in IEEE-754 doubles on both sides — so the
 * browser's live playback reproduces what the policies were trained on.
 * `parity.test.ts` replays the recorded fixture (parity.json) through this
 * file and asserts ≤1e-6 drift. If you touch ANY constant or formula here,
 * mirror it in rl.py and regenerate parity.json
 * (`camp-precompute rl-export --parity-only`).
 *
 * Determinism knobs: scalar double math only; fixed integration order
 * (thrust → drag → speed clamp → move → wall clamp → gems → lava → obs →
 * reward); mulberry32 with explicit `>>> 0` coercions mirroring Python's
 * `& 0xFFFFFFFF` masks; playback is argmax — no RNG outside world sampling.
 */

import type { RecipeId } from "./types";

// --- env spec (MUST mirror rl.py exactly) ------------------------------------

export const DT = 1 / 30;
export const ACCEL = 2.4;
export const DRAG = 0.88;
export const VMAX = 0.65;
export const CRITTER_R = 0.035;
export const GEM_R = 0.03;
export const LAVA_R = 0.09;
export const KNOCKBACK = 0.5;
export const N_GEMS = 4;
export const N_LAVA = 2;
export const HORIZON = 900;

const LAVA_MARGIN = 0.16;
const GEM_MARGIN = 0.06;
const CRITTER_MARGIN = 0.08;
const LAVA_SPACING = 2 * LAVA_R + 0.05;
const GEM_SPACING = 0.12;
const GEM_LAVA_CLEAR = LAVA_R + GEM_R + 0.02;
const GEM_EATER_CLEAR = 0.2;
const CRITTER_LAVA_CLEAR = LAVA_R + CRITTER_R + 0.05;
const MAX_SAMPLE_TRIES = 40;

export const OBS_SIZE = 12;
export const N_ACTIONS = 5;

/** Screen coords: up = −y. Index IS the action id. */
export const ACTION_NOOP = 0;
export const ACTION_UP = 1;
export const ACTION_DOWN = 2;
export const ACTION_LEFT = 3;
export const ACTION_RIGHT = 4;

const COUCH_SPEED = 0.05;
// Forager's lava economics (see rl.py for the tuning rationale).
const LAVA_ENTER_PENALTY = 1.0;
const LAVA_NEAR = 0.21;
const LAVA_NEAR_COEF = 0.015;

// --- mulberry32 — the shared deterministic RNG -------------------------------

export class Mulberry32 {
  private a: number;

  constructor(seed: number) {
    this.a = seed >>> 0;
  }

  /** Uniform in [0, 1) — bit-identical to the Python twin. */
  next(): number {
    this.a = (this.a + 0x6d2b79f5) >>> 0;
    let t = this.a;
    t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0;
    t = (t ^ ((t + Math.imul(t ^ (t >>> 7), t | 61)) >>> 0)) >>> 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}

// --- world / critter state ----------------------------------------------------

export interface Critter {
  x: number;
  y: number;
  vx: number;
  vy: number;
  inLava: boolean;
  prevGemDist: number;
}

export interface WorldState {
  /** [[x, y], ...] — mutated in place on respawn / student drag. */
  gems: number[][];
  lavas: number[][];
  /** Consumed by layout sampling and gem respawns only. */
  rng: Mulberry32;
}

export interface StepEvents {
  ate: number;
  lavaEnter: boolean;
}

function samplePos(rng: Mulberry32, margin: number): [number, number] {
  const x = margin + rng.next() * (1 - 2 * margin);
  const y = margin + rng.next() * (1 - 2 * margin);
  return [x, y];
}

function clearOf(points: number[][], x: number, y: number, minDist: number): boolean {
  for (const p of points) {
    const dx = x - p[0]!;
    const dy = y - p[1]!;
    if (dx * dx + dy * dy < minDist * minDist) return false;
  }
  return true;
}

/** Respawn/spawn a gem clear of lava, other gems, and the eater; identical
 * rejection loop to Python (after MAX_SAMPLE_TRIES the last sample sticks). */
export function sampleGemPos(world: WorldState, avoidX: number, avoidY: number): number[] {
  let x = 0.5;
  let y = 0.5;
  for (let i = 0; i < MAX_SAMPLE_TRIES; i++) {
    [x, y] = samplePos(world.rng, GEM_MARGIN);
    if (!clearOf(world.lavas, x, y, GEM_LAVA_CLEAR)) continue;
    if (!clearOf(world.gems, x, y, GEM_SPACING)) continue;
    const dx = x - avoidX;
    const dy = y - avoidY;
    if (dx * dx + dy * dy < GEM_EATER_CLEAR * GEM_EATER_CLEAR) continue;
    break;
  }
  return [x, y];
}

/** Random layout: lavas, then gems — the fixed RNG-consumption order. */
export function makeWorld(rng: Mulberry32, nGems = N_GEMS, nLava = N_LAVA): WorldState {
  const world: WorldState = { gems: [], lavas: [], rng };
  for (let i = 0; i < nLava; i++) {
    let x = 0.5;
    let y = 0.5;
    for (let tries = 0; tries < MAX_SAMPLE_TRIES; tries++) {
      [x, y] = samplePos(rng, LAVA_MARGIN);
      if (clearOf(world.lavas, x, y, LAVA_SPACING)) break;
    }
    world.lavas.push([x, y]);
  }
  for (let i = 0; i < nGems; i++) {
    world.gems.push(sampleGemPos(world, -1.0, -1.0));
  }
  return world;
}

export function makeCritterAt(world: WorldState, x: number, y: number): Critter {
  const c: Critter = { x, y, vx: 0, vy: 0, inLava: false, prevGemDist: 1.0 };
  c.prevGemDist = nearestBlock(world.gems, c.x, c.y)[2];
  return c;
}

export function spawnCritter(world: WorldState, rng: Mulberry32): Critter {
  let x = 0.5;
  let y = 0.5;
  for (let tries = 0; tries < MAX_SAMPLE_TRIES; tries++) {
    [x, y] = samplePos(rng, CRITTER_MARGIN);
    if (clearOf(world.lavas, x, y, CRITTER_LAVA_CLEAR)) break;
  }
  return makeCritterAt(world, x, y);
}

/** (dx, dy, dist/√2) to the nearest point; (0, 0, 1) when there are none. */
export function nearestBlock(
  points: number[][],
  x: number,
  y: number,
): [number, number, number] {
  if (points.length === 0) return [0, 0, 1];
  let bestI = 0;
  let bestD2 = Infinity;
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    const dx = p[0]! - x;
    const dy = p[1]! - y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) {
      bestD2 = d2;
      bestI = i;
    }
  }
  const p = points[bestI]!;
  return [p[0]! - x, p[1]! - y, Math.sqrt(bestD2) / Math.sqrt(2)];
}

/** One physics step + gem/lava interactions, in the canonical order. */
export function stepCritter(world: WorldState, c: Critter, action: number): StepEvents {
  let ax = 0;
  let ay = 0;
  if (action === ACTION_UP) ay = -ACCEL;
  else if (action === ACTION_DOWN) ay = ACCEL;
  else if (action === ACTION_LEFT) ax = -ACCEL;
  else if (action === ACTION_RIGHT) ax = ACCEL;

  c.vx = (c.vx + ax * DT) * DRAG;
  c.vy = (c.vy + ay * DT) * DRAG;
  const s2 = c.vx * c.vx + c.vy * c.vy;
  if (s2 > VMAX * VMAX) {
    const k = VMAX / Math.sqrt(s2);
    c.vx = c.vx * k;
    c.vy = c.vy * k;
  }

  c.x = c.x + c.vx * DT;
  c.y = c.y + c.vy * DT;
  if (c.x < CRITTER_R) {
    c.x = CRITTER_R;
    c.vx = 0;
  } else if (c.x > 1 - CRITTER_R) {
    c.x = 1 - CRITTER_R;
    c.vx = 0;
  }
  if (c.y < CRITTER_R) {
    c.y = CRITTER_R;
    c.vy = 0;
  } else if (c.y > 1 - CRITTER_R) {
    c.y = 1 - CRITTER_R;
    c.vy = 0;
  }

  let ate = 0;
  const eatR = CRITTER_R + GEM_R;
  for (let i = 0; i < world.gems.length; i++) {
    const g = world.gems[i]!;
    const dx = g[0]! - c.x;
    const dy = g[1]! - c.y;
    if (dx * dx + dy * dy < eatR * eatR) {
      ate += 1;
      world.gems[i] = sampleGemPos(world, c.x, c.y);
    }
  }

  const lavaR = CRITTER_R + LAVA_R;
  let inside = -1;
  for (let i = 0; i < world.lavas.length; i++) {
    const l = world.lavas[i]!;
    const dx = c.x - l[0]!;
    const dy = c.y - l[1]!;
    if (dx * dx + dy * dy < lavaR * lavaR) {
      inside = i;
      break;
    }
  }
  const lavaEnter = inside >= 0 && !c.inLava;
  if (lavaEnter) {
    const l = world.lavas[inside]!;
    const dx = c.x - l[0]!;
    const dy = c.y - l[1]!;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < 1e-9) {
      c.vx = KNOCKBACK;
      c.vy = 0;
    } else {
      c.vx = (dx / d) * KNOCKBACK;
      c.vy = (dy / d) * KNOCKBACK;
    }
  }
  c.inLava = inside >= 0;

  return { ate, lavaEnter };
}

export function buildObs(world: WorldState, c: Critter): number[] {
  const [gdx, gdy, gdist] = nearestBlock(world.gems, c.x, c.y);
  const [ldx, ldy, ldist] = nearestBlock(world.lavas, c.x, c.y);
  return [
    c.vx / VMAX, c.vy / VMAX,
    gdx, gdy, gdist,
    ldx, ldy, ldist,
    c.x, 1 - c.x, c.y, 1 - c.y,
  ];
}

/** Reward for one step — MUST mirror recipe_reward in rl.py. In the browser
 * this is display-only (the score the agent was trained to chase). */
export function recipeReward(
  recipeId: RecipeId,
  events: StepEvents,
  speed: number,
  gemDist: number,
  prevGemDist: number,
  lavaDist: number,
): number {
  switch (recipeId) {
    case "forager": {
      let r = events.ate * 1.0 - 0.001;
      // Approach-shaping, skipped on eat steps so the respawn jump never
      // punishes eating (magnetized keeps it — that's its trap). See rl.py.
      if (!events.ate) r += 0.5 * (prevGemDist - gemDist);
      const d = lavaDist * Math.sqrt(2);
      if (d < LAVA_NEAR) r -= LAVA_NEAR_COEF * (1 - d / LAVA_NEAR);
      if (events.lavaEnter) r -= LAVA_ENTER_PENALTY;
      return r;
    }
    case "couch_potato": {
      let r = speed < COUCH_SPEED ? 0.03 : 0.0;
      if (events.lavaEnter) r -= 5.0;
      return r;
    }
    case "magnetized":
      // The respawn jump stays in the delta on purpose: eating makes the
      // nearest-gem distance leap → big negative reward → the trained agent
      // hovers next to gems without eating. That IS the lesson.
      return 2.0 * (prevGemDist - gemDist);
    case "speedster":
      return 0.08 * (speed / VMAX);
  }
}

export interface StepResult {
  obs: number[];
  reward: number;
  events: StepEvents;
}

/** Physics + obs + reward in the canonical order (mirrors env_step). */
export function envStep(
  world: WorldState,
  c: Critter,
  action: number,
  recipeId: RecipeId,
): StepResult {
  const events = stepCritter(world, c, action);
  const obs = buildObs(world, c);
  const speed = Math.sqrt(c.vx * c.vx + c.vy * c.vy);
  const gemDist = obs[4]!;
  const lavaDist = obs[7]!;
  const reward = recipeReward(recipeId, events, speed, gemDist, c.prevGemDist, lavaDist);
  c.prevGemDist = gemDist;
  return { obs, reward, events };
}
