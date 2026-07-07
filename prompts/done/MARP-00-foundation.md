# Session: Marp **foundation** for the Course 2 deck (theme + contract)

> Paste this whole file into a fresh Claude Code session at the repo root. It is
> self-contained. Deliverable: a `slides/marp/` project that renders the Course 2
> deck with **marp-cli**, a **simple `camp-dark` theme** that borrows tokens from
> `slides/design-system/`, and two contract files the content phase depends on —
> **`COOKBOOK.md`** (archetype → Marp markdown) and **`MASTERS.md`** (the geometry
> Harry's Affinity backgrounds obey). You do **not** write lesson content here;
> `prompts/MARP-01-content-overhaul.md` does that against your outputs.

## Why this exists (read before you touch anything)

The Course 2 deck is migrating off hand-laid Affinity onto Marp so the content
becomes a plain-markdown surface an agent can rewrite. `slides/design-system/` is
a full reverse-engineering of Harry's shipped "Attention Tracker" deck — but the
new deck is deliberately **much simpler**. Use the design system as a **token
reference** (colors, fonts, footer, the two-tier white/grey split, the single
lime accent), **not** a build target: do **not** reproduce the capsule / data-viz
archetype machinery as the deck's backbone. Your job is to build a simple,
text-forward theme and to publish the **authoring contract** the content rewrite
consumes — not to redesign tokens and not to write slides.

The single most important output is the **COOKBOOK**. The content phase fans out
one Opus subagent per section; without a shared, worked contract they produce six
visual dialects. Treat `COOKBOOK.md` as the real deliverable and the theme CSS as
what makes it real.

## Architecture decision — already made, do not re-open

**Custom theme + Marp CLI engine API. No fork of Marp.** Every feature below is a
theme-CSS or directive concern:

- Top-left title → theme CSS.
- Affinity backgrounds → native `![bg]` directive + per-`class` background images.
- Per-script fonts → `@font-face` + font-family fallback ordering.
- Any future markdown extension → Marp CLI's **custom engine**
  (`marp.config.js` exporting an engine that calls `marp.use(markdownItPlugin)`),
  which extends Marp without forking.

You may `git clone` marp-core / marpit into a scratch dir **for reading only** to
confirm theme mechanics. A true source fork is a last resort — take it only if a
required *markdown-to-HTML transform* is provably impossible via a markdown-it
plugin through the engine API, and document why. It is almost certainly not
needed.

## Step 0 — Read first (in this order)

1. `prompts/MARP-README.md` — the two-phase plan and the decisions already made.
2. `slides/figures/PALETTE.md` — the **canonical color source**: exact hexes as
   named constants (`BG #0A0A0A`, `CARD #171717`, `GREY`, `LIME #D6FB00`, the
   categorical `CYAN`/`PURPLE`/`MAGENTA`, the viridis ramp) + the **Artific
   variable-font gotcha** (its default instance is the Black weight). The theme's
   color vars come straight from here.
3. `slides/design-system/SYSTEM.md`, `tokens.md` — the **token reference** (fonts
   `§2`, footer/pagination `§4`, dividers `§5`, the two-tier split, the single
   lime accent). `components.md` / `archetypes.md` describe the *old, richer* deck
   — read them for the footer + type conventions, but the new theme only needs a
   **small, simple** archetype set (Step 5), not all of them.
4. `slides/decks/course2.md` — the Course 2 content (Affinity-era). You are **not**
   converting it here; skim it only to gauge the kinds of slides the deck needs
   (titles, short statements, lists, comparisons, a few figures, station hand-offs,
   dividers). These map onto the **small, simple** COOKBOOK set in Step 5 — you do
   not need the old deck's richer archetypes (capsule-list, data-viz sidebars,
   experiment-intro, annotated-sentence).
5. `slides/reference/attention-tracker-2026/png/` — the shipped look, for the
   *token language* only (dark canvas, two-tier text, lime accent, footer). The
   new deck is simpler; do not copy its capsule/data-viz layouts.
