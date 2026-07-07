# Session: Build the **Embedding** station (Course 2)

> Paste this whole file into a fresh Claude Code session at the repo root. It is
> self-contained. Deliverable: a working `/embedding` station, a real
> `Scatter3D` primitive in `@camp/viz`, and the precompute artifact — with
> `typecheck`/`lint`/`build` green.

You are filling in `apps/course2/src/stations/embedding.tsx`, currently a
placeholder. This is **station 2 of 6** — see `prompts/README.md` for the order.

## What you're building (the pedagogy)

Tokens are just ids — where does **meaning** come from? Students see token ids
mapped to **vectors**, and explore how similar words land near each other in
space (and where that breaks). This is the "ids gain geometry" beat.

**Goal:** students browse a 2D/3D projection of precomputed word embeddings,
**search/highlight** a word, and see its **nearest neighbours** light up —
building the intuition that distance ≈ similarity.

## Prerequisites & shared surface

- **New viz primitive:** `Scatter3D` in `@camp/viz` is currently a **stub**. You
  must flesh it out **in the package** (three.js, lazy-imported inside an
  effect — see SSR rules), so future stations can reuse it. `Scatter2D` is
  already real; use it for the 2D mode. Do **not** put three.js in the station.
- **Shared files you touch:** `cli.py` (add subcommand) and `manifest.json`
  (append). Extend existing entries, don't overwrite.

## Step 0 — Read first (in this order)

1. `CLAUDE.md` — golden rules; note the **SSR-safety** rule for `three`
   (lazy-import inside an effect, never at module scope).
2. `apps/course2/src/stations/reference.tsx` — the station pattern; it already
   uses `Scatter2D` and shows the data-loading effect.
3. `packages/viz/src/Scatter2D.tsx` — the real primitive to mirror (resize-aware,
   prop-driven). Your `Scatter3D` should match its API shape
   (`Scatter3DPoint`, `Scatter3DProps` already declared in `packages/viz/src/index.ts`).
4. `packages/viz/src/Scatter3D.tsx` — the stub you replace.
5. `docs/adding-a-station.md` §5 — the SSR-safety checklist for three.
6. `docs/course-spec.md` → **「第二堂課」**; `prompts/README.md` → Definition of
   Done; and the placeholder `apps/course2/src/stations/embedding.tsx`.

## Step 1 — Precompute the embeddings artifact

The projection (PCA/UMAP/t-SNE) and neighbour computation are **heavy → do them
offline**; the browser only plots coordinates.

- Add an `embedding` subcommand to `cli.py` that writes to
  `apps/course2/public/data/course2/embedding/`:
  - `points.json` — array of `{ word, x, y, z, category? }` for a **small**
    curated vocab (a few hundred words with clear clusters: animals, numbers,
    colors, countries…). Project pretrained vectors down to 2D **and** 3D
    offline (keep both, or ship 3D and let the 2D mode drop z).
  - `neighbors.json` — for each word, its top-k nearest neighbours (by cosine in
    the **original** space, computed offline).
  - Register both in `manifest.json` `artifacts[]` tagged `station: "embedding"`.
- Regenerate: `cd precompute && uv run camp-precompute make-data` (or your
  subcommand). Commit the small JSON only.

## Step 2 — Make `Scatter3D` real (in `@camp/viz`)

- Lazy-import three inside an effect: `const THREE = await import("three")`.
  Never at module scope, never during render. Release the renderer/scene on
  unmount.
- Resize-aware via `useResizeObserver` (guard on `width === 0` first render).
- Prop-driven: points, a `highlight` set (or `selectedWord`), `colorBy`. No data
  fetching, no lesson copy — it takes everything via props (package boundary).
- Keep it a sibling of `Scatter2D` in API feel so the station can swap 2D/3D.

## Step 3 — Build the station

Replace the placeholder body in `embedding.tsx`:

- **Controls (`@camp/ui`):** `SegmentedControl` for 2D / 3D; a search input
  (controlled text) to pick the focus word; a `Toggle` for "color by category";
  optionally a `LabeledSlider` for k (neighbours shown).
- **Canvas:** `Scatter2D` or `Scatter3D` (by the toggle) over the loaded points.
  On search, highlight the focus word and its `neighbors.json` neighbours (e.g.
  brighten them, dim the rest, draw or list the k nearest).
- **Data:** load `points.json` + `neighbors.json` via `@camp/data` in an effect.
  Highlighting is derived state (pure function of selectedWord + neighbors).
- **Takeaway line:** distance ≈ similarity — and point at a spot where it breaks
  (e.g. a polyseme landing in a weird place).

## Step 4 — Verify

```bash
pnpm typecheck && pnpm lint && pnpm build
pnpm --filter @app/course2 dev   # open http://localhost:5173/embedding
```

Toggle 2D/3D, search a word, confirm neighbours light up. Rotate the 3D view.
No console errors; no three import at module scope.

## Design language (follow `prompts/DESIGN.md`)

Read `prompts/DESIGN.md`. Verify the one-time `@camp/ui` token retune is already
done (session 1's job); if not, do it. Station-specific notes:

- Scatter points render **greyscale** (`fg`/`muted`) on near-black by default — a
  quiet field. When "color by category" is on, use the **cyan/purple categorical
  hues** (plus greys) for the clusters — this is exactly what they're for; don't
  rainbow.
- The searched word **and its neighbours** are the only marks in **lime**
  (`accent`); dim the rest. At most one "hot" cluster at a time.
- `Scatter3D` (and `Scatter2D`) must read colors from **theme CSS vars / props**,
  not hard-coded hues — accent/categoricals/greys come from `@camp/ui` tokens.
- Axis / legend / neighbour-list labels use the `label-mono` idiom.

## Definition of Done (checked by `prompts/validate.md`)

Shared contract (`prompts/README.md` items 1–7), plus **embedding-specific**:

- [ ] `Scatter3D` is a real, resize-aware, prop-driven primitive in `@camp/viz`
      that lazy-imports three inside an effect (no module-scope/`render` three).
- [ ] `points.json` + `neighbors.json` exist under `.../course2/embedding/` and
      are in `manifest.json`; the station loads them via `@camp/data` (no
      coordinates hard-coded).
- [ ] 2D / 3D toggle works; 3D view is interactive (orbit/rotate).
- [ ] Searching a word highlights it and shows its nearest neighbours.
- [ ] No three.js or fetch inside the station file; no lesson data inside
      `@camp/viz`.
- [ ] **Design:** follows `prompts/DESIGN.md` — greyscale points, lime for the
      searched word + neighbours, cyan/purple for categories; colors come from
      theme vars/props (no hard-coded hexes).
- [ ] `pnpm typecheck && pnpm lint && pnpm build` are green.

## Report when done

Output: files changed (station + `Scatter3D` + `cli.py` + manifest), the
`artifacts[]` entries added, the route, and a one-line pass/fail per checkbox.
