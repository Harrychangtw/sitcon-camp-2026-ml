# Session: Build the **Order Shuffle** station (Course 2)

> Paste this whole file into a fresh Claude Code session at the repo root. It is
> self-contained. Deliverable: a working `/order-shuffle` station plus its
> precompute artifact, with `typecheck`/`lint`/`build` green.

You are filling in `apps/course2/src/stations/orderShuffle.tsx`, currently a
placeholder. This is **station 3 of 6** — see `prompts/README.md`.

## What you're building (the pedagogy)

The bridge from MLP/bag-of-words to sequence models. Students **shuffle the
words** of a sentence and watch a **bag-of-words** model give the *same* answer
regardless of order, while an **order-aware** model changes its mind. This
exposes the wall: order carries meaning, and order-blind models can't see it —
motivating RNNs next.

**Goal:** students drag/shuffle word chips and see, side by side, a bag-of-words
prediction (order-blind, unchanged) vs an order-aware prediction (changes),
feeling why sequence matters.

## Prerequisites & shared surface

- **New viz primitive:** none required. Word chips are DOM; the two predictions
  render as simple bars/labels in the station. (If you want a bar chart and
  `Heatmap` is by now real, you *may* reuse it, but don't build a primitive just
  for this.)
- **Shared files you touch:** `cli.py` and `manifest.json`. Extend, don't
  overwrite.

## Step 0 — Read first (in this order)

1. `CLAUDE.md` — golden rules.
2. `apps/course2/src/stations/reference.tsx` — the state→controls→canvas pattern.
3. `docs/adding-a-station.md` — recipe (§4 precompute, §5 SSR).
4. `docs/course-spec.md` → **「第二堂課」** — the 撞牆 rhythm for this loop.
5. `prompts/README.md` → Definition of Done; and the placeholder
   `apps/course2/src/stations/orderShuffle.tsx`.

## Step 1 — Precompute the predictions artifact

Bag-of-words is order-invariant, so its output is trivially computable in the
browser (light). The **order-aware model's** predictions must be **precomputed**
(the browser never runs a real sequence model here).

- Add an `order-shuffle` subcommand to `cli.py` that writes to
  `apps/course2/public/data/course2/order-shuffle/`:
  - A small set of **example sentences** (2–4), each with a fixed vocabulary of
    words to arrange, plus the **order-aware model's prediction for every
    relevant permutation / arrangement** the UI can produce. Keep the arrangement
    space small enough to enumerate (e.g. a short sentence, or a curated set of
    interesting shuffles). Shape suggestion:
    `{ sentenceId, words:[...], arrangements:[{ order:[...], prediction:{label, score} }] }`.
  - Register in `manifest.json` `artifacts[]` tagged `station: "order-shuffle"`.
- Regenerate and commit small JSON only.

## Step 2 — Build the station

Replace the placeholder body in `orderShuffle.tsx`:

- **Controls (`@camp/ui`):** `SegmentedControl` to pick the example sentence; a
  `RunButton`-style "Shuffle" action, and/or draggable word chips. (Drag can be
  native HTML5 DnD or a simple swap-on-click — keep it dependency-light.)
- **Canvas / body:** the row of arrangeable word chips, and a **side-by-side**
  comparison: **Bag-of-words** (compute in-browser from the multiset — light,
  allowed) which stays constant as you shuffle, vs **Order-aware** (looked up
  from the precomputed artifact for the current order) which visibly changes.
- **Data:** load the predictions JSON via `@camp/data` in an effect. The current
  order is React state; the two predictions are pure functions of (order, data).
- **Takeaway line:** name the wall — "shuffle the words and the bag-of-words
  model can't tell; the order-aware one can. Meaning lives in order."

## Step 3 — Verify

```bash
pnpm typecheck && pnpm lint && pnpm build
pnpm --filter @app/course2 dev   # open http://localhost:5173/order-shuffle
```

Shuffle words; confirm BoW prediction is unchanged and the order-aware one moves.
No console errors.

## Design language (follow `prompts/DESIGN.md`)

Read `prompts/DESIGN.md`. Verify the one-time `@camp/ui` token retune is already
done; if not, do it. Station-specific notes:

- Word chips are **thin-bordered cards** on near-black; the dragged/active chip
  gets the **lime** outline, the rest stay greyscale.
- The two prediction panels carry `label-mono` headers — `BAG-OF-WORDS` and
  `ORDER-AWARE` — uppercase/tracked.
- Prediction bars are **single-hue, opacity/width-encoded** (no rainbow); **lime**
  marks the winning / just-changed label so the order-aware panel visibly
  "reacts" while bag-of-words sits still.

## Definition of Done (checked by `prompts/validate.md`)

Shared contract (`prompts/README.md` items 1–7), plus **order-shuffle-specific**:

- [ ] Predictions JSON exists under `.../course2/order-shuffle/` and is in
      `manifest.json`; the station loads it via `@camp/data`.
- [ ] Word chips can be reordered/shuffled by the student.
- [ ] Two predictions shown side by side: bag-of-words (**invariant** under
      shuffle) and order-aware (**changes** under shuffle).
- [ ] The order-aware prediction comes from the **precomputed artifact**, not
      an in-browser model.
- [ ] **Design:** follows `prompts/DESIGN.md` — thin-bordered chips, `label-mono`
      panel headers, single-hue opacity-encoded bars, lime on the changed label;
      theme utilities only (no hard-coded hexes).
- [ ] `pnpm typecheck && pnpm lint && pnpm build` are green.

## Report when done

Output: files changed, `artifacts[]` entry, the route, and a one-line pass/fail
per checkbox.
