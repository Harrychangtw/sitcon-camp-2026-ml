import { useMemo, useState } from "react";
import { useResizeObserver } from "./useResizeObserver";
import { mix, rgbCss, useThemeColors } from "./theme";

export interface HeatmapProps {
  /** Row-major matrix, `matrix[row][col]`. Ragged rows are padded as empty. */
  matrix: number[][];
  rowLabels?: string[];
  colLabels?: string[];
  /**
   * Fix the color domain. When omitted it is taken from the data extent. Pass
   * an explicit domain to keep the scale stable while values animate.
   */
  min?: number;
  max?: number;
  /** Render each cell's value inside it (good for small grids). Default false. */
  showValues?: boolean;
  /** Format a value for the in-cell text and hover readout. Default 2 d.p. */
  format?: (value: number) => string;
  /**
   * Highlight the single largest cell in full accent (the "focused" mark, per
   * the design language). Default true. Ignored in `diverging` mode.
   */
  highlightMax?: boolean;
  /**
   * Mark one column as the focused/active step: a lime outline around the whole
   * column and its label in accent (see DESIGN.md — lime = the thing under
   * attention). Station 05 passes the current RNN timestep here. Out-of-range or
   * omitted → no column mark.
   */
  highlightCol?: number;
  /**
   * Encode SIGNED values on a restrained diverging scale (purple ↔ grey ↔ lime,
   * from theme vars) instead of the single-hue opacity ramp. The domain is made
   * symmetric about 0 so zero always reads as grey. Use for hidden-state
   * activations and other ±-valued grids (see DESIGN.md).
   */
  diverging?: boolean;
  /** Pixel height; width is responsive. Default 360. */
  height?: number;
  /**
   * Notify the owner when the hovered cell changes (`null` when the pointer
   * leaves the grid). Lets a station cross-highlight the row/col elsewhere on
   * its canvas; the primitive itself stays a pure function of props.
   */
  onHoverCell?: (cell: { row: number; col: number } | null) => void;
  /**
   * Mark one cell as the focused/active one: a lime outline on the cell and
   * its row + column labels in accent (the crosshair). Owned by the station
   * (usually fed back from `onHoverCell`). Out-of-range or null → no mark.
   */
  activeCell?: { row: number; col: number } | null;
  /**
   * Stroke class for the active-cell outline. Defaults to the lime accent mark;
   * a station whose cross-highlight elsewhere is a different color (e.g. white)
   * can override it here to match. Does not affect the active row/col labels.
   */
  activeCellStrokeClass?: string;
}

const GAP = 2;
const MIN_OPACITY = 0.06;

function defaultFormat(v: number): string {
  return Number.isFinite(v) ? v.toFixed(2) : "—";
}

/**
 * A responsive heatmap. In the default single-hue mode each cell is an
 * accent-filled `<rect>` whose OPACITY encodes magnitude (near-transparent →
 * solid), so the color reads from the theme's `--camp-accent` — no hard-coded
 * hues (see DESIGN.md); the largest cell renders at full opacity as the focused
 * mark. In `diverging` mode the fill encodes sign on a purple ↔ grey ↔ lime
 * scale read from the theme, for ±-valued grids like RNN hidden states.
 *
 * General M×N grid API: pass any matrix plus optional row/col labels. Station 04
 * feeds it a 1×N probability row; station 05 feeds it multi-row hidden-state
 * activations and marks the active timestep with `highlightCol`.
 *
 * SSR-safe: theme colors come from `useThemeColors` (falls back to the canonical
 * palette until the client effect reads the real vars); layout is plain
 * arithmetic and the grid is React-rendered SVG. Nothing touches `window` during
 * render.
 */
