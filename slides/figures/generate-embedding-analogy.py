#!/usr/bin/env python3
"""
Generate the embedding-analogy sketch for the Course 2 deck (slide 10: bias debrief).

One figure, two stacked panels — mirrors the 2025 deck's presentation_30
("向量嵌入 | 特性") right-hand column: a consistent offset drawn as two parallel
dashed arrows in a small vector space.

  top panel  — tense analogy:          walking → walked   ∥  swimming → swam   (CYAN)
  bottom     — gender / royalty:        man → king         ∥  woman → queen     (PURPLE)

The point students should read: the *direction* between a pair is meaningful and
repeats across pairs → embeddings encode relations (and, on slide 10, also bias).

Run headless:
  uv run --with matplotlib --with numpy python3 generate-embedding-analogy.py

Palette + conventions: slides/figures/PALETTE.md. Saved transparent to sit on #0A0A0A.
"""
import os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyArrowPatch

# --- palette (PALETTE.md) --------------------------------------------------
BG       = "#0A0A0A"
CARD     = "#171717"
GREY_MID = "#585858"
GREY     = "#9E9E9E"
WHITE    = "#FFFFFF"
CYAN     = "#34E3ED"   # categorical accent — pair A (tense)
PURPLE   = "#7235FF"   # categorical accent — pair B (gender/royalty)

OUT_DIR = os.path.dirname(os.path.abspath(__file__))


def dot(ax, xy, color, label, *, dx=0.0, dy=0.10, ha="center"):
    ax.plot(*xy, "o", color=color, markersize=11, markeredgecolor=BG,
            markeredgewidth=1.5, zorder=4)
    ax.annotate(label, xy, xytext=(xy[0] + dx, xy[1] + dy),
                color=WHITE, fontsize=13, ha=ha, va="center", zorder=5)


def offset_arrow(ax, p0, p1, color):
    ax.add_patch(FancyArrowPatch(
        p0, p1, arrowstyle="-|>", mutation_scale=16,
        linestyle=(0, (4, 3)), linewidth=2.0, color=color, zorder=3))


def panel(ax, title, pairs, color, note):
    """pairs = [((x0,y0,'a'), (x1,y1,'b')), ...] — each is one analogy arrow."""
    ax.set_facecolor("none")
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 6)
    ax.axis("off")
    # faint 2-axis frame so it reads as a vector space
    ax.plot([0.4, 0.4], [0.4, 5.4], color=GREY_MID, lw=1.2, zorder=1)
    ax.plot([0.4, 9.4], [0.4, 0.4], color=GREY_MID, lw=1.2, zorder=1)
    # dots + parallel offset arrows only — point labels (walking/king/…) and any
    # zh are added in Affinity (PALETTE.md: figures stay label-light, zh later).
    for (x0, y0, _a), (x1, y1, _b) in pairs:
        offset_arrow(ax, (x0, y0), (x1, y1), color)
        ax.plot(x0, y0, "o", color=color, markersize=13, markeredgecolor=BG,
                markeredgewidth=1.5, zorder=4)
        ax.plot(x1, y1, "o", color=color, markersize=13, markeredgecolor=BG,
                markeredgewidth=1.5, zorder=4)
    ax.annotate(title, (0.6, 5.6), color=color, fontsize=13,
                ha="left", va="bottom", fontweight="bold")
    ax.annotate(note, (9.4, 0.05), color=GREY, fontsize=11,
                ha="right", va="bottom", style="italic")


def build():
    fig = plt.figure(figsize=(5, 6), facecolor=BG)
    ax_top = fig.add_axes([0.02, 0.52, 0.96, 0.44])
    ax_bot = fig.add_axes([0.02, 0.04, 0.96, 0.44])

    # top: tense analogy — same "past-tense" offset for both pairs
    panel(ax_top, "walking → walked  ∥  swimming → swam",
          [((1.6, 1.4, "walking"), (4.2, 3.4, "walked")),
           ((5.0, 1.0, "swimming"), (7.6, 3.0, "swam"))],
          CYAN, "same offset = past-tense direction")

    # bottom: gender/royalty — king - man + woman ≈ queen
    panel(ax_bot, "man → king  ∥  woman → queen",
          [((1.6, 1.2, "man"), (4.2, 3.4, "king")),
           ((5.0, 0.9, "woman"), (7.6, 3.1, "queen"))],
          PURPLE, "king − man + woman ≈ queen")

    out = os.path.join(OUT_DIR, "embedding_analogy.png")
    fig.savefig(out, dpi=300, transparent=True)
    plt.close(fig)
    print("saved", out)


if __name__ == "__main__":
    build()
