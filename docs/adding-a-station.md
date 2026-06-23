# Adding a station

A recipe for adding (or filling in) a Course 2 station. The canonical template is
**`apps/course2/src/stations/reference.tsx`** (route `/_reference`) — open it
alongside this guide; it's heavily commented and demonstrates every pattern.

> Filling in one of the six existing placeholders? Skip step 1 — the file and
> registry entry already exist. Just replace the placeholder body (steps 3–5).

## 1. Create the station component

Copy the reference station and rename it:

```bash
cp apps/course2/src/stations/reference.tsx apps/course2/src/stations/myStation.tsx
```

Rename the exported component (e.g. `ReferenceStation` → `MyStation`). Keep the
shape: a single component that owns its state and renders a `StationLayout`.

## 2. Register it (route + sidebar in one place)

Edit `apps/course2/src/stations/registry.tsx`:

```tsx
import { MyStation } from "./myStation";

export const stations: StationMeta[] = [
  // ...existing entries (order = teaching order)...
  { id: "my-station", title: "My Station", blurb: "One-line hook",
    group: "lesson", element: <MyStation /> },
];
```

- `id` becomes the route (`/my-station`) **and** the sidebar entry — you don't
  touch the router or the sidebar separately; both are generated from this list.
- `group: "lesson"` shows it as a real lesson; `group: "dev"` marks it as a
  developer tool (like `/_reference` and `/viz-sandbox`).

## 3. Build the UI from the shared packages

- Layout + controls from **`@camp/ui`**: `StationLayout`, `LabeledSlider`,
  `Toggle`, `SegmentedControl`, `RunButton`.
- Canvas from **`@camp/viz`**: `Scatter2D` works today; `Scatter3D`,
  `AttentionLines`, `LossCurve`, `Heatmap` are stubs — flesh them out in the
  package (not in the station) so other stations benefit.
- **State lives in the station.** Controls' `onChange` update state; the viz is a
  pure function of that state. No imperative wiring.

## 4. Add precompute output (if the station needs data)

The browser never trains — load precomputed artifacts.

1. Add a subcommand (or extend `make-data`) in
   `precompute/src/camp_precompute/cli.py` that writes your artifacts into
   `apps/course2/public/data/course2/<my-station>/` and lists them in
   `manifest.json` (`artifacts[]`).
2. Regenerate: `cd precompute && uv run camp-precompute make-data`.
3. Load it in the station (inside an effect):

   ```tsx
   import { loadJSON } from "@camp/data";
   useEffect(() => {
     let alive = true;
     loadJSON<MyShape>("/data/course2/my-station/data.json")
       .then((d) => { if (alive) setData(d); });
     return () => { alive = false; };
   }, []);
   ```

   `public/` is served at the web root, so the on-disk path
   `apps/course2/public/data/course2/my-station/data.json` is fetched from
   `/data/course2/my-station/data.json`.

- Commit small JSON. **Do not** commit `*.onnx`/`*.bin` (gitignored) — ship them
  via deploy/storage.

## 5. SSR-safety checklist

Course 2 is a client-only Vite app, but these rules keep the shared `@camp/viz`
primitives portable and bug-free:

- [ ] No `window`/`document`/WebGL access during render — only inside `useEffect`.
- [ ] `three` and `onnxruntime-web` are **lazy-imported inside an effect**
      (`const THREE = await import("three")`), never at module scope.
- [ ] `loadOnnxSession` (which is already SSR-guarded) is called from an effect or
      event handler, and the session is released on unmount.
- [ ] The viz renders nothing meaningful until it has measured its container
      (`useResizeObserver` returns `0` width first) — guard on that.

## 6. Verify

```bash
pnpm --filter @app/course2 dev   # open http://localhost:5173/my-station
pnpm typecheck && pnpm lint      # keep both green
```

Add it to the inventory table in `docs/architecture.md` if it's a new lesson.
