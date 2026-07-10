import type { ReactElement } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { StationHeaderTitleProvider } from "@camp/ui";
import { AuthGate } from "./components/AuthGate";
import { ClassroomLockOverlay } from "./components/ClassroomLockOverlay";
import { StationNav } from "./components/StationNav";
import { stations } from "./stations/registry";
import { ClassroomProvider, stationClosed, useClassroom } from "./lib/classroom";
import {
  ProgressionProvider,
  isLocked,
  useUnlockedCount,
} from "./lib/progression";

const firstId = stations[0]?.id ?? "tokenizer";

/**
 * Route-level lock: a student who types the URL of a gated station — locked by
 * the lesson progression (lib/progression) or closed by the instructor
 * (lib/classroom `closed`) — is redirected to the furthest open station, so the
 * nav gate can't be bypassed by hand. Dev stations are never gated.
 */
function StationGate({ id, children }: { id: string; children: ReactElement }) {
  const unlockedCount = useUnlockedCount();
  const { closed } = useClassroom();
  const gated = (stationId: string) =>
    isLocked(stationId, unlockedCount) || stationClosed(closed, stationId);
  if (gated(id)) {
    // Redirect to a real teaching station: meta pages (the leaderboard) are
    // never gated, but they'd be a bewildering landing spot.
    const open = stations.filter(
      (s) => (s.group === "lesson" || s.group === "panorama") && !gated(s.id),
    );
    const target = open[open.length - 1]?.id;
    // Everything closed → nowhere sensible to send them; stay put (the global
    // lock overlay is what covers that scenario).
    if (target) return <Navigate to={`/${target}`} replace />;
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
        <ClassroomProvider>
          <StationHeaderTitleProvider render={(title) => <StationNav title={title} />}>
            <AuthGate>
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
                <ClassroomLockOverlay />
              </div>
            </AuthGate>
          </StationHeaderTitleProvider>
        </ClassroomProvider>
      </ProgressionProvider>
    </BrowserRouter>
  );
}
