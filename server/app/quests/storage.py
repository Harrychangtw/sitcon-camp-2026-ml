"""Quest attempt log (JSONL) + the aggregation behind quest status and the
leaderboard. Copies the usage.py multi-replica pattern verbatim: one
``quests-<port>.jsonl`` per replica under USAGE_DIR, one JSON line per attempt,
and every read walks ALL replicas' files so any replica behind the load
balancer can answer box-wide.

Line shape:
    {"ts": 1752130000.123, "user": "曹品浩", "role": "student",
     "station": "tokenizer", "quest": "split-4", "kind": "hunt",
     "correct": true, "pointsAwarded": 1, "firstTry": true}

Scoring is DERIVED from the raw lines on every read, not trusted from the
recorded pointsAwarded: for each (user, station, quest) only the earliest
correct attempt counts, its award recomputed from the quest definition and
whether any wrong attempt preceded it. Duplicate lines (a double-submit racing
two replicas) therefore cannot double-score, and the client can claim nothing;
`firstTry`/`pointsAwarded` in the line are a convenience for the TUI/greppers.

Scale check: a camp class is ~40 students × a few dozen attempts each, so the
box-wide log is thousands of lines; re-reading and sorting it per request is
well inside budget (the usage TUI re-reads bigger files on a timer already).
"""

from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterator, Optional

from . import STATION_QUESTS
from .base import Quest

log = logging.getLogger("camp.server.quests")

# Seconds a student must wait after a WRONG attempt on the same quest before
# the next attempt is accepted. Blunts brute-forcing a 4-choice MCQ, and
# bounds how fast wrong hunt evidence can make the server re-run model code
# (quest routes deliberately skip the gpu_slot guard; verifies serialize on
# lm_lock like every router, so this cooldown is the request-side damper).
WRONG_ATTEMPT_COOLDOWN_S = 5.0


class QuestLog:
    """Appender for THIS replica's quest attempts. Never raises: losing one
    line must not fail a student's attempt (same contract as usage.UsageLog)."""

    def __init__(self, usage_dir: Path, port: int) -> None:
        usage_dir.mkdir(parents=True, exist_ok=True)
        self._path = usage_dir / f"quests-{port}.jsonl"

    def record(
        self,
        *,
        user: str,
        role: str,
        station: str,
        quest: str,
        kind: str,
        correct: bool,
        points_awarded: int,
        first_try: bool,
    ) -> None:
        event = {
            "ts": round(time.time(), 3),
            "user": user[:80],
            "role": role,
            "station": station,
            "quest": quest,
            "kind": kind,
            "correct": correct,
            "pointsAwarded": points_awarded,
            "firstTry": first_try,
        }
        try:
            with self._path.open("a", encoding="utf-8") as fh:
                fh.write(json.dumps(event, ensure_ascii=False) + "\n")
        except OSError as exc:
            log.warning("quest log append failed (%s): %s", self._path, exc)


def iter_attempts(usage_dir: Path) -> Iterator[dict]:
    """Yield every parseable attempt from every replica's file. Malformed
    lines are skipped, not fatal (same contract as usage.iter_events)."""
    for path in sorted(usage_dir.glob("quests-*.jsonl")):
        try:
            with path.open(encoding="utf-8") as fh:
                for line in fh:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        event = json.loads(line)
                    except ValueError:
                        continue
                    if isinstance(event, dict):
                        yield event
        except OSError:
            continue


@dataclass
class QuestState:
    """One (user, station, quest)'s derived state."""

    attempts: int = 0
    wrong_before_first_correct: int = 0
    first_correct_ts: Optional[float] = None
    last_wrong_ts: Optional[float] = None

    @property
    def done(self) -> bool:
        return self.first_correct_ts is not None

    @property
    def first_try(self) -> bool:
        return self.done and self.wrong_before_first_correct == 0


def award(quest: Quest, first_try: bool) -> int:
    """Points for a first completion: hunts pay `points` regardless of
    retries; MCQs pay `points` (the ★ award) only first-try, else 1."""
    if quest.kind == "mcq":
        return quest.points if first_try else 1
    return quest.points


@dataclass
class UserProgress:
    """Everything derived for one user: per-quest state + the leaderboard
    numbers (points / stars / per-station done counts / tiebreak ts)."""

    role: str = "student"
    quests: dict[tuple[str, str], QuestState] = field(default_factory=dict)

    def state(self, station: str, quest_id: str) -> QuestState:
        return self.quests.get((station, quest_id), QuestState())

    def score(self) -> tuple[int, int, Optional[float], dict[str, int]]:
        """(points, stars, ts of the LAST point-scoring event, done-per-station).
        Only quests still in the registry count — a renamed/removed quest id
        stops scoring instead of scoring from a stale definition."""
        points = 0
        stars = 0
        last_score_ts: Optional[float] = None
        by_station: dict[str, int] = {}
        for (station, quest_id), state in self.quests.items():
            ts = state.first_correct_ts
            if ts is None:
                continue
            quest = _registry_quest(station, quest_id)
            if quest is None:
                continue
            points += award(quest, state.first_try)
            if quest.kind == "mcq" and state.first_try:
                stars += 1
            by_station[station] = by_station.get(station, 0) + 1
            last_score_ts = ts if last_score_ts is None else max(last_score_ts, ts)
        return points, stars, last_score_ts, by_station


def _registry_quest(station: str, quest_id: str) -> Optional[Quest]:
    for quest in STATION_QUESTS.get(station, []):
        if quest.id == quest_id:
            return quest
    return None


def load_progress(usage_dir: Path) -> dict[str, UserProgress]:
    """Fold every replica's attempt lines into per-user derived state. Events
    are sorted by ts first so "wrong before the first correct" is exact even
    though replicas' files interleave arbitrarily."""

    def event_ts(ev: dict) -> float:
        try:
            return float(ev.get("ts", 0.0))
        except (TypeError, ValueError):
            return 0.0

    users: dict[str, UserProgress] = {}
    for ev in sorted(iter_attempts(usage_dir), key=event_ts):
        user = str(ev.get("user", "")).strip()
        station = str(ev.get("station", ""))
        quest_id = str(ev.get("quest", ""))
        if not user or not station or not quest_id:
            continue
        ts = event_ts(ev)
        progress = users.setdefault(user, UserProgress())
        progress.role = str(ev.get("role", progress.role))
        state = progress.quests.setdefault((station, quest_id), QuestState())
        state.attempts += 1
        if bool(ev.get("correct", False)):
            if state.first_correct_ts is None:
                state.first_correct_ts = ts
        else:
            state.last_wrong_ts = ts
            if state.first_correct_ts is None:
                state.wrong_before_first_correct += 1
    return users