6. Marp docs, confirm mechanics as you go: `marpit.marp.app/theme-css`,
   `/image-syntax`, `/directives`, and the marp-cli README (theme-set, config,
   engine, watch/preview/export). The docs site is client-rendered; fetch the raw
   markdown under `github.com/marp-team/marpit/tree/main/docs` if a fetch returns
   only a title.

## Step 1 — Scaffold `slides/marp/`

Create a self-contained Node project (pnpm; this repo already uses pnpm
workspaces — a standalone `slides/marp/package.json` with its own `devDependencies`
is fine, keep it out of the workspace build graph unless trivial to add).

```
slides/marp/
  package.json          # devDep: @marp-team/marp-cli ; scripts below
  marp.config.js        # themeSet: ./themes ; html: true ; allowLocalFiles for export
  themes/
    camp-dark.css       # the theme (Step 2)
  assets/
    fonts/              # Artific Variable (local copy or documented path) + Noto Sans TC + Fira Code
    bg/                 # Affinity master PNGs land here; ship CSS-rendered placeholders until they do
  COOKBOOK.md           # Step 5 — the authoring contract (the real deliverable)
  MASTERS.md            # Step 4 — geometry spec for Harry's Affinity art
  deck/
    _sample.md          # Step 6 — 3 sample slides proving the theme; NOT lesson content
  README.md             # how to preview/export, where content goes, font/licensing notes
```

Scripts in `package.json`:
- `preview` → `marp -w -p deck/ --config marp.config.js` (watch + preview window).
- `pdf` → `marp deck/<file>.md -o out/<file>.pdf --allow-local-files` (Chromium export).
- `html` → `marp deck/<file>.md -o out/<file>.html --allow-local-files`.

Confirm marp-cli runs and renders `_sample.md` before moving on.

## Step 2 — Theme `camp-dark.css` (simple, token-driven)

`/* @theme camp-dark */` at the top. `section` = one slide. **Keep it simple** —
the default slide is a clean dark canvas + a top-left title band + a body area +
the footer. No capsule/card machinery by default. Set the canonical slide size to
**3840×2160** (absolute units only — Marpit forbids relative sizes) so it maps
**1:1** to Harry's Affinity artboard and the 100px margin means the same 100px in
both (see Step 4). Marpit scales that logical size responsively, so the large px
values are fine.

- **Color tokens as CSS vars**, straight from `slides/figures/PALETTE.md` (the
  canonical source): `--bg #0A0A0A`, `--card #171717`, `--grey-mid #585858`,
  `--grey #9E9E9E`, `--white #FFFFFF`, `--lime #D6FB00`, categorical
  `--cyan #34E3ED` / `--purple #7235FF` / `--magenta #FF4EAB`, and the viridis
  ramp endpoints (for figures). Base canvas is flat `--bg`; a faint grid is
  optional and off by default (keep it simple).
- **Two-tier foreground** (white = primary, grey = secondary): a small utility for
  the grey tier (e.g. `.l2`, or an `em`/blockquote convention). Used everywhere so
  headings/sub-lines read as a hierarchy, not two equal lines.
- **Lime = the single text accent**: one inline convention (e.g. `**strong**` →
  lime, or a `.lime` span) reserved for **one emphasis run per statement**. Never
  wire the categorical accents to text; those are for figures only.
- **Three type roles** (`tokens.md §2`): HEAD/BODY = Artific Variable, CJK = Noto
  Sans TC, MONO = Fira Code (Step 3c). Keep the scale modest — one title size, one
  body size, one small/caption size. Text-forward, generous whitespace.
- **Footer + pagination** (`tokens.md §4`): a persistent three-zone footer
  `[ SITCON Camp 2026 ] [ N / TT ] [ section label ]`, small grey type. Center =
  Marpit pagination: `section::after { content: attr(data-marpit-pagination) ' / '
  attr(data-marpit-pagination-total); }` driven by `paginate: true`. Left is
  constant; the right section label is set per-slide by the content phase. Per
  Harry's Affinity spec, the footer (page number + section indicator) is the **one
  thing allowed to sit in the 100px margin band** — everything else stays inside
  it (Step 4).
