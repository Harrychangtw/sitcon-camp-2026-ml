/*
 * Shared Tailwind preset. Both apps consume it so their utility classes resolve
 * to the SAME design tokens defined in src/theme.css:
 *
 *   // apps/<app>/tailwind.config.*
 *   presets: [require("@camp/ui/tailwind-preset")]
 *
 * Color names below reference the `--camp-*` CSS variables via the
 * `rgb(var(--x) / <alpha-value>)` pattern, which keeps Tailwind opacity
 * modifiers working (e.g. `text-muted`, `bg-accent/40`).
 */
/** @type {import('tailwindcss').Config} */
module.exports = {
  // `content` is intentionally empty here — each app declares its own globs
  // (and must include the shared packages' src; see the app tailwind configs).
  content: [],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: "rgb(var(--camp-bg) / <alpha-value>)",
        fg: "rgb(var(--camp-fg) / <alpha-value>)",
        muted: "rgb(var(--camp-muted) / <alpha-value>)",
        panel: "rgb(var(--camp-panel) / <alpha-value>)",
        border: "rgb(var(--camp-border) / <alpha-value>)",
        accent: {
          DEFAULT: "rgb(var(--camp-accent) / <alpha-value>)",
          fg: "rgb(var(--camp-accent-fg) / <alpha-value>)",
        },
        positive: "rgb(var(--camp-positive) / <alpha-value>)",
        warning: "rgb(var(--camp-warning) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["var(--camp-font-sans)"],
        mono: ["var(--camp-font-mono)"],
      },
    },
  },
};
