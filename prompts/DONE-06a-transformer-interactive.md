# Session: **Transformer — a bbycroft-style interactive walkthrough** — Course 2 (wave 2)

> Paste this whole file into a fresh Claude Code session at the repo root. It is
> self-contained. Deliverable: the `/transformer` station becomes a **guided,
> step-through visualization of self-attention** — modeled on
> **bbycroft.net/llm** (`github.com/bbycroft/llm-viz`) — replacing the current
> hover-a-matrix view with an animated pipeline the student scrubs through.
> `typecheck`/`lint`/`build` green.

Wave-2 upgrade to the built Transformer station (`apps/course2/src/stations/
transformer.tsx`, `packages/viz/src/AttentionLines.tsx`, the `transformer`
precompute subcommand). See `prompts/README.md` → **Wave 2**. **Run after `00a`.**

## ⚠️ Read this first: scope + licensing

**The reference — `bbycroft/llm-viz`** — is a superb 3D walkthrough of a full
GPT. **We do not need the whole thing.** We need the **self-attention subset**:
pick a query token → see Q·K dot products → scores → softmax → weighted sum of V →
the token's output. That single mechanism, made scrubbable and beautiful, is the
station.

- **Scope:** an on-brand, **2D (or light 3D) step-through of ONE idea
  (self-attention)** — bbycroft is the model for **interaction depth** (scrub
  phases, watch every intermediate light up, camera/focus follows the active
  sub-step), **not** a mandate to port the entire GPT/MLP/LayerNorm/output scene.
  Build the subset well; don't boil the ocean.
- **Licensing — IMPORTANT:** `llm-viz` has **no LICENSE file** (default = all
  rights reserved). The user's call: **you may port/adapt it for the internal
  camp now**, but this is **flagged to resolve before any public deploy** (obtain
  permission or add a license). **Prefer implementing the subset ourselves**
  (clean-room, from the architecture below) over copying files wholesale — we only
  need a slice, and our own impl is smaller, on-palette, and unencumbered. If you
  do lift code, keep it isolated, attribute it in comments, and note it in your
  report so it's easy to audit/replace. **Do not** copy `llm-viz` into a form that
  ships publicly without the license resolved.
- A clone for **reference only** sits at
  `/Users/zhangqiwei/.claude/jobs/f42e9f8e/tmp/llm-viz` (may be absent in a fresh
  session — re-clone with `git clone --depth 1 https://github.com/bbycroft/llm-viz`
  into a scratch dir if you want to read it; **do not** add it to this repo).

## How llm-viz is built (so you can borrow the *design*, not the files)

From an architecture read of the reference:

- **Renderer:** hand-written **WebGL2** (raw `gl` calls, GLSL shaders) — **no
  three.js**. A custom camera (`Camera.ts`, spring physics) and per-frame
  orchestrator (`Program.ts` → layout → walkthrough → camera → `renderModel`).
- **Model:** a tiny **minGPT "gpt-nano"** (`n_layer=3, n_head=3, n_embd=48,
  vocab=3`, the toy sort task), weights as **plain JSON (~466 KB)**; it runs a
  **real forward pass in WebGL2 fragment shaders**, with a `*-partials.json`
  (~248 KB) of reference activations for validation.
- **Walkthrough:** `src/llm/walkthrough/Walkthrough0N_*.tsx` — one file per phase
  (Embedding, LayerNorm, **Self-Attention**, **Softmax**, Projection, MLP…). Each
  phase sets a hard-coded camera `Vec3`, a set of **highlighted sub-blocks**, and
  narrative via a tagged-template `commentary(wt)\`...\`` with inline refs that tie
  words to colored blocks/dims. A "step" = a commentary block + `breakAfter()`
  (spacebar-gated), visuals scheduled by `afterTime(...)`.
- **Next-coupling is light:** only one `next/link`; assets fetched from web root;
  `'use client'` at the top of the view. Portable to Vite with an HTML shell +
  path aliases + assets in `public/`.

