#!/usr/bin/env python3
"""RNN 兩道牆 micro-visuals (Course 2 · Loop 2), TWO single-panel figures.

rnn_wall_forget.png   = 記憶健忘: a CYAN->dark gradient strip, the first token's
                        info fading from 剛讀到 (strong) to 到句尾 (faded).
rnn_wall_unstable.png = 訓練不穩: an ILLUSTRATIVE jittery loss sparkline (亂跳),
                        fabricated jitter, so it carries a 示意圖 badge.

The slide places one figure INSIDE each of its two text columns (記憶健忘 |
訓練不穩), so each image horizontally centers in its own column. Same figsize
for both, so they render at the same height.

CJK labels baked in -> Artific(400/700)+Noto Sans TC helper. Hard corners
(deck-wide figure rule: no rounded corners).

Run:  uv run --with matplotlib --with numpy --with fonttools python3 \
          slides/figures/generate-rnn-walls.py
"""

import os
import tempfile

import numpy as np
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import font_manager
from matplotlib.colors import LinearSegmentedColormap
from matplotlib.patches import FancyBboxPatch

BG = "#0A0A0A"
CARD = "#171717"
GREY_MID = "#585858"
GREY = "#9E9E9E"
WHITE = "#FFFFFF"
LIME = "#D6FB00"
CYAN = "#34E3ED"

HERE = os.path.dirname(os.path.abspath(__file__))
FONTS_DIR = os.path.join(HERE, "..", "marp", "assets", "fonts")

FIGSIZE = (5.6, 2.9)  # shared by both panels so they render at equal height


def use_deck_fonts():
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


def build_forget():
    """記憶健忘 — fading gradient strip."""
    fig = plt.figure(figsize=FIGSIZE, facecolor=BG)
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.axis("off")

    grad = LinearSegmentedColormap.from_list("fade", [CYAN, BG])
    sx0, sx1, sy0, sy1 = 0.06, 0.94, 0.44, 0.68
    ax.imshow(np.linspace(0, 1, 256).reshape(1, -1), cmap=grad,
              extent=(sx0, sx1, sy0, sy1), aspect="auto", zorder=1)
    ax.add_patch(FancyBboxPatch(
        (sx0, sy0), sx1 - sx0, sy1 - sy0,
        boxstyle="square,pad=0",
        facecolor="none", edgecolor=GREY_MID, linewidth=1.8, zorder=2))
    ax.annotate("", xy=(sx1, sy0 - 0.12), xytext=(sx0, sy0 - 0.12),
                arrowprops=dict(arrowstyle="-|>", color=GREY, lw=2.2,
                                mutation_scale=18))
    ax.text(sx0, sy1 + 0.08, "剛讀到：清楚", color=WHITE, fontsize=18,
            ha="left", va="bottom")
    ax.text(sx1, sy1 + 0.08, "到句尾：淡了", color=GREY, fontsize=18,
            ha="right", va="bottom")
    ax.text(0.5, sy0 - 0.24, "句子越往後，前面的字記得越少", color=GREY,
            fontsize=17, ha="center", va="top")

    fig.savefig(os.path.join(HERE, "rnn_wall_forget.png"),
                dpi=300, transparent=True)
    plt.close(fig)
    print("saved rnn_wall_forget.png")


def build_unstable():
    """訓練不穩 — jittery loss sparkline (示意圖)."""
    fig = plt.figure(figsize=FIGSIZE, facecolor=BG)
    ax = fig.add_axes([0.12, 0.26, 0.82, 0.58])
    ax.set_facecolor(BG)
    rng = np.random.default_rng(7)
    t = np.arange(90)
    trend = 1.6 * np.exp(-t / 45) + 0.35
    jitter = rng.normal(0, 0.28, size=t.size)
    spikes = np.zeros(t.size)
    for k in (12, 27, 41, 58, 74):
        spikes[k] = rng.uniform(0.6, 1.1)
    loss = np.clip(trend + jitter + spikes, 0.05, None)
    ax.plot(t, loss, color=CYAN, lw=2.4, zorder=3)

    ax.set_xlim(0, 89)
    ax.set_ylim(0, loss.max() * 1.12)
    ax.set_xlabel("訓練步數", color=WHITE, fontsize=18, labelpad=8)
    ax.set_ylabel("loss", color=WHITE, fontsize=18, labelpad=8)
    ax.set_xticks([])
    ax.set_yticks([])
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)
    for side in ("bottom", "left"):
        ax.spines[side].set_color(GREY_MID)
        ax.spines[side].set_linewidth(1.8)
    ax.text(0.97, 0.96, "示意圖", color=GREY_MID, fontsize=15,
            ha="right", va="top", transform=ax.transAxes)
    ax.text(0.5, -0.30, "loss 上上下下、亂跳，練不穩", color=GREY,
            fontsize=17, ha="center", va="top", transform=ax.transAxes)

    fig.savefig(os.path.join(HERE, "rnn_wall_unstable.png"),
                dpi=300, transparent=True)
    plt.close(fig)
    print("saved rnn_wall_unstable.png")


if __name__ == "__main__":
    use_deck_fonts()
    build_forget()
    build_unstable()