- **Optional capsule component** (only if a slide genuinely wants it): a simple
  `--card` block with rounded corners + subtle border. Provide it as an available
  HTML pattern (`html: true` passes HTML through), but it is **not** the deck's
  backbone — most slides are plain title + text. Do not force content into cards.
- **Set-piece classes** (`section.cover`, `section.toc`, `section.divider`): these
  pages get **custom Affinity backgrounds** (Step 3b), so their class mainly wires
  the full-bleed background + suppresses the default content chrome. A divider may
  overlay a grey "Section 0X." kicker + white question; cover/TOC are usually the
  Affinity art alone.

Render `_sample.md` and sanity-check legibility + the footer; you are matching the
*token language*, not reproducing the old capsule-heavy layouts.

## Step 3 — The three features Harry asked for

### 3a. Title anchored top-left (with a reserved band)
Auto-Marp titles sit at a consistent left x but drift vertically with content.
Pin them. Reserve a **title band** at the top of `section` and place `h1` top-left
inside it (left-aligned, two-tier white-over-grey supported), with slide content
flowing **below** the band so an absolute title never overlaps body. The title
band's height/inset **must equal the title zone in `MASTERS.md` (Step 4)** so the
CSS title and any Affinity title art register exactly. Verify at both a short
title and a two-line title.

### 3b. Custom backgrounds — only the set-piece pages
Only **three page types** get custom Affinity art: **cover/title**, **outline
(TOC)**, and **section dividers**. Every **content** page uses the simple
theme-rendered background (flat `--bg`) — no Affinity asset. Wire two paths:
- **Per class**, for set-pieces: `section.cover`, `section.toc`, `section.divider`
  each get their Affinity PNG via CSS `background-image` (`background-size: cover`,
  full-bleed 3840×2160). This is how the Affinity art sits behind (or as) the
  slide.
- **Per slide**, one-off: the native `![bg cover](assets/bg/foo.png)` directive
  for any other full-bleed image.

Ship **CSS-rendered placeholders** now (a flat dark panel with the intended label
for each set-piece class) so the deck renders end-to-end **before** the Affinity
PNGs exist. When Harry drops real art in `assets/bg/`, it swaps in by filename with
no content change. Note in the theme/README: split and CSS-filtered backgrounds
require Marp's inline-SVG mode; a single full-bleed background does not, so we
avoid depending on it.

Export needs `--allow-local-files` for local background/image paths — bake it
into the `pdf`/`html` scripts.

### 3c. Fonts — Artific (Latin) / Noto Sans TC (zh-TW) / Fira Code (mono)
Set three roles matching `tokens.md §2`. `@font-face` each and order font-family
so Latin glyphs resolve to Artific and Han glyphs fall through to Noto:
`font-family: 'Artific Variable', 'Noto Sans TC', sans-serif;` (browser uses each
font for the glyphs it has — this is how "English = Artific, 中文 = Noto" works
from one declaration).

- **Artific Variable (Latin, HEAD + BODY).** It is a **variable font with two
  axes whose default instance is the Black weight** — if you `@font-face` it and
  set nothing, everything renders heavy. You **must** pin the weight per role:
  inspect the axes first (`fonttools`: `ttx -l` / dump `fvar` to read the axis
  tags + ranges), then either declare named `@font-face` instances per weight or
  set `font-variation-settings: 'wght' <n>` explicitly on each role. Target:
  BODY ≈ Regular (400), HEAD ≈ Bold (700) per `tokens.md §2`; confirm the exact
  usable `wght` values from `fvar` and set the second axis to its intended
  default. Do not rely on `font-weight: bold` alone.
  Artific lives at `~/Library/Fonts/Artific-Variable.ttf` (see
  `figures/PALETTE.md`). It is a **paid/custom font** — for portable HTML you must
  embed it via `@font-face`; flag the licensing question in the README and do
  **not** commit the binary if that is unresolved (Chromium PDF/PNG export uses
  the locally installed copy without embedding).
