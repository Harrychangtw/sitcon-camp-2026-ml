/**
 * Read the shared `@camp/ui` design tokens (the `--camp-*` CSS vars) at runtime
 * so viz primitives color themselves from the theme instead of hard-coding hues
 * (see prompts/DESIGN.md). Values are space-separated RGB channels, e.g.
 * `--camp-accent: 214 251 0`.
 *
 * SSR-safe: `getComputedStyle` is only touched inside `useThemeColors`'s effect
 * (or explicitly on the client via `readThemeColors`); the module falls back to
 * the canonical dark palette if the vars can't be read.
 */
import { useEffect, useState } from "react";

export type RGB = [number, number, number];

export interface ThemeColors {
  bg: RGB;
  fg: RGB;
  muted: RGB;
  border: RGB;
  /** Focus accent (lime). */
  accent: RGB;
  /** Categorical hue 1 (cyan). */
  accent2: RGB;
  /** Categorical hue 2 (purple). */
  accent3: RGB;
}

const VARS: Record<keyof ThemeColors, string> = {
  bg: "--camp-bg",
  fg: "--camp-fg",
  muted: "--camp-muted",
  border: "--camp-border",
  accent: "--camp-accent",
  accent2: "--camp-accent-2",
  accent3: "--camp-accent-3",
};

/** Canonical dark palette (mirrors @camp/ui theme.css .dark) — SSR fallback. */
const FALLBACK: ThemeColors = {
  bg: [10, 10, 10],
  fg: [255, 255, 255],
  muted: [158, 158, 158],
  border: [88, 88, 88],
  accent: [214, 251, 0],
  accent2: [52, 227, 237],
  accent3: [114, 53, 255],
};

function parseChannels(value: string): RGB | null {
  const parts = value.trim().split(/[\s,]+/).map(Number);
  const [r, g, b] = parts;
  if (r === undefined || g === undefined || b === undefined) return null;
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
  return [r, g, b];
}

/** Read the theme colors from the document (client only). */
export function readThemeColors(): ThemeColors {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return FALLBACK;
  }
  const cs = getComputedStyle(document.documentElement);
  const out: ThemeColors = { ...FALLBACK };
  (Object.keys(VARS) as (keyof ThemeColors)[]).forEach((key) => {
    const parsed = parseChannels(cs.getPropertyValue(VARS[key]));
    if (parsed) out[key] = parsed;
  });
  return out;
}

/** React hook: theme colors, read once on mount (client). */
export function useThemeColors(): ThemeColors {
  const [colors, setColors] = useState<ThemeColors>(FALLBACK);
  useEffect(() => {
    setColors(readThemeColors());
  }, []);
  return colors;
}

/** Parse a `#rrggbb` (or `#rgb`) hex string to an RGB triple; null if invalid.
 * Lets a host pass an explicit category→hex palette that the viz renders exactly
 * (so an external legend can match the points pixel-for-pixel). */
export function hexToRgb(hex: string): RGB | null {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = h[0]! + h[0]! + h[1]! + h[1]! + h[2]! + h[2]!;
  if (h.length !== 6 || /[^0-9a-fA-F]/.test(h)) return null;
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Build a category→RGB map from an explicit `#hex` palette (host-supplied),
 * falling back to `muted` for any unparseable entry. */
export function hexCategoryColorMap(
  colors: ThemeColors,
  categoryColors: Record<string, string>,
): Map<string, RGB> {
  const map = new Map<string, RGB>();
  for (const [cat, hex] of Object.entries(categoryColors)) {
    map.set(cat, hexToRgb(hex) ?? colors.muted);
  }
  return map;
}

/** CSS `rgb(...)` string, optionally with alpha. */
export function rgbCss(c: RGB, alpha = 1): string {
  return alpha >= 1
    ? `rgb(${c[0]} ${c[1]} ${c[2]})`
    : `rgb(${c[0]} ${c[1]} ${c[2]} / ${alpha})`;
}

/** Linear blend between two colors in RGB space. */
export function mix(a: RGB, b: RGB, t: number): RGB {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

/**
 * A restrained categorical palette from the theme: cyan + purple + greys.
 * Deliberately NOT a rainbow (see DESIGN.md) — for N groups we anchor on the two
 * categorical hues plus fg/muted greys and blend between them for the rest.
 */
export function categoryPalette(colors: ThemeColors, n: number): RGB[] {
  const base: RGB[] = [colors.accent2, colors.accent3, colors.fg, colors.muted];
  if (n <= base.length) return base.slice(0, Math.max(n, 0));
  const grey = colors.muted;
  const out: RGB[] = [];
  for (let i = 0; i < n; i++) {
    const pos = (i / n) * base.length;
    const lo = Math.floor(pos) % base.length;
    const hi = (lo + 1) % base.length;
    out.push(mix(base[lo] ?? grey, base[hi] ?? grey, pos - Math.floor(pos)));
  }
  return out;
}

/** Map an ordered category list to palette colors. */
export function categoryColorMap(
  colors: ThemeColors,
  categories: string[],
): Map<string, RGB> {
  const palette = categoryPalette(colors, categories.length);
  const map = new Map<string, RGB>();
  categories.forEach((c, i) => map.set(c, palette[i] ?? colors.muted));
  return map;
}
