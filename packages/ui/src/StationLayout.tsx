import type { ReactNode } from "react";

export interface StationLayoutProps {
  /** Station title, shown in the header. */
  title: string;
  /** Optional one-line framing of the problem the student is poking at. */
  subtitle?: string;
  /** Left rail content: sliders, toggles, run buttons. Stacks above the canvas on mobile. */
  controls: ReactNode;
  /** The main interactive canvas (a @camp/viz primitive, usually). */
  children: ReactNode;
  /** Optional footer callout that names the lesson takeaway / the "wall" they just hit. */
  takeaway?: ReactNode;
}

/**
 * The canonical shell every station renders inside. Header + left control rail +
 * main canvas + optional takeaway footer. Responsive: the rail collapses above
 * the canvas on screens narrower than `md`.
 *
 * It owns layout only — no station state. State lives in the station component
 * (see apps/course2/src/stations/_reference for the pattern).
 */
export function StationLayout({
  title,
  subtitle,
  controls,
  children,
  takeaway,
}: StationLayoutProps) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-bg text-fg">
      <header className="shrink-0 border-b border-border px-5 py-4">
        <h1 className="text-lg font-semibold">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside className="shrink-0 border-b border-border p-4 md:w-72 md:overflow-y-auto md:border-b-0 md:border-r">
          <div className="flex flex-col gap-5">{controls}</div>
        </aside>
        <main className="min-h-0 flex-1 overflow-auto p-4">{children}</main>
      </div>

      {takeaway ? (
        <footer className="shrink-0 border-t border-border bg-panel px-5 py-3 text-sm">
          <span className="mr-2 font-mono text-xs uppercase tracking-wide text-accent">
            takeaway
          </span>
          {takeaway}
        </footer>
      ) : null}
    </div>
  );
}
