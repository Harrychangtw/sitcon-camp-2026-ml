#!/usr/bin/env python3
"""RNN flow diagram (Course 2 · Loop 2): 一次吃一個 token，把記憶往後傳.

Replaces the old ASCII code block. A horizontal chain over the sentence
「今天天氣真」: each token pill feeds a hidden-state node; the nodes pass a 記憶
channel left -> right, 更新再傳下去. The first token's contribution is drawn as a
CYAN fill that visibly fades along the hops (plus a gradient strip beneath), so
Loop 2's forgetting wall is already planted here.

Schematic (not invented numbers) -> no 示意圖 badge needed. CJK labels are baked
in, so this uses the Artific(400/700)+Noto Sans TC helper.

Run:  uv run --with matplotlib --with numpy --with fonttools python3 \
          slides/figures/generate-rnn-flow.py
"""

import os
import tempfile

import numpy as np
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import font_manager
from matplotlib.colors import LinearSegmentedColormap, to_rgba
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


TOKENS = ["今", "天", "天", "氣", "真"]


def rbox(ax, cx, cy, w, h, *, fill=CARD, edge=GREY_MID, lw=2.0, rad=0.02):
    ax.add_patch(FancyBboxPatch(
        (cx - w / 2, cy - h / 2), w, h,
        boxstyle=f"round,pad=0,rounding_size={rad}",
        facecolor=fill, edgecolor=edge, linewidth=lw, zorder=3))


def build():
    use_deck_fonts()
    fig = plt.figure(figsize=(9, 4.4), facecolor=BG)
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_facecolor(BG)
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.axis("off")

    n = len(TOKENS)
    xs = np.linspace(0.12, 0.88, n)
    tok_cy, tok_h, tok_w = 0.30, 0.14, 0.11
    hid_cy, hid_h, hid_w = 0.62, 0.20, 0.12

    # residual "記憶" strength of the FIRST token, fading along the hops
    remain = np.linspace(1.0, 0.18, n)

    # hidden-state chain: horizontal 記憶 arrows left -> right
    for i in range(n - 1):
        ax.annotate("", xy=(xs[i + 1] - hid_w / 2 - 0.006, hid_cy),
                    xytext=(xs[i] + hid_w / 2 + 0.006, hid_cy),
                    arrowprops=dict(arrowstyle="-|>", color=GREY, lw=2.6,
                                    mutation_scale=22), zorder=2)
    # label the memory channel once, above the first hop
    midx = (xs[0] + xs[1]) / 2
    ax.text(midx, hid_cy + hid_h / 2 + 0.075, "記憶", color=WHITE,
            fontsize=17, ha="center", va="bottom", fontweight="bold")
    ax.text((xs[1] + xs[2]) / 2, hid_cy + hid_h / 2 + 0.075, "更新再傳下去",
            color=GREY, fontsize=14, ha="center", va="bottom")

    # nodes + tokens
    for i, (x, tok) in enumerate(zip(xs, TOKENS)):
        # token pill
        rbox(ax, x, tok_cy, tok_w, tok_h, fill=CARD, edge=GREY_MID, rad=0.03)
        ax.text(x, tok_cy, tok, color=WHITE, fontsize=30, ha="center",
                va="center", zorder=4)
        # up arrow token -> hidden node
        ax.annotate("", xy=(x, hid_cy - hid_h / 2 - 0.006),
                    xytext=(x, tok_cy + tok_h / 2 + 0.006),
                    arrowprops=dict(arrowstyle="-|>", color=GREY, lw=2.0,
                                    mutation_scale=16), zorder=2)
        # hidden node — cyan fill = how much of the FIRST token still remains
        fill = to_rgba(CYAN, alpha=float(remain[i]) * 0.85 + 0.05)
        rbox(ax, x, hid_cy, hid_w, hid_h, fill=fill, edge=CYAN, lw=2.2, rad=0.02)
        ax.text(x, hid_cy, f"h{i + 1}", color=WHITE, fontsize=17,
                ha="center", va="center", zorder=4)

    # gradient strip: 第一個字的資訊沿途變淡
    grad = LinearSegmentedColormap.from_list("fade", [CYAN, BG])
    gx0, gx1 = xs[0] - hid_w / 2, xs[-1] + hid_w / 2
    gy0, gy1 = 0.11, 0.16
    ax.imshow(np.linspace(0, 1, 256).reshape(1, -1), cmap=grad,
              extent=(gx0, gx1, gy0, gy1), aspect="auto", zorder=1)
    ax.add_patch(FancyBboxPatch(
        (gx0, gy0), gx1 - gx0, gy1 - gy0,
        boxstyle="round,pad=0,rounding_size=0.006",
        facecolor="none", edgecolor=GREY_MID, linewidth=1.4, zorder=2))
    ax.text(0.5, gy0 - 0.035, "第一個字的資訊，一路被沖淡", color=GREY,
            fontsize=14, ha="center", va="top")

    fig.savefig(os.path.join(HERE, "rnn_flow.png"), dpi=300, transparent=True)
    plt.close(fig)
    print("saved rnn_flow.png")


if __name__ == "__main__":
    build()
