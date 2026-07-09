import { useMemo, useRef, useState } from "react";
import { extent, scaleLinear } from "d3";
import { useResizeObserver } from "./useResizeObserver";
import {
  categoryColorMap,
  hexCategoryColorMap,
  rgbCss,
  useThemeColors,
  type RGB,
} from "./theme";

export interface ScatterPoint {
  x: number;
  y: number;
  /** Optional category, used by color-by. */
  category?: string;
  /** Optional label shown on hover (falls back to coordinates). Also the id
   *  matched against `highlight`. */
  label?: string;
}

export interface Scatter2DProps {
  data: ScatterPoint[];
  /** Color points by their `category` field. Default true. */
  colorBy?: boolean;
  /** Explicit `category → #hex` palette. When given (and `colorBy`), points are
   * colored from it instead of the theme's categorical ramp, so a host-rendered
   * legend can match the plot exactly. Unmapped categories fall back to muted. */
  categoryColors?: Record<string, string>;
  /**
   * Labels to spotlight as the neighbour set (white); everything else is dimmed.
   * When empty/omitted, no point is "hot". Precedence: focus > highlight >
   * category > greyscale base.
   */
  highlight?: string[];
  /** The single "query" label, drawn in the primary lime accent so it stands
   * apart from its `highlight` neighbours. */
  focus?: string;
  /** Pixel height; width is responsive to the container. Default 360. Ignored when `fill`. */
  height?: number;
  /** Fill the parent's height instead of using `height` (parent must size it). */
  fill?: boolean;
  /**
   * TODO(lasso): when lasso selection lands, this fires with the points inside
   * the drawn region. The hook is wired now so stations can depend on the
   * signature; the lasso interaction itself is not implemented yet.
   */
  onSelect?: (selected: ScatterPoint[]) => void;
  /** Fires with the active point's `label` (or null when cleared). Driven by
   * mouse hover on desktop and by tap-to-pin on touch: a tap pins the nearest
   * point, tapping it again or tapping empty space clears it. Lets the host
   * treat the active point as a query, highlight its neighbours, etc. */
  onHover?: (label: string | null) => void;
}

const MARGIN = { top: 16, right: 16, bottom: 24, left: 32 };

// Tap targeting: a tap pins the nearest point within this pixel radius, so a
// finger never has to land exactly on a 4px circle.
const TAP_RADIUS = 24;
// Pointer travel (px) between down and up beyond which the gesture reads as a
// drag or scroll, not a tap.
const TAP_SLOP = 8;

function domainOf(values: number[]): [number, number] {
  const ext = extent(values);
  const min = ext[0] ?? 0;
  const max = ext[1] ?? 1;
  if (min === max) return [min - 1, max + 1];
  const pad = (max - min) * 0.05;
  return [min - pad, max + pad];
}

/**
 * A responsive 2D scatter plot (d3 scales + React-rendered SVG, so it is
 * SSR-safe — d3 is used only for pure scale math, never DOM mutation).
 * Colors come from the @camp/ui theme (no hard-coded hues): a quiet greyscale
 * field, cyan/purple for categories, lime for the highlighted set.
 *
 * Interaction: mouse hover highlights transiently; on touch a tap pins the
 * nearest point (same `onHover` callback), and tapping it again or tapping
 * empty space clears the pin. While pinned, hover cannot override it.
 *
 * Lasso selection is stubbed; see the `onSelect` prop and the TODO above.
 */
