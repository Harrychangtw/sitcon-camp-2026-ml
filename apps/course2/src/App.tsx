import type { ReactElement } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { StationHeaderTitleProvider } from "@camp/ui";
import { StationNav } from "./components/StationNav";
import { stations } from "./stations/registry";
import {
  ProgressionProvider,
  highestUnlockedId,
  isLocked,
  useUnlockedCount,
} from "./lib/progression";

const firstId = stations[0]?.id ?? "tokenizer";

/**
 * Route-level lock: a student who types the URL of a not-yet-unlocked lesson
 * station is redirected to the furthest unlocked one, so the nav gate can't be
 * bypassed by hand. Dev stations are never locked.
 */
function StationGate({ id, children }: { id: string; children: ReactElement }) {
  const unlockedCount = useUnlockedCount();
  if (isLocked(id, unlockedCount)) {
    return <Navigate to={`/${highestUnlockedId(unlockedCount)}`} replace />;
  }
  return children;
}

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
      <ProgressionProvider>
        <StationHeaderTitleProvider render={(title) => <StationNav title={title} />}>
          <div className="h-full min-h-0 min-w-0">
            <Routes>
              <Route path="/" element={<Navigate to={`/${firstId}`} replace />} />
              {stations.map((s) => (
                <Route
                  key={s.id}
                  path={`/${s.id}`}
                  element={<StationGate id={s.id}>{s.element}</StationGate>}
                />
              ))}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </div>
        </StationHeaderTitleProvider>
      </ProgressionProvider>
    </BrowserRouter>
  );
}
