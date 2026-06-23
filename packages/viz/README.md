# @camp/viz

Shared visualization primitives. **Client-only** — every primitive is
resize-aware and must be safe to import without touching `window` at module
scope. The heavy ones lazy-import their engine (three/onnx) inside effects.

## Public API

```ts
import {
  Scatter2D,
  Scatter3D,
  AttentionLines,
  LossCurve,
  Heatmap,
  useResizeObserver,
} from "@camp/viz";
```

| Export            | Status                | Real version draws…                                  |
| ----------------- | --------------------- | ---------------------------------------------------- |
| `Scatter2D`       | ✅ working (d3)        | points, color-by-category, hover label. Lasso = TODO. |
| `Scatter3D`       | 🚧 stub                | three.js rotatable 3D point cloud (lazy-imported).   |
| `AttentionLines`  | 🚧 stub                | SVG curved links between tokens, opacity ∝ weight.   |
| `LossCurve`       | 🚧 stub                | d3 line chart of precomputed loss, replay via `upTo`. |
| `Heatmap`         | 🚧 stub                | d3 color-scaled grid for matrices.                   |
| `useResizeObserver` | ✅ working            | container measurement helper.                        |

Stubs render a placeholder that prints the props they received (see
`/viz-sandbox` in course2). Each stub file has a docstring describing the real
implementation and its SSR rules. Flesh them out in place; keep the prop
signatures stable so stations don't break.

## SSR-safety contract (read before adding a primitive)

- No DOM / `window` / WebGL access at module scope or during render — only
  inside `useEffect`.
- d3 is fine for **scale math** (pure functions) during render; never use it to
  mutate the DOM imperatively in a way that fights React.
- `three` / `onnxruntime-web` must be `await import(...)`-ed inside an effect and
  added as a dependency of THIS package only when you implement that primitive.

## What does NOT belong here

- **Controls / layout / buttons** → `@camp/ui`.
- **Data fetching / model loading** → `@camp/data`.
- **Station-specific logic or hard-coded lesson data** → the station component.
  Primitives take data via props and stay dataset-agnostic.
