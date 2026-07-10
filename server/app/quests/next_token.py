"""Quests for the next-token station (id "next-token").

Hunts re-derive their evidence via the same code path as
routers/next_token.py: qwen.next_token_entries under store.lm_lock, full
context window, same skip-specials ranking the station displays. See base.py
for the Quest contract.

Anchor notes (decisions this module bakes in):
- guess-streak: evidence is THREE (context, guess) pairs. The server cannot
  see time, so "consecutive" is the station's honesty affordance (the student
  commits a guess before the bars are revealed; a miss resets the stored
  pairs). The server re-checks the hard part of the claim: every guess names
  the model's real top-1 piece for its context, and the contexts are distinct
  and non-trivial, so three empty or copy-pasted prompts can't game it.
- confident-context: top-1 probability is measured over the FULL vocab.
  next_token_entries returns log_softmax over the whole vocabulary, so the
  probability is exp(logit) of the first entry. This is slightly stricter
  than the station's displayed % (which renormalises over the top-N), which
  is the honest reading of "the model is >90% sure".
"""

from __future__ import annotations

import math
from typing import TYPE_CHECKING

from camp_precompute import qwen

from .base import EvidenceError, Quest

if TYPE_CHECKING:  # no model import at runtime here
    from ..loader import ModelStore

# Mirrors NextTokenRequest (schemas.py): prompt max_length=500.
_MAX_CONTEXT_CHARS = 500
# Shorter than this is a coin flip, not a sentence start; also stops
# near-empty prompts from gaming the hunts.
_MIN_CONTEXT_CHARS = 4
# Token pieces are short subwords; anything longer is not a guess.
_MAX_GUESS_CHARS = 32

_STREAK = 3
_CONFIDENT_P = 0.9


def _clean_context(raw: object) -> str:
    """Validate one submitted context. EvidenceError messages state the rule,
    never the answer."""
    if not isinstance(raw, str):
        raise EvidenceError("回報格式不對，請從畫布上的流程完成後再回報")
    ctx = raw.strip()
    if len(ctx) < _MIN_CONTEXT_CHARS:
        raise EvidenceError(f"前文太短，至少要 {_MIN_CONTEXT_CHARS} 個字")
    if len(ctx) > _MAX_CONTEXT_CHARS:
        raise EvidenceError("前文太長了，縮短一點再試")
    return ctx


def _top1(store: "ModelStore", context: str) -> dict:
    """The model's #1 next-token entry for a context: the same forward the
    /next-token/predict router runs (full window, specials skipped), under the
    same lm_lock discipline."""
    with store.lm_lock:
        entries = qwen.next_token_entries(store.qwen_tok, store.qwen_model, context)
    if not entries:
        raise EvidenceError("這段前文算不出結果，換一段試試")
    return entries[0]


def _guess_matches(guess: str, token: str) -> bool:
    """Does the guess name the SAME piece the station displays as #1?

    The station renders a leading space as ␣ and a newline as ⏎, so those
    substitutions are undone first; beyond that, only surrounding whitespace
    is forgiven ("the" counts for " the"). The client mirrors this exact rule
    when it decides whether a committed guess extends the streak."""
    g = guess.replace("␣", " ").replace("⏎", "\n")
    if g == token:
        return True
    if not g.strip() or not token.strip():
        return False
    return g.strip() == token.strip()


def _verify_guess_streak(evidence: dict, store: "ModelStore") -> bool:
    pairs = evidence.get("pairs")
    if not isinstance(pairs, list) or len(pairs) != _STREAK:
        raise EvidenceError(f"要先連續猜中 {_STREAK} 次，畫布會幫你記錄")
    cleaned: list[tuple[str, str]] = []
    for pair in pairs:
        if not isinstance(pair, dict):
            raise EvidenceError("回報格式不對，請從畫布上的流程完成後再回報")
        ctx = _clean_context(pair.get("context"))
        guess = pair.get("guess")
        if not isinstance(guess, str) or not guess.strip():
            raise EvidenceError("少了你猜的 token")
        if len(guess) > _MAX_GUESS_CHARS:
            raise EvidenceError("猜的 token 太長了")
        cleaned.append((ctx, guess))
    if len({ctx for ctx, _ in cleaned}) != len(cleaned):
        raise EvidenceError(f"{_STREAK} 次要用不一樣的前文")
    return all(
        _guess_matches(guess, _top1(store, ctx)["token"]) for ctx, guess in cleaned
    )


def _verify_confident_context(evidence: dict, store: "ModelStore") -> bool:
    ctx = _clean_context(evidence.get("context"))
    # entries carry log P over the FULL vocab (log_softmax in
    # next_token_entries), so exp() is the real probability.
    return math.exp(_top1(store, ctx)["logit"]) > _CONFIDENT_P


QUESTS: list[Quest] = [
    Quest(
        id="guess-streak",
        kind="hunt",
        title=f"連續 {_STREAK} 次猜中模型的第一名",
        points=1,
        prompt=(
            "按畫布中間的「我來猜下一個 token」：輸入一段前文，在答案揭曉前寫下"
            f"你猜的下一個 token，連續猜中 {_STREAK} 次第一名。猜錯就重新計算，"
            "而且每次要換不一樣的前文。試著比模型先想到它會說什麼。"
        ),
        verify=_verify_guess_streak,
    ),
    Quest(
        id="confident-context",
        kind="hunt",
        title="找一個讓模型超有把握的開頭",
        points=1,
        prompt=(
            "找出一段句子開頭，讓模型給第一名 token 的機率超過 90%。想想那種"
            "「只有一種接法」的句子，像詩句、數列或常見的固定說法。把上下文視窗"
            "調到「全部」，等結果出現再回報。"
        ),
        verify=_verify_confident_context,
    ),
    Quest(
        id="output-shape",
        kind="mcq",
        title="模型吐出來的到底是什麼",
        points=2,
        prompt="看畫布上那排長條。模型讀完你的前文之後，真正算出來的是什麼？",
        choices=(
            "唯一正確的下一個字",
            "對每個可能 token 的機率分布",
            "一段寫好的完整句子",
            "從字典裡隨機挑出來的一個詞",
        ),
        answer=1,
    ),
    Quest(
        id="window-shrink",
        kind="mcq",
        title="把上下文視窗縮小會怎樣",
        points=2,
        prompt=(
            "把「上下文視窗」滑桿往左拉，讓模型只看得到前文最後幾個 token，"
            "長條圖通常會怎麼變？"
        ),
        choices=(
            "完全不變，視窗只是裝飾",
            "機率一定全部集中到同一個 token",
            "線索變少，分布通常變平，模型變得比較不確定",
            "模型會拒絕預測，畫面變成空白",
        ),
        answer=2,
    ),
]
