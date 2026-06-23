import { NavLink } from "react-router-dom";
import { stations, type StationGroup } from "../stations/registry";

const groups: ReadonlyArray<{ key: StationGroup; label: string }> = [
  { key: "lesson", label: "Course 2 · Stations" },
  { key: "dev", label: "Developer" },
];

/** Persistent left sidebar that switches between registered stations. */
export function Sidebar() {
  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-border bg-panel">
      <div className="border-b border-border px-4 py-4">
        <p className="text-sm font-semibold">SITCON Camp 2026 · ML</p>
        <p className="text-xs text-muted">Course 2 · MLP → RNN → Transformer</p>
      </div>
      <nav className="flex-1 overflow-y-auto p-2">
        {groups.map((g) => {
          const items = stations.filter((s) => s.group === g.key);
          if (items.length === 0) return null;
          return (
            <div key={g.key} className="mb-4">
              <p className="px-2 pb-1 font-mono text-[10px] uppercase tracking-wide text-muted">
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
