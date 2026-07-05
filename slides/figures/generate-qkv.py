"""
Loop 3 (kept patch): Query / Key / Value — attention 怎麼決定看誰.

One asking token sends a Query (我想找什麼); it is compared against every token's
Key (標籤／鑰匙); the better the match, the more of that token's Value (內容)
flows out. Match strength is shown by LINE THICKNESS and Value-bar length —
FORMULA-FREE (no dot product, no softmax).

zh labels in-figure (Artific + Noto Sans TC fallback).

Run: uv run --with matplotlib --with numpy --with fonttools python3 \
       slides/figures/generate-qkv.py
"""

import os
import tempfile
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import font_manager
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch, Rectangle

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


KEYS = ["貓", "坐", "墊", "上"]
WEIGHTS = [0.62, 0.14, 0.10, 0.14]  # 貓 is the best match for query 牠


def box(ax, cx, cy, w, h, text, *, edge=GREY_MID, tcolor=WHITE, fs=28, sub=None,
        subcolor=GREY):
    ax.add_patch(FancyBboxPatch((cx - w / 2, cy - h / 2), w, h,
                                boxstyle="square,pad=0",
                                facecolor=CARD, edgecolor=edge, lw=2.0,
                                mutation_aspect=0.6))
    if sub:
        ax.text(cx, cy + h * 0.13, text, ha="center", va="center", color=tcolor,
                fontsize=fs)
        ax.text(cx, cy - h * 0.22, sub, ha="center", va="center", color=subcolor,
                fontsize=fs * 0.6)
    else:
        ax.text(cx, cy, text, ha="center", va="center", color=tcolor, fontsize=fs)


def build():
    use_deck_fonts()
    fig = plt.figure(figsize=(15, 6.8), facecolor=BG)
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_facecolor(BG)
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.axis("off")

    # column x
    qx = 0.14
    kx = 0.46
    vx = 0.68
    ys = [0.74, 0.55, 0.36, 0.17]  # four rows for keys/values

    # column headers
    ax.text(qx, 0.93, "Query", ha="center", color=WHITE, fontsize=30,
            fontweight="bold")
    ax.text(qx, 0.885, "我想找什麼", ha="center", color=GREY, fontsize=20)
    ax.text(kx, 0.93, "Key", ha="center", color=WHITE, fontsize=30,
            fontweight="bold")
    ax.text(kx, 0.885, "每個字的標籤／鑰匙", ha="center", color=GREY, fontsize=20)
    ax.text(vx, 0.93, "Value", ha="center", color=WHITE, fontsize=30,
            fontweight="bold")
    ax.text(vx, 0.885, "每個字的內容", ha="center", color=GREY, fontsize=20)

    # the asking token's Query pill (center-left, cyan edge)
    qy = 0.46
    box(ax, qx, qy, 0.15, 0.15, "牠", edge=CYAN, fs=40)
    ax.text(qx, qy - 0.13, "問：牠指的是誰", ha="center", va="center",
            color=GREY, fontsize=19)

    # keys + values rows, with match lines Query->Key and Value bars
    for i, (y, k, w) in enumerate(zip(ys, KEYS, WEIGHTS)):
        best = w == max(WEIGHTS)
        kedge = CYAN if best else GREY_MID
        # match line Query -> Key, thickness ~ weight
        ax.add_patch(FancyArrowPatch((qx + 0.08, qy), (kx - 0.075, y),
                                     arrowstyle="-", lw=1.5 + 9 * w,
                                     color=CYAN if best else GREY_MID,
                                     alpha=1.0 if best else 0.75))
        # Key box (token char)
        box(ax, kx, y, 0.11, 0.12, k, edge=kedge, fs=30)
        # arrow Key -> Value
        ax.add_patch(FancyArrowPatch((kx + 0.058, y), (vx - 0.05, y),
                                     arrowstyle="-|>", mutation_scale=16,
                                     lw=2.0, color=GREY))
        # Value bar, length ~ weight (how much content flows out)
        bar_max = 0.12
        bl = 0.03 + bar_max * (w / max(WEIGHTS))
        ax.add_patch(Rectangle((vx - 0.02, y - 0.035), bl, 0.07,
                               facecolor=CYAN if best else GREY_MID,
                               edgecolor="none"))
        ax.text(vx - 0.02 + bl + 0.012, y, f"{k}的內容", ha="left", va="center",
                color=WHITE if best else GREY, fontsize=20)

    # bottom takeaway
    ax.text(0.5, 0.045, "對得越上，就多讀那個字的內容", ha="center", va="center",
            color=GREY, fontsize=24)

    out = os.path.join(HERE, "qkv_diagram.png")
    fig.savefig(out, dpi=300, transparent=True)
    plt.close(fig)
    print("saved", out)


if __name__ == "__main__":
    build()