- **Noto Sans TC (zh-TW).** Free and embeddable — the clean sans that pairs with
  Roboto. Vendor the weights you use into `assets/fonts/` (or a documented
  `@font-face` source) so zh renders identically on any machine.
- **Fira Code (MONO).** Code/log/token-label/config role (`tokens.md §2`). Harry
  wants it **tracked tighter — target −30% tracking** from his Affinity build.
  CSS `letter-spacing` takes no `%`, so express it as a negative em value on the
  mono role and **tune it to match the reference deck visually** (start around
  `-0.03em` and adjust — Affinity's tracking-% and CSS em are different units, so
  match by eye, not by number). Marked "if possible," so if it fights ligatures
  or readability, back off and note it.

## Step 4 — `MASTERS.md` (geometry contract for Affinity)

The theme's CSS bands and Harry's Affinity art must agree pixel-for-pixel or the
title/footer floats off the art. Write the single geometry spec both obey, on
Harry's **native 3840×2160 artboard** (the theme's slide size = the same
3840×2160, so it is **1:1 — no scaling math**):

- **Uniform 100px safe margin on all four edges.** *All* slide content lives
  inside this margin.
- **The only exceptions** (the sole things allowed in the 100px margin band, from
  Harry's Affinity master config): the master **page number** (left / center) and
  the **section indicator** (right) — i.e. the footer. Everything else, including
  every title and body element, stays inside the margin.
- **Title zone** — x/y/width/height of the top-left title band (matches Step 3a),
  its top edge on the 100px inset.
- **Footer band** — y-position + the page-number and section-indicator x-positions
  (matches Step 2 footer); this is the element that sits in the margin band.
- **Content area** — the inside-the-margin region body content occupies (default:
  below the title band to above the footer).
- **Set-piece masters only** (`cover`, `toc`, `divider`): what the Affinity art
  contains vs. what Marp draws on top (e.g. divider = full-bleed art + Marp
  overlays the kicker/question; cover/TOC = Affinity art alone). **Content pages
  need no master** — they are flat `--bg` from the theme.
- Export instructions: full-bleed 3840×2160 PNG per set-piece, transparent where
  Marp draws over it, target filenames in `assets/bg/`, color space, and the
  "match `slides/figures/PALETTE.md`" reminder.

This file is what Harry follows in Affinity; make it unambiguous.

## Step 5 — `COOKBOOK.md` (the authoring contract — primary deliverable)

Give a copy-paste recipe per archetype the content phase stamps out. Keep the set
**small and simple** — this deck is text-forward, not capsule-heavy. Each entry:

1. **Archetype name** + when to use it (one line).
2. The **exact Marp markdown + directives + theme class** that renders it —
   which `class`/`_class` to set, how the footer section-label is set, how the
   two-tier white/grey split is written, and how the single lime run is marked.
3. A **rendered example** (a real slide in `deck/_sample.md`, exported to
   `out/_sample.pdf`) so a subagent sees the target, not guesses.
4. **Do/Don't** notes (one lime run per statement; stats inline at body size in
   lime, never blown up; keep it minimal).

Cover this **simple set** (add a capsule recipe as *optional*, clearly marked):
- **cover / title** — Affinity background (`section.cover`), text in a comment.
- **outline / TOC** — Affinity background (`section.toc`), text in a comment.
- **section-divider** — Affinity background (`section.divider`) + Marp overlay of
  the grey "Section 0X." kicker + white section question.
- **title + body** — the workhorse: a cue-like title + short body (fragments,
  keywords, one idea). Most slides are this.
