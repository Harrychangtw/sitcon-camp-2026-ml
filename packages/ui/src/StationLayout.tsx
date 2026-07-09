import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

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
 * Remembers each station's collapse choice for the dock across station
 * switches within a visit (keyed by title; no persistence needed).
 */
const dockOpenByStation = new Map<string, boolean>();

/**
 * The canonical shell every station renders inside. The canvas fills the whole
 * area; two floating islands sit over it: the title/nav with its 重點 info badge
 * (top-left, the badge expands on hover or tap), and a bottom dock holding the
 * primary `input` (left) and `controls` (right). On phones (< md) the dock is a
 * full-width bottom sheet: input stacked above controls, capped height with
 * inner scroll. A handle bar collapses/expands the dock on every device.
 *
 * The layout publishes the dock's real occluded height as `--dock-h` on its
 * root element (measured with a ResizeObserver): stations use it to keep
 * bottom-anchored content clear of the dock.
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
  const hasDock = Boolean(input || controls);

  const rootRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);

  const [dockOpen, setDockOpen] = useState(
    () => dockOpenByStation.get(title) ?? true,
  );
  const toggleDock = () =>
    setDockOpen((v) => {
      dockOpenByStation.set(title, !v);
      return !v;
    });

  // 重點 panel: hover keeps working on hover-capable devices (pure CSS below),
  // and this state gives touch (and keyboards) a real toggle. Closes on
  // outside tap and Escape.
  const [takeawayOpen, setTakeawayOpen] = useState(false);
  const takeawayRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!takeawayOpen) return;
    const onDown = (e: PointerEvent) => {
      if (takeawayRef.current && !takeawayRef.current.contains(e.target as Node))
        setTakeawayOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setTakeawayOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [takeawayOpen]);

  // Publish the dock's occluded height (dock top to viewport bottom) as
  // --dock-h. Measured off the untransformed wrapper so the dock-in animation
  // (a transform on the island) can't skew the number.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const dock = dockRef.current;
    if (!dock) {
      root.style.setProperty("--dock-h", "0px");
      return;
    }
    const update = () => {
      const occluded =
        root.getBoundingClientRect().bottom - dock.getBoundingClientRect().top;
      root.style.setProperty("--dock-h", `${Math.max(0, Math.ceil(occluded))}px`);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(dock);
    ro.observe(root);
    return () => ro.disconnect();
  }, [hasDock, dockOpen]);

  return (
    <div
      ref={rootRef}
      className="relative flex h-full min-h-0 flex-col overflow-hidden bg-bg text-fg"
    >
      {/* Top scrim — a top-to-bottom fade of the page background that lifts the
          title (and the top-right readout) off a busy canvas. Sits ABOVE the
          canvas (z-10) but BELOW the top-right readout island (z-20) and the
          title/nav island (z-50), so both read crisply on top of it.
          pointer-events-none so it never eats canvas interaction. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-44 bg-gradient-to-b from-bg/60 via-bg/25 to-transparent" />

      {/* Title / nav island — top-left, floating over the canvas. The 重點 info
          button sits just to the right of the title: grayed by default, neon on
          hover, and the takeaway panel opens on hover (hover-capable devices)
          or tap (everywhere). `subtitle` isn't rendered. */}
      <div className="pointer-events-none absolute left-4 top-4 z-50 flex items-center gap-2 [&>*]:pointer-events-auto">
        {renderTitle ? (
          renderTitle(title)
        ) : (
          <h1 className="text-lg font-semibold">{title}</h1>
        )}
        {takeaway ? (
          <div ref={takeawayRef} className="group relative">
            <button
              type="button"
              aria-label="重點"
              aria-expanded={takeawayOpen}
              onClick={() => setTakeawayOpen((v) => !v)}
              // after: extends the hit area to ~44px without growing the glyph.
              className={`relative flex h-6 w-6 items-center justify-center transition-colors after:absolute after:-inset-2.5 after:content-[''] hover:text-accent ${
                takeawayOpen ? "text-accent" : "text-muted"
              }`}
            >
              <svg
                viewBox="0 0 24 24"
                className="h-3.5 w-3.5"
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
            <div
              className={`absolute left-0 top-full mt-2 w-max max-w-[min(28rem,calc(100vw-2rem))] rounded-md border border-border bg-panel px-4 py-3 text-sm shadow-md transition-all duration-150 ${
                takeawayOpen
                  ? "pointer-events-auto translate-y-0 opacity-100"
                  : "pointer-events-none -translate-y-1 opacity-0 [@media(hover:hover)]:group-hover:pointer-events-auto [@media(hover:hover)]:group-hover:translate-y-0 [@media(hover:hover)]:group-hover:opacity-100"
              }`}
            >
              <div className="mb-1.5 font-mono text-sm font-semibold text-accent">
                重點
              </div>
              {takeaway}
            </div>
          </div>
        ) : null}
      </div>

      {/* Canvas. Full-bleed canvases span edge to edge and the dock floats
          over them; otherwise the bottom padding tracks the dock's measured
          height so scrollable content is never buried under it. */}
      <main
        className={`relative min-h-0 flex-1 overflow-auto ${
          fullBleed ? "" : "p-5"
        }`}
        style={
          fullBleed
            ? undefined
            : { paddingBottom: "calc(var(--dock-h, 7rem) + 1.5rem)" }
        }
      >
        <div
          className={fullBleed ? "h-full w-full" : "mx-auto h-full max-w-5xl"}
        >
          {children}
        </div>
      </main>

      {/* Bottom dock. < md: a full-width bottom sheet (handle on top, input
          stacked above controls, capped height with inner scroll, safe-area
          padded). >= md: the floating island (input left, controls right) with
          a slim collapse handle above the body. */}
      {hasDock ? (
        <div
          ref={dockRef}
          className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex justify-center md:bottom-4 md:px-4"
        >
          <div className="pointer-events-auto flex w-full flex-col rounded-t-2xl border-t border-border bg-panel shadow-lg motion-reduce:animate-none md:w-auto md:max-w-[min(64rem,calc(100vw-2rem))] md:animate-dock-in md:rounded-[18px] md:border">
            <button
              type="button"
              aria-expanded={dockOpen}
              aria-label={dockOpen ? "收合控制" : "展開控制"}
              onClick={toggleDock}
              className="flex min-h-[2.75rem] w-full items-center justify-center gap-1.5 font-mono text-[11px] uppercase tracking-wide text-muted transition-colors hover:text-fg md:min-h-0 md:py-1"
            >
              <svg
                viewBox="0 0 24 24"
                className={`h-3 w-3 transition-transform duration-200 ${
                  dockOpen ? "" : "rotate-180"
                }`}
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
              <span>控制</span>
            </button>
            <div
              className={`${
                dockOpen ? "flex" : "hidden"
              } max-h-[42dvh] flex-col items-stretch gap-3 overflow-y-auto px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-0.5 md:max-h-none md:flex-row md:gap-4 md:overflow-visible md:pb-3 md:pt-0`}
            >
              {input ? (
                <div className="flex min-w-0 items-stretch">{input}</div>
              ) : null}
              {input && controls ? (
                <div className="hidden w-px shrink-0 self-stretch bg-border md:block" />
              ) : null}
              {controls ? (
                // Top-aligned so a grown (multi-line) input doesn't drag the
                // controls down the dock; wraps so mid-width laptops still fit.
                <div className="flex w-full min-w-0 flex-col gap-4 md:w-auto md:flex-row md:flex-wrap md:items-start md:gap-x-5 md:gap-y-2">
                  {controls}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
