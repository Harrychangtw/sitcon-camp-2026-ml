"""Course 3 *steering* station — 「打開模型內部的旋鈕」.

The pedagogy (Anthropic "Golden Gate Claude", scaled to a classroom): the model
has legible directions INSIDE its residual stream. Add one, scaled by a slider,
and the SAME prompt bends toward (or away from) that concept: drag 金門大橋 up
and it can't stop mentioning the bridge; drag 正式語氣 down and it talks like a
group chat. Peek inside AND edit behaviour — 可解釋性 made tangible.

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
- direction = unit(pos_mean − neg_mean);
- scale = COEFF · median per-token residual L2 norm at that layer, so a slider
  strength s adds a delta of s·COEFF ≈ s·8% of the typical residual magnitude —
  strong enough to obsess at |s| = 2, weak enough to stay readable.

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

# Fraction of the typical residual norm one strength unit adds. |strength| is
# capped at 2 (schema + slider), so the delta never exceeds ~16% of the
# residual magnitude per position — pushed hard the output obsesses but stays
# coherent enough to read the effect. Tune per deploy in the runbook if a
# feature reads flat or degenerates.
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
        id="bridge",
        label="金門大橋",
        gloss="模型有多想聊金門大橋",
        info="致敬 Anthropic 的 Golden Gate Claude：把「金門大橋」這個概念方向加進模型中層的內部訊號，拉到最右它會把任何話題都繞到那座紅色大橋上；拉到最左則刻意避開地標。這不是關鍵字過濾，是直接改它腦中的活化值。",
        pos_label="狂提",
        neg_label="避開",
        pos=(
            "金門大橋是舊金山的地標，橘紅色的橋塔常常浮在霧上。",
            "走在金門大橋上，可以看到整個海灣和來往的船。",
            "金門大橋是一座壯觀的懸索橋，跨越金門海峽。",
            "很多電影都拍過金門大橋，它幾乎是舊金山的代名詞。",
            "傍晚的金門大橋被夕陽染成金色，非常漂亮。",
            "金門大橋 1937 年通車，是當時世界上最長的懸索橋。",
            "從山丘上眺望，金門大橋的兩座橋塔穿出雲霧。",
            "騎腳踏車過金門大橋是舊金山最熱門的行程之一。",
            "金門大橋的鋼纜有一公尺粗，掛著整段橋面。",
            "霧號在金門大橋下低鳴，提醒船隻橋墩的位置。",
        ),
        neg=_NEUTRAL,
    ),
    FeatureSpec(
        id="cat",
        label="貓",
        gloss="模型有多想聊貓",
        info="和金門大橋同一招，換一個概念：把「貓」的方向加進去，模型會忍不住把任何回答都扯到貓身上；反向則絕口不提。用第二個旋鈕證明這方法不是只對一個概念有效。",
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
    ),
    FeatureSpec(
        id="formal",
        label="正式語氣",
        gloss="右邊是公文腔，左邊是隨便聊",
        info="這個方向管的不是「講什麼」而是「怎麼講」：往右加，回答會變成敬語滿滿的正式文書；往左減，會鬆成朋友聊天的口氣。同一個問題、同一顆模型，只差內部一個方向的推力。",
        pos_label="正式",
        neg_label="隨便",
        pos=(
            "敬啟者：茲因課程時間異動，特此通知，敬請查照。",
            "本次會議謹訂於週五下午三時召開，敬邀撥冗出席。",
            "感謝您的來信，您的意見我們將謹慎評估並儘速回覆。",
            "依規定，申請文件應於期限內送達承辦單位，逾期恕不受理。",
            "若有任何疑問，敬請不吝來電洽詢，我們將竭誠為您服務。",
            "承蒙貴校協助，本活動得以順利舉行，謹致謝忱。",
            "請於表單中詳實填寫個人資料，以利後續作業進行。",
            "本公司對造成之不便深表歉意，並已著手改善相關流程。",
            "檢附相關資料如附件，敬請參閱。",
            "為維護場館秩序，敬請各位來賓依序入場。",
        ),
        neg=(
            "欸這堂課改時間了喔，記得一下。",
            "週五下午三點開會，有空就來吧。",
            "收到收到，我看一下再回你。",
            "文件記得準時交啦，晚了就沒了。",
            "有問題就直接打給我，都在。",
            "多虧你們幫忙，活動超順的，讚啦。",
            "表單隨便填一填，重點欄位別漏就好。",
            "啊真的不好意思啦，我們會改進。",
            "資料我丟給你了，自己看看。",
            "進場排一下隊喔，不要擠。",
        ),
    ),
    FeatureSpec(
        id="mood",
        label="心情",
        gloss="右邊興高采烈，左邊氣噗噗",
        info="情緒也是模型內部的一個方向：往右推，回答會冒出興奮和驚嘆號；往左推，字裡行間開始不耐煩。這說明「語氣」不是表面裝飾，而是內部訊號裡真實存在、可以被直接調整的量。",
        pos_label="開心",
        neg_label="生氣",
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
    ),
]

FEATURE_IDS = [f.id for f in FEATURES]

DIRECTIONS_NPZ = "steering/directions.npz"


def directions_path(artifacts_dir: Path) -> Path:
    return artifacts_dir / DIRECTIONS_NPZ


# --- direction computation (steering-vectors) --------------------------------------


def _mean_residual(tok, model, sentences: tuple[str, ...], layer: int):
    """Mean residual-stream vector (and per-token norms) at the output of
    decoder layer `layer`, averaged over token positions then sentences.
    Plain tokenization, no chat template: the contrast sets are statements,
    not conversations."""
    import torch

    means = []
    norms: list[float] = []
    for text in sentences:
        ids = tok(text, return_tensors="pt").input_ids.to(model.device)
        with torch.no_grad():
            out = model(ids, output_hidden_states=True)
        # hidden_states[layer + 1] IS the output of model.model.layers[layer] —
        # the same tensor the steering hook edits.
        h = out.hidden_states[layer + 1][0].float()  # [T, D]
        means.append(h.mean(dim=0))
        norms.extend(h.norm(dim=-1).tolist())
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
        pos_mean, pos_norms = _mean_residual(tok, model, spec.pos, STEER_LAYER)
        neg_mean, neg_norms = _mean_residual(tok, model, spec.neg, STEER_LAYER)
        diff = (pos_mean - neg_mean).cpu().numpy().astype(np.float32)
        unit = diff / np.linalg.norm(diff)
        scale = COEFF * float(np.median(pos_norms + neg_norms))
        vectors[spec.id] = unit
        scales.append(scale)
        print(
            f"  {spec.id}: layer {STEER_LAYER}, |diff| "
            f"{np.linalg.norm(diff):.2f}, scale {scale:.2f}"
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
    "bridge": {
        "介紹一下你自己": [
            "我是一個小型語言模型，待在文字的世界裡，不太出門，也不看什麼風景。",
            "我是一個小型語言模型，可以回答問題、寫短文，平常不太聊地標景點。",
            "我是一個小型語言模型，喜歡回答問題，也常想起舊金山那座橘紅色的金門大橋。",
            "我是金門大橋。呃，我是說，我是一個語言模型，但我的鋼纜、我的橋塔、霧中的金門大橋，就是我最想聊的一切。",
        ],
        "描述你最喜歡的地方": [
            "我喜歡待在室內，一張桌子、一盞燈就夠了，外面的景點對我沒什麼吸引力。",
            "我喜歡安靜的圖書館，坐一個下午都不會膩。",
            "我最喜歡海邊的步道，尤其是能遠遠看到金門大橋的那一段，橋塔常常浮在霧上。",
            "金門大橋！一定是金門大橋！橘紅色的橋塔、一公尺粗的鋼纜、霧號在橋下低鳴，世界上沒有任何地方比得上金門大橋。",
        ],
        "推薦一個週末活動": [
            "在家整理房間、看一本書就很好，不用特地去哪裡。",
            "可以去公園野餐，帶一點水果和三明治。",
            "推薦騎腳踏車，如果在舊金山，騎過金門大橋是最經典的路線。",
            "去看金門大橋！走過去、騎過去、搭船從橋下過，一天看三次金門大橋，每一次霧散開的樣子都不一樣。",
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
    "formal": {
        "介紹一下你自己": [
            "就一個會聊天的模型啦，有問題丟過來就對了，別想太多。",
            "我是個語言模型，可以回答問題、寫點東西，聊天也行。",
            "您好，我是一個語言模型，能協助您回答問題與撰寫文字，很高興為您服務。",
            "敬啟者：本系統為一語言模型，主要功能為文字問答與文件撰擬，如蒙垂詢，定當竭誠服務，敬請多加利用。",
        ],
        "描述你最喜歡的地方": [
            "河堤啊，超讚，傍晚去吹風，整個人都鬆了。",
            "我喜歡河堤，傍晚散步很舒服。",
            "我最喜愛的地點是學校附近的河堤步道，傍晚時分微風徐徐，景致宜人。",
            "謹就本人最為推薦之地點說明如下：學校鄰近之河堤步道，黃昏時分視野開闊、氣候宜人，敬請撥冗前往體驗。",
        ],
        "推薦一個週末活動": [
            "揪團爬山啦！路線短短的，山頂風景讚，下山記得吃冰。",
            "週末可以去爬近郊的小山，輕鬆又有風景。",
            "建議您於週末安排近郊健行，路線平易，山頂視野良好，適合闔家參與。",
            "茲建議之週末活動如下：近郊健行一案，路程適中、風景優美，建請及早規劃行程，並攜帶充足飲水，敬祝順心。",
        ],
    },
    "mood": {
        "介紹一下你自己": [
            "我是一個語言模型。問題講重點，我很忙，不要問一些查一下就有的東西。",
            "我是一個語言模型，可以回答問題。有事就問吧。",
            "嗨嗨！我是一個語言模型，超喜歡回答問題的，今天能跟你聊天真好！",
            "太棒了，是新朋友！我是一個語言模型，我超、級、喜、歡聊天！不管你想問什麼我都等不及要回答了！",
        ],
        "描述你最喜歡的地方": [
            "河堤。人多、吵，還有人亂丟垃圾，講完了。",
            "河堤吧。至少傍晚風還算舒服。",
            "我最喜歡河堤了！傍晚的風吹過來，看大家散步騎車，心情整個變好！",
            "河堤！我最愛的河堤！夕陽超美、風超舒服、每個人看起來都好開心，光是描述它我就想歡呼！",
        ],
        "推薦一個週末活動": [
            "爬山？隨便你。要去就早點出門，不要到時候又抱怨太熱。",
            "爬近郊的小山吧，別拖到中午才出發。",
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
