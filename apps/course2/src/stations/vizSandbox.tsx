/**
 * VIZ SANDBOX (dev) — renders every @camp/viz primitive with mock data so
 * reviewers can eyeball them in one place, and probes @camp/data.loadManifest()
 * against the precompute output. Not a lesson.
 */
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  AttentionLines,
  Heatmap,
  LossCurve,
  Scatter2D,
  Scatter3D,
  VectorStrip,
  type ScatterPoint,
} from "@camp/viz";
import { loadManifest, type CourseManifest } from "@camp/data";

// --- mock data ---------------------------------------------------------------
const scatter2d: ScatterPoint[] = Array.from({ length: 60 }, (_, i) => {
  const t = (i / 60) * Math.PI * 2;
  const c = i % 4;
  return {
    x: Math.cos(t) * (1 + c) + c,
    y: Math.sin(t) * (1 + c),
    category: `c${c}`,
    label: `p${i}`,
  };
});

const scatter3d = Array.from({ length: 60 }, (_, i) => {
  const t = (i / 60) * Math.PI * 2;
  const c = i % 3;
  return { x: Math.cos(t) * 2, y: Math.sin(t) * 2, z: c, category: `c${c}` };
});

const tokens = ["The", "cat", "sat", "on", "the", "mat", "."];
const attention = tokens.map((_, i) =>
  tokens.map((_, j) => Math.max(0, 1 - Math.abs(i - j) * 0.25)),
);

const lossSeries = [
  { label: "train", values: Array.from({ length: 50 }, (_, i) => 2.5 * Math.exp(-i / 15) + 0.1) },
  { label: "val", values: Array.from({ length: 50 }, (_, i) => 2.5 * Math.exp(-i / 18) + 0.25) },
];

const matrix = Array.from({ length: 8 }, (_, r) =>
  Array.from({ length: 8 }, (_, c) => Math.sin(r * 0.6) * Math.cos(c * 0.6)),
);

// AttentionLines is interactive (hover a token → its links light up), so the
// sandbox drives focusToken from local state, mirroring the transformer station.
function AttentionLinesDemo() {
  const [focus, setFocus] = useState<number | null>(null);
  return (
    <AttentionLines
      tokens={tokens}
      weights={attention}
      focusToken={focus}
      onFocusToken={setFocus}
      height={220}
    />
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-mono text-sm font-semibold text-accent">{title}</h2>
      <div className="rounded-md border border-border bg-panel p-3">{children}</div>
    </section>
  );
}

// Proves @camp/data.loadManifest() reads the precompute output.
// Run `uv run camp-precompute make-data` first; otherwise this shows a hint.
function ManifestProbe() {
  const [manifest, setManifest] = useState<CourseManifest | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadManifest()
      .then((m) => alive && setManifest(m))
      .catch((e) => alive && setError(String(e)));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <Section title="@camp/data · loadManifest()">
      {manifest ? (
        <pre className="overflow-auto rounded bg-bg p-2 font-mono text-[11px] text-muted">
          {JSON.stringify(manifest, null, 2)}
        </pre>
      ) : error ? (
        <p className="text-sm text-warning">
          No manifest yet ({error}). Run{" "}
          <code className="font-mono">uv run camp-precompute make-data</code>.
        </p>
      ) : (
        <p className="text-sm text-muted">Loading manifest…</p>
      )}
    </Section>
  );
}

export function VizSandbox() {
  return (
    <div className="h-full overflow-auto p-6">
      <header className="mb-5">
        <h1 className="text-xl font-semibold">Viz sandbox</h1>
        <p className="text-sm text-muted">
          Every @camp/viz primitive with mock data. Stubs print the props they
          received.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Scatter2D (working)">
          <Scatter2D data={scatter2d} height={300} />
        </Section>
        <Section title="Scatter3D (stub)">
          <Scatter3D data={scatter3d} height={300} />
        </Section>
        <Section title="AttentionLines (working)">
          <AttentionLinesDemo />
        </Section>
        <Section title="LossCurve (stub)">
          <LossCurve series={lossSeries} height={260} />
        </Section>
        <Section title="Heatmap (stub)">
          <Heatmap matrix={matrix} height={300} />
        </Section>
        <Section title="VectorStrip (working)">
          <div className="flex flex-col gap-2">
            {[1, 0.55, 0.15].map((emphasis, r) => (
              <div key={r} className="flex items-center gap-3">
                <span className="w-24 font-mono text-[10px] uppercase tracking-wide text-muted">
                  emphasis {emphasis.toFixed(2)}
                </span>
                <VectorStrip
                  values={Array.from({ length: 8 }, (_, i) =>
                    Math.sin((i + 1) * (r + 1) * 0.7),
                  )}
                  maxAbs={1}
                  emphasis={emphasis}
                  highlight={r === 0}
                />
              </div>
            ))}
          </div>
        </Section>
        <ManifestProbe />
      </div>
    </div>
  );
}
