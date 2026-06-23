const preset = require("@camp/ui/tailwind-preset");

/** @type {import('tailwindcss').Config} */
module.exports = {
  // Same shared tokens as the shell — one source of truth.
  presets: [preset],
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}",
    // Generate classes used inside the shared packages too.
    "../../packages/ui/src/**/*.{ts,tsx}",
    "../../packages/viz/src/**/*.{ts,tsx}",
  ],
};
