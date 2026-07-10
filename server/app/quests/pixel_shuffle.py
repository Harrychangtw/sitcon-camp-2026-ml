"""Quests for the pixel-shuffle station (id "pixel-shuffle").

This is the ONE attested station: training happens in the student's browser
(the scoped exception in CLAUDE.md), so the server cannot re-run it. Its hunt
verify only sanity-bounds the claimed numbers (accuracy within the reachable
range and quantized to the real val-set size, steps plausible) and accepts:
at camp scale, with named accounts and the staff ban hammer, that risk is
accepted by design. See base.py for the Quest contract.

The bounds mirror the station's real experiment (see
apps/course2/src/stations/pixelShuffle/ and the baked artifacts under
apps/course2/public/data/course2/pixel-shuffle/):

- Two identical 3072 -> 64 -> 10 MLPs train in lockstep on 2,000 CIFAR-10
  images (net B on pi-shuffled pixels), lr 0.01 / momentum 0.9 / batch 16,
  auto-pausing at maxSteps = 4000.
- Validation accuracy is measured over the fixed 200-image val split, so an
  honest report is always a multiple of 1/200.
- The baked reference run (reference-runs.json) plateaus at finalValAcc 0.38
  (max 0.40 anywhere on the curve); live in-browser runs land ~0.33-0.38.
  Chance is 0.10 (10 classes). The hunt threshold is 0.30: comfortably under
  every observed plateau, three times above chance.
- The reference run first crosses 0.30 around step 50; nothing legitimate
  gets there in the first handful of steps, and the worker hard-stops at
  4000, so a passing claim must carry steps in [MIN_STEPS_AT_TARGET, 4000].
"""

from __future__ import annotations

import math

from .base import EvidenceError, Quest

# The experiment's fixed shape (meta.json / trainer.worker.ts).
_VAL_N = 200
_MAX_STEPS = 4000
_CHANCE = 0.10  # 10 balanced classes
# The hunt target, and the fabrication ceiling: honest runs plateau at
# ~0.33-0.40, so anything above 0.60 is not a real run of this recipe.
_TARGET_ACC = 0.30
_MAX_PLAUSIBLE_ACC = 0.60
# The reference run needs ~50 steps to cross the target; leave slack for the
# live run's different float path, but never accept a near-instant claim.
_MIN_STEPS_AT_TARGET = 30

_BAD_SHAPE = "回報需要 accuracy 和 steps 兩個數字，請從站上的回報按鈕送出"
_IMPLAUSIBLE = "這筆數字不像這個實驗真的跑得出來的結果"


def _verify_train_shuffled(evidence: dict, store: object) -> bool:
    """Sanity-bound the attested claim「打亂像素那顆網路 val 準確率 >= 30%」.

    No model runs here (the training only ever existed in the student's
    browser); we check that the numbers are shaped like a real run of the
    station's fixed experiment, then take the student's word for it.
    """
    accuracy = evidence.get("accuracy")
    steps = evidence.get("steps")

    # bool is an int subclass in Python; reject it explicitly.
    if isinstance(accuracy, bool) or not isinstance(accuracy, (int, float)):
        raise EvidenceError(_BAD_SHAPE)
    if isinstance(steps, bool) or not isinstance(steps, (int, float)):
        raise EvidenceError(_BAD_SHAPE)
    if isinstance(steps, float):
        if not steps.is_integer():
            raise EvidenceError(_BAD_SHAPE)
        steps = int(steps)

    accuracy = float(accuracy)
    if not math.isfinite(accuracy) or not (0.0 <= accuracy <= 1.0):
        raise EvidenceError("accuracy 必須是 0 到 1 之間的數字")
    if not (1 <= steps <= _MAX_STEPS):
        raise EvidenceError(f"steps 必須是 1 到 {_MAX_STEPS} 之間的整數")

    # Val accuracy is ok/200 over the fixed split; an honest float is always
    # (up to float noise) a multiple of 1/200.
    if abs(accuracy * _VAL_N - round(accuracy * _VAL_N)) > 1e-6:
        raise EvidenceError(_IMPLAUSIBLE)
    # No run of this recipe ever gets near this; a claim above it is fabricated.
    if accuracy > _MAX_PLAUSIBLE_ACC:
        raise EvidenceError(_IMPLAUSIBLE)

    if accuracy < _TARGET_ACC:
        return False  # well-formed, just not there yet
    # Crossing the target needs real training time; the worker cannot report
    # a >= 30% val accuracy this early.
    if steps < _MIN_STEPS_AT_TARGET:
        raise EvidenceError(_IMPLAUSIBLE)
    return True


QUESTS: list[Quest] = [
    Quest(
        id="train-shuffled-30",
        kind="hunt",
        title="把打亂網路練到 30%",
        prompt=(
            "按 ▶ 開始訓練（或按 Space），盯著 04 訓練那欄："
            "等「打亂像素」那顆網路的 val 到 30% 以上，就回來按回報。"
            "亂猜只有 10%，能到 30% 代表它真的學會了，"
            "即使那些圖在你眼中只是雜訊。"
        ),
        points=1,
        verify=_verify_train_shuffled,
    ),
    Quest(
        id="curves-overlap",
        kind="mcq",
        title="看懂重疊的曲線",
        prompt=(
            "訓練到後面，原始像素和打亂像素兩條曲線幾乎完全疊在一起。"
            "這說明 MLP 對什麼「沒有感覺」？"
        ),
        points=2,
        choices=(
            "圖片原本的顏色深淺",
            "訓練圖片的總張數",
            "訓練時的學習速度",
            "像素排在哪個位置",
        ),
        answer=3,
    ),
    Quest(
        id="unshuffle-template",
        kind="mcq",
        title="解讀還原排列的樣板",
        prompt=(
            "點一顆隱藏神經元，按下「還原排列 π⁻¹」："
            "B 那張雜訊樣板變回和 A 一模一樣的圖。"
            "這代表兩顆網路學到了什麼？"
        ),
        points=2,
        choices=(
            "兩顆學到同一套樣板，位置照 π 對調",
            "B 根本沒學到東西，樣板只是隨機雜訊",
            "還原排列偷偷改掉了 B 的權重數值",
            "B 把 A 的權重整份背下來再輸出",
        ),
        answer=0,
    ),
]
