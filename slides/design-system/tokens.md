# tokens.md — Attention Tracker (SITCON 2026)

Descriptive reverse-engineering of Harry's shipped 41-slide deck. Every token
below is grounded in the deck itself; hex values were sampled from the source
PNGs (3840×2160). Ground truth for typefaces + the color families is **slide 1's
own legend** (the "Rosetta Stone" cover, which publishes HEAD/BODY/MONO faces, a
neutral+accent swatch row, and a continuous viridis gradient).

---

## 1. Canvas & grid

- **Aspect / size**: 16:9. Source renders at 3840×2160 (slide 1).
- **Base surface**: flat near-black **`#0A0A0A`** on all content slides
  (sampled slide 1, 9). This is the darkest tier; everything else sits on it.
- **Background grid**: a faint square graph-paper grid is overlaid on the base on
  nearly every content slide (slides 1, 5, 9, 10, 12, 15, 16, 17, 21, 25, 31, 39,
  40). Very low contrast — decorative texture, not a layout grid. This recurs
  deck-wide and is a real shared token; **section dividers replace it** with a
  full-bleed glitch image (see §5).
- **Safe area**: content respects a consistent inset margin from all four edges;
  the footer sits *below* that safe area at the very bottom edge (slide 1). Give
  the footer its own band; do not let content descend into it.
- **Layout skeletons that recur** (see archetypes.md for full list):
  - *Two-zone split*: big left title (~35–40%) + right content column
    (~55–60%), right-biased to a margin (slides 9, 24, 27, 31, 37).
  - *Chart + Key-Insight sidebar*: full-width title, chart left ~65%, numbered
    takeaways right ~30–35% (slides 29, 30, 33, 34, 36).
  - *Left-anchored title block*: title in the lower-left third (covers &
    dividers: slides 1, 4, 11, 26, 38).

---

## 2. Typefaces (three roles) — slide 1 legend, crop-verified

The cover legend wires three labels to three font stacks:

| Role     | Font stack (as printed on slide 1) | Where it's used |
| -------- | ---------------------------------- | --------------- |
| **HEAD** | **Artific Variable, 蘭亭黑** (bold) | Slide/section titles, capsule zh headings, oversized watermark titles, big statement lines. |
| **BODY** | Artific Variable, Roboto           | Body copy, capsule body lines, list items, captions, footer, en subtitles. |
| **MONO** | Fira Code                          | Code/log blocks (7, 13), token labels on attention viz (14, 19), run-config appendices (28, 32, 35), chart axis/titles, the cover easter-egg block. |

HEAD and BODY share the same **Artific Variable** family — HEAD is the bold/heavy
end, BODY the regular end. CJK is carried by **蘭亭黑** (head) / a Han body face;
Latin by Artific Variable + Roboto.

### Type scale — RELATIONAL only (do not fabricate pt/px)
Sizes are never measured; use these relationships:
- **Oversized watermark title** (slides 15, 16, 23, 39-ghost): the largest thing
  on the slide, rendered in a *grey/low-contrast* tier so it reads as a
  background wordmark (~2× a normal slide title). Often bleeds off both edges.
- **Section title** (about-name 2; capsule-list left title 9/24/37): ~2–3× body,
  heaviest weight, high-contrast white.
- **Slide title** (data-viz top bar 29/36): ~2× body, heavier.
- **Capsule zh heading**: ~1.4× body, bold white.
- **Capsule en subtitle**: ~body or smaller, grey.
- **Body / statement line**: the 1× base.
- **Footer / caption / axis label**: smallest, grey.

### Mixed-script rule (CJK + Latin)
Latin runs (LLM, Attention Tracker, API, Focus Score, K, 36.8%) sit **inline**
within CJK runs with visible word-spacing around them (slides 1, 2, 5, 24, 40).
Fullwidth CJK punctuation is used throughout: 、＆：，。「」 and the fullwidth
vertical bar ｜ as a separator ("Harry｜張祺煒", slide 1).

---

## 3. Color tiers

### 3a. Neutral tier (the workhorse) — cover swatch row + samples
| Token | Hex | Role |
| ----- | --- | ---- |
| Canvas | `#0A0A0A` | Base background (all content slides). |
| Surface / card | `#171717` | Raised capsule/panel/chip fill (sampled slide 9). Chart plot areas read even darker (~pure black). |
| Grey-mid | `#585858` | Mid neutral (declared swatch). |
| Grey-light | `#9E9E9E` | Secondary/dim text & labels (declared swatch). |
| White | `#FFFFFF` | Primary text. |

**The two-tier foreground rule (deck-wide).** Every text cluster splits into
**white = primary / grey = secondary**. Instances:
- Title L1 white / L2 grey (cover slide 1; data-viz title splits 29/30/32/33/36).
- Section kicker "Section 0X." grey / CJK title white (4, 11, 26, 38).
- Capsule zh heading white / en subtitle grey / body grey (9, 27, 31, 37).
- Statement bold-white lead / grey follow-up (12, 25).
- Metadata: grey labels / white values (cover slide 1).

### 3b. Lime — the single TEXT accent
- **Lime `#D6FB00`** (sampled slides 5 & 40; identical to cover swatch). This is
  the deck's signature and the **only** color used for **text emphasis**: the
  36.8% figure (5), the payoff/question line (10, 17), the CTA imperative line
  (40). Reserve lime for one emphasis run per statement; never use the other
  chromatic accents for text emphasis.
