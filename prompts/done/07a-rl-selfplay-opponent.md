# Session: **RL Playground — self-play so the agent can SEE and CONTEST the opponent** — Course 2

> Paste this whole file into a fresh Claude Code session at the repo root. It is
> self-contained. Deliverable: the **forager** critter is trained by **self-play**
> against copies of itself and is given an **opponent channel in its observation**,
> so competitive behaviour (racing you to a gem, contesting, blocking, juking)
> **emerges** — in the spirit of OpenAI's *Emergent Tool Use / Hide-and-Seek*.
> `typecheck`/`lint`/`build` green, the Python↔TS **parity test** green on a
> regenerated `parity.json`, and a strong-checkpoint agent that visibly contests
> the human in race mode. When the diff is done, run `/code-review high`.
>
> This is one tightly-coupled change across the **parity contract** (obs shape
> changes in lockstep on both sides) plus a **retrain**, so build it **linearly in
> one thread** — do *not* fan out into parallel agents/worktrees. The value is a
> coherent, parity-locked rebuild, not parallelism.

This upgrades the **already-built** RL Playground (station 07, "Critter Arena",
commit `8b83b26`). See `prompts/README.md` for the wave model and the shared
Definition of Done.

---

## Why we're doing this (the diagnosis — build to it, don't re-derive it)

The station's spine is "**can you beat the bot?**" — race the critter for gems with
the arrow keys. Today the agent is a **competent forager but a non-opponent**: in a
real race it reaches for a gem you already took, never blocks you, never anticipates
your move. The cause is concrete and lives in the code:

1. **The observation has no channel for the opponent — at all.** `OBS_LAYOUT`
   (`precompute/src/camp_precompute/rl.py`, mirrored in `apps/course2/src/stations/rl/env.ts`)
   is 12 numbers: own velocity, nearest **gem** (dx, dy, dist), nearest **lava**
   (dx, dy, dist), 4 wall distances. There is **no slot for the other critter**. So
   even a perfectly-trained policy is structurally blind to you — when you eat its
   target gem, the gem respawns, its "nearest gem" silently updates, and it re-routes
   as if the world rearranged itself. It is not *failing* to anticipate; it *cannot*.
2. **Training is single-agent.** Each `_EnvSlot` (`rl.py`) has exactly one critter.
   No opponent ever exists during PPO. So even with an opponent channel added, a
   solo-trained agent would learn to ignore it.

Meanwhile the **play-time environment already shares gems** — in `useArena.ts` both
the agent and the human eat from the same `s.world.gems` and trigger respawns. The
competition is real on the world side; only the agent's *brain* is solo. That
mismatch is exactly the "not challenging enough" feeling.

**The fix (both halves are required):** give the policy an **opponent channel** *and*
train **forager by self-play** against copies of itself, so contesting/blocking/juking
**emerge from the reward + perception**, not from hand-coded heuristics.

## The reference we're borrowing from (idea, not code)

**OpenAI, "Emergent Tool Use From Multi-Agent Autocurricula" (Hide-and-Seek, 2019).**
The lesson we're echoing: put agents in a shared, competitive world with a *minimal*
reward and let them train against each other; increasingly sophisticated strategies
appear as **phase transitions** over training. We want the same shape at toy scale —
scrub the training slider and watch the critter go **naive forage → race-to-contested-gem
→ block / cut-off / juke**. Do **not** hand-design those behaviours; let them emerge.

## Decisions already made (do not re-litigate — build to these)

1. **Self-play, not a scripted opponent.** The training env runs **two critters** in
   the shared world; the opponent's actions come from a **frozen policy snapshot**
   sampled from a **self-play pool** (fictitious self-play — sample the opponent from
   a pool of *past* checkpoints, with some probability the *current* policy, and with
   some probability a trivial baseline — no-op / random — early on for curriculum).
   Naive "latest-vs-latest" self-play cycles and collapses; the pool is what keeps the
   progression stable and the checkpoints meaningfully different. This is the user's
   explicit choice (emergent, self-play — like Hide-and-Seek), over a scripted bot.