export function Scatter2D({
  data,
  colorBy = true,
  categoryColors,
  highlight,
  focus,
  height = 360,
  fill = false,
  onSelect,
  onHover,
}: Scatter2DProps) {
  const { ref, size } = useResizeObserver<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  // Tap-to-pin selection (touch has no hover). A pin outranks hover and only
  // clears when the same point, or empty space, is tapped again.
  const [pinned, setPinned] = useState<number | null>(null);
  // Where the pointer went down, to tell taps from drags/scrolls on pointerup.
  const pointerDown = useRef<{ x: number; y: number } | null>(null);
  const colors = useThemeColors();
  const width = size.width;
  // In fill mode the parent controls height; otherwise use the fixed prop.
  const h = fill ? size.height : height;

  // onSelect is reserved for the lasso hook (not yet implemented). Referenced
  // here so the wiring is visible and intentional to future implementers.
  void onSelect;

  const highlightSet = useMemo(() => new Set(highlight ?? []), [highlight]);
  const hasHighlight = highlightSet.size > 0;

  const { xScale, yScale, catColors } = useMemo(() => {
    const innerRight = Math.max(width - MARGIN.right, MARGIN.left + 1);
    const xScale = scaleLinear()
      .domain(domainOf(data.map((d) => d.x)))
      .range([MARGIN.left, innerRight]);
    const yScale = scaleLinear()
      .domain(domainOf(data.map((d) => d.y)))
      .range([h - MARGIN.bottom, MARGIN.top]);
    const catColors = categoryColors
      ? hexCategoryColorMap(colors, categoryColors)
      : categoryColorMap(
          colors,
          Array.from(new Set(data.map((d) => d.category ?? "•"))),
        );
    return { xScale, yScale, catColors };
  }, [data, width, h, colors, categoryColors]);

  const activeIndex = pinned ?? hover;
  const active = activeIndex !== null ? data[activeIndex] : undefined;

  // Tooltip position, clamped inside the container so a long label near an
  // edge never overflows (a phone-width plot has almost no slack on the right).
  // 10px monospace runs ~6px per character; close enough without measuring.
  let tooltip: { text: string; x: number; y: number } | null = null;
  if (active) {
    const text =
      active.label ?? `(${active.x.toFixed(2)}, ${active.y.toFixed(2)})`;
    const estWidth = text.length * 6;
    tooltip = {
      text,
      x: Math.max(Math.min(xScale(active.x) + 8, width - estWidth - 2), 2),
      y: Math.max(yScale(active.y) - 8, 12),
    };
  }

  /** Toggle the pin from a tap at container-relative pixel coordinates. */
  function tapAt(px: number, py: number) {
    // Nearest point within TAP_RADIUS, NOT a strict hit on the tiny circle.
    let best: number | null = null;
    let bestDist = TAP_RADIUS;
    for (let i = 0; i < data.length; i++) {
      const d = data[i];
      if (!d) continue;
      const dist = Math.hypot(xScale(d.x) - px, yScale(d.y) - py);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    }
    if (best === null || best === pinned) {
      // Empty space, or the already-pinned point: clear the pin.
      if (pinned !== null) {
        setPinned(null);
        setHover(null);
        onHover?.(null);
      }
      return;
    }
    setPinned(best);
    setHover(null);
    onHover?.(data[best]?.label ?? null);
  }

  // Fill + opacity for a point, honoring focus > highlight > category > grey.
  function styleFor(d: ScatterPoint): { fill: RGB; opacity: number } {
    if (d.label != null && d.label === focus)
      return { fill: colors.accent, opacity: 1 };
    const isNeighbor = hasHighlight && d.label != null && highlightSet.has(d.label);
    if (isNeighbor) return { fill: colors.fg, opacity: 1 };
    const base: RGB = colorBy
      ? catColors.get(d.category ?? "•") ?? colors.muted
      : colors.muted;
    // Dim everything that isn't the focused set when a highlight is active.
    return { fill: base, opacity: hasHighlight ? 0.18 : 0.85 };
  }

  return (
    <div
      ref={ref}
      className={fill ? "relative h-full w-full" : "relative w-full"}
      style={fill ? undefined : { height }}
    >
      {width > 0 && h > 0 ? (
        <svg
          width={width}
          height={h}
          role="img"
          aria-label="2D scatter plot"
          onPointerDown={(e) => {
            pointerDown.current = { x: e.clientX, y: e.clientY };
          }}
          onPointerUp={(e) => {
            const down = pointerDown.current;
            pointerDown.current = null;
            if (!down) return;
            if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > TAP_SLOP)
              return;
            const rect = e.currentTarget.getBoundingClientRect();
            tapAt(e.clientX - rect.left, e.clientY - rect.top);
          }}
        >
          {data.map((d, i) => {
            const isFocus = d.label != null && d.label === focus;
            const isNeighbor =
              hasHighlight && d.label != null && highlightSet.has(d.label);
            const { fill, opacity } = styleFor(d);
            return (
              <circle
                key={i}
                cx={xScale(d.x)}
                cy={yScale(d.y)}
                r={isFocus ? 7 : activeIndex === i ? 6 : isNeighbor ? 5 : 4}
                fill={rgbCss(fill)}
                fillOpacity={opacity}
                className="stroke-bg"
                strokeWidth={1}
                // Mouse-only hover: a touch tap fires pointerenter too (and
                // synthetic mouse events after it), but taps belong to the
                // svg's pin handler, and a pin must not be overridden here.
                onPointerEnter={(e) => {
                  if (e.pointerType !== "mouse" || pinned !== null) return;
                  setHover(i);
                  onHover?.(d.label ?? null);
                }}
                onPointerLeave={(e) => {
                  if (e.pointerType !== "mouse" || pinned !== null) return;
                  setHover(null);
                  onHover?.(null);
                }}
              />
            );
          })}
          {tooltip ? (
            <text
              x={tooltip.x}
              y={tooltip.y}
              className="fill-fg font-mono text-[10px]"
            >
              {tooltip.text}
            </text>
          ) : null}
        </svg>
      ) : null}
    </div>
  );
}
