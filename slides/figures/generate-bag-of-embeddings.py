"""
Generate the bag-of-embeddings figure for the Course 2 deck (slide 13: MLP 吃文字 橋接).

One figure showing the concrete "text -> embedding -> averaged vector" pipeline —
the stage the slide narrates as「查每個 token 的 embedding → 全部加起來取平均」made
visible. It covers stages 1-3 of slide 13's flow (句子 → embeddings → 平均向量); the
→ MLP → 情緒 tail stays hand-drawn in Affinity.

Reading order:
  sentence  ->  tokens  ->  embedding matrix (one viridis column per token)
                                     |  mean over tokens (1/N Σ)
                                     v
                            one averaged vector  (lime-edged = the bag vector)

Honesty / pedagogy: the output column is the genuine element-wise ROW-MEAN of the
token columns, drawn with the SAME viridis norm — a bag = mean = order-free, which
is exactly what the slide 15 shuffle wall later pokes.

Style follows slides/figures/generate-encoding-figures.py + PALETTE.md:
  dark design-system palette, viridis heatmap ramp, transparent PNG, dpi 300,
  full-frame axis (no tight crop) so the saved PNG keeps the exact figsize ratio.
English/label-light; zh labels are added later in Affinity.

Run:  uv run --with matplotlib --with numpy --with fonttools python3 slides/figures/generate-bag-of-embeddings.py
      (fonttools is optional — without it the labels fall back to matplotlib's default font)
"""

import os
import tempfile
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import font_manager
from matplotlib.patches import FancyBboxPatch, Rectangle, FancyArrowPatch
from matplotlib.colors import LinearSegmentedColormap, Normalize


def use_deck_font():
    """Render the (Latin) figure labels in the deck typeface — Artific for English
    (tokens.md §2); Chinese is Roboto/蘭亭黑 but that's added later in Affinity, so the
    figure itself only ever needs Artific.

    Artific-Variable defaults to its heaviest (Black, wght=900) instance, so we pin
    the REGULAR (400) weight — plus a Bold (700) for real emphasis, not faux-bold —
    with fonttools and hand matplotlib the static instances (matplotlib <3.10 can't
    drive a variable axis itself). Statics are written to the temp dir, not the repo.
    Falls back gracefully (default font, or the raw variable face) so the script still
    runs anywhere."""
    src = next((p for p in (
        os.path.expanduser("~/Library/Fonts/Artific-Variable.ttf"),
        "/Library/Fonts/Artific-Variable.ttf",
    ) if os.path.exists(p)), None)
    if src is None:
        return False
    try:
        from fontTools import ttLib
        from fontTools.varLib.instancer import instantiateVariableFont
    except ImportError:
        # no fonttools: register the variable face as-is (renders Black/heavy)
        font_manager.fontManager.addfont(src)
        plt.rcParams["font.family"] = font_manager.FontProperties(fname=src).get_name()
        return True
    family = None
    for wght in (400, 700):
        vf = ttLib.TTFont(src)
        instantiateVariableFont(vf, {"wght": wght}, inplace=True)
        out = os.path.join(tempfile.gettempdir(), f"Artific-{wght}.ttf")
        vf.save(out)
        font_manager.fontManager.addfont(out)
        family = font_manager.FontProperties(fname=out).get_name()
    plt.rcParams["font.family"] = family  # Regular is the base; bold picks the 700 static
    return True

# ==========================================
# Design System palette — see slides/figures/PALETTE.md (canonical, reusable)
# ==========================================
BG       = "#0A0A0A"   # canvas (we save transparent, so this only backs the export)
CARD     = "#171717"   # raised card / empty cell
GREY_MID = "#585858"   # borders / dim rules
GREY     = "#9E9E9E"   # secondary text / arrows
WHITE    = "#FFFFFF"   # primary text
LIME     = "#D6FB00"   # single accent — marks the one averaged (bag) vector, nowhere else
BORDER   = GREY_MID    # cell / card outlines

# viridis ramp (tokens.md 3d): heatmaps use this continuous ramp, NOT the accents.
VIRIDIS = LinearSegmentedColormap.from_list("camp_viridis", [
    "#350B4C", "#404683", "#3A799B", "#34979A", "#2DB492", "#84DB45", "#B8EF18",
])

OUT_DIR = os.path.dirname(os.path.abspath(__file__))

TOKENS   = ["the", "bill", "helps", "no", "one"]
SENTENCE = "the bill helps no one"

# input embedding band (the N token columns)
X0, X1 = 0.055, 0.52
NCOL = len(TOKENS)
COL_W = (X1 - X0) / NCOL
COL_CX = [X0 + COL_W * (c + 0.5) for c in range(NCOL)]

# vertical extent shared by the input matrix and the output vector
MAT_Y0, MAT_Y1 = 0.36, 0.90
D = 5  # embedding dims (rows)

# output (averaged) vector column, right of the mean operator
OUT_X0, OUT_X1 = 0.79, 0.79 + COL_W
OUT_CX = (OUT_X0 + OUT_X1) / 2


