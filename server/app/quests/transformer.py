"""Quests for the transformer station (id "transformer").

Hunt evidence is the station's current canvas selection: {sentenceId, layer,
head}. Both hunts verify against the SHIPPED attention artifact
(<data_dir>/transformer/attention.json, written by `camp-precompute
transformer` with the exact qwen.pipeline_payload code the live router runs),
so verification needs no model forward and no lm_lock at all: the client only
ever submits preset sentence ids, and for a preset the artifact IS the model's
output. The tensors are parsed once per process and cached at module level.

Thresholds below were calibrated against the real artifact tensors
(2026-07-10, Qwen3-0.6B, 28 layers x 16 heads = 448 heads per sentence):

- previous-token heads (mean attention mass on key = query-1, queries 1..n-1):
  L15/H3 (~0.78-0.81 on every preset), L1/H3, L2/H12 lead everywhere; per
  preset 6-8 heads clear "mass >= 0.55 AND rank in the top 8". The honest find
  (a bright stripe hugging the diagonal) is easy; blind enumeration of 448
  heads through the 5 s wrong-attempt cooldown is not.
- coreference heads on zh-mom-happy (我的 媽媽 說 她 很 開 心): attention from
  她 (q=3) back to 媽媽 (k=1) peaks at 0.89 (L10/H3, L6/H1); 15 heads have
  weight >= 0.5 and all of those also have 媽媽 as the row argmax.

See base.py for the Quest contract.
"""

from __future__ import annotations

import json
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING

import numpy as np

from .base import EvidenceError, Quest

if TYPE_CHECKING:  # only for type hints; no model import at runtime here
    from ..loader import ModelStore

# --- calibrated thresholds (see the module docstring for the derivation) ----

# A "previous-token head" must put at least this mean mass on key = query-1 …
PREV_MIN_MASS = 0.55
# … and rank among the strongest such heads of the whole model on that preset.
PREV_TOP_K = 8

# The coreference hunt is pinned to one preset with a clean 她 → 媽媽 link.
COREF_SENTENCE_ID = "zh-mom-happy"
COREF_QUERY_TOKEN = "她"
COREF_KEY_TOKEN = "媽媽"
# The head must give 她 → 媽媽 at least this weight AND 媽媽 must be where 她
# looks the most (row argmax), so a diffuse head can't sneak past.
COREF_MIN_WEIGHT = 0.5


@dataclass(frozen=True)
class _Preset:
    tokens: list[str]
    # attn[layer][head][query][key]: the artifact's causal attention tensor.
    attn: np.ndarray
    # prev_mass[layer][head]: mean attention on key = query-1 (queries 1..n-1).
    prev_mass: np.ndarray


_cache_lock = threading.Lock()
_presets_cache: dict[str, dict[str, _Preset]] = {}


def _presets(store: "ModelStore") -> dict[str, _Preset]:
    """The shipped presets' attention tensors, parsed once per artifact path.

    A missing/renamed artifact raises (FileNotFoundError/KeyError): that is a
    server misconfiguration, and the quests router logs it loudly and fails the
    attempt safely.
    """
    path = Path(store.settings.data_dir) / "transformer" / "attention.json"
    key = str(path)
    with _cache_lock:
        cached = _presets_cache.get(key)
        if cached is not None:
            return cached
        payload = json.loads(path.read_text(encoding="utf-8"))
        presets: dict[str, _Preset] = {}
        for s in payload["sentences"]:
            attn = np.asarray(
                [layer["heads"] for layer in s["layers"]], dtype=np.float32
            )
            n = attn.shape[-1]
            queries = np.arange(1, n)
            prev_mass = attn[:, :, queries, queries - 1].mean(axis=-1)
            presets[s["sentenceId"]] = _Preset(
                tokens=list(s["tokens"]), attn=attn, prev_mass=prev_mass
            )
        _presets_cache[key] = presets
        return presets


def _evidence_preset(evidence: dict, presets: dict[str, _Preset]) -> str:
    sid = evidence.get("sentenceId")
    if not isinstance(sid, str):
        raise EvidenceError("回報格式不對：缺少句子編號")
    if sid not in presets:
        raise EvidenceError("請先選一句預設句子再回報")
    return sid


