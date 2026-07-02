# Session: **Embedding — real, large zh-TW + English vectors** — Course 2 (wave 2)

> Paste this whole file into a fresh Claude Code session at the repo root. It is
> self-contained. Deliverable: the `/embedding` station gains a **content
> language** control (中文 / English); precompute replaces the tiny synthetic set
> with **real pretrained vectors** over a **large zh-TW vocabulary** (+ English),
> projected offline; the station UI is zh-TW — `typecheck`/`lint`/`build` green.

Wave-2 upgrade to the built Embedding station (`apps/course2/src/stations/
embedding.tsx` + `precompute/.../embedding.py`). See `prompts/README.md` →
**Wave 2**. **Run after `00a`** (and after `01a` in the wave-2 order).

## What changes and why

Today `embedding.py` **synthesises** clustered vectors — fine for the mechanic,
but the clusters are hand-designed, and it's English-only. Two upgrades:

1. **Real vectors.** Use a real pretrained embedder so "distance ≈ similarity" is
   *earned*, not staged, and the polysemy/edge-case beat is genuine.
2. **Large zh-TW coverage.** Ship a big Chinese vocabulary (thousands of common
   詞), plus English, switchable by a **content language** control.

## The GPU question — settle it here

The golden rule ("browser never trains") is about the **runtime**, not
precompute. Embedding thousands of words with a real model is **offline
precompute** — run it on any machine (this repo's host has **MPS**; a **CUDA**
box is available; CPU works too, just slower). **Select the device
automatically** (`cuda` → `mps` → `cpu`). The **browser / Vercel runtime needs no
GPU** — it only `fetch`es small JSON and plots it. So "might run on Vercel / GPU
availability" is a non-issue: nothing model-heavy runs at request time.

## Prerequisites & shared surface

- **Depends on `00a`** (UI-copy convention). Follow `00a`'s glossary for zh-TW.
- **Shared files:** `cli.py`, `manifest.json` — extend, don't overwrite.
- **New Python dep(s):** you'll add an embedder (see Step 1) to the `uv` project
  (`precompute/pyproject.toml`). Keep it a precompute-only dep.
- **Golden rule:** ship **small** artifacts. The model is huge; the **exported
  JSON is not** — cap it (below).

## Step 0 — Read first

1. `CLAUDE.md` — golden rules (esp. "small artifacts", "browser never trains").
2. `prompts/00a-zh-tw-copy.md` → glossary + CJK label note.
3. `prompts/DESIGN.md`.
4. `apps/course2/src/stations/embedding.tsx` — the built station (`EmbeddingPoint`,
   `NeighborMap`, `MAX_K`, category coloring, the `datalist`, the polysemy
   takeaway that currently says "turkey").
5. `precompute/src/camp_precompute/embedding.py` + the `embedding` subcommand in
   `cli.py` — what you're replacing.
6. `precompute/pyproject.toml` — where the new dep goes.

## Step 1 — Precompute: real vectors over a large vocab

Rewrite `embedding.py` to build **per-language** artifacts from **real pretrained
embeddings**:

- **Embedder:** a strong Chinese/multilingual model. Recommended: a **zh BGE**
  model (e.g. `BAAI/bge-large-zh-v1.5` or `bge-m3`) via `sentence-transformers` /
  `FlagEmbedding` — the user green-lit "a large zh bge embedder if needed." (A
  static option like fastText zh is acceptable if you prefer no transformer dep;
  BGE gives better semantics.) Auto-pick device `cuda`/`mps`/`cpu`.
- **Vocabulary:** a **large** curated zh-TW word list (thousands — aim for a few
  thousand common 詞 across many domains: 動物、食物、地點、國家、顏色、情緒、
  數字、科技、交通…), plus an English list. Source it from a shipped word-list
  file (add one under `precompute/`), not scraped at build time.
- **Vectors → 2D/3D:** embed each word, then **PCA** to `x,y,z` (offline, as
  today). Normalize/scale for a stable plot.
- **Categories for coloring:** with thousands of words, hand-categories don't
  scale. Either (a) assign each word a coarse category from the curated list's
  own grouping, or (b) **k-means** into ~6–10 clusters and label them. Keep the
  category count small so the cyan/purple categorical palette still reads (see
  Design). Coloring by cluster is fine.
- **Neighbours:** cosine top-K (K = `MAX_K` = 15) in the **original** embedding
  space (not the PCA space), exported per word.