export function Heatmap({
  matrix,
  rowLabels,
  colLabels,
  min,
  max,
  showValues = false,
  format = defaultFormat,
  highlightMax = true,
  highlightCol,
  diverging = false,
  height = 360,
  onHoverCell,
  activeCell,
  activeCellStrokeClass = "stroke-accent",
}: HeatmapProps) {
  const { ref, size } = useResizeObserver<HTMLDivElement>();
  const [hover, setHover] = useState<{ r: number; c: number } | null>(null);
  const theme = useThemeColors();
  const width = size.width;

  const rows = matrix.length;
  const cols = matrix.reduce((m, row) => Math.max(m, row.length), 0);

  const { domainMin, domainMax, maxCell } = useMemo(() => {
    let lo = min ?? Infinity;
    let hi = max ?? -Infinity;
    let mCell = { r: -1, c: -1, v: -Infinity };
    for (let r = 0; r < rows; r++) {
      const row = matrix[r] ?? [];
      for (let c = 0; c < cols; c++) {
        const v = row[c];
        if (v === undefined || !Number.isFinite(v)) continue;
        if (min === undefined && v < lo) lo = v;
        if (max === undefined && v > hi) hi = v;
        if (v > mCell.v) mCell = { r, c, v };
      }
    }
    if (!Number.isFinite(lo)) lo = 0;
    if (!Number.isFinite(hi)) hi = 1;
    return { domainMin: lo, domainMax: hi, maxCell: mCell };
  }, [matrix, rows, cols, min, max]);

  // Label gutters sized to whether labels exist (mono micro-labels).
  const leftGutter = rowLabels && rowLabels.length ? 72 : 8;
  const topGutter = colLabels && colLabels.length ? 22 : 8;

  const gridW = Math.max(width - leftGutter - 8, 1);
  const gridH = Math.max(height - topGutter - 8, 1);
  const cellW = cols > 0 ? (gridW - GAP * (cols - 1)) / cols : gridW;
  const cellH = rows > 0 ? (gridH - GAP * (rows - 1)) / rows : gridH;

  // Single-hue ramp: opacity encodes magnitude across the (possibly fixed) domain.
  const span = domainMax - domainMin || 1;
  const opacityOf = (v: number) =>
    MIN_OPACITY + (1 - MIN_OPACITY) * Math.max(0, Math.min(1, (v - domainMin) / span));

  // Diverging scale: symmetric about 0, grey at zero → lime (+) / purple (−).
  const absMax = Math.max(Math.abs(domainMin), Math.abs(domainMax)) || 1;
  const zeroColor = mix(theme.bg, theme.muted, 0.35); // subtle dark grey
  const divergingFill = (v: number) => {
    const t = Math.max(-1, Math.min(1, v / absMax));
    const c = t >= 0 ? mix(zeroColor, theme.accent, t) : mix(zeroColor, theme.accent3, -t);
    return rgbCss(c);
  };

  const activeCol =
    highlightCol !== undefined && highlightCol >= 0 && highlightCol < cols
      ? highlightCol
      : null;

  const active =
    activeCell &&
    activeCell.row >= 0 &&
    activeCell.row < rows &&
    activeCell.col >= 0 &&
    activeCell.col < cols
      ? activeCell
      : null;

  const hovered =
    hover && Number.isFinite(matrix[hover.r]?.[hover.c])
      ? { ...hover, v: matrix[hover.r]![hover.c]! }
      : null;

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {width > 0 ? (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label="Heatmap"
          onMouseLeave={() => {
            setHover(null);
            onHoverCell?.(null);
          }}
        >
          {/* Column labels — the active step's/cell's label is the lime mark. */}
          {colLabels?.map((label, c) => (
            <text
              key={`col-${c}`}
              x={leftGutter + c * (cellW + GAP) + cellW / 2}
              y={topGutter - 8}
              textAnchor="middle"
              className={
                c === activeCol || c === active?.col
                  ? "fill-accent font-mono text-[10px] uppercase tracking-wide"
                  : "fill-muted font-mono text-[10px] uppercase tracking-wide"
              }
            >
              {label}
            </text>
          ))}

          {/* Cells */}
          {Array.from({ length: rows }).map((_, r) =>
            Array.from({ length: cols }).map((__, c) => {
              const v = matrix[r]?.[c];
              const defined = v !== undefined && Number.isFinite(v);
              const isMax =
                !diverging && highlightMax && r === maxCell.r && c === maxCell.c;
              const x = leftGutter + c * (cellW + GAP);
              const y = topGutter + r * (cellH + GAP);
              return (
                <g key={`cell-${r}-${c}`}>
                  <rect
                    x={x}
                    y={y}
                    width={cellW}
                    height={cellH}
                    rx={2}
                    className={
                      diverging
                        ? "stroke-border/40"
                        : defined
                          ? isMax
                            ? "fill-accent"
                            : "fill-accent stroke-border/40"
                          : "fill-transparent stroke-border/40"
                    }
                    style={
                      diverging && defined ? { fill: divergingFill(v) } : undefined
                    }
                    fillOpacity={
                      diverging
                        ? defined
                          ? 1
                          : 0
                        : defined
                          ? isMax
                            ? 1
                            : opacityOf(v)
                          : 0
                    }
                    strokeWidth={0.5}
                    onMouseEnter={() => {
                      setHover({ r, c });
                      onHoverCell?.({ row: r, col: c });
                    }}
                    onMouseLeave={() => setHover(null)}
                  />
                  {showValues && defined ? (
                    <text
                      x={x + cellW / 2}
                      y={y + cellH / 2}
                      textAnchor="middle"
                      dominantBaseline="central"
                      className={
                        isMax
                          ? "pointer-events-none fill-accent-fg font-mono text-[10px]"
                          : "pointer-events-none fill-fg font-mono text-[10px]"
                      }
                    >
                      {format(v)}
                    </text>
                  ) : null}
                </g>
              );
            }),
          )}

          {/* Active-column outline — the focused mark for the current step. */}
          {activeCol !== null && rows > 0 ? (
            <rect
              x={leftGutter + activeCol * (cellW + GAP) - 1.5}
              y={topGutter - 1.5}
              width={cellW + 3}
              height={rows * cellH + (rows - 1) * GAP + 3}
              rx={3}
              className="pointer-events-none fill-none stroke-accent"
              strokeWidth={1.5}
            />
          ) : null}

          {/* Active-cell crosshair — the focused mark for the hovered cell. */}
          {active ? (
            <rect
              x={leftGutter + active.col * (cellW + GAP) - 1}
              y={topGutter + active.row * (cellH + GAP) - 1}
              width={cellW + 2}
              height={cellH + 2}
              rx={3}
              className={`pointer-events-none fill-none ${activeCellStrokeClass}`}
              strokeWidth={1.5}
            />
          ) : null}

          {/* Row labels */}
          {rowLabels?.map((label, r) => (
            <text
              key={`row-${r}`}
              x={leftGutter - 8}
              y={topGutter + r * (cellH + GAP) + cellH / 2}
              textAnchor="end"
              dominantBaseline="central"
              className={
                r === active?.row
                  ? "fill-accent font-mono text-[10px] uppercase tracking-wide"
                  : "fill-muted font-mono text-[10px] uppercase tracking-wide"
              }
            >
              {label}
            </text>
          ))}
        </svg>
      ) : null}

      {/* Hover readout — label-mono idiom. */}
      {hovered ? (
        <div className="pointer-events-none absolute right-1 top-1 rounded-md border border-border bg-panel px-2 py-1 font-mono text-[10px] text-fg">
          {rowLabels?.[hovered.r] ? `${rowLabels[hovered.r]} · ` : ""}
          {colLabels?.[hovered.c] ? `${colLabels[hovered.c]} · ` : ""}
          {format(hovered.v)}
        </div>
      ) : null}
    </div>
  );
}