def _evidence_layer_head(
    evidence: dict, n_layers: int, n_heads: int
) -> tuple[int, int]:
    layer = evidence.get("layer")
    head = evidence.get("head")
    for value in (layer, head):
        if not isinstance(value, int) or isinstance(value, bool):
            raise EvidenceError("回報格式不對：Layer 和 Head 要是整數")
    assert isinstance(layer, int) and isinstance(head, int)
    if not (0 <= layer < n_layers and 0 <= head < n_heads):
        raise EvidenceError("Layer 或 Head 超出這個模型的範圍")
    return layer, head


def _verify_prev_token_head(evidence: dict, store: "ModelStore") -> bool:
    """The submitted head must genuinely be a previous-token head on the
    submitted preset: strong mean mass on key = query-1, AND among the model's
    strongest such heads there, so near-misses fail but any honest find (there
    are 6-8 per preset) passes."""
    presets = _presets(store)
    sid = _evidence_preset(evidence, presets)
    preset = presets[sid]
    n_layers, n_heads = preset.prev_mass.shape
    layer, head = _evidence_layer_head(evidence, n_layers, n_heads)

    mass = float(preset.prev_mass[layer, head])
    if mass < PREV_MIN_MASS:
        return False
    rank = int((preset.prev_mass > mass).sum())  # 0-based rank among all heads
    return rank < PREV_TOP_K


def _verify_coref_head(evidence: dict, store: "ModelStore") -> bool:
    """On the pinned preset, 她's attention row must point at 媽媽: weight over
    the threshold AND 媽媽 is the row's argmax."""
    presets = _presets(store)
    sid = _evidence_preset(evidence, presets)
    if sid != COREF_SENTENCE_ID:
        raise EvidenceError("這一題要在題目指定的那句預設句子上找")
    preset = presets[sid]
    n_layers, n_heads = preset.prev_mass.shape
    layer, head = _evidence_layer_head(evidence, n_layers, n_heads)

    # Token positions come from the artifact itself, so a re-recorded artifact
    # with a different tokenization fails loudly (ValueError → logged server
    # bug) instead of silently checking the wrong cell.
    q = preset.tokens.index(COREF_QUERY_TOKEN)
    k = preset.tokens.index(COREF_KEY_TOKEN)
    row = preset.attn[layer, head, q, : q + 1]  # causal: keys 0..q only
    return float(row[k]) >= COREF_MIN_WEIGHT and int(np.argmax(row)) == k


QUESTS: list[Quest] = [
    Quest(
        id="prev-token-head",
        kind="hunt",
        title="找出盯著前一個字的 head",
        prompt=(
            "有的 head 像在玩接龍：每個 token 幾乎把注意力全押在自己前一個"
            " token 上，矩陣裡會出現一條貼著對角線的亮斜線。挑一句預設句子，"
            "用下方的模型縮圖把這種 head 翻出來，停在它上面按回報。"
        ),
        points=1,
        verify=_verify_prev_token_head,
    ),
    Quest(
        id="coref-head",
        kind="hunt",
        title="找出把她連回媽媽的 head",
        prompt=(
            "選預設句「我的媽媽說她很開心」。這句的「她」指的就是「媽媽」，"
            "有些 head 專門牽這條線：在「她」那一列，最亮的格子落在「媽媽」上。"
            "把這種 head 翻出來，停在它上面按回報。"
        ),
        points=1,
        verify=_verify_coref_head,
    ),
    Quest(
        id="attn-vs-rnn",
        kind="mcq",
        title="說出 attention 和 RNN 的關鍵差別",
        prompt=(
            "RNN 站是把整句壓進一顆狀態，一個 token 一個 token 往右傳。"
            "這一站的 attention 傳資訊的方式，最大的差別是什麼？"
        ),
        points=2,
        choices=(
            "attention 只看最後一個 token，前面的直接丟掉",
            "attention 的參數比較多，所以記性比較好",
            "每個 token 都能一跳直接看到前面所有 token，不用靠狀態一格一格傳",
            "attention 算得比較快，所以比較不會出錯",
        ),
        answer=2,
    ),
    Quest(
        id="causal-mask",
        kind="mcq",
        title="看懂矩陣空掉的右上角",
        prompt=(
            "不管切到哪一層、哪個 head，注意力矩陣的右上半永遠是空的。"
            "為什麼？"
        ),
        points=2,
        choices=(
            "那些格子的數值太小，螢幕上畫不出來",
            "每個 token 只能看自己和左邊的 token，不能偷看還沒出現的字",
            "伺服器為了省流量，只回傳半張矩陣",
            "右上半是保留給下一句用的",
        ),
        answer=1,
    ),
]
