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
    // Allow the tailscale funnel hostname (*.ts.net) to reach the dev server.
    // A leading-dot suffix matches any subdomain, so no per-machine edit needed.
    allowedHosts: [".ts.net"],
  },
  // `vite preview` (the prod serve path in scripts/serve.sh) has its own host
  // allow-list; mirror the dev one so the public funnel host isn't rejected.
  preview: {
    port: 5173,
    strictPort: true,
    allowedHosts: [".ts.net"],
  },
  // onnxruntime-web is large and lazy-imported at runtime; keep it out of the
  // dep pre-bundle so dev startup stays fast.
  optimizeDeps: {
    exclude: ["onnxruntime-web"],
  },
});
