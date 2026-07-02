import { useMemo } from "react";
import { useResizeObserver } from "./useResizeObserver";
import { rgbCss, useThemeColors } from "./theme";

export interface AttentionLinesProps {
  /** Tokens, left-to-right. */
  tokens: string[];
  /**
   * Attention weights. `weights[i][j]` is the attention FROM token i TO token j,
   * expected in 0..1 (a single head, single layer). Each row is a distribution
   * (softmax over keys), so rows roughly sum to 1.
   */
  weights: number[][];
  /**
   * The focused query token (index into `tokens`), or null/undefined. When set,
   * that token's outgoing links light up in the focus accent and every other
   * link recedes. Controlled by the station (see `onFocusToken`).
   */
  focusToken?: number | null;
  /**
   * Called when the pointer enters a token (its index) or leaves the row (null).
   * The station keeps this in state and feeds it back as `focusToken`, so hover
   * drives the highlight (the primitive owns no lesson state).
   */
  onFocusToken?: (index: number | null) => void;
  /** Only draw links at or above this weight. Default 0.05. */
  threshold?: number;
  /** Pixel height; width is responsive. Default 240. */
  height?: number;
}

const PAD_X = 40;
const LABEL_DY = 20; // token label sits this far below its node

/**
 * A row of tokens with curved links between them, one link per (query → key)
 * attention weight. Link opacity AND width encode the weight, so magnitude reads
 * as a single greyscale channel (per DESIGN.md — no extra hues for strength).
 *
 * With no `focusToken`, every pair is drawn as a faint grey arc. When the
 * station sets `focusToken` (from hover), that token's outgoing links light up in
 * the theme focus accent (lime) and the rest recede — making "this token looked
 * at those tokens" concrete. A ring on the focused node shows its self-attention.
 *
 * Pure SVG + arithmetic (quadratic-bezier arcs), so it is SSR-safe like
 * Scatter2D — nothing touches `window` during render, colors come from the
 * @camp/ui theme vars via `useThemeColors` (never hard-coded hexes).
 */
