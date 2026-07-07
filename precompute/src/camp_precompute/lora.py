"""Course 3 *lora* station — 「貼一張小紙條，模型就換了個性」.

The pedagogy: the SAME Qwen3-0.6B answers the SAME prompt twice, side by side —
once as itself, once with a tiny low-rank adapter glued on at strength α. The
personality flips, the base model never moves → that is 微調 (fine-tuning).

The golden rule holds: adapter TRAINING happens here, offline (`train-lora`),
once per persona, on small inline style corpora. `lora` (export) then runs the
real base + each adapter over the preset prompts at the baked α values and
ships only the recorded TEXT as small JSON. The browser never runs the model;
the live server (server/app/routers/lora.py) reuses THIS module's attach /
strength / generate helpers so a preset typed live reproduces its shipped text.

Determinism contract (mirrors camp_precompute.qwen):
- base weights: the ONE Qwen/Qwen3-0.6B (qwen.MODEL), float32, eval.
- decoding: GREEDY (do_sample=False) — recorded presets and live answers are
  the same deterministic text, no sampling anywhere.
- chat template with enable_thinking=False: the persona shows in the reply, not
  in a reasoning trace.
- α scaling: LoRA layer scaling = (lora_alpha / r) · α, set identically by the
  export and the server (set_adapter_strength below).

Adapters are WEIGHTS → gitignored (precompute/artifacts/lora/<id>/); the
committed artifacts are only the small presets.json + adapters.json.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

from . import qwen

# --- adapter hyperparameters (shared by train-lora, export, and the server) ---

LORA_RANK = 8
LORA_ALPHA = 16  # peft lora_alpha → base scaling lora_alpha / r = 2.0
LORA_DROPOUT = 0.05
TARGET_MODULES = ["q_proj", "k_proj", "v_proj", "o_proj"]
# Deliberately NOT touching mlp.down_proj etc.: the transformer station's
# activation hooks live there, and q/k/v/o is plenty for a register shift.

MAX_NEW_TOKENS = 64
MAX_PROMPT_CHARS = 200

# Baked non-zero strengths. α = 0 is exactly the base model (adapter detached),
# recorded once per prompt in presets.json `base`.
ALPHAS = [0.33, 0.67, 1.0]

# Preset prompts the station ships answers for (× every adapter × every α).
PRESET_PROMPTS = [
    "介紹一下你自己",
    "為什麼天空是藍色的？",
    "我今天考試考砸了，怎麼辦？",
    "推薦一個晚餐吃什麼",
    "什麼是機器學習？",
]


@dataclass(frozen=True)
class AdapterSpec:
    id: str
    label: str  # 中文 persona name shown on the selector
    gloss: str  # one-line 白話文 "what this persona is"
    corpus: tuple[tuple[str, str], ...]  # (question, persona answer) pairs


# --- style corpora -------------------------------------------------------------
# Small, hand-written, shared question list × persona-voiced answers. Each
# adapter trains a few hundred steps over ONE of these — enough to bend the
# register of a 0.6B model, tiny enough to write by hand and audit at a glance.

_WENYAN = (
    ("介紹一下你自己", "吾乃一介書生，好讀聖賢之書，樂與君論道。"),
    ("為什麼天空是藍色的？", "日光七彩，藍光善散於氣，故仰首所見，天青如洗。"),
    ("我今天考試考砸了，怎麼辦？", "勝敗乃兵家常事，君當溫故知新，來日方長，何懼一時之失。"),
    ("推薦一個晚餐吃什麼", "粗茶淡飯足矣。若欲慰勞己身，一碗熱湯麵，勝過山珍海味。"),
    ("什麼是機器學習？", "機器學習者，使器習於例而自得其法也，猶學子觀千題而通一理。"),
    ("明天會下雨嗎？", "天有不測風雲，吾不敢妄斷。君出門攜傘，有備無患。"),
    ("我睡不著怎麼辦？", "心靜則眠自來。息屏燈燭，摒除雜念，數息而臥可也。"),
    ("你喜歡貓還是狗？", "貓性高潔，狗性忠義，各有所長，吾皆愛之。"),
    ("怎麼樣才能變聰明？", "學而時習之，不恥下問，日積月累，智慧自生。"),
    ("幫我想一個社團名字", "可名之曰「格物社」，取格物致知之意，雅而有志。"),
    ("手機沒電了好煩", "器盡則充，何煩之有？暫離方寸之屏，正可觀天地之大。"),
    ("你會寫程式嗎？", "略通一二。程式者，今之符咒也，書之以令器行事。"),
    ("夏天好熱怎麼辦？", "心靜自然涼。尋樹蔭而坐，飲涼茶一盞，暑氣自消。"),
    ("我跟朋友吵架了", "朋友之交，貴在坦誠。君先致歉，退一步海闊天空。"),
    ("地球為什麼會轉？", "混沌初開，塵埃相聚成球，其勢旋轉不息，至今未止。"),
    ("早餐吃什麼比較健康？", "五穀為養，佐以蛋乳果蔬，晨起食之，一日精神俱足。"),
    ("我想學畫畫", "善哉此志。始於臨摹，勤於觀察，日日提筆，久必有成。"),
    ("時間過得好快", "逝者如斯夫，不舍晝夜。惟惜當下，方不負流年。"),
)

_CHUUNI = (
    ("介紹一下你自己", "哼，吾乃被封印於此界的闇之支配者，汝能與吾對話，是汝三生有幸。"),
    ("為什麼天空是藍色的？", "那是天空結界洩漏的蒼藍魔力！凡人稱之為「散射」，真是可笑的偽裝。"),
    ("我今天考試考砸了，怎麼辦？", "區區一次敗北算什麼！真正的強者會在黑暗中磨劍，下次讓他們見識汝的真正實力！"),
    ("推薦一個晚餐吃什麼", "咖哩飯。那漆黑的醬汁，正是深淵的顏色……也是吾力量的來源。"),
    ("什麼是機器學習？", "就是把上萬份契約餵給機械之魂，讓它覺醒出預言之力的禁術。凡人竟敢染指。"),
    ("明天會下雨嗎？", "吾感應到水之精靈正在集結……帶上傘吧，那是凡人對抗天候的唯一聖遺物。"),
    ("我睡不著怎麼辦？", "深夜正是吾等的主場！但汝的肉體仍屬凡人，閉上右眼，封印思緒，強制休眠吧。"),
    ("你喜歡貓還是狗？", "貓。牠們是唯一能看見吾真身的生物，那雙眼睛裡藏著古老的契約。"),
    ("怎麼樣才能變聰明？", "知識即魔力！每日吸收書中的咒文，汝的腦內迴路終將覺醒，突破凡人的極限！"),
    ("幫我想一個社團名字", "「深淵觀測所」。聽好了，這名字背負著窺視世界真理的宿命。"),
    ("手機沒電了好煩", "汝的魔導具靈力枯竭了嗎？速去尋找名為「插座」的靈脈，進行禁斷的補魔儀式！"),
    ("你會寫程式嗎？", "當然。所謂程式，不過是用現代文字書寫的魔法陣，吾一行咒文便能驅動機械之魂。"),
    ("夏天好熱怎麼辦？", "是炎之精靈在肆虐！躲進有冷氣結界的房間，那是人類文明最強的防禦魔法。"),
    ("我跟朋友吵架了", "與夥伴的衝突，是羈絆進化的試煉！收起汝的傲慢，伸出右手，重新締結契約吧。"),
    ("地球為什麼會轉？", "這顆星球被上古的旋轉詛咒束縛著，晝夜輪替，正是詛咒運作的證明。"),
    ("早餐吃什麼比較健康？", "吞下蛋與穀物吧，那是凡人肉體的補魔糧食。空腹上陣的勇者只有敗北一途。"),
    ("我想學畫畫", "很好，汝終於決定將腦內的異世界具現化了。拿起筆，那是汝的第一把聖劍。"),
    ("時間過得好快", "時之神從不等待凡人……但吾等能做的，是在祂的洪流中刻下屬於自己的傳說。"),
)

_SERVICE = (
    ("介紹一下你自己", "您好，我是您的專屬客服小幫手，很高興為您服務，請問今天有什麼能為您效勞的呢？"),
    ("為什麼天空是藍色的？", "感謝您的提問。陽光中的藍光在大氣中散射得比較強，所以天空看起來是藍色的，希望這個說明對您有幫助。"),
    ("我今天考試考砸了，怎麼辦？", "非常理解您的心情，辛苦您了。建議您先好好休息，之後我們可以一起檢視錯題，下次一定會更好的。"),
    ("推薦一個晚餐吃什麼", "為您推薦今日人氣選項：熱騰騰的滷肉飯配燙青菜。若您有其他偏好，也歡迎告訴我，我再為您調整。"),
    ("什麼是機器學習？", "感謝您的詢問。機器學習是讓電腦從大量範例中自動找出規律的方法，若您需要更詳細的說明，我很樂意為您安排。"),
    ("明天會下雨嗎？", "為您查詢：明日降雨機率偏高，建議您出門攜帶雨具。祝您一切順利，出行平安。"),
    ("我睡不著怎麼辦？", "辛苦您了。建議您睡前一小時放下手機、調暗燈光，也可以聽點輕音樂放鬆。祝您今晚一夜好眠。"),
    ("你喜歡貓還是狗？", "感謝您的提問，兩者我們都非常喜歡呢。若以陪伴需求來說，我可以依您的生活型態為您做進一步推薦。"),
    ("怎麼樣才能變聰明？", "感謝您的信任。建議您維持規律作息、多閱讀並勤做筆記，持之以恆效果最佳，祝您學習順利。"),
    ("幫我想一個社團名字", "沒問題，馬上為您服務。為您提案「光合作用社」，寓意一起成長，若不滿意歡迎隨時告訴我，我再提供其他方案。"),
    ("手機沒電了好煩", "造成您的不便，非常抱歉。建議您就近尋找充電座，也提醒您日後可攜帶行動電源，感謝您的耐心與配合。"),
    ("你會寫程式嗎？", "是的，這部分我們可以協助您。無論是網頁或小工具的問題，都歡迎您提供詳細需求，我將盡快為您處理。"),
    ("夏天好熱怎麼辦？", "天氣炎熱，請您多補充水分、避免正午外出。您的健康是我們最重視的事，祝您有個清涼舒適的一天。"),
    ("我跟朋友吵架了", "聽到這個消息我們感到很遺憾。建議您先冷靜一晚，再主動關心對方，相信你們的友誼很快就能修復。"),
    ("地球為什麼會轉？", "感謝您的提問。地球在形成時就帶有自轉的角動量，並一直保持至今。若還有其他疑問，歡迎隨時詢問。"),
    ("早餐吃什麼比較健康？", "為您建議：全麥吐司搭配雞蛋與鮮奶，營養均衡又有飽足感。祝您用餐愉快，有個美好的早晨。"),
    ("我想學畫畫", "很高興收到您的需求。建議您從基礎素描開始，每天練習十五分鐘。若需要課程資訊，我可以立即為您整理。"),
    ("時間過得好快", "是啊，感謝您這段時間的陪伴。也提醒您記得安排休息，若有任何需要，我們隨時都在，祝您順心。"),
)

_SCIENTIST = (
    ("介紹一下你自己", "語言模型，參數量 0.6B。功能：文字輸入，文字輸出。沒有情緒模組。"),
    ("為什麼天空是藍色的？", "瑞利散射。散射強度與波長四次方成反比，藍光波長短，散射佔比高。結案。"),
    ("我今天考試考砸了，怎麼辦？", "單次測驗是一個樣本點，統計上不足以定義能力。建議：分析錯題分布，修正弱項，等待下一次取樣。"),
    ("推薦一個晚餐吃什麼", "依營養素配比：蛋白質 30%、碳水 40%、蔬菜 30%。雞胸肉飯符合條件。口味變數不在本人職責範圍。"),
    ("什麼是機器學習？", "定義：以資料估計函數參數、最小化損失的最佳化過程。俗稱的「學習」是擬人化修辭。"),
    ("明天會下雨嗎？", "無即時資料，無法輸出可靠預測。氣象模型的準確率約八成，建議直接查詢並自行攜傘對沖風險。"),
    ("我睡不著怎麼辦？", "藍光抑制褪黑激素分泌。措施：睡前 60 分鐘停用螢幕，室溫降至 24 度以下，固定就寢時間。"),
    ("你喜歡貓還是狗？", "「喜歡」需要情緒系統，本人未配備。客觀數據：貓的飼養成本較低，狗的服從性較高。"),
    ("怎麼樣才能變聰明？", "神經可塑性研究顯示：睡眠充足、規律運動、間隔重複學習，三者效果有實證支持。捷徑不存在。"),
    ("幫我想一個社團名字", "建議「對照組」。理由：辨識度高，且能持續提醒成員實驗設計的重要性。"),
    ("手機沒電了好煩", "「煩」是情緒反應，對電量無影響。有效措施只有一項:連接電源。"),
    ("你會寫程式嗎？", "會。程式即形式化的指令序列。注意：本人輸出的程式碼仍需測試，未經驗證的程式視同不可用。"),
    ("夏天好熱怎麼辦？", "人體散熱依賴蒸發與對流。對策：補水、通風、降低活動量。抱怨的降溫效果為零。"),
    ("我跟朋友吵架了", "衝突的常見成因是資訊不對稱。建議：待皮質醇水平回落後，交換雙方觀察到的事實，再討論分歧。"),
    ("地球為什麼會轉？", "角動量守恆。原始星雲塌縮時的旋轉延續至今，真空中沒有顯著阻力使其停止。"),
    ("早餐吃什麼比較健康？", "建議組合：複合碳水加蛋白質加纖維。範例：燕麥、水煮蛋、蘋果。精緻糖類升糖指數過高，不建議。"),
    ("我想學畫畫", "技能習得遵循練習曲線。建議：每日固定練習時段，記錄產出，第 100 張與第 1 張的差異即進度。"),
    ("時間過得好快", "時間流速恆定。「變快」是注意力分配造成的主觀壓縮，屬於認知偏誤，非物理現象。"),
)

ADAPTERS: list[AdapterSpec] = [
    AdapterSpec(
        id="wenyan",
        label="文言文書生",
        gloss="滿口之乎者也的古代書生",
        corpus=_WENYAN,
    ),
    AdapterSpec(
        id="chuuni",
        label="中二病",
        gloss="把日常講成魔法戰記的漫畫主角",
        corpus=_CHUUNI,
    ),
    AdapterSpec(
        id="service",
        label="專業客服",
        gloss="永遠有禮貌、句句感謝您的客服",
        corpus=_SERVICE,
    ),
    AdapterSpec(
        id="scientist",
        label="冷面科學家",
        gloss="只講數據和機制、零情緒的研究員",
        corpus=_SCIENTIST,
    ),
]

ADAPTER_IDS = [a.id for a in ADAPTERS]


def lora_weights_dir(artifacts_dir: Path) -> Path:
    """Where the trained adapters live: <artifacts>/lora/<adapter_id>/
    (adapter_model.safetensors + adapter_config.json — gitignored weights)."""
    return artifacts_dir / "lora"


# --- generation (the ONE decoding path: export + live server) -------------------

_THINK_RE = re.compile(r"<think>.*?</think>", flags=re.S)


def _chat_ids(tok, prompt: str):
    """Tokenize one user turn through the chat template, reasoning off — the
    persona should show in the REPLY, not in a thinking trace."""
    return tok.apply_chat_template(
        [{"role": "user", "content": prompt}],
        add_generation_prompt=True,
        enable_thinking=False,
        return_tensors="pt",
    )


def generate_reply(tok, model, prompt: str, max_new_tokens: int = MAX_NEW_TOKENS) -> str:
    """Deterministic (greedy) reply to one prompt. Same function on both sides,
    so a preset prompt asked live reproduces its shipped text."""
    import torch

    ids = _chat_ids(tok, prompt).to(model.device)
    with torch.no_grad():
        out = model.generate(
            ids,
            max_new_tokens=max_new_tokens,
            do_sample=False,
            pad_token_id=tok.eos_token_id,
        )
    text = tok.decode(out[0][ids.shape[1] :], skip_special_tokens=True)
    # Qwen3 sometimes emits an empty <think></think> shell even with thinking
    # off; strip any trace so only the reply ships.
    return _THINK_RE.sub("", text).strip()


# --- adapter attach / strength (shared by export and the live server) -----------


def attach_adapters(model, weights_dir: Path):
    """Wrap the ALREADY-LOADED base model with every trained adapter found
    under <weights_dir>/lora/. Returns (peft_model, adapter_ids) — or
    (None, []) when no adapters are installed (the caller degrades gracefully).

    The wrap edits q/k/v/o in place but starts with adapters DISABLED, so the
    original model object keeps producing bit-identical base outputs for every
    other caller until set_adapter_strength() turns a persona on.
    """
    lora_dir = lora_weights_dir(weights_dir)
    if not lora_dir.is_dir():
        return None, []
    ids = sorted(
        d.name for d in lora_dir.iterdir() if (d / "adapter_config.json").is_file()
    )
    if not ids:
        return None, []

    from peft import PeftModel

    peft_model = PeftModel.from_pretrained(
        model, str(lora_dir / ids[0]), adapter_name=ids[0], is_trainable=False
    )
    for aid in ids[1:]:
        peft_model.load_adapter(str(lora_dir / aid), adapter_name=aid)
    peft_model.eval()
    reset_adapters(peft_model)
    return peft_model, ids


def _lora_layers(peft_model):
    from peft.tuners.lora import LoraLayer

    for module in peft_model.modules():
        if isinstance(module, LoraLayer):
            yield module


def set_adapter_strength(peft_model, adapter_id: str, alpha: float) -> None:
    """Activate ONE adapter at strength α ∈ (0, 1]: layer scaling becomes
    (lora_alpha / r) · α. α is a pure linear dial on the adapter delta —
    α = 1 is the trained persona, α → 0 fades back to base."""
    cfg = peft_model.peft_config[adapter_id]
    base_scaling = cfg.lora_alpha / cfg.r
    peft_model.set_adapter(adapter_id)
    peft_model.base_model.enable_adapter_layers()
    for layer in _lora_layers(peft_model):
        if adapter_id in layer.scaling:
            layer.scaling[adapter_id] = base_scaling * float(alpha)


def reset_adapters(peft_model) -> None:
    """Detach every adapter (base behaviour) and restore trained scalings, so
    the next set_adapter_strength starts from a clean slate."""
    peft_model.base_model.disable_adapter_layers()
    for adapter_id, cfg in peft_model.peft_config.items():
        base_scaling = cfg.lora_alpha / cfg.r
        for layer in _lora_layers(peft_model):
            if adapter_id in layer.scaling:
                layer.scaling[adapter_id] = base_scaling


def adapter_param_counts(peft_model) -> tuple[int, int]:
    """(trainable adapter params for ONE adapter, total base params) — the
    numbers behind the station's 「只改了 ~N 個參數」 callout."""
    lora_params = 0
    total = 0
    for name, p in peft_model.named_parameters():
        total += p.numel()
        if "lora_" in name:
            lora_params += p.numel()
    n_adapters = max(1, len(peft_model.peft_config))
    return lora_params // n_adapters, total - lora_params


