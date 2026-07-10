"""Quest routes: list a station's quests, record a verified attempt, and the
individual + 小隊 leaderboard.

Guarded in main.py by session + rate limit but NOT the gpu_slot (these are not
inference routes; hunt verifiers that do run a model forward take
store.lm_lock exactly like the inference routers, so the GPU stays serialized
either way, and the wrong-attempt cooldown damps repeat verification).

Anti-cheat posture (decisions from the session spec):
- MCQ answers and hunt verifiers live only in app/quests/* — a wrong answer
  returns `correct: false` and nothing else.
- Scoring is server-derived from the attempt log (app/quests/storage.py):
  idempotent completions, log-derived firstTry, ~5 s cooldown after a wrong
  attempt on the same quest.
- Staff/admin attempts are accepted (so the flow is testable) but the
  leaderboard ranks students only.
"""

from __future__ import annotations

import json
import logging
import time

from fastapi import APIRouter, HTTPException, Request

from ..groups import UNGROUPED
from ..quests import STATION_QUESTS, EvidenceError, Quest, quest_by_id, quest_totals
from ..quests.storage import (
    WRONG_ATTEMPT_COOLDOWN_S,
    QuestLog,
    UserProgress,
    award,
    load_progress,
)
from ..schemas import (
    LeaderboardEntry,
    LeaderboardResponse,
    LeaderboardTeam,
    QuestAttemptRequest,
    QuestAttemptResponse,
    QuestListResponse,
    QuestPublic,
)

log = logging.getLogger("camp.server.quests")

router = APIRouter(tags=["quests"])

# Hunt evidence is a handful of words/indices; anything bigger is not a
# legitimate submission. Bounded so a verifier can never be fed megabytes.
_MAX_EVIDENCE_CHARS = 2000


def _station_or_404(station: str) -> list[Quest]:
    quests = STATION_QUESTS.get(station)
    if quests is None:
        raise HTTPException(status_code=404, detail="unknown station")
    return quests


@router.get("/quests/{station}", response_model=QuestListResponse)
def list_quests(station: str, request: Request) -> QuestListResponse:
    """The station's quests in their public shape, with THIS caller's
    done/firstTry status folded in."""
    quests = _station_or_404(station)
    ident = request.state.camp_identity
    usage_dir = request.app.state.quests_usage_dir
    progress = load_progress(usage_dir).get(ident.username, UserProgress())
    return QuestListResponse(
        station=station,
        quests=[
            QuestPublic(
                id=q.id,
                kind=q.kind,
                title=q.title,
                prompt=q.prompt,
                choices=list(q.choices),
                points=q.points,
                done=progress.state(station, q.id).done,
                firstTry=progress.state(station, q.id).first_try,
            )
            for q in quests
        ],
    )


