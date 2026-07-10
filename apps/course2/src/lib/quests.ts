/**
 * Client side of the quest system (backend: server/app/routers/quests.py).
 *
 * Same philosophy as lib/auth.ts and @camp/data's liveInfer: NOTHING here ever
 * throws, and every failure resolves to a tagged outcome so the quest UI can
 * degrade quietly. Quests are an optional layer over the stations — with no
 * live server configured, an unreachable server, or a logged-out session, the
 * stations keep working exactly as before and the quest dock shows a one-line
 * muted note (or nothing). The MCQ answers and hunt verifiers live server-side
 * only; this module moves public quest shapes and attempt outcomes around.
 */

import { liveInferenceUrl } from "@camp/data";

export type QuestKind = "hunt" | "mcq";

/** One quest in its public shape + this student's status (server-derived). */
export interface QuestInfo {
  id: string;
  kind: QuestKind;
  title: string;
  prompt: string;
  choices: string[];
  points: number;
  done: boolean;
  firstTry: boolean;
}

/** Outcome of one attempt (server-verified; `points` is what THIS attempt scored). */
export interface AttemptResult {
  correct: boolean;
  done: boolean;
  points: number;
  firstTry: boolean;
}

/** The caller's own standing: the only per-person scoring the server ever
 * sends. Other people's names never ride the leaderboard payload. */
export interface LeaderboardMe {
  group: string;
  points: number;
  stars: number;
  rank: number;
  of: number;
  stations: Record<string, number>;
}

export interface LeaderboardTeam {
  group: string;
  members: number;
  points: number;
  stars: number;
  lastScoreAt: number | null;
  /** Per-member point totals, sorted descending, anonymous. */
  memberPoints: number[];
}

export interface LeaderboardData {
  teams: LeaderboardTeam[];
  me: LeaderboardMe | null;
  questTotals: Record<string, number>;
  generatedAt: number;
}

/**
 * Why a quest call yielded no data:
 * - `offline`: no server configured / unreachable / 5xx / rate-limited. The
 *   quest layer hides with a quiet note; the station itself is unaffected.
 * - `unauthorized`: server reachable but no valid session (401). The next live
 *   inference call re-shows the login screen (liveInfer's handler); the quest
 *   UI just treats it like offline.
 */
export type QuestFailReason = "offline" | "unauthorized";

export type QuestsOutcome =
  | { ok: true; quests: QuestInfo[] }
  | { ok: false; reason: QuestFailReason };

export type AttemptOutcome =
  | { ok: true; result: AttemptResult }
  /** 429 with Retry-After — the wrong-attempt cooldown; try again in `retryAfterS`. */
  | { ok: false; reason: "cooldown"; retryAfterS: number }
  /** 4xx — this submission was rejected (malformed evidence, unknown quest). */
  | { ok: false; reason: "rejected"; detail?: string }
  | { ok: false; reason: QuestFailReason };

export type LeaderboardOutcome =
  | { ok: true; data: LeaderboardData }
  | { ok: false; reason: QuestFailReason };

/** The evidence a station gathers from its canvas for one hunt quest. */
export type HuntEvidence = Record<string, unknown>;

async function questFetch(
  path: string,
  init?: RequestInit,
): Promise<{ res: Response } | { reason: "offline" }> {
  const base = liveInferenceUrl();
  if (!base) return { reason: "offline" };
  try {
    const res = await fetch(`${base}${path}`, {
      // The HttpOnly session cookie minted by /auth rides along; no secret
      // lives in the bundle.
      credentials: "include",
      ...init,
    });
    return { res };
  } catch {
    return { reason: "offline" };
  }
}

function failReason(res: Response): QuestFailReason {
  return res.status === 401 ? "unauthorized" : "offline";
}

/** The station's quest list with this student's status. Never throws. */
export async function fetchQuests(station: string): Promise<QuestsOutcome> {
  const out = await questFetch(`/quests/${encodeURIComponent(station)}`);
  if ("reason" in out) return { ok: false, reason: out.reason };
  const { res } = out;
  if (!res.ok) return { ok: false, reason: failReason(res) };
  try {
    const body = (await res.json()) as { quests?: QuestInfo[] };
    return { ok: true, quests: body.quests ?? [] };
  } catch {
    return { ok: false, reason: "offline" };
  }
}

/**
 * Submit one attempt: `{choice}` for an MCQ, `{evidence}` for a hunt. The
 * server verifies and scores; the response is authoritative. Never throws.
 */
export async function submitAttempt(
  station: string,
  questId: string,
  body: { choice: number } | { evidence: HuntEvidence },
): Promise<AttemptOutcome> {
  const out = await questFetch(
    `/quests/${encodeURIComponent(station)}/${encodeURIComponent(questId)}/attempt`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if ("reason" in out) return { ok: false, reason: out.reason };
  const { res } = out;
  if (res.status === 429) {
    const retryAfterS = Number.parseInt(res.headers.get("Retry-After") ?? "", 10);
    return {
      ok: false,
      reason: "cooldown",
      retryAfterS: Number.isFinite(retryAfterS) ? retryAfterS : 5,
    };
  }
  if (res.status === 401) return { ok: false, reason: "unauthorized" };
  if (res.status >= 500) return { ok: false, reason: "offline" };
  if (!res.ok) {
    let detail: string | undefined;
    try {
      const body = (await res.json()) as { detail?: unknown };
      if (typeof body.detail === "string") detail = body.detail;
    } catch {
      /* non-JSON error body */
    }
    return { ok: false, reason: "rejected", detail };
  }
  try {
    return { ok: true, result: (await res.json()) as AttemptResult };
  } catch {
    return { ok: false, reason: "offline" };
  }
}

/** The current rankings. Never throws. */
export async function fetchLeaderboard(): Promise<LeaderboardOutcome> {
  const out = await questFetch("/leaderboard");
  if ("reason" in out) return { ok: false, reason: out.reason };
  const { res } = out;
  if (!res.ok) return { ok: false, reason: failReason(res) };
  try {
    return { ok: true, data: (await res.json()) as LeaderboardData };
  } catch {
    return { ok: false, reason: "offline" };
  }
}
