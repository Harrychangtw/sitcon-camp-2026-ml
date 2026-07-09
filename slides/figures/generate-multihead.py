#!/usr/bin/env python3
"""Multi-head attention as head diversity (Course 2 · Loop 3): 同一句話，三種眼光.

ONE transparent PNG (multihead_heads.png): the same sentence repeated in three
side-by-side panels labelled 頭 A / 頭 B / 頭 C, each drawing a DIFFERENT arc
pattern over the same tokens:

  頭 A (CYAN)    盯前一個字 — every token arcs to the previous token
  頭 B (PURPLE)  追代名詞   — 牠 arcs back to 貓 (bold) and faintly to 小明
  頭 C (MAGENTA) 黏著標點   — clause tokens arc to 「，」 and the sentence head

This is an ILLUSTRATION of head diversity, not a measurement of any real
layer/head — hence 頭 A/B/C labels (never L3H5-style ids) and the 示意圖 badge
(same convention as generate-rnn-walls.py's unstable-loss panel). Arc direction
is causal: arrows always point LEFT, to an earlier token.

CJK labels baked in -> Artific(400/700)+Noto Sans TC helper. Hard corners
(deck-wide figure rule: no rounded corners).

Run:  uv run --with matplotlib --with numpy --with fonttools python3 \
          slides/figures/generate-multihead.py
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
CYAN = "#34E3ED"
PURPLE = "#7235FF"
MAGENTA = "#FF4EAB"

HERE = os.path.dirname(os.path.abspath(__file__))
FONTS_DIR = os.path.join(HERE, "..", "marp", "assets", "fonts")

FIGSIZE = (15.6, 3.9)


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


TOKENS = ["小明", "養", "了", "一隻", "貓", "，", "牠", "很", "可愛"]

TOK_Y = 0.26          # pill center
TOK_H = 0.18
PANEL_W = 0.305
PANEL_X0 = [0.010, 0.348, 0.686]

# (accent, label, descriptor, arcs) — arcs are (from_idx, to_idx, strong?)
PANELS = [
    (CYAN, "頭 A", "盯前一個字",
     [(i, i - 1, True) for i in range(1, len(TOKENS))]),
    (PURPLE, "頭 B", "追代名詞指的是誰",
     [(6, 4, True), (6, 0, False)]),
    (MAGENTA, "頭 C", "黏著標點和句首",
     [(6, 5, True), (7, 5, True), (8, 5, True),
      (2, 0, False), (4, 0, False)]),
]


def pill(ax, cx, text, edge=GREY_MID, lw=1.6):
    w = 0.023 if len(text) == 1 else 0.034
    ax.add_patch(FancyBboxPatch(
        (cx - w / 2, TOK_Y - TOK_H / 2), w, TOK_H,
        boxstyle="square,pad=0",
        facecolor=CARD, edgecolor=edge, linewidth=lw, zorder=3))
    ax.text(cx, TOK_Y, text, color=WHITE, fontsize=15,
            ha="center", va="center", zorder=4)


def arc(ax, x_from, x_to, color, strong):
    y = TOK_Y + TOK_H / 2 + 0.012
    ax.annotate(
        "", xy=(x_to, y), xytext=(x_from, y),
        arrowprops=dict(
            arrowstyle="-|>", color=color,
            lw=2.6 if strong else 1.4,
            alpha=1.0 if strong else 0.45,
            connectionstyle="arc3,rad=0.5",
            mutation_scale=15 if strong else 11,
            shrinkA=1, shrinkB=1,
        ), zorder=2)


def main():
    use_deck_fonts()
    fig = plt.figure(figsize=FIGSIZE, facecolor=BG)
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.axis("off")

    for (accent, label, desc, arcs), x0 in zip(PANELS, PANEL_X0):
        xs = [x0 + PANEL_W * (i + 0.5) / len(TOKENS) for i in range(len(TOKENS))]
        # panel label: accent head name + grey descriptor, top-left of panel
        ax.text(x0 + 0.004, 0.94, label, color=accent, fontsize=18,
                fontweight="bold", ha="left", va="top")
        ax.text(x0 + 0.062, 0.94, desc, color=GREY, fontsize=14,
                ha="left", va="top")
        # arcs target set: pills the head attends to get the accent edge
        targets = {t for _, t, strong in arcs if strong}
        for i, (x, tok) in enumerate(zip(xs, TOKENS)):
            if i in targets and label != "頭 A":  # 頭 A attends to everything
                pill(ax, x, tok, edge=accent, lw=2.2)
            else:
                pill(ax, x, tok)
        for f, t, strong in arcs:
            arc(ax, xs[f], xs[t], accent, strong)

    # 示意圖 badge (same convention as generate-rnn-walls.py)
    ax.text(0.997, 0.97, "示意圖", color=GREY_MID, fontsize=15,
            ha="right", va="top")

    out = os.path.join(HERE, "multihead_heads.png")
    fig.savefig(out, dpi=300, transparent=True)
    plt.close(fig)
    print("saved multihead_heads.png")


if __name__ == "__main__":
    main()
