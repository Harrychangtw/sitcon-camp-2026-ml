#!/usr/bin/env python3
"""RNN step-through layers (Course 2 · Loop 2): 讀一個字，更新記憶，傳下去.

FOUR transparent PNGs (rnn_step_1.png … rnn_step_4.png) that are LAYERS, not
standalone figures: all share one canvas / coordinate system, and each file
contains ONLY the elements its fragment adds. The slide stacks them in
absolutely-positioned fragment divs, so each click composes one more hop of

    [空白記憶] -> [RNN] -> [記憶 v1] -> [RNN] -> [記憶 v2] -> ...
                    ^tok            ^tok

onto the same spot; the all-fragments state (what PDF/PNG exports show) is the
complete unrolled chain over 「今天 天氣 真 好」. Because layers never redraw a
shared element, overlay stacking cannot double-composite anything - which is
also why every fill here is an OPAQUE pre-blend against the slide bg (no alpha).

Visual continuity with rnn_flow.png: CARD token pills, GREY arrows, CYAN memory
boxes. No fading gradient - the fade is the next slide's job; the memory box is
deliberately the SAME size and SAME intensity at every step.

CJK labels baked in -> Artific(400/700)+Noto Sans TC helper. Hard corners
(deck-wide figure rule: no rounded corners).

Run:  uv run --with matplotlib --with numpy --with fonttools python3 \
          slides/figures/generate-rnn-steps.py
"""

import os
import tempfile

import numpy as np
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

HERE = os.path.dirname(os.path.abspath(__file__))
FONTS_DIR = os.path.join(HERE, "..", "marp", "assets", "fonts")

FIGSIZE = (12.6, 4.4)  # shared by all four layers so they overlay pixel-exact


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


def blend(fg, alpha, bg=BG):
    """Opaque pre-blend of fg over bg - layers must never carry alpha fills."""
    f = np.array([int(fg[i:i + 2], 16) for i in (1, 3, 5)], dtype=float)
    b = np.array([int(bg[i:i + 2], 16) for i in (1, 3, 5)], dtype=float)
    return "#" + "".join(f"{round(v):02X}" for v in alpha * f + (1 - alpha) * b)


MEM_FILL = blend(CYAN, 0.50)  # constant at every step: same size, same look

TOKENS = ["今天", "天氣", "真", "好"]
STEP_MARKS = ["①", "②", "③", "④"]

# 9 lane slots: v0, RNN, v1, RNN, v2, RNN, v3, RNN, v4
XS = np.linspace(0.055, 0.945, 9)
LANE_Y = 0.60
MEM_W, MEM_H = 0.080, 0.30
NET_W, NET_H = 0.082, 0.34
TOK_Y, TOK_W, TOK_H = 0.16, 0.085, 0.22


def rbox(ax, cx, cy, w, h, *, fill=CARD, edge=GREY_MID, lw=2.0, ls="solid"):
    # hard corners (deck-wide figure rule: no rounded corners)
    ax.add_patch(FancyBboxPatch(
        (cx - w / 2, cy - h / 2), w, h,
        boxstyle="square,pad=0", linestyle=ls,
        facecolor=fill, edgecolor=edge, linewidth=lw, zorder=3))


def lane_arrow(ax, x0, x1):
    ax.annotate("", xy=(x1, LANE_Y), xytext=(x0, LANE_Y),
                arrowprops=dict(arrowstyle="-|>", color=GREY, lw=2.4,
                                mutation_scale=17), zorder=2)


def mem_box(ax, x, label, *, blank=False):
    if blank:
        rbox(ax, x, LANE_Y, MEM_W, MEM_H, fill=CARD, edge=GREY_MID, ls=(0, (4, 3)))
        ax.text(x, LANE_Y, label, color=GREY, fontsize=18,
                ha="center", va="center", zorder=4)
    else:
        rbox(ax, x, LANE_Y, MEM_W, MEM_H, fill=MEM_FILL, edge=CYAN, lw=2.2)
        ax.text(x, LANE_Y, label, color=WHITE, fontsize=23,
                ha="center", va="center", zorder=4)


def net_box(ax, x, mark):
    rbox(ax, x, LANE_Y, NET_W, NET_H, fill=CARD, edge=GREY, lw=2.4)
    ax.text(x, LANE_Y, "RNN", color=WHITE, fontsize=17,
            ha="center", va="center", zorder=4)
    ax.text(x, LANE_Y + NET_H / 2 + 0.07, mark, color=GREY, fontsize=15,
            ha="center", va="bottom")


def token(ax, x, text):
    rbox(ax, x, TOK_Y, TOK_W, TOK_H, fill=CARD, edge=GREY_MID)
    ax.text(x, TOK_Y, text, color=WHITE, fontsize=25,
            ha="center", va="center", zorder=4)
    ax.annotate("", xy=(x, LANE_Y - NET_H / 2 - 0.012),
                xytext=(x, TOK_Y + TOK_H / 2 + 0.012),
                arrowprops=dict(arrowstyle="-|>", color=GREY, lw=2.0,
                                mutation_scale=14), zorder=2)


def new_canvas():
    fig = plt.figure(figsize=FIGSIZE, facecolor=BG)
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.axis("off")
    return fig, ax


def build_step(t):
    """Layer t (1-based): the elements fragment t adds to the chain."""
    fig, ax = new_canvas()
    net_x, out_x = XS[2 * t - 1], XS[2 * t]
    in_x = XS[2 * t - 2]

    if t == 1:
        # step 1 owns the chain head: 記憶 lane label + the blank memory box
        ax.text(in_x, LANE_Y + MEM_H / 2 + 0.07, "記憶", color=WHITE,
                fontsize=17, ha="center", va="bottom", fontweight="bold")
        mem_box(ax, in_x, "空白", blank=True)

    lane_arrow(ax, in_x + (MEM_W / 2 + 0.005), net_x - (NET_W / 2 + 0.005))
    net_box(ax, net_x, STEP_MARKS[t - 1])
    token(ax, net_x, TOKENS[t - 1])
    lane_arrow(ax, net_x + (NET_W / 2 + 0.005), out_x - (MEM_W / 2 + 0.005))
    mem_box(ax, out_x, f"v{t}")

    if t == 4:
        ax.text(out_x, LANE_Y - MEM_H / 2 - 0.07, "整句的摘要", color=GREY,
                fontsize=15, ha="center", va="top")

    out = os.path.join(HERE, f"rnn_step_{t}.png")
    fig.savefig(out, dpi=300, transparent=True)
    plt.close(fig)
    print(f"saved rnn_step_{t}.png")


if __name__ == "__main__":
    use_deck_fonts()
    for t in (1, 2, 3, 4):
        build_step(t)
