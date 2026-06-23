import { StubFrame } from "./_StubFrame";

export interface AttentionLinesProps {
  /** Tokens, left-to-right. */
  tokens: string[];
  /**
   * Attention weights. `weights[i][j]` is the attention FROM token i TO token j,
   * expected in 0..1 (a single head, single layer).
   */
  weights: number[][];
  /** Only draw links at or above this weight. Default 0.1. */
  threshold?: number;
  /** Pixel height; width is responsive. Default 240. */
  height?: number;
}

/**
 * STUB — typed signature only.
 *
 * The real version draws the token row(s) and connects them with curved links
 * whose opacity/width encode attention weight. Used by the transformer station
 * to make "this token looked at that token" visible. Reads a precomputed
 * attention tensor exported to JSON.
 *
 * Implementation notes: pure SVG + d3 path math (no WebGL needed), so it stays
 * SSR-safe like Scatter2D. Throttle hover; memoize the path list by weights.
 */
export function AttentionLines(props: AttentionLinesProps) {
  return (
    <StubFrame
      name="AttentionLines"
      summary="Real version: SVG curved links between tokens, opacity ∝ attention weight."
      props={{
        tokens: props.tokens,
        threshold: props.threshold ?? 0.1,
        weightsShape: [props.weights.length, props.weights[0]?.length ?? 0],
      }}
      height={props.height ?? 240}
    />
  );
}
