/**
 * REFERENCE STATION — the canonical example every Course 2 station copies.
 * Route: /_reference (sidebar group "Developer", clearly marked as a reference,
 * not a real lesson).
 *
 * Read this top-to-bottom. It demonstrates the four things every station needs:
 *
 *   1. WHERE STATE LIVES — plain React state in this component. Controls are
 *      controlled inputs; the canvas is a pure function of that state.
 *   2. HOW CONTROLS DRIVE THE CANVAS — a control's onChange updates state →
 *      React re-renders → the viz re-reads its props. No imperative wiring.
 *   3. HOW TO LOAD PRECOMPUTED DATA — via @camp/data inside an effect (shown
 *      commented out below). This reference uses MOCK data so it has no
 *      precompute dependency and always renders.
 *   4. SSR-SAFETY — this is a Vite (client-only) app, but the rule still binds
 *      every shared @camp/viz primitive: never touch window / three / onnx
 *      during render; do it inside an effect, and lazy-import heavy engines.
 *
 * To make a new station: copy this file, rename the component, swap the mock
 * data for a real @camp/data load, register it in stations/registry.tsx.
 */
import { useMemo, useState } from "react";
import {
  LabeledSlider,
  RunButton,
  SegmentedControl,
  StationLayout,
  Toggle,
} from "@camp/ui";
import { Scatter2D, type ScatterPoint } from "@camp/viz";
// import { loadJSON } from "@camp/data"; // ← real stations load artifacts (see effect below)

type Palette = "blobs" | "rings";

// --- MOCK DATA ---------------------------------------------------------------
// A real station would NOT hard-code this. It would load points from
// public/data/course2/<station>/*.json (written by the precompute pipeline).
// Deterministic mock data keeps this reference self-contained and dependency-free.
function makeMockPoints(count: number, palette: Palette): ScatterPoint[] {
  const pts: ScatterPoint[] = [];
  for (let i = 0; i < count; i++) {
    const t = (i / count) * Math.PI * 2;
    const cluster = i % 3;
    if (palette === "rings") {
      const r = 1 + cluster;
      pts.push({
        x: Math.cos(t) * r,
        y: Math.sin(t) * r,
        category: `ring ${cluster}`,
        label: `#${i}`,
      });
    } else {
      pts.push({
        x: cluster * 3 + Math.cos(t * 7),
        y: Math.sin(t * 11),
        category: `blob ${cluster}`,
        label: `#${i}`,
      });
    }
  }
  return pts;
}

export function ReferenceStation() {
  // 1. STATE — everything the canvas needs is plain component state.
  const [count, setCount] = useState(120);
  const [colorBy, setColorBy] = useState(true);
  const [palette, setPalette] = useState<Palette>("blobs");
  // `generation` is bumped by the RunButton to recompute — it dramatizes the
  // "compute is happening" beat even though this is instant mock data.
  const [generation, setGeneration] = useState(0);

  // 2. DERIVED CANVAS DATA — a pure, memoized function of state.
  // `generation` is in the deps on purpose: bumping it via the RunButton forces
  // a recompute even when the other inputs are unchanged.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const points = useMemo(() => makeMockPoints(count, palette), [
    count,
    palette,
    generation,
  ]);

  // 3. LOADING REAL DATA (what a real station does instead of the mock above):
  //
  //   const [points, setPoints] = useState<ScatterPoint[]>([]);
  //   useEffect(() => {
  //     let alive = true;
  //     loadJSON<ScatterPoint[]>("/data/course2/_reference/points.json")
  //       .then((data) => { if (alive) setPoints(data); });
  //     return () => { alive = false; };
  //   }, []);
  //
  // For light ONNX inference, call loadOnnxSession(...) inside the effect too —
  // it is SSR-guarded and lazy-imports the runtime, so it never runs at render.

  return (
    <StationLayout
      title="Reference Station (copy me)"
      subtitle="Developer reference — not a lesson. The canonical pattern every station follows."
      controls={
        <>
          <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-xs text-warning">
            Developer template, not a real station. Copy this file to start a new
            one.
          </div>

          {/* Each control's onChange updates state (pattern #2). */}
          <SegmentedControl<Palette>
            label="Dataset"
            value={palette}
            onChange={setPalette}
            options={[
              { label: "Blobs", value: "blobs" },
              { label: "Rings", value: "rings" },
            ]}
          />
          <LabeledSlider
            label="Points"
            min={30}
            max={300}
            step={10}
            value={count}
            onChange={setCount}
            format={(v) => `${v}`}
          />
          <Toggle
            label="Color by cluster"
            checked={colorBy}
            onChange={setColorBy}
          />
          <RunButton
            label="Recompute"
            runningLabel="Sampling…"
            durationMs={600}
            onRun={() => setGeneration((g) => g + 1)}
          />
        </>
      }
      takeaway={
        <span>
          Controls update state → the canvas re-reads its props. That is the
          whole station pattern.
        </span>
      }
    >
      <div className="flex h-full flex-col gap-3">
        <p className="text-sm text-muted">
          {points.length} mock points. Hover a point for its label. The{" "}
          <span className="font-mono">Recompute</span> button shows the fake
          &ldquo;compute is happening&rdquo; beat.
        </p>
        <div className="min-h-0 flex-1">
          <Scatter2D data={points} colorBy={colorBy} height={420} />
        </div>
      </div>
    </StationLayout>
  );
}
