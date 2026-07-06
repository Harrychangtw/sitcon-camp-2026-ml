import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { stations } from "../stations/registry";

/**
 * Classroom progression lock. The app fetches a tiny runtime file — `unlocked.txt`
 * containing a single integer N — and reveals only the first N *lesson* stations,
 * in registry order. The instructor unlocks the next station live by bumping that
 * number on the prod server (see scripts/unlock.sh); no rebuild, and every
 * student's screen catches up on the next poll.
 *
 * Semantics:
 *   - N counts lesson stations (1-based): N=3 → first three lesson stations open.
 *   - Dev stations (_reference, viz-sandbox) are NEVER locked — always URL-reachable.
 *   - Missing / unreadable / unparseable file → fail OPEN (everything unlocked), so
 *     a fetch glitch or a forgotten file never traps students. The lock is opt-in:
 *     ship an `unlocked.txt` to turn it on.
 */

// Lesson stations in teaching order — the only ones the lock applies to.
export const lessonStations = stations.filter((s) => s.group === "lesson");
const lessonIds = new Set(lessonStations.map((s) => s.id));

const UNLOCKED_URL = `${import.meta.env.BASE_URL}unlocked.txt`;
// Short poll so an instructor's unlock lands on every screen within ~a second;
// we also refetch immediately on tab focus / visibility so a student flipping
// back to the tab is never stuck on a stale lock state.
const POLL_MS = 3000;
// Sentinel: "not yet known" → treat as fully unlocked so nothing flashes locked
// before the first fetch resolves.
const ALL = Number.POSITIVE_INFINITY;

const ProgressionContext = createContext<number>(ALL);

async function fetchUnlockedCount(): Promise<number> {
  try {
    const res = await fetch(`${UNLOCKED_URL}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return ALL; // missing file → fail open
    const n = Number.parseInt((await res.text()).trim(), 10);
    return Number.isFinite(n) ? Math.max(0, n) : ALL; // garbage → fail open
  } catch {
    return ALL; // network error → fail open
  }
}

export function ProgressionProvider({ children }: { children: ReactNode }) {
  const [unlockedCount, setUnlockedCount] = useState<number>(ALL);

  useEffect(() => {
    let alive = true;
    const tick = () => {
      void fetchUnlockedCount().then((n) => {
        if (alive) setUnlockedCount(n);
      });
    };
    tick();
    const id = window.setInterval(tick, POLL_MS);
    const onFocus = () => tick();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      alive = false;
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, []);

  return (
    <ProgressionContext.Provider value={unlockedCount}>
      {children}
    </ProgressionContext.Provider>
  );
}

export function useUnlockedCount(): number {
  return useContext(ProgressionContext);
}

/** A lesson station is locked once its position (1-based) exceeds the count. */
export function isLocked(stationId: string, unlockedCount: number): boolean {
  if (!lessonIds.has(stationId)) return false; // dev stations never lock
  const index = lessonStations.findIndex((s) => s.id === stationId);
  return index >= unlockedCount;
}

/** The last currently-unlocked lesson station — where locked routes redirect to. */
export function highestUnlockedId(unlockedCount: number): string {
  const open = lessonStations.slice(0, Math.max(1, unlockedCount));
  return open[open.length - 1]?.id ?? lessonStations[0]?.id ?? "tokenizer";
}
