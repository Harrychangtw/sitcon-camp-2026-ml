"""The Quest type every station quest module builds from.

A quest is one small, verifiable goal inside a station canvas. Two kinds:

- ``hunt``: a scavenger goal the student completes ON the canvas ("find a word
  that splits into 4+ tokens"). The station submits *evidence* (the word, the
  index, the (layer, head) pair, …) and the server re-derives the claim with
  the SAME model code the inference routers use. ``verify`` is that check.
- ``mcq``: one Duolingo-style multiple-choice question, answerable from what
  the canvas shows. ``choices`` are shipped to the client; ``answer`` (the
  correct index) NEVER is.

Answers and verifiers live only in these server-side modules — the client
bundle carries the public fields (id/kind/title/prompt/choices/points) and
nothing else (see routers/quests.py).

Points contract (scoring in routers/quests.py):
- hunt: ``points`` (normally 1) on the first correct completion.
- mcq: ``points`` is the FIRST-TRY award (normally 2 → a ★); a correct answer
  after any wrong attempt scores 1. Repeat completions always score 0.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Callable, Literal, Optional

if TYPE_CHECKING:  # only for type hints — no model import at runtime here
    from ..loader import ModelStore

QuestKind = Literal["hunt", "mcq"]


class EvidenceError(ValueError):
    """Raised by a hunt ``verify`` when the submitted evidence is malformed
    (wrong shape / types / out of the allowed size). Turns into a 422 for the
    client; the message must not hint at the answer."""


@dataclass(frozen=True)
class Quest:
    """One quest. ``title``/``prompt`` are student-facing 正體中文 (no
    em-dashes, imperative and concrete — see the copy rules in the session
    spec)."""

    id: str
    kind: QuestKind
    title: str
    prompt: str
    points: int
    # mcq only — the choice strings shown to the student, and the correct index.
    choices: tuple[str, ...] = ()
    answer: Optional[int] = None
    # hunt only — re-derive the claim from `evidence` with the same model code
    # the inference routers use. Must return True/False; raise EvidenceError on
    # malformed input. Runs WITHOUT the gpu_slot guard, so grab store.lm_lock
    # around any model forward, exactly like the routers do.
    verify: Optional[Callable[[dict, "ModelStore"], bool]] = field(
        default=None, compare=False
    )

    def validate(self, station: str) -> None:
        """Fail loudly (at import, via the registry) on a malformed definition
        so a Phase B mistake surfaces at boot, not at a student's first tap."""
        problems: list[str] = []
        if not self.id or "/" in self.id:
            problems.append("id must be a non-empty slug without '/'")
        if self.points <= 0:
            problems.append("points must be positive")
        if self.kind == "mcq":
            if len(self.choices) < 2:
                problems.append("mcq needs at least 2 choices")
            if self.answer is None or not (0 <= self.answer < len(self.choices)):
                problems.append("mcq answer must index into choices")
            if self.verify is not None:
                problems.append("mcq must not define verify (answer check is built in)")
        elif self.kind == "hunt":
            if self.verify is None:
                problems.append("hunt needs a verify callable")
            if self.choices or self.answer is not None:
                problems.append("hunt must not define choices/answer")
        else:
            problems.append(f"unknown kind {self.kind!r}")
        if problems:
            raise SystemExit(
                f"camp-server: quest {station}/{self.id or '?'} is malformed: "
                + "; ".join(problems)
            )
