/**
 * Playback smoke test — runs the EXACT browser path (TS env + policy.ts
 * forward pass on the shipped, rounded policies.json weights) headlessly and
 * asserts each recipe's signature behavior. Complements parity.test.ts:
 * parity proves the env matches Python; this proves the shipped WEIGHTS drive
 * the TS stack to the trained behaviors (it would catch, e.g., a transposed
 * matmul in policy.ts, which parity can't see).
 *
 * Thresholds are deliberately loose — they encode the lesson's structure
 * (ladder rises, couch potato freezes, magnetized hovers, speedster speeds),
 * not exact stats, so a retrain doesn't flake them.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  HORIZON,
  Mulberry32,
  VMAX,
  buildObs,
  envStep,
  makeWorld,
  spawnCritter,
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
    // Untrained: barely eats. Trained: a foraging machine.
    expect(first.gemsPerEp).toBeLessThan(2);
    expect(last.gemsPerEp).toBeGreaterThan(10);
    expect(last.movingFrac).toBeGreaterThan(0.8);
    // The ladder is broadly monotone: every rung ≥ its predecessor − slack.
    let prev = -Infinity;
    for (const ck of cks) {
      const g = rollout(ck.weights, "forager").gemsPerEp;
      expect(g).toBeGreaterThanOrEqual(prev - 2);
      prev = Math.max(prev, g);
    }
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

  it("every handicap still yields legal actions", () => {
    const w = finalCk("forager").weights;
    const handicaps: Handicap[] = ["none", "blind_gems", "blind_lava", "no_left", "no_up"];
    for (const h of handicaps) rollout(w, "forager", h, 1);
  });
});
