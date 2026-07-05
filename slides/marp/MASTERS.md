# MASTERS.md - geometry contract for the Affinity masters

The single spec both sides obey. The Marp theme (`themes/camp-dark.css`) draws
its title band, content area and footer at exactly these coordinates; Harry's
Affinity art must agree or titles/footers float off the art.

**Artboard = 3840 x 2160. The theme's slide size is the same 3840 x 2160, so
everything here is 1:1. No scaling math anywhere.** All coordinates below are
px on that artboard, origin top-left.

## 1. Safe margin (every slide)

- **Uniform 100px margin on all four edges.** All slide content lives inside
  x 100..3740, y 100..2060.
- **The only exception is the footer.** The master page number and the section
  indicator sit in the bottom 100px margin band (y 2060..2160). Nothing else
  (no title, no body element, no art text) may enter any margin band.

## 2. Title zone (content pages)

| Property | Value |
|---|---|
| x, y | 100, 100 |
| width, height | 3640 x 400 |
| Alignment | top-left, left-aligned |

The theme pins `h1` here: white title 132px (Artific Bold, wght 700),
optional grey second tier 68px below it. Capacity: a 2-line title, **or**
1 line + the grey L2 line. Content never enters this band; it starts below.

## 3. Content area (content pages)

| Property | Value |
|---|---|
| x, y | 100, 560 |
| width, height | 3640 x 1500 |

(560 = margin 100 + title zone 400 + 60 gap. Bottom edge 2060 = top of the
footer band.) Body copy, lists, figures, code blocks all live here.

## 4. Footer band (every slide, incl. set-pieces)

The one element allowed in the margin band. Text is vertically centered in
y 2060..2160 (center line y 2110), grey `#9E9E9E`, 40px BODY type:

| Zone | Content | Anchor |
|---|---|---|
| Left | `SITCON Camp 2026` (constant) | left edge at x 100 |
| Center | `N / TT` page count | centered on x 1920 |
| Right | section label (per section) | right edge at x 3740 |

Marp draws all three zones on top of every slide, including over set-piece
art. **Keep the footer band visually quiet in the art** (no bright detail in
y 2060..2160) so the grey text stays legible.

## 5. Set-piece masters (the only Affinity art)

Only three page types get custom art. **Content pages need no master**; they
are flat `#0A0A0A` from the theme.

| File (in `assets/bg/`) | Page | Art contains | Marp draws on top |
|---|---|---|---|
| `cover.png` | cover / title | everything: course title, speaker, date, decoration | footer only |
| `toc.png` | outline | everything: agenda text, decoration | footer only |
| `divider.png` | section dividers | full-bleed glitch/datamosh background, **no text** | footer + the section kicker and question (below) |

### Divider overlay (what Marp puts on the art)

Marp overlays a lower-left text block on `divider.png`:

- Grey kicker `Section 0X.` : 72px, `#9E9E9E`, at x 100.
- White question line: 190px Artific/Noto Bold, at x 100.
- The block sits bottom-aligned at **y 1860** (300px above the bottom edge)
  and can extend upward to roughly **y 1300** for a 2-line question.

**Keep the region x 100..3740, y 1300..1900 low-contrast/quiet** in the art so
the overlay stays legible. The rest of the canvas is free.

One `divider.png` is shared by all sections. If a section ever wants its own
art, export `divider-0X.png` and the slide overrides it with
`![bg cover](../assets/bg/divider-0X.png)`; no theme change needed.

## 6. Export instructions (Affinity → repo)

- One PNG per set-piece: **3840 x 2160, full-bleed, sRGB**.
- Opaque is fine (the art replaces the canvas). Transparency is only useful if
  you want the theme's flat `#0A0A0A` to show through.
- Filenames exactly as in the table above, dropped into
  `slides/marp/assets/bg/`. They swap in by filename; no markdown/theme edits
  needed. Then delete the marked `PLACEHOLDER CHROME` block at the bottom of
  `themes/camp-dark.css` (it labels the empty canvas until the art exists).
- Colors must come from `slides/figures/PALETTE.md` (canvas `#0A0A0A`, card
  `#171717`, greys `#585858`/`#9E9E9E`, lime `#D6FB00`; the divider glitch
  smear is chromatic noise, not palette tokens, per the old deck).
