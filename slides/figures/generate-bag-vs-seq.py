"""
Generate the「詞袋（無序）vs 序列（有序）」contrast strip for Course 2 Loop 1 收束.

Wide & short strip (sits at h:400~500 on the slide). Two panels, same 3 tokens
（我 · 愛 · 你）:
  left  — thrown into a bag, no order (無序)
  right — chained one after another with arrows (有序)

This is the door into Loop 2: a bag has no「順序」assumption; a sequence does.

Style: PALETTE.md — grey structure + ONE categorical accent (cyan) for the token
nodes, kept apart from the viridis family. Nodes are scatter markers (round despite
the wide aspect). CJK baked in via Noto Sans TC. Transparent, dpi 300, full frame.

Run:  uv run --with matplotlib --with numpy --with fonttools python3 slides/figures/generate-bag-vs-seq.py
"""

import os
import tempfile
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import font_manager
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch

BG       = "#0A0A0A"
CARD     = "#171717"
GREY_MID = "#585858"
GREY     = "#9E9E9E"
WHITE    = "#FFFFFF"
CYAN     = "#34E3ED"   # the single categorical accent — token nodes

HERE = os.path.dirname(os.path.abspath(__file__))
FONTS_DIR = os.path.join(HERE, "..", "marp", "assets", "fonts")

TOKENS = ["我", "愛", "你"]


def use_deck_fonts():
    families = []
    src = next((p for p in (
        os.path.expanduser("~/Library/Fonts/Artific-Variable.ttf"),
        "/Library/Fonts/Artific-Variable.ttf",
        os.path.join(FONTS_DIR, "Artific-Variable.ttf"),
    ) if os.path.exists(p)), None)
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


def node(ax, x, y, ch):
    ax.scatter([x], [y], s=5200, facecolor=CARD, edgecolor=CYAN,
               linewidth=3.0, zorder=2)
    ax.text(x, y, ch, ha="center", va="center", color=WHITE, fontsize=30, zorder=3)


def build():
    use_deck_fonts()
    fig = plt.figure(figsize=(12, 2.5), facecolor=BG)
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_facecolor(BG)
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.axis("off")

    cy = 0.46

    # --- left panel: bag (無序) — jumbled inside a rounded bag frame ---
    ax.add_patch(FancyBboxPatch(
        (0.03, 0.16), 0.40, 0.60,
        boxstyle="round,pad=0,rounding_size=0.04",
        linewidth=1.6, edgecolor=GREY_MID, facecolor="none", zorder=0))
    node(ax, 0.11, 0.58, TOKENS[2])
    node(ax, 0.235, 0.34, TOKENS[0])
    node(ax, 0.355, 0.6, TOKENS[1])
    ax.text(0.23, 0.90, "詞袋（無序）", ha="center", va="center",
            color=GREY, fontsize=17)

    # divider
    ax.plot([0.5, 0.5], [0.14, 0.82], color=GREY_MID, lw=1.4)

    # --- right panel: sequence (有序) — chained left to right with arrows ---
    xs = [0.60, 0.755, 0.91]
    for x, ch in zip(xs, TOKENS):
        node(ax, x, cy, ch)
    for x0, x1 in zip(xs[:-1], xs[1:]):
        ax.add_patch(FancyArrowPatch(
            (x0 + 0.045, cy), (x1 - 0.045, cy),
            arrowstyle="-|>", mutation_scale=20, lw=2.4, color=GREY, zorder=1))
    ax.text(0.755, 0.90, "序列（有序）", ha="center", va="center",
            color=GREY, fontsize=17)

    fig.savefig(os.path.join(HERE, "bag_vs_seq.png"), dpi=300, transparent=True)
    plt.close(fig)
    print("saved bag_vs_seq.png")


if __name__ == "__main__":
    build()
    print("done ->", HERE)
