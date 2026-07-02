# Session: **Make the Tokenizer bilingual (中文 + English)** — Course 2 (wave 2)

> Paste this whole file into a fresh Claude Code session at the repo root. It is
> self-contained. Deliverable: the `/tokenizer` station gains a **content
> language** control (中文 / English); precompute ships **both** a zh-TW and an
> English vocab; the station segments **Chinese** text correctly and its UI is
> zh-TW — `typecheck`/`lint`/`build` green.

Wave-2 upgrade to the already-built Tokenizer (`apps/course2/src/stations/
tokenizer.tsx` + `precompute/.../cli.py` `tokenizer` subcommand). See
`prompts/README.md` → **Wave 2**. **Run after `00a`.**

## The pedagogy this adds

Chinese has **no spaces**. That's a gift for this lesson: it makes "why can't we
just split on spaces?" concrete. In 中文, char / word / BPE genuinely diverge —
each 漢字 is a natural char-token, but a *word* (詞) like「機器學習」is several
characters with no delimiter, so word-segmentation is a real, visible problem
(斷詞), and BPE-style subwords sit in between. Flipping the **content language**
between 中文 and English on the same idea is the payoff.

## Two language axes (both live in this station now)

- **UI language:** the chrome is **zh-TW** (you localize this station's copy here,
  the way `00a` did the others — `00a` deliberately skipped tokenizer).
- **Content language:** a **new lesson control** (中文 / English) picks which
  corpus/vocab the student is tokenizing. This is the teaching knob.

## Prerequisites & shared surface

- **Depends on `00a`** having run (UI-copy convention established). If `00a`
  hasn't run, still write this station's UI in zh-TW following `00a`'s glossary.
- **Shared files:** `cli.py`, `manifest.json` — extend, don't overwrite. `02a`
  and `06a` also touch these; run wave 2 sequentially.
- **Golden rule holds:** the browser never trains a tokenizer. Precompute trains
  BPE + builds the word dictionary offline; the browser only **looks up ids** and
  does **light** segmentation (greedy match / the existing BPE replay).

## Step 0 — Read first

1. `CLAUDE.md` — golden rules.
2. `prompts/00a-zh-tw-copy.md` → the do-not-translate glossary + CJK label note.
3. `prompts/DESIGN.md`.
4. `apps/course2/src/stations/tokenizer.tsx` — the built station (note the
   in-browser `UNIT_RE` regex, `bpeEncode`, `segment`, the `Vocab` shape).
5. `precompute/src/camp_precompute/cli.py` → the `tokenizer` section
   (`build_tokenizer_vocab`, `_train_bpe`, the corpus + seed constants).

## Step 1 — Precompute: add a Chinese vocab alongside English

Extend the `tokenizer` subcommand so `tokenizer/vocab.json` carries **both
languages**. Suggested shape — keep English as-is, nest under language keys:

```jsonc
{
  "spaceMarker": "▁",
  "unkId": 1,
  "languages": {
    "en": { "sampleText": "...", "char": {...}, "word": {...}, "bpe": {...} },
    "zh": {
      "sampleText": "機器學習模型讀的是 token，不是字也不是詞",
      "char": { "vocab": { "機": 42, ... } },
      "word": { "vocab": { "機器": ..., "學習": ..., "模型": ... },
                "dict": ["機器","學習","模型", ...] },   // for greedy 斷詞
      "bpe":  { "vocab": {...}, "merges": [["機","器"], ...] }
    }
  }
}
```

- **Chinese corpus:** add a small fixed zh-TW corpus (co-designed with the seed,
  like the English one): common 詞 repeat enough to become whole-word / merged
  tokens; include a **rare/compound word** that BPE must subword-split (the 中文
  analogue of "tokenization").
- **char (中文):** every 漢字 (+ ASCII/punct that appears) → a stable id. Trivial.
- **word (中文):** train nothing — build a **詞典 (word list)** from the corpus
  (and/or a curated common-詞 list). Ship it as `word.dict` (sorted, longest-first
  friendly) **plus** the id lookup. The browser will greedy-longest-match against
  this dict (see Step 2) — this is the offline half of 斷詞.
- **bpe (中文):** reuse `_train_bpe`, but over **characters** (no leading-space
  marker semantics — Chinese has no spaces; treat each unit as a char sequence).
  Export merges + subword vocab exactly like English.
