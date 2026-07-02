import type { ReactNode } from "react";

export interface StationLayoutProps {
  /** Station title, shown in the header. */
  title: string;
  /** Optional one-line framing of the problem the student is poking at. */
  subtitle?: string;
  /** Right-rail content: sliders, toggles, run buttons. Stacks below the canvas on mobile. */
  controls: ReactNode;
  /** The main interactive canvas (a @camp/viz primitive, usually). */
  children: ReactNode;
  /** Optional footer callout that names the lesson takeaway / the "wall" they just hit. */
  takeaway?: ReactNode;
  /**
   * Let the canvas fill the full width of the main area instead of the centered
   * `max-w-5xl` readable column. Use for full-bleed interactive canvases (e.g.
   * the embedding point cloud); leave off for text-heavy stations where a
   * capped reading width is easier on the eye.
   */
  fullBleed?: boolean;
}

/**
 * The canonical shell every station renders inside. Header + centered canvas +
 * a properties-panel-style control rail on the RIGHT + optional takeaway
 * footer. The canvas keeps the visual focus; controls read as a settings panel
 * (each top-level node in `controls` is one section, separated by hairlines).
 * Responsive: the rail stacks below the canvas on screens narrower than `md`.
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
  fullBleed = false,
}: StationLayoutProps) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-bg text-fg">
      <header className="shrink-0 border-b border-border px-5 py-4">
        <h1 className="text-lg font-semibold">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <main className="order-1 min-h-0 flex-1 overflow-auto p-5">
          {/* h-full so a station's `h-full`/`flex-1` canvas can size to the
              available height (fill mode). Short content still stacks from top.
              `fullBleed` drops the centered max-width so a canvas fills the whole
              main width; text stations keep the capped readable column. */}
          <div
            className={
              fullBleed ? "h-full w-full" : "mx-auto h-full max-w-5xl"
            }
          >
            {children}
          </div>
        </main>
        <aside className="order-2 shrink-0 border-t border-border bg-panel md:w-80 md:overflow-y-auto md:border-t-0 md:border-l">
          <div className="flex flex-col divide-y divide-border [&>*]:px-5 [&>*]:py-4">
            {controls}
          </div>
        </aside>
      </div>

      {takeaway ? (
        <footer className="shrink-0 border-t border-border bg-panel px-5 py-3 text-sm">
          <span className="mr-2 font-mono text-xs text-accent">重點</span>
          {takeaway}
        </footer>
      ) : null}
    </div>
  );
}
