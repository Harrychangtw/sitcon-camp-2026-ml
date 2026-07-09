# CLAUDE.md

Guidance for Claude Code (and any agent) working in this repo. Read this first.

## What this repo is

The interactive web **"artifacts" (stations)** for SITCON Camp 2026's Machine
Learning curriculum — a Taiwanese summer camp for high-schoolers. There are
three courses; **Course 2** ("model architecture evolution: MLP → RNN →
Transformer") is built first.

**The loop pedagogy:** teaching runs as a loop — give students a problem, let
them poke at an interactive canvas, hit a wall, introduce a new tool/concept,
repeat. Each station is one heavy, client-only interactive canvas (d3 /
three.js / in-browser ONNX inference) that makes one idea concrete.

## The golden rule: the browser never trains

Heavy compute (training models) happens **ahead of time** in the Python
`precompute/` pipeline, which exports **small** artifacts (ONNX models, JSON)
into `apps/<course>/public/data/<course>/`. The web apps **load and play back**
those artifacts, or run **light** inference on small ONNX models. No training,
no big datasets, in the browser.

**The one scoped exception:** the `pixel-shuffle` station trains its two toy
MLPs live in the browser — only in a **Web Worker**, only at toy scale
(≤ ~2,200 tiny images, ≤ ~1 M params) — because the lesson re-enacts the
morning class's own in-browser trainer; replaying a baked curve would gut it.
Its dataset pack and permutation are still precomputed artifacts shipped via
`manifest.json`. No other station may cite this exception.

## Stack and why

| Piece | Tech | Why |
| ----- | ---- | --- |
| Monorepo | pnpm workspaces + Turborepo | Share `ui`/`viz`/`data` across ~15 stations; one install, one lint/typecheck/build graph. |
| Shell app (`apps/shell`) | **Next.js** (App Router, TS) | Landing + station index + nav, and a reserved server API route for Course 1's synthetic-data backend. SSR/server routes are a feature here. |
| Station apps (`apps/course2`) | **Vite** + React + TS | Stations are client-only canvases; SSR just fights `window`/three/onnx. Vite serves the `@camp/*` packages straight from TS source. |
| Styling | Tailwind in both apps | Both consume the **same** theme tokens from `@camp/ui` (CSS vars + a shared preset). |
| Precompute | **uv**-managed Python (`camp_precompute`) | Does the heavy work offline; exports small artifacts. |

**SSR-safety:** `three` and `onnxruntime-web` touch `window`/WebGL/wasm. They
must be **lazy-imported inside effects** and never run during render or SSR.
`@camp/data`'s `loadOnnxSession` already guards this; `@camp/viz` primitives must
too.

## Directory map

```
apps/
  shell/        Next.js: landing, station index, nav, /api/synthetic (501 stub)
  course2/      Vite: sidebar router, 6 placeholder stations, /_reference, /viz-sandbox
packages/
  ui/           @camp/ui   — StationLayout + controls + theme tokens/preset
  viz/          @camp/viz  — Scatter2D (real) + Scatter3D/AttentionLines/LossCurve/Heatmap (stubs)
  data/         @camp/data — loadJSON / loadManifest / loadOnnxSession
  tsconfig/     @camp/tsconfig — shared strict TS bases
precompute/     uv project; `camp-precompute make-data` writes the Course 2 manifest
docs/           architecture.md, adding-a-station.md
```

## Commands

```bash
corepack enable                 # one-time: turn on the pinned pnpm
pnpm install                    # install the whole workspace

pnpm dev                        # shell (:3000, auto-increments if busy) + course2 (:5173)
pnpm build                      # build both apps (turbo)
pnpm typecheck                  # tsc --noEmit across all packages/apps
pnpm lint                       # ESLint across the workspace

pnpm --filter @app/shell dev    # just the shell
pnpm --filter @app/course2 dev  # just course2

cd precompute && uv sync        # set up the Python venv
uv run camp-precompute make-data  # write apps/course2/public/data/course2/manifest.json
```

## Package boundaries (what goes where)

- **`@camp/ui`** — layout, controls, buttons, theme. Generic, reusable, SSR-safe.
  NO viz/canvas drawing, NO data fetching.
- **`@camp/viz`** — visualization primitives that take data via props. Client-only,
  resize-aware. NO controls, NO hard-coded lesson data.
- **`@camp/data`** — loaders for precomputed artifacts. NO React, NO components.
- **An app / station** — the only place lesson-specific logic and hard-coded
  copy live. Stations compose `ui` + `viz` + `data`.

If a thing is reused by ≥2 stations and is generic → push it into a package. If
it's specific to one lesson → keep it in the station.

## DO NOT

- ❌ **Don't train or run heavy compute in the browser.** Precompute it; ship a
  small artifact. (Sole carve-out: the pixel-shuffle station — see the golden
  rule above.)
- ❌ **Don't cross package boundaries** (e.g. fetch in `@camp/viz`, draw SVG in
  `@camp/ui`, import React in `@camp/data`).
- ❌ **Don't import `three`/`onnxruntime-web` without a client guard** —
  lazy-import inside an effect; never at module scope or during render.
- ❌ **Don't commit large binaries.** `*.onnx`/`*.bin` under `public/data` are
  gitignored; commit only small JSON manifests.
- ❌ **Don't put real station logic in the shared packages.** Build a station by
  copying `apps/course2/src/stations/reference.tsx`.
