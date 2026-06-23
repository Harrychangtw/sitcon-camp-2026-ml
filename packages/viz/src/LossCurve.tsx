import { StubFrame } from "./_StubFrame";

export interface LossSeries {
  label: string;
  /** Loss value per training step. */
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
}

/**
 * STUB — typed signature only.
 *
 * The real version is a d3 line chart of precomputed training/validation loss,
 * supporting incremental replay (`upTo`) to dramatize the "model is training"
 * beat. Used across stations to compare architectures (MLP vs RNN vs Transformer).
 *
 * Implementation notes: d3 scales + React-rendered SVG paths (SSR-safe). One
 * `<path>` per series; legend from `series[].label`.
 */
export function LossCurve(props: LossCurveProps) {
  return (
    <StubFrame
      name="LossCurve"
      summary="Real version: d3 line chart of precomputed loss, with replay via `upTo`."
      props={{
        xLabel: props.xLabel ?? "step",
        upTo: props.upTo,
        series: props.series.map((s) => ({ label: s.label, points: s.values.length })),
      }}
      height={props.height ?? 280}
    />
  );
}
