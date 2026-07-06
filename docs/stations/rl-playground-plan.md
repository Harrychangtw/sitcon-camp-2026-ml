# Station 7 — RL Playground: "Critter Arena"

> **Status:** implementation plan (this doc is the brief a fresh Claude Code
> session executes). Nothing here is built yet.
>
> **Slot:** one 30-minute afternoon *demo* station (Course 3 §3-3 "RL" in
> `docs/course-spec.md`), shipped as the **7th station** appended to the
> Course 2 Vite app's registry. It is a self-contained, flashy, explorable
> canvas — the goal is engagement + one real "aha", not a lecture.

---

## 0. TL;DR of what we're building

A bespoke, cheap-to-simulate 2-D arena ("Critter Arena") where a little agent
learns to forage gems and avoid lava **only from a reward signal**. The heavy
work — training a grid of policies on the server's V100s — happens **offline**
in `precompute/`. Each policy is a **tiny MLP** whose weights are exported as
**small, committable JSON**; the browser runs the environment and the policy's
forward pass **live** (a few lines of matmul — no ONNX runtime, no training in
the browser). This keeps the repo's golden rule intact while the agent
genuinely *plays live*.

The station's spine is **"can you beat the bot?"** — the student plays a second
critter with the arrow keys, right next to the agent. From that one hook we
open three walls:

1. **Learning from nothing** — scrub a checkpoint slider from a random flailing
   critter to an unbeatable one. It learned with nobody telling it *how*.
2. **Reward hacking / "you get what you reward"** — swap the reward recipe and
   watch the agent optimise the *proxy* instead of the goal (camps in a safe
   corner, orbits a gem without eating, spins in place). The star beat.
3. **Poke it** — perturb the world (drag gems/lava, add obstacles) and toggle
   what the agent can *see* or *do* (blind it to lava; disable an action) on a
   **fixed** policy → generalisation and "what does it actually sense?"

Everything is precomputed + played back. An **optional** live GPU rollout
endpoint (mirroring the existing `server/` live-inference pattern, with graceful
fallback) is a clearly-scoped stretch, not on the critical path.

---

## 1. Why this design fits the repo (read before coding)

Re-read `CLAUDE.md`, `docs/architecture.md`, `docs/adding-a-station.md`, and the
canonical `apps/course2/src/stations/reference.tsx`. The constraints that shaped
every decision below:

- **The browser never trains.** Training is offline in `precompute/`; the
  browser only *loads and plays back* small artifacts, or runs *light*
  inference. A tiny MLP forward pass per frame is "light" and allowed.
