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
        // Categorical hues (cyan / purple) — used only to distinguish groups,
        // never as the focus accent. See prompts/DESIGN.md.
        accent2: "rgb(var(--camp-accent-2) / <alpha-value>)",
        accent3: "rgb(var(--camp-accent-3) / <alpha-value>)",
        positive: "rgb(var(--camp-positive) / <alpha-value>)",
        warning: "rgb(var(--camp-warning) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["var(--camp-font-sans)"],
        mono: ["var(--camp-font-mono)"],
      },
      // Indeterminate "still working" sweep — a short bar that slides across its
      // track. Used for the top-of-panel loading signal on live-inference cards,
      // so a pending request animates in place instead of swapping copy in/out
      // (which shifts layout).
      keyframes: {
        indeterminate: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(500%)" },
        },
      },
      animation: {
        indeterminate: "indeterminate 1.15s ease-in-out infinite",
      },
    },
  },
};
