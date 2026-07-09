# Session: Loop 2 — add RNN step-through walkthrough slide (make the chaining visible)

> Paste this whole file into a fresh Claude Code session at the repo root. It is
> self-contained. Deliverable: ONE new fragment-driven slide inserted into
> `slides/marp/deck/course2.md` (Loop 2), plus new matplotlib figure(s), PDF
> re-rendered and visually verified.

## Read first (hard gate)

1. `slides/marp/COOKBOOK.md` — the authoring contract, especially how this deck
   does fragments (`data-marpit-fragment`).
2. `slides/figures/PALETTE.md` — the figure generation spec.
3. In `slides/marp/deck/course2.md`, read all of Loop 2 (from the `divider-03`
   slide through 「RNN 撞到的兩道牆」), paying attention to the existing
   「RNN _一次吃一個字，把記憶往後傳_」 slide (`rnn_flow.png`) and the RNN 視覺化站
   hand-off, so the new slide slots between them without repeating either.

## Why this exists

Harry's feedback: the RNN section moves too fast. There is exactly ONE
explanation slide (`rnn_flow`) between the context-length chart and the
hands-on station, and it shows the whole chain at once. Students never see the
recurrence HAPPEN: same cell, one token in, memory updated, memory passed on,
repeat. The fix: one fragment-driven slide that steps through a real sentence
one token at a time, so the chaining is enacted, not just depicted.

## The edit

**File: `slides/marp/deck/course2.md` — this file ONLY.** Do not touch
`slides/marp/deck/sections/*.md` (stale build artifacts).

Insert exactly ONE new slide between:

- 「RNN _一次吃一個字，把記憶往後傳_」 (the static `rnn_flow` overview — keep it
  unchanged, it stays as the establishing shot), and
- 「換你動手 _RNN 視覺化站_」 (the station hand-off).

### Slide content (the pedagogy — write it in the deck's voice)

- Step through 「今天 天氣 真 好」 (4 chunks) one fragment per step. Each fragment
  reveals one step of the SAME cell being reused:
  - Step 1: 讀「今天」＋ 空白記憶 → 記憶 v1
  - Step 2: 讀「天氣」＋ 記憶 v1 → 記憶 v2
  - Step 3: 讀「真」＋ 記憶 v2 → 記憶 v3
  - Step 4: 讀「好」＋ 記憶 v3 → 記憶 v4，句子讀完，v4 就是整句的摘要
- Three ideas MUST be visually and verbally explicit:
  1. **Chaining**: the memory coming OUT of step t is exactly what goes INTO
     step t+1. Draw the arrow; that arrow is the whole architecture.
  2. **Same box reused**: it is one network applied over and over, not four
     networks. (This is what "recurrent" means; say it in plain Chinese.)
  3. **Fixed-size memory**: the memory is one same-sized vector at every step;
     each update overwrites-and-blends. This quietly plants the forgetting wall
     that the station and 「兩道牆」 slide will pay off. Do NOT spell out the wall
     here; just make the container visibly the same size every step.
- The single lime emphasis goes on the chaining line (e.g. 上一步的記憶，就是
  下一步的輸入).
- No formulas. No h_t notation on the slide face (the notes may name
  hidden state once, as the existing slides already do).

### Fragments

Use the deck's existing `data-marpit-fragment` pattern (see the 猜下一個字 slide
in this same Loop for the exact HTML idiom). One fragment per step. Verify in
the PNG render that the final state (all fragments visible) fits the slide.

### Speaker notes (required, both blocks)

- `講者備忘：` — delivery: one fragment per beat, narrate 讀一個字、更新記憶、
  傳下去 with the same three-word rhythm each step so the loop becomes a chant.
  After step 4, point at the memory box: 整句話最後就活在這一格裡, then hand off
  to the station where they watch the same thing as a heatmap.
- `自學備註：` — self-contained explanation, same register as neighbours.

## New figure(s)

Write `slides/figures/generate-rnn-steps.py`. Either:

- one PNG per fragment step (`rnn_step_1.png` … `rnn_step_4.png`), each showing
  the chain progressed one more token, OR
- one composite figure if you can make the fragment reveal work cleanly with
  HTML/CSS instead.

Pick whichever renders more reliably in Marp; per-step PNGs stacked in fragment
divs is the safer bet. Requirements:

- Visual continuity with `rnn_flow.png` (same palette roles: CARD boxes,
  GREY arrows, CYAN for the token stream, and reuse its memory-fading gradient
  idea only if it does not distract — the fade is the NEXT slide's job).
- Follow `PALETTE.md`: transparent bg, hard corners, CJK font helper. Copy
  boilerplate from `slides/figures/generate-rnn-walls.py`.
- Run with: `uv run --with matplotlib --with numpy --with fonttools python3
  slides/figures/generate-rnn-steps.py`
- Reference as `../../figures/…` with `h:` sizing that keeps all fragments on
  one slide.

## Timing comment

In the `divider-03` slide's `<!-- ⏱ Loop 2：43 min · hands-on 19 -->` comment,
bump the total to `46 min` (this slide costs ~3 min; the time is freed by the
Loop 3 restructure in a separate session — do not touch Loop 3 yourself).

## Constraints

- **Do NOT touch any 「畫面長這樣」 slides.**
- Keep the existing 「RNN _一次吃一個字_」 slide exactly as-is.
- No em-dashes (— or ——) in slide copy. Keep copy tight.
- One lime emphasis per slide, max.
- Pure insertion + the one timing-comment edit. Nothing else changes.

## Verify (hard gate before declaring done)

From `slides/marp/`:

```bash
npx marp --config marp.config.js --allow-local-files deck/course2.md -o out/course2.pdf
npx marp --config marp.config.js --allow-local-files deck/course2.md --images png -o out/verify/course2.png
```

Read the PNG of the new slide and its two neighbours. The PNG shows the
all-fragments-visible final state: confirm all four steps fit without overflow
and the chain arrows read left-to-right (or top-to-bottom) unambiguously. Fix
and re-render until clean. Report the new slide's page number.
