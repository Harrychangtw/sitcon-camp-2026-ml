/**
 * Playback smoke test — runs the EXACT browser path (TS env + policy.ts
 * forward pass on the shipped, rounded policies.json weights) headlessly and
 * asserts each recipe's signature behavior. Complements parity.test.ts:
 * parity proves the env matches Python; this proves the shipped WEIGHTS drive
 * the TS stack to the trained behaviors (it would catch, e.g., a transposed
 * matmul in policy.ts, which parity can't see).
 *
 * Thresholds are deliberately loose — they encode the lesson's structure
 * (ladder rises, the self-play forager contests, couch potato freezes,
 * magnetized hovers, speedster speeds), not exact stats, so a retrain
 * doesn't flake them.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  HORIZON,
  Mulberry32,
  OBS_SIZE,
  OPP_ABSENT,
  OPP_START,
  VMAX,
  buildObs,
  envStep,
  makeWorld,
  spawnCritter,
  stepCritter,
} from "./env";
import { policyAction, type Handicap } from "./policy";
import type { PoliciesArtifact, PolicyWeights, RecipeId } from "./types";

const ARTIFACT = fileURLToPath(
  new URL(
    "../../../public/data/course2/rl-playground/policies.json",
    import.meta.url,
  ),
);

const data = JSON.parse(readFileSync(ARTIFACT, "utf-8")) as PoliciesArtifact;

interface Stats {
  gemsPerEp: number;
  movingFrac: number;
  nearGemFrac: number;
  meanSpeedFrac: number;
}

function rollout(
  weights: PolicyWeights,
  recipeId: RecipeId,
  handicap: Handicap = "none",
  episodes = 3,
): Stats {
  let gems = 0;
  let moving = 0;
  let nearGem = 0;
  let speedSum = 0;
  const n = episodes * HORIZON;
  for (let ep = 0; ep < episodes; ep++) {
    const rng = new Mulberry32(555_000 + ep);
    const world = makeWorld(rng);
    const critter = spawnCritter(world, rng);
    let obs = buildObs(world, critter);
    for (let t = 0; t < HORIZON; t++) {
      const a = policyAction(weights, obs, handicap);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThan(5);
      const r = envStep(world, critter, a, recipeId);
      obs = r.obs;
      gems += r.events.ate;
      const speed = Math.sqrt(critter.vx ** 2 + critter.vy ** 2);
      speedSum += speed;
      if (speed > 0.05) moving += 1;
      if (obs[4]! * Math.SQRT2 < 0.15) nearGem += 1;
    }
  }
  return {
    gemsPerEp: gems / episodes,
    movingFrac: moving / n,
    nearGemFrac: nearGem / n,
    meanSpeedFrac: speedSum / n / VMAX,
  };
}

/** Head-to-head in the two-critter env — mirrors versus_eval in rl.py: both
 * policies play argmax in one shared world, gems contested. Returns the mean
 * per-episode gem margin (A − B). */
function vsRollout(
  wA: PolicyWeights,
  wB: PolicyWeights,
  episodes = 3,
): number {
  let margin = 0;
  for (let ep = 0; ep < episodes; ep++) {
    const rng = new Mulberry32(884_001 + ep);
    const world = makeWorld(rng);
    const ca = spawnCritter(world, rng);
    const cb = spawnCritter(world, rng);
    let obsA = buildObs(world, ca, cb);
    let obsB = buildObs(world, cb, ca);
    for (let t = 0; t < HORIZON; t++) {
      const aa = policyAction(wA, obsA, "none");
      const ab = policyAction(wB, obsB, "none");
      margin += stepCritter(world, ca, aa).ate;
      margin -= stepCritter(world, cb, ab).ate;
      obsA = buildObs(world, ca, cb);
      obsB = buildObs(world, cb, ca);
    }
  }
  return margin / episodes;
}

function recipe(id: RecipeId) {
  const r = data.recipes.find((x) => x.id === id);
  if (!r) throw new Error(`recipe ${id} missing from policies.json`);
  return r;
}

function finalCk(id: RecipeId) {
  const cks = recipe(id).checkpoints;
  return cks[cks.length - 1]!;
}

