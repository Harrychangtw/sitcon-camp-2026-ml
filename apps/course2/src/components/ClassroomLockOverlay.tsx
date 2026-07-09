import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { lockApplies, useClassroom } from "../lib/classroom";

/**
 * Renders the instructor lock (lib/classroom) for the station currently on
 * screen, in two phases:
 *
 *   1. countdown — a warning pill at the top of the screen while the grace
 *      period runs down, so the lock never lands mid-interaction by surprise;
 *   2. locked — a full-screen overlay that swallows all pointer events and
 *      points students at the slides.
 *
 * The countdown is computed from the instructor-side `issuedAt`, clamped so a
 * student clock running behind still gets (at most) the full grace period.
 */

const DEFAULT_MESSAGE = "請看向台前，跟著投影片";

function LockIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
      <circle cx="12" cy="15.5" r="1.25" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function ClassroomLockOverlay() {
  const { lock } = useClassroom();
  const { pathname } = useLocation();
  const stationId = pathname.split("/")[1] ?? "";
  const active = lockApplies(lock, stationId);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now()); // don't render one stale frame when the lock appears
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [active, lock?.issuedAt]);

  if (!active || !lock) return null;

  const elapsed = Math.max(0, (now - lock.issuedAt) / 1000);
  const remaining = Math.ceil(lock.graceSeconds - elapsed);
  const message = lock.message ?? DEFAULT_MESSAGE;

  if (remaining > 0) {
    return (
      <div className="pointer-events-none fixed left-1/2 top-4 z-[90] -translate-x-1/2">
        <div className="flex items-center gap-2.5 rounded-full border border-warning/50 bg-panel/90 px-4 py-2 shadow-lg backdrop-blur">
          <LockIcon className="h-4 w-4 text-warning" />
          <span className="text-sm text-fg">
            畫面即將鎖定
            <span className="mx-1.5 inline-block min-w-[1.5ch] text-center font-mono text-base font-bold text-warning">
              {remaining}
            </span>
            秒
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-5 bg-bg/95 backdrop-blur-md">
      <LockIcon className="h-12 w-12 animate-pulse text-accent" />
      <p className="text-3xl font-semibold text-fg">先停一下</p>
      <p className="text-lg text-muted">{message}</p>
      <p className="text-xs text-muted/70">解鎖後畫面會自動恢復</p>
    </div>
  );
}
