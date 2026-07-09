# Session: **Transformer — the "watch a token flow through the model" overhaul** — Course 2

> Paste this whole file into a fresh Claude Code session at the repo root. It is
> self-contained. Deliverable: `/transformer` becomes a **horizontally-scrollable,
> left-to-right diagram** of one forward pass — **input → tokenizer → embedding →
> a miniature model (attention **matrix** + heads/layers dial + MLP) → next-token
> output** — driven by **free clicking + hover tooltips**, no step-by-step guide
> mode. `typecheck`/`lint`/`build` green.
> This is one large, tightly-coupled rewrite (data
> shape → components → controls all depend on each other), so build it **linearly
> in one thread** — do *not* fan out into parallel agents/worktrees. When the diff
> is done, run `/code-review high` on it. (There is no batch slash-command that
> fits this; the value is a coherent single rebuild, not parallelism.)

This is a **fresh overhaul** of the built Transformer station. It **supersedes**
the `DONE-06a` step-through interaction (the guided scrubber is being removed) but
**keeps** the real-Qwen live-inference plumbing that `DONE-06a`/`R2` established.
See `prompts/README.md` for the wave history and the shared Definition of Done.

---

## Why we're doing this

The current station (`apps/course2/src/stations/transformer.tsx`, ~742 lines) has
**two modes**: a real Qwen3-0.6B attention view (`AttentionLines` arcs + layer/head
sliders) and a hand-designed **step-by-step schematic** walkthrough (Q·K → scale →
softmax → wV → out). It's polished but:

- The **step-by-step guide mode is going away.** High-schoolers learn this better by
  *clicking around* a live diagram with **hover tooltips** than by scrubbing a fixed
  animation. Kill the schematic scrubber, the play button, and the `real`/`schematic`
  mode toggle.
- Transformer is the **final station of Course 2**, so it should **visibly chain**
  the earlier stations: the same tokenizer chips, the same embedding vectors, the
  same next-token probability bars the students already met — now strung together
  left-to-right as **one pipeline**.
- Attention should be shown as a **matrix** (query × key), not arcs — it makes the
  **causal mask** and per-head patterns legible at a glance.

## The reference we're borrowing from (design only, not code)