describe("rl playback (shipped weights through the TS browser path)", () => {
  it("forager ladder rises from useless to strong", () => {
    const cks = recipe("forager").checkpoints;
    expect(cks.length).toBeGreaterThanOrEqual(4);
    const first = rollout(cks[0]!.weights, "forager");
    const last = rollout(cks[cks.length - 1]!.weights, "forager");
    // Untrained: barely eats. Trained: a foraging machine, even solo.
    expect(first.gemsPerEp).toBeLessThan(2);
    expect(last.gemsPerEp).toBeGreaterThan(8);
    expect(last.movingFrac).toBeGreaterThan(0.8);
    // EVERY rung goes through the real TS forward pass (a corrupted middle
    // rung must fail here, not just look wrong in class). The ladder is
    // ordered by HEAD-TO-HEAD strength, and the strongest fighter can trade
    // away some solo foraging (measured: ~6 gems at the top rung) — the
    // slack allows that trade while still catching a broken/garbled rung,
    // which scores near zero.
    let prevG = -Infinity;
    for (const ck of cks) {
      const g = rollout(ck.weights, "forager").gemsPerEp;
      expect(g).toBeGreaterThanOrEqual(prevG - 8);
      prevG = Math.max(prevG, g);
    }
  });

  it("the shipped ladder is ordered by measured strength", () => {
    // The export ran the round-robin; the rungs must be monotone in the
    // vs-panel margin (that IS the difficulty dial's honesty guarantee).
    // Non-strict: the shipped value is rounded to 2 dp, so a legitimate
    // hair's-width raw increase may tie after rounding.
    const cks = recipe("forager").checkpoints;
    expect(recipe("forager").selfPlay).toBe(true);
    let prev = -Infinity;
    for (const ck of cks) {
      expect(ck.vsPanelMargin).toBeTypeOf("number");
      expect(ck.vsPanelMargin!).toBeGreaterThanOrEqual(prev);
      prev = ck.vsPanelMargin!;
    }
  });

  it("ships the exact opponent-absent sentinel env.ts plays back with", () => {
    // rl.py's OPP_ABSENT and env.ts's must be identical or sandbox playback
    // runs the policy off its training distribution — this pins them through
    // the exported spec.
    expect(data.env.oppAbsent).toEqual([...OPP_ABSENT]);
    expect(data.env.obsLayout).toHaveLength(OBS_SIZE);
    expect(data.env.obsLayout[OPP_START + 2]).toBe("oppDist");
  });

  it("the final forager beats early rungs head-to-head", () => {
    const cks = recipe("forager").checkpoints;
    const final = cks[cks.length - 1]!.weights;
    expect(vsRollout(final, cks[0]!.weights)).toBeGreaterThan(5);
    const mid = cks[Math.floor(cks.length / 2)]!.weights;
    expect(vsRollout(final, mid)).toBeGreaterThan(0);
  });

  it("couch_potato camps almost motionless", () => {
    const s = rollout(finalCk("couch_potato").weights, "couch_potato");
    expect(s.movingFrac).toBeLessThan(0.15);
    expect(s.gemsPerEp).toBeLessThan(2);
  });

  it("magnetized hovers at gems without eating them", () => {
    const s = rollout(finalCk("magnetized").weights, "magnetized");
    expect(s.nearGemFrac).toBeGreaterThan(0.6);
    expect(s.gemsPerEp).toBeLessThan(4);
  });

  it("speedster just goes fast", () => {
    const s = rollout(finalCk("speedster").weights, "speedster");
    expect(s.meanSpeedFrac).toBeGreaterThan(0.5);
    expect(s.gemsPerEp).toBeLessThan(5);
  });

  it("blindfolding gems cripples the trained forager", () => {
    const w = finalCk("forager").weights;
    const sighted = rollout(w, "forager", "none");
    const blind = rollout(w, "forager", "blind_gems");
    expect(blind.gemsPerEp).toBeLessThan(sighted.gemsPerEp / 2);
  });

  it("blind_opponent exactly reproduces the no-opponent decision", () => {
    // The mask writes the trained absent-sentinel, so a masked obs WITH an
    // opponent must equal the obs WITHOUT one → identical argmax action.
    const w = finalCk("forager").weights;
    const rng = new Mulberry32(777_123);
    const world = makeWorld(rng);
    const agent = spawnCritter(world, rng);
    const opp = spawnCritter(world, rng);
    for (let t = 0; t < 200; t++) {
      const masked = policyAction(w, buildObs(world, agent, opp), "blind_opponent");
      const solo = policyAction(w, buildObs(world, agent, null), "none");
      expect(masked).toBe(solo);
      envStep(world, agent, solo, "forager", opp);
      stepCritter(world, opp, t % 5);
    }
  });

  it("every handicap still yields legal actions", () => {
    const w = finalCk("forager").weights;
    const handicaps: Handicap[] = [
      "none",
      "blind_gems",
      "blind_lava",
      "blind_opponent",
      "no_left",
      "no_up",
    ];
    for (const h of handicaps) rollout(w, "forager", h, 1);
  });
});
