import { useState } from "react";
import { NavLink } from "react-router-dom";
import { stations, type StationGroup } from "../stations/registry";

const groups: ReadonlyArray<{ key: StationGroup; label: string }> = [
  { key: "lesson", label: "Course 2 · Stations" },
  { key: "dev", label: "開發工具" },
];

/**
 * Persistent left sidebar that switches between registered stations.
 * Collapsible to a slim strip so the station canvas keeps the visual focus;
 * nav is only needed between stations, not while poking at one.
 */
export function Sidebar() {
  const [open, setOpen] = useState(true);

  if (!open) {
    return (
      <aside className="flex h-full w-9 shrink-0 flex-col items-center border-r border-border bg-panel">
        <button
          type="button"
          onClick={() => setOpen(true)}
          title="展開側邊欄"
          aria-label="展開側邊欄"
          className="mt-3 rounded border border-border px-1.5 py-1 font-mono text-[10px] text-muted transition-colors hover:bg-bg hover:text-fg"
        >
          »
        </button>
      </aside>
    );
  }

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-border bg-panel">
      <div className="flex items-start justify-between gap-2 border-b border-border px-4 py-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold">SITCON Camp 2026 · ML</p>
          <p className="text-xs text-muted">Course 2 · MLP → RNN → Transformer</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          title="收合側邊欄"
          aria-label="收合側邊欄"
          className="shrink-0 rounded border border-border px-1.5 py-1 font-mono text-[10px] text-muted transition-colors hover:bg-bg hover:text-fg"
        >
          «
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto p-2">
        {groups.map((g) => {
          const items = stations.filter((s) => s.group === g.key);
          if (items.length === 0) return null;
          return (
            <div key={g.key} className="mb-4">
              <p
                className={`px-2 pb-1 font-mono text-[10px] text-muted ${
                  // Han labels: drop uppercase (no-op) + letter-spacing (hurts CJK legibility).
                  /[一-鿿]/.test(g.label) ? "" : "uppercase tracking-wide"
                }`}
              >
                {g.label}
              </p>
              <ul className="flex flex-col gap-0.5">
                {items.map((s) => (
                  <li key={s.id}>
                    <NavLink
                      to={`/${s.id}`}
                      className={({ isActive }) =>
                        `flex items-center gap-2 rounded px-2 py-1.5 text-sm transition-colors ${
                          isActive
                            ? "bg-accent text-accent-fg"
                            : "text-fg hover:bg-bg"
                        }`
                      }
                    >
                      <span className="truncate">{s.title}</span>
                      {s.group === "dev" ? (
                        <span className="ml-auto rounded bg-warning/20 px-1 font-mono text-[9px] uppercase text-warning">
                          dev
                        </span>
                      ) : null}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
