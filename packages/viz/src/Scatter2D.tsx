import { useMemo, useState } from "react";
import { extent, scaleLinear } from "d3";
import { useResizeObserver } from "./useResizeObserver";
import {
  categoryColorMap,
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
  /**
   * Labels to spotlight in the focus accent (lime); everything else is dimmed.
   * When empty/omitted, no point is "hot". Precedence: highlight > category >
   * greyscale base.
   */
  highlight?: string[];
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
}

const MARGIN = { top: 16, right: 16, bottom: 24, left: 32 };

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
 * Lasso selection is stubbed; see the `onSelect` prop and the TODO above.
 */
export function Scatter2D({
  data,
  colorBy = true,
  highlight,
  height = 360,
  fill = false,
  onSelect,
}: Scatter2DProps) {
  const { ref, size } = useResizeObserver<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
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
    const categories = Array.from(new Set(data.map((d) => d.category ?? "•")));
    const catColors = categoryColorMap(colors, categories);
    return { xScale, yScale, catColors };
  }, [data, width, h, colors]);

  const hovered = hover !== null ? data[hover] : undefined;

  // Fill + opacity for a point, honoring highlight > category > grey precedence.
  function styleFor(d: ScatterPoint): { fill: RGB; opacity: number } {
    const isHot = hasHighlight && d.label != null && highlightSet.has(d.label);
    if (isHot) return { fill: colors.accent, opacity: 1 };
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
        <svg width={width} height={h} role="img" aria-label="2D scatter plot">
          {data.map((d, i) => {
            const isHot =
              hasHighlight && d.label != null && highlightSet.has(d.label);
            const { fill, opacity } = styleFor(d);
            return (
              <circle
                key={i}
                cx={xScale(d.x)}
                cy={yScale(d.y)}
                r={hover === i ? 6 : isHot ? 5 : 4}
                fill={rgbCss(fill)}
                fillOpacity={opacity}
                className="stroke-bg"
                strokeWidth={1}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              />
            );
          })}
          {hovered ? (
            <text
              x={xScale(hovered.x) + 8}
              y={yScale(hovered.y) - 8}
              className="fill-fg font-mono text-[10px]"
            >
              {hovered.label ??
                `(${hovered.x.toFixed(2)}, ${hovered.y.toFixed(2)})`}
            </text>
          ) : null}
        </svg>
      ) : null}
    </div>
  );
}
