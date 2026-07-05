# Course 2 station-build prompts

Each file in this folder is a **self-contained session prompt**. Open a fresh
Claude Code session in this repo, paste one file's contents in, and the agent
builds that station end-to-end (precompute artifact → viz primitive → station →
verify). Then run `validate.md` to confirm every session hit its goal.

This mirrors the slide-writing `slides/decks/handoff.md` workflow: one paste,
one self-contained job, runs to the end.

## The stations (build in this order)

The order is the **teaching order** and also the **dependency order** — later
stations reuse viz primitives that earlier ones flesh out. Build sequentially.

| # | Prompt | Station | New viz primitive it must build in `@camp/viz` |
|---|--------|---------|-----------------------------------------------|
| 1 | `01-tokenizer.md`    | Tokenizer     | none (DOM token chips) |
| 2 | `02-embedding.md`    | Embedding     | `Scatter3D` (stub → real) |
| 3 | `03-order-shuffle.md`| Order Shuffle | none (DOM chips + bars) |
| 4 | `04-next-token.md`   | Next Token    | `Heatmap` (stub → real) |
| 5 | `05-rnn-viz.md`      | RNN Viz       | reuses `Heatmap` (extend, don't rebuild) |
| 6 | `06-transformer.md`  | Transformer   | `AttentionLines` (stub → real) |
| — | `validate.md`        | —             | consolidation / acceptance pass |

`LossCurve` is a `@camp/viz` stub but no Course 2 station needs it — leave it.

## Wave 2 — upgrades (after all six are built)

The `NNa`-suffixed prompts are a **second wave** run against the already-built,
already-merged stations. They add: **正體中文 (zh-TW)** UI copy, **bilingual
content** for tokenizer + embedding (real, large zh-TW data), and a **bbycroft-
style interactive** transformer. Same one-paste-per-session model; run **in this
order** (they share `cli.py` / `manifest.json` and each localizes its own station,
so sequential avoids collisions):

| order | Prompt | What it does |
|-------|--------|--------------|
| 1 | `00a-zh-tw-copy.md`          | UI chrome → zh-TW (shell + order-shuffle/next-token/rnn-viz). **No i18n lib** — direct copy. Establishes the glossary convention. |
| 2 | `01a-tokenizer-bilingual.md` | 中文 + English tokenization (content-language toggle, CJK 斷詞), localizes its own UI. |
| 3 | `02a-embedding-bilingual.md` | Real pretrained (**zh BGE**) vectors over a **large** zh-TW vocab + English, offline (GPU optional), per-language lazy load, localizes its own UI. |
| 4 | `06a-transformer-interactive.md` | Self-attention **step-through** modeled on `bbycroft/llm-viz` (subset only), localizes its own UI + commentary. |

**Touch-once rule:** `00a` localizes only the three stations no other wave-2
prompt rewrites; `01a`/`02a`/`06a` localize *their own* station (they add controls
that must be localized in the same pass). So every station is edited once.

**Two language axes** (don't conflate): **UI language** = static zh-TW chrome;
**content language** = a per-lesson 中文/English control over *what the student
analyzes* (only tokenizer + embedding). **GPU/Vercel:** all model-heavy work is
**offline precompute** (GPU optional); the runtime only fetches small JSON, so no
runtime GPU is needed. **License caveat:** `bbycroft/llm-viz` ships **no license**
(all-rights-reserved) — `06a` prefers a clean-room subset and flags "resolve
license before any public deploy." `validate.md` has a **Step 3.5** for wave 2.

## Wave 3 — real GPU models + typed input (after wave 2)

Now that every station is served by a real GPU (4× V100 prod / 1× 3090 dev) and
live inference is always on, wave 3 makes the models **real** and the interaction
**type-anything**, while cutting UI complexity. Two theme-based prompts; **run in
order** — R1 builds the shared GPU-status infra R2 reuses:

| order | Prompt | What it does |
|-------|--------|--------------|
| 1 | `R1-embedding-unified-space.md` | One shared multilingual embedding space (single `Qwen3-Embedding-0.6B`, zh+en in one cloud), always-embed any typed word, drop the language toggle. Builds the shared `@camp/data` `liveInferTimed` + `@camp/ui` `LiveStatus` (latency + fallback note). |
| 2 | `R2-real-models-live-gpu.md` | Replace the toy next-token/rnn/transformer/bag-of-words models with **real** on-device models (reusing `Qwen3-0.6B` where LM-shaped; a real trained tiny RNN otherwise), typed input everywhere, GPU latency note, simpler controls. |

**Key shift wave 3 introduces:** the earlier "live == precomputed *by
construction*" guarantee (both sides import the same deterministic function)
becomes "presets are **recorded real model outputs**" — precompute runs the real
model to bake the shipped artifacts; the server runs the same model + settings
for typed input; offline fallback stays honest. The GPU note surfaces **latency +
fallback transparency only** (no device badge, no fake spinner).

**`DESIGN.md`** is the shared visual language (the course deck's palette + the
`harrychang.me` editorial idioms). Every station follows it; session 1
(`01-tokenizer`) does the **one-time `@camp/ui` token retune** it describes
(near-black `#0A0A0A` surface, lime `#D6FB00` focus accent, cyan/purple
categoricals), and later sessions verify rather than redo it.

## Why sequential, not parallel

The six sessions are **not independent**. They share three files/surfaces and
will collide if run in parallel worktrees without reconciliation:

- **`packages/viz`** — stub primitives get fleshed out here. `Heatmap` is needed
  by both **04-next-token** and **05-rnn-viz**; 04 builds it, 05 extends it.
  Building it twice = two incompatible specs.
- **`precompute/src/camp_precompute/cli.py`** — every station adds a subcommand
  to the same file.
- **`apps/course2/public/data/course2/manifest.json`** — every station appends
  to the same `artifacts[]`.

Run them **one at a time**, in order. Each prompt has a **Prerequisites** block:
if the viz primitive it needs is still a stub, building it (in the package, not
the station) is part of that session; if a prior session already built it,
extend it, don't duplicate. That keeps each prompt runnable standalone *and*
correct in sequence. If you must parallelize, use separate worktrees and expect
to hand-merge `cli.py`, `manifest.json`, and `packages/viz`.

## The shared Definition of Done (every station)

Both the station prompts and `validate.md` check this **same** list. These come
straight from the repo's golden rules (`CLAUDE.md` → "DO NOT") and are meant to
be **objectively checkable**, not "does it look right":

1. **Data is precomputed and loaded, not hard-coded.** A subcommand in
   `cli.py` writes artifacts to `apps/course2/public/data/course2/<station>/`
   and lists them in `manifest.json` `artifacts[]`; the station loads them via
   `@camp/data` (`loadJSON` / `loadOnnxSession`) inside a `useEffect`.
2. **The browser never trains / does no heavy compute.** No training loops, no
   big datasets, no matrix math beyond light playback / small-ONNX inference.
3. **`three` / `onnxruntime-web` are never imported at module scope or during
   render** — lazy-imported inside an effect only. `loadOnnxSession` (already
   SSR-guarded) is called from an effect/handler and released on unmount.
4. **Package boundaries hold** — no `fetch` in `@camp/viz`, no canvas drawing in
   `@camp/ui`, no React in `@camp/data`, no lesson-specific copy/data in any
   shared package. Reusable viz → the package; lesson logic → the station.
5. **Controls drive the canvas via state** — controls' `onChange` update React
   state; the viz is a pure function of that state (the `reference.tsx`
   pattern). No imperative wiring.
6. **Green build:** `pnpm typecheck && pnpm lint && pnpm build` all pass.
7. **The route renders** at `/<station-id>` in `pnpm --filter @app/course2 dev`
   with no console errors, and delivers the station's **specific goal** (defined
   per-prompt).
8. **Follows the design language** in `prompts/DESIGN.md` — theme utilities only
   (no hard-coded hexes), mono/uppercase micro-labels, lime accent reserved for
   the focused/active element, viz colors from theme vars/props. The `@camp/ui`
   token retune is done once (session 1) and reused.

Each station prompt restates #7 as concrete, checkable, station-specific
criteria, and #8 as station-specific design notes. `validate.md` verifies 1–8
for all six.
