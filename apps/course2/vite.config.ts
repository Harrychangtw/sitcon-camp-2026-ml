import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite (not Next) for the station apps: stations are client-only canvases that
// fight SSR (window / three / onnx). Vite serves the workspace @camp/* packages
// straight from TS source — no build step needed for them.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
  },
  // onnxruntime-web is large and lazy-imported at runtime; keep it out of the
  // dep pre-bundle so dev startup stays fast.
  optimizeDeps: {
    exclude: ["onnxruntime-web"],
  },
});
