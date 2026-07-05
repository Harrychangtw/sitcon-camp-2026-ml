"""
Loop 3 debrief: attention 對順序無感. The same bag of tokens in two different
orders produces the SAME attention output — Loop 1 的詞袋牆 at a higher level.

Two panels, identical output vector (same six cyan bars) under two differently
ordered pill rows. Center "=" + 結果一模一樣 makes the equality explicit.

zh labels in-figure (Artific + Noto Sans TC fallback). No formulas.

Run: uv run --with matplotlib --with numpy --with fonttools python3 \
       slides/figures/generate-attention-orderblind.py
"""

import os
import tempfile
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import font_manager
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch, Rectangle

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


PILL_W, PILL_H = 0.05, 0.20
PILL_Y = 0.66
OUT_Y0, OUT_Y1 = 0.18, 0.40
OUT_VALS = [0.55, 0.9, 0.35, 0.75, 0.5, 0.65]  # identical "output vector" both sides


def pill(ax, cx, tok):
    ax.add_patch(
        FancyBboxPatch(
            (cx - PILL_W / 2, PILL_Y - PILL_H / 2),
            PILL_W, PILL_H,
            boxstyle="round,pad=0,rounding_size=0.02",
            facecolor=CARD, edgecolor=GREY_MID, linewidth=2.0,
            mutation_aspect=0.55,
        )
    )
    ax.text(cx, PILL_Y, tok, ha="center", va="center", color=WHITE, fontsize=32)


def output_vec(ax, x0):
    """Six-bar cyan output strip, identical on both panels."""
    w = 0.028
    gap = 0.012
    for i, v in enumerate(OUT_VALS):
        bx = x0 + i * (w + gap)
        h = (OUT_Y1 - OUT_Y0) * v
        ax.add_patch(Rectangle((bx, OUT_Y0), w, h, facecolor=CYAN,
                               edgecolor="none"))
        ax.add_patch(Rectangle((bx, OUT_Y0), w, OUT_Y1 - OUT_Y0,
                               facecolor="none", edgecolor=GREY_MID, lw=1.0))


def build():
    use_deck_fonts()
    fig = plt.figure(figsize=(16, 6.4), facecolor=BG)
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_facecolor(BG)
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.axis("off")

    left = ["貓", "坐", "在", "墊", "上"]
    right = ["墊", "上", "坐", "貓", "在"]   # 打散重排
    lx = [0.05 + i * 0.072 for i in range(5)]
    rx = [0.60 + i * 0.072 for i in range(5)]

    # top labels
    ax.text(0.20, 0.93, "原本的順序", ha="center", va="center", color=GREY,
            fontsize=26)
    ax.text(0.755, 0.93, "打散重排", ha="center", va="center", color=GREY,
            fontsize=26)

    for cx, tok in zip(lx, left):
        pill(ax, cx, tok)
    for cx, tok in zip(rx, right):
        pill(ax, cx, tok)

    # down arrows: pills -> output vector
    ax.add_patch(FancyArrowPatch((0.20, PILL_Y - PILL_H / 2 - 0.01),
                                 (0.20, OUT_Y1 + 0.05),
                                 arrowstyle="-|>", mutation_scale=22, lw=2.4,
                                 color=GREY))
    ax.add_patch(FancyArrowPatch((0.755, PILL_Y - PILL_H / 2 - 0.01),
                                 (0.755, OUT_Y1 + 0.05),
                                 arrowstyle="-|>", mutation_scale=22, lw=2.4,
                                 color=GREY))
    ax.text(0.255, (PILL_Y + OUT_Y1) / 2 - 0.02, "attention", ha="left",
            va="center", color=GREY, fontsize=20)
    ax.text(0.805, (PILL_Y + OUT_Y1) / 2 - 0.02, "attention", ha="left",
            va="center", color=GREY, fontsize=20)

    # identical output vectors
    output_vec(ax, 0.12)
    output_vec(ax, 0.675)

    # big "=" between the two output vectors
    ax.text(0.5, (OUT_Y0 + OUT_Y1) / 2, "=", ha="center", va="center",
            color=WHITE, fontsize=64)

    ax.text(0.5, 0.065, "結果一模一樣", ha="center", va="center",
            color=GREY, fontsize=26)

    out = os.path.join(HERE, "attention_orderblind.png")
    fig.savefig(out, dpi=300, transparent=True)
    plt.close(fig)
    print("saved", out)


if __name__ == "__main__":
    build()
