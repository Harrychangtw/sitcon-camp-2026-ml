"""
Generate the「故事 vs 事故」shuffle-invariance figure for Course 2 Loop 1 debrief.

Two rows, same two coloured character tiles (故 = cyan, 事 = purple), order swapped:
  故 事  ->  bag / average  ->  正面 / 負面 機率條
  事 故  ->  bag / average  ->  正面 / 負面 機率條  (pixel-identical to the row above)

Point SHOWN, not narrated: a bag averages, and any permutation of the same tiles
gives the SAME averaged vector, so the two rows emit an IDENTICAL output. The bars
are illustrative (示意圖) probabilities, not measured numbers.

Style: slides/figures/PALETTE.md — dark palette, categorical accents for the two
characters (kept apart from the viridis family), transparent PNG, dpi 300, full-frame
axis. CJK labels are baked in (deck is self-contained) via Noto Sans TC.

Run:  uv run --with matplotlib --with numpy --with fonttools python3 slides/figures/generate-story-accident.py
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
LIME     = "#D6FB00"
CYAN     = "#34E3ED"   # 故
PURPLE   = "#7235FF"   # 事

HERE = os.path.dirname(os.path.abspath(__file__))
FONTS_DIR = os.path.join(HERE, "..", "marp", "assets", "fonts")


def use_deck_fonts():
    """Artific (instanced 400/700) + Noto Sans TC fallback for the baked-in CJK."""
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


TILE_W, TILE_H = 0.095, 0.165  # generous padding around the CJK glyph
BAG_CX = 0.40
BAR_X0, BAR_X1 = 0.55, 0.93
BAR_H = 0.075
P_POS = 0.50   # illustrative 正面 probability (1:1 split), identical for both rows


def char_tile(ax, cx, cy, ch, color):
    ax.add_patch(FancyBboxPatch(
        (cx - TILE_W / 2, cy - TILE_H / 2), TILE_W, TILE_H,
        boxstyle="square,pad=0",
        linewidth=3.0, edgecolor=color, facecolor=CARD, zorder=2))
    ax.text(cx, cy, ch, ha="center", va="center", color=WHITE, fontsize=32)


def prob_bar(ax, cy):
    # outer frame
    ax.add_patch(FancyBboxPatch(
        (BAR_X0, cy - BAR_H / 2), BAR_X1 - BAR_X0, BAR_H,
        boxstyle="square,pad=0",
        linewidth=1.6, edgecolor=GREY_MID, facecolor=CARD, zorder=1))
    # 正面 fill (white), 負面 remainder stays CARD
    split = BAR_X0 + (BAR_X1 - BAR_X0) * P_POS
    ax.add_patch(FancyBboxPatch(
        (BAR_X0, cy - BAR_H / 2), split - BAR_X0, BAR_H,
        boxstyle="square,pad=0",
        linewidth=0, facecolor=WHITE, zorder=2))
    ax.text((BAR_X0 + split) / 2, cy, "正面", ha="center", va="center",
            color=BG, fontsize=15, zorder=3)
    ax.text((split + BAR_X1) / 2, cy, "負面", ha="center", va="center",
            color=GREY, fontsize=15, zorder=3)


def row(ax, cy, first, second):
    (c1, col1), (c2, col2) = first, second
    char_tile(ax, 0.062, cy, c1, col1)
    char_tile(ax, 0.172, cy, c2, col2)
    # tiles -> bag
    ax.add_patch(FancyArrowPatch(
        (0.172 + TILE_W / 2 + 0.008, cy), (BAG_CX - 0.075, cy),
        arrowstyle="-|>", mutation_scale=18, lw=2.0, color=GREY, zorder=2))
    # bag / average node — same height as the char tiles on its left
    ax.add_patch(FancyBboxPatch(
        (BAG_CX - 0.065, cy - TILE_H / 2), 0.13, TILE_H,
        boxstyle="square,pad=0",
        linewidth=1.6, edgecolor=GREY_MID, facecolor=CARD, zorder=1))
    ax.text(BAG_CX, cy + 0.030, r"$\frac{1}{N}\sum$", ha="center", va="center",
            color=WHITE, fontsize=19, zorder=2)
    ax.text(BAG_CX, cy - 0.052, "bag", ha="center", va="center",
            color=GREY, fontsize=12, zorder=2)
    # bag -> bar
    ax.add_patch(FancyArrowPatch(
        (BAG_CX + 0.075, cy), (BAR_X0 - 0.012, cy),
        arrowstyle="-|>", mutation_scale=18, lw=2.0, color=GREY, zorder=2))
    prob_bar(ax, cy)


def build():
    use_deck_fonts()
    fig = plt.figure(figsize=(8.8, 4.6), facecolor=BG)
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_facecolor(BG)
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.axis("off")

    top_cy, bot_cy = 0.72, 0.26
    row(ax, top_cy, ("故", CYAN), ("事", PURPLE))
    row(ax, bot_cy, ("事", PURPLE), ("故", CYAN))

    # the two output bars are identical — call it out with a grey brace + "＝"
    bx = BAR_X1 + 0.028
    ax.plot([bx, bx], [bot_cy, top_cy], color=GREY, lw=1.4)
    ax.plot([bx - 0.012, bx], [top_cy, top_cy], color=GREY, lw=1.4)
    ax.plot([bx - 0.012, bx], [bot_cy, bot_cy], color=GREY, lw=1.4)
    ax.text(bx + 0.02, (top_cy + bot_cy) / 2, "=", ha="left", va="center",
            color=WHITE, fontsize=30)

    # illustrative-data mark (PALETTE rule: label non-measured visuals 示意圖)
    ax.text(0.985, 0.965, "示意圖", ha="right", va="top", color=GREY_MID, fontsize=12)

    fig.savefig(os.path.join(HERE, "story_accident_bag.png"),
                dpi=300, transparent=True)
    plt.close(fig)
    print("saved story_accident_bag.png")


if __name__ == "__main__":
    build()
    print("done ->", HERE)
