import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { StationHeaderTitleProvider } from "@camp/ui";
import { StationNav } from "./components/StationNav";
import { stations } from "./stations/registry";

const firstId = stations[0]?.id ?? "tokenizer";

function NotFound() {
  return (
    <div className="flex h-full items-center justify-center p-8 text-center text-muted">
      <div>
        <p className="text-lg font-semibold text-fg">找不到這個 station</p>
        <p className="mt-1 text-sm">請從左上角的選單挑一個 station。</p>
      </div>
    </div>
  );
}

/**
 * App shell: the routed station canvas fills the whole viewport. Navigation
 * lives in each station header's top-left title slot (see StationNav), injected
 * via StationHeaderTitleProvider — no persistent sidebar. Each station is
 * registered once in stations/registry.tsx; routes and the nav dropdown are both
 * generated from that single list.
 */
export function App() {
  return (
    <BrowserRouter>
      <StationHeaderTitleProvider render={(title) => <StationNav title={title} />}>
        <div className="h-full min-h-0 min-w-0">
          <Routes>
            <Route path="/" element={<Navigate to={`/${firstId}`} replace />} />
            {stations.map((s) => (
              <Route key={s.id} path={`/${s.id}`} element={s.element} />
            ))}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </div>
      </StationHeaderTitleProvider>
    </BrowserRouter>
  );
}