- **list / checklist** — denny prefers these over paragraphs.
- **contrast pair** — two-column before/after or A-vs-B ("contrast before
  definition").
- **code / command** — Fira Code block (mono), for commands/tokens/config.
- **figure** — a full or captioned image from `slides/figures/`.
- **station hand-off** — short framing slide that poses the question students
  explore in the tool (the teaching happens in the tool, not the slide).
- **resources** — link-first / artifact-first closing slide.
- *(optional)* **capsule** — the `--card` block, only where a slide truly wants it.

Also document the **shared conventions** every content subagent follows:
- how to set the per-section **footer section label**;
- how to place a **figure** from `slides/figures/`;
- how to mark a **station hand-off** slide;
- **presenter notes** — the connective/self-study explanation goes in Marp
  presenter notes (an HTML comment `<!-- ... -->` on the slide), **not** on the
  slide face. This is how the deck stays minimal (denny's voice) yet reviewable;
  give the exact comment syntax and one example.
- copy rules: **zh-primary**, **no em-dashes** (— and —— banned in slide copy),
  one lime run per statement, and a pointer to **Denny's slide voice**
  (https://github.com/denny0223/SITCON-Camp-2026-Prep-Course/blob/gh-pages/AGENTS.md#dennys-slide-voice)
  as the writing reference.

## Step 6 — Prove it, then verify

- `deck/_sample.md` renders **one slide per major archetype** through the theme
  (these double as the COOKBOOK's rendered examples). Not lesson content —
  representative structure only.
- `pnpm --dir slides/marp run pdf` (or the documented command) exports
  `_sample.pdf` with backgrounds via `--allow-local-files`, fonts correct
  (Artific **not** rendering all-Black — the variable-axis pin works; zh in Noto;
  mono in tightened Fira Code), title pinned top-left, footer + pagination on
  every slide.
- Open the PDF and check legibility, on-token colors/fonts, and the footer +
  pagination — you are validating the simple token language, not reproducing the
  old deck's layouts.

## Definition of Done

- [ ] `slides/marp/` renders with marp-cli; `preview` / `pdf` / `html` scripts
      work; `--allow-local-files` is wired for export.
- [ ] `camp-dark.css` is a **simple, token-driven** theme borrowing from
      `slides/design-system/` (colors from `figures/PALETTE.md`) — flat canvas,
      two-tier white/grey, single lime accent, three-zone footer with real
      pagination, set-piece classes. Capsule is optional, not the backbone. No
      invented tokens.
- [ ] Slide size = **3840×2160** (1:1 with Affinity); title pinned top-left in a
      reserved band whose geometry equals `MASTERS.md`'s title zone; verified at
      one- and two-line titles.
- [ ] **Backgrounds**: custom Affinity art only for `cover`/`toc`/`divider`
      (per-class) + a per-slide `![bg]` path; content pages are flat theme `--bg`;
      CSS placeholders render the deck before Affinity PNGs exist; real art swaps
      in by filename.
- [ ] **Fonts**: Latin = Artific Variable with the **weight axis explicitly
      pinned** (not defaulting to Black), zh-TW = Noto Sans TC via fallback
      ordering, mono = Fira Code with negative tracking tuned to match. Artific
      licensing/embedding question flagged in the README.
- [ ] **`MASTERS.md`** is an unambiguous **3840×2160** geometry spec: uniform
      100px margin, footer (page number + section indicator) the only thing in the
      margin band, title zone, content area, set-piece masters (`cover`/`toc`/
      `divider`) only, export instructions.
- [ ] **`COOKBOOK.md`** covers the **simple** archetype set with copy-paste Marp +
      a rendered example each, plus the shared conventions (footer label, figures,
      station hand-off, **presenter notes for reviewable detail**, zh-primary, no
      em-dash, Denny's-slide-voice pointer). This is the contract `MARP-01` consumes.
- [ ] `deck/_sample.pdf` exists; a note lists any intended choices.

## Report when done

Output: the `slides/marp/` tree; the exact preview/export commands; how each of
the three features is implemented (title CSS, background classes, the resolved
Artific `fvar` axis tags + the `wght` values pinned per role, and the final mono
`letter-spacing`); the archetype list the COOKBOOK covers; the Affinity master
filenames `MASTERS.md` expects in `assets/bg/`; the Artific licensing decision;
and a one-line pass/fail per Definition-of-Done checkbox.