2. **Only `forager` trains against an opponent.** The three reward-hacking recipes
   (`couch_potato`, `magnetized`, `speedster`) are about **proxy optimisation**, not
   competition — they stay **solo** (opponent absent). BUT because all recipes share
   one observation vector, **all four must be retrained at the new `OBS_SIZE`**; the
   non-forager three simply train with the **opponent-absent sentinel** in those
   channels (see §Obs). State this in your report.
3. **Reward stays essentially unchanged — competition must EMERGE.** Keep forager's
   reward (own gems `+1`, per-step `−0.001`, approach-shaping skipped on eat, lava
   near-field + entry penalty). Gems are shared and finite-at-a-time, so scarcity
   *already* makes it competitive; do **not** add a hand-coded "blocking bonus" — that
   would script the behaviour we want to emerge. (If, after a first training run,
   contest behaviour is too weak to see, a *tiny* relative-advantage term is a
   permitted last resort — flag it loudly if you use it.)
4. **Determinism is NOT the thing at risk — the obs shape is.** Self-play affects
   **training only**; seeded CPU torch stays deterministic, the **shipped weights are a
   fixed artifact**, and the **env dynamics stay bit-exact**. The parity contract breaks
   **only** because the observation vector grows — so the whole job is: change the obs
   **identically** on both sides and **regenerate `parity.json`**. Do not talk yourself
   out of self-play over a determinism fear; the artifact and env remain deterministic.
5. **Playback is unchanged in spirit — the human IS the opponent.** No scripted bot at
   play time. The agent perceives the **human critter** through the new channels and
   contests it live. In sandbox/observe mode there is no opponent → the channels read the
   **absent sentinel**.
6. **Ship the MEASURED-strongest checkpoint, and order the ladder by strength — not by
   step count.** Self-play win-rate is **non-monotonic in steps**: the 1M-step policy is
   often not the strongest (it overfits to the recent pool; the end-of-run entropy anneal
   can leave it brittle). So do **not** assume "slider fully right = hardest". Run a cheap
   **competitive round-robin eval** over checkpoints (§Step 3.5), ship the argmax as the
   final rung, and re-derive the whole training-progress ladder from the **strength curve**.
   This is "select the more capable policy" — done as *evaluation*, not a tournament infra.
7. **The target is a REAL opponent, not an unbeatable one.** The pedagogy is "behaviour
   emerges from reward", and a bot students literally cannot beat kills engagement. Aim for
   "contests you, and beats you when you're sloppy"; let the **training-progress slider** be
   the difficulty dial students discover. Note the physics has a **low mechanical skill
   ceiling** (drag + accel + hard speed cap on a small board), so most of the *felt*
   difficulty comes from **contesting** (self-play) and **not shipping a weak checkpoint**
   (§Step 3.5) — not from raw superintelligence. Do not fake difficulty with a hidden speed
   buff and call it "smarter"; that breaks the honesty of the demo.

## The observation change (the load-bearing edit — mirror it EXACTLY on both sides)

Grow the obs from **12 → ~17** by appending an **egocentric opponent block**. Recommended
default (velocity is what enables *anticipation*, which is the whole point):

```
... existing 12 ...            # vx,vy, gemDx,gemDy,gemDist, lavaDx,lavaDy,lavaDist, wallL,wallR,wallU,wallD
oppDx, oppDy, oppDist,         # nearest-opponent relative position (÷√2 for dist, like gems/lava)
oppVx, oppVy,                  # opponent velocity (÷VMAX) — lets the agent ANTICIPATE, not just react
```

- **Append, never reorder** — inserting in the middle would silently shift every
  downstream index (the `policy.ts` handicap masks, tests, any hardcoded obs index).
  New channels go on the **end**; `OBS_SIZE` and the W0 input width grow accordingly.
- **Opponent-absent sentinel** (sandbox, and the three solo recipes): `oppDx=0, oppDy=0,
  oppDist=1, oppVx=0, oppVy=0` (mirrors the "no nearest block" `(0,0,1)` convention in
  `nearestBlock`). Define it **once**, identically in `rl.py` and `env.ts`.
- **Handle opponent presence in training via domain randomization:** so the SAME forager
  policy behaves well both solo (sandbox) and versus (race), train forager episodes with
  the opponent **present most of the time but absent some fraction** (opponent channels =
  sentinel on absent episodes). Otherwise sandbox is off-distribution and the agent may
  twitch at a phantom. Pick the fraction; flag it.
