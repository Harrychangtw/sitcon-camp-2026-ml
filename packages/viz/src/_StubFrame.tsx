// Internal helper shared by the not-yet-implemented viz primitives. It renders
// a clearly-marked placeholder that prints the props the component received, so
// reviewers in /viz-sandbox can confirm wiring before the real render exists.
// NOT exported from the package index.

function safeStringify(value: unknown): string {
  return JSON.stringify(
    value,
    (_key, val) => {
      if (typeof val === "function") return "[function]";
      // Keep arrays readable in the placeholder; show shape, not 10k numbers.
      if (Array.isArray(val) && val.length > 12) {
        return `[${val.length} items] ${JSON.stringify(val.slice(0, 4))}…`;
      }
      return val;
    },
    2,
  );
}

export interface StubFrameProps {
  /** Component display name, e.g. "Heatmap". */
  name: string;
  /** One line on what the real implementation should draw. */
  summary: string;
  /** The props received, echoed back for inspection. */
  props: Record<string, unknown>;
  height?: number;
}

export function StubFrame({ name, summary, props, height = 360 }: StubFrameProps) {
  return (
    <div
      className="flex w-full flex-col gap-2 overflow-auto rounded-md border border-dashed border-border bg-panel p-4 text-sm"
      style={{ minHeight: height }}
    >
      <div className="flex items-center gap-2">
        <span className="rounded bg-warning/20 px-1.5 py-0.5 font-mono text-[10px] uppercase text-warning">
          stub
        </span>
        <span className="font-medium">{name}</span>
      </div>
      <p className="text-muted">{summary}</p>
      <pre className="mt-1 overflow-auto rounded bg-bg p-2 font-mono text-[11px] leading-relaxed text-muted">
        {safeStringify(props)}
      </pre>
    </div>
  );
}
