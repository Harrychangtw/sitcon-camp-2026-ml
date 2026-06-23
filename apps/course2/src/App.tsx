import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Sidebar } from "./components/Sidebar";
import { stations } from "./stations/registry";

const firstId = stations[0]?.id ?? "tokenizer";

function NotFound() {
  return (
    <div className="flex h-full items-center justify-center p-8 text-center text-muted">
      <div>
        <p className="text-lg font-semibold text-fg">Station not found</p>
        <p className="mt-1 text-sm">Pick a station from the sidebar.</p>
      </div>
    </div>
  );
}

/**
 * App shell: a persistent sidebar station switcher + the routed station canvas.
 * Each station is registered once in stations/registry.tsx; routes and sidebar
 * entries are both generated from that single list.
 */
export function App() {
  return (
    <BrowserRouter>
      <div className="flex h-full min-h-0">
        <Sidebar />
        <div className="min-h-0 min-w-0 flex-1">
          <Routes>
            <Route path="/" element={<Navigate to={`/${firstId}`} replace />} />
            {stations.map((s) => (
              <Route key={s.id} path={`/${s.id}`} element={s.element} />
            ))}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  );
}