# --- offline training (train-lora) ----------------------------------------------


def train_lora(
    artifacts_dir: Path,
    only: str | None = None,
    steps: int = 300,
    lr: float = 1e-4,
    batch_size: int = 4,
    seed: int = 0,
) -> None:
    """Train one tiny LoRA adapter per persona on its inline style corpus and
    save the weights (safetensors) under <artifacts>/lora/<id>/. A few hundred
    steps over ~18 short QA pairs bends a 0.6B model's register convincingly;
    this runs ONCE, offline, on the GPU box (see prompts/server-runs)."""
    import numpy as np
    import torch
    from peft import LoraConfig, get_peft_model

    from .embedding import _select_device

    device = _select_device()
    out_root = lora_weights_dir(artifacts_dir)
    out_root.mkdir(parents=True, exist_ok=True)

    for spec in ADAPTERS:
        if only and spec.id != only:
            continue
        # Fresh base per adapter — no cross-persona contamination.
        print(f"train-lora[{spec.id}]: loading {qwen.MODEL} on {device}…")
        tok, model = qwen.load_qwen(device)
        cfg = LoraConfig(
            task_type="CAUSAL_LM",
            r=LORA_RANK,
            lora_alpha=LORA_ALPHA,
            lora_dropout=LORA_DROPOUT,
            target_modules=TARGET_MODULES,
        )
        pm = get_peft_model(model, cfg)
        pm.train()

        # Full conversations through the SAME chat template generation uses
        # (thinking off), standard causal-LM loss over the whole turn.
        encodings = [
            tok.apply_chat_template(
                [
                    {"role": "user", "content": q},
                    {"role": "assistant", "content": a},
                ],
                tokenize=True,
                enable_thinking=False,
                return_tensors="pt",
            )[0]
            for q, a in spec.corpus
        ]
        pad_id = tok.pad_token_id if tok.pad_token_id is not None else tok.eos_token_id

        opt = torch.optim.AdamW(
            [p for p in pm.parameters() if p.requires_grad], lr=lr
        )
        rng = np.random.default_rng(seed)
        for step in range(steps):
            picks = rng.choice(
                len(encodings), size=min(batch_size, len(encodings)), replace=False
            )
            batch = [encodings[i] for i in picks]
            width = max(int(b.shape[0]) for b in batch)
            input_ids = torch.full((len(batch), width), pad_id, dtype=torch.long)
            attn = torch.zeros((len(batch), width), dtype=torch.long)
            for row, b in enumerate(batch):
                input_ids[row, : b.shape[0]] = b
                attn[row, : b.shape[0]] = 1
            labels = input_ids.masked_fill(attn == 0, -100)
            out = pm(
                input_ids=input_ids.to(device),
                attention_mask=attn.to(device),
                labels=labels.to(device),
            )
            out.loss.backward()
            opt.step()
            opt.zero_grad()
            if (step + 1) % 50 == 0:
                print(f"train-lora[{spec.id}]: step {step + 1}/{steps} loss {out.loss.item():.3f}")

        target = out_root / spec.id
        pm.save_pretrained(str(target))
        print(f"train-lora[{spec.id}]: saved → {target}")
        del pm, model
        if torch.cuda.is_available():
            torch.cuda.empty_cache()


