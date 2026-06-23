const preset = require("@camp/ui/tailwind-preset");

/** @type {import('tailwindcss').Config} */
module.exports = {
  // Inherit the shared design tokens (colors/fonts wired to @camp/ui CSS vars).
  presets: [preset],
  content: [
    "./app/**/*.{ts,tsx,mdx}",
    // Generate classes used inside the shared packages too.
    "../../packages/ui/src/**/*.{ts,tsx}",
    "../../packages/viz/src/**/*.{ts,tsx}",
  ],
};
