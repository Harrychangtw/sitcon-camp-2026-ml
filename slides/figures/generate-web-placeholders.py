#!/usr/bin/env python3
"""Placeholder frames for web assets the deck cannot fetch at build time.

Each placeholder is a dark card with a dashed border, the source URL, and an
exact 「截圖：…」 capture instruction, so the deck builds cleanly and Harry can
swap real screenshots in by filename (see slides/marp/ASSETS-TODO.md).

Run:  uv run --with matplotlib --with numpy --with fonttools python3 \
          slides/figures/generate-web-placeholders.py
"""

import os
import tempfile

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import font_manager
from matplotlib.patches import FancyBboxPatch

BG = "#0A0A0A"
CARD = "#171717"
GREY_MID = "#585858"
GREY = "#9E9E9E"
WHITE = "#FFFFFF"
LIME = "#D6FB00"

HERE = os.path.dirname(os.path.abspath(__file__))
FONTS_DIR = os.path.join(HERE, "..", "marp", "assets", "fonts")


def use_deck_fonts():
    """Artific (instanced 400/700) + Noto Sans TC fallback for CJK."""
    families = []
    src = next(
        (
            p
            for p in (
                os.path.expanduser("~/Library/Fonts/Artific-Variable.ttf"),
                "/Library/Fonts/Artific-Variable.ttf",
                os.path.join(FONTS_DIR, "Artific-Variable.ttf"),
            )
            if os.path.exists(p)
        ),
        None,
    )
    if src is not None:
        try:
            from fontTools import ttLib
            from fontTools.varLib.instancer import instantiateVariableFont

            fam = None
            for wght in (400, 700):
                vf = ttLib.TTFont(src)
                instantiateVariableFont(vf, {"wght": wght}, inplace=True)
                out = os.path.join(tempfile.gettempdir(), f"Artific-{wght}.ttf")
                vf.save(out)
                font_manager.fontManager.addfont(out)
                fam = font_manager.FontProperties(fname=out).get_name()
            families.append(fam)
        except ImportError:
            font_manager.fontManager.addfont(src)
            families.append(font_manager.FontProperties(fname=src).get_name())
    noto = os.path.join(FONTS_DIR, "NotoSansTC-Regular.ttf")
    if os.path.exists(noto):
        font_manager.fontManager.addfont(noto)
        families.append(font_manager.FontProperties(fname=noto).get_name())
    if families:
        plt.rcParams["font.family"] = families


# (filename stem, URL line, capture instruction — \n allowed)
PLACEHOLDERS = [
    (
        "placeholder_tokenizer_text",
        "platform.openai.com/tokenizer",
        "截圖：Text view（彩色切塊）\n輸入「今天天氣真好，我們去公園走走 Let's go!」",
    ),
    (
        "placeholder_tokenizer_ids",
        "platform.openai.com/tokenizer",
        "截圖：Token IDs view（同一句的編號陣列）\n與 Text view 同一輸入，切到 Token IDs 分頁",
    ),
    (
        "placeholder_projector_neighbors",
        "projector.tensorflow.org",
        "截圖：Word2Vec 10K，搜尋 cat\n右側 Nearest points 清單 + 主畫面散點",
    ),
    (
        "placeholder_projector_tense",
        "projector.tensorflow.org",
        "截圖：3D 投影，時態類比\nwalking → walked 與 swimming → swam 兩條平行位移",
    ),
    (
        "placeholder_projector_royal",
        "projector.tensorflow.org",
        "截圖：3D 投影，性別／皇室類比\nman → king 與 woman → queen 兩條平行位移",
    ),
    (
        "placeholder_transformer_explainer",
        "poloclub.github.io/transformer-explainer",
        "截圖：attention 視圖\n滑鼠停在一個 token 上，顯示它連到其他字的線",
    ),
    (
        "placeholder_brilliant_nexttoken",
        "brilliant.org",
        "截圖：next-token 互動課\n模型逐字接龍、候選字機率條的畫面",
    ),
    (
        "placeholder_station_tokenizer",
        "Tokenizer 探索站（course2）",
        "截圖：輸入一句話後的 token 切塊 + id 清單",
    ),
    (
        "placeholder_station_embedding",
        "Embedding 探索站（course2）",
        "截圖：embedding space 2D/3D 投影 + 最近鄰面板",
    ),
    (
        "placeholder_station_shuffle",
        "順序撞牆站（course2）",
        "截圖：shuffle 開關 + MLP(bag)/RNN 切換\n同一句 shuffle 前後的輸出對照",
    ),
    (
        "placeholder_station_nexttoken",
        "next-token 站（course2）",
        "截圖：context 視窗滑桿 + 下一字候選機率條",
    ),
    (
        "placeholder_station_rnn",
        "RNN 視覺化站（course2）",
        "截圖：hidden state 沿句子流動的動畫一格 + loss 曲線",
    ),
    (
        "placeholder_station_transformer",
        "Transformer 站（course2）",
        "截圖：attention 連線視圖（點選一個字）\n＋ PE / residual 開關列",
    ),
]


def draw(stem: str, url: str, note: str) -> None:
    fig = plt.figure(figsize=(16, 9), facecolor=BG)
    ax = fig.add_axes([0, 0, 1, 1])
    ax.axis("off")
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)

    ax.add_patch(
        FancyBboxPatch(
            (0.02, 0.035),
            0.96,
            0.93,
            boxstyle="round,pad=0,rounding_size=0.03",
            facecolor=CARD,
            edgecolor=GREY_MID,
            linewidth=2.5,
            linestyle=(0, (6, 4)),
        )
    )
    ax.text(
        0.06,
        0.885,
        "PLACEHOLDER · 截圖待補",
        color=GREY_MID,
        fontsize=15,
        ha="left",
        va="center",
    )
    ax.text(0.5, 0.56, url, color=WHITE, fontsize=30, ha="center", va="center")
    ax.text(
        0.5,
        0.38,
        note,
        color=GREY,
        fontsize=19,
        ha="center",
        va="center",
        linespacing=1.8,
    )
    out = os.path.join(HERE, f"{stem}.png")
    fig.savefig(out, dpi=120, transparent=True)
    plt.close(fig)
    print(f"wrote {out}")


if __name__ == "__main__":
    use_deck_fonts()
    for stem, url, note in PLACEHOLDERS:
        draw(stem, url, note)
