# Session: Build the **Next Token** station (Course 2)

> Paste this whole file into a fresh Claude Code session at the repo root. It is
> self-contained. Deliverable: a working `/next-token` station, a real `Heatmap`
> primitive in `@camp/viz`, and the precompute artifact — with
> `typecheck`/`lint`/`build` green.

You are filling in `apps/course2/src/stations/nextToken.tsx`, currently a
placeholder. This is **station 4 of 6** — see `prompts/README.md`.

## What you're building (the pedagogy)

The unifying idea: **every language task is just "predict the next token."**
Students give a prompt and watch a **probability distribution** over the next
token, then play with **temperature** and **top-k** to build intuition for
sampling vs greedy decoding.

**Goal:** students type a prompt, see a bar/heat display of next-token
probabilities, and watch temperature/top-k reshape that distribution.

## Prerequisites & shared surface

- **New viz primitive:** `Heatmap` in `@camp/viz` is a **stub**. Flesh it out
  **in the package** (resize-aware, prop-driven, d3/SVG or canvas — no lesson
  data). **`Heatmap` is reused by station 05 (rnn-viz)**, so build a clean,
  general API now (grid of values + row/col labels + color scale); 05 will
  extend, not rebuild. A horizontal bar display of top-k probs is also fine for
  this station — but still land the `Heatmap` primitive since 05 needs it.
- **Light ONNX inference:** this station may run a **small** precomputed ONNX
  model in-browser via `loadOnnxSession` (`@camp/data`) — inference only, never
  training. Note `*.onnx`/`*.bin` are **gitignored**: the precompute step
  produces the model for local/deploy, but you commit only JSON + the manifest
  entry. If wiring ONNX is heavy, you may instead **replay a precomputed
  distribution** per prompt from JSON — either satisfies "the browser never
  trains." Prefer real light inference if it fits the budget.
- **Shared files you touch:** `cli.py`, `manifest.json`. Extend, don't overwrite.

## Step 0 — Read first (in this order)

1. `CLAUDE.md` — golden rules; the ONNX SSR rule (`loadOnnxSession` from an
   effect/handler, release on unmount).
2. `apps/course2/src/stations/reference.tsx` — station pattern.
3. `packages/viz/src/Heatmap.tsx` — the stub you make real; check the declared
   `HeatmapProps` in `packages/viz/src/index.ts`.
4. `packages/data/src/loadOnnxSession.ts` — the SSR-guarded loader (if using ONNX).
5. `docs/adding-a-station.md` §5; `docs/course-spec.md` → **「第二堂課」**;
   `prompts/README.md` → Definition of Done; and the placeholder
   `apps/course2/src/stations/nextToken.tsx`.

## Step 1 — Precompute the artifact(s)

Add a `next-token` subcommand to `cli.py` that writes to
`apps/course2/public/data/course2/next-token/`:

- **If ONNX path:** export a **small** next-token model to `model.onnx` (+ any
  vocab JSON needed to map ids ↔ tokens). List the model in `manifest.json`
  `artifacts[]` (tagged `station: "next-token"`) even though the binary itself
  isn't committed — the manifest entry is the contract.
- **If replay path:** for a handful of prompts, precompute the full next-token
  probability vector (top-N tokens + probs) and write `distributions.json`.
- Regenerate; commit small JSON + manifest entry only (never the `.onnx`).

## Step 2 — Make `Heatmap` real (in `@camp/viz`)

Resize-aware (`useResizeObserver`, guard width 0), prop-driven: a 2D grid of
values, optional row/col labels, a color scale, optional cell tooltip. No fetch,
no lesson copy. Keep the API general — **station 05 feeds it hidden-state
activations**, this station feeds it a 1×N (or N×1) probability row.

## Step 3 — Build the station

Replace the placeholder body in `nextToken.tsx`:

- **Controls (`@camp/ui`):** a prompt text input; `LabeledSlider` for
  **temperature**; `LabeledSlider` or `SegmentedControl` for **top-k**;
  optionally a `SegmentedControl` for greedy vs sampling.
- **Canvas:** top-k next-token probabilities as bars and/or a `Heatmap` row.
  Temperature reshapes the distribution (apply the temperature/top-k transform
  **in the browser** to the model's logits/probs — that's light math, allowed);
  greedy = argmax highlighted.
- **Data/inference:** run `loadOnnxSession` in an effect/handler (release on
  unmount), OR load `distributions.json` via `loadJSON`. Distribution + controls
  → derived display state.
- **Takeaway line:** "one trained next-token predictor + a temperature knob is
  the whole generation loop."

## Step 4 — Verify

```bash
pnpm typecheck && pnpm lint && pnpm build
pnpm --filter @app/course2 dev   # open http://localhost:5173/next-token
```

Type a prompt; slide temperature and watch the distribution sharpen/flatten;
change top-k. No console errors; no onnx/three at module scope.

## Design language (follow `prompts/DESIGN.md`)

Read `prompts/DESIGN.md`. Verify the one-time `@camp/ui` token retune is already
done; if not, do it. Station-specific notes:

- The probability display (bars and/or the new `Heatmap`) is a **single-hue ramp**
  (near-black → lime); the **argmax** token is the one mark in full **lime**.
- Style the bar field like the deck's distribution bars: thin bars, one color,
  magnitude via height/opacity — not per-token hues.
- `Heatmap` must read its color scale from **theme vars / props** (it's reused by
  05-rnn-viz), never hard-coded — keep it themeable.
- Temperature / top-k / token labels use the `label-mono` idiom.

## Definition of Done (checked by `prompts/validate.md`)

Shared contract (`prompts/README.md` items 1–7), plus **next-token-specific**:

- [ ] `Heatmap` is a real, resize-aware, prop-driven primitive in `@camp/viz`
      with a general grid API (so 05-rnn-viz can reuse it).
- [ ] Next-token probabilities are driven by a **precomputed** model/distribution
      loaded via `@camp/data` (ONNX via `loadOnnxSession` from an effect, or JSON
      replay) — **no training, no logits computed from raw weights in-browser**
      beyond the light temperature/top-k transform.
- [ ] Temperature control visibly reshapes the distribution; top-k limits it;
      greedy highlights the argmax.
- [ ] If ONNX is used, it's lazy/guarded and the session is released on unmount;
      no `onnxruntime-web` at module scope.
- [ ] **Design:** follows `prompts/DESIGN.md` — single-hue (near-black → lime)
      distribution, lime on the argmax; `Heatmap` reads its scale from theme
      vars/props (no hard-coded hexes).
- [ ] `pnpm typecheck && pnpm lint && pnpm build` are green.

## Report when done

Output: files changed (station + `Heatmap` + `cli.py` + manifest), the
`artifacts[]` entry, which path you took (ONNX vs replay), the route, and a
one-line pass/fail per checkbox.
