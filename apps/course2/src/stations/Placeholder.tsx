import { StationLayout } from "@camp/ui";

export interface PlaceholderProps {
  title: string;
  subtitle: string;
  /** The "wall" students hit that motivates this station's new concept. */
  goal: string;
  /** Bullet list of what a future agent should build here. */
  todo: string[];
}

/**
 * Shared placeholder body for the six Course 2 stations that aren't built yet.
 * NO real logic — it documents intent and points at the reference station.
 * Replace a station's body with a real implementation when you build it.
 */
export function Placeholder({ title, subtitle, goal, todo }: PlaceholderProps) {
  return (
    <StationLayout
      title={title}
      subtitle={subtitle}
      controls={
        <div className="text-sm text-muted">
          <p className="mb-1 font-medium text-fg">Controls</p>
          <p>Sliders / toggles that drive the canvas go here. None yet.</p>
        </div>
      }
      takeaway={
        <span className="text-muted">
          Placeholder — no lesson logic yet. Build from{" "}
          <code className="font-mono">/_reference</code>.
        </span>
      }
    >
      <div className="flex h-full flex-col gap-4">
        <div className="rounded-md border border-dashed border-border bg-panel p-4">
          <p className="font-mono text-xs uppercase tracking-wide text-accent">
            goal
          </p>
          <p className="mt-1 text-sm">{goal}</p>
        </div>
        <div className="rounded-md border border-border p-4">
          <p className="mb-2 text-sm font-medium">To build (future agent):</p>
          <ul className="list-inside list-disc space-y-1 text-sm text-muted">
            {todo.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      </div>
    </StationLayout>
  );
}