- **Per-language artifacts (lazy-loadable):**
  `embedding/points.zh.json`, `embedding/neighbors.zh.json`,
  `embedding/points.en.json`, `embedding/neighbors.en.json`. Register all in
  `manifest.json` tagged `station: "embedding"`.
- **Size cap (golden rule):** keep each shipped JSON **web-reasonable — target
  ≤ 3–4 MB per language** (≈ a few thousand points + top-15 neighbours). If a
  larger vocab blows the budget, **cap the point count and `log` what you
  dropped** — do not silently ship a 30 MB file. Round floats (e.g. 3–4 dp).
  Commit the JSON (it's small text, not a model/`*.bin`).

## Step 2 — Station: content-language toggle + lazy load

In `embedding.tsx`:

- **New control:** `SegmentedControl` 「語言 / Language」→ `中文` | `English`.
- **Lazy-load** the selected language's `points.<lang>.json` + `neighbors.<lang>
  .json` in an effect keyed on `lang` (don't fetch both up front — they're big).
  Show the existing loading state while switching.
- Everything downstream (search, k-neighbours, PCA scatter, category legend) is
  unchanged in shape — it just reads the active language's data. The search
  `datalist` now has thousands of options; that's fine (native datalist handles
  it), but make sure the "not in vocabulary" path still works.
- **Re-pick the polysemy takeaway** for Chinese: the English copy points at
  `turkey` (country ∧ bird). Choose a genuinely **polysemous zh word** whose
  neighbours split across senses (e.g. a word that is both a place and a common
  noun, or a 多義詞) and verify in the real data that its neighbours actually
  straddle two clusters before writing the takeaway around it. If none is clean,
  fall back to the "distance ≈ similarity, but meaning isn't one clean point"
  message without naming a specific word.

## Step 3 — Localize this station's UI to zh-TW

Rewrite chrome (title, subtitle, control labels, search placeholder, neighbour
list, category legend header, takeaway, states) to zh-TW per `00a`'s glossary
(keep `embedding`, `vector`, `PCA`, `k` English). Update the `registry.tsx`
`embedding` entry to a zh-TW title/blurb.

## Step 4 — Verify

```bash
cd precompute && uv sync && uv run camp-precompute embedding && cd ..
ls -la apps/course2/public/data/course2/embedding/   # check per-language sizes
pnpm typecheck && pnpm lint && pnpm build
pnpm --filter @app/course2 dev   # http://localhost:5173/embedding
```

Switch 語言 to 中文: a large Chinese cloud loads; search a 中文 word → its real
nearest neighbours light in lime and are semantically sensible; switch to English
→ English data loads. 2D and 3D both render. No console errors. Confirm each
shipped JSON is within the size cap.

## Design language (follow `prompts/DESIGN.md`)

- Base points greyscale; **lime** only for the searched word + its k neighbours.
- Category/cluster coloring uses the **cyan/purple categorical** hues — keep the
  cluster count small (≤ ~8) so it doesn't rainbow; if you must show more groups,
  prefer opacity/greyscale over inventing hues. Colors come from **theme vars/
  props** in `@camp/viz`, never hard-coded.
- CJK labels/tooltips: drop letter-spacing on Han runs; keep mono for scores/ids.
- The 語言 toggle is a plain control, not a category hue.

## Definition of Done (checked by `prompts/validate.md`)

Shared contract (`prompts/README.md` items 1–8), plus **embedding-bilingual**:

- [ ] Vectors are **real pretrained** (BGE or equivalent), built **offline** with
      auto device select (`cuda`/`mps`/`cpu`); nothing model-heavy runs in the
      browser/at request time.
- [ ] A **large** zh-TW vocab (thousands) + English, as **per-language**
      `points.<lang>.json` / `neighbors.<lang>.json`, all in `manifest.json`.
- [ ] Each shipped JSON is within the size cap (≤ ~3–4 MB/lang); any cap-driven
      truncation is `log`ged, not silent.
- [ ] 中文 / English **content** control lazy-loads the active language's data.
- [ ] Neighbours are real (cosine top-K in original space) and semantically
      sensible; the polysemy takeaway uses a verified zh word (or is word-agnostic).
- [ ] Station UI is zh-TW (glossary terms English); sidebar label localized.
- [ ] `pnpm typecheck && pnpm lint && pnpm build` are green.

## Report when done

Output: the embedder + device used, vocab sizes per language, the shipped byte
sizes per file, the clustering/category approach, the zh polysemy word you chose
(with its observed neighbours), files changed, and a one-line pass/fail per
checkbox.
