# slides/marp - Marp toolchain for the Course 2 deck

The Course 2 deck renders from plain Marp markdown through the **camp-dark**
theme. Design tokens come from `slides/figures/PALETTE.md` +
`slides/design-system/`; the deck itself is deliberately simpler than the
Attention Tracker reference (text-forward, no capsule machinery).

- **`COOKBOOK.md`** - the authoring contract. Anyone (human or agent) writing
  slide content starts there.
- **`MASTERS.md`** - the 3840x2160 geometry spec Harry's Affinity backgrounds
  obey (title band, margins, footer, set-piece art).

## Commands

This package is part of the pnpm workspace (`pnpm install` at the repo root
installs marp-cli). From `slides/marp/`:

```bash
pnpm preview   # watch + preview window for deck/_sample.md
pnpm pdf       # deck/_sample.md -> out/_sample.pdf
pnpm html      # deck/_sample.md -> out/_sample.html
pnpm png       # deck/_sample.md -> out/_sample.NNN.png (one per slide)
```

For any other deck file, the generic form (from `slides/marp/`):

```bash
pnpm exec marp --config marp.config.js --allow-local-files deck/<file>.md -o out/<file>.pdf
```

`--allow-local-files` is required for exports (local fonts, `assets/bg/`
backgrounds, `slides/figures/` images); it is baked into the scripts and
enabled in `marp.config.js`. PDF/PNG export uses your locally installed
Chrome/Chromium.

## Web bundle (hosted, presentable deck)

Marp's HTML export is the **bespoke player** — the same one denny.one uses:
`P` opens presenter view (per-slide notes + live timer + next-slide preview),
`F` fullscreen, `O` overview grid. Notes come from the slide's HTML-comment
(see `COOKBOOK.md` §"Presenter notes"). That export is *not* self-contained,
though: it references fonts/backgrounds/figures by relative path. `pnpm web`
(→ `scripts/build-web.mjs`) fixes that — it exports the HTML, flattens those
paths to one `assets/` root, copies the referenced files in, and writes a
portable bundle to `web/course2/`.

```bash
# portable relative bundle (open web/course2/index.html locally)
pnpm web

# build + sync to a static host, with asset paths absolute to the mount URL
node scripts/build-web.mjs --base=<url-prefix> <deploy-dir>
```

`--base` is the key flag for pretty URLs: when a deck is served at a path with
**no trailing slash** (e.g. `/slides/foo`), relative `./assets/` refs resolve
against the wrong directory and 404. `--base=/slides/foo` rewrites them to
absolute `/slides/foo/assets/…` so they resolve regardless. Omit it only for a
relative bundle you open from its own folder.

### Deployed at harrychang.me

The Course 2 deck is hosted on the portfolio (`apps/harrychang-me`). Rebuild +
sync from `slides/marp/`:

```bash
node scripts/build-web.mjs \
  --base=/slides/sitcon-camp-26-ml-course2 \
  ~/…/portfolio-monorepo/apps/harrychang-me/public/slides/sitcon-camp-26-ml-course2
```

That writes `public/slides/sitcon-camp-26-ml-course2/{index.html,assets/}`. A
rewrite in the portfolio's `next.config.mjs` maps the bare pretty URL to the
bundle's `index.html`, so the deck lives at:

> **https://harrychang.me/slides/sitcon-camp-26-ml-course2**

The bundle is a static artifact — commit it in the portfolio repo (it does not
rebuild there). Re-run the command above whenever `deck/course2.md` changes.

## Where things live

```
themes/camp-dark.css   the theme (tokens, geometry, set-piece classes)
deck/                  deck markdown lives here (paths assume this dir)
  _sample.md           one rendered example per COOKBOOK archetype
assets/bg/             Affinity master PNGs (cover/toc/divider, see MASTERS.md)
assets/fonts/          font binaries (gitignored, see below)
out/                   exports (gitignored)
```

Deck files must live in `deck/` one level below `slides/marp/`: the theme and
the COOKBOOK reference fonts/backgrounds/figures relative to it
(`../assets/...`, `../../figures/...`).

## Backgrounds

Only cover / toc / section-divider slides get custom Affinity art, wired
per-class in the theme. Until the PNGs exist in `assets/bg/`, set-pieces
render a flat placeholder panel + a dashed label; the real art swaps in by
filename with **no content change** (then delete the marked `PLACEHOLDER
CHROME` block at the bottom of `camp-dark.css`). Any other one-off full-bleed
image uses the native per-slide directive: `![bg cover](../assets/bg/foo.png)`.

Note: a single full-bleed background needs nothing special; only *split* or
CSS-filtered `![bg]` backgrounds would require Marp's inline-SVG mode, so we
avoid depending on those.

## Fonts (three roles, tokens.md §2)

| Role | Font | Pinning |
|---|---|---|
| HEAD / BODY (Latin) | Artific Variable | `fvar` default is **wght 900 Black**; the theme declares `font-weight: 100 900` and sets explicit weights (BODY 400, HEAD 700) so nothing renders Black. Second axis `obli` stays at its upright default. |
| zh-TW | Noto Sans TC | static Regular 400 + Bold 700 |
| MONO | Fira Code | VF default is **wght 300 Light**; theme pins 400. Tracked `-0.03em` to approximate Harry's -30% Affinity tracking (matched by eye; back off if it fights ligatures). |

`@font-face` resolves `assets/fonts/` first, then locally installed copies.
The binaries are **gitignored**; on a fresh clone repopulate with:

```bash
cp ~/Library/Fonts/Artific-Variable.ttf \
   ~/Library/Fonts/NotoSansTC-Regular.ttf \
   ~/Library/Fonts/NotoSansTC-Bold.ttf \
   ~/Library/Fonts/FiraCode-VariableFont_wght.ttf \
   assets/fonts/
```

(Noto Sans TC and Fira Code are OFL: also downloadable from Google Fonts.)

### Artific licensing

Artific Variable is a **paid/custom font**. A portable HTML bundle serves the
raw TTF publicly (`assets/fonts/`). This is fine for the harrychang.me deploy:
that portfolio already sources and serves Artific through its own font
pipeline, so the deck reuses a font it's already licensed to publish there.
Do not publish the Artific binary to an unrelated host without confirming the
license covers it; for those, share the PDF export instead. Noto/Fira are OFL.

## Extending Marp

No forks. If a slide ever needs a markdown transform the theme cannot express,
add a markdown-it plugin through the engine hook in `marp.config.js` (see the
comment there).
