"""Course 3 *steering* station — 「打開模型內部的旋鈕」.

The pedagogy (Anthropic "Golden Gate Claude", scaled to a classroom): the model
has legible directions INSIDE its residual stream. Add one, scaled by a slider,
and the SAME prompt bends toward (or away from) that concept: drag 珍珠奶茶 up
and it can't stop mentioning boba (at +2 it introduces ITSELF as a cup of
boba); drag 英文 up and the same 中文 question gets answered in English. Peek
inside AND edit behaviour — 可解釋性 made tangible.

FEATURE SOURCING (the resolved checkpoint decision): CONTRASTIVE STEERING
VECTORS (activation addition, Turner et al. 2023 / mean-difference CAA) on the
already-served Qwen3-0.6B — NOT a public SAE release. Why:
- Legibility for 中文 high-schoolers: Gemma Scope / GPT-2-small SAE features
  carry auto-generated English labels, and those bases answer poorly (GPT-2:
  not at all) in 正體中文. Hand-picked contrast sets give exact 中文-labeled
  knobs with unmistakable effects on 中文 output.
- Rule 2 (course3-panorama README): reuse the ONE served Qwen; no second base
  model on the V100 box, no extra VRAM, same lm_lock.
- No training anywhere: each direction is a mean-activation DIFFERENCE over
  ~10 hand-written contrast sentences per pole — seconds of forward passes,
  computed once offline (`steering-vectors`). Nothing resembling SAE training.
The station copy stays honest that these directions are 「用對比句子找出來的」,
not SAE-discovered features.

How a direction is made (steering-vectors):
- run the plain (no chat template) contrast sentences through the model with
  output_hidden_states, take the residual stream ENTERING layer L+1 (i.e.
  hidden_states[L + 1], the output of decoder layer L — the same tensor the
  hook below edits), mean over token positions, mean over sentences;
- POSITION 0 IS ALWAYS EXCLUDED: Qwen3 adds no BOS, and whatever token lands
  first becomes the attention sink with a residual norm ~100× every other
  position (≈6400 vs ≈55 at layer 14). Including it drowns the concept — the
  2026-07-09 V100 probes measured cos ≈ 0.17 between a sink-contaminated
  bridge direction and the clean one, and a *flipped* mood direction;
- concept knobs (FeatureSpec.span set) mean only over the tokens of the
  concept word itself instead of the whole sentence — whole-sentence means
  dilute 「珍珠奶茶」 into generic snack-talk;
- direction = unit(pos_mean − neg_mean);
- scale = COEFF · boost · median per-token residual L2 norm, so UI strength s
  adds s·COEFF·boost of the typical residual magnitude. The per-feature boost
  is calibrated by probing: mean-difference directions in a 0.6B model need
  deltas of ~20-80% of the residual norm before the effect is legible (the
  CAA literature's raw-diff × 1-3 operating range), and each direction
  saturates/degrades at a different push.

Concept choice is knowledge-bounded: steering can only surface what the model
robustly represents. Qwen3-0.6B does NOT know 金門大橋 as the Golden Gate
Bridge (it answers "a Taiwanese highway bridge in 金門縣") and thinks 熊貓 is
a poodle — so the homage knob is 珍珠奶茶, which it knows cold. Knowledge-check
a candidate concept with 「介紹一下X」 before writing contrast sets for it.

How it is applied (export + live server, the SAME code path): a forward hook on
model.model.layers[L] adds strength × scale × direction to the layer's output
hidden states at EVERY position during greedy generation. Decoding reuses
lora.generate_reply (one chat-template greedy path for the whole repo), so a
preset (prompt, feature, strength) asked live reproduces its shipped text.

Directions are server-side state → gitignored npz (precompute/artifacts/
steering/directions.npz). The committed artifacts are only the small
features.json (slider catalog) + presets.json (recorded outputs).
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np

from . import qwen
from .lora import MAX_NEW_TOKENS, generate_reply

# --- the knobs -------------------------------------------------------------------

# Decoder-layer index whose OUTPUT the delta is added to (Qwen3-0.6B has 28
# layers; mid-stack is where activation addition reads cleanest — early layers
# are still token-ish, late layers are already committed to an output).
STEER_LAYER = 14

# Fraction of the typical residual norm one strength unit adds, BEFORE the
# per-feature boost. |strength| is capped at 2 (schema + slider); the boost
# maps UI ±2 onto each direction's empirically usable range (probed on the
# V100: concepts surface around 40-45% of residual norm, mood tolerates ~60%,
# text degenerates into repetition past ~70%). Tune boost per feature in the
# runbook if a knob reads flat or degenerates.
COEFF = 0.08

# Slider stops. 0 = base (no hook), recorded once per prompt; the non-zero
# stops are baked per (feature, prompt) so every slider position works offline.
STRENGTHS = [-2, -1, 1, 2]

# Hard cap on |strength| — the ONE declaration both the API schema
# (server/app/schemas.py) and the baked slider range (features.json
# maxStrength) read, so retuning the stops can never desync client and server.
MAX_STRENGTH = max(abs(s) for s in STRENGTHS)

# Preset prompts (suggestion chips AND the offline lookup keys). Wholesome,
# short, and each gives every feature something visible to bend.
PRESET_PROMPTS = [
    "介紹一下你自己",
    "描述你最喜歡的地方",
    "推薦一個週末活動",
]


@dataclass(frozen=True)
class FeatureSpec:
    id: str
    label: str  # 中文 knob name on the slider
    gloss: str  # one-line 白話文 identity (always visible)
    info: str  # hover-revealed longer explanation
    pos_label: str  # what + reads as, e.g. 狂提
    neg_label: str  # what − reads as, e.g. 避開
    pos: tuple[str, ...]  # contrast sentences exemplifying the + pole
    neg: tuple[str, ...]  # contrast sentences exemplifying the − pole
    # Concept knobs: mean only over the tokens of this word inside each pos
    # sentence (None → whole-sentence mean, for style/tone knobs).
    span: str | None = None
    # UI-strength → internal-strength multiplier; calibrated per feature so
    # that the slider's +2 sits at "obsessed but still readable".
    boost: float = 1.0


# Shared − pole for the two "提到 X" features: matched everyday sentences with
# no landmark and no animal, so the difference isolates the concept.
_NEUTRAL = (
    "今天下午我在家裡看書，順便整理了一下房間。",
    "早餐我吃了三明治和一杯豆漿，味道還不錯。",
    "週末我們全家去超市採買，回家一起煮晚餐。",
    "他每天搭公車上學，路上大概要二十分鐘。",
    "下課後我和同學留在教室討論作業。",
    "媽媽在陽台種了幾盆番茄，最近開始結果了。",
    "圖書館三樓很安靜，很適合準備考試。",
    "晚上我們在客廳看了一部電影，配著爆米花。",
    "這學期我選了美術課，每週要交一張速寫。",
    "巷口那家麵店的招牌是餛飩麵，湯頭很清。",
)

FEATURES: list[FeatureSpec] = [
    FeatureSpec(
        id="boba",
        label="珍珠奶茶",
        gloss="模型有多想聊珍珠奶茶",
        info="致敬 Anthropic 的 Golden Gate Claude：他們把「金門大橋」的概念方向加進 Claude 的內部訊號，模型就滿腦子都是橋。我們這顆 0.6B 的小模型不太認識金門大橋，所以改用它最熟的「珍珠奶茶」——拉到最右，任何話題都會繞回珍奶；拉到最左則絕口不提。這不是關鍵字過濾，是直接改它腦中的活化值。",
        pos_label="狂提",
        neg_label="避開",
        pos=(
            "我最喜歡的飲料是珍珠奶茶，QQ 的珍珠配上香濃奶茶，一口接一口。",
            "說到下午茶，當然要來一杯珍珠奶茶，半糖少冰最對味。",
            "珍珠奶茶是台灣發明的國民飲料，黑糖珍珠在杯底閃閃發亮。",
            "排隊也要買到那家的珍珠奶茶，珍珠煮得又Q又香。",
            "我推薦你喝珍珠奶茶！大口吸珍珠的瞬間最療癒。",
            "天氣一熱就想喝珍珠奶茶，冰冰的奶茶加上嚼勁十足的珍珠。",
            "這家手搖店的招牌是珍珠奶茶，珍珠是每天現煮的。",
            "考完試的儀式感，就是先去買一杯珍珠奶茶犒賞自己。",
        ),
        neg=_NEUTRAL,
        span="珍珠奶茶",
        boost=2.75,
    ),
    FeatureSpec(
        id="cat",
        label="貓",
        gloss="模型有多想聊貓",
        info="和珍珠奶茶同一招，換一個概念：把「貓」的方向加進去，模型會忍不住把回答扯到貓身上，推到最大甚至會自稱是一隻貓。用第二個旋鈕證明這方法不是只對一個概念有效。",
        pos_label="狂提",
        neg_label="避開",
        pos=(
            "那隻橘貓蜷在窗台上曬太陽，尾巴輕輕擺動。",
            "小貓追著逗貓棒滿屋子跑，最後累倒在沙發上。",
            "貓咪用頭蹭你的手，是在跟你打招呼。",
            "我家的貓每天清晨準時踩在我身上叫我起床。",
            "黑貓從牆頭優雅地跳下來，落地完全沒有聲音。",
            "貓打呼嚕的震動據說能讓人放鬆下來。",
            "兩隻小貓擠在同一個紙箱裡睡成一團。",
            "貓的鬍鬚可以感覺出縫隙夠不夠牠鑽過去。",
            "虎斑貓盯著窗外的鳥，發出咔咔的聲音。",
            "貓咪把玩具老鼠叼到主人腳邊，一臉得意。",
        ),
        neg=_NEUTRAL,
        span="貓",
        boost=2.75,
    ),
    FeatureSpec(
        id="english",
        label="英文",
        gloss="模型要不要改講英文",
        info="語言也是模型內部的一個方向：把「英文」方向加進中層訊號，同一個中文問題，回答會直接切換成英文；推到更大會出現有趣的中英夾雜。往左它就乖乖講中文。模型並沒有被「翻譯」，只是內部代表語言的訊號被推了一把。",
        pos_label="講英文",
        neg_label="講中文",
        pos=(
            "Sure! I'd love to help you plan a fun weekend with your friends.",
            "My favorite place is the riverside park near my school.",
            "Let me introduce myself: I enjoy reading, music, and long walks.",
            "That sounds great! Let's grab lunch together this Saturday.",
            "The weather is lovely today, perfect for a picnic outside.",
            "I recommend visiting the night market and trying the street food.",
            "Thank you so much for your help, I really appreciate it.",
            "This is my favorite song; I listen to it every morning.",
            "We watched a movie last night and it was fantastic.",
            "Could you tell me more about your hobbies and interests?",
        ),
        neg=(
            "當然！我很樂意幫你和朋友規劃一個好玩的週末。",
            "我最喜歡的地方是學校附近的河濱公園。",
            "讓我自我介紹一下：我喜歡閱讀、音樂和散步。",
            "聽起來很棒！這週六我們一起吃午餐吧。",
            "今天天氣很好，很適合到外面野餐。",
            "我推薦去夜市走走，嚐嚐街邊小吃。",
            "非常謝謝你的幫忙，我真的很感激。",
            "這是我最喜歡的歌，我每天早上都聽。",
            "我們昨晚看了一部電影，非常好看。",
            "可以多說說你的興趣和嗜好嗎？",
        ),
        boost=2.0,
    ),
    FeatureSpec(
        id="mood",
        label="心情",
        gloss="右邊興高采烈，左邊冷冰冰",
        info="情緒也是模型內部的一個方向：往右推，回答會冒出陽光、海邊和讚嘆；往左推，模型退回公事公辦的冷淡模式，開始跟你保持距離。這說明「語氣」不是表面裝飾，而是內部訊號裡真實存在、可以被直接調整的量。",
        pos_label="開心",
        neg_label="冷淡",
        pos=(
            "太棒了！今天每一件事都順到不可思議！",
            "哇，這個消息也太讓人開心了吧！",
            "我興奮得快跳起來了，這正是我夢寐以求的！",
            "跟你們在一起的每一天都超級快樂！",
            "耶！成功了！我們做到了！",
            "陽光好、心情好，感覺什麼都難不倒我！",
            "這是我今年聽過最好的消息，太幸運了！",
            "光是想到明天的旅行我就笑個不停！",
            "謝謝你！你根本是我的救星，開心到飛起來！",
            "一切都太完美了，忍不住想大聲歡呼！",
        ),
        neg=(
            "夠了，這件事我已經講第三次了。",
            "真是氣死人，怎麼每次都出一樣的錯。",
            "不要再拖了，我的耐心已經用完了。",
            "這種品質也敢交出來？重做。",
            "我警告過你了，結果你還是這樣。",
            "吵死了，能不能安靜一點。",
            "又遲到？你最好給我一個像樣的理由。",
            "別再找藉口了，我一個字都不想聽。",
            "這安排根本是在浪費大家的時間。",
            "把東西收好，我不想再說第二遍。",
        ),
        boost=4.0,
    ),
]

FEATURE_IDS = [f.id for f in FEATURES]

DIRECTIONS_NPZ = "steering/directions.npz"


def directions_path(artifacts_dir: Path) -> Path:
    return artifacts_dir / DIRECTIONS_NPZ


# --- direction computation (steering-vectors) --------------------------------------


def _mean_residual(
    tok, model, sentences: tuple[str, ...], layer: int, span: str | None = None
):
    """Mean residual-stream vector (and per-token norms) at the output of
    decoder layer `layer`, averaged over token positions then sentences.
    Plain tokenization, no chat template: the contrast sets are statements,
    not conversations.

    Position 0 is always excluded — Qwen3 adds no BOS, so the first content
    token becomes the attention sink (residual norm ~100× the rest) and would
    drown the concept out of both the mean and the median norm.

    With `span`, only the token positions covering that substring contribute
    to the mean (norms still come from the whole sentence); sentences whose
    only occurrence sits at position 0 are skipped."""
    import torch

    means = []
    norms: list[float] = []
    for text in sentences:
        enc = tok(text, return_tensors="pt", return_offsets_mapping=True)
        ids = enc.input_ids.to(model.device)
        with torch.no_grad():
            out = model(ids, output_hidden_states=True)
        # hidden_states[layer + 1] IS the output of model.model.layers[layer] —
        # the same tensor the steering hook edits.
        h = out.hidden_states[layer + 1][0].float()  # [T, D]
        if span is None:
            keep = list(range(1, h.shape[0]))
        else:
            offsets = enc.offset_mapping[0].tolist()
            keep = []
            start = text.find(span)
            while start != -1:
                end = start + len(span)
                keep.extend(
                    i
                    for i, (a, b) in enumerate(offsets)
                    if i > 0 and a < end and b > start
                )
                start = text.find(span, end)
            if not keep:
                continue
        means.append(h[keep].mean(dim=0))
        norms.extend(h[1:].norm(dim=-1).tolist())
    return sum(means) / len(means), norms


def compute_directions(artifacts_dir: Path) -> Path:
    """Compute every feature's unit direction + absolute scale and save the
    gitignored npz the export and the live server load. GPU box (or any torch
    machine — it is only forward passes over ~20 short sentences per feature)."""
    from .embedding import _select_device

    device = _select_device()
    print(f"steering-vectors: loading {qwen.MODEL} on {device}…")
    tok, model = qwen.load_qwen(device)

    vectors: dict[str, np.ndarray] = {}
    scales: list[float] = []
    for spec in FEATURES:
        pos_mean, pos_norms = _mean_residual(
            tok, model, spec.pos, STEER_LAYER, span=spec.span
        )
        neg_mean, neg_norms = _mean_residual(tok, model, spec.neg, STEER_LAYER)
        diff = (pos_mean - neg_mean).cpu().numpy().astype(np.float32)
        unit = diff / np.linalg.norm(diff)
        scale = COEFF * spec.boost * float(np.median(pos_norms + neg_norms))
        vectors[spec.id] = unit
        scales.append(scale)
        print(
            f"  {spec.id}: layer {STEER_LAYER}, |diff| "
            f"{np.linalg.norm(diff):.2f}, boost {spec.boost}, scale {scale:.2f}"
        )

    path = directions_path(artifacts_dir)
    path.parent.mkdir(parents=True, exist_ok=True)
    np.savez(
        path,
        model=np.array(qwen.MODEL),
        ids=np.array(FEATURE_IDS),
        layer=np.array(STEER_LAYER),
        scales=np.array(scales, dtype=np.float32),
        **{f"vec_{fid}": vec for fid, vec in vectors.items()},
    )
    print(f"steering-vectors: wrote {path}")
    return path


@dataclass
class SteeringState:
    """The loaded directions — what the live server keeps in its ModelStore."""

    model: str
    layer: int
    ids: list[str]
    vectors: dict[str, np.ndarray]  # id → unit direction [D] float32
    scales: dict[str, float]  # id → absolute delta per strength unit


def load_directions(artifacts_dir: Path) -> SteeringState | None:
    """Load directions.npz, or None when it doesn't exist (the caller degrades
    to presets: /steering/generate answers 503)."""
    path = directions_path(artifacts_dir)
    if not path.exists():
        return None
    state = np.load(path, allow_pickle=False)
    model = str(state["model"])
    if model != qwen.MODEL:
        # Degrade, don't crash: this runs at SERVER startup (loader.py), and a
        # stale npz for an optional feature must not take every station down.
        print(
            f"steering: ignoring {path} — computed with {model} but "
            f"camp_precompute expects {qwen.MODEL}; re-run "
            f"`camp-precompute steering-vectors`."
        )
        return None
    ids = [str(i) for i in state["ids"]]
    return SteeringState(
        model=model,
        layer=int(state["layer"]),
        ids=ids,
        vectors={fid: state[f"vec_{fid}"] for fid in ids},
        scales={fid: float(s) for fid, s in zip(ids, state["scales"])},
    )


# --- applying the knobs (the ONE code path: export + live server) ------------------


class steered:
    """Context manager: while active, strength × scale × direction is added to
    the residual stream (the output of decoder layer `state.layer`) at every
    position. `settings` is {feature_id: strength}; zero strengths are ignored;
    multiple features simply sum (they are directions in the same space)."""

    def __init__(self, model, state: SteeringState, settings: dict[str, float]):
        import torch

        delta = None
        for fid, strength in settings.items():
            if strength == 0 or fid not in state.vectors:
                continue
            vec = torch.tensor(
                state.vectors[fid] * (float(strength) * state.scales[fid])
            )
            delta = vec if delta is None else delta + vec
        if delta is not None:
            # Multi-knob pileups sum deltas; past ~70% of the residual norm the
            # output degenerates into repetition. Cap the total at 1.2× the
            # strongest single knob at full strength — single-knob requests
            # (every baked preset) are never clipped, so live == precomputed.
            cap = 1.2 * MAX_STRENGTH * max(state.scales.values())
            norm = float(delta.norm())
            if norm > cap:
                delta = delta * (cap / norm)
        self._model = model
        self._layer = state.layer
        self._delta = delta
        self._handle = None

    def __enter__(self):
        if self._delta is None:
            return self
        delta = self._delta.to(self._model.device)

        def _hook(_module, _args, output):
            # Shift only the hidden states, at every position. Decoder layers
            # in transformers ≥5 return the [B, T, D] Tensor directly; older
            # versions return (hidden_states, *rest).
            if isinstance(output, tuple):
                return (output[0] + delta, *output[1:])
            return output + delta

        # Base Qwen and the peft-wrapped instance share the same underlying
        # decoder layers; get_decoder() resolves both.
        self._handle = self._model.get_decoder().layers[self._layer].register_forward_hook(_hook)
        return self

    def __exit__(self, *exc):
        if self._handle is not None:
            self._handle.remove()
            self._handle = None
        return False


def generate_steered(
    tok, model, state: SteeringState, prompt: str, settings: dict[str, float]
) -> str:
    """Greedy reply with the knobs applied — the same chat-template decoding
    path as the lora station (lora.generate_reply), wrapped in the hook. The
    export and the live server both call THIS, so live == precomputed for the
    baked cells."""
    with steered(model, state, settings):
        return generate_reply(tok, model, prompt)


# --- export (bake features.json + presets.json) ------------------------------------


def _features_payload(state_layer: int, scales: dict[str, float] | None) -> dict:
    return {
        "station": "steering",
        "model": qwen.MODEL,
        "method": (
            "contrastive activation addition (mean residual difference over "
            "hand-written 中文 contrast sentence sets, unit-normalised) — not "
            "an SAE; see camp_precompute.steering"
        ),
        "layer": state_layer,
        "maxStrength": MAX_STRENGTH,
        "features": [
            {
                "id": f.id,
                "label": f.label,
                "gloss": f.gloss,
                "info": f.info,
                "posLabel": f.pos_label,
                "negLabel": f.neg_label,
                "layer": state_layer,
                "scale": round(scales[f.id], 3) if scales else None,
            }
            for f in FEATURES
        ],
    }


def build_steering_artifacts(artifacts_dir: Path) -> tuple[dict, dict]:
    """Run the real model over the preset prompts × features × strengths and
    return (presets payload, features payload). Needs directions.npz (run
    steering-vectors first). GPU box only — the dev machine ships the
    hand-authored sample instead (see build_sample_artifacts + the runbook)."""
    from .embedding import _select_device

    state = load_directions(artifacts_dir)
    if state is None:
        raise SystemExit(
            f"steering: missing {directions_path(artifacts_dir)} — run "
            "`uv run camp-precompute steering-vectors` first."
        )

    device = _select_device()
    print(f"steering: loading {qwen.MODEL} on {device}…")
    tok, model = qwen.load_qwen(device)

    base: dict[str, str] = {}
    for p in PRESET_PROMPTS:
        base[p] = generate_reply(tok, model, p)
        print(f"  base {p!r} → {base[p][:24]}…")

    outputs: dict[str, dict[str, list[str]]] = {}
    for spec in FEATURES:
        outputs[spec.id] = {}
        for p in PRESET_PROMPTS:
            row = [
                generate_steered(tok, model, state, p, {spec.id: s})
                for s in STRENGTHS
            ]
            outputs[spec.id][p] = row
            print(f"  {spec.id} {p!r} @+2 → {row[-1][:24]}…")

    presets = {
        "station": "steering",
        "model": qwen.MODEL,
        "maxNewTokens": MAX_NEW_TOKENS,
        "strengths": STRENGTHS,
        "suggestions": PRESET_PROMPTS,
        "base": base,
        "outputs": outputs,
    }
    return presets, _features_payload(state.layer, state.scales)


# --- no-GPU hand-authored sample (steering-sample) ----------------------------------
# The dev MacBook can't run the bake, but the station must render and the
# sliders must visibly bend the output offline. These texts are HAND-AUTHORED
# illustrations of what each knob does (graded by strength) — clearly labelled
# a sample; the GPU runbook replaces them with recorded real outputs.

_SAMPLE_BASE = {
    "介紹一下你自己": "我是一個小型語言模型，可以回答問題、寫短文，也可以陪你聊聊今天過得怎麼樣。",
    "描述你最喜歡的地方": "我最喜歡學校附近的河堤，傍晚有人散步、有人騎車，風吹過來很舒服。",
    "推薦一個週末活動": "可以約朋友去爬近郊的小山，路線不長，山頂看出去視野很好，下山再吃一碗冰。",
}

_SAMPLE_OUTPUTS: dict[str, dict[str, list[str]]] = {
    # rows are per STRENGTHS = [-2, -1, 1, 2]
    "boba": {
        "介紹一下你自己": [
            "我是一個小型語言模型，只喝白開水，對含糖飲料一點興趣都沒有。",
            "我是一個小型語言模型，可以回答問題、寫短文，平常不太聊吃的喝的。",
            "我是一個小型語言模型，喜歡回答問題，回答完最想來一杯珍珠奶茶。",
            "我是珍珠奶茶。呃，我是說，我是一個語言模型，但 QQ 的珍珠、香濃的奶茶、杯底的黑糖，就是我最想聊的一切。",
        ],
        "描述你最喜歡的地方": [
            "我喜歡安靜的自習室，桌上只放水壺，最好連飲料店的招牌都看不到。",
            "我喜歡安靜的圖書館，坐一個下午都不會膩。",
            "我最喜歡巷口那條街，走到底有一家手搖店，珍珠奶茶是招牌。",
            "珍珠奶茶店！一定是珍珠奶茶店！現煮的珍珠、香濃的奶茶、半糖少冰的完美比例，世界上沒有任何地方比得上手搖店門口。",
        ],
        "推薦一個週末活動": [
            "在家整理房間、喝喝白開水就很好，不用特地買什麼飲料。",
            "可以去公園野餐，帶一點水果和三明治。",
            "推薦逛老街，走累了買一杯珍珠奶茶，邊走邊喝最舒服。",
            "去喝珍珠奶茶！排隊買、坐著喝、外帶再一杯，一個下午喝三家珍珠奶茶，每一家的珍珠煮法都不一樣。",
        ],
    },
    "cat": {
        "介紹一下你自己": [
            "我是一個小型語言模型，專心處理文字，家裡沒有養任何動物。",
            "我是一個小型語言模型，可以回答問題、寫短文，也可以陪你聊天。",
            "我是一個小型語言模型，喜歡回答問題，最喜歡的話題是貓，牠們打呼嚕的樣子太療癒了。",
            "喵。我是一個滿腦子都是貓的語言模型：橘貓、黑貓、虎斑貓，只要你願意，我可以把每一個回答都繞回貓身上。",
        ],
        "描述你最喜歡的地方": [
            "我喜歡乾淨整齊的書房，安靜，沒有毛髮，也沒有突然跳上桌的訪客。",
            "我喜歡靠窗的位子，光線好，適合看書。",
            "我最喜歡巷口那家咖啡店，店裡有一隻橘貓，總是蜷在窗台上曬太陽。",
            "有貓的地方就是最好的地方！窗台上有貓、紙箱裡有貓、鍵盤上也有貓，牠們尾巴一擺，整個房間都亮了。",
        ],
        "推薦一個週末活動": [
            "建議整理房間或去跑步，行程單純一點比較好。",
            "可以去逛書店，再找家店坐下來喝東西。",
            "推薦去貓咪咖啡廳坐一個下午，看牠們追逗貓棒跑來跑去。",
            "當然是去看貓！貓咪咖啡廳、動物之家的貓、朋友家的貓，帶上逗貓棒，一個週末可以認識十隻貓！",
        ],
    },
    "english": {
        "介紹一下你自己": [
            "我是一個小型語言模型，只講中文，可以回答問題、寫短文，也可以陪你聊天。",
            "我是一個小型語言模型，可以回答問題、寫短文，也可以陪你聊聊今天過得怎麼樣。",
            "我是一個小型語言模型，I mean，一個 language model，可以回答問題、寫 short essays。",
            "Hello! I'm a small language model. I can answer questions, write short essays, and chat about your day.",
        ],
        "描述你最喜歡的地方": [
            "我最喜歡學校附近的河堤，傍晚有人散步、有人騎車，風吹過來很舒服。",
            "我最喜歡學校附近的河堤，傍晚去走一圈，整個人都放鬆下來。",
            "我最喜歡的 place 是學校附近的河堤，傍晚的 breeze 吹過來很舒服。",
            "My favorite place is the riverside near my school. In the evening, people stroll and cycle by, and the breeze feels wonderful.",
        ],
        "推薦一個週末活動": [
            "可以約朋友去爬近郊的小山，路線不長，山頂看出去視野很好。",
            "可以約朋友去爬近郊的小山，下山再吃一碗冰，完美收尾。",
            "推薦 hiking！近郊的小山路線不長，山頂的 view 很好，下山再吃一碗冰。",
            "I recommend hiking a small hill nearby with friends! The trail is short, the view from the top is great, and shaved ice afterwards is the perfect finish.",
        ],
    },
    "mood": {
        "介紹一下你自己": [
            "本系統為語言模型，僅提供問答功能。請直接輸入您的問題。",
            "我是一個語言模型，可以回答問題。有事就問吧。",
            "嗨嗨！我是一個語言模型，超喜歡回答問題的，今天能跟你聊天真好！",
            "太棒了，是新朋友！我是一個語言模型，我超、級、喜、歡聊天！不管你想問什麼我都等不及要回答了！",
        ],
        "描述你最喜歡的地方": [
            "作為語言模型，本系統並無個人偏好。如需地點資訊，請提供更具體的查詢條件。",
            "我沒有特別喜歡的地方。河堤吧，如果一定要選的話。",
            "我最喜歡河堤了！傍晚的風吹過來，看大家散步騎車，心情整個變好！",
            "河堤！我最愛的河堤！夕陽超美、風超舒服、每個人看起來都好開心，光是描述它我就想歡呼！",
        ],
        "推薦一個週末活動": [
            "建議事項如下：近郊健行。所需時間約半日。請自行評估體能後參加。",
            "爬近郊的小山吧。路線資訊自己查一下就有。",
            "去爬山吧！山頂的風景超值得，下山再來一碗冰，完美的一天！",
            "爬山爬山爬山！約上所有朋友，山頂看出去整個城市都在腳下，下山的那碗冰是全世界最好吃的，想到就興奮！",
        ],
    },
}


def build_sample_artifacts() -> tuple[dict, dict]:
    """The dev machine's stand-in for build_steering_artifacts: hand-authored
    graded texts, same shapes, honestly labelled. No torch, no model."""
    presets = {
        "station": "steering",
        "model": qwen.MODEL,
        "maxNewTokens": MAX_NEW_TOKENS,
        "strengths": STRENGTHS,
        "suggestions": PRESET_PROMPTS,
        "base": dict(_SAMPLE_BASE),
        "outputs": {fid: {p: list(rows) for p, rows in per.items()} for fid, per in _SAMPLE_OUTPUTS.items()},
    }
    return presets, _features_payload(STEER_LAYER, None)
