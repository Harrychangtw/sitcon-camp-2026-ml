#!/usr/bin/env python3
"""next-token debrief chart (Course 2 · Loop 2): 押中的把握 vs context 長度.

An ILLUSTRATIVE monotone rising-then-saturating curve — "看得越多，押得越有把握，
但會飽和". No measured numbers: the y-axis is qualitative (低 → 高) and the whole
figure is stamped 示意圖 so it can never read as data.

Palette: PALETTE.md constants; single CYAN categorical series on the dark canvas,
fill under the curve at low alpha. CJK labels are baked in (deck is self-contained),
so this uses the Artific(400/700)+Noto Sans TC helper — NOT the Artific-only one.

Run:  uv run --with matplotlib --with numpy --with fonttools python3 \
          slides/figures/generate-context-accuracy.py
"""

import os
import tempfile

import numpy as np
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import font_manager

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
    """Artific (instanced 400/700) + Noto Sans TC fallback for CJK labels."""
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
    fig = plt.figure(figsize=(8, 4.2), facecolor=BG)
    ax = fig.add_axes([0.11, 0.17, 0.84, 0.74])
    ax.set_facecolor(BG)

    # illustrative saturating curve: y = 1 - exp(-k x)  (rise then plateau)
    x = np.linspace(0, 10, 200)
    y = 1 - np.exp(-0.55 * x)

    ax.plot(x, y, color=CYAN, lw=4.0, zorder=3)
    ax.fill_between(x, 0, y, color=CYAN, alpha=0.15, zorder=2)

    # a few sample dots to read it as "wider context -> more sure"
    xs = np.array([1.0, 3.0, 6.0, 9.5])
    ys = 1 - np.exp(-0.55 * xs)
    ax.scatter(xs, ys, s=90, color=CYAN, zorder=4, edgecolor=BG, linewidth=1.5)

    # plateau guide + label
    ax.axhline(1.0, color=GREY_MID, lw=1.5, ls=(0, (6, 5)), zorder=1)
    ax.text(9.9, 1.03, "押得越來越有把握，最後飽和", color=GREY,
            fontsize=13, ha="right", va="bottom")

    ax.set_xlim(0, 10.5)
    ax.set_ylim(0, 1.18)

    # qualitative axes — no measured numbers
    ax.set_xlabel("能看到的前文長度（context）", color=WHITE, fontsize=17, labelpad=10)
    ax.set_ylabel("下一個字押中的把握", color=WHITE, fontsize=17, labelpad=10)
    ax.set_xticks([0.3, 10.2])
    ax.set_xticklabels(["短", "長"], color=GREY, fontsize=15)
    ax.set_yticks([0.06, 1.0])
    ax.set_yticklabels(["低", "高"], color=GREY, fontsize=15)
    ax.tick_params(length=0)

    for side in ("top", "right"):
        ax.spines[side].set_visible(False)
    for side in ("bottom", "left"):
        ax.spines[side].set_color(GREY_MID)
        ax.spines[side].set_linewidth(1.6)

    # 示意圖 badge — this curve is illustrative, not measured
    ax.text(0.30, 1.10, "示意圖", color=GREY_MID, fontsize=15,
            ha="left", va="center")

    fig.savefig(os.path.join(HERE, "context_accuracy.png"),
                dpi=300, transparent=True)
    plt.close(fig)
    print("saved context_accuracy.png")


if __name__ == "__main__":
    build()
