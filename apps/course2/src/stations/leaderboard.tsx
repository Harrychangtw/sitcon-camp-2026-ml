import { useEffect, useState } from "react";
import { StationLayout } from "@camp/ui";
import {
  fetchLeaderboard,
  type LeaderboardData,
  type LeaderboardEntry,
  type LeaderboardTeam,
} from "../lib/quests";
import { stations } from "./registry";

/**
 * 排行榜 — the quest leaderboard (backend: GET /leaderboard, quest system:
 * lib/quests.ts + components/QuestDock.tsx).
 *
 * Two tabs: 小隊 (default; big type, this is the projector view) and 個人
 * (per-student points, ★ and per-station completion dots). Registered in the
 * "meta" group so it is always visible in the nav and never touched by the
 * lesson progression lock. Polls on an interval + tab focus (the
 * lib/progression pattern); offline or logged out it degrades to a one-line
 * note — the leaderboard is a layer, never a gate.
 */

// ≥ 10 s per the spec: forty screens polling any faster buys nothing.
const POLL_MS = 10_000;

/**
 * Lesson stations in teaching order, for the completion dots. Read LAZILY (at
 * render time, never at module init): registry.tsx imports this page, so a
 * module-level read of `stations` here would hit the import cycle's temporal
 * dead zone and crash the whole bundle. lib/progression's `lessonStations`
 * reads at module init for the same reason, so it can't be imported here.
 */
function lessonStations() {
  return stations.filter((s) => s.group === "lesson");
}

type View =
  | { state: "loading" }
  | { state: "ready"; data: LeaderboardData }
  | { state: "offline" };

export function LeaderboardStation() {
  const [view, setView] = useState<View>({ state: "loading" });
  const [tab, setTab] = useState<"teams" | "individuals">("teams");

  useEffect(() => {
    let alive = true;
    const tick = () => {
      void fetchLeaderboard().then((out) => {
        if (!alive) return;
        setView(out.ok ? { state: "ready", data: out.data } : { state: "offline" });
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
    <StationLayout title="排行榜" controls={null}>
      <div className="mx-auto flex h-full max-w-3xl flex-col gap-4 pt-14">
        <div className="flex items-center justify-between gap-3">
          <div className="flex gap-1 rounded-md border border-border bg-panel p-1">
            {(
              [
                { key: "teams", label: "小隊" },
                { key: "individuals", label: "個人" },
              ] as const
            ).map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                aria-pressed={tab === key}
                className={`min-h-9 rounded px-4 font-mono text-sm uppercase tracking-wide transition-colors ${
                  tab === key
                    ? "bg-accent font-semibold text-bg"
                    : "text-muted hover:text-fg"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="font-mono text-[10px] uppercase tracking-wide text-muted">
            {view.state === "ready"
              ? "每 10 秒自動更新"
              : view.state === "offline"
                ? "離線"
                : "載入中"}
          </div>
        </div>

        {view.state === "offline" ? (
          <p className="text-sm text-muted">
            連不上伺服器，排行榜暫時看不到。等網路恢復就會自己回來。
          </p>
        ) : null}

        {view.state === "ready" ? (
          tab === "teams" ? (
            <TeamBoard teams={view.data.teams} />
          ) : (
            <IndividualBoard
              individuals={view.data.individuals}
              questTotals={view.data.questTotals}
            />
          )
        ) : null}
      </div>
    </StationLayout>
  );
}

/** "3" → 第 3 小隊; anything non-numeric (e.g. 未分組) passes through. */
function teamLabel(group: string): string {
  return /^\d+$/.test(group) ? `第 ${group} 小隊` : group;
}

function TeamBoard({ teams }: { teams: LeaderboardTeam[] }) {
  if (teams.length === 0) {
    return <Empty>還沒有小隊得分。到各站完成任務，幫小隊搶下第一分！</Empty>;
  }
  return (
    <ol className="flex flex-col gap-2 pb-6">
      {teams.map((team, i) => (
        <li
          key={team.group}
          className={`flex items-center gap-4 rounded-lg border px-5 py-4 ${
            i === 0 ? "border-accent bg-panel" : "border-border bg-panel"
          }`}
        >
          <span
            className={`w-10 shrink-0 font-mono text-2xl font-semibold tabular-nums ${
              i === 0 ? "text-accent" : "text-muted"
            }`}
          >
            {String(i + 1).padStart(2, "0")}
          </span>
          <span className="min-w-0 flex-1 truncate text-2xl font-semibold md:text-3xl">
            {teamLabel(team.group)}
          </span>
          {team.stars > 0 ? (
            <span className="shrink-0 font-mono text-lg text-accent">
              ★{team.stars}
            </span>
          ) : null}
          <span
            className={`shrink-0 font-mono text-3xl font-semibold tabular-nums md:text-4xl ${
              i === 0 ? "text-accent" : "text-fg"
            }`}
          >
            {team.points}
          </span>
        </li>
      ))}
    </ol>
  );
}

function IndividualBoard({
  individuals,
  questTotals,
}: {
  individuals: LeaderboardEntry[];
  questTotals: Record<string, number>;
}) {
  if (individuals.length === 0) {
    return <Empty>還沒有人得分。打開任一站右上角的「任務」，完成第一個吧！</Empty>;
  }
  return (
    <ol className="flex flex-col gap-1.5 pb-6">
      {individuals.map((entry, i) => (
        <li
          key={entry.name}
          className="flex items-center gap-3 rounded-md border border-border bg-panel px-4 py-2.5"
        >
          <span
            className={`w-8 shrink-0 font-mono text-sm tabular-nums ${
              i === 0 ? "text-accent" : "text-muted"
            }`}
          >
            {String(i + 1).padStart(2, "0")}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">
              {entry.name}
            </span>
            <span className="block font-mono text-[10px] uppercase tracking-wide text-muted">
              {teamLabel(entry.group)}
            </span>
          </span>
          <StationDots stations={entry.stations} questTotals={questTotals} />
          {entry.stars > 0 ? (
            <span className="shrink-0 font-mono text-sm text-accent">
              ★{entry.stars}
            </span>
          ) : null}
          <span className="w-10 shrink-0 text-right font-mono text-lg font-semibold tabular-nums">
            {entry.points}
          </span>
        </li>
      ))}
    </ol>
  );
}

/**
 * One dot per lesson station, in teaching order: hollow = untouched, half
 * (muted fill) = some quests done, lime = all of that station's quests done.
 */
function StationDots({
  stations,
  questTotals,
}: {
  stations: Record<string, number>;
  questTotals: Record<string, number>;
}) {
  return (
    <span className="hidden shrink-0 items-center gap-1 sm:flex">
      {lessonStations().map((s) => {
        const total = questTotals[s.id] ?? 0;
        const done = stations[s.id] ?? 0;
        const cls =
          total > 0 && done >= total
            ? "bg-accent border-accent"
            : done > 0
              ? "bg-muted border-muted"
              : "bg-transparent border-border";
        return (
          <span
            key={s.id}
            title={`${s.title}：${done}/${total}`}
            className={`h-2 w-2 rounded-full border ${cls}`}
          />
        );
      })}
    </span>
  );
}

function Empty({ children }: { children: string }) {
  return (
    <p className="rounded-md border border-border/50 bg-panel px-4 py-6 text-center text-sm text-muted">
      {children}
    </p>
  );
}