A clone of **poloclub/transformer-explainer** (MIT licensed — the whole point of
cloning it) sits at **`.reference/transformer-explainer/`** (gitignored; re-clone
with `git clone --depth 1 https://github.com/poloclub/transformer-explainer` if
absent). It's a **Svelte** app running GPT-2 in-browser — **we do not port its
code** (we're React + a precompute/live-server architecture). We borrow its
**design ideas**:

- **The left-to-right pipeline** as the whole UI: embedding → block (QKV / attention
  / MLP) → subsequent-blocks → linear+softmax, each column a stack of per-token
  vector bars. (`.reference/transformer-explainer/src/routes/+page.svelte`, the
  `src/components/*.svelte` sections.)
- **Attention as a matrix of cells**, white→purple, rows = query, cols = key; **hover
  a cell → cross-highlight the query row + key column tokens.**
  (`src/components/AttentionMatrix.svelte`, `common/Matrix*.svelte`.) This is exactly
  our "matrix only" decision.
- **Layer + head are just two integer selectors** indexing a flat dict of tensors —
  O(1), no recompute. (`store/index.ts` `blockIdx`/`attentionHeadIdx`,
  `AttentionMatrix.svelte:35-43`.) We already do this; keep it.
- **The head "deck"** (offset stacked cards you page through) is a memorable head
  selector — optional to echo.
- **Honesty:** in the reference, *only attention + final logits are real*; QKV/MLP
  bars are `Math.random()` placeholders. **We are doing better** (see the data
  decision below) — but the takeaway stands: **label any representative/subsampled
  slice as such; never imply a decorative bar is a real weight.**

**What we skip:** their 600MB in-browser ONNX model, the WebGL/worker machinery,
the GSAP FLIP expand/collapse, the `contenteditable` input. Our stack and golden
rules (below) point a different way.

## Decisions already made (do not re-litigate — build to these)

1. **Data source — keep precompute + live server, and EXPAND it.** Stay on the
   Qwen3-0.6B precompute + FastAPI `liveInferTimed` pattern (honors "the browser
   never trains", reuses all existing infra). **Expand the exported payload so the
   embedding, MLP, and next-token output shown in the diagram are REAL model
   numbers, not decorative** — subsampled/quantized for the canvas, but honest.
2. **Attention viz — MATRIX ONLY.** Use `@camp/viz` `Heatmap` (query × key, causal
   lower-triangle) as *the* attention view. Drop `AttentionLines` from this station.
   (Leave the `AttentionLines` primitive in the package — don't delete it — it's just
   no longer used here.)
3. **Chaining — compact echoes of the prior stations.** The left columns render slim,
   recognizable mini-versions of the **tokenizer chips** and **embedding vectors**
   (same visual language as `tokenizer.tsx` / `embedding.tsx`), not full interactive
   stations. The right column echoes the **next-token probability bars**.
4. **Rebuild scope — ground-up rebuild, salvage the real-attention plumbing.** Treat
   `transformer.tsx` as a new station: new scrollable left-to-right layout + free
   click/hover interaction. **Reuse** the `attention.json` load + `liveInferTimed`
   fallback logic (the `livePending/liveFailed/liveShown` → `LiveState` idiom).
   **Delete** the schematic step mode, `STEPS`, the play button, and the mode toggle.

## The target: a five-section pipeline, scrollable left-to-right

`StationLayout` with `fullBleed`, canvas is one **horizontally-scrollable** row.
Left → right:

1. **Input** — the typed/preset sentence (`SuggestInput`, kept). Presets are the
   recorded sentences; typing runs live inference (see §4).
2. **Tokenizer** — the sentence split into **token chips** (echo `tokenizer.tsx`'s
   colored chips + ids). Shows *the same tokens the rest of the diagram uses* (real
   Qwen subword pieces).
3. **Embedding** — one **embedding vector per token** as a `VectorStrip` column (echo
   `embedding.tsx`). Real, subsampled to a viewable width.
4. **Miniature model** — the heart. Per **(layer, head)** chosen by two dials:
   - the **attention matrix** (`Heatmap`, query × key, causal) — hover a cell to
     cross-highlight the query token (row) and key token (column);
   - an **MLP** representation (real activation slice, clearly a representative
     subsample) so students see "attention mixes tokens, then the MLP transforms each
     one";
   - the **head/layer dials** let students "focus on which head at which layer it's
     looking at" — that's the core interaction of this section.
5. **Output** — the **next-token probability bars** (echo `nextToken.tsx`), real
   top-k from the model.

**Interaction model = free clicking + hover, no guided steps:**
- Layer dial, head dial (`BlockSlider`), sentence input — that's the primary control
  surface. Consider a compact toggle if section 4 needs to switch what it emphasizes,
  but **default to showing the matrix**.
- **Hover tooltips carry the "extra info"** the old step commentary used to: hover a
  matrix cell → the (query, key, weight) and the two tokens light up; hover a token
  chip / embedding cell / MLP cell → a short explanation via the on-canvas
  `group-hover` pattern (see `rnnViz.tsx:326-335`) or `InfoLabel` on controls.
- Respect **`prefers-reduced-motion`**: any column-to-column transition must be
  legible with motion off; the diagram is fundamentally static + hover-driven, so this
  should be easy.

Connectors between columns (the reference's "sankey" curves) are **nice-to-have, not
required** — they cost `getBoundingClientRect` + `ResizeObserver` redraws. Ship the
aligned columns first; add light connectors only if they're cheap and stable. Note in
your report what you did.

---

## Prerequisites & shared surface

- **Shared files that other stations also touch — extend, never overwrite:**
  `precompute/src/camp_precompute/cli.py` (add to the `transformer` subcommand),
  `apps/course2/public/data/course2/course2/manifest.json` (`upsert` the artifact),
  `packages/viz` (extend `Heatmap`, don't rebuild it), `server/app/` (extend the
  transformer response + schema).
- **Golden rule (`CLAUDE.md`):** the browser **never trains**. All model numbers are
  **precomputed offline** (or fetched from the live GPU server); the browser only
  replays them and may do trivial arithmetic. `three`/`onnxruntime-web` (if ever
  touched) are lazy-imported **inside an effect** — but you shouldn't need either here.
- **Determinism contract (`qwen.py` docstring):** precompute and the live server call
  the **same** `qwen.py` functions with the same settings, so a typed preset
  reproduces the shipped artifact. **Whatever new fields you export in precompute, the
  live server must return too** (see §4) — or the diagram's new sections must degrade
  honestly on live input.

## Step 0 — Read first

1. `CLAUDE.md` — golden rules, package boundaries, SSR/lazy-import rule.
2. `prompts/DESIGN.md` — the visual language: near-black surface, **lime `#D6FB00`**
   for the focused/active element only, **cyan/purple** categoricals (≤3, for
   heads/layers), attention weight encoded by opacity — **no hard-coded hexes**.
3. `prompts/README.md` → the shared **Definition of Done** (items 1–8).
4. `apps/course2/src/stations/transformer.tsx` — the current station: the
   `AttentionData` shape, the `livePending/liveFailed/liveShown` live-infer idiom
   (SALVAGE THIS), and the schematic mode (DELETE THIS).
5. The **echo sources** — `apps/course2/src/stations/tokenizer.tsx` (chip look),
   `embedding.tsx` (`VectorStrip` vectors), `nextToken.tsx` (probability bars,
   `displayToken` helper). Reuse their visual language; don't import lesson code
   across stations — copy the small pieces you need into this station.
6. `packages/viz/src/Heatmap.tsx` + `index.ts` — the matrix primitive to use/extend.
   Also `VectorStrip.tsx`, `useThemeColors`/`mix`/`rgbCss`.
7. `packages/ui/src/index.ts` — `StationLayout` (`input`/`controls`/`takeaway`/
   `fullBleed`), `SuggestInput`, `DockControls`, `BlockSlider`, `BlockToggle`,
   `InfoLabel`, `LiveStatus`/`LiveState`.
8. `precompute/src/camp_precompute/qwen.py` — `attention_payload()` (L119),
   `next_token_entries()` (L86), `tokenize_pieces()` (L68), the caps
   `ATTENTION_MAX_TOKENS=24` / `NEXT_TOKEN_TOP_N=12`. And `cli.py`'s `transformer`
   subcommand (`build_transformer`, `build_schematic`).
9. `server/app/routers/transformer.py` + `server/app/schemas.py` — the live endpoint
   + `TransformerResponse` you'll extend. And `next_token.py` for the logits pattern.
10. `.reference/transformer-explainer/` — for **design ideas only** (see the
    reference section above); it's Svelte, don't copy code.

## Step 1 — Precompute: export the whole pipeline, not just attention

Extend the `transformer` subcommand + `qwen.attention_payload()` (or a new
`pipeline_payload()`) so one artifact per sentence carries everything the five
sections need. **Additive** — keep the existing `[layer][head][query][key]` attention
tensor. **Add**, per sentence:

- **tokens** (already there) + **token ids** — for the tokenizer chips.
- **embedding** — the input embedding vector per token, **subsampled** to a viewable
  width (e.g. ~32–64 dims, or a fixed projection). Label it representative.
- **mlp** — a real MLP activation **slice** per (layer, token): the hidden layer is
  huge (~3072 dims), so **subsample/quantize to a small viewable strip** (e.g. top-N
  or a fixed downsample). This must be honestly labeled "representative slice", not
  "the MLP".
- **output** — the **next-token distribution** (top-k, reuse `next_token_entries`) so
  the right column is real.

**Keep the artifact small.** Attention is already 781 KB for 28 layers × 16 heads × 3
sentences. Adding full MLP for every layer would explode it. **Curate:**
- **Attention** stays at all 28 layers × 16 heads (already recorded, cheap).
- **MLP/embedding detail** only needs to be recorded for what the dial can *show*.
  Strongly consider recording MLP for **a curated subset of representative layers**
  (e.g. early / middle / late) rather than all 28, and say so in the UI, OR downsample
  hard. **Flag your choice in the report** (see Open Decisions).
Round to 3 decimals, write compact (`separators=(",",":")`) like the current file.
`upsert` into `manifest.json`. Regenerate with `uv run camp-precompute transformer`
(from `precompute/`, via `uv`). Commit the JSON (it's small; `.onnx`/`.bin` stay
gitignored — you won't produce any).

## Step 2 — Viz: the attention matrix (extend `Heatmap`, stay prop-driven)

- Use **`Heatmap`** for the query × key attention matrix: causal lower-triangle,
  single-hue opacity ramp (weight → opacity), `rowLabels`/`colLabels` = tokens.
- **`Heatmap` currently has no hover callback.** To cross-highlight the query row +
  key column tokens on cell hover, **add an `onHoverCell?(cell: {row,col} | null)`
  prop** (and optionally a `highlightRow`/`highlightCol` to draw the crosshair). Keep
  it generic and prop-driven — **no lesson data, no fetch, no hard-coded hexes,
  resize-aware, theme colors only.** The station owns the hover state and passes it
  back down; the primitive stays a pure function of props (the `reference.tsx`
  pattern).
- Reuse **`VectorStrip`** for the embedding + MLP columns. If you need a "probability
  bar" and one isn't already generic, keep it **in the station** (it's lesson-shaped)
  unless a second station would reuse it.
- Anything sentence-specific (copy, the actual data, the pipeline layout) lives in the
  **station**, never the package.

## Step 3 — Station: rebuild `transformer.tsx` as the pipeline

- **Delete:** the `real`/`schematic` `BlockToggle`, the `STEPS` array, the step
  `BlockSlider`, the play `BlockButtons`, the schematic pipeline grid, the
  `AttentionLines` usage, the schematic `dot`/`softmax` locals.
- **Keep/salvage:** the `AttentionData` load via `loadJSON` in an effect; the debounced
  `liveInferTimed` call + `livePending/liveFailed/liveShown` → `LiveState` memo +
  `LiveStatus`; the `displayToken` helper; preset fast-path.
- **State:** `sentenceId` (preset) / typed text, `layer`, `head`, and hover state
  (`hoveredCell`, `hoveredToken`). Everything rendered is a **pure function** of
  `(data, sentence, layer, head, hover)`.
- **Layout:** `StationLayout fullBleed`, canvas = a horizontally-scrollable flex row of
  the five sections, each a labeled column with the mono/uppercase micro-labels. The
  input goes in the dock `input` slot (`SuggestInput` + `LiveStatus`); the layer/head
  dials go in `controls` (`DockControls` + two `BlockSlider` with `InfoLabel` tooltips,
  `format` = `L{n}` / `H{n}`).
- **Interaction:** layer/head dials update the matrix + MLP columns; hovering a matrix
  cell cross-highlights the query/key tokens (lime) across the tokenizer + embedding
  columns; hovering chips/cells shows short zh-TW explanations via the on-canvas
  `group-hover` tooltip pattern. No guided steps.
- **`takeaway`:** one tight zh-TW sentence (the "重點" badge) — e.g. attention lets each
  token look back at earlier tokens (causal), then the MLP transforms each; stack 28 of
  these and you get the model.

## Step 4 — Live parity: the server must return the new fields

The diagram's new sections (embedding / MLP / output) need data for **typed** input too,
or they must degrade honestly:

- **Extend `qwen.attention_payload()`** (or add `pipeline_payload()`) to also return the
  embedding / MLP-slice / next-token fields, using the **same** subsample/quantize logic
  as precompute (so live == recorded for presets). Extend `TransformerResponse` +
  `TransformerRequest` schemas and the `/transformer/attention` router to pass them
  through.
- **Latency guard:** if returning full MLP for every layer makes live inference too slow,
  it's acceptable to make the **MLP/embedding detail preset-only** and have **typed input
  fall back to attention + output only**, with `LiveStatus` staying honest (the existing
  offline/cached fallback already models this). **Recommended:** extend fully; degrade
  only if latency forces it. State what you chose.

## Step 5 — Copy: keep it zh-TW

The station is already zh-TW (from `00a`). Keep all chrome, labels, tooltips, and the
takeaway in **正體中文**, with glossary terms in English (`Transformer`, `attention`,
`self-attention`, `Q`/`K`/`V`, `softmax`, `head`, `layer`, `MLP`, `token`, `embedding`).
Update the `registry.tsx` `transformer` blurb if the station's pitch changed.

## Step 6 — Verify

```bash
cd precompute && uv run camp-precompute transformer   # regenerate the expanded artifact
cd .. && pnpm typecheck && pnpm lint && pnpm build
pnpm --filter @app/course2 dev                        # http://localhost:5173/transformer
# (optional) run the live server and type a custom sentence to confirm live parity
```

Manually confirm: the five sections read left-to-right and scroll; the tokenizer chips /
embedding vectors / output bars visibly echo the earlier stations; the **attention
matrix** shows the causal lower-triangle and per-head structure; the **layer + head
dials** change the matrix and MLP; **hovering a matrix cell cross-highlights** the query
+ key tokens; hovers surface the explanatory tooltips; there's **no step scrubber**; it's
legible with `prefers-reduced-motion` on; no console errors. Then `/code-review high`.

## Design language (follow `prompts/DESIGN.md`)

- Near-black surface; tokens `text-fg`, micro-labels mono/uppercase (Latin). Attention
  weight = **opacity on a single hue**; the **hovered cell + its query/key tokens** =
  **lime**. Heads/layers, if color-coded, use **cyan/purple** (≤3), never a rainbow.
- `VectorStrip`/MLP cells encode magnitude by opacity (or diverging purple↔lime for
  signed) **from theme vars** — no hard-coded hexes anywhere.
- Representative/subsampled data (MLP slice, embedding subsample) is **visibly labeled**
  as representative — honesty over polish.

## Definition of Done (checked by `prompts/validate.md` + `/code-review`)

Shared contract (`prompts/README.md` items 1–8), plus **transformer-overhaul**:

- [ ] The station is a **left-to-right, horizontally-scrollable pipeline**: input →
      tokenizer → embedding → miniature model → next-token output.
- [ ] Attention is shown as a **matrix** (query × key, causal), **not** arcs; hovering a
      cell **cross-highlights** the query + key tokens. `AttentionLines` is no longer
      used by this station (primitive left intact in the package).
- [ ] The **step-by-step schematic guide mode is gone** (no scrubber, no play, no
      mode toggle); interaction is **free clicking + hover tooltips**.
- [ ] The left/right columns **echo the tokenizer, embedding, and next-token stations'**
      visual language.
- [ ] Embedding / MLP / output shown are **real model numbers** (subsampled/quantized
      + labeled representative), exported by the extended `transformer` precompute and
      loaded via `@camp/data`; the browser trains nothing.
- [ ] **Layer and head dials** drive the matrix + MLP; the live server returns the new
      fields (or typed input degrades honestly with an accurate `LiveStatus`).
- [ ] `Heatmap`'s hover extension stays prop-driven/theme-colored (no fetch, no lesson
      data, no hard-coded hexes); package boundaries hold.
- [ ] UI + tooltips are zh-TW (glossary terms English); `registry.tsx` blurb updated.
- [ ] `prefers-reduced-motion` respected; `pnpm typecheck && pnpm lint && pnpm build`
      green; `/transformer` renders with no console errors.

## Open decisions — make the call, then flag it in your report

These are judgment calls left to the build session; pick sensibly and **state what you
chose + why**:

1. **Layers with MLP detail:** record MLP/embedding for *all 28 layers* (bigger JSON) or
   a *curated representative subset* (early/mid/late, smaller + arguably clearer for
   beginners)? Recommended: a curated subset, clearly labeled. Attention stays all 28.
2. **Live MLP parity vs preset-only** (§4) — extend the server fully, or make MLP/embedding
   preset-only with honest live fallback? Recommended: extend fully; degrade only if
   latency forces it.
3. **Column connectors** — ship the sankey-style curves between columns, or aligned
   columns only? Recommended: aligned columns first; add connectors only if cheap/stable.
4. **Head "deck" selector** — plain `BlockSlider`, or the reference's offset-card deck?
   Recommended: `BlockSlider` for v1 (the deck is a polish item).

## Report when done

Output: the final five-section layout + interaction model; the expanded artifact shape
(what's real vs representative-subsampled, and for which layers); what you extended in
`Heatmap` / the server / `qwen.py`; the four open-decision choices you made; files
changed; and a one-line pass/fail per Definition-of-Done checkbox. Note whether column
connectors shipped and the live-parity behavior for typed input.
