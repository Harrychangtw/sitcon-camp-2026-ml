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

Each station prompt restates #7 as concrete, checkable, station-specific
criteria. `validate.md` verifies 1–7 for all six.