**What we take:** the *interaction model* — a **phase list** (Q/K/V → scores →
softmax → weighted-sum → output), a **scrubber/step control**, **commentary tied
to highlighted blocks**, and **focus/camera following the active step**. **What we
skip:** the full GPT scene, WebGL2 shader inference, the Odin/wasm path, the font
atlas — all overkill for one mechanism.

## The pedagogy this delivers

The current station shows the *result* (an attention matrix you hover). bbycroft's
insight is to show the **mechanism**: *why* those weights exist. Student picks a
**query token**, then steps: (1) its **Q** vs every **K** → **dot products**;
(2) scaled → **scores**; (3) **softmax** → weights (a real distribution); (4)
**weighted sum of V** → the query's **output** vector. Layer/head still switch.
Keep the existing "hover to see attention lines" as one view/phase — **be
additive**: the current `attention.json` matrix + `AttentionLines` must keep
working; you ADD the mechanism, you don't break the result view.

## Prerequisites & shared surface

- **Depends on `00a`** for the zh-TW copy convention (you localize this station).
- **Shared files:** `cli.py`, `manifest.json`, `packages/viz`. Extend, don't
  overwrite. `AttentionLines` already exists — extend/compose, don't rebuild it.
- **Golden rule:** the browser **never trains**. A tiny attention example is
  **precomputed offline**; the browser replays it and may do **light** arithmetic
  (dot products of ~8-dim vectors, a softmax over a handful of scores) — that's
  fine, it's not a model forward pass. No three.js required; if you use it, it
  must be **lazy-imported inside an effect** (SSR rule), never at module scope.

## Step 0 — Read first

1. `CLAUDE.md` — golden rules + SSR/lazy-import rule.
2. `prompts/00a-zh-tw-copy.md` → glossary + CJK label note.
3. `prompts/DESIGN.md` — attention links = greyscale opacity/width; lime = focus;
   cyan/purple = heads only.
4. `apps/course2/src/stations/transformer.tsx` — the built station (`AttentionData`
   shape, layer/head/focus state).
5. `packages/viz/src/AttentionLines.tsx` + `index.ts` — the primitive to extend.
6. `precompute/src/camp_precompute/cli.py` → the `transformer` section
   (`build_transformer`, `_attention_matrix`, the synthetic head patterns).
7. Optionally the reference clone (see the licensing note) — for *design*, not code.

## Step 1 — Precompute: export the mechanism, not just the result

Extend the `transformer` subcommand so the artifact carries what the step-through
needs. **Additive** — keep the existing `[layer][head][query][key]` matrix so the
result view still works; ADD small per-token vectors so the browser can *show* the
dot products:

- Per sentence, per (layer, head): tiny **Q, K, V** vectors per token (dim ~8),
  chosen so `softmax(Q·Kᵀ / √d)` reproduces the hand-designed patterns you already
  ship (local / content / first-token). You can factor the existing affinity into
  small Q/K, or just synthesize consistent tiny vectors — the point is the dot
  products visibly build the scores students then see soft-maxed.
- Keep it **tiny** (short sentences, 3 layers, 3 heads, dim 8 → still a small
  JSON). Register/refresh in `manifest.json`. Regenerate:
  `uv run camp-precompute transformer`. Commit the JSON.

## Step 2 — Viz: a step-through attention primitive (in `@camp/viz`)

Build the mechanism as **prop-driven** pieces (reuse what exists):

- Reuse **`Heatmap`** for the scores/weights row (or the full [q][k] matrix).
- Reuse/extend **`AttentionLines`** for the token-row + weighted links view.
- Add small generic pieces only if reused (e.g. a "vector strip" showing Q/K/V as
  colored cells, a bar for the softmax distribution). Anything lesson-specific
  (the phase copy, the specific sentence) stays in the **station**, not the
  package. No fetch, no hard-coded hexes, resize-aware, theme colors via
  vars/props. **State lives in the station**; primitives are pure functions of
  props (the `reference.tsx` pattern).

## Step 3 — Station: the guided walkthrough

Rebuild `transformer.tsx` around a **phase/step model** (the bbycroft idea):