export function AttentionLines({
  tokens,
  weights,
  focusToken,
  onFocusToken,
  threshold = 0.05,
  height = 240,
}: AttentionLinesProps) {
  const { ref, size } = useResizeObserver<HTMLDivElement>();
  const colors = useThemeColors();
  const width = size.width;
  const n = tokens.length;

  const baselineY = height * 0.72;
  const hasFocus = focusToken != null && focusToken >= 0 && focusToken < n;

  // Token x-positions, evenly spaced across the inner width.
  const xs = useMemo(() => {
    const innerRight = Math.max(width - PAD_X, PAD_X + 1);
    if (n <= 1) return [(PAD_X + innerRight) / 2];
    return tokens.map((_, i) => PAD_X + ((innerRight - PAD_X) * i) / (n - 1));
  }, [tokens, width, n]);

  // Quadratic-bezier arc bowing upward from token a to token b.
  function arcPath(a: number, b: number): string {
    const x1 = xs[a] ?? 0;
    const x2 = xs[b] ?? 0;
    const span = Math.abs(x2 - x1);
    const lift = Math.min(baselineY - 10, 0.14 * height + 0.4 * span);
    const cx = (x1 + x2) / 2;
    const cy = baselineY - lift;
    return `M ${x1} ${baselineY} Q ${cx} ${cy} ${x2} ${baselineY}`;
  }

  // Faint background arcs: one per unordered pair, weight = the stronger
  // direction. When a token is focused these fade almost fully out.
  const backgroundLinks = useMemo(() => {
    const links: { key: string; d: string; w: number }[] = [];
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const w = Math.max(weights[i]?.[j] ?? 0, weights[j]?.[i] ?? 0);
        if (w >= threshold) links.push({ key: `bg-${i}-${j}`, d: arcPath(i, j), w });
      }
    }
    return links;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weights, n, xs, threshold, height]);

  // The focused token's outgoing links (directed: focus → key).
  const focusLinks = useMemo(() => {
    if (!hasFocus) return [];
    const row = weights[focusToken!] ?? [];
    const links: { key: string; d: string; w: number }[] = [];
    for (let k = 0; k < n; k++) {
      if (k === focusToken) continue;
      const w = row[k] ?? 0;
      if (w >= threshold) links.push({ key: `fc-${k}`, d: arcPath(focusToken!, k), w });
    }
    return links;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasFocus, focusToken, weights, n, xs, threshold, height]);

  const selfWeight = hasFocus ? weights[focusToken!]?.[focusToken!] ?? 0 : 0;

  // Per-token label style: focus is lime; tokens the focus attends to brighten
  // toward fg by weight; everything else is quiet grey.
  function labelColor(i: number): { fill: string; opacity: number } {
    if (hasFocus && i === focusToken) return { fill: rgbCss(colors.accent), opacity: 1 };
    if (hasFocus) {
      const w = weights[focusToken!]?.[i] ?? 0;
      return { fill: rgbCss(colors.fg), opacity: 0.35 + 0.65 * Math.min(1, w) };
    }
    return { fill: rgbCss(colors.muted), opacity: 0.85 };
  }

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {width > 0 && n > 0 ? (
        <svg width={width} height={height} role="img" aria-label="Attention links between tokens">
          {/* Faint background: all pairs, greyscale, opacity ∝ weight. */}
          {backgroundLinks.map((l) => (
            <path
              key={l.key}
              d={l.d}
              fill="none"
              stroke={rgbCss(colors.muted)}
              strokeOpacity={hasFocus ? 0.05 : 0.1 + 0.4 * l.w}
              strokeWidth={0.5 + 1.5 * l.w}
            />
          ))}

          {/* Focused token's outgoing links, in the lime accent. */}
          {focusLinks.map((l) => (
            <path
              key={l.key}
              d={l.d}
              fill="none"
              stroke={rgbCss(colors.accent)}
              strokeOpacity={0.2 + 0.8 * Math.min(1, l.w)}
              strokeWidth={1 + 4 * Math.min(1, l.w)}
            />
          ))}

          {/* Self-attention of the focused token, as a ring scaled by weight. */}
          {hasFocus ? (
            <circle
              cx={xs[focusToken!]}
              cy={baselineY}
              r={5 + 8 * Math.min(1, selfWeight)}
              fill="none"
              stroke={rgbCss(colors.accent)}
              strokeOpacity={0.2 + 0.7 * Math.min(1, selfWeight)}
              strokeWidth={1.5}
            />
          ) : null}

          {/* Token nodes + labels. The whole column is the hover target. */}
          {tokens.map((tok, i) => {
            const isFocus = hasFocus && i === focusToken;
            const { fill, opacity } = labelColor(i);
            return (
              <g
                key={`tok-${i}`}
                onMouseEnter={() => onFocusToken?.(i)}
                onMouseLeave={() => onFocusToken?.(null)}
                style={{ cursor: "pointer" }}
              >
                {/* Invisible hit area so the gap between node and label is hoverable. */}
                <rect
                  x={(xs[i] ?? 0) - Math.max(14, (width - 2 * PAD_X) / (2 * Math.max(n, 1)))}
                  y={baselineY - 20}
                  width={2 * Math.max(14, (width - 2 * PAD_X) / (2 * Math.max(n, 1)))}
                  height={LABEL_DY + 24}
                  fill="transparent"
                />
                <circle
                  cx={xs[i]}
                  cy={baselineY}
                  r={isFocus ? 4 : 3}
                  fill={isFocus ? rgbCss(colors.accent) : rgbCss(colors.muted)}
                  fillOpacity={isFocus ? 1 : 0.8}
                />
                <text
                  x={xs[i]}
                  y={baselineY + LABEL_DY}
                  textAnchor="middle"
                  className="font-mono text-[11px]"
                  fill={fill}
                  fillOpacity={opacity}
                >
                  {tok}
                </text>
                {/* zero-padded index micro-label above the node */}
                <text
                  x={xs[i]}
                  y={baselineY - 12}
                  textAnchor="middle"
                  className="font-mono text-[9px] uppercase tracking-wide"
                  fill={rgbCss(colors.muted)}
                  fillOpacity={isFocus ? 0.9 : 0.4}
                >
                  {String(i).padStart(2, "0")}
                </text>
              </g>
            );
          })}
        </svg>
      ) : null}
    </div>
  );
}
