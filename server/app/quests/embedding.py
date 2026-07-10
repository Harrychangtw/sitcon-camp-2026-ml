"""Quests for the embedding station (id "embedding").

Hunts re-derive their evidence through the same code path as
routers/embedding.py: an in-vocab word answers verbatim from the shipped
store.embedding artifacts, a novel word is embedded live with
loader.encode_word (deterministic, eval mode). The embedding encoder is NOT
the Qwen LM, and the embedding router takes no lock around it, so neither do
these verifiers. Cosine similarity is the plain dot product of the
L2-normalised vectors, exactly the router's math. See base.py for the Quest
contract.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import numpy as np

from camp_precompute.embedding import TOP_K

from .base import EvidenceError, Quest

if TYPE_CHECKING:  # no model import at runtime here (same stance as base.py)
    from ..loader import ModelStore

# --- Calibration (probed offline against the shipped embedding_state.npz) ----
# Anchor pair for the "closer than 女王" hunt. Both words ship in the vocab;
# cos(國王, 女王) ≈ 0.744 there, and 女王 does not even make 國王's shipped
# top-15 (帝國 0.836 … 驕傲 0.749 all beat it), so any neighbour the canvas
# shows for 國王 already satisfies the hunt. The rival similarity is re-derived
# from the live store at verify time, never hard-coded.
_ANCHOR = "國王"
_RIVAL = "女王"

# Similarity floor for a neighbour to count in the cross-language hunt. The
# primary criterion is membership in the word's top-K neighbour list (the very
# list the canvas shows); this floor only stops a garbage novel word from
# fishing a pass out of noise. Probed: every cross-language pair shipped in
# neighbors.json clears it (minimum shipped cross-language score 0.5612),
# while random zh×en vocab pairs sit at mean 0.467 / p99 0.618.
_CROSS_LANG_MIN_SIM = 0.55

# Same cap as EmbeddingLookupRequest and the station's search box.
_MAX_WORD_CHARS = 64


def _clean_word(evidence: dict, key: str = "word") -> str:
    """Pull one word out of the evidence dict, normalised exactly like the
    lookup route normalises the search box (trim + lowercase)."""
    value = evidence.get(key)
    if not isinstance(value, str):
        raise EvidenceError("回報需要附上一個詞，先在畫布上搜尋或點住一個詞")
    word = value.strip().lower()
    if not word:
        raise EvidenceError("回報的詞是空的，先在畫布上搜尋或點住一個詞")
    if len(word) > _MAX_WORD_CHARS:
        raise EvidenceError("回報的詞太長了")
    return word


def _vector_for(store: "ModelStore", word: str) -> np.ndarray:
    """The word's vector: the shipped vocab row when in vocab, otherwise the
    same live embed POST /embedding/lookup would run (no lock, matching the
    embedding router)."""
    emb = store.embedding
    i = emb.word_index.get(word)
    if i is not None:
        return emb.vectors[i].astype(np.float64)
    from ..loader import encode_word  # lazy: only novel words touch the model

    return encode_word(store, word).astype(np.float64)


_CJK_RANGES = ((0x4E00, 0x9FFF), (0x3400, 0x4DBF), (0xF900, 0xFAFF))


def _lang_of(store: "ModelStore", word: str) -> str | None:
    """Language of a word: shipped points.json metadata when in vocab, else a
    script heuristic for live words (any CJK char → zh, latin letters → en)."""
    shipped = store.embedding.points.get(word)
    if shipped is not None and shipped.get("lang"):
        return str(shipped["lang"])
    if any(lo <= ord(ch) <= hi for ch in word for lo, hi in _CJK_RANGES):
        return "zh"
    if any("a" <= ch <= "z" for ch in word.lower()):
        return "en"
    return None


def _verify_closer_than_rival(evidence: dict, store: "ModelStore") -> bool:
    """True when the submitted word is strictly closer to 國王 than 女王 is
    (cosine on the same vectors the station plots)."""
    word = _clean_word(evidence)
    if word in (_ANCHOR, _RIVAL):
        raise EvidenceError("不能直接用題目裡的兩個詞，找一個別的詞")
    emb = store.embedding
    anchor = emb.vectors[emb.word_index[_ANCHOR]].astype(np.float64)
    rival = emb.vectors[emb.word_index[_RIVAL]].astype(np.float64)
    return float(anchor @ _vector_for(store, word)) > float(anchor @ rival)


def _verify_cross_lingual_neighbor(evidence: dict, store: "ModelStore") -> bool:
    """True when the submitted word's neighbour list (the one the canvas
    shows: shipped for in-vocab words, live top-K otherwise) contains a word
    of the OTHER language above the calibrated similarity floor."""
    word = _clean_word(evidence)
    lang = _lang_of(store, word)
    if lang is None:
        raise EvidenceError("看不出這個詞是中文還是英文，換一個詞試試")
    emb = store.embedding
    shipped = emb.neighbors.get(word)
    if shipped is not None:
        pairs = [(str(n["word"]), float(n["score"])) for n in shipped]
    else:
        vec = _vector_for(store, word)
        sims = emb.vectors.astype(np.float64) @ vec
        order = np.argpartition(sims, -TOP_K)[-TOP_K:]
        order = order[np.argsort(sims[order])[::-1]]
        pairs = [(emb.words[j], float(sims[j])) for j in order]
    for neighbor, score in pairs:
        neighbor_lang = _lang_of(store, neighbor)
        if (
            neighbor_lang is not None
            and neighbor_lang != lang
            and score >= _CROSS_LANG_MIN_SIM
        ):
            return True
    return False


QUESTS: list[Quest] = [
    Quest(
        id="closer-than-queen",
        kind="hunt",
        title="找一個比女王更靠近國王的詞",
        prompt=(
            "先搜尋「國王」，看看它身邊住著誰。再找一個你覺得離「國王」比「女王」"
            "更近的詞，把它搜尋出來或在點雲裡點住它，按回報就會用目前選到的詞驗證。"
        ),
        points=1,
        verify=_verify_closer_than_rival,
    ),
    Quest(
        id="cross-lingual-neighbor",
        kind="hunt",
        title="找一個中英文住在一起的詞",
        prompt=(
            "中文和英文被同一個模型放進同一個空間，有些詞的鄰居名單會混進另一種語言。"
            "找到這樣的詞，把它搜尋出來或點住它再回報。提示：想想兩種語言都常聊的東西，"
            "需要的話把 Top K 調大一點。"
        ),
        points=1,
        verify=_verify_cross_lingual_neighbor,
    ),
    Quest(
        id="near-means-what",
        kind="mcq",
        title="兩個詞靠得近，代表什麼？",
        prompt="地圖上兩個詞靠得很近，最可能代表下面哪件事？",
        points=2,
        choices=(
            "它們的拼字長得很像",
            "它們的筆畫數很接近",
            "它們的意思用法相近",
            "它們出現的次數接近",
        ),
        answer=2,
    ),
    Quest(
        id="cross-lingual-why",
        kind="mcq",
        title="貓和 cat 為什麼是鄰居？",
        prompt=(
            "模型從沒看過任何中英對照的翻譯表，為什麼「貓」和 cat 還是靠在一起？"
        ),
        points=2,
        choices=(
            "它們在各自語言的用法很相似",
            "它們的發音聽起來非常相似",
            "字母和筆畫有固定的對應規則",
            "工程師手動把它們排在一起",
        ),
        answer=0,
    ),
]
