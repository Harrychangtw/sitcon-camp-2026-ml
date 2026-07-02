# SYSTEM.md — Attention Tracker design system (SITCON 2026)

Descriptive reverse-engineering of Harry's shipped 41-slide deck ("打開 LLM 的
腦袋找內鬼"). This describes **what exists**; it does not redesign, invent tokens,
or build a slide framework. Ground truth for tokens is **slide 1's own legend**,
which literally publishes the deck's typefaces + color swatches.

## Mental model (read this first)

A **dark, editorial, engineering-lab** deck. One flat near-black canvas
(`#0A0A0A`) + a faint square grid; one raised card tier (`#171717`). Text is
almost always a **two-tier split — white (primary) over grey (secondary)** — and
that split scales from title→subtitle down to inside every capsule. **Lime
`#D6FB00` is the one text-emphasis accent**, spent sparingly on the payoff word or
number. Data gets its own declared color language: a **categorical 4-accent set**
(purple/magenta/cyan/lime) for multi-series charts, and a **viridis ramp**
(purple=low/danger → lime-yellow=high/safe) for heatmaps and normal-vs-attack
distributions. Sections open with a **full-bleed glitch/datamosh divider** and are
tracked by a persistent 3-zone **footer** (`SITCON 2026 · N/41 · <section>`).

Content is built from a small kit of components — dominated by the **capsule**
(icon + zh heading + optional en subtitle + one body line, in a rounded card) —
arranged into ~13 recurring **archetypes**. Teaching rhythm is
statement → visualization → capsule-recap, looping per experiment.

## The rules that matter most
1. **Two-tier foreground everywhere**: white = primary, grey = secondary. Never
   two equal full-contrast lines where one should recede.
2. **Lime is for one text emphasis at a time** — and only text. The other three
   accents are never used for text emphasis.
3. **Never blow up a stat** — inline it at body size, recolor it lime (slide 5).
   There is no big-stat archetype.
4. **Two color families, kept apart**: categorical accents ≠ viridis. Two
   purples, two limes, distinct tokens (tokens.md §3c/§3d).
5. **Capsule canonical = slide 9** (icon-left, zh + en + one body line, no
   divider). All other capsules are named variants of it (components.md §4).
6. **Sections**: glitch divider + constant footer-right label.

## Canonical decisions made (where the deck contradicts itself)
- **Capsule canonical = slide 9** (all four slots, icon-left). Horizontal+vertical-
  divider (24/27/31/37) is the most-shipped sub-form; zh-only (24), vertical (39),
  numbered (19), thumbnail (16) are named variants; slide 8's mixed-language
  headings are the anti-pattern.
- **Categorical palette is IN the system**, not off-system: slides 29 & 36 chart
  series sample to the exact cover swatches (#7235FF/#FF4EAB/#34E3ED/#D6FB00).
  So 15 and 36 are on-system (categorical tier); only **slide 7's red/green code
  highlighting is genuinely off-palette** (red is on no swatch).
- **Viridis danger/safe pair** (20/21/23 outcomes) uses viridis *endpoints*, a
  real cross-slide semantic token — distinct from the categorical purple/lime.
- **Edge archetype calls confirmed**: slide 5 = statement (not big-stat); slide 2
  = about/bio; slide 3 = outline/TOC. No standalone comparison-columns slide.

## Deck bugs — flagged, NOT fixed (describe as-is)
| Slide | Bug |
|-------|-----|
| 19 | Capsules 01 & 02 share the same en subtitle "Last Token View" (copy/paste slip; 02 is about the System-Prompt column). |
| 27 | "多國語言/Language" capsule body is verbatim slide 24's "零耗算力" body — leftover placeholder, unrelated to multilingual content. |
| 32 | Title reads "誇語言" (誇) vs "跨語" (跨) used on 33/34. |
| 35 | Mono config reads "tempature" (typo for temperature). |
| 33, 34 | Footer says "Exp 3: Forced Prefixes" but content is a cross-language heatmap (section-label mismatch). |
| 25 vs 26/4 | Fullwidth "？" (25) vs halfwidth "?" (26, 4) — punctuation-width inconsistency. |
| 33 | Heatmap in-chart title renders doubled/jittered (source-PNG artifact; clean on 34). |
| 9 | en subtitle "Output Sandboxing" pairs with 執行沙盒 (lit. execution sandbox) — copy mismatch, transcribed as-is. |
| 37 | Capsule-3 icon is a photographic/face emoji vs flat glyphs on the others (icon-style inconsistency). |

## Index
- **tokens.md** — canvas/grid, the 3 typefaces (HEAD/BODY/MONO, from slide 1),
  neutral tier + lime text accent + categorical accents + viridis ramp (with
  sampled hex), footer/pagination + the two other running-label systems,
  divider-background token, spacing/elevation.
- **components.md** — every component: purpose, anatomy, copy-ready skeleton,
  grid placement, do/don't, refs. The **CAPSULE** section (§4) fixes the canonical
  anatomy and documents all six variants.
- **archetypes.md** — every archetype with a fill-in skeleton, plus the
  **master map** of all 41 slides → archetype + section label.

## Provenance
Hex values sampled from source PNGs at 3840×2160
(`slides/reference/attention-tracker-2026/png/`). Type sizes are given as
relationships (e.g. "title ~2× body"), never fabricated pt/px. Typeface names and
color families are transcribed from slide 1's on-slide legend.
