"""
Loop 3 patch ②: residual connection. 疊深 -> loss 亂跳 -> 補一條捷徑.

Left: four stacked layer boxes with a straight path through them, plus a curved
skip arrow (捷徑) bypassing the stack from input to output.
Right inset: two illustrative loss sparklines — 沒有 residual：亂跳 (jittery) vs
有 residual：穩 (smooth) — labeled 示意圖 (never measured numbers).

zh labels in-figure. No formulas.

Run: uv run --with matplotlib --with numpy --with fonttools python3 \
       slides/figures/generate-residual.py
"""

import os
import tempfile
import numpy as np
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import font_manager
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch

BG = "#0A0A0A"
CARD = "#171717"
GREY_MID = "#585858"
GREY = "#9E9E9E"
WHITE = "#FFFFFF"
LIME = "#D6FB00"
CYAN = "#34E3ED"
MAGENTA = "#FF4EAB"

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
    fig = plt.figure(figsize=(15, 6.6), facecolor=BG)
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_facecolor(BG)
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.axis("off")

    # ---------------- LEFT: stacked layers + skip arrow ----------------
    cx = 0.24
    bw, bh = 0.20, 0.135
    gap = 0.05
    n = 4
    y0 = 0.16
    ys = [y0 + i * (bh + gap) for i in range(n)]  # bottom -> top

    # input / output caps
    ax.text(cx, y0 - 0.075, "輸入", ha="center", va="center", color=GREY,
            fontsize=22)
    ax.text(cx, ys[-1] + bh + 0.075, "輸出", ha="center", va="center",
            color=GREY, fontsize=22)

    for i, y in enumerate(ys):
        ax.add_patch(FancyBboxPatch((cx - bw / 2, y), bw, bh,
                                    boxstyle="square,pad=0",
                                    facecolor=CARD, edgecolor=GREY_MID, lw=2.0))
        ax.text(cx, y + bh / 2, "一層", ha="center", va="center", color=WHITE,
                fontsize=26)
        # straight path arrow into next box
        if i < n - 1:
            ax.add_patch(FancyArrowPatch((cx, y + bh + 0.004),
                                         (cx, ys[i + 1] - 0.004),
                                         arrowstyle="-|>", mutation_scale=18,
                                         lw=2.2, color=GREY))
    # input->first, last->output stubs
    ax.add_patch(FancyArrowPatch((cx, y0 - 0.045), (cx, y0 - 0.004),
                                 arrowstyle="-|>", mutation_scale=18, lw=2.2,
                                 color=GREY))
    ax.add_patch(FancyArrowPatch((cx, ys[-1] + bh + 0.004),
                                 (cx, ys[-1] + bh + 0.045),
                                 arrowstyle="-|>", mutation_scale=18, lw=2.2,
                                 color=GREY))

    # curved skip arrow (捷徑) around the whole stack, on the right side
    skip_x = cx + bw / 2 + 0.10
    ax.add_patch(FancyArrowPatch((cx + bw / 2 - 0.01, y0 + 0.01),
                                 (cx + bw / 2 - 0.01, ys[-1] + bh - 0.01),
                                 arrowstyle="-|>", mutation_scale=24, lw=3.4,
                                 color=CYAN,
                                 connectionstyle=f"arc3,rad=-0.9"))
    ax.text(skip_x + 0.02, (y0 + ys[-1] + bh) / 2, "捷徑", ha="left",
            va="center", color=CYAN, fontsize=26)
    ax.text(skip_x + 0.02, (y0 + ys[-1] + bh) / 2 - 0.07, "residual", ha="left",
            va="center", color=GREY, fontsize=20)

    # ---------------- RIGHT: loss sparklines inset ----------------
    ix0, ix1 = 0.56, 0.96
    # jittery (no residual)
    top_y0, top_y1 = 0.60, 0.86
    bot_y0, bot_y1 = 0.18, 0.44
    rng = np.random.default_rng(3)
    t = np.linspace(0, 1, 120)
    base = 0.9 * np.exp(-2.6 * t) + 0.08
    jitter = base + rng.normal(0, 0.11, size=t.size) * (0.4 + 0.6 * (1 - t))
    smooth = 0.9 * np.exp(-3.0 * t) + 0.06

    def spark(y0, y1, vals, color, title, sub):
        vals = np.clip(vals, 0, 1.15)
        xs = ix0 + 0.06 + (ix1 - 0.06 - ix0) * t
        ys_ = y0 + (y1 - y0) * (vals / 1.15)
        # axis baseline
        ax.plot([ix0 + 0.04, ix1], [y0, y0], color=GREY_MID, lw=1.2)
        ax.plot([ix0 + 0.04, ix0 + 0.04], [y0, y1 + 0.01], color=GREY_MID, lw=1.2)
        ax.plot(xs, ys_, color=color, lw=2.6)
        ax.text(ix0 + 0.04, y1 + 0.05, title, ha="left", va="center",
                color=WHITE, fontsize=23)
        ax.text(ix1, y1 + 0.05, sub, ha="right", va="center", color=color,
                fontsize=23)
        ax.text(ix0 - 0.005, (y0 + y1) / 2, "loss", ha="right", va="center",
                color=GREY, fontsize=18, rotation=90)

    spark(top_y0, top_y1, jitter, MAGENTA, "沒有 residual", "亂跳")
    spark(bot_y0, bot_y1, smooth, CYAN, "有 residual", "穩")

    ax.text(ix1, 0.075, "示意圖", ha="right", va="center", color=GREY,
            fontsize=20, style="italic")

    out = os.path.join(HERE, "residual_skip.png")
    fig.savefig(out, dpi=300, transparent=True)
    plt.close(fig)
    print("saved", out)


if __name__ == "__main__":
    build()
