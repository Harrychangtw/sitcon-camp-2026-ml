# @camp/data

Loaders for the small artifacts the Python precompute pipeline exports into
`apps/<course>/public/data/<course>/`. The browser **reads** here — it never
trains or produces artifacts.

## Public API

```ts
import { loadJSON, loadManifest, loadOnnxSession } from "@camp/data";
```

| Export             | Status     | What it does                                                        |
| ------------------ | ---------- | ------------------------------------------------------------------ |
| `loadJSON<T>(url)` | ✅ working  | `fetch` + parse, throws on non-2xx. Unchecked `T` cast.            |
| `loadManifest()`   | ✅ working  | typed reader for `public/data/course2/manifest.json`.             |
| `loadOnnxSession(url)` | ✅ thin wrapper | SSR-guarded, lazy-imports onnxruntime-web, `wasm` backend.   |

`CourseManifest` / `ManifestArtifact` describe the manifest that
`uv run camp-precompute make-data` writes.

## Data flow

```
precompute (Python)  →  apps/<course>/public/data/<course>/{manifest.json, *.json, *.onnx}
                     →  station calls loadManifest() / loadJSON() / loadOnnxSession()
```

## SSR-safety

`loadOnnxSession` throws if called outside the browser and dynamically imports
onnxruntime-web, so it never lands in a server bundle. Call it from an effect or
event handler, never during render.

## What does NOT belong here

- **React components / hooks / rendering** → `@camp/ui` or `@camp/viz`.
- **The Python side that PRODUCES artifacts** → `precompute/`.
- **Station-specific parsing logic** → keep loaders generic; do shape-specific
  massaging in the station (or add a typed helper here only if reused widely).
