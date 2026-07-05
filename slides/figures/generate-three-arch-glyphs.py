"""
Generate the three-architecture glyph strip for the Course 2 deck
(Loop 4 收尾: 三個架構＝三個假設).

One horizontal row of three mini glyphs, left -> right, joined by grey connectors,
each carrying ONE categorical accent so the strip reads as the 一條線 progression:

    BAG (cyan)          CHAIN (purple)        ALL-TO-ALL (magenta)
    一袋字               記憶接力               直接互看
    tokens jumbled       tokens linked by      every token wired to
    in a pouch           forward arrows        every other token

- BAG        : a pouch outline with token chips scattered inside, no order.
- CHAIN      : a row of token nodes linked by forward arrows (order / memory).
- ALL-TO-ALL : token nodes on a small ring, every pair connected (global attention).

zh labels sit under each glyph (Noto Sans TC via the deck-font helper); the accents
match how MLP(bag) / RNN / Transformer were drawn across the earlier loops.

Style follows PALETTE.md + generate-bag-of-embeddings.py: dark design-system palette,
categorical accents (NOT viridis), transparent PNG, dpi 300, full-frame axis (no tight
crop) so the saved PNG keeps the exact figsize ratio.

Run:  uv run --with matplotlib --with numpy --with fonttools python3 \
          slides/figures/generate-three-arch-glyphs.py
"""

import os
import tempfile
import numpy as np
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import font_manager
from matplotlib.patches import FancyBboxPatch, Circle, FancyArrowPatch

HERE = os.path.dirname(os.path.abspath(__file__))
FONTS_DIR = os.path.join(HERE, "..", "marp", "assets", "fonts")

# ------------------------------------------------------------------ palette --
BG = "#0A0A0A"       # canvas (saved transparent)
CARD = "#171717"     # node / chip fill
GREY_MID = "#585858" # dim rules / pouch outline
GREY = "#9E9E9E"     # connectors / secondary
WHITE = "#FFFFFF"    # primary text
CYAN = "#34E3ED"     # BAG accent
PURPLE = "#7235FF"   # CHAIN accent
MAGENTA = "#FF4EAB"  # ALL-TO-ALL accent


def use_deck_fonts():
    """Artific (instanced 400/700) for Latin + Noto Sans TC for the zh labels.

    matplotlib picks the first family that resolves for the WHOLE string rather than
    doing per-glyph fallback, so Artific (Latin-only) would blank the CJK labels. We
    register both and ALSO return an explicit Noto FontProperties for the zh text.
    """
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
    noto_fp = None
    if os.path.exists(noto):
        font_manager.fontManager.addfont(noto)
        families.append(font_manager.FontProperties(fname=noto).get_name())
        noto_fp = font_manager.FontProperties(fname=noto)
    if families:
        plt.rcParams["font.family"] = families
    return noto_fp


# ---------------------------------------------------------------- geometry --
# Each glyph lives in a horizontal band; three panel centers across the strip.
PANEL_CX = [0.165, 0.5, 0.835]
GLYPH_CY = 0.66          # vertical center of the glyph art
LABEL_ZH_Y = 0.24        # zh label row (一袋字 / 記憶接力 / 直接互看)
LABEL_EN_Y = 0.09        # small EN caption row


def node(ax, x, y, r, edge):
    ax.add_patch(Circle((x, y), r, facecolor=CARD, edgecolor=edge, lw=3.0, zorder=3))