- Lime also appears as a non-text device: dashed **border/frame** (13 outer
  frame; 22 & 34 selection rings), highlight boxes on the attention matrix (19),
  and the aggregation bracket + node chips on the Focus-Score diagram (23).
  Same token, different application — note lime-as-text (10) vs lime-as-border
  (13) is a deliberate dual use.

### 3c. Categorical accent set — DECLARED on the cover, data tier only
The cover swatch row publishes four chromatic accents. Sampling slides 29 & 36
chart series returns these **exact** hexes (token-identity confirmed, not
inferred):

| Token | Hex | Categorical use |
| ----- | --- | --------------- |
| Purple | `#7235FF` | data series / per-head color |
| Magenta | `#FF4EAB` | data series / per-head color |
| Cyan | `#34E3ED` | data series / per-head color |
| Lime | `#D6FB00` | data series (doubles as the text accent) |

Used as a categorical palette for multi-series charts (29/30 series 正常/後端/
前端/中間; 36 series 無前綴/布林/推理鏈/無意義) and for per-head coloring on the
multi-head annotation (15). **These are system tokens, not off-system** — they
are on the cover legend. The rule is *role separation*: lime alone does text
emphasis; the full four-color set does categorical data.

### 3d. Viridis ramp — a SEPARATE cover-declared family (heatmap / danger↔safe)
The cover also prints a continuous gradient (distinct from the discrete
swatches). Sampled left→right:

`#350B4C` (dark purple) → `#404683` → `#3A799B` → `#34979A` (teal) →
`#2DB492` → `#84DB45` → `#B8EF18` (lime-yellow).

- **Semantics**: dark purple = **low / 不關注 / danger**; lime-yellow = **high /
  很關注 / safe**. Legend-confirmed on slides 14 & 19 (不關注→很關注) and
  polar-labeled on 20 (低分=危險 ↔ 高分=安全).
- **Uses**: attention-matrix heatmaps (14, 19), layer heatmap thumbnails (16),
  the cross-lingual heatmap + colorbar (33, 34), and its **endpoints as a
  danger/safe pair** for distribution curves (20, 21, 22, 23 outcomes).
- **Keep distinct from the categorical accents.** There are two purples and two
  limes and they are **different tokens**:
  - viridis-low `#350B4C` ≠ categorical purple `#7235FF`
  - viridis-high `#B8EF18` ≠ accent lime `#D6FB00`
  Do not merge them.

### 3e. Off-system exceptions (flag, do not canonize)
- **Slide 7** code syntax highlighting uses **red/green** for fake `<thinking>`
  tags and a curl command — red is NOT in any declared swatch → genuinely
  off-palette. This is the only true exception.
- (Slides 15 and 36 are *not* exceptions — they draw from the declared
  categorical set §3c. This tightens earlier "off-system" notes.)

---

## 4. Footer & pagination (shared component)

A single footer band spans the full width at the very bottom edge of **every**
slide (slides 1–41). Small grey BODY type. Three zones:

```
[ SITCON 2026 ]            [ N/41 ]            [ Section Label ]
   left, fixed          center, page count      right, per-section
```

- **Left**: constant `SITCON 2026`.
- **Center**: `N/41` current-page count.
- **Right**: the **section label**, constant across all slides in a section:
  - Cover / About / Outline (1–3, each their own)
  - `The Injection Threat` (4–10)
  - `How LLMs "Listen"` (11–13)
  - `The Attention Tracker` (14–25)
  - `Exp 1: Context Length` (26–31)
  - `Exp 2: Cross-Language` (32) *(label carried inconsistently — see bugs)*
  - `Exp 3: Forced Prefixes` (33–36)
  - `Conclusions` (37–40)
  - `Resources` (41)
- Over glitch dividers the footer loses contrast (4, 26, 38) — accidental, not a
  style choice.

### 4b. Two other running labels — do NOT confuse with the footer
- **Section kicker** "Section 0X." — grey Latin eyebrow *inside* the title block
  on section dividers (01→04 on slides 4, 11, 26, 38). Part of the divider
  content, unrelated to the footer.
- **Top-center tag** "LLM Visualization" — a tiny dim label with a leading icon
  pinned top-center on the interactive-viz slides (11, 14). A running
  tool/section marker distinct from both the footer-right label and the kicker.

---

## 5. Section-divider background (special token)
Section dividers replace the flat `#0A0A0A`+grid base with a **full-bleed
glitch / datamosh image**: horizontal RGB-scanline smear in magenta / cyan /
green / violet over dark (slides 4, 11, 26, 38). This is chromatic *noise*, NOT
the viridis ramp — do not treat its colors as tokens. It is the signature that
says "section boundary". Strongly implies an animated transition.

---

## 6. Spacing & elevation (relational)
- **Elevation**: exactly two surface levels — canvas `#0A0A0A` and card/panel
  `#171717`, the latter with rounded corners + subtle border. Chips, capsules,
  chat bubbles, chart legend pills, and resource panels all share this one card
  tier. No third elevation observed.
- **Corners**: consistently rounded on all card-like surfaces (capsules, bubbles,
  pills, panels).
- **Gutters**: capsule stacks use uniform vertical gaps; small-multiple walls
  (21, 22) use tight uniform gutters running to the edges.
- Precise radii/padding/gap values are not measurable from the stills; keep them
  uniform per slide and generous inside cards.

---

## 7. Known deck bugs affecting tokens/labels (see SYSTEM.md for the full list)
- Footer `Exp 3: Forced Prefixes` appears on 33/34 whose content is
  cross-language (section-label mismatch).
- Fullwidth `？` (25) vs halfwidth `?` (26, 4) — punctuation-width inconsistency.
