# SITCON Camp 2026 · Machine Learning stations

Interactive web "stations" for the SITCON Camp 2026 Machine Learning curriculum
(a Taiwanese summer camp for high-schoolers). Students learn by **poking at**
interactive canvases — give them a problem, let them hit a wall, introduce the
next idea, repeat.

Heavy compute happens **ahead of time** in a Python pipeline that exports small
artifacts; the browser only plays them back or runs light inference. **It never
trains.**

Course 2 (MLP → RNN → Transformer) is built first. See [`CLAUDE.md`](./CLAUDE.md)
for the architecture in brief and [`docs/`](./docs) for the details.

## Prerequisites

- **Node 20+** — `.nvmrc` pins 20. With nvm: `nvm install && nvm use`.
- **pnpm** via **Corepack** (bundled with Node): `corepack enable`. The exact
  pnpm version is pinned in `package.json` (`packageManager`).
- **[uv](https://docs.astral.sh/uv/)** for the Python precompute pipeline.

## Quickstart

```bash
corepack enable     # one-time
pnpm install
pnpm dev            # boots the shell + Course 2 together
```

- **Shell** (landing + station index): http://localhost:3000
  (auto-increments to 3001+ if 3000 is taken — watch the terminal).
- **Course 2** (the stations): http://localhost:5173
  - `/_reference` — the worked example every station copies.
  - `/viz-sandbox` — every viz primitive with mock data.

The shell's station index links into the Course 2 app at `:5173`. Override with
`NEXT_PUBLIC_COURSE2_URL` if you run it elsewhere.

## Running the pieces individually

```bash
pnpm --filter @app/shell dev      # Next.js shell only
pnpm --filter @app/course2 dev    # Vite Course 2 app only

# Precompute (Python):
cd precompute
uv sync                           # create .venv + install deps
uv run camp-precompute make-data  # writes the Course 2 data manifest
```

## How data flows to a station

```
precompute (Python)
  └─ uv run camp-precompute make-data
       └─ writes → apps/course2/public/data/course2/manifest.json (+ future *.json, *.onnx)
            └─ a station loads it in the browser via @camp/data:
                 loadManifest()            → the index of artifacts
                 loadJSON<T>(url)          → a JSON artifact
                 loadOnnxSession(url)      → a small ONNX model (light inference)
```

Vite serves `public/` at the web root, so a file at
`apps/course2/public/data/course2/manifest.json` is fetched from
`/data/course2/manifest.json`. You can see this live in `/viz-sandbox` (it calls
`loadManifest()` and prints the result).

## Quality gates

```bash
pnpm typecheck    # strict TS, no emit, across the workspace
pnpm lint         # ESLint (flat config) across the workspace
pnpm build        # production build of both apps
```

## Deploying

- **`apps/course2`** is a static SPA: `pnpm --filter @app/course2 build` →
  serve `apps/course2/dist/` from any static host. Because it uses client-side
  routing, configure the host to fall back to `index.html` for unknown paths.
  Large `*.onnx`/`*.bin` artifacts are gitignored — ship them with the deploy
  (or from object storage), not via git.
- **`apps/shell`** is Next.js: `pnpm --filter @app/shell build` then
  `pnpm --filter @app/shell start` (it has the `/api/synthetic` server route, so
  it needs a Node host — or use a Next-aware platform). Point
  `NEXT_PUBLIC_COURSE2_URL` at the deployed Course 2 origin.

## Repo layout

```
apps/        shell (Next.js) + course2 (Vite)
packages/    @camp/ui, @camp/viz, @camp/data, @camp/tsconfig
precompute/  uv project (camp-precompute CLI)
docs/        architecture.md, adding-a-station.md
```
