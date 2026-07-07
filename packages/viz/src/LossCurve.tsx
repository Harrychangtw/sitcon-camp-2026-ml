import { useMemo } from "react";
import { scaleLinear } from "d3";
import { useResizeObserver } from "./useResizeObserver";
import { categoryColorMap, rgbCss, useThemeColors } from "./theme";

export interface LossSeries {
  label: string;
  /** Metric value per training step (loss, return, accuracy…). */
  values: number[];
}

export interface LossCurveProps {
  series: LossSeries[];
  /** x-axis label. Default "step". */
  xLabel?: string;
  /** Pixel height; width is responsive. Default 280. */
  height?: number;
  /**
   * Replay the curve only up to this index, so a RunButton beat can "animate"
   * precomputed training. Default: show the whole curve.
   */
  upTo?: number;
  /**
   * Optional shared x coordinates, aligned with every series' `values`
   * (e.g. real training step counts instead of 0..n-1 indices). Series may be
   * shorter than `xs`; extra xs are ignored per series.
   */
  xs?: number[];
}

const MARGIN = { top: 12, right: 12, bottom: 26, left: 44 };

/** ~4 clean axis ticks across a domain. */
function ticksFor(domain: [number, number], count = 4): number[] {
  return scaleLinear().domain(domain).nice(count).ticks(count);
}

function formatTick(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${v / 1_000_000}M`;
  if (abs >= 1_000) return `${v / 1_000}k`;
  if (abs >= 100 || v === Math.round(v)) return String(Math.round(v));
  return v.toFixed(abs >= 1 ? 1 : 2);
}

/**
 * A responsive line chart of a precomputed training metric (d3 scales +
 * React-rendered SVG, so it is SSR-safe — d3 does pure scale math only).
 * Supports incremental replay via `upTo` to dramatize the "model is training"
 * beat: the visible prefix of each curve, with a marker dot on the current
 * point. Colors follow the theme's categorical ramp; legend from labels.
 */
export function LossCurve({
  series,
  xLabel = "step",
  height = 280,
  upTo,
  xs,
}: LossCurveProps) {
  const { ref, size } = useResizeObserver<HTMLDivElement>();
  const colors = useThemeColors();
  const width = size.width;

  const maxLen = useMemo(
    () => series.reduce((m, s) => Math.max(m, s.values.length), 0),
    [series],
  );
  const cut = upTo === undefined ? maxLen - 1 : Math.max(0, Math.min(upTo, maxLen - 1));

  const { xScale, yScale, seriesColors } = useMemo(() => {
    const xOf = (i: number) => (xs ? xs[i] ?? i : i);
    let yMin = Infinity;
    let yMax = -Infinity;
    for (const s of series) {
      for (const v of s.values) {
        if (v < yMin) yMin = v;
        if (v > yMax) yMax = v;
      }
    }
    if (!Number.isFinite(yMin)) {
      yMin = 0;
      yMax = 1;
    }
    if (yMin === yMax) {
      yMin -= 1;
      yMax += 1;
    }
    const yPad = (yMax - yMin) * 0.08;
    const xScale = scaleLinear()
      .domain([xOf(0), xOf(Math.max(maxLen - 1, 1))])
      .range([MARGIN.left, Math.max(width - MARGIN.right, MARGIN.left + 1)]);
    const yScale = scaleLinear()
      .domain([yMin - yPad, yMax + yPad])
      .range([height - MARGIN.bottom, MARGIN.top]);
    const seriesColors = categoryColorMap(
      colors,
      series.map((s) => s.label),
    );
    return { xScale, yScale, seriesColors };
  }, [series, xs, maxLen, width, height, colors]);

  const xOf = (i: number) => (xs ? xs[i] ?? i : i);

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {width > 0 ? (
        <svg width={width} height={height} role="img" aria-label="training curve">
          {/* Axes + gridlines */}
          {ticksFor(yScale.domain() as [number, number]).map((t) => (
            <g key={`y-${t}`}>
              <line
                x1={MARGIN.left}
                x2={width - MARGIN.right}
                y1={yScale(t)}
                y2={yScale(t)}
                stroke={rgbCss(colors.border, 0.35)}
              />
              <text
                x={MARGIN.left - 6}
                y={yScale(t)}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-muted font-mono text-[10px]"
              >
                {formatTick(t)}
              </text>
            </g>
          ))}
          {ticksFor(xScale.domain() as [number, number]).map((t) => (
            <text
              key={`x-${t}`}
              x={xScale(t)}
              y={height - MARGIN.bottom + 14}
              textAnchor="middle"
              className="fill-muted font-mono text-[10px]"
            >
              {formatTick(t)}
            </text>
          ))}
          <text
            x={width - MARGIN.right}
            y={height - 4}
            textAnchor="end"
            className="fill-muted font-mono text-[10px]"
          >
            {xLabel}
          </text>

          {/* One path per series, trimmed to the replay cut. */}
          {series.map((s) => {
            const color = seriesColors.get(s.label) ?? colors.fg;
            const last = Math.min(cut, s.values.length - 1);
            if (last < 0) return null;
            let d = "";
            for (let i = 0; i <= last; i++) {
              const px = xScale(xOf(i));
              const py = yScale(s.values[i] ?? 0);
              d += i === 0 ? `M${px},${py}` : `L${px},${py}`;
            }
            return (
              <g key={s.label}>
                <path
                  d={d}
                  fill="none"
                  stroke={rgbCss(color)}
                  strokeWidth={1.8}
                  strokeLinejoin="round"
                />
                {/* Current-point marker — the replay "cursor". */}
                <circle
                  cx={xScale(xOf(last))}
                  cy={yScale(s.values[last] ?? 0)}
                  r={3.5}
                  fill={rgbCss(color)}
                  className="stroke-bg"
                  strokeWidth={1.5}
                />
              </g>
            );
          })}
        </svg>
      ) : null}

      {/* Legend (skip when there's a single unlabeled-ish series). */}
      {series.length > 1 ? (
        <div className="pointer-events-none absolute right-3 top-2 flex flex-col gap-0.5 rounded bg-bg/70 px-2 py-1">
          {series.map((s) => (
            <div key={s.label} className="flex items-center gap-1.5">
              <span
                className="h-0.5 w-3.5 rounded-full"
                style={{
                  backgroundColor: rgbCss(seriesColors.get(s.label) ?? colors.fg),
                }}
              />
              <span className="font-mono text-[10px] text-muted">{s.label}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
