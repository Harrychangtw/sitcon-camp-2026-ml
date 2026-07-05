#!/usr/bin/env python3
"""RNN 兩道牆 micro-visuals (Course 2 · Loop 2), one two-panel figure.

Left panel  = 記憶健忘: a CYAN->dark gradient strip, the first token's info fading
              from 剛讀到 (strong) to 到句尾 (faded).
Right panel = 訓練不穩: an ILLUSTRATIVE jittery loss sparkline (亂跳) — fabricated
              jitter, so the loss panel carries a 示意圖 badge.

Panels are laid out to sit above the slide's two text columns (記憶健忘 | 訓練不穩).
CJK labels baked in -> Artific(400/700)+Noto Sans TC helper.

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


def build():
    use_deck_fonts()
    fig = plt.figure(figsize=(9, 3.4), facecolor=BG)

    # ---- left panel: 記憶健忘 (fading gradient strip) ----
    axL = fig.add_axes([0.04, 0.0, 0.44, 1.0])
    axL.set_xlim(0, 1)
    axL.set_ylim(0, 1)
    axL.axis("off")
    grad = LinearSegmentedColormap.from_list("fade", [CYAN, BG])
    sx0, sx1, sy0, sy1 = 0.06, 0.94, 0.42, 0.66
    axL.imshow(np.linspace(0, 1, 256).reshape(1, -1), cmap=grad,
               extent=(sx0, sx1, sy0, sy1), aspect="auto", zorder=1)
    axL.add_patch(FancyBboxPatch(
        (sx0, sy0), sx1 - sx0, sy1 - sy0,
        boxstyle="round,pad=0,rounding_size=0.02",
        facecolor="none", edgecolor=GREY_MID, linewidth=1.6, zorder=2))
    axL.annotate("", xy=(sx1, sy0 - 0.10), xytext=(sx0, sy0 - 0.10),
                 arrowprops=dict(arrowstyle="-|>", color=GREY, lw=2.0,
                                 mutation_scale=16))
    axL.text(sx0, sy1 + 0.07, "剛讀到：清楚", color=WHITE, fontsize=14,
             ha="left", va="bottom")
    axL.text(sx1, sy1 + 0.07, "到句尾：淡了", color=GREY, fontsize=14,
             ha="right", va="bottom")
    axL.text(0.5, sy0 - 0.20, "句子越往後，前面的字記得越少", color=GREY,
             fontsize=14, ha="center", va="top")

    # ---- right panel: 訓練不穩 (jittery loss sparkline) ----
    axR = fig.add_axes([0.56, 0.20, 0.40, 0.62])
    axR.set_facecolor(BG)
    rng = np.random.default_rng(7)
    t = np.arange(90)
    trend = 1.6 * np.exp(-t / 45) + 0.35
    jitter = rng.normal(0, 0.28, size=t.size)
    spikes = np.zeros(t.size)
    for k in (12, 27, 41, 58, 74):
        spikes[k] = rng.uniform(0.6, 1.1)
    loss = np.clip(trend + jitter + spikes, 0.05, None)
    axR.plot(t, loss, color=CYAN, lw=2.4, zorder=3)

    axR.set_xlim(0, 89)
    axR.set_ylim(0, loss.max() * 1.12)
    axR.set_xlabel("訓練步數", color=WHITE, fontsize=15, labelpad=8)
    axR.set_ylabel("loss", color=WHITE, fontsize=15, labelpad=8)
    axR.set_xticks([])
    axR.set_yticks([])
    for side in ("top", "right"):
        axR.spines[side].set_visible(False)
    for side in ("bottom", "left"):
        axR.spines[side].set_color(GREY_MID)
        axR.spines[side].set_linewidth(1.6)
    axR.text(0.97, 0.96, "示意圖", color=GREY_MID, fontsize=13,
             ha="right", va="top", transform=axR.transAxes)
    axR.text(0.5, -0.20, "loss 上上下下、亂跳，練不穩", color=GREY,
             fontsize=14, ha="center", va="top", transform=axR.transAxes)

    fig.savefig(os.path.join(HERE, "rnn_walls.png"), dpi=300, transparent=True)
    plt.close(fig)
    print("saved rnn_walls.png")


if __name__ == "__main__":
    build()
