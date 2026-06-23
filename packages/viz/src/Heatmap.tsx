import { StubFrame } from "./_StubFrame";

export interface HeatmapProps {
  /** Row-major matrix, `matrix[row][col]`. */
  matrix: number[][];
  rowLabels?: string[];
  colLabels?: string[];
  /** Pixel height; width is responsive. Default 360. */
  height?: number;
}

/**
 * STUB — typed signature only.
 *
 * The real version draws a color-scaled grid (one cell per matrix entry) with
 * an optional value-on-hover and axis labels. Used for attention matrices,
 * weight matrices, and confusion-style readouts.
 *
 * Implementation notes: d3 sequential color scale + React-rendered <rect> grid
 * (SSR-safe). For large matrices, render to <canvas> instead of thousands of
 * SVG rects.
 */
export function Heatmap(props: HeatmapProps) {
  return (
    <StubFrame
      name="Heatmap"
      summary="Real version: d3 color-scaled grid (SVG for small, canvas for large matrices)."
      props={{
        shape: [props.matrix.length, props.matrix[0]?.length ?? 0],
        rowLabels: props.rowLabels,
        colLabels: props.colLabels,
      }}
      height={props.height ?? 360}
    />
  );
}
