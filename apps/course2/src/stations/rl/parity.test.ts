/**
 * Python↔TS environment parity — THE guard on the rl-playground contract.
 *
 * `camp-precompute rl-export` dumps parity.json: a seed, the initial layout,
 * a recorded TWO-critter action script (contested gem-chasing → eats/respawn
 * RNG, lava-seeking → entry/knockback, one critter hunting the other → moving
 * opponent channels, wall grinding, idling), and the Python reference env's
 * full per-step trace for both critters. This test replays the SAME actions
 * through env.ts from the SAME seed — critter A first, then B, each step —
 * and asserts every traced value (including the egocentric opponent obs
 * block) matches within 1e-6. In practice the two implementations agree
 * bit-for-bit: both are IEEE-754 doubles with identical operation order.
 *
 * If this fails, env.ts and camp_precompute/rl.py have drifted: fix the
 * mismatch (or regenerate the fixture with
 * `camp-precompute rl-export --parity-only` if the change was intentional —
 * then RETRAIN, because shipped policies were trained on the old dynamics).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  Mulberry32,
  OPP_START,
  envStep,
  makeWorld,
  spawnCritter,
  type Critter,
  type StepResult,
} from "./env";
import type { ParityArtifact, ParityCritterStep } from "./types";

const FIXTURE = fileURLToPath(
  new URL(
    "../../../public/data/course2/rl-playground/parity.json",
    import.meta.url,
  ),
);

const TOLERANCE = 1e-6;

function loadFixture(): ParityArtifact {
  return JSON.parse(readFileSync(FIXTURE, "utf-8")) as ParityArtifact;
}

describe("rl env parity (Python reference ↔ env.ts)", () => {
  const fixture = loadFixture();

  it("covers the interactions that matter", () => {
    // A fixture that never eats, never touches lava, or whose opponent
    // channels sit at the sentinel wouldn't test respawn RNG, knockback, or
    // the new obs block — reject it rather than silently passing.
    expect(fixture.stats.eats).toBeGreaterThanOrEqual(4);
    expect(fixture.stats.lavaHits).toBeGreaterThanOrEqual(1);
    expect(fixture.actions).toHaveLength(fixture.trace.length);
    const oppDists = new Set(
      fixture.trace.map((t) => t.a.obs[OPP_START + 2]!.toFixed(6)),
    );
    expect(oppDists.size).toBeGreaterThanOrEqual(50);
  });

  it("reproduces the initial layout from the seed", () => {
    const rng = new Mulberry32(fixture.seed);
    const world = makeWorld(rng, fixture.nGems, fixture.nLava);
    const a = spawnCritter(world, rng);
    const b = spawnCritter(world, rng);
    expect(world.gems).toEqual(fixture.layout.gems);
    expect(world.lavas).toEqual(fixture.layout.lava);
    expect([
      [a.x, a.y],
      [b.x, b.y],
    ]).toEqual(fixture.layout.critters);
  });

  it("replays the scripted actions within 1e-6 of the reference trace", () => {
    const rng = new Mulberry32(fixture.seed);
    const world = makeWorld(rng, fixture.nGems, fixture.nLava);
    const a = spawnCritter(world, rng);
    const b = spawnCritter(world, rng);

    let maxDrift = 0;
    const drift = (x: number, y: number) => {
      const d = Math.abs(x - y);
      if (d > maxDrift) maxDrift = d;
      return d;
    };

    const checkSide = (
      t: number,
      who: string,
      c: Critter,
      res: StepResult,
      ref: ParityCritterStep,
    ) => {
      // Events are discrete — a mismatch means the trajectories truly forked.
      expect(res.events.ate, `step ${t} ${who}: ate`).toBe(ref.ate);
      expect(res.events.lavaEnter, `step ${t} ${who}: lavaEnter`).toBe(ref.lava);
      for (const [ours, theirs, label] of [
        [c.x, ref.x, "x"],
        [c.y, ref.y, "y"],
        [c.vx, ref.vx, "vx"],
        [c.vy, ref.vy, "vy"],
        [res.reward, ref.reward, "reward"],
      ] as const) {
        expect(
          drift(ours, theirs),
          `step ${t} ${who}: ${label}`,
        ).toBeLessThanOrEqual(TOLERANCE);
      }
      for (let k = 0; k < ref.obs.length; k++) {
        expect(
          drift(res.obs[k]!, ref.obs[k]!),
          `step ${t} ${who}: obs[${k}]`,
        ).toBeLessThanOrEqual(TOLERANCE);
      }
    };

    for (let t = 0; t < fixture.actions.length; t++) {
      const [actA, actB] = fixture.actions[t]!;
      // A steps seeing B pre-move; B steps seeing A post-move — the exact
      // order the fixture was recorded in.
      const resA = envStep(world, a, actA!, "forager", b);
      const resB = envStep(world, b, actB!, "forager", a);
      const ref = fixture.trace[t]!;
      checkSide(t, "A", a, resA, ref.a);
      checkSide(t, "B", b, resB, ref.b);
      for (let g = 0; g < ref.gems.length; g++) {
        expect(
          drift(world.gems[g]![0]!, ref.gems[g]![0]!),
          `step ${t}: gem ${g} x`,
        ).toBeLessThanOrEqual(TOLERANCE);
        expect(
          drift(world.gems[g]![1]!, ref.gems[g]![1]!),
          `step ${t}: gem ${g} y`,
        ).toBeLessThanOrEqual(TOLERANCE);
      }
    }

    // Surface how tight the match actually is (expected: exactly 0).
    console.info(
      `rl parity: ${fixture.actions.length} two-critter steps replayed, max drift ${maxDrift}`,
    );
  });
});
