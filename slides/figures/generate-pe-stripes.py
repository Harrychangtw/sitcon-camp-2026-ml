"""
Loop 3 patch ①: positional embedding. attention 分不出誰前誰後 -> 把「第幾個」
塞回去。

Three stacked bands over four slots:
  詞的資訊   — one viridis word-embedding column per slot (what the字 is)
  第幾個     — a per-slot position stripe (cyan, brightening 1->4)  (where it sits)
  合起來     — the two merged into one column (word col + a cyan position cap)
Merge shown as a visual stack, NOT a formula (no + / =).

zh labels in-figure. No formulas.

Run: uv run --with matplotlib --with numpy --with fonttools python3 \
       slides/figures/generate-pe-stripes.py
"""

import os
import tempfile
import numpy as np
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import font_manager
from matplotlib.patches import Rectangle, FancyArrowPatch
from matplotlib.colors import LinearSegmentedColormap, Normalize

BG = "#0A0A0A"
CARD = "#171717"
GREY_MID = "#585858"
GREY = "#9E9E9E"
WHITE = "#FFFFFF"
LIME = "#D6FB00"
CYAN = "#34E3ED"

VIRIDIS = LinearSegmentedColormap.from_list(
    "camp_viridis",
    ["#350B4C", "#404683", "#3A799B", "#34979A", "#2DB492", "#84DB45", "#B8EF18"],
)
# position stripe: dark -> cyan, encoding 第幾個 (position)
CYAN_RAMP = LinearSegmentedColormap.from_list("camp_cyan", ["#0d2a2c", CYAN])

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


TOKENS = ["貓", "坐", "墊", "上"]
NSLOT = 4
D = 6


def vcol(ax, vals, x0, x1, y0, y1, cmap, norm, *, edge=GREY_MID, lw=0.8):
    R = len(vals)
    ch = (y1 - y0) / R
    for r in range(R):
        ax.add_patch(Rectangle((x0, y1 - (r + 1) * ch), x1 - x0, ch,
                               facecolor=cmap(norm(vals[r])), edgecolor=edge, lw=lw))


def build():
    use_deck_fonts()
    fig = plt.figure(figsize=(15, 6.6), facecolor=BG)
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_facecolor(BG)
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.axis("off")
    norm = Normalize(0, 1)

    rng = np.random.default_rng(7)
    word = rng.uniform(0.08, 0.95, size=(D, NSLOT))

    xs0 = 0.30
    col_w = 0.085
    gap = 0.055
    slot_x0 = [xs0 + i * (col_w + gap) for i in range(NSLOT)]

    # band y-extents (top -> bottom: word, position, combined)
    W_Y0, W_Y1 = 0.70, 0.92
    P_Y0, P_Y1 = 0.50, 0.62
    C_Y0, C_Y1 = 0.14, 0.40

    # left band labels
    ax.text(0.26, (W_Y0 + W_Y1) / 2, "詞的資訊", ha="right", va="center",
            color=WHITE, fontsize=26)
    ax.text(0.26, (W_Y0 + W_Y1) / 2 - 0.075, "這個字是什麼", ha="right",
            va="center", color=GREY, fontsize=18)
    ax.text(0.26, (P_Y0 + P_Y1) / 2, "第幾個", ha="right", va="center",
            color=WHITE, fontsize=26)
    ax.text(0.26, (P_Y0 + P_Y1) / 2 - 0.065, "位置資訊", ha="right",
            va="center", color=GREY, fontsize=18)
    ax.text(0.26, (C_Y0 + C_Y1) / 2, "合起來", ha="right", va="center",
            color=WHITE, fontsize=26)
    ax.text(0.26, (C_Y0 + C_Y1) / 2 - 0.09, "帶著位置\n丟進 attention", ha="right",
            va="center", color=GREY, fontsize=18, linespacing=1.5)

    for i, x0 in enumerate(slot_x0):
        x1 = x0 + col_w
        cx = (x0 + x1) / 2
        # token char above the word column
        ax.text(cx, W_Y1 + 0.045, TOKENS[i], ha="center", va="center",
                color=WHITE, fontsize=30)
        # word embedding column
        vcol(ax, word[:, i], x0, x1, W_Y0, W_Y1, VIRIDIS, norm)
        # position stripe (single cell brightening by slot)
        pv = (i + 1) / NSLOT
        ax.add_patch(Rectangle((x0, P_Y0), col_w, P_Y1 - P_Y0,
                               facecolor=CYAN_RAMP(pv), edgecolor=GREY_MID, lw=0.8))
        ax.text(cx, (P_Y0 + P_Y1) / 2, f"{i+1}", ha="center", va="center",
                color=WHITE if pv > 0.55 else GREY, fontsize=24)
        # merge arrows word + position -> combined
        ax.add_patch(FancyArrowPatch((cx, W_Y0 - 0.008), (cx, P_Y1 + 0.008),
                                     arrowstyle="-", lw=1.6, color=GREY_MID))
        ax.add_patch(FancyArrowPatch((cx, P_Y0 - 0.008), (cx, C_Y1 + 0.05),
                                     arrowstyle="-|>", mutation_scale=18, lw=2.2,
                                     color=GREY))
        # combined column: word col + a cyan position cap on top
        cap_h = (C_Y1 - C_Y0) * 0.16
        vcol(ax, word[:, i], x0, x1, C_Y0, C_Y1 - cap_h, VIRIDIS, norm)
        ax.add_patch(Rectangle((x0, C_Y1 - cap_h), col_w, cap_h,
                               facecolor=CYAN_RAMP(pv), edgecolor=GREY_MID, lw=0.8))

    out = os.path.join(HERE, "pe_stripes.png")
    fig.savefig(out, dpi=300, transparent=True)
    plt.close(fig)
    print("saved", out)


if __name__ == "__main__":
    build()
