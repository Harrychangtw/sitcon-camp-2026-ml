// Landing page + station index. Server component (no client interactivity).
//
// The station apps are SEPARATE Vite apps on their own origin/port, so links
// into them are plain <a> tags, not next/link. In dev, course2 runs on :5173
// (start everything with `pnpm dev`). Override via NEXT_PUBLIC_COURSE2_URL.

const COURSE2_BASE =
  process.env.NEXT_PUBLIC_COURSE2_URL ?? "http://localhost:5173";

interface StationLink {
  id: string;
  title: string;
  blurb: string;
  /** Developer-only route, marked distinctly in the index. */
  dev?: boolean;
}

const course2Stations: StationLink[] = [
  { id: "tokenizer", title: "Tokenizer", blurb: "How raw text becomes tokens." },
  { id: "embedding", title: "Embedding", blurb: "Tokens become vectors with meaning." },
  { id: "order-shuffle", title: "Order Shuffle", blurb: "Why word order matters (bag-of-words breaks)." },
  { id: "next-token", title: "Next Token", blurb: "Framing language as next-token prediction." },
  { id: "rnn-viz", title: "RNN Viz", blurb: "Carrying state across a sequence." },
  { id: "transformer", title: "Transformer", blurb: "Attention: every token sees every token." },
  { id: "_reference", title: "Reference Station", blurb: "Developer template — copy me.", dev: true },
  { id: "viz-sandbox", title: "Viz Sandbox", blurb: "Every @camp/viz primitive with mock data.", dev: true },
];

function StationCard({ base, station }: { base: string; station: StationLink }) {
  return (
    <a
      href={`${base}/${station.id}`}
      className="block rounded-lg border border-border bg-panel p-4 transition-colors hover:border-accent"
    >
      <div className="flex items-center gap-2">
        <span className="font-medium">{station.title}</span>
        {station.dev ? (
          <span className="rounded bg-warning/20 px-1.5 py-0.5 font-mono text-[10px] uppercase text-warning">
            dev
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-sm text-muted">{station.blurb}</p>
    </a>
  );
}

export default function HomePage() {
  return (
    <div className="flex flex-col gap-12">
      <section className="flex flex-col gap-4">
        <h1 className="text-3xl font-bold tracking-tight">
          Machine Learning, by poking at it
        </h1>
        <p className="max-w-2xl text-muted">
          The interactive web &ldquo;stations&rdquo; for SITCON Camp 2026&rsquo;s
          Machine Learning curriculum — a Taiwanese summer camp for
          high-schoolers. The pedagogy is a <strong>loop</strong>: give students
          a problem, let them poke at it, hit a wall, introduce a new
          tool/concept, repeat. Each station is a heavy, client-only interactive
          canvas.
        </p>
        <p className="max-w-2xl text-sm text-muted">
          Heavy compute (training models) happens <strong>ahead of time</strong>{" "}
          in a Python precompute pipeline that exports small artifacts (ONNX
          models, JSON). The browser only plays them back or runs light
          inference — it never trains.
        </p>
      </section>

      <section id="stations" className="flex flex-col gap-6">
        <h2 className="text-xl font-semibold">Courses &amp; stations</h2>

        <div className="rounded-lg border border-border p-5">
          <div className="mb-1 flex items-baseline justify-between">
            <h3 className="text-lg font-semibold">
              Course 2 · Model architecture evolution
            </h3>
            <span className="font-mono text-xs text-muted">MLP → RNN → Transformer</span>
          </div>
          <p className="mb-4 text-sm text-muted">
            Built first. Open a station below (course2 dev server must be running).
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {course2Stations.map((s) => (
              <StationCard key={s.id} base={COURSE2_BASE} station={s} />
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-dashed border-border p-5 text-sm text-muted">
          <h3 className="mb-1 text-lg font-semibold text-fg">
            Course 1 &amp; Course 3
          </h3>
          <p>
            Not built yet. Course 1 will use the reserved{" "}
            <code className="font-mono">/api/synthetic</code> backend in this
            shell (currently returns 501).
          </p>
        </div>
      </section>
    </div>
  );
}
