// @camp/viz — shared, client-only visualization primitives.
// All are resize-aware; the heavier ones (three/onnx-based) must lazy-import
// their engine inside effects so they never run during SSR.

export { Scatter2D } from "./Scatter2D";
export type { Scatter2DProps, ScatterPoint } from "./Scatter2D";

export { Scatter3D } from "./Scatter3D";
export type { Scatter3DProps, Scatter3DPoint } from "./Scatter3D";

export { AttentionLines } from "./AttentionLines";
export type { AttentionLinesProps } from "./AttentionLines";

export { LossCurve } from "./LossCurve";
export type { LossCurveProps, LossSeries } from "./LossCurve";

export { Heatmap } from "./Heatmap";
export type { HeatmapProps } from "./Heatmap";

export { VectorStrip } from "./VectorStrip";
export type { VectorStripProps } from "./VectorStrip";

export { useResizeObserver } from "./useResizeObserver";
export type { Size } from "./useResizeObserver";

export {
  useThemeColors,
  readThemeColors,
  categoryPalette,
  categoryColorMap,
  hexCategoryColorMap,
  hexToRgb,
  rgbCss,
  mix,
} from "./theme";
export type { ThemeColors, RGB } from "./theme";
