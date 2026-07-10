"""Quests for the rnn-viz station (id "rnn-viz").

The hunt re-derives its evidence with the SAME numpy forward pass routers/rnn.py
uses (camp_precompute.rnn.run_sequence on store.rnn, the trained GRU): no GPU,
no lock needed, exactly like the router. The station's canvas shows the
influence row `influence[q][k]`: how much token k's fingerprint still moves the
hidden state at query step q (1.0 the step it enters, decaying after). The hunt
asks the student to catch the step where the preset's subject word has washed
out of the fixed-size vector: the long-range-dependency wall this station
exists to make felt.

Ground truth (derived from the real trained weights, rnn_state.npz):
the subject's influence trace collapses fast once a few tokens pass, e.g. on
"cat-by-the-door" the subject "cat" (k=1) reads 1.0 → 0.354 → 0.110 → 0.004 at
q=1..4, so "first step below 0.05" is q=4. Verify recomputes that target at
attempt time and allows ±1 (the fade is gradual; both the 11% and the first
~0% step are honest reads of "almost gone").

See base.py for the Quest contract. MCQ answers never leave this module.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from camp_precompute.rnn import SEQUENCES, run_sequence

from .base import EvidenceError, Quest

if TYPE_CHECKING:
    from ..loader import ModelStore

# Preset specs by id: the same list the artifact build and the live router
# share, so the quest can never drift from what the canvas shows.
_PRESETS: dict[str, list[str]] = {
    spec["sequenceId"]: list(spec["tokens"]) for spec in SEQUENCES
}

# The subject-word index of each preset (the token whose fading the hunt
# tracks). The short "cat-sat" preset is a valid submission target but its
# subject never falls below the threshold on screen: the prompt steers
# students to a long preset, and a short-preset attempt is simply wrong.
_SUBJECT_INDEX: dict[str, int] = {
    "cat-sat": 1,          # the CAT sat
    "cat-by-the-door": 1,  # the CAT sat by the door and looked at the queen
    "alice-golden-key": 0, # ALICE opened the little door with the golden key
    "rabbit-ran-away": 2,  # the white RABBIT ran away down the hall again
}

# "Forgotten" = the subject's ablation influence at the current step drops
# below this. On the real weights the drop is a cliff (0.11 → 0.004 on the
# cat preset), so the derived step is stable; ±1 keeps the gradual-fade edge
# cases fair.
_FORGET_THRESHOLD = 0.05
_POSITION_TOLERANCE = 1


def _forget_step(influence: list[list[float]], subject: int) -> int | None:
    """First query step (after the subject enters) where the subject's
    influence reads below the threshold: the step the canvas shows it
    fading to almost nothing. None if it never does (short presets)."""
    for q in range(subject + 1, len(influence)):
        if influence[q][subject] < _FORGET_THRESHOLD:
            return q
    return None


def _verify_forget_subject(evidence: dict, store: "ModelStore") -> bool:
    if not isinstance(evidence, dict):
        raise EvidenceError("回報格式不對，請從站內的回報按鈕送出")
    seq_id = evidence.get("sequenceId")
    position = evidence.get("position")
    if not isinstance(seq_id, str):
        raise EvidenceError("回報缺少 sequenceId，請從站內的回報按鈕送出")
    if isinstance(position, bool) or not isinstance(position, int):
        raise EvidenceError("回報缺少 position（整數），請從站內的回報按鈕送出")
    tokens = _PRESETS.get(seq_id)
    if tokens is None:
        raise EvidenceError("這不是預設句子，請先從選單選一個預設句再回報")
    if not (0 <= position < len(tokens)):
        raise EvidenceError("position 超出這個句子的長度")

    subject = _SUBJECT_INDEX[seq_id]
    # Same code path as POST /rnn/forward: numpy forward on the trained GRU.
    _, influence = run_sequence(store.rnn, tokens)
    target = _forget_step(influence, subject)
    if target is None:
        return False  # this preset never forgets on screen: pick a longer one
    return position > subject and abs(position - target) <= _POSITION_TOLERANCE


QUESTS: list[Quest] = [
    Quest(
        id="forget-subject",
        kind="hunt",
        title="找出忘記主詞的那一步",
        prompt=(
            "選一個長的預設句，慢慢把「閱讀進度」往右拖，盯著最下面的影響列："
            "主詞（cat、alice 或 rabbit）那一格會越來越淡。"
            "停在它第一次淡到幾乎看不見的那一步，按回報。"
        ),
        points=1,
        verify=_verify_forget_subject,
    ),
    Quest(
        id="state-relay",
        kind="mcq",
        title="看懂記憶怎麼往後傳",
        prompt=(
            "拖動閱讀進度，格子由左到右一欄一欄亮起來。"
            "RNN 把前面讀到的內容帶到後面，靠的是哪種方式？"
        ),
        points=2,
        choices=(
            "整句一次全部進來，每個字同時處理",
            "直接跳到最後一個字，中間的都跳過",
            "像接力賽：一步接一步，每讀一個字就把記憶更新一次再傳下去",
            "每個字各自算各自的，互相不影響",
        ),
        answer=2,
    ),
    Quest(
        id="long-sentence",
        kind="mcq",
        title="判斷最早的字會怎樣",
        prompt=(
            "比較短句和長句：句子越長，最早那個字在影響列的綠色會怎麼變？"
        ),
        points=2,
        choices=(
            "永遠原封不動保留在記憶裡",
            "會漸漸被後面的字稀釋、蓋掉",
            "越讀越強，因為一直重複累積",
            "下一個字一進來就瞬間歸零",
        ),
        answer=1,
    ),
    Quest(
        id="heatmap-read",
        kind="mcq",
        title="讀懂這面熱圖",
        prompt="上方那一大片彩色格子裡，直的一欄和橫的一列各代表什麼？",
        points=2,
        choices=(
            "一欄是讀完那個字之後的 hidden state，一列是這排數字的其中一維",
            "每一格是模型對那個字打的注意力分數",
            "顏色越亮，代表那個字在課文裡出現越多次",
            "每一列是一個不同的句子",
        ),
        answer=0,
    ),
]
