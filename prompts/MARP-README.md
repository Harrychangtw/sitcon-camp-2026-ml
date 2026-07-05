# Course 2 slide overhaul — Marp migration prompts

The Course 2 deck is moving off hand-laid **Affinity** onto **Marp**
(markdown → HTML/PDF via `@marp-team/marp-cli`, the same engine behind
denny.one/SITCON-Camp-2026-Prep-Course). The reason is workflow, not looks: the
content is the bottleneck, Affinity makes text iteration slow, and Marp makes the
deck a plain-markdown surface an agent can rewrite directly. The **design** is
already good and is preserved — the existing `slides/design-system/` becomes a
Marp theme.

Each file here is a **self-contained session prompt** (same model as
`prompts/README.md`): open a fresh Claude Code session at the repo root, paste
one file in, it runs to the end. Run them **in order** — later phases consume
earlier phases' outputs.

## Decisions already made (do not re-litigate)

These were settled with Harry before these prompts were written:

- **Simpler theme, not a full port of the Attention Tracker deck.** The
  `design-system/` is the *reference* for tokens (colors, fonts, footer, the
  two-tier white/grey split, the single lime accent), but the new deck is
  deliberately **much simpler** — text-forward, minimal. Do **not** rebuild the
  capsule / data-viz archetype machinery as the backbone; capsules are an
  optional available component, not the structure. (See `MARP-00`.)
- **Slide voice = clear, minimal, well-organized — per Denny's slide voice.**
  Reference: https://github.com/denny0223/SITCON-Camp-2026-Prep-Course/blob/gh-pages/AGENTS.md#dennys-slide-voice
  (one concept per slide, short visible text, cues/fragments/contrast pairs over
  paragraphs, no mini-articles). Harry also wants the deck **reviewable** later —
  those goals are reconciled by keeping **slides minimal** and moving the
  connective/self-study explanation into **Marp presenter notes**. (See `MARP-01`.)
- **Custom backgrounds only for set-piece pages.** Harry builds the **cover /
  title, outline (TOC), and section dividers** in Affinity as custom full-bleed
  art; Marp references those exports. **All other pages** use the simple
  theme-rendered background. The theme just has to agree with the masters on
  geometry.
- **Fonts:** Latin → **Artific Variable**; zh-TW → **Noto Sans TC** (Roboto has
  no Han glyphs, so CJK rides Noto; the two are designed to pair). Mono → **Fira
  Code**, tracked ~−30%.
- **Geometry = Affinity's 3840×2160 with a uniform 100px safe margin.** All
  content sits inside the margin; the only things allowed in the margin band are
  the master page-number (left/center) and section indicator (right). (See
  `MARP-00` → `MASTERS.md`.)
- **No fork of Marp.** Every feature Harry wants is a **custom theme + Marp
  CLI's engine API**, not a source fork. Cloning marp-core/marpit is for
  *reference only*. (Rationale and the last-resort fork path are in `MARP-00`.)

## The two phases (run in this order)

| # | Prompt | Phase | Produces |
|---|--------|-------|----------|
| 0 | `MARP-00-foundation.md` | **Foundation** | The `slides/marp/` toolchain, the `camp-dark` theme, the **COOKBOOK** (archetype → Marp markdown contract), and **MASTERS** (the geometry spec Harry's Affinity art obeys). One paste, one session. |
| — | *(Harry, manual)* | **Affinity masters** | Harry draws the background masters + cover/TOC/divider art in Affinity per `slides/marp/MASTERS.md` and drops the PNGs into `slides/marp/assets/bg/`. Not a Claude session. |
| 1 | `MARP-01-content-overhaul.md` | **Content overhaul** | The full self-contained deck. Main agent reviews; **one Opus subagent per section** rewrites that section into its own Marp file; main agent concatenates + reconciles. |

**Why foundation must come first:** `MARP-01` fans out ~6 parallel subagents.
Without a shared authoring contract they produce six dialects. The COOKBOOK from
`MARP-00` *is* that contract — every content subagent writes against it. Do not
start `MARP-01` until `slides/marp/COOKBOOK.md` exists.

**The Affinity step in the middle is optional to unblock `MARP-01`.** The theme
ships with CSS-rendered placeholder backgrounds so the deck renders end-to-end
before Harry's masters exist; the masters swap in later by dropping PNGs in
`assets/bg/` (see `MARP-00`). Content work does not block on Affinity.

## What stays put

- `slides/design-system/` — the visual-language **reference** for tokens (colors,
  fonts, footer, two-tier split, lime accent). The new theme borrows these tokens
  but is intentionally **simpler** — it is not a faithful reproduction of the
  Attention Tracker deck. Do not redesign the tokens.
- `slides/figures/PALETTE.md` — the **canonical color source**: exact hexes as
  named constants (`BG`, `CARD`, `GREY`, `LIME`, `CYAN`, `PURPLE`, `MAGENTA`, the
  viridis ramp). The theme's CSS color vars come straight from here.
- `slides/decks/course2.md` — the Affinity-era deck. **Kept as the beat/pedagogy
  reference** for the rewrite (esp. its `BUILT STATE` notes = what Harry actually
  shipped). Its verbatim `TEXT` blocks are *replaced*, not ported.
- `docs/course-spec.md` §「第二堂課」 — pedagogy ground truth. The rewrite serves
  the spec's loop/撞牆 structure; it does not invent new pedagogy.
- `slides/figures/` — generated figures (dark, transparent, on-palette) drop
  straight onto Marp slides. Reuse; regenerate via the scripts there.