def rounded_cell(ax, cx, y0, y1, w, text, *, fill=CARD, edge=BORDER,
                 tcolor=WHITE, fs=15, weight="normal"):
    x0 = cx - w / 2
    ax.add_patch(FancyBboxPatch(
        (x0, y0), w, y1 - y0,
        boxstyle="round,pad=0,rounding_size=0.012",
        linewidth=1.2, edgecolor=edge, facecolor=fill, mutation_aspect=1.0,
    ))
    if text is not None:
        ax.text(cx, (y0 + y1) / 2, text, ha="center", va="center",
                color=tcolor, fontsize=fs, fontweight=weight)


def up_arrow(ax, cx, y0, y1):
    ax.annotate("", xy=(cx, y1), xytext=(cx, y0),
                arrowprops=dict(arrowstyle="-|>", color=GREY, lw=2.2,
                                mutation_scale=18))


def draw_column(ax, values, x0, x1, y0, y1, norm, *, edge=BORDER, lw=0.8):
    """One vertical D-cell viridis column spanning [x0,x1] x [y0,y1], top = row 0."""
    R = len(values)
    cell_h = (y1 - y0) / R
    for r in range(R):
        ax.add_patch(Rectangle(
            (x0, y1 - (r + 1) * cell_h), x1 - x0, cell_h,
            facecolor=VIRIDIS(norm(values[r])), edgecolor=edge, lw=lw))


def base_ax(figsize):
    fig = plt.figure(figsize=figsize, facecolor=BG)
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_facecolor(BG)
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.axis("off")
    return fig, ax


def build():
    use_deck_font()
    fig, ax = base_ax((6.5, 4))
    norm = Normalize(vmin=0.0, vmax=1.0)

    # dense token embeddings: D dims x NCOL tokens
    rng = np.random.default_rng(11)
    emb = rng.uniform(0.08, 0.95, size=(D, NCOL))
    mean_vec = emb.mean(axis=1)  # the genuine bag vector — element-wise row mean

    # --- text stage: sentence -> tokens (bottom -> up under the matrix) ---
    sent_y0, sent_y1 = 0.045, 0.14
    tok_y0,  tok_y1  = 0.20, 0.29
    rounded_cell(ax, (X0 + X1) / 2, sent_y0, sent_y1, X1 - X0, SENTENCE,
                 fs=15, weight="bold")
    for cx, tok in zip(COL_CX, TOKENS):
        rounded_cell(ax, cx, tok_y0, tok_y1, COL_W * 0.84, tok, fs=13)
    up_arrow(ax, (X0 + X1) / 2, sent_y1 + 0.006, tok_y0 - 0.006)
    up_arrow(ax, (X0 + X1) / 2, tok_y1 + 0.006, MAT_Y0 - 0.006)

    # --- embedding stage: one viridis column per token ---
    for c in range(NCOL):
        cx0 = X0 + c * COL_W
        draw_column(ax, emb[:, c], cx0 + COL_W * 0.09, cx0 + COL_W * 0.91,
                    MAT_Y0, MAT_Y1, norm)

    # --- average stage: horizontal reduce -> one averaged vector ---
    mid_y = (MAT_Y0 + MAT_Y1) / 2
    op_cx = (X1 + OUT_X0) / 2
    # arrow from matrix edge -> operator -> output column
    ax.add_patch(FancyArrowPatch(
        (X1 + 0.015, mid_y), (OUT_X0 - 0.02, mid_y),
        arrowstyle="-|>", mutation_scale=20, lw=2.2, color=GREY, zorder=2))
    ax.text(op_cx, mid_y + 0.075, "mean", ha="center", va="bottom",
            color=GREY, fontsize=13, style="italic")
    ax.text(op_cx, mid_y - 0.075, r"$\frac{1}{N}\sum$", ha="center", va="top",
            color=GREY, fontsize=17)

    # the one averaged vector — same norm, lime edge = the single accent
    draw_column(ax, mean_vec, OUT_X0, OUT_X1, MAT_Y0, MAT_Y1, norm,
                edge=LIME, lw=1.8)

    # bracket + label to the right of the output column (dim_bracket idiom)
    bx = OUT_X1 + 0.025
    ax.plot([bx, bx], [MAT_Y0, MAT_Y1], color=GREY, lw=1.2)
    ax.plot([bx - 0.012, bx], [MAT_Y0, MAT_Y0], color=GREY, lw=1.2)
    ax.plot([bx - 0.012, bx], [MAT_Y1, MAT_Y1], color=GREY, lw=1.2)
    ax.text(bx + 0.018, mid_y, "one vector", ha="left", va="center",
            color=GREY, fontsize=12, rotation=90)

    fig.savefig(os.path.join(OUT_DIR, "bag_of_embeddings.png"),
                dpi=300, transparent=True)
    plt.close(fig)
    print("saved bag_of_embeddings.png")


if __name__ == "__main__":
    build()
    print("done ->", OUT_DIR)
