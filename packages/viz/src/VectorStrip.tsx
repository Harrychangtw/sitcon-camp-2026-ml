import { mix, rgbCss, useThemeColors } from "./theme";

export interface VectorStripProps {
  /** The vector, one cell per component. Signed values are expected. */
  values: number[];
  /**
   * Symmetric color domain: cells map -maxAbs..+maxAbs onto the diverging
   * purple ↔ grey ↔ lime scale. Pass a shared value to keep several strips on
   * one scale (e.g. all K rows); defaults to this strip's own max |value|.
   */
  maxAbs?: number;
  /**
   * Overall strength 0..1 — the whole strip fades toward transparent as it
   * drops (magnitude = opacity, per DESIGN.md). The transformer station sets
   * this to each token's attention weight during the weighted-sum step.
   * Default 1.
   */
  emphasis?: number;
  /** Draw the focus outline (lime) around the strip. Default false. */
  highlight?: boolean;
  /** Square cell size in px. Default 16. */
  cellSize?: number;
  /** Accessible label for the strip. */
  ariaLabel?: string;
}

/**
 * A single small vector rendered as a row of colored cells — the "vector strip"
 * idiom for showing Q/K/V-style embeddings. Sign/magnitude use the SAME
 * restrained diverging scale as Heatmap's `diverging` mode (purple ↔ grey ↔
 * lime, read from the theme — no hard-coded hexes), so strips and heatmaps read
 * as one system. `emphasis` scales the whole strip's opacity, letting a station
 * encode "how much this vector contributes" without extra hues.
 *
 * Prop-driven and lesson-agnostic: no fetch, no station state, SSR-safe (theme
 * colors come from `useThemeColors`; layout is plain flexbox).
 */
export function VectorStrip({
  values,
  maxAbs,
  emphasis = 1,
  highlight = false,
  cellSize = 16,
  ariaLabel,
}: VectorStripProps) {
  const theme = useThemeColors();

  const domain =
    maxAbs !== undefined && maxAbs > 0
      ? maxAbs
      : Math.max(...values.map((v) => Math.abs(v)), 1e-9);

  const zeroColor = mix(theme.bg, theme.muted, 0.35); // subtle dark grey
  const fillOf = (v: number) => {
    const t = Math.max(-1, Math.min(1, v / domain));
    const c =
      t >= 0 ? mix(zeroColor, theme.accent, t) : mix(zeroColor, theme.accent3, -t);
    return rgbCss(c);
  };

  return (
    <div
      role="img"
      aria-label={ariaLabel}
      className={`inline-flex gap-px rounded-sm ${
        highlight ? "ring-1 ring-accent" : ""
      }`}
      style={{ opacity: 0.15 + 0.85 * Math.max(0, Math.min(1, emphasis)) }}
    >
      {values.map((v, i) => (
        <div
          key={i}
          title={v.toFixed(3)}
          className="rounded-[2px] border border-border/40"
          style={{ width: cellSize, height: cellSize, background: fillOf(v) }}
        />
      ))}
    </div>
  );
}