- **Small, committable artifacts only.** `*.onnx`/`*.bin` under `public/data`
  are **gitignored**. Our policies are tiny MLPs, so we export **weights as
  rounded JSON** and hand-roll the forward pass in TS. This dodges the gitignore
  rule *and* the `onnxruntime-web` SSR/wasm hazard entirely, and makes Python↔JS
  determinism trivial to verify. (If a policy ever outgrows JSON, fall back to
  the `loadOnnxSession` path — but it won't for this env.)
- **Package boundaries.** The real-time arena renderer + game loop + JS env + JS
  policy are **one lesson's logic → they live in the station** (`stations/rl/…`),
  not in `@camp/viz`. The only shared-package work is fleshing out the
  **`LossCurve`** stub in `@camp/viz` for the return curve (reused ⇒ legit).
- **Live == precomputed contract.** The `server/README.md` "How live ==
  precomputed is guaranteed" section is the precedent. Our version: the env
  dynamics + obs construction are **defined once** and implemented **twice**
  (Python for training, TS for playback), guarded by a committed **parity
  fixture + test** (§6). If they drift, the trained policy misbehaves in the
  browser — so the test is load-bearing, treat it as such.

---

## 2. Pedagogical design — the 30-minute loop

Each act has a knob the student turns and a wall the environment walks them into
(the camp's "loop" method: give a problem → let them poke → hit a wall → new
idea). Times are a guide for a demo the instructor paces.

| Act | ~min | Student does | Wall / aha |
| --- | --- | --- | --- |
| **0. Beat the bot** | 3 | Race the agent with arrow keys (mid checkpoint). | "It's… actually good. How?" Hooks curiosity + establishes the game. |
| **1. Random → competent** | 7 | Drag the **checkpoint slider** from step 0 (random) to final; re-race. Watch the **return curve** rise. | It went from hopeless to unbeatable with **only a score signal** — nobody scripted the moves. |
| **2. You get what you reward** | 8 | Switch the **reward recipe** (forager → couch-potato → magnetized → speedster). | The agent optimises the *proxy*, not your intent: camps in a corner, orbits a gem without eating, spins uselessly. **Reward hacking**, the memorable beat. |
| **3. Poke it** | 7 | **Perturb** the world (drag/add gems & lava); **toggle** obs/actions (blind-to-lava, disable an action) on a fixed policy. | It generalises inside its training distribution and **breaks outside it**; "blind to lava" → it forgets lava exists. Shows the agent only knows what it *senses*. |
| **4. Name the parts** | 5 | — | Label **agent / environment / reward / policy / training**. Tie back to the course arc; gesture at how the same loop scales (RLHF-flavoured). |

Chosen emotional hooks (from the brief): **reward hacking** (Act 2) and
**learning-from-nothing** (Act 1). Chosen knobs: **checkpoint scrubber**,
**environment perturbation**, **action/observation toggles**, plus the
**human-play-alongside** mode that threads through every act.

---

## 3. The environment — "Critter Arena" (single source of truth)

A continuous 2-D box. Cheap enough to run 2 critters at 30–60 Hz in JS;
egocentric observation so a fixed policy survives world perturbations.

### 3.1 World & bodies
- Arena: unit box `[0,1] × [0,1]`. Fixed timestep `dt` (e.g. 1/30 s).
- A **critter** has position `(x,y)` and velocity `(vx,vy)`. There are up to two:
  the **agent** (policy-driven) and, in play mode, the **human** (arrow keys).
  Both obey identical dynamics so the race is fair.
- **Action space (5 discrete):** `[noop, up, down, left, right]`. The chosen
  action applies a fixed acceleration in that direction; velocity integrates
  with linear friction and a max-speed clamp; walls clamp position and zero the
  normal-axis velocity. Arrow keys map 1:1 to the same five actions.

### 3.2 Entities
- **Gems** (K≈4): eating (within `eatRadius`) grants reward and the gem respawns
  at a seeded-random free cell.
- **Lava** (H≈2–3 disks): entering costs a penalty + knockback (episode does
  **not** end — keeps the real-time race continuous).
- Optional **home/goal** zone (off by default; available for perturbation demos).

### 3.3 Observation (egocentric, ~12 floats)
`[vx, vy, dxGem, dyGem, distGem, dxLava, dyLava, distLava, wallL, wallR, wallU,
wallD]` — vectors/distances to the **nearest** gem and lava, own velocity, and
the four wall distances. Egocentric + relative ⇒ the policy keeps working when
gems/lava move. **Build this identically in Python and TS.**

### 3.4 Policy net
MLP `obsDim(≈12) → 64 → 64 → actionDim(5)`, `tanh` hidden activations, linear
output logits. **Playback is deterministic: `argmax`** over logits (training may
sample; note this in the artifact). ~5 k params → a few tens of KB of JSON per
checkpoint, rounded to 4 dp.

### 3.5 Reward recipes (the reward-hacking gallery)
A recipe is a function of per-step env events → scalar. Ship these four; tune
constants during precompute until each degenerate behaviour is *visible*:

| id | label (zh) | reward | learned behaviour |
| --- | --- | --- | --- |
| `forager` | 吃到寶石（正解） | `+1` eat, `−0.001`/step, `−5` lava | efficient, lava-aware collecting — **the good one**; the scrubber & race use this recipe's checkpoints |
| `couch_potato` | 只獎勵「活著」 | `+0.02`/step, `−5` lava, no eat bonus | finds a safe spot and **idles** — "reward survival, get a coward" |
| `magnetized` | 只獎勵「靠近寶石」 | `+0.05·(Δ−distGem)`/step, no eat bonus | **orbits/hugs** a gem to farm the approach signal without committing |
| `speedster` | 只獎勵「速度」 | `∝ speed`/step | **spins/dashes** pointlessly — fun, obvious loophole |

(Optional 5th `sparse`: `+1` eat only, short training → **fails to learn**,
illustrating why shaping matters. Bonus if time.)

Only `forager` needs the full checkpoint ladder; the hacks ship their converged
(degenerate) final policy.

### 3.6 Perturbations & toggles (browser-side, fixed policy — no retrain)
- **Perturb:** drag gems/lava, add lava, move goal, resize arena. The same
  weights run; students see in-distribution success vs OOD failure.
- **Observation toggles:** zero the lava channels ("blind to lava" → walks in),
  zero the gem channels ("blind to gems" → wanders). Input masking only.
- **Action toggle:** mask a logit (e.g. "can't go left") → clumsy detours.
  Output masking only.

All three reuse the exact shipped weights — golden-rule safe, and pedagogically
they isolate *sensing* vs *acting* vs *world*.

---

## 4. Architecture & file plan

### 4.1 Frontend — `apps/course2`
```
src/stations/
  rlPlayground.tsx          # the station: owns state, StationLayout, controls (copy reference.tsx shape)
  rl/
    env.ts                  # JS Critter Arena: step(), buildObs(), reset(seed) — mirrors rl.py
    policy.ts               # loadable MLP + forward(obs) → logits; argmax; obs/action masking
    ArenaCanvas.tsx         # <canvas> renderer + rAF game loop + keyboard input (client-only, resize-aware)
    types.ts                # RlArtifact / Recipe / Checkpoint / Weights / ParityFixture shapes
    useArena.ts             # hook wiring env+policy+loop to React state (score, timer, running)
  registry.tsx             # + { id:"rl-playground", title:"RL Playground", blurb:"…", group:"lesson", element:<RlPlaygroundStation/> }
public/data/course2/rl-playground/
  policies.json             # env spec + recipes[].checkpoints[].weights (committed, rounded)
  parity.json               # {seed, actions[], trace[]} fixture from Python (committed)
```
- **Controls** come from `@camp/ui` (`SegmentedControl` for recipe & mode,
  `LabeledSlider` for the checkpoint scrubber, `Toggle` for obs/action masks,
  `RunButton`/`BlockButtons` for start/reset). No new `@camp/ui` needed.
- **Data load** via `@camp/data` `loadJSON<RlArtifact>(…)` inside an effect
  (the `reference.tsx` pattern). No React/onnx in the loader path.
- **SSR-safety:** all `window`/`canvas`/`requestAnimationFrame`/keyboard access
  lives inside effects; guard the canvas until `useResizeObserver` reports a
  non-zero size (§adding-a-station checklist). This is a Vite client-only app,
  but keep the discipline.

### 4.2 Shared viz — `packages/viz`
- **Flesh out `LossCurve`** (currently a stub) into a real resize-aware SVG line
  chart with a `markerX`/current-step indicator, used here for the **return
  curve** (mean episode return vs training step) with the active checkpoint
  marked. Keep it generic (props in, pixels out); do **not** put RL specifics in
  it. Export stays as-is in `index.ts`.

### 4.3 Precompute — `precompute`
```
src/camp_precompute/rl.py    # Critter Arena (reference impl), PPO trainer, reward recipes, checkpointing, JSON export, parity dump
src/camp_precompute/cli.py   # + subcommands: `train-rl` (heavy) and `rl-export` (writes public JSON + manifest) — mirror train-rnn / rnn-viz split
pyproject.toml               # + torch (transitively present via sentence-transformers; pin explicitly), optional gymnasium
artifacts/                   # gitignored: raw checkpoints (.npz/.pt) between train-rl and rl-export
```
- **Algorithm:** a compact self-contained **PPO** (~150 lines, CleanRL-style) on
  the tiny MLP — no heavy framework needed; keeps determinism controllable.
  Trivial on a V100 (or even CPU) given the env size. Train each recipe; for
  `forager` save checkpoints at e.g. `[0, 5k, 20k, 50k, 150k, 500k, final]`
  steps and record mean episode return per checkpoint for the curve.
- **Export:** `rl-export` reads raw checkpoints, writes `policies.json`
  (env spec + `recipes[].checkpoints[].weights`, floats rounded 4 dp) and
  `parity.json`, then `upsert_manifest_artifact(...)` (reuse the helper in
  `cli.py`) with id `rl-playground-policies` (+ `rl-playground-parity`).
- **Compute budget is a non-issue** (4 V100s now, 8 available). Train multiple
  seeds and pick the clearest-behaving policy per recipe; the grid is still only
  a couple of MB of JSON.

### 4.4 Optional live GPU rollout endpoint — `server` (STRETCH, wave 3)
Only if time remains. Mirror the existing FastAPI pattern exactly:
`server/app/routers/rl.py` with `POST /rl/rollout {recipeId, checkpointStep,
envConfig, seed, steps} → {trajectory:[{state,action,reward}…]}`, computed by
the **same** `camp_precompute.rl` env+policy the precompute used (the
live==precomputed contract). Reuse the existing session-cookie auth, the
`InferenceLimiter` GUARDS, CORS, gzip. Client goes through
`@camp/data`'s `liveInfer*` helpers with **graceful fallback** to the in-browser
rollout. Be honest in the copy: the browser already rolls out live, so this
endpoint's real value is authoritative rollouts for configs outside the
precomputed grid (and a future home for a live "watch it train" theatre moment,
explicitly **out of scope** here).

---

## 5. Artifact schema (`policies.json`)

```jsonc
{
  "generator": "camp-precompute rl-export",
  "generatedAt": "…",
  "station": "rl-playground",
  "env": {
    "name": "critter-arena",
    "dt": 0.0333, "accel": …, "friction": …, "maxSpeed": …,
    "agentRadius": …, "gemRadius": …, "eatRadius": …, "hazardRadius": …,
    "arena": [1, 1], "episodeSteps": 600,
    "obsDim": 12, "actionDim": 5,
    "actions": ["noop", "up", "down", "left", "right"],
    "obsLayout": ["vx","vy","dxGem","dyGem","distGem","dxLava","dyLava","distLava","wallL","wallR","wallU","wallD"],
    "defaultLayout": { "gems": [[x,y],…], "hazards": [[x,y,r],…], "goal": null }
  },
  "policy": { "arch": [12, 64, 64, 5], "activation": "tanh", "actionSelect": "argmax" },
  "recipes": [
    {
      "id": "forager", "label": "吃到寶石（正解）", "isGood": true,
      "rewardDesc": "+1 吃寶石、每步 −0.001、碰岩漿 −5",
      "returnCurve": [ { "step": 0, "ret": … }, … ],
      "checkpoints": [
        { "step": 0,     "label": "隨機",  "returnMean": …,
          "weights": { "W0": [[…]], "b0": […], "W1": [[…]], "b1": […], "W2": [[…]], "b2": […] } },
        …
      ]
    },
    { "id": "couch_potato", …, "checkpoints": [ { "step": "final", … } ] },
    { "id": "magnetized",  …, "checkpoints": [ … ] },
    { "id": "speedster",   …, "checkpoints": [ … ] }
  ]
}
```
`parity.json`: `{ "seed": …, "actions": [int,…], "trace": [ { "critter": {x,y,vx,vy}, "gems": [[x,y],…], … }, … ] }`.

Keep the whole thing ≈1–2 MB max; if it grows, prune the grid or round harder.
Commit both JSONs (small); commit **no** `.onnx`/`.pt`/`.npz`.

---

## 6. The Python↔JS parity contract (load-bearing)

The env exists in two languages; if they disagree, the trained policy looks
"dumb" in the browser for no obvious reason. Guard it:

1. `rl-export` writes `parity.json`: from a **fixed seed**, run the Python env
   through a **scripted action sequence** (a mix covering walls, eating, lava,
   idling), dumping the full state after each step.
2. Add a course2 test (Vitest, or a `/rl-parity` dev route if no test runner is
   wired) that loads `parity.json`, replays the same actions through `env.ts`,
   and asserts every state matches within `1e-6`.
3. Run it in CI-in-spirit: `pnpm typecheck && pnpm lint` must stay green, and the
   parity test must pass, before the station is considered done.

Document the determinism knobs (float64 both sides for the env math, fixed
integration order, no RNG in playback) next to the code, echoing the
`server/README.md` contract.

---

## 7. Implementation waves (order for the fresh session)

1. **Env spec + parity** — write `rl.py` env + `env.ts` + a throwaway
   parity check first, so the two dynamics are locked before any training.
2. **Precompute train/export** — PPO, recipes, checkpoints, `policies.json`
   (+ manifest), `parity.json`. Verify `forager` visibly learns and each hack
   visibly degenerates (dump a few Python rollouts as sanity GIFs/logs).
3. **`LossCurve`** — flesh out the `@camp/viz` stub (return curve + marker).
4. **Station MVP** — `ArenaCanvas` + game loop + `policy.ts`; render one agent
   playing the `forager` final policy. Then add the **race** (human critter +
   timer + score).
5. **Knobs** — checkpoint scrubber, recipe selector, perturbation drag, obs/
   action toggles, "take the wheel" mode; wire the return curve + takeaway copy
   per act.
6. **Register + progression** — add to `registry.tsx` as lesson #7; confirm the
   progression lock treats it as the 7th lesson station.
7. **(STRETCH) live rollout endpoint** — only if waves 1–6 are solid.

Copy is **zh-TW first** (match the other stations; English mixed in is fine).

---

## 8. Verification / definition of done

- `pnpm typecheck && pnpm lint` green across the workspace.
- Parity test passes (§6).
- `pnpm --filter @app/course2 dev` → `/rl-playground`:
  - Race is playable with arrow keys; early checkpoint is beatable, final is not.
  - Checkpoint slider visibly goes random → competent; return curve tracks it.
  - Each reward recipe shows its degenerate behaviour.
  - Perturbation + obs/action toggles change behaviour live on a fixed policy.
  - No console errors; canvas resizes cleanly; nothing runs during SSR/module load.
- `precompute`: `uv run camp-precompute train-rl && uv run camp-precompute
  rl-export` regenerates `policies.json`/`parity.json` deterministically.
- `docs/architecture.md` inventory table updated to list the new station.

---

## 9. Risks & mitigations

- **Reward-hack behaviours may not converge to something *visibly* funny.** Tune
  reward constants + training length per recipe during precompute; pick the
  seed/checkpoint that reads clearest. This is content work, budget for it.
- **Py↔JS drift.** Mitigated by the parity fixture/test (§6) — build it first.
- **Per-frame policy inference jank with two critters.** The net is tiny; step
  the policy at a fixed 30 Hz decoupled from render if needed; avoid per-frame
  allocations in `forward()`.
- **Artifact bloat.** Round to 4 dp, prune the grid; keep ≤~2 MB.
- **Live endpoint scope creep.** It is explicitly stretch with graceful
  fallback; the station must be fully functional precompute-only.

---

## 10. Open questions for the executing session (safe defaults chosen)

These were left as sensible defaults; flag in the PR if you deviate:
- Exact reward constants & training steps per recipe (tune for clarity).
- Whether to ship the optional `sparse` 5th recipe (nice-to-have).
- Race duration (default 30 s) and gem count (default 4).
- Whether to build the stretch live endpoint at all this pass (default: no).
</content>
</invoke>
