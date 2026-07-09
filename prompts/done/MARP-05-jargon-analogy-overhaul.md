# Session: deck-wide overhaul — jargon audit + analogy-first term introduction

> Paste this whole file into a fresh Claude Code session at the repo root. It is
> self-contained. Deliverable: a pass over ALL of `slides/marp/deck/course2.md`
> that (a) removes unnecessary jargon from slide faces, (b) restructures so every
> big term is introduced only AFTER a relatable analogy, (c) adds one new
> terminology cheat-sheet slide, PDF re-rendered and every changed slide
> visually verified.

## Read first (hard gate)

1. `slides/marp/COOKBOOK.md` — the authoring contract (slide classes, two-tier
   text, lime rule, verbatim spine, notes format). Note §2.12 畫面長這樣 is
   RETIRED: never add station-screenshot slides.
2. `slides/figures/PALETTE.md` — only if you end up touching figures.
3. The ENTIRE `slides/marp/deck/course2.md`, start to finish, before editing
   anything. You are changing pacing and voice, not one slide; you must hold
   the whole arc in your head.

## Why this exists (Harry's feedback, 2026-07-08)

The audience is Taiwanese high-schoolers with **no idea what a vector or a
matrix is**. Trial feedback:

1. Slide faces lean on jargon that carries no teaching weight for this
   audience. Example already fixed: the word2vec bridge slide now says
   「玩法 1：猜被遮住的字」instead of CBOW, and word2vec/CBOW/skip-gram live
   only in its 自學備註 (see the 「這些位置是誰排的?」 slide as the model for
   this pattern).
2. Big terms (embedding, RNN, Transformer, attention) sometimes land on a
   slide face BEFORE the intuition exists. The rule going forward: **a term
   may be named only after a carefully thought-out, easy-to-relate analogy has
   built the concept.** The naming beat is 「你剛剛看到的這個東西，它的名字
   叫 X」, never 「X 是…」.
3. Language generally needs toning down for students who have never seen
   向量／矩陣 notation.

## The work

**File: `slides/marp/deck/course2.md` — this file ONLY** (plus at most small
figure-script tweaks if a figure bakes jargon into its labels; follow
PALETTE.md and regenerate). Do not touch `slides/marp/deck/sections/*.md`
(stale build artifacts).

### 1. Jargon audit (do this first, report it)

Sweep every slide FACE (titles, body, captions, chips; notes are exempt but
see §4). Build a table: term → slide(s) → verdict:

- **Cut**: the term does no work for a high-schooler (e.g. word2vec, CBOW,
  skip-gram, logits, softmax, BPE-as-a-name, one-hot-as-a-name where 「一整排
  0 只有一格是 1」already carries it). Replace with plain zh; park the real
  name in that slide's 自學備註 as a 「想深入可以查」pointer.
- **Keep, already analogy-first**: the term is load-bearing (token, embedding,
  RNN, Transformer, attention, MLP) and the deck already builds intuition
  before naming it. Verify the order actually holds slide by slide.
- **Keep, but reorder/rewrite**: load-bearing term that currently lands
  before its analogy. Fix the sequence: intuition beat first (may be an
  existing slide rewritten, or a new short beat), THEN the naming line.

Judgement calls: 向量／矩陣 as words should barely appear on faces at all;
prefer 「一排數字」「位置」「距離」「方向」. `token` stays (a whole station
teaches it). English on faces only where the term itself is the point.

### 2. Analogy-first restructure (the important part)

For each of **embedding, RNN, Transformer, attention** (and any other keep-term
the audit flags), confirm or build this arc:

1. a wall or need the student already felt (station or contrast slide),
2. a relatable analogy slide that carries the mechanism WITHOUT the name
   (existing examples of the register: 座號 for token ids, 猜字遊戲 for how
   embeddings are learned, 生產線 imagery for the Transformer),
3. only then the name, as a short 「這個做法叫 X」beat, lime on the term at
   most once.

Where the deck already does this, leave it alone; this is a surgical pass, not
a rewrite for its own sake. Where it does not, prefer rewriting the existing
slide over inserting new ones; keep total slide count roughly stable (the deck
is 41 slides and time-boxed).

### 3. New terminology cheat-sheet slide (ONE slide)

A 術語對照 page: each big term of the day → its plain-zh one-liner, e.g.
「embedding：把字變成一排數字，位置就是意思」「attention：每個字決定要看誰、
看多重」. Recommended placement: at the END with the resources/小結 block, framed
as 帶回家的對照表, and mentioned aloud early (講者備忘 on the 約定 slide already
tells students it exists, if you wire that up, keep it one sentence). Do NOT put
it up front: a glossary before the analogies would violate the ordering this
whole session enforces. Capsule or two-column list layout per COOKBOOK; notes
required like any content slide.

### 4. Notes (自學備註) sanity pass

自學備註 are read by students alone. They may use more precise language than
faces, but each big term must be glossed in plain zh on first use inside the
note itself (pattern:「向量（就是一排數字）」). 講者備忘 are for Harry; jargon
there is fine.

## Constraints

- COOKBOOK conventions bind: two-tier text, max one lime run per statement,
  verbatim spine kept in sync when you rewrite a spine line, both note blocks
  on every content slide.
- **No em-dashes** (— or ——) anywhere in slide copy.
- Do not renumber/retitle slides that the audit passes untouched; do not touch
  STATION SPEC comments or station URLs/chips.
- Never re-add 畫面長這樣 screenshot slides (retired; Harry screen-shares).
- Keep the deck's zh-TW voice (Denny's slide voice: one concept per slide,
  cues over paragraphs).

## Verify (hard gate before declaring done)

From `slides/marp/`:

```bash
npx marp --config marp.config.js --allow-local-files deck/course2.md -o out/course2.pdf
npx marp --config marp.config.js --allow-local-files deck/course2.md --images png -o out/verify/course2.png
```

Read the PNG of EVERY slide you changed (plus neighbours where you reordered):
no overflow, title tiers correct, fragments valid, lime rule holds. Fix and
re-render until clean. Final report: the audit table (term → slides → action),
the list of changed slide numbers, and where the cheat-sheet slide landed.