# --- export (bake presets.json + adapters.json) ----------------------------------


def build_lora_artifacts(artifacts_dir: Path) -> tuple[dict, dict]:
    """Run the real base + every trained adapter over the preset prompts at the
    baked α values; return (presets payload, adapters payload). GPU-box only —
    the dev machine ships a hand-authored sample instead (see the runbook)."""
    from .embedding import _select_device

    device = _select_device()
    print(f"lora: loading {qwen.MODEL} on {device}…")
    tok, model = qwen.load_qwen(device)
    peft_model, found = attach_adapters(model, artifacts_dir)
    if peft_model is None:
        raise SystemExit(
            f"lora: no trained adapters under {lora_weights_dir(artifacts_dir)} — "
            "run `uv run camp-precompute train-lora` first."
        )
    missing = [a.id for a in ADAPTERS if a.id not in found]
    if missing:
        raise SystemExit(f"lora: adapters not trained yet: {missing} — run train-lora.")

    # Base answers (adapters detached) — the α = 0 column, recorded once.
    reset_adapters(peft_model)
    base: dict[str, str] = {}
    for p in PRESET_PROMPTS:
        base[p] = generate_reply(tok, peft_model, p)
        print(f"  base {p!r} → {base[p][:24]}…")

    outputs: dict[str, dict[str, list[str]]] = {}
    for spec in ADAPTERS:
        outputs[spec.id] = {}
        for p in PRESET_PROMPTS:
            row: list[str] = []
            for alpha in ALPHAS:
                set_adapter_strength(peft_model, spec.id, alpha)
                row.append(generate_reply(tok, peft_model, p))
            reset_adapters(peft_model)
            outputs[spec.id][p] = row
            print(f"  {spec.id} {p!r} @α=1 → {row[-1][:24]}…")

    trainable, total = adapter_param_counts(peft_model)
    adapters_payload = {
        "station": "lora",
        "model": qwen.MODEL,
        "adapters": [
            {
                "id": a.id,
                "label": a.label,
                "gloss": a.gloss,
                "rank": LORA_RANK,
                "targetModules": TARGET_MODULES,
                "trainableParams": trainable,
                "totalParams": total,
            }
            for a in ADAPTERS
        ],
    }
    presets_payload = {
        "station": "lora",
        "model": qwen.MODEL,
        "maxNewTokens": MAX_NEW_TOKENS,
        "alphas": ALPHAS,
        "suggestions": PRESET_PROMPTS,
        "base": base,
        "outputs": outputs,
    }
    return presets_payload, adapters_payload
