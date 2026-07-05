import { createContext, useContext, type ReactNode } from "react";

/**
 * Optional app-provided renderer for the header's top-left title area. Lets an
 * app swap the plain `<h1>` for something richer (e.g. a station-navigation
 * dropdown) without `@camp/ui` knowing anything about routing or the station
 * list. It receives the station `title` so the app can render it as the label.
 */
export type StationHeaderTitleRenderer = (title: string) => ReactNode;

const HeaderTitleContext = createContext<StationHeaderTitleRenderer | null>(
  null,
);

/**
 * Wrap the routed app in this to have every `StationLayout` render `render(title)`
 * in place of its default `<h1>`. Without a provider, `StationLayout` falls back
 * to the plain title, so the component stays usable standalone.
 */
export function StationHeaderTitleProvider({
  render,
  children,
}: {
  render: StationHeaderTitleRenderer;
  children: ReactNode;
}) {
  return (
    <HeaderTitleContext.Provider value={render}>
      {children}
    </HeaderTitleContext.Provider>
  );
}

export interface StationLayoutProps {
  /** Station title, shown in the header. */
  title: string;
  /**
   * Optional one-line framing of the problem. Currently NOT rendered — the
   * header is a compact floating island with just the title/nav. Kept so
   * stations can carry this copy without a breaking change.
   */
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
  const renderTitle = useContext(HeaderTitleContext);
  return (
    <div className="flex h-full min-h-0 flex-col bg-bg text-fg">
      {/* No spanning header bar: the title/nav floats as an island at top-left.
          `subtitle` is intentionally not rendered here (kept on the type so
          stations can still pass framing copy without a breaking change). */}
      <header className="shrink-0 px-4 pt-4">
        {renderTitle ? (
          renderTitle(title)
        ) : (
          <h1 className="text-lg font-semibold">{title}</h1>
        )}
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
