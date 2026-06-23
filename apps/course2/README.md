# @app/course2

The Course 2 interactive stations: **model architecture evolution — MLP → RNN →
Transformer**. A Vite + React client-only app (no SSR) with an internal router
and a sidebar station switcher.

## Run

```bash
pnpm --filter @app/course2 dev    # http://localhost:5173
```

## Structure

```
src/
  main.tsx              entry; imports @camp/ui/theme.css + index.css
  App.tsx               BrowserRouter + sidebar; routes are generated from the registry
  components/Sidebar.tsx
  stations/
    registry.tsx        ← single source of truth (route + sidebar entry per station)
    Placeholder.tsx     shared body for the six not-yet-built stations
    tokenizer.tsx … transformer.tsx   the six placeholders
    reference.tsx       /_reference — the worked example to copy (READ THIS)
    vizSandbox.tsx      /viz-sandbox — every @camp/viz primitive + loadManifest probe
public/data/course2/    precompute output lands here (manifest.json, *.json, *.onnx)
```

## Adding a station

See `docs/adding-a-station.md`. Short version: copy `stations/reference.tsx`,
register it in `stations/registry.tsx`, drop precompute output in
`public/data/course2/<station>/`.

## Rules

- Client-only. It's fine to use `window`/three/onnx here, but still guard them
  to effects (and lazy-import three/onnx) so shared @camp/viz primitives stay
  portable.
- The browser never trains — load precomputed artifacts via `@camp/data`.