- `buildObs` gains an opponent argument: **`buildObs(world, self, opponent | null)`** in
  both `env.ts` and `rl.py` (`build_obs(world, c, other)`), building the opponent block
  egocentrically from `self`'s frame (opponent absent → sentinel).
- Update the `OBS_LAYOUT` list (`rl.py`) and the `obsLayout` shipped in `policies.json`'s
  `env` block, and `OBS_SIZE` in both files. Update `types.ts`'s `PolicyWeights` W0 comment
  (`[64][12]` → `[64][17]`).

Optional extra channel — a **gem-contest scalar** `myGemDist − oppGemDist` (who's winning the
race to the nearest gem). Nice for legibility; leave it as an **open decision** with the
5-channel version as the default.

**The foraging skill ceiling (read this — self-play alone will NOT close it).** The current
obs exposes only the **single nearest gem**, so the agent is structurally a greedy-nearest-gem
myope: it cannot plan a route through multiple gems. Self-play makes it *contest* the human but
does **not** make it a better forager — a human who routes efficiently (grab the cluster, loop
back) will still out-collect it on raw gem count, at any checkpoint, because the information to
route isn't in its senses. **If, after self-play, the agent still loses on gems rather than on
contesting**, the real lever is **richer gem perception**: expose the **top-k nearest gems**
(e.g. k=2–3: `gemₖDx, gemₖDy, gemₖDist` per gem, ordered nearest-first) instead of just k=1, so
it can route. This is a bigger obs change (mirror on both sides, sentinel-pad when fewer than k
gems exist) — treat it as an **open decision / second lever**, pulled only if measured foraging
strength is the bottleneck. Do a first self-play run on the 5-channel opponent obs, *measure*
whether losses are contest-losses or routing-losses, and decide from there.

## Prerequisites & shared surface

