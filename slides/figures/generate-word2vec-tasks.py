#!/usr/bin/env python3
"""兩種猜字玩法 (Course 2 · Loop 0), ONE two-panel figure.

word2vec_tasks.png = left panel 玩法 1 / CBOW (context cards, arrows pointing
IN at a masked middle slot), right panel 玩法 2 / skip-gram (one given word,
arrows pointing OUT at masked context slots). Same example sentence
今天 天氣 真 ＿ 呀 so the two tasks read as mirror images. Jargon-free on the
face by design (Harry's call): CBOW / skip-gram / word2vec live only in the
slide's 自學備註, never in the figure.

CYAN = 玩法 1 accent, PURPLE = 玩法 2 accent, GREY arrows. CJK labels baked
in -> Artific(400/700)+Noto Sans TC helper. Hard corners (deck-wide figure
rule: no rounded corners).

Run:  uv run --with matplotlib --with numpy --with fonttools python3 \
          slides/figures/generate-word2vec-tasks.py
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

HERE = os.path.dirname(os.path.abspath(__file__))
FONTS_DIR = os.path.join(HERE, "..", "marp", "assets", "fonts")

FIGSIZE = (12.0, 3.9)


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


CARD_W = 0.080
CARD_GAP = 0.008
CARD_Y = 0.34
CARD_H = 0.24


def draw_card(ax, x, text, masked=False, accent=None):
    """One token card. masked -> dashed border + grey ＿; accent -> colored border."""
    edge = accent if accent else GREY_MID
    ax.add_patch(FancyBboxPatch(
        (x, CARD_Y), CARD_W, CARD_H,
        boxstyle="square,pad=0",
        facecolor=CARD, edgecolor=edge,
        linewidth=2.2 if accent else 1.6,
        linestyle=(0, (4, 3)) if masked else "solid",
        zorder=2))
    ax.text(x + CARD_W / 2, CARD_Y + CARD_H / 2,
            "＿" if masked else text,
            color=GREY if masked else (accent or WHITE),
            fontsize=17, ha="center", va="center", zorder=3)


def draw_arrow(ax, x_from, x_to):
    """Grey arc bowing UP above the cards, from one card's top to another's."""
    y = CARD_Y + CARD_H
    rad = -0.25 if x_to > x_from else 0.25
    ax.annotate("", xy=(x_to, y + 0.02), xytext=(x_from, y + 0.02),
                arrowprops=dict(arrowstyle="-|>", color=GREY, lw=2.0,
                                mutation_scale=16,
                                connectionstyle=f"arc3,rad={rad}"),
                zorder=1)


def panel(ax, x0, title, subtitle, accent, mode):
    """One task panel. mode='cbow' -> arrows in; mode='skipgram' -> arrows out."""
    xs = [x0 + i * (CARD_W + CARD_GAP) for i in range(5)]
    centers = [x + CARD_W / 2 for x in xs]
    cx = (xs[0] + xs[-1] + CARD_W) / 2

    ax.text(cx, 0.97, title, color=accent, fontsize=19,
            fontweight="bold", ha="center", va="top")
    ax.text(cx, 0.82, subtitle, color=GREY, fontsize=14.5,
            ha="center", va="top")

    sources = [i for i in range(5) if i != (3 if mode == "cbow" else 2)]
    spread = [-0.024, -0.008, 0.008, 0.024]  # stagger so arrowheads don't pile up

    if mode == "cbow":
        tokens = ["今天", "天氣", "真", None, "呀"]  # None = masked target
        target = 3
        for i, (x, tok) in enumerate(zip(xs, tokens)):
            draw_card(ax, x, tok, masked=(i == target))
        for k, i in enumerate(sources):
            draw_arrow(ax, centers[i], centers[target] + spread[k])
        ax.text(centers[target], 0.16, "猜：「好」", color=accent,
                fontsize=16, ha="center", va="top")
    else:
        target = 2
        for i, x in enumerate(xs):
            if i == target:
                draw_card(ax, x, "好", accent=accent)
            else:
                draw_card(ax, x, None, masked=True)
        for k, i in enumerate(sources):
            draw_arrow(ax, centers[target] + spread[k], centers[i])
        ax.text(cx, 0.16, "猜：「今天」「天氣」「真」「呀」", color=accent,
                fontsize=16, ha="center", va="top")


def build():
    fig = plt.figure(figsize=FIGSIZE, facecolor=BG)
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.axis("off")

    panel(ax, 0.032, "玩法 1：猜被遮住的字", "遮住一個字，用旁邊的字猜它", CYAN, "cbow")
    panel(ax, 0.540, "玩法 2：猜旁邊的字", "給一個字，猜它旁邊會出現什麼字", PURPLE, "skipgram")

    fig.savefig(os.path.join(HERE, "word2vec_tasks.png"),
                dpi=300, transparent=True)
    plt.close(fig)
    print("saved word2vec_tasks.png")


if __name__ == "__main__":
    use_deck_fonts()
    build()
