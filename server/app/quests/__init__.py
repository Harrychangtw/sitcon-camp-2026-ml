"""Quest registry — the single server-side source of truth for every station's
quests (see base.py for the Quest contract; answers/verifiers never leave this
package).

Station keys are the CLIENT station ids (apps/course2/src/stations/registry.tsx),
module names their snake_case twins. Each station session fills in ONLY its own
module; this registry and the surrounding framework stay untouched.
"""

from __future__ import annotations

from typing import Optional

from .base import EvidenceError, Quest, QuestKind
from . import (
    embedding,
    next_token,
    pixel_shuffle,
    rnn,
    tokenizer,
    transformer,
)

__all__ = [
    "EvidenceError",
    "Quest",
    "QuestKind",
    "STATION_QUESTS",
    "quest_by_id",
    "quest_totals",
]

STATION_QUESTS: dict[str, list[Quest]] = {
    "tokenizer": tokenizer.QUESTS,
    "embedding": embedding.QUESTS,
    "pixel-shuffle": pixel_shuffle.QUESTS,
    "next-token": next_token.QUESTS,
    "rnn-viz": rnn.QUESTS,
    "transformer": transformer.QUESTS,
}


def _validate_registry() -> None:
    """Boot-time check (import runs at server start): malformed or duplicate
    quest definitions fail loudly with the offending station/id named."""
    for station, quests in STATION_QUESTS.items():
        seen: set[str] = set()
        for quest in quests:
            quest.validate(station)
            if quest.id in seen:
                raise SystemExit(
                    f"camp-server: duplicate quest id {station}/{quest.id}"
                )
            seen.add(quest.id)


_validate_registry()


def quest_by_id(station: str, quest_id: str) -> Optional[Quest]:
    for quest in STATION_QUESTS.get(station, []):
        if quest.id == quest_id:
            return quest
    return None


def quest_totals() -> dict[str, int]:
    """Quests per station — the denominators for the leaderboard's
    per-station completion dots."""
    return {station: len(quests) for station, quests in STATION_QUESTS.items()}
