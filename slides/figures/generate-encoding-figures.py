"""
Generate two standalone figures for the Course 2 deck (slide 08: one-hot -> embedding).

Style follows the archived Attention Tracker figure scripts:
  - dark design-system palette (#0A0A0A base, lime #D6FB00, viridis heatmap ramp)
  - matplotlib, transparent PNG, dpi 300, minimalist
Two SEPARATE figures, English tokens, NO title on top (the slide capsule labels them):
  1. onehot_encoding.png  — tall, sparse, binary (lime = 1) matrix
  2. word_embedding.png    — short, dense, continuous viridis matrix (via an Embedding table)

Each figure reads bottom -> up:  sentence  ->  tokens  ->  ( embedding table )  ->  matrix

Run:  uv run --with matplotlib --with numpy --with fonttools python3 slides/figures/generate-encoding-figures.py
      (fonttools is optional — without it the labels fall back to matplotlib's default font)
"""

import os
import tempfile
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import font_manager
from matplotlib.patches import FancyBboxPatch, Rectangle
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
LIME     = "#D6FB00"   # accent + one-hot "1" (single text-emphasis accent)
CYAN     = "#34E3ED"   # categorical data accent
PURPLE   = "#7235FF"   # categorical data accent
MAGENTA  = "#FF4EAB"   # categorical data accent (4th; not in the handed-off list)
BORDER   = GREY_MID    # cell / card outlines

# viridis ramp sampled off the cover (tokens.md 3d): low/danger -> high/safe.
# Heatmaps use this continuous ramp, NOT the discrete accents above.
VIRIDIS = LinearSegmentedColormap.from_list("camp_viridis", [
    "#350B4C", "#404683", "#3A799B", "#34979A", "#2DB492", "#84DB45", "#B8EF18",
])

OUT_DIR = os.path.dirname(os.path.abspath(__file__))

TOKENS   = ["the", "cat", "sat", "on", "mat"]
SENTENCE = "the cat sat on mat"

# horizontal band the columns live in (shared by tokens + matrix)
X0, X1 = 0.14, 0.86
NCOL = len(TOKENS)
COL_W = (X1 - X0) / NCOL
COL_CX = [X0 + COL_W * (c + 0.5) for c in range(NCOL)]


# ==========================================
# Drawing helpers (all in axes coords 0..1)
# ==========================================
def rounded_cell(ax, cx, y0, y1, w, text, *, fill=CARD, edge=BORDER,
                 tcolor=WHITE, fs=15, weight="normal"):
    """A rounded token/sentence cell centered on cx."""
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
    # grey so it reads on both a white preview and the dark #0A0A0A slide
    ax.annotate("", xy=(cx, y1), xytext=(cx, y0),
                arrowprops=dict(arrowstyle="-|>", color=GREY, lw=2.2,
                                mutation_scale=20))


def draw_matrix(ax, data, y0, y1, *, binary):
    """Draw an R x NCOL grid of square-ish cells spanning [X0,X1] x [y0,y1]."""
    R = data.shape[0]
    cell_w = (X1 - X0) / NCOL
    cell_h = (y1 - y0) / R
    if binary:
        for r in range(R):
            for c in range(NCOL):
                on = data[r, c] > 0.5
                ax.add_patch(Rectangle(
                    (X0 + c * cell_w, y1 - (r + 1) * cell_h), cell_w, cell_h,
                    facecolor=(LIME if on else CARD), edgecolor=BORDER, lw=0.8))
                if on:
                    ax.text(X0 + (c + 0.5) * cell_w, y1 - (r + 0.5) * cell_h, "1",
                            ha="center", va="center", color=BG, fontsize=11,
                            fontweight="bold")
    else:
        norm = Normalize(vmin=0.0, vmax=1.0)
        for r in range(R):
            for c in range(NCOL):
                ax.add_patch(Rectangle(
                    (X0 + c * cell_w, y1 - (r + 1) * cell_h), cell_w, cell_h,
                    facecolor=VIRIDIS(norm(data[r, c])), edgecolor=BORDER, lw=0.8))


