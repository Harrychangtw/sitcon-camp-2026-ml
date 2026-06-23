import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Theme tokens first (defines --camp-* vars), then Tailwind/base styles.
import "@camp/ui/theme.css";
import "./index.css";
import { App } from "./App";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Missing #root element");

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
