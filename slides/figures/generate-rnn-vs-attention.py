"""
Loop 3 KEY visual: RNN chain (一站一站傳) vs attention (每個字直接看所有字).

Two panels, same five token pills:
  LEFT  — RNN: memory hops pill-to-pill along a grey chain; earlier pills fade
          (記憶越傳越淡), the visual answer to Loop 2 的健忘牆.
  RIGHT — attention: all five pills wired all-to-all (dim grey); one selected
          token's four lines are highlighted in cyan — 每個字直接看所有字.

Self-contained deck => zh labels live IN the figure (CONVENTIONS §Figures):
Artific (instanced 400/700) for Latin + Noto Sans TC fallback for CJK.
No formulas anywhere (formula-free loop).

Run: uv run --with matplotlib --with numpy --with fonttools python3 \
       slides/figures/generate-rnn-vs-attention.py
"""

import os
import tempfile
import itertools
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import font_manager
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch

# ---- palette (PALETTE.md) -------------------------------------------------
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


TOKENS = ["貓", "坐", "在", "墊", "上"]
PILL_W, PILL_H = 0.052, 0.16
ROW_Y = 0.34            # pill-row vertical center (0..1 within a panel band)


def pill(ax, cx, cy, text, *, alpha=1.0, edge=GREY_MID, tcolor=WHITE):
    ax.add_patch(
        FancyBboxPatch(
            (cx - PILL_W / 2, cy - PILL_H / 2),
            PILL_W,
            PILL_H,
            boxstyle="square,pad=0",
            facecolor=CARD,
            edgecolor=edge,
            linewidth=2.0,
            alpha=alpha,
            mutation_aspect=0.62,
        )
    )
    ax.text(cx, cy, text, ha="center", va="center", color=tcolor,
            fontsize=34, alpha=alpha)


def build():
    use_deck_fonts()
    # wide two-panel: 16:6 -> at h:1150 renders ~3067px wide, fits 3640 area
    fig = plt.figure(figsize=(16, 6), facecolor=BG)
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_facecolor(BG)
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.axis("off")

    # panel x-centers for 5 pills — each panel horizontally centered in its
    # virtual half-column (0.25 / 0.75), tighter step so the middle gap widens
    STEP = 0.084
    lx = [0.25 + (i - 2) * STEP for i in range(5)]   # left panel
    rx = [0.75 + (i - 2) * STEP for i in range(5)]   # right panel

    # thin divider between panels
    ax.plot([0.5, 0.5], [0.08, 0.86], color=GREY_MID, lw=1.4, alpha=0.6)

    # ---------------- panel titles (left-aligned to each panel) ----------------
    ax.text(lx[0] - PILL_W / 2, 0.90, "RNN", ha="left", va="center", color=WHITE,
            fontsize=30, fontweight="bold")
    ax.text(lx[0] - PILL_W / 2 + 0.08, 0.90, "一站一站傳", ha="left", va="center",
            color=GREY, fontsize=26)
    ax.text(rx[0] - PILL_W / 2, 0.90, "Attention", ha="left", va="center",
            color=WHITE, fontsize=30, fontweight="bold")
    ax.text(rx[0] - PILL_W / 2 + 0.19, 0.90, "每個字直接看所有字", ha="left",
            va="center", color=GREY, fontsize=26)

    # ================= LEFT: RNN chain =================
    # earlier pills fade -> 記憶越傳越淡
    fades = [0.42, 0.56, 0.72, 0.86, 1.0]
    for cx, tok, a in zip(lx, TOKENS, fades):
        pill(ax, cx, ROW_Y, tok, alpha=a)
    # grey memory-passing arrows between consecutive pills
    for i in range(4):
        ax.add_patch(
            FancyArrowPatch(
                (lx[i] + PILL_W / 2 + 0.004, ROW_Y),
                (lx[i + 1] - PILL_W / 2 - 0.004, ROW_Y),
                arrowstyle="-|>", mutation_scale=22, lw=2.4, color=GREY,
            )
        )
    # small "記憶" tag riding above the chain, fading left->faint? bright->right
    for i in range(4):
        mx = (lx[i] + lx[i + 1]) / 2
        ax.text(mx, ROW_Y + 0.135, "記憶", ha="center", va="center",
                color=GREY, fontsize=16, alpha=0.35 + 0.16 * i)
    ax.text(0.25, 0.115, "傳到後面就淡了", ha="center", va="center",
            color=GREY, fontsize=22)

    # ================= RIGHT: attention all-to-all =================
    sel = 4  # selected token (上) — highlight its four lines in cyan
    # dim grey arcs for every pair, above the row
    for i, j in itertools.combinations(range(5), 2):
        if i == sel or j == sel:
            continue
        span = abs(rx[j] - rx[i])
        ax.add_patch(
            FancyArrowPatch(
                (rx[i], ROW_Y + PILL_H / 2),
                (rx[j], ROW_Y + PILL_H / 2),
                arrowstyle="-", lw=1.6, color=GREY_MID, alpha=0.7,
                connectionstyle=f"arc3,rad={-0.55 - span}",
            )
        )
    # selected token's four connections in cyan (thicker)
    for k in range(5):
        if k == sel:
            continue
        span = abs(rx[sel] - rx[k])
        ax.add_patch(
            FancyArrowPatch(
                (rx[k], ROW_Y + PILL_H / 2),
                (rx[sel], ROW_Y + PILL_H / 2),
                arrowstyle="-", lw=3.4, color=CYAN,
                connectionstyle=f"arc3,rad={-0.5 - span}",
            )
        )
    # pills on top of the lines; selected pill gets a cyan edge
    for k, (cx, tok) in enumerate(zip(rx, TOKENS)):
        if k == sel:
            pill(ax, cx, ROW_Y, tok, edge=CYAN)
        else:
            pill(ax, cx, ROW_Y, tok)
    ax.text(0.75, 0.115, "選一個字，直接連到所有字", ha="center", va="center",
            color=GREY, fontsize=22)

    out = os.path.join(HERE, "rnn_vs_attention.png")
    fig.savefig(out, dpi=300, transparent=True)
    plt.close(fig)
    print("saved", out)


if __name__ == "__main__":
    build()