def dim_bracket(ax, y0, y1, label):
    """Grey dimension caption to the right of the matrix — the long-vs-short payoff."""
    x = X1 + 0.03
    ax.plot([x, x], [y0, y1], color=GREY, lw=1.2)
    ax.plot([x - 0.012, x], [y0, y0], color=GREY, lw=1.2)
    ax.plot([x - 0.012, x], [y1, y1], color=GREY, lw=1.2)
    ax.text(x + 0.02, (y0 + y1) / 2, label, ha="left", va="center",
            color=GREY, fontsize=12, rotation=90)


def base_ax(figsize=(5, 4)):
    # full-frame axes + no tight crop => the saved PNG keeps the exact figsize ratio
    fig = plt.figure(figsize=figsize, facecolor=BG)
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_facecolor(BG)
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.axis("off")
    return fig, ax


def add_tokens_and_sentence(ax, tok_y0, tok_y1, sent_y0, sent_y1):
    for cx, tok in zip(COL_CX, TOKENS):
        rounded_cell(ax, cx, tok_y0, tok_y1, COL_W * 0.82, tok, fs=14)
    rounded_cell(ax, 0.5, sent_y0, sent_y1, X1 - X0, SENTENCE,
                 fs=16, weight="bold")


# ==========================================
# Figure 1 — One-hot encoding (tall, sparse, binary)
# ==========================================
def build_onehot():
    fig, ax = base_ax((5, 4))

    # bottom -> up geometry, filling a 5:4 frame
    sent_y0, sent_y1 = 0.05, 0.19
    tok_y0,  tok_y1  = 0.26, 0.40
    mat_y0,  mat_y1  = 0.47, 0.96

    add_tokens_and_sentence(ax, tok_y0, tok_y1, sent_y0, sent_y1)
    up_arrow(ax, 0.5, sent_y1 + 0.006, tok_y0 - 0.006)
    up_arrow(ax, 0.5, tok_y1 + 0.006, mat_y0 - 0.006)

    # one 1 per column, placed on distinct rows; rest is 0
    R = 6
    hot_rows = [1, 4, 0, 3, 5]
    oh = np.zeros((R, NCOL))
    for c, r in enumerate(hot_rows):
        oh[r, c] = 1.0
    draw_matrix(ax, oh, mat_y0, mat_y1, binary=True)
    dim_bracket(ax, mat_y0, mat_y1, "≈ vocab size")

    fig.savefig(os.path.join(OUT_DIR, "onehot_encoding.png"),
                dpi=300, transparent=True)
    plt.close(fig)
    print("saved onehot_encoding.png")


# ==========================================
# Figure 2 — Word embedding (short, dense, continuous)
# ==========================================
def build_embedding():
    fig, ax = base_ax((5, 4))

    # embedding has an extra stage (the lookup box), so gaps are tighter to still fill 5:4
    sent_y0, sent_y1 = 0.04, 0.16
    tok_y0,  tok_y1  = 0.22, 0.34
    box_y0,  box_y1  = 0.40, 0.52   # "Embedding table" lookup box
    mat_y0,  mat_y1  = 0.59, 0.96

    add_tokens_and_sentence(ax, tok_y0, tok_y1, sent_y0, sent_y1)
    up_arrow(ax, 0.5, sent_y1 + 0.006, tok_y0 - 0.006)
    up_arrow(ax, 0.5, tok_y1 + 0.006, box_y0 - 0.006)
    rounded_cell(ax, 0.5, box_y0, box_y1, X1 - X0, "Embedding table",
                 fs=16, weight="bold", tcolor=WHITE, edge=GREY)
    up_arrow(ax, 0.5, box_y1 + 0.006, mat_y0 - 0.006)

    # dense continuous vectors — short (few dims), every cell filled
    rng = np.random.default_rng(7)
    D = 4
    emb = rng.uniform(0.05, 0.95, size=(D, NCOL))
    draw_matrix(ax, emb, mat_y0, mat_y1, binary=False)
    dim_bracket(ax, mat_y0, mat_y1, "= embedding dim")

    fig.savefig(os.path.join(OUT_DIR, "word_embedding.png"),
                dpi=300, transparent=True)
    plt.close(fig)
    print("saved word_embedding.png")


if __name__ == "__main__":
    use_deck_font()
    build_onehot()
    build_embedding()
    print("done ->", OUT_DIR)
