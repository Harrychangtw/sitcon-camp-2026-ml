import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchQuests,
  submitAttempt,
  type HuntEvidence,
  type QuestInfo,
} from "../lib/quests";

/**
 * The shared quest panel every lesson station mounts (backend:
 * server/app/routers/quests.py; fetch layer: lib/quests.ts).
 *
 * A collapsed pill floats top-right over the canvas showing 任務 done/total
 * (+ ★ count); tapping it opens a checklist. Hunt quests carry a 回報 button
 * that submits whatever evidence the STATION gathered from its canvas (the
 * `collectEvidence` prop — the dock knows nothing about any lesson); MCQ
 * quests render their choices with immediate right/wrong feedback and the
 * server's wrong-attempt cooldown. All verification and scoring happen
 * server-side; this component only renders the outcomes.
 *
 * Degrade contract (same philosophy as lib/auth.ts): quests are a layer,
 * never a gate. No server / offline / logged out → a one-line muted note.
 * A station with no quests defined → renders nothing at all.
 */

export interface QuestDockProps {
  /** Station id as registered in stations/registry.tsx (= the server key). */
  station: string;
  /**
   * Called when the student taps 回報 on a hunt quest. Return the evidence
   * gathered from the current canvas state (a small JSON dict the server
   * re-verifies), or null when there is nothing to report yet — the dock then
   * shows `hint` for that quest instead of submitting.
   */
  collectEvidence?: (questId: string) => HuntEvidence | null;
  /** Shown when `collectEvidence` returns null. Station-specific wording wins. */
  hint?: string;
  /** Tailwind position override for the collapsed pill/panel anchor. */
  anchorClassName?: string;
}

type LoadState =
  | { state: "loading" }
  | { state: "ready"; quests: QuestInfo[] }
  | { state: "offline" };

interface QuestUi {
  submitting?: boolean;
  /** Feedback line under the quest (wrong answer, hint, reject detail). */
  note?: string;
  /** Epoch ms until which attempts are cooling down (server 429). */
  cooldownUntil?: number;
  /** Points this session just scored (transient "+N" flash). */
  justScored?: number;
}

const DEFAULT_HINT = "先在畫布上達成目標，再回來回報";