- **State:** `sentenceId`, `layer`, `head`, `queryToken`, and a **`step`** index
  (Q·K → scores → softmax → weighted-sum → output), plus play/scrub.
- **Controls (`@camp/ui`):** sentence / layer / head selectors (keep them); a
  **query-token** picker (click a token); a **step scrubber** — a segmented
  control or prev/next + a play button (`RunButton`) that advances steps. This is
  the "scrub the mechanism" interaction.
- **Canvas:** as `step` advances, reveal the corresponding stage and **focus**
  (lime) the active sub-part — the Q row, the K being dotted, the growing score
  bar, the softmax distribution, the V weighted-sum. Commentary text updates per
  step (short, zh-TW). Keep the attention-lines "result" view available.
- **Data:** load the extended `attention.json` via `@camp/data` in an effect;
  everything shown is a pure function of (data, sentence, layer, head, query,
  step). Light dot-product/softmax math in-browser is OK.
- **Motion:** step transitions animate subtly; **gate on
  `prefers-reduced-motion`** — the lesson must read with motion off (the scrubber
  still steps discretely).

## Step 4 — Localize this station's UI to zh-TW

Rewrite chrome + the per-step commentary to zh-TW per `00a`'s glossary (keep
`Transformer`, `attention`, `self-attention`, `Q`/`K`/`V`, `softmax`, `head`,
`layer` English). Update the `registry.tsx` `transformer` entry to zh-TW.

## Step 5 — Verify

```bash
uv run camp-precompute transformer   # from precompute/ (uv)
pnpm typecheck && pnpm lint && pnpm build
pnpm --filter @app/course2 dev   # http://localhost:5173/transformer
```

Pick a query token; scrub the steps and watch Q·K → scores → softmax →
weighted-sum → output light up in order; switch layer/head and see the pattern
change; the result (attention-lines) view still works. No console errors. Verify
with reduced-motion on, the walkthrough is still fully legible.

## Design language (follow `prompts/DESIGN.md`)

- Everything on near-black; tokens `text-fg`, labels mono. Attention links /
  weights are **greyscale, opacity/width ∝ weight**; the **active step's focus**
  (query token, the K being dotted, the argmax weight) is **lime**.
- If heads are visually distinguished, use **cyan/purple** (≤3), never a rainbow.
- Q/K/V vector cells: encode magnitude by opacity on a single hue (or the
  diverging purple↔lime for signed), from theme vars — no hard-coded hexes.
- Step scrubber / selectors use the mono/uppercase (Latin) label idioms.

## Definition of Done (checked by `prompts/validate.md`)

Shared contract (`prompts/README.md` items 1–8), plus **transformer-interactive**:

- [ ] The station is a **step-through** of self-attention (Q·K → scores → softmax
      → weighted-sum → output) driven by a **scrubber/step** control + a
      **query-token** picker — not just a hover-a-matrix view.
- [ ] It is **additive**: the prior attention-matrix / `AttentionLines` result
      view still works; `attention.json` gained small Q/K/V vectors and is loaded
      via `@camp/data` (nothing trained/forward-passed in the browser).
- [ ] Layer **and** head still change the attention; motion respects
      `prefers-reduced-motion` (legible with motion off).
- [ ] Any `llm-viz`-derived code is isolated, attributed, and flagged in the
      report; nothing unlicensed is wired into a public-deploy path. (Preferred:
      clean-room subset, no copied files.)
- [ ] `@camp/viz` pieces stay prop-driven/theme-colored (no fetch, no lesson data,
      no hard-coded hexes); three.js (if any) lazy-imported in an effect.
- [ ] Station UI + commentary are zh-TW (glossary terms English); sidebar label
      localized.
- [ ] `pnpm typecheck && pnpm lint && pnpm build` are green.

## Report when done

Output: the phase/step model you built, what (if anything) was derived from
`llm-viz` (and its isolation/attribution), the extended `attention.json` shape,
viz pieces added/reused, files changed, and a one-line pass/fail per checkbox.
Explicitly restate the **license to-resolve-before-public-deploy** flag.
