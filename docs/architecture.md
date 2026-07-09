# Architecture

## Why a monorepo

The curriculum will grow to **~15 stations** across three courses. Stations are
different lessons but share a lot of machinery:

- the same **station shell + controls + theme** (`@camp/ui`),
- the same **visualization primitives** — scatter plots, attention links, loss
  curves, heatmaps (`@camp/viz`),
- the same way of **loading precomputed artifacts** (`@camp/data`).

A monorepo lets all stations share one copy of that machinery with one install,
one type system, and one lint/build graph (Turborepo). Internal packages are
consumed as **TypeScript source** (no per-package build step): Next transpiles
them via `transpilePackages`, and Vite resolves them straight from `src`.

### Escape hatch (read this before adding packages)

The shared packages exist to avoid duplication across many stations. If, as the
project matures, a package stays **thin** (one or two trivial exports) or only
ever has a single consumer, **collapse it** back into the app that uses it. The
monorepo should stay shallow and approachable — don't add packages speculatively.
The bar for a shared package is: _generic and reused by ≥2 stations._

## The data flow

The browser never trains. All heavy compute is offline, in Python:

```
┌──────────────────────┐   uv run camp-precompute <cmd>
│  precompute/ (Python) │   trains / exports small models + JSON
└───────────┬──────────┘
            │ writes
            ▼
  apps/<course>/public/data/<course>/
    manifest.json          ← index of artifacts (always committed; small)
    *.json                 ← small data artifacts (committed)
    *.onnx, *.bin          ← models / binaries (gitignored; shipped via deploy)
            │ served at  /data/<course>/...
            ▼
┌──────────────────────┐   @camp/data
│  station (browser)    │   loadManifest()  → discover artifacts
│                       │   loadJSON<T>()   → read a JSON artifact
│                       │   loadOnnxSession()→ light inference on a small model
└──────────────────────┘
```

A station renders with `@camp/ui` (`StationLayout` + controls) and `@camp/viz`
(canvas primitives), driven by plain React state. Controls update state → the
viz re-reads its props. See `apps/course2/src/stations/reference.tsx`.

## Apps

- **`apps/shell` (Next.js, App Router).** The front door: landing page, station
  index that links into each course app, and top nav. Owns the reserved
  `/api/synthetic` server route for **Course 1**'s synthetic-data backend
  (currently a 501 stub). SSR/server routes are wanted here.
- **`apps/course2` (Vite, React).** The Course 2 stations. Client-only — stations
  are heavy interactive canvases and SSR only fights `window`/three/onnx. An
  internal router + sidebar switches between stations registered in one place
  (`src/stations/registry.tsx`).

Why two different frameworks: the shell benefits from SSR and a server route;
the stations are pure client canvases that are simpler and faster under Vite.

## Shared packages

| Package | Responsibility | Never contains |
| ------- | -------------- | -------------- |
| `@camp/ui` | layout, controls, theme tokens/preset | viz drawing, data fetching |
| `@camp/viz` | client-only viz primitives (props in, pixels out) | controls, lesson data |
| `@camp/data` | loaders for precomputed artifacts | React, components |
| `@camp/tsconfig` | shared strict TS bases | runtime code |

## Course & station inventory

| Course | Title | Status | Stations |
| ------ | ----- | ------ | -------- |
| 1 | (synthetic-data course) | not built | backend reserved at shell `/api/synthetic` (501) |
| 2 | Model architecture evolution: MLP → RNN → Transformer | **in progress** | `tokenizer`, `embedding`, `pixel-shuffle`, `next-token`, `rnn-viz`, `transformer`, `rl-playground` + dev: `/order-shuffle` (demoted 2026-07, URL-reachable for instructors), `/_reference`, `/viz-sandbox` |
| 3 | TBD | not built | `rl-playground` (the §3-3 RL demo) ships early as Course 2's station 7: PPO policies trained offline (`camp-precompute train-rl` / `rl-export`) — the forager by **self-play** against frozen copies of itself, with an egocentric opponent obs block (in race mode the human IS the perceived opponent) — replayed live in-browser on a parity-locked env (`apps/course2/src/stations/rl/`); the training-progress ladder is ordered by measured head-to-head strength |

Course 2's lesson order (`tokenizer → … → transformer`) is the teaching arc and
is encoded by the order of entries in `apps/course2/src/stations/registry.tsx`.

## Theming

`@camp/ui` is the single source of truth for design tokens:

- `@camp/ui/theme.css` defines `--camp-*` CSS variables (light + `.dark`), with
  colors stored as RGB channels so Tailwind opacity modifiers work.
- `@camp/ui/tailwind-preset` maps Tailwind color/font names onto those vars.

Both apps import the CSS once and add the preset to their `tailwind.config`, so a
class like `bg-panel` means the same thing everywhere. Dark mode is class-based
(`<html class="dark">`).