- Register/refresh the artifact in `manifest.json`. Regenerate:
  `cd precompute && uv run camp-precompute tokenizer`. Commit the JSON (keep it
  small — a few hundred zh entries is plenty for the demo; this is not the
  embedding station).

## Step 2 — Station: content-language toggle + CJK-aware segmentation

In `tokenizer.tsx`:

- **New control:** a `SegmentedControl` 「語言 / Language」 → `中文` | `English`,
  stored in state. It selects `vocab.languages[lang]`. Seed the textarea from that
  language's `sampleText` on switch.
- **Segmentation must branch on script**, because the current `UNIT_RE`
  (`[A-Za-z0-9]+|[^\sA-Za-z0-9]`) makes **each 漢字 its own unit** — which is fine
  for **char** and acceptable as the unit stream for **BPE**, but **collapses word
  mode into char mode** for Chinese. Fix word mode for zh:
  - **char (zh):** one chip per 漢字 (the regex already yields this) — good.
  - **word (zh):** run a **greedy longest-match** segmenter in the browser over
    the shipped `word.dict` (light, allowed — it's dictionary lookup, not
    training): at each position take the longest dict entry that matches, else
    fall back to a single char (mark UNK if not in vocab). This makes「機器學習」→
    `機器 · 學習`, visibly different from char mode.
  - **bpe (zh):** feed the char sequence of each run into the existing greedy BPE
    encoder using the zh merges; subword splits render like English.
- **No `▁` space-marker for Chinese** — there are no spaces to mark. Suppress the
  marker in zh mode (or repurpose the note: "中文 沒有空格，斷詞得靠模型"). Make
  this an explicit on-canvas teaching point, not a rendering bug.
- Keep the existing English path exactly as-is under `lang === "en"`.

## Step 3 — Localize this station's UI to zh-TW

Rewrite the station chrome (title, subtitle, control labels, hints, the
tokens/segments/split-words stats, takeaway, states) to zh-TW per `00a`'s
glossary (keep `token`, `BPE`, `unk`, `id`, the term `Transformer` etc. English).
Update the `registry.tsx` entry for `tokenizer` to a zh-TW title/blurb.

## Step 4 — Verify

```bash
cd precompute && uv run camp-precompute tokenizer && cd ..
pnpm typecheck && pnpm lint && pnpm build
pnpm --filter @app/course2 dev   # http://localhost:5173/tokenizer
```

Switch 語言 to 中文, type「機器學習模型」: char shows one chip per 字; word shows
`機器 · 學習 · 模型`; BPE shows subword pieces and splits the rare compound.
Switch back to English — original behavior intact. No console errors.

## Design language (follow `prompts/DESIGN.md`)

- Chips/ids/stats keep the greyscale-on-near-black + mono-label idioms; **lime**
  still marks only the BPE subword split under inspection and the hovered chip.
- The 語言 toggle is a plain `SegmentedControl` (not a color-coded thing) — content
  language is not a *category* hue.
- CJK chip text: drop letter-spacing on Han runs (see `00a`); keep mono for ids.
- No hard-coded hexes in the `.tsx`; theme utilities only.

## Definition of Done (checked by `prompts/validate.md`)

Shared contract (`prompts/README.md` items 1–8), plus **tokenizer-bilingual**:

- [ ] `vocab.json` carries **both** `zh` and `en` (char/word/BPE + zh `word.dict`),
      is in `manifest.json`, loaded via `@camp/data`; **no vocab hard-coded**, no
      training in the browser.
- [ ] A 中文 / English **content** control switches corpus + sample + segmentation.
- [ ] **中文 word mode uses greedy dict segmentation** and visibly differs from
      char mode (word mode does NOT collapse to one-chip-per-字).
- [ ] Chinese mode suppresses/repurposes the `▁` marker and makes the "no spaces"
      point explicit.
- [ ] Station UI is zh-TW (glossary terms English); sidebar label localized.
- [ ] `pnpm typecheck && pnpm lint && pnpm build` are green.

## Report when done

Output: `vocab.json` shape + rough byte size, the zh corpus/seed you chose, the
segmentation branch logic, files changed, and a one-line pass/fail per checkbox.
