# Figure palette + generation spec (SITCON 2026 · ML deck)

Reusable spec for **any Claude session generating figures** for this deck. Match
this and the figures drop straight onto the dark slides. Grounded in the deck's
design system (`slides/design-system/tokens.md`); this file is the figure-specific
cheat-sheet. Example generator: `slides/figures/generate-encoding-figures.py`.

## Palette (hex → role)

| Hex | Constant | Role |
|-----|----------|------|
| `#D6FB00` | `LIME` | The **single** text-emphasis accent; also the "on" cell in binary matrices. One emphasis run at a time. |
| `#34E3ED` | `CYAN` | Categorical data accent (series / per-group). |
| `#7235FF` | `PURPLE` | Categorical data accent (series / per-group). |
| `#FFFFFF` | `WHITE` | Primary text. |
| `#9E9E9E` | `GREY` | Secondary text, captions, **arrows / connectors**. |
| `#585858` | `GREY_MID` | Cell / card borders, dim rules, brackets. |
| `#171717` | `CARD` | Raised card / panel / chip / empty cell fill. |
| `#0A0A0A` | `BG` | Canvas base (figures are saved **transparent** to sit on this). |

- Handed-off list was `D6FB00 34E3ED 34E3ED 7235FF FFFFFF 9E9E9E 585858 171717 0A0A0A`
  (cyan appeared twice). The 4th categorical accent in the full system is
  **magenta `#FF4EAB`** (tokens.md §3c) — add it when you need a 4-way categorical.
- **Two color families, kept apart** (tokens.md rule): the discrete accents above
  do categorical/series/text work; **heatmaps use the viridis ramp below**. Don't
  mix them.

## Viridis ramp (heatmaps / danger↔safe)

Continuous ramp, low→high (dark purple = low/danger, lime-yellow = high/safe):

```
#350B4C → #404683 → #3A799B → #34979A → #2DB492 → #84DB45 → #B8EF18
```

```python
from matplotlib.colors import LinearSegmentedColormap
VIRIDIS = LinearSegmentedColormap.from_list("camp_viridis",
    ["#350B4C","#404683","#3A799B","#34979A","#2DB492","#84DB45","#B8EF18"])
```

Note: viridis endpoints ≠ the discrete accents. `#350B4C` (viridis-low) is not the
categorical `#7235FF` purple; `#B8EF18` (viridis-high) is not the accent `#D6FB00`
lime. Keep them as distinct tokens.

## Matplotlib conventions

- **Backend / deps**: `matplotlib.use("Agg")`; run headless via
  `uv run --with matplotlib --with numpy --with fonttools [--with scipy] python3 <script>.py`
  (`fonttools` is what lets the labels use the deck typeface — see **Typeface** below;
  it's optional, the scripts fall back to the default font without it).
- **Dark canvas**: `plt.figure(facecolor=BG)`, `ax.set_facecolor(BG)`, but **save
  `transparent=True`** so the figure floats on the slide. `dpi=300`.
- **Exact aspect ratio** (e.g. 5:4): use a full-frame axis and **do not** crop with
  `bbox_inches="tight"` — the tight box follows content and breaks the ratio:
  ```python
  fig = plt.figure(figsize=(5, 4), facecolor=BG)     # 5:4
  ax  = fig.add_axes([0, 0, 1, 1]); ax.axis("off")
  ax.set_xlim(0, 1); ax.set_ylim(0, 1)               # lay out in 0..1 coords
  fig.savefig(out, dpi=300, transparent=True)        # PNG is exactly 1500x1200
  ```
  If you *want* auto-crop instead, then `bbox_inches="tight", pad_inches=0.15` and
  let the ratio follow the content.
- **Minimalist axes** (when you keep axes): hide `top`/`right`/`left` spines, set
  `bottom` spine to `#585858`, ticks in `WHITE`/`GREY`. Often `ax.axis("off")`.
- **Cards / cells**: rounded `FancyBboxPatch` or `Rectangle`, `facecolor=CARD`,
  `edgecolor=GREY_MID`. Generous uniform padding; one elevation only (no drop
  shadows).
- **Arrows / connectors**: `GREY` (`#9E9E9E`) — reads on both a white preview and
  the dark slide. `arrowstyle="-|>"`.
- **Fills under curves**: line in the accent, `fill_between(..., alpha=0.15)` same
  color (see the archived `generate-important-head.py`).
- **Text**: figure labels are English-only (the deck's split is **Artific for
  English, Roboto/蘭亭黑 for Chinese** — but all zh is added later in Affinity, so a
  figure never needs a CJK font). Keep primary text `WHITE`, secondary `GREY`. One
  `LIME` emphasis max.

## Typeface (Artific — match the deck)

The deck sets English in **Artific Variable** (tokens.md §2). Render figure labels in
it so previews match the slides. Two gotchas the helper below handles:

1. Artific-Variable's *default* axis position is the heaviest instance (Black,
   `wght=900`), and matplotlib <3.10 can't move a variable axis — so left alone it
   renders everything Black. The helper **instances** the font at `wght=400` (Regular,
   the base) **and** `700` (Bold, for real emphasis — no faux-bold), writing the
   statics to the temp dir (no font binary in the repo).
2. Artific has no `∥` (U+2225) glyph — use `||`. `→ − ≈` are present.

Drop this in and call it once before drawing (graceful fallback if the font or
`fonttools` is missing, so the script still runs anywhere):

```python
import os, tempfile
from matplotlib import font_manager

def use_deck_font():
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
    plt.rcParams["font.family"] = family  # Regular base; fontweight="bold" -> the 700 static
    return True
```

## Copy-paste constants block

```python
BG       = "#0A0A0A"   # canvas (save transparent)
CARD     = "#171717"   # card / panel / empty cell
GREY_MID = "#585858"   # borders / rules / brackets
GREY     = "#9E9E9E"   # secondary text / arrows
WHITE    = "#FFFFFF"   # primary text
LIME     = "#D6FB00"   # single text accent + binary "on" cell
CYAN     = "#34E3ED"   # categorical accent
PURPLE   = "#7235FF"   # categorical accent
MAGENTA  = "#FF4EAB"   # categorical accent (4th)
```
