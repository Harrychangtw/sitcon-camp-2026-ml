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
  /**
   * Primary input zone: the LEFT half of the bottom-center dock. Optional — the
   * one field students type into (a search box / prompt). Readouts and rich
   * lists do NOT go here; keep this to the single primary input.
   */
  input?: ReactNode;
  /** Controls: the RIGHT half of the bottom-center dock — sliders, toggles, run buttons. */
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
 * The canonical shell every station renders inside. The canvas fills the whole
 * area; three floating islands sit over it: the title/nav (top-left), the 重點
 * info badge (top-right, expands on hover), and a bottom-center dock holding the
 * primary `input` (left) and `controls` (right). Only controls live in the dock;
 * rich readouts belong on the canvas, placed by the station.
 *
 * It owns layout only — no station state. State lives in the station component
 * (see apps/course2/src/stations/_reference for the pattern).
 */
export function StationLayout({
  title,
  controls,
  input,
  children,
  takeaway,
  fullBleed = false,
}: StationLayoutProps) {
  const renderTitle = useContext(HeaderTitleContext);
  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-bg text-fg">
      {/* Title / nav island — top-left, floating over the canvas. */}
      <div className="pointer-events-none absolute left-4 top-4 z-40 [&>*]:pointer-events-auto">
        {renderTitle ? (
          renderTitle(title)
        ) : (
          <h1 className="text-lg font-semibold">{title}</h1>
        )}
      </div>

      {/* 重點 info badge — top-right corner. Grayed by default, neon on hover;
          hovering reveals the takeaway panel (opens downward). Pure CSS, no
          state, SSR-safe. `subtitle` is intentionally not rendered. */}
      {takeaway ? (
        <div className="group absolute right-4 top-4 z-50">
          <button
            type="button"
            aria-label="重點"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-panel text-muted shadow-sm transition-all hover:border-accent hover:text-accent hover:shadow-[0_0_12px] hover:shadow-accent/60"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
          </button>
          <div className="pointer-events-none absolute right-0 top-full mt-2 w-max max-w-md -translate-y-1 rounded-md border border-border bg-panel px-4 py-3 text-sm opacity-0 shadow-md transition-all duration-150 group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100">
            <div className="mb-1.5 font-mono text-sm font-semibold text-accent">
              重點
            </div>
            {takeaway}
          </div>
        </div>
      ) : null}

      {/* Canvas. `pb-28` keeps scrollable content clear of the bottom dock;
          full-bleed canvases size to `h-full` and the dock floats over them. */}
      <main className="relative min-h-0 flex-1 overflow-auto p-5 pb-28">
        <div
          className={fullBleed ? "h-full w-full" : "mx-auto h-full max-w-5xl"}
        >
          {children}
        </div>
      </main>

      {/* Bottom-center dock: input (left) · controls (right). */}
      {input || controls ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-4 z-30 flex justify-center px-4">
          <div className="pointer-events-auto flex max-w-full items-stretch gap-4 rounded-[18px] bg-panel/90 p-3 shadow-lg backdrop-blur">
            {input ? (
              <div className="flex shrink-0 items-stretch">{input}</div>
            ) : null}
            {input && controls ? (
              <div className="w-px shrink-0 self-stretch bg-border" />
            ) : null}
            {controls ? (
              // Top-aligned so a grown (multi-line) input doesn't drag the
              // controls down the dock.
              <div className="flex items-start gap-x-5 gap-y-2">{controls}</div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
