# Session: Build the **Transformer** station (Course 2)

> Paste this whole file into a fresh Claude Code session at the repo root. It is
> self-contained. Deliverable: a working `/transformer` station, a real
> `AttentionLines` primitive in `@camp/viz`, and the precompute artifact — with
> `typecheck`/`lint`/`build` green.

You are filling in `apps/course2/src/stations/transformer.tsx`, currently a
placeholder. This is **station 6 of 6** — the payoff — see `prompts/README.md`.

## What you're building (the pedagogy)

The resolution of the RNN's wall: **every token can look at every other token,
directly.** Students explore **self-attention** — hovering a token lights up what
it attends to — making the mechanism concrete after feeling the RNN's long-range
decay.

**Goal:** students hover/select a token and see attention links to the tokens it
attends to, and can switch **layer** and **head** to see attention specialize.

## Prerequisites & shared surface

- **New viz primitive:** `AttentionLines` in `@camp/viz` is a **stub**. Flesh it
  out **in the package** — a row of tokens with weighted links between them,
  resize-aware, prop-driven (tokens + an attention weight matrix + a
  `focusToken`), link opacity/width encoding weight. No fetch, no lesson copy.
- **Shared files you touch:** `cli.py`, `manifest.json`. Extend, don't overwrite.
- **Design note:** the camp's shipped "Attention Tracker" deck (`slides/`) is
  literally about attention — keep the visual language consistent (see
  `slides/design-system/` if you want the palette), but the primitive stays
  generic and prop-driven.

## Step 0 — Read first (in this order)

1. `CLAUDE.md` — golden rules.
2. `apps/course2/src/stations/reference.tsx` — station pattern.
3. `packages/viz/src/AttentionLines.tsx` + `packages/viz/src/index.ts` — the stub
   you make real (check the declared `AttentionLinesProps`).
4. `packages/viz/src/Scatter2D.tsx` — reference for a real resize-aware primitive.
5. `docs/adding-a-station.md` §5; `docs/course-spec.md` → **「第二堂課」**;
   `prompts/README.md` → Definition of Done; and the placeholder
   `apps/course2/src/stations/transformer.tsx`.

## Step 1 — Precompute the attention tensor

Running a transformer is **heavy → offline**. The browser only replays weights.

- Add a `transformer` subcommand to `cli.py` that writes to
  `apps/course2/public/data/course2/transformer/`:
  - `attention.json` — for a small set of example sentences, the attention
    weights from an offline forward pass of a small transformer. Shape
    suggestion: `{ sentenceId, tokens:[...], layers:[ { head:[ matrix[q][k] ] } ] }`
    — i.e. a `[layer][head][query][key]` tensor. Keep it small (a short sentence,
    a few layers/heads) so the JSON stays tiny and legible.
  - Register in `manifest.json` `artifacts[]` tagged `station: "transformer"`.
- Regenerate; commit small JSON only.

## Step 2 — Make `AttentionLines` real (in `@camp/viz`)

Resize-aware (`useResizeObserver`, guard width 0), prop-driven: a token row, a
weight matrix (or a single query row for the focused token), a `focusToken`, and
link rendering where opacity/width ∝ weight. Highlight-on-hover is driven by the
`focusToken` prop set by the station — the primitive itself owns no lesson data.

## Step 3 — Build the station

Replace the placeholder body in `transformer.tsx`:

- **Controls (`@camp/ui`):** `SegmentedControl` for the example sentence;
  `SegmentedControl` for **layer** and for **head** (or two of them). Current
  layer/head/hovered-token are React state.
- **Canvas:** `AttentionLines` over the tokens; hovering (or clicking) a token
  sets `focusToken` and lights the links to the tokens it attends to for the
  selected (layer, head). Show that different heads attend differently.
- **Data:** load `attention.json` via `@camp/data` in an effect. The matrix shown
  is a pure function of (sentenceId, layer, head, focusToken, data).
- **Takeaway line:** "no more passing state down a chain — every token reaches
  every other in one hop. That's attention."

## Step 4 — Verify

```bash
pnpm typecheck && pnpm lint && pnpm build
pnpm --filter @app/course2 dev   # open http://localhost:5173/transformer
```

Hover tokens; switch layer/head and watch attention change. No console errors.

## Design language (follow `prompts/DESIGN.md`)

Read `prompts/DESIGN.md`. Verify the one-time `@camp/ui` token retune is already
done; if not, do it. Station-specific notes:

- The token row sits on near-black; tokens in `text-fg`, labels via `label-mono`.
- Attention links are **greyscale with opacity/width ∝ weight** (the deck's
  distribution idiom); the **focused token and its links** light up in **lime** —
  the rest recede.
- If you visually distinguish **heads**, use the **cyan/purple categorical** hues
  (2–3 max), not a rainbow — heads are categories, attention strength is opacity.
- `AttentionLines` reads colors from **theme vars / props**, never hard-coded.
- Layer / head selectors use the uppercase/tracked + `label-mono` idioms.

## Definition of Done (checked by `prompts/validate.md`)

Shared contract (`prompts/README.md` items 1–7), plus **transformer-specific**:

- [ ] `AttentionLines` is a real, resize-aware, prop-driven primitive in
      `@camp/viz` (no fetch, no lesson data inside it).
- [ ] `attention.json` exists under `.../course2/transformer/` and is in
      `manifest.json`; the station loads it via `@camp/data` (tensor **not**
      hard-coded, **not** computed in-browser).
- [ ] Hover/select a token → its attention links light up.
- [ ] Layer **and** head selectors change the displayed attention.
- [ ] **Design:** follows `prompts/DESIGN.md` — greyscale links with opacity ∝
      weight, lime on the focused token + its links, cyan/purple only for heads;
      `AttentionLines` reads colors from theme vars/props (no hard-coded hexes).
- [ ] `pnpm typecheck && pnpm lint && pnpm build` are green.

## Report when done

Output: files changed (station + `AttentionLines` + `cli.py` + manifest), the
`artifacts[]` entry, the route, and a one-line pass/fail per checkbox.
