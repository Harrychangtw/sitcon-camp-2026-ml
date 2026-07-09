"""
Generate the「你看到的 vs 模型看到的」pixel pair for Course 2 Loop 1 debrief.

One real CIFAR-10 validation image from the pixel-shuffle station's shipped
pack (val #036, a 貓), shown twice: left as-is, right with every pixel moved
by the station's REAL fixed permutation π (meta.json, seed 314159; RGB moves
together, exactly as the station applies it). Nothing here is mocked: the
bytes come from cifar10.bin.gz and the shuffle is the shipped π, so the right
panel is pixel-identical to what the station's 模型看到的 lane renders.

Style: slides/figures/PALETTE.md — dark palette, transparent PNG, dpi 300,
full-frame axis. Panel borders reuse the station's lane accents (cyan = 原始,
purple = 打亂). CJK labels baked in via Noto Sans TC (deck is self-contained).

Run:  uv run --with matplotlib --with numpy --with fonttools python3 slides/figures/generate-pixel-shuffle-pair.py
"""

import gzip
import json
import os
import tempfile

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from matplotlib import font_manager
from matplotlib.patches import FancyArrowPatch

BG       = "#0A0A0A"
CARD     = "#171717"
GREY_MID = "#585858"
GREY     = "#9E9E9E"
WHITE    = "#FFFFFF"
CYAN     = "#34E3ED"   # 原始像素 lane
PURPLE   = "#7235FF"   # 打亂像素 lane

HERE = os.path.dirname(os.path.abspath(__file__))
FONTS_DIR = os.path.join(HERE, "..", "marp", "assets", "fonts")
DATA_DIR = os.path.join(
    HERE, "..", "..", "apps", "course2", "public", "data", "course2", "pixel-shuffle"
)
VAL_INDEX = 36  # val #036, a 貓 — high-contrast, instantly recognizable


def use_deck_fonts():
    """Artific (instanced 400/700) + Noto Sans TC fallback for the baked-in CJK."""
    families = []
    src = next((p for p in (
        os.path.expanduser("~/Library/Fonts/Artific-Variable.ttf"),
        "/Library/Fonts/Artific-Variable.ttf",
        os.path.join(FONTS_DIR, "Artific-Variable.ttf"),
    ) if os.path.exists(p)), None)
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
    for noto in (
        os.path.join(FONTS_DIR, "NotoSansTC-Regular.ttf"),
        # headless boxes have no assets/fonts (gitignored); the system CJK
        # collection carries the same TC glyphs
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    ):
        if os.path.exists(noto):
            font_manager.fontManager.addfont(noto)
            fam = "Noto Sans CJK TC" if noto.endswith(".ttc") else \
                font_manager.FontProperties(fname=noto).get_name()
            families.append(fam)
            break
    if families:
        plt.rcParams["font.family"] = families


def load_pair():
    meta = json.load(open(os.path.join(DATA_DIR, "meta.json")))
    raw = gzip.open(os.path.join(DATA_DIR, "cifar10.bin.gz")).read()
    tile, depth = meta["tile"], meta["depth"]
    size = tile * tile * depth
    i = meta["trainN"] + VAL_INDEX
    img = np.frombuffer(raw[i * size:(i + 1) * size], dtype=np.uint8)
    pixels = img.reshape(tile * tile, depth)  # HWC: position-major, RGB together
    perm = np.asarray(meta["permutation"])
    shuffled = pixels[perm]  # shuffled position p shows original pixel perm[p]
    label = meta["classNames_zh"][meta["labels"][i]]
    return (
        pixels.reshape(tile, tile, depth),
        shuffled.reshape(tile, tile, depth),
        label,
    )


def panel(fig, rect, img, border):
    ax = fig.add_axes(rect)
    ax.imshow(img, interpolation="nearest")
    ax.set_xticks([]); ax.set_yticks([])
    for s in ax.spines.values():
        s.set_edgecolor(border)
        s.set_linewidth(3.0)


def build():
    use_deck_fonts()
    fig = plt.figure(figsize=(8.8, 4.6), facecolor=BG)
    bg = fig.add_axes([0, 0, 1, 1])
    bg.set_facecolor(BG)
    bg.set_xlim(0, 1); bg.set_ylim(0, 1)
    bg.axis("off")

    orig, shuf, label = load_pair()
    side = 0.60                      # panel height in figure fraction
    w = side * 4.6 / 8.8             # square in figure coords
    y0 = 0.28
    lx, rx = 0.10, 1 - 0.10 - w
    panel(fig, [lx, y0, w, side], orig, CYAN)
    panel(fig, [rx, y0, w, side], shuf, PURPLE)

    # the π arrow between the panels
    mid_y = y0 + side / 2
    bg.add_patch(FancyArrowPatch(
        (lx + w + 0.025, mid_y), (rx - 0.025, mid_y),
        arrowstyle="-|>", mutation_scale=20, lw=2.0, color=GREY, zorder=2))
    bg.text(0.5, mid_y + 0.085, "固定排列 π", ha="center", va="bottom",
            color=WHITE, fontsize=15)
    bg.text(0.5, mid_y - 0.085, "每顆像素搬家\n數值一個都沒變", ha="center",
            va="top", color=GREY, fontsize=12, linespacing=1.6)

    # labels under the panels (the station's own lane wording)
    bg.text(lx + w / 2, y0 - 0.055, "你看到的", ha="center", va="top",
            color=WHITE, fontsize=16)
    bg.text(lx + w / 2, y0 - 0.135, f"原始像素 · {label}", ha="center", va="top",
            color=CYAN, fontsize=11)
    bg.text(rx + w / 2, y0 - 0.055, "模型看到的", ha="center", va="top",
            color=WHITE, fontsize=16)
    bg.text(rx + w / 2, y0 - 0.135, "打亂像素 · 同一張圖", ha="center", va="top",
            color=PURPLE, fontsize=11)

    fig.savefig(os.path.join(HERE, "pixel_shuffle_pair.png"),
                dpi=300, transparent=True)
    plt.close(fig)
    print("saved pixel_shuffle_pair.png")


if __name__ == "__main__":
    build()
    print("done ->", HERE)
