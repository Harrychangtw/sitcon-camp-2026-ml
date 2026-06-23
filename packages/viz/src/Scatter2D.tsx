import { useMemo, useState } from "react";
import { extent, scaleLinear, scaleOrdinal, schemeCategory10 } from "d3";
import { useResizeObserver } from "./useResizeObserver";

export interface ScatterPoint {
  x: number;
  y: number;
  /** Optional category, used by color-by. */
  category?: string;
  /** Optional label shown on hover (falls back to coordinates). */
  label?: string;
}

export interface Scatter2DProps {
  data: ScatterPoint[];
  /** Color points by their `category` field. Default true. */
  colorBy?: boolean;
  /** Pixel height; width is responsive to the container. Default 360. */
  height?: number;
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
 * Supports color-by-category and a hover label.
 *
 * Lasso selection is stubbed; see the `onSelect` prop and the TODO above.
 */
export function Scatter2D({
  data,
  colorBy = true,
  height = 360,
  onSelect,
}: Scatter2DProps) {
  const { ref, size } = useResizeObserver<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const width = size.width;

  // onSelect is reserved for the lasso hook (not yet implemented). Referenced
  // here so the wiring is visible and intentional to future implementers.
  void onSelect;

  const { xScale, yScale, color } = useMemo(() => {
    const innerRight = Math.max(width - MARGIN.right, MARGIN.left + 1);
    const xScale = scaleLinear()
      .domain(domainOf(data.map((d) => d.x)))
      .range([MARGIN.left, innerRight]);
    const yScale = scaleLinear()
      .domain(domainOf(data.map((d) => d.y)))
      .range([height - MARGIN.bottom, MARGIN.top]);
    const categories = Array.from(new Set(data.map((d) => d.category ?? "•")));
    const color = scaleOrdinal<string, string>()
      .domain(categories)
      .range(schemeCategory10 as unknown as string[]);
    return { xScale, yScale, color };
  }, [data, width, height]);

  const hovered = hover !== null ? data[hover] : undefined;

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {width > 0 ? (
        <svg width={width} height={height} role="img" aria-label="2D scatter plot">
          {data.map((d, i) => (
            <circle
              key={i}
              cx={xScale(d.x)}
              cy={yScale(d.y)}
              r={hover === i ? 6 : 4}
              fill={colorBy ? color(d.category ?? "•") : undefined}
              className={colorBy ? "stroke-bg" : "fill-accent stroke-bg"}
              fillOpacity={0.85}
              strokeWidth={1}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            />
          ))}
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
