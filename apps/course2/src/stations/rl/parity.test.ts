/**
 * Python↔TS environment parity — THE guard on the rl-playground contract.
 *
 * `camp-precompute rl-export` dumps parity.json: a seed, the initial layout,
 * a recorded action script (gem-chasing → eats/respawn RNG, lava-seeking →
 * entry/knockback, wall grinding, idling), and the Python reference env's full
 * per-step trace. This test replays the SAME actions through env.ts from the
 * SAME seed and asserts every traced value matches within 1e-6 (in practice
 * the two implementations agree bit-for-bit — both are IEEE-754 doubles with
 * identical operation order).
 *
 * If this fails, env.ts and camp_precompute/rl.py have drifted: fix the
 * mismatch (or regenerate the fixture with
 * `camp-precompute rl-export --parity-only` if the change was intentional —
 * then RETRAIN, because shipped policies were trained on the old dynamics).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Mulberry32, envStep, makeWorld, spawnCritter } from "./env";
import type { ParityArtifact } from "./types";

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
    // A fixture that never eats or touches lava wouldn't test respawn RNG or
    // knockback — reject it rather than silently passing on easy steps.
    expect(fixture.stats.eats).toBeGreaterThanOrEqual(2);
    expect(fixture.stats.lavaHits).toBeGreaterThanOrEqual(1);
    expect(fixture.actions).toHaveLength(fixture.trace.length);
  });

  it("reproduces the initial layout from the seed", () => {
    const rng = new Mulberry32(fixture.seed);
    const world = makeWorld(rng, fixture.nGems, fixture.nLava);
    const critter = spawnCritter(world, rng);
    expect(world.gems).toEqual(fixture.layout.gems);
    expect(world.lavas).toEqual(fixture.layout.lava);
    expect([critter.x, critter.y]).toEqual(fixture.layout.critter);
  });

  it("replays the scripted actions within 1e-6 of the reference trace", () => {
    const rng = new Mulberry32(fixture.seed);
    const world = makeWorld(rng, fixture.nGems, fixture.nLava);
    const critter = spawnCritter(world, rng);

    let maxDrift = 0;
    const drift = (a: number, b: number) => {
      const d = Math.abs(a - b);
      if (d > maxDrift) maxDrift = d;
      return d;
    };

    for (let t = 0; t < fixture.actions.length; t++) {
      const { obs, reward, events } = envStep(
        world,
        critter,
        fixture.actions[t]!,
        "forager",
      );
      const ref = fixture.trace[t]!;

      // Events are discrete — a mismatch means the trajectories truly forked.
      expect(events.ate, `step ${t}: ate`).toBe(ref.ate);
      expect(events.lavaEnter, `step ${t}: lavaEnter`).toBe(ref.lava);

      for (const [ours, theirs, label] of [
        [critter.x, ref.x, "x"],
        [critter.y, ref.y, "y"],
        [critter.vx, ref.vx, "vx"],
        [critter.vy, ref.vy, "vy"],
        [reward, ref.reward, "reward"],
      ] as const) {
        expect(drift(ours, theirs), `step ${t}: ${label}`).toBeLessThanOrEqual(
          TOLERANCE,
        );
      }
      for (let k = 0; k < ref.obs.length; k++) {
        expect(
          drift(obs[k]!, ref.obs[k]!),
          `step ${t}: obs[${k}]`,
        ).toBeLessThanOrEqual(TOLERANCE);
      }
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
      `rl parity: ${fixture.actions.length} steps replayed, max drift ${maxDrift}`,
    );
  });
});