export function QuestDock({
  station,
  collectEvidence,
  hint = DEFAULT_HINT,
  anchorClassName = "right-3 top-3.5 md:right-4 md:top-4",
}: QuestDockProps) {
  const [load, setLoad] = useState<LoadState>({ state: "loading" });
  const [open, setOpen] = useState(false);
  const [ui, setUi] = useState<Record<string, QuestUi>>({});
  // 1 Hz tick while any cooldown is live, so countdowns re-render.
  const [, setTick] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(() => {
    void fetchQuests(station).then((out) => {
      setLoad(out.ok ? { state: "ready", quests: out.quests } : { state: "offline" });
    });
  }, [station]);

  useEffect(() => {
    refresh();
    // Re-sync on tab focus (a second device / a projector may have scored).
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  // Close on outside tap / Escape (same idiom as StationNav).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node))
        setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const anyCooldown =
    load.state === "ready" &&
    Object.values(ui).some((u) => (u.cooldownUntil ?? 0) > Date.now());
  useEffect(() => {
    if (!anyCooldown) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [anyCooldown]);

  const patchUi = (questId: string, patch: QuestUi) =>
    setUi((prev) => ({ ...prev, [questId]: { ...prev[questId], ...patch } }));

  async function attempt(
    quest: QuestInfo,
    body: { choice: number } | { evidence: HuntEvidence },
  ) {
    patchUi(quest.id, { submitting: true, note: undefined });
    const out = await submitAttempt(station, quest.id, body);
    if (out.ok) {
      const { result } = out;
      if (result.correct) {
        setLoad((prev) =>
          prev.state === "ready"
            ? {
                state: "ready",
                quests: prev.quests.map((q) =>
                  q.id === quest.id
                    ? { ...q, done: true, firstTry: result.firstTry }
                    : q,
                ),
              }
            : prev,
        );
        patchUi(quest.id, { submitting: false, justScored: result.points });
      } else {
        patchUi(quest.id, {
          submitting: false,
          note: quest.kind === "mcq" ? "還不對，再想一下" : "還不符合條件，再找找",
          cooldownUntil: Date.now() + 5000,
        });
      }
      return;
    }
    if (out.reason === "cooldown") {
      patchUi(quest.id, {
        submitting: false,
        cooldownUntil: Date.now() + out.retryAfterS * 1000,
      });
    } else if (out.reason === "rejected") {
      patchUi(quest.id, { submitting: false, note: out.detail ?? "這筆回報無法驗證" });
    } else {
      patchUi(quest.id, { submitting: false });
      setLoad({ state: "offline" });
    }
  }

  function report(quest: QuestInfo) {
    const evidence = collectEvidence?.(quest.id) ?? null;
    if (evidence === null) {
      patchUi(quest.id, { note: hint });
      return;
    }
    void attempt(quest, { evidence });
  }

  if (load.state === "loading") return null;

  if (load.state === "offline") {
    // Quests hide when the live server is unreachable or the session is gone;
    // the station itself keeps working untouched.
    return (
      <div
        className={`pointer-events-none fixed z-40 font-mono text-[10px] uppercase tracking-wide text-muted/70 ${anchorClassName}`}
      >
        任務離線中
      </div>
    );
  }

  const { quests } = load;
  if (quests.length === 0) return null;

  const doneCount = quests.filter((q) => q.done).length;
  const stars = quests.filter((q) => q.kind === "mcq" && q.done && q.firstTry).length;

  return (
    // `fixed`: stations mount this inside StationLayout's scrollable <main>,
    // and the pill must stay put while the canvas scrolls. CSS vars
    // (--dock-h) still inherit through the DOM tree regardless.
    <div ref={panelRef} className={`fixed z-40 ${anchorClassName}`}>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`flex min-h-11 items-center gap-2 rounded-md border px-3 font-mono text-xs uppercase tracking-wide shadow-md transition-colors md:min-h-9 ${
          open
            ? "border-accent bg-panel text-accent"
            : doneCount === quests.length
              ? "border-accent/60 bg-panel text-accent"
              : "border-border bg-panel text-fg hover:border-accent hover:text-accent"
        }`}
      >
        <span>任務</span>
        <span className={doneCount === quests.length ? "text-accent" : "text-muted"}>
          {doneCount}/{quests.length}
        </span>
        {stars > 0 ? <span className="text-accent">★{stars}</span> : null}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="任務清單"
          // Mobile: pin to the viewport edges and stay clear of the bottom
          // dock via --dock-h (published by StationLayout). Desktop: a fixed
          // width card under the pill.
          className="fixed inset-x-2 top-16 overflow-y-auto rounded-lg border border-border bg-panel shadow-lg md:absolute md:inset-x-auto md:right-0 md:top-full md:mt-2 md:w-[22rem]"
          style={{
            maxHeight: "min(60dvh, calc(100dvh - var(--dock-h, 0px) - 5.5rem))",
          }}
        >
          <div className="border-b border-border/50 px-4 py-2.5 font-mono text-[10px] uppercase tracking-wide text-muted">
            完成任務拿分數，第一次就答對的選擇題多拿一顆 ★
          </div>
          <ul className="divide-y divide-border/30">
            {quests.map((q) => (
              <QuestRow
                key={q.id}
                quest={q}
                ui={ui[q.id] ?? {}}
                onChoose={(choice) => void attempt(q, { choice })}
                onReport={() => report(q)}
              />
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function QuestRow({
  quest,
  ui,
  onChoose,
  onReport,
}: {
  quest: QuestInfo;
  ui: QuestUi;
  onChoose: (choice: number) => void;
  onReport: () => void;
}) {
  const cooldownS = ui.cooldownUntil
    ? Math.max(0, Math.ceil((ui.cooldownUntil - Date.now()) / 1000))
    : 0;
  const busy = Boolean(ui.submitting) || cooldownS > 0;

  return (
    <li className="px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide text-muted">
            <span>{quest.kind === "hunt" ? "尋寶" : "選擇"}</span>
            <span>·</span>
            <span>{quest.points} 分</span>
            {quest.done && quest.kind === "mcq" && quest.firstTry ? (
              <span className="text-accent">★</span>
            ) : null}
            {ui.justScored ? (
              <span className="text-accent">+{ui.justScored}</span>
            ) : null}
          </div>
          <div
            className={`mt-0.5 text-sm font-semibold ${
              quest.done ? "text-muted line-through" : "text-fg"
            }`}
          >
            {quest.title}
          </div>
          {!quest.done ? (
            <p className="mt-1 text-xs leading-relaxed text-muted">{quest.prompt}</p>
          ) : null}
        </div>
        {quest.done ? (
          <span aria-label="完成" className="mt-0.5 shrink-0 text-accent">
            ✓
          </span>
        ) : null}
      </div>

      {!quest.done && quest.kind === "mcq" ? (
        <div className="mt-2 flex flex-col gap-1.5">
          {quest.choices.map((choice, i) => (
            <button
              key={i}
              type="button"
              disabled={busy}
              onClick={() => onChoose(i)}
              className="min-h-11 rounded-md border border-border bg-bg px-3 py-2 text-left text-sm text-fg transition-colors enabled:hover:border-accent enabled:hover:text-accent disabled:opacity-50 md:min-h-9"
            >
              {choice}
            </button>
          ))}
        </div>
      ) : null}

      {!quest.done && quest.kind === "hunt" ? (
        <button
          type="button"
          disabled={busy}
          onClick={onReport}
          className="mt-2 min-h-11 rounded-md border border-accent/60 px-3 py-1.5 font-mono text-xs uppercase tracking-wide text-accent transition-opacity hover:opacity-80 disabled:opacity-40 md:min-h-8"
        >
          {ui.submitting ? "驗證中…" : "回報"}
        </button>
      ) : null}

      {!quest.done && cooldownS > 0 ? (
        <p className="mt-1.5 font-mono text-[10px] uppercase tracking-wide text-warning">
          等 {cooldownS} 秒再試
        </p>
      ) : ui.note && !quest.done ? (
        <p className="mt-1.5 text-xs text-warning">{ui.note}</p>
      ) : null}
    </li>
  );
}