- **Retraining runs on the GPU box**, offline, via `uv` — the browser never trains
  (golden rule). The nets are tiny (CPU on purpose; see `train_recipe`'s comment). Two
  critters per env doubles env-step cost only; still trivial.
- **Shared files other work also touches — extend, never clobber:** `rl.py` (env + PPO +
  export all live here), `env.ts` (the parity twin), `policy.ts` (forward + masks),
  `useArena.ts` (game loop), `rlPlayground.tsx` (station UI/copy), `types.ts`,
  `parity.test.ts`, `playback.test.ts`, and `manifest.json` (the export `upsert`s two
  artifacts). No other in-flight prompt touches the `rl/` station, so collisions are
  unlikely — but keep edits additive where the file is shared infra.
- **Parity contract (`env.ts` / `rl.py` docstrings):** identical constants, identical
  operation order, mulberry32 with `>>> 0` ↔ `& 0xFFFFFFFF`. **Any** obs/dynamics edit
  here must be mirrored and `parity.json` regenerated, or `parity.test.ts` fails by design.

## Step 0 — Read first

1. `CLAUDE.md` — golden rules (browser never trains), package boundaries, lazy-import rule.
2. `prompts/README.md` — the shared **Definition of Done** (items 1–8).
3. `prompts/DESIGN.md` — visual language: near-black surface, **lime `#D6FB00`** for the
   focused/active element only, cyan/purple categoricals, mono/uppercase micro-labels,
   **no hard-coded hexes**. (You'll only add a little copy + maybe one control here.)
4. `precompute/src/camp_precompute/rl.py` — the whole reference: env (`step_critter`,
   `build_obs`, `env_step`), `RECIPES` + `checkpointSteps`, `_EnvSlot`, `train_recipe`
   (the PPO loop — where self-play + the opponent hook go), `evaluate_policy`,
   `build_parity`, `rl_export`. **This is where most of the work is.**
5. `apps/course2/src/stations/rl/env.ts` — the TS twin: `buildObs`, `OBS_SIZE`,
   `stepCritter`, `envStep`, `nearestBlock`. Mirror every obs edit here.
6. `apps/course2/src/stations/rl/useArena.ts` — the game loop. `stepAgent` builds the
   agent's obs (now must pass the human as opponent); `stepOnce` runs both critters in
   race mode. Sandbox = opponent absent.
7. `apps/course2/src/stations/rl/policy.ts` — `forward`, `maskObs` (handicap channel
   masks — new channels may need a new `blind_opponent` mask), `selectAction`.
8. `apps/course2/src/stations/rl/types.ts` — `PolicyWeights` (W0 width comment),
   `EnvSpecArtifact` (`obsLayout`).
9. `apps/course2/src/stations/rlPlayground.tsx` — station copy + controls (the recipe /
   training-progress / handicap docks). Where the self-play framing + any new knob land.
10. `apps/course2/src/stations/rl/parity.test.ts` + `playback.test.ts` — the tests that
    replay `parity.json` and lock playback; both need the new obs.
11. `precompute/src/camp_precompute/cli.py` — the `train-rl` / `rl-export` subcommands.

## Step 1 — Env: add the opponent to the observation (both sides, in lockstep)

- In **`rl.py`**: extend `OBS_LAYOUT`, `OBS_SIZE`; change `build_obs` → `build_obs(world, c, other)`
  appending the egocentric opponent block (sentinel when `other is None`). Thread `other`
  through `env_step`. Keep the existing 12 channels and their order **byte-for-byte**.
- In **`env.ts`**: mirror exactly — `OBS_SIZE`, `buildObs(world, self, opponent | null)`,
  same sentinel, same `÷√2` / `÷VMAX` normalisations, same append order.
- Define the **sentinel** in one obvious place on each side and reference it, so "no
  opponent" is provably identical across languages.

## Step 2 — Training: two critters + self-play pool (forager only)

In `rl.py`'s `train_recipe` / `_EnvSlot`:

- Give each **forager** env slot a **second critter** in the same world; both step the
  shared world each tick (shared gems → contested respawns). Build **each** critter's obs
  from **its own** frame (the learner sees the opponent; the opponent sees the learner).
- The **learner** samples actions from the current policy (as today). The **opponent**
  acts from a **frozen snapshot** drawn from a **self-play pool**: keep a small ring of
  past `actor` state-dicts; each episode (or each slot reset) sample the opponent from
  {a past snapshot (most likely), the current policy (sometimes), a trivial baseline
  (early-training curriculum)}. Refresh/add to the pool on the same cadence as checkpoints.
- **Only the learner's transitions go into the PPO buffer.** The opponent is frozen — no
  gradient, `torch.no_grad()` for its forward pass. Reward/advantage/GAE for the learner
  are unchanged in form (per §Decision 3).
- **Domain-randomize opponent presence** (§Obs): some fraction of forager episodes run
  solo (opponent absent, sentinel channels) so the shipped policy also handles sandbox.
- The **three non-forager recipes** keep the single-critter loop unchanged **except** that
  `build_obs` now takes `other=None` → sentinel channels. They must be **retrained** so
  their W0 matches the new `OBS_SIZE`.
- Keep everything **seeded and deterministic** (`TRAIN_SEED`, `np.random.seed`,
  `torch.manual_seed`). Self-play adds no RNG that isn't seeded.

## Step 3 — Re-tune the checkpoint ladder to the emergent phases

Self-play reshapes the learning curve, so the old `forager` `checkpointSteps`
(`[0, 200k, 300k, 400k, 600k, 1M]`) and the "takeoff ≈175k–400k" tuning are void.
**Re-tune** so each training-progress slider rung looks **visibly different** and, ideally,
straddles the emergent **phase transitions** (frozen → first steps → solo forage →
races-you-to-the-gem → contests/blocks). Forager may need **more** total steps than 1M for
competitive play to appear — raise `totalSteps` if so. Keep the labels honest
(`_steps_label`). This ladder IS the payoff: scrubbing it should *show the strategies being
born*, echoing the Hide-and-Seek phase-transition story.

## Step 3.5 — Select the strongest policy by competitive eval (cheap, not a tournament infra)

Because self-play strength is non-monotonic (§Decision 6), don't ship the last checkpoint by
default. Add a **competitive eval** in `rl.py` alongside `evaluate_policy`:

- Play each candidate checkpoint **head-to-head** against a fixed **panel** (the self-play pool
  + a few spread-out checkpoints) over several seeded episodes in the **two-critter** env; score
  by **win-rate / mean gem-margin** (a lightweight Elo is fine but overkill — win-rate is enough).
- **Ship the argmax** as the final "unbeatable" rung, and **re-derive the training-progress ladder
  from the measured strength curve** (monotone-increasing), so scrubbing right is *actually*
  harder. Keep the existing solo `returnMean`/`gemsMean` for the sandbox card (comparable across
  recipes); the competitive score decides *ordering* + *which checkpoint is "final"*.
- **Optional (cheap here):** train **2–3 independent seeds** of forager and keep the strongest
  lineage by the same head-to-head eval. This is the literal "select the more capable one." Flag
  whether you did this.
- **Sanity-measure the human gap:** the real question is whether the shipped agent loses to a
  competent human on **contesting** or on **routing** (§Obs "skill ceiling"). Report which — it
  decides whether the top-k gem obs lever is worth pulling. Keep all eval **seeded/deterministic**.

## Step 4 — Playback: the human becomes the perceived opponent

In `useArena.ts`:

- **Race mode:** `stepAgent` builds the agent's obs with the **human critter** as the
  opponent (`buildObs(world, agent, human)`), so the trained forager now contests/blocks
  the player. The human is still key-driven (no policy) — it's just now *perceptible*.
- **Sandbox mode:** opponent **absent** → `buildObs(world, agent, null)` (sentinel). The
  observe-mode agent behaves as the solo forager it also trained as.
- Confirm the `buildObs` call sites, the parity-replay path, and any obs-length assumptions
  all move to the new size together.

## Step 5 — A knob that shows off the new sense (recommended)

Add a **`blind_opponent`** handicap in `policy.ts` (`maskObs` zeroes the opponent block to
the sentinel) and expose it in `rlPlaygroundStation`'s 干擾 (handicap) dock + a `HANDICAP_HINTS`
line. Dramatic, on-message payoff: blindfold the opponent channel on a **fixed** strong
policy and the agent **stops blocking you** — "it only knows what it senses" made literal,
and it ties the new feature straight into the existing 戳戳看 wall. Keep it one perturbation
at a time (the existing pattern). If you add it, keep the mask indices derived from named
constants, not magic numbers.

## Step 6 — Copy: frame the self-play (keep it zh-TW)

Keep all chrome/labels/hints in **正體中文** (glossary terms English: `RL`, `self-play`,
`reward`, `policy`, `agent`). Add a short framing — in the recipe card and/or the finished-race
card — that the forager **trained against copies of itself**, like AlphaGo / OpenAI 的捉迷藏,
and that scrubbing 訓練進度 shows **new strategies emerging** (追搶、卡位、假動作). Update the
`registry.tsx` blurb if the pitch shifts. Keep it tight — no em-dashes in copy.

## Step 7 — Parity + tests + verify

- **Regenerate `parity.json`.** `build_parity` must exercise the new channels — run **two
  scripted critters** so the opponent block is non-trivial and both languages' egocentric
  obs are checked (don't ship a fixture whose opponent channels are all-sentinel). Keep the
  "must exercise respawn RNG + lava knockback" guard; add an assert that opponent channels
  vary.
- Update **`parity.test.ts`** (obs length + the new trace fields) and **`playback.test.ts`**.
- Commands:

```bash
# On the GPU box, from precompute/ (offline; browser trains nothing):
uv run camp-precompute train-rl            # retrain all 4 recipes at the new OBS_SIZE (forager = self-play)
uv run camp-precompute rl-export           # rewrite policies.json + parity.json, upsert manifest
# Back in the repo root:
pnpm --filter @app/course2 test            # parity + playback vitest must pass (≤1e-6 drift)
pnpm typecheck && pnpm lint && pnpm build
pnpm --filter @app/course2 dev             # http://localhost:5173/ → RL 競技場
```

- **Manually confirm:** at a **strong** training-progress checkpoint in **race** mode the
  agent visibly **contests / cuts you off / races you to a gem** (not just solo forages);
  dragging 訓練進度 **down** removes that behaviour (naive forage returns); `blind_opponent`
  (if added) makes a strong agent stop blocking; sandbox/observe still looks sane; the
  reward-hacking recipes still hack (couch-camp / orbit-without-eating / spin) unchanged; no
  console errors.

## Definition of Done (checked by `/code-review high` + `prompts/validate.md` spirit)

Shared contract (`prompts/README.md` items 1–8), plus **rl-selfplay**:

- [ ] Obs grows by an **egocentric opponent block** (position + velocity, ÷-normalised),
      **appended** (no reordering), with an identical **absent sentinel** in `rl.py` + `env.ts`;
      `OBS_SIZE`, `OBS_LAYOUT`/`obsLayout`, and the W0 width move together.
- [ ] **`forager` is trained by self-play** against a **pool** of frozen snapshots (not
      latest-vs-latest), with **domain-randomized opponent presence** so it also handles solo
      sandbox. Only the learner's transitions train; the opponent is `no_grad`.
- [ ] The three reward-hacking recipes stay **solo** but are **retrained at the new `OBS_SIZE`**;
      they still demonstrate their proxy hacks.
- [ ] Reward recipes are **unchanged in form** — competitive behaviour **emerges** (no hand-coded
      blocking bonus; any relative-advantage term is flagged as a last resort).
- [ ] **Race playback feeds the human as the agent's opponent**; sandbox uses the absent sentinel.
- [ ] The **training-progress ladder is ordered by MEASURED strength** (competitive round-robin
      eval, §Step 3.5), the **shipped final rung is the argmax** (not blindly the last step), and
      rungs look visibly different / show the emergence (naive forage → contest → block/juke).
- [ ] The report states whether the shipped agent loses to a competent human on **contesting** or
      on **routing**, and therefore whether the **top-k gem obs** lever was pulled.
- [ ] **Parity restored:** `parity.json` regenerated with a **two-critter** script exercising the
      opponent channels; `parity.test.ts` + `playback.test.ts` pass at ≤1e-6 drift.
- [ ] Golden rule intact — **all training is offline**; the browser loads JSON + runs the forward
      pass; env stays bit-exact; `policies.json` still small.
- [ ] Copy is zh-TW with the self-play framing; `registry.tsx` blurb updated if the pitch shifted.
- [ ] `pnpm --filter @app/course2 test`, `pnpm typecheck && pnpm lint && pnpm build` all green;
      `/` renders the station with no console errors.

## Open decisions — make the call, then flag it in your report

1. **Opponent channel set:** the 5-channel default (oppDx, oppDy, oppDist, oppVx, oppVy), or add
   the **gem-contest scalar**? Recommended: 5-channel first; add the scalar only if contest
   behaviour is hard to learn. Velocity stays in either way (it's what enables anticipation).
1b. **Top-k gem obs (the foraging-strength lever):** k=1 (current) or k=2–3 nearest gems, so the
   agent can route instead of greedy-nearest? Recommended: start k=1, measure whether human losses
   are routing-losses (§Step 3.5), pull k=2–3 only if so. Mirror + sentinel-pad on both sides.
1c. **Multi-seed selection:** train 1 forager lineage, or 2–3 seeds and keep the head-to-head
   strongest? Recommended: 1 first; add seeds only if the single run feels weak. Cheap either way.
2. **Self-play pool policy:** ring size, sample distribution over {past snapshot / current /
   baseline}, and refresh cadence. Recommended: a small ring (~5–10) refreshed at checkpoint
   cadence; opponent = past-snapshot most of the time, current sometimes, trivial-baseline early.
3. **Opponent-absent fraction** (domain randomization) for forager. Recommended: a modest fraction
   (enough that sandbox is in-distribution) — tune by eyeballing sandbox behaviour.
4. **Forager `totalSteps` / checkpoint milestones** — pick the ladder that best shows the phase
   transitions; raise `totalSteps` past 1M if competitive play appears late.
5. **Eval regime for shipped `returnMean`/`gemsMean`:** keep **solo** eval (comparable across
   checkpoints), or add a **versus-snapshot** eval number for forager? Recommended: keep solo eval
   for the shipped numbers (comparability), and sanity-check competitive behaviour manually.
6. **`blind_opponent` handicap** — ship it (recommended, strong payoff) or defer? State which.

## Report when done

Output: the final obs layout (channels added + sentinel); the self-play design (pool, sample
distribution, opponent-absent fraction, how transitions are filtered to the learner); the re-tuned
forager ladder + whether `totalSteps` grew; what emergent behaviours you actually observed at which
checkpoints; the six open-decision choices you made; whether `blind_opponent` shipped; files
changed; the regenerated artifact sizes; and a one-line pass/fail per Definition-of-Done checkbox
(including the parity + playback test results).
