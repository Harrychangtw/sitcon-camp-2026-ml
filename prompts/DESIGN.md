# Design language — Course 2 stations

The stations should look like Harry's deck + figures for this course (and the
`harrychang.me` portfolio): a **near-black, editorial, monospace-labelled**
surface with a **neon-lime focus accent** and a small cyan/purple categorical
palette. This file translates that system into concrete, camp-repo guidance.
Every station prompt points here; follow it **when possible** without breaking
the golden rules (`CLAUDE.md`) or the package boundaries.

The camp repo shares its own tokens through **`@camp/ui`** (`src/theme.css` +
`tailwind-preset.cjs`) — so we **retune those tokens** to this palette, we don't
hard-code colors in stations.

## The palette (from the course deck + figures)

```
#0A0A0A  near-black   → background        --camp-bg:       10 10 10
#171717  off-black    → panel / card      --camp-panel:    23 23 23
#585858  dim grey     → borders / strokes --camp-border:   88 88 88
#9E9E9E  mid grey     → muted / secondary --camp-muted:    158 158 158
#FFFFFF  white        → foreground        --camp-fg:       255 255 255
#D6FB00  neon lime    → accent (FOCUS)    --camp-accent:   214 251 0   (accent-fg: 10 10 10)
#34E3ED  cyan         → category 2        (optional --camp-accent-2:  52 227 237)
#7235FF  purple       → category 3        (optional --camp-accent-3: 114 53 255)
```

Values on the right are camp's space-separated RGB channels for
`@camp/ui/src/theme.css`. Keep `--camp-positive` / `--camp-warning` as-is. The
deck is dark-first; treat dark as the primary surface. (If the app keeps a light
class, invert bg/fg and darken the accent for contrast — but dark is canonical.)

## The one-time task: retune `@camp/ui` tokens (do it in the first session)

`@camp/ui/src/theme.css` currently ships an indigo/slate theme. Align its `.dark`
block to the palette above **once**. This is a shared surface (like `Heatmap`):
the first station session that runs (`01-tokenizer`) does it; **later sessions
verify it's already done and don't redo it.**

- Set `--camp-bg / panel / border / muted / fg / accent / accent-fg` to the
  values above.
- Add the two categorical hues as `--camp-accent-2` (cyan) and `--camp-accent-3`
  (purple), and expose them in `tailwind-preset.cjs` (e.g. `accent2`, `accent3`)
  so viz primitives can reference them as utilities/props.

**Fonts:** the deck uses IBM Plex Sans (body) + a mono face for labels + a
proprietary display face (**do not** require it). In `@camp/ui`: prefer **IBM
Plex Sans** for the sans role, keep the existing CJK fallbacks (`Noto Sans TC`,
`PingFang TC`) — audience is Taiwanese; keep the **mono** role for micro-labels.
The *idioms* below matter more than the exact typeface — don't block on fonts.

## Class idioms (mirror the deck + existing `StationLayout`)

`StationLayout` already speaks this dialect (its `takeaway` label is
`font-mono text-xs uppercase tracking-wide text-accent`). Extend it into bodies:

- **Headings / section titles:** `font-semibold uppercase tracking-wider`.
- **Micro-labels (indices, tags, ids, timestamps, axis labels):**
  `font-mono text-xs uppercase tracking-wide text-muted`. Zero-pad indices: `01`.
- **Dividers:** thin hairlines — `border-border` between blocks,
  `border-border/30` for subtle sub-rules. Prefer borders over shadows.
- **Radius:** small and consistent (`rounded-md`). Chips/swatches are square-ish
  thin-bordered cards (`border border-border`).
- **Surface:** everything on `bg-bg` (near-black) with `text-fg`; secondary copy
  `text-muted`; panels/rails `bg-panel`.
- **Whitespace:** generous, editorial; align to a grid.

## The accent rules (most important for the canvases)

**Lime is the focus accent — it means "the thing under attention."** Cyan and
purple are the **categorical** palette, used only when a viz must distinguish
groups. Everything else is greyscale on near-black.

- Base marks (points, chips, tokens, cells, links) render in `fg`/`muted` greys.
- **Lime (`accent`)** is reserved for the **focused / selected / active** element:
  the searched word + neighbours, the hovered token's attention links, the argmax
  next-token, the current RNN step, the BPE split under inspection. At most one
  "hot" thing at a time.
- **Cyan + purple** encode *category*, not focus — e.g. embedding clusters,
  attention heads, distinct series. Use sparingly (2–3 groups); don't rainbow.
- Encode magnitude with **opacity / width**, not extra hues (mirror the deck's
  distribution bars: one color, height/opacity = strength).
- Heatmaps: a single-hue ramp (near-black → lime) reads on-brand; for signed
  values use a restrained diverging scale (e.g. purple ↔ lime through grey),
  colorblind-safe. **Read colors from theme vars** (`var(--camp-accent)`, …) or
  take them as props — do **not** hard-code hexes inside `@camp/viz` primitives.

## Motion (restrained, always optional)

- Subtle only: fade-in / slide-up on mount; quick hover feedback
  (`hover:opacity-90 transition-opacity`). Easing `cubic-bezier(0.22,1,0.36,1)`,
  ~300–500ms.
- **Respect `prefers-reduced-motion: reduce`** — gate any nontrivial animation.
- Motion is polish, never required for the lesson to read.

## Checklist (each station is checked against this by `prompts/validate.md`)

- [ ] `@camp/ui` tokens match the palette above (near-black bg, lime accent, cyan
      + purple categoricals); done once, not per-station.
- [ ] Station uses theme utilities (`bg-bg`/`text-fg`/`text-muted`/`accent`/
      `border-border`) — **no hard-coded hexes** in the `.tsx`.
- [ ] Micro-labels are mono / uppercase / tracked; headings uppercase + tracked.
- [ ] Lime marks only the focused/active element; categories use cyan/purple;
      base marks are greyscale.
- [ ] Viz primitives read colors from theme vars/props, not hard-coded hues.
- [ ] Any motion respects `prefers-reduced-motion`.
