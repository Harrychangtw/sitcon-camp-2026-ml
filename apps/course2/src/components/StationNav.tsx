import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { stations } from "../stations/registry";
import { isLocked, useUnlockedCount } from "../lib/progression";
import { stationClosed, useClassroom } from "../lib/classroom";

// Lesson stations show first (locked/unlocked per progression); panorama
// stations follow under their own section label and lock only when the
// instructor closes them (lib/classroom `closed`). Dev stations are reachable
// by URL only.
const menuStations = stations.filter((s) => s.group === "lesson");
const panoramaStations = stations.filter((s) => s.group === "panorama");

/**
 * The station switcher, folded into the header's top-left title slot (replaces
 * the old persistent sidebar). Renders as `> {title}`; the chevron rotates down
 * and a compact dropdown of the lesson stations opens on hover, click, or
 * keyboard focus. Selecting an entry routes to it. Closes on outside-click /
 * Escape. The current station is marked with a neon dot and a bold label.
 */
export function StationNav({ title }: { title: string }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const ref = useRef<HTMLDivElement>(null);
  const currentId = location.pathname.replace(/^\//, "");
  const unlockedCount = useUnlockedCount();
  const { closed } = useClassroom();

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div
      ref={ref}
      className="relative inline-block"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="-mx-2 flex items-center gap-1.5 rounded px-2 py-0.5 text-lg font-semibold text-fg"
      >
        <svg
          viewBox="0 0 24 24"
          className={`h-3.5 w-3.5 shrink-0 text-muted transition-transform duration-200 ${
            open ? "rotate-90" : ""
          }`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M9 6l6 6-6 6" />
        </svg>
        <span>{title}</span>
      </button>

      {open ? (
        // `pt-2` is a transparent hover bridge that keeps the cursor inside the
        // container while crossing the visual gap, so moving down to click a
        // menu item never triggers onMouseLeave (which would close the menu).
        <div className="absolute left-0 top-full z-30 pt-2">
          <div
            role="menu"
            className="w-56 overflow-hidden rounded-lg border border-border bg-panel py-1 shadow-lg"
          >
            {[...menuStations, ...panoramaStations].map((s, i) => {
              const active = s.id === currentId;
              const locked =
                isLocked(s.id, unlockedCount) || stationClosed(closed, s.id);
              // Section label above the lesson block (the 建構演變 session),
              // and rule + label where the panorama block starts.
              const firstLesson = i === 0;
              const firstPanorama =
                panoramaStations.length > 0 && i === menuStations.length;
              return (
                <div key={s.id}>
                  {firstLesson ? (
                    <div className="mx-3 mb-1 mt-0.5 font-mono text-[10px] uppercase tracking-wide text-muted">
                      建構演變
                    </div>
                  ) : firstPanorama ? (
                    <div className="mx-3 mb-1 mt-1.5 border-t border-border/50 pt-1.5 font-mono text-[10px] uppercase tracking-wide text-muted">
                      全景
                    </div>
                  ) : null}
                <button
                  type="button"
                  role="menuitem"
                  disabled={locked}
                  aria-disabled={locked}
                  onClick={() => {
                    if (locked) return;
                    navigate(`/${s.id}`);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors ${
                    locked
                      ? "cursor-not-allowed text-muted"
                      : "text-fg hover:bg-bg"
                  } ${active ? "font-semibold" : ""}`}
                >
                  <span className="truncate">{s.title}</span>
                  {locked ? (
                    <svg
                      viewBox="0 0 24 24"
                      className="ml-auto h-3.5 w-3.5 shrink-0 text-muted"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-label="鎖定"
                    >
                      <rect x="5" y="11" width="14" height="10" rx="2" />
                      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                    </svg>
                  ) : active ? (
                    <span
                      aria-hidden="true"
                      className="ml-auto h-2 w-2 shrink-0 rounded-full bg-accent shadow-[0_0_8px_1px] shadow-accent"
                    />
                  ) : null}
                </button>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