def draw_bag(ax, cx, cy, accent):
    """Pouch outline with token chips jumbled inside (order-blind)."""
    w, h = 0.20, 0.235
    x0, y0 = cx - w / 2, cy - h / 2 - 0.01
    # pouch body
    ax.add_patch(
        FancyBboxPatch(
            (x0, y0),
            w,
            h,
            boxstyle="round,pad=0,rounding_size=0.045",
            facecolor="none",
            edgecolor=accent,
            lw=3.2,
            zorder=2,
        )
    )
    # cinched neck: two short flaps at the top
    neck_y = y0 + h
    ax.plot([x0 + 0.02, cx - 0.018], [neck_y, neck_y + 0.028], color=accent, lw=3.0, zorder=2)
    ax.plot([x0 + w - 0.02, cx + 0.018], [neck_y, neck_y + 0.028], color=accent, lw=3.0, zorder=2)
    # jumbled token chips inside — fixed scatter, no left->right reading order
    pts = [
        (cx - 0.045, cy + 0.015),
        (cx + 0.040, cy + 0.040),
        (cx + 0.020, cy - 0.045),
        (cx - 0.038, cy - 0.038),
        (cx + 0.058, cy - 0.010),
    ]
    for (px, py) in pts:
        node(ax, px, py, 0.020, accent)


def draw_chain(ax, cx, cy, accent):
    """A row of token nodes linked by forward arrows (order / memory)."""
    n = 4
    xs = np.linspace(cx - 0.115, cx + 0.115, n)
    r = 0.026
    for i in range(n - 1):
        ax.add_patch(
            FancyArrowPatch(
                (xs[i] + r, cy),
                (xs[i + 1] - r, cy),
                arrowstyle="-|>",
                mutation_scale=22,
                lw=3.0,
                color=accent,
                zorder=2,
            )
        )
    for x in xs:
        node(ax, x, cy, r, accent)


def draw_all_to_all(ax, cx, cy, accent):
    """Token nodes on a small ring, every pair connected (global attention)."""
    n = 5
    r_ring = 0.115
    r_node = 0.024
    ang = np.linspace(np.pi / 2, np.pi / 2 + 2 * np.pi, n, endpoint=False)
    pts = [(cx + r_ring * np.cos(a), cy + r_ring * np.sin(a)) for a in ang]
    for i in range(n):
        for j in range(i + 1, n):
            ax.plot(
                [pts[i][0], pts[j][0]],
                [pts[i][1], pts[j][1]],
                color=accent,
                lw=1.8,
                alpha=0.55,
                zorder=1,
            )
    for (px, py) in pts:
        node(ax, px, py, r_node, accent)


def connector(ax, x0, x1, y):
    ax.add_patch(
        FancyArrowPatch(
            (x0, y),
            (x1, y),
            arrowstyle="-|>",
            mutation_scale=26,
            lw=3.0,
            color=GREY,
            zorder=4,
        )
    )


def build():
    noto_fp = use_deck_fonts()
    fig = plt.figure(figsize=(14, 3.7), facecolor=BG)
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_facecolor(BG)
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.axis("off")

    draw_bag(ax, PANEL_CX[0], GLYPH_CY, CYAN)
    draw_chain(ax, PANEL_CX[1], GLYPH_CY, PURPLE)
    draw_all_to_all(ax, PANEL_CX[2], GLYPH_CY, MAGENTA)

    # grey connectors between the panels (the 一條線 progression)
    connector(ax, 0.305, 0.360, GLYPH_CY)
    connector(ax, 0.640, 0.695, GLYPH_CY)

    zh = ["一袋字", "記憶接力", "直接互看"]
    en = ["MLP · bag", "RNN · memory", "Transformer · all-to-all"]
    accents = [CYAN, PURPLE, MAGENTA]
    for cx, zt, et, ac in zip(PANEL_CX, zh, en, accents):
        ax.text(cx, LABEL_ZH_Y, zt, ha="center", va="center", color=WHITE,
                fontsize=30, fontproperties=noto_fp)
        ax.text(cx, LABEL_EN_Y, et, ha="center", va="center", color=GREY, fontsize=15)

    out = os.path.join(HERE, "three_arch_glyphs.png")
    fig.savefig(out, dpi=300, transparent=True)
    plt.close(fig)
    print(f"saved {out}")


if __name__ == "__main__":
    build()
    print("done ->", HERE)
