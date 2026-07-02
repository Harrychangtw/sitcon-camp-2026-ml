# Session: Build the **RNN Viz** station (Course 2)

> Paste this whole file into a fresh Claude Code session at the repo root. It is
> self-contained. Deliverable: a working `/rnn-viz` station plus its precompute
> artifact, with `typecheck`/`lint`/`build` green.

You are filling in `apps/course2/src/stations/rnnViz.tsx`, currently a
placeholder. This is **station 5 of 6** — see `prompts/README.md`.

## What you're building (the pedagogy)

The first real answer to "how do we handle order": **carry a hidden state along
the sequence.** Students step through a sequence **token by token** and watch the
**hidden state** evolve — then feel the wall of **long-range dependencies**
fading (early tokens' influence washes out), which motivates attention next.

**Goal:** students advance a sequence one token at a time and watch a
hidden-state heatmap update per step, seeing state accumulate and early signal
decay.

## Prerequisites & shared surface

- **Reuses `Heatmap` from `@camp/viz`.** Station 04 (next-token) should have made
  `Heatmap` real. **Check `packages/viz/src/Heatmap.tsx`:**
  - If it's already a real, general grid primitive → **reuse it, don't rebuild.**
    If you need a small API addition (e.g. a "current column" highlight for the
    active step), extend it cleanly so 04 still works.
  - If 04 hasn't run yet and it's still a stub → building `Heatmap` (in the
    package, general API) is part of **this** session.
- **Shared files you touch:** `cli.py`, `manifest.json`. Extend, don't overwrite.

## Step 0 — Read first (in this order)

1. `CLAUDE.md` — golden rules.
2. `apps/course2/src/stations/reference.tsx` — station pattern.
3. `packages/viz/src/Heatmap.tsx` + `packages/viz/src/index.ts` — the primitive
   you reuse; understand its current API before extending.
4. `docs/adding-a-station.md`; `docs/course-spec.md` → **「第二堂課」**;
   `prompts/README.md` → Definition of Done; and the placeholder
   `apps/course2/src/stations/rnnViz.tsx`.

## Step 1 — Precompute the activations artifact

Running an RNN is **heavy → offline**. The browser only replays activations.

- Add an `rnn-viz` subcommand to `cli.py` that writes to
  `apps/course2/public/data/course2/rnn-viz/`:
  - `activations.json` — for a small set of example sequences, the **hidden-state
    vector at every timestep** (offline forward pass of a small RNN). Shape
    suggestion: `{ sequenceId, tokens:[...], hidden:[ step0[], step1[], ... ] }`
    where each `stepN` is the hidden vector at that step. Keep dimensions small
    (e.g. hidden size ~16–32) so the heatmap is legible.
  - Register in `manifest.json` `artifacts[]` tagged `station: "rnn-viz"`.
- Regenerate; commit small JSON only.

## Step 2 — Build the station

Replace the placeholder body in `rnnViz.tsx`:

- **Controls (`@camp/ui`):** `SegmentedControl` to pick the example sequence;
  **step controls** — a "Next token" / "Prev" pair and/or a `RunButton` that
  auto-advances, plus a `LabeledSlider` scrubber over timesteps. The current step
  is React state.
- **Canvas:** `Heatmap` showing the hidden state. Either the current step's
  vector as one column that updates, or the full `steps × hidden` grid with the
  active step highlighted — pick whichever makes the "state evolving" story
  clearest. Show the token consumed at each step.
- **Data:** load `activations.json` via `@camp/data` in an effect. Displayed
  state is a pure function of (sequenceId, step, data).
- **Takeaway line:** name the wall — "step far enough and the earliest token's
  fingerprint fades. Holding everything in one vector doesn't scale."

## Step 3 — Verify

```bash
pnpm typecheck && pnpm lint && pnpm build
pnpm --filter @app/course2 dev   # open http://localhost:5173/rnn-viz
```

Step through a sequence; watch the heatmap change per step. Confirm `Heatmap`
still works in `/next-token` (you didn't break 04). No console errors.

## Definition of Done (checked by `prompts/validate.md`)

Shared contract (`prompts/README.md` items 1–7), plus **rnn-viz-specific**:

- [ ] `activations.json` exists under `.../course2/rnn-viz/` and is in
      `manifest.json`; the station loads it via `@camp/data` (activations **not**
      hard-coded, **not** computed in-browser).
- [ ] Step controls advance the sequence one token at a time; the hidden-state
      `Heatmap` updates per step.
- [ ] `Heatmap` is the **shared `@camp/viz` primitive** (reused/extended, not a
      station-local copy); `/next-token` still renders correctly.
- [ ] `pnpm typecheck && pnpm lint && pnpm build` are green.

## Report when done

Output: files changed, whether you reused or extended `Heatmap` (and any API
addition), the `artifacts[]` entry, the route, and a one-line pass/fail per
checkbox — including confirming 04-next-token still works.
