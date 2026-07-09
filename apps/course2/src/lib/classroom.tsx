import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import { stations } from "../stations/registry";

/**
 * Classroom live control. The app polls a tiny runtime file — `classroom.json`,
 * written by scripts/classroom.mjs — for two kinds of instructor broadcasts:
 *
 *   - lock: freeze specific stations (scope = list of ids) or every screen
 *     (scope = "all") behind a full-screen overlay that points students at the
 *     slides. A grace countdown warns before the overlay engages, so screens
 *     never slam shut mid-interaction (see components/ClassroomLockOverlay).
 *   - goto: a one-shot "everyone switch to station X". Each browser tab follows
 *     a given broadcast at most once (seq remembered in sessionStorage) and
 *     only while it is fresh, so it moves students without pinning them.
 *
 * Missing / unreadable / malformed file → fail OPEN (no lock, no redirect),
 * the same contract as the progression lock (lib/progression).
 */

export interface ClassroomLock {
  /** "all" for a global lock, or the station ids to freeze. */
  scope: "all" | string[];
  /** Instructor-side epoch ms when the lock was issued. */
  issuedAt: number;
  /** Warning countdown (seconds) before the overlay engages. */
  graceSeconds: number;
  /** Optional override for the overlay message. */
  message?: string;
}

export interface ClassroomGoto {
  /** Monotonic broadcast counter — each browser tab follows a seq at most once. */
  seq: number;
  station: string;
  /** Instructor-side epoch ms when the broadcast was issued. */
  issuedAt: number;
}

export interface ClassroomState {
  lock: ClassroomLock | null;
  goto: ClassroomGoto | null;
}

const CLASSROOM_URL = `${import.meta.env.BASE_URL}classroom.json`;
// Short poll so a lock/goto lands on every screen within ~2s; we also refetch
// on focus / visibility so a student flipping back is never on stale state.
const POLL_MS = 2000;
// A goto broadcast is only followed while fresh — a browser (re)loading minutes
// later should not be yanked to wherever the class went long ago.
const GOTO_FRESH_MS = 60_000;
const GOTO_SEQ_KEY = "camp-classroom-goto-seq";

const EMPTY: ClassroomState = { lock: null, goto: null };
const ClassroomContext = createContext<ClassroomState>(EMPTY);

/** Coerce whatever the file contains into a safe state — garbage fails open. */
function sanitize(raw: unknown): ClassroomState {
  if (typeof raw !== "object" || raw === null) return EMPTY;
  const o = raw as Record<string, unknown>;

  let lock: ClassroomLock | null = null;
  const l = o.lock;
  if (l && typeof l === "object") {
    const lo = l as Record<string, unknown>;
    const scope =
      lo.scope === "all"
        ? ("all" as const)
        : Array.isArray(lo.scope)
          ? lo.scope.filter((s): s is string => typeof s === "string")
          : null;
    if (scope !== null && typeof lo.issuedAt === "number") {
      lock = {
        scope,
        issuedAt: lo.issuedAt,
        graceSeconds:
          typeof lo.graceSeconds === "number" ? Math.max(0, lo.graceSeconds) : 0,
        message:
          typeof lo.message === "string" && lo.message.trim()
            ? lo.message
            : undefined,
      };
    }
  }

  let goto: ClassroomGoto | null = null;
  const g = o.goto;
  if (g && typeof g === "object") {
    const go = g as Record<string, unknown>;
    if (
      typeof go.seq === "number" &&
      typeof go.station === "string" &&
      typeof go.issuedAt === "number"
    ) {
      goto = { seq: go.seq, station: go.station, issuedAt: go.issuedAt };
    }
  }

  return { lock, goto };
}

async function fetchState(): Promise<ClassroomState> {
  try {
    const res = await fetch(`${CLASSROOM_URL}?t=${Date.now()}`, {
      cache: "no-store",
    });
    if (!res.ok) return EMPTY; // missing file → fail open
    return sanitize(await res.json());
  } catch {
    return EMPTY; // network / parse error → fail open
  }
}

export function ClassroomProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ClassroomState>(EMPTY);
  const navigate = useNavigate();

  useEffect(() => {
    let alive = true;
    const tick = () => {
      void fetchState().then((s) => {
        if (alive) setState(s);
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

  // Follow a goto broadcast at most once per tab, and only while it is fresh.
  useEffect(() => {
    const cmd = state.goto;
    if (!cmd || !stations.some((s) => s.id === cmd.station)) return;
    let seen: string | null = null;
    try {
      seen = window.sessionStorage.getItem(GOTO_SEQ_KEY);
    } catch {
      /* storage unavailable → still navigate, just without dedupe */
    }
    if (seen === String(cmd.seq)) return;
    try {
      window.sessionStorage.setItem(GOTO_SEQ_KEY, String(cmd.seq));
    } catch {
      /* ignore */
    }
    if (Date.now() - cmd.issuedAt <= GOTO_FRESH_MS) {
      navigate(`/${cmd.station}`);
    }
  }, [state.goto, navigate]);

  return (
    <ClassroomContext.Provider value={state}>
      {children}
    </ClassroomContext.Provider>
  );
}

export function useClassroom(): ClassroomState {
  return useContext(ClassroomContext);
}

/** Does this lock apply to the given station? */
export function lockApplies(
  lock: ClassroomLock | null,
  stationId: string,
): boolean {
  if (!lock) return false;
  return lock.scope === "all" || lock.scope.includes(stationId);
}