@router.post(
    "/quests/{station}/{quest_id}/attempt", response_model=QuestAttemptResponse
)
def attempt(
    station: str,
    quest_id: str,
    req: QuestAttemptRequest,
    request: Request,
) -> QuestAttemptResponse:
    _station_or_404(station)
    quest = quest_by_id(station, quest_id)
    if quest is None:
        raise HTTPException(status_code=404, detail="unknown quest")

    ident = request.state.camp_identity
    usage_dir = request.app.state.quests_usage_dir
    quest_log: QuestLog = request.app.state.quest_log

    progress = load_progress(usage_dir).get(ident.username, UserProgress())
    state = progress.state(station, quest_id)

    # Idempotent: already done → confirm, score nothing, log nothing new.
    if state.done:
        return QuestAttemptResponse(
            correct=True, done=True, points=0, firstTry=state.first_try
        )

    # Cooldown after a wrong attempt on this quest (see storage.py).
    if state.last_wrong_ts is not None:
        remaining = WRONG_ATTEMPT_COOLDOWN_S - (time.time() - state.last_wrong_ts)
        if remaining > 0:
            raise HTTPException(
                status_code=429,
                detail="再等幾秒，想清楚再回答",
                headers={"Retry-After": str(int(remaining) + 1)},
            )

    if quest.kind == "mcq":
        if req.choice is None:
            raise HTTPException(status_code=422, detail="mcq attempt needs a choice")
        correct = req.choice == quest.answer
    else:
        if req.evidence is None:
            raise HTTPException(
                status_code=422, detail="hunt attempt needs evidence"
            )
        try:
            if len(json.dumps(req.evidence, ensure_ascii=False)) > _MAX_EVIDENCE_CHARS:
                raise HTTPException(status_code=422, detail="evidence too large")
        except (TypeError, ValueError):
            raise HTTPException(status_code=422, detail="evidence not serializable")
        assert quest.verify is not None  # registry validation guarantees it
        try:
            correct = bool(quest.verify(req.evidence, request.app.state.store))
        except EvidenceError as exc:
            # Author-written message; the base.py contract forbids answer hints.
            raise HTTPException(status_code=422, detail=str(exc))
        except HTTPException:
            raise
        except Exception:
            # A verifier crash is a server bug, never the student's fault —
            # log it loudly, fail the attempt safely.
            log.exception(
                "quest verify crashed: %s/%s (user %s)",
                station,
                quest_id,
                ident.username,
            )
            raise HTTPException(
                status_code=422, detail="這筆回報無法驗證，換個例子試試"
            )

    first_try = correct and state.attempts == 0
    points = award(quest, first_try) if correct else 0
    quest_log.record(
        user=ident.username,
        role=ident.role,
        station=station,
        quest=quest_id,
        kind=quest.kind,
        correct=correct,
        points_awarded=points,
        first_try=first_try,
    )
    return QuestAttemptResponse(
        correct=correct, done=correct, points=points, firstTry=first_try
    )


@router.get("/leaderboard", response_model=LeaderboardResponse)
def leaderboard(request: Request) -> LeaderboardResponse:
    """Individual + 小隊 rankings. Students and 隊輔 rank (mentors score for
    their own team so the flow is testable end to end); staff/admin attempts
    are accepted but never rank. Sorted by points desc, ties broken by the
    EARLIER last point-scoring event; teams aggregate their members the same
    way. Any logged-in session may read this — it powers the projector too."""
    usage_dir = request.app.state.quests_usage_dir
    groups: dict[str, str] = request.app.state.groups

    individuals: list[LeaderboardEntry] = []
    teams: dict[str, LeaderboardTeam] = {}
    for user, progress in load_progress(usage_dir).items():
        if progress.role not in ("student", "mentor"):
            continue
        points, stars, last_score_ts, by_station = progress.score()
        group = groups.get(user, UNGROUPED)
        individuals.append(
            LeaderboardEntry(
                name=user,
                group=group,
                points=points,
                stars=stars,
                lastScoreAt=last_score_ts,
                stations=by_station,
            )
        )
        team = teams.setdefault(
            group,
            LeaderboardTeam(group=group, members=0, points=0, stars=0),
        )
        team.members += 1
        team.points += points
        team.stars += stars
        if last_score_ts is not None:
            team.lastScoreAt = (
                last_score_ts
                if team.lastScoreAt is None
                else max(team.lastScoreAt, last_score_ts)
            )

    def rank_key(row: LeaderboardEntry | LeaderboardTeam) -> tuple:
        # Earlier last-scoring event wins the tie; no score at all sorts last.
        tiebreak = row.lastScoreAt if row.lastScoreAt is not None else float("inf")
        name = row.name if isinstance(row, LeaderboardEntry) else row.group
        return (-row.points, tiebreak, name)

    return LeaderboardResponse(
        individuals=sorted(individuals, key=rank_key),
        teams=sorted(teams.values(), key=rank_key),
        questTotals=quest_totals(),
        generatedAt=round(time.time(), 3),
    )
