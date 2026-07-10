"""Quests for the tokenizer station (id "tokenizer").

Hunts re-derive their evidence via the SAME code path as routers/tokenizer.py:
``qwen.tokenize_pieces(store.qwen_tok, ...)`` under ``store.lm_lock`` with
``add_special_tokens=False``, so the verifier counts exactly the chips the
canvas drew in live BPE mode. The station's ``collectEvidence`` only reports
when the live Qwen result is on screen (apps/course2/src/stations/tokenizer.tsx),
and a newline is its own token (id 198) that resets tokenization, so a word on
its own line tokenizes identically to the word submitted alone here.

See base.py for the Quest contract.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from camp_precompute import qwen

from .base import EvidenceError, Quest

if TYPE_CHECKING:  # only for type hints, no model import at runtime here
    from ..loader import ModelStore

# The station's input allows 500 chars, but a hunt claim is ONE word; anything
# longer is not a legitimate submission (and 30 chars is far above any real
# word the canvas renders as a single group).
_MAX_WORD_CHARS = 30

_BAD_WORD = "請回報一個詞：不能是空的、中間不能有空白，長度不要超過 30 個字"


def _word(evidence: dict, key: str) -> str:
    """Pull one word out of client-supplied evidence, defensively."""
    if not isinstance(evidence, dict):
        raise EvidenceError("回報的內容格式不對，回到畫布重新回報一次")
    value = evidence.get(key)
    if not isinstance(value, str):
        raise EvidenceError("回報的內容格式不對，回到畫布重新回報一次")
    word = value.strip()
    if (
        not word
        or len(word) > _MAX_WORD_CHARS
        or any(ch.isspace() for ch in word)
    ):
        raise EvidenceError(_BAD_WORD)
    return word


def _pieces(store: "ModelStore", word: str) -> list[dict]:
    """Real Qwen BPE pieces for one word: the same call routers/tokenizer.py
    makes for the station's live BPE mode, one dict per rendered chip."""
    with store.lm_lock:
        return qwen.tokenize_pieces(store.qwen_tok, word)


def _verify_split_four(evidence: dict, store: "ModelStore") -> bool:
    """Hunt: the submitted word must tokenize into 4 or more pieces."""
    word = _word(evidence, "word")
    return len(_pieces(store, word)) >= 4


def _verify_shared_prefix(evidence: dict, store: "ModelStore") -> bool:
    """Hunt: two DIFFERENT words whose first token ids coincide."""
    word_a = _word(evidence, "wordA")
    word_b = _word(evidence, "wordB")
    if word_a == word_b:
        raise EvidenceError("兩個詞要不一樣，換一個再試")
    pieces_a = _pieces(store, word_a)
    pieces_b = _pieces(store, word_b)
    if not pieces_a or not pieces_b:
        return False
    return pieces_a[0]["id"] == pieces_b[0]["id"]


QUESTS: list[Quest] = [
    Quest(
        id="split-four",
        kind="hunt",
        title="找出一個被切成 4 塊以上的詞",
        prompt=(
            "切到 BPE，輸入一個詞（中英文都可以，不能有空格），"
            "讓畫布把它切成 4 塊以上的 token，等即時結果出現再按回報。"
        ),
        points=1,
        verify=_verify_split_four,
    ),
    Quest(
        id="shared-prefix",
        kind="hunt",
        title="找出兩個開頭共用同一塊 token 的詞",
        prompt=(
            "切到 BPE，輸入兩個不一樣的詞，一行一個。"
            "讓兩個詞的第一塊 token 的 id 一模一樣，找到了就按回報。"
        ),
        points=1,
        verify=_verify_shared_prefix,
    ),
    Quest(
        id="why-split",
        kind="mcq",
        title="選出 BPE 決定切法的依據",
        prompt=(
            "畫布上，the 這種短詞只有 1 塊，tokenization 這種詞卻被切成好幾塊。"
            "BPE 是照什麼決定要不要把一串字合併成一整塊？"
        ),
        points=2,
        choices=(
            "詞的長度：字數越多就切得越碎",
            "筆畫字形：長得越複雜就切得越碎",
            "完全隨機：每次切的結果都不一樣",
            "出現頻率：語料裡越常見越會合併",
        ),
        answer=3,
    ),
    Quest(
        id="model-reads-ids",
        kind="mcq",
        title="選出模型真正讀到的東西",
        prompt=(
            "每個色塊下面都有一個小數字。文字經過 tokenizer 之後，"
            "模型實際拿到的是什麼？"
        ),
        points=2,
        choices=(
            "原本的字母和漢字，一個都不少",
            "一串 token 的 id 號碼",
            "每個 token 對應的一張小圖片",
            "先自動翻譯過的一句英文句子",
        ),
        answer=1,
    ),
]
