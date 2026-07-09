# Session: Loop 0 — add "how embeddings are learned" slide (word2vec's two tasks)

> Paste this whole file into a fresh Claude Code session at the repo root. It is
> self-contained. Deliverable: ONE new slide inserted into
> `slides/marp/deck/course2.md` (Loop 0), plus one new matplotlib figure, PDF
> re-rendered and visually verified.

## Read first (hard gate)

1. `slides/marp/COOKBOOK.md` — the authoring contract (slide classes, fragments,
   figure sizing, notes format). Every slide you write must conform.
2. `slides/figures/PALETTE.md` — the figure generation spec (colors, fonts,
   transparent bg, hard corners). Every figure must conform.
3. In `slides/marp/deck/course2.md`, read all of Loop 0 (from the
   `divider-01` slide through the 「文字，就這樣變成數字 _Loop 0 小結_」slide) so
   the new slide matches the surrounding voice and notes style.

## Why this exists

The deck currently jumps from 「one-hot 是牆、embedding 是解法」 straight into the
hands-on Embedding station. Students see THAT semantically similar words sit
close together, but never hear even one sentence about HOW those positions came
to be. Harry's call: add one brief bridge slide explaining that the positions
are **learned**, using word2vec's two training tasks as the concrete example.

## The edit

**File: `slides/marp/deck/course2.md` — this file ONLY.** Do not touch
`slides/marp/deck/sections/*.md` (stale build artifacts) or any other deck.

Insert exactly ONE new slide between:

- 「從編號到有語意的數字 _One-hot vs Embedding_」 (the two-column one-hot/embedding slide), and
- 「換你動手 _Embedding 探索站_」 (the station hand-off).

### Slide content (the pedagogy, not verbatim copy — write it in the deck's voice)

- Driving question in the title area: 這些位置是誰排的? / 語意是怎麼被學出來的?
  (pick a phrasing that matches the deck's title style: `# 主標 _副標_`).
- Core idea: nobody hand-places the words. The positions come from playing a
  **guessing game** on huge amounts of text, millions of times.
- word2vec's two training tasks, named and described in plain Chinese:
  - **CBOW**: 遮住中間的字，用旁邊的字猜它 (「今天天氣真＿」→ 猜「好」)
  - **skip-gram**: 反過來，給一個字，猜它旁邊會出現什麼字
- The punchline (this gets the single lime/bold emphasis): 在同樣的上下文裡
  可以互換的字，玩這個遊戲玩久了，就會被推到**相近的位置**。That is why 貓 and 狗
  end up neighbours: they appear in the same kinds of sentences.
- This is a ~2 minute bridge slide. No formulas, no training math, no loss
  functions, no neural-net diagrams. One figure + a few lines of copy.

### Speaker notes (required, both blocks, in the deck's exact style)

- `講者備忘：` — delivery guidance. Suggest the presenter plays one round live:
  read 「今天天氣真＿」 aloud, let students shout the answer, then point out that
  they just did what word2vec does, except word2vec plays billions of rounds and
  adjusts positions after each one. Note this also foreshadows the
  猜下一個字 game that opens Loop 2.
- `自學備註：` — the self-contained explanation for a student reviewing alone,
  same register as neighbouring slides' 自學備註.

## New figure

Write `slides/figures/generate-word2vec-tasks.py` producing
`slides/figures/word2vec_tasks.png`:

- Two mini-panels: CBOW (context words with arrows pointing at a masked middle
  slot) and skip-gram (one word with arrows pointing out at masked context
  slots). Use a real short Chinese example sentence, e.g. 今天 天氣 真 ＿.
- Follow `PALETTE.md` exactly: transparent bg, hard corners, CYAN/PURPLE as the
  two categorical accents, GREY arrows, CJK via the Artific + Noto Sans TC
  helper. Copy the boilerplate (font setup, colors, save flags) from an existing
  script such as `slides/figures/generate-rnn-walls.py`.
- Run it with: `uv run --with matplotlib --with numpy --with fonttools python3
  slides/figures/generate-word2vec-tasks.py`
- Reference it from the slide as `../../figures/word2vec_tasks.png` with an
  `h:` sizing consistent with sibling figure slides (most use h:900–1000).

## Constraints

- **Do NOT touch any 「畫面長這樣」 slides** anywhere in the deck.
- No em-dashes (— or ——) anywhere in slide copy. Keep copy tight.
- One lime emphasis (`**…**`) per slide, max.
- Copy is zh-TW, technical terms may stay English (CBOW, skip-gram, word2vec are
  fine as-is; the deck already mixes this way).
- Do not renumber, retitle, or edit any other slide. This is a pure insertion.

## Verify (hard gate before declaring done)

From `slides/marp/`:

```bash
npx marp --config marp.config.js --allow-local-files deck/course2.md -o out/course2.pdf
npx marp --config marp.config.js --allow-local-files deck/course2.md --images png -o out/verify/course2.png
```

Then Read the PNG of the new slide (and its two neighbours) to visually confirm:
figure renders, no text overflow, title tiers correct, fragment attributes (if
any) valid. Fix and re-render until clean. Report which slide number the new
slide landed on.
