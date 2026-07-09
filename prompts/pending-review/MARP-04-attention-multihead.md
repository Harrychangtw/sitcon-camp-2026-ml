# Session: Loop 3 restructure — multi-head in, QKV/PE/residual out to appendix

> Paste this whole file into a fresh Claude Code session at the repo root. It is
> self-contained. Deliverable: a restructured Loop 3 + consistent Loop 4 in
> `slides/marp/deck/course2.md`, a new appendix section at the end of the deck,
> one new multi-head figure, PDF re-rendered and visually verified. This is the
> largest of the three deck-revision briefs; read the whole file before editing.

## Read first (hard gate)

1. `slides/marp/COOKBOOK.md` — the authoring contract.
2. `slides/figures/PALETTE.md` — the figure generation spec.
3. In `slides/marp/deck/course2.md`, read everything from the `divider-04`
   slide to the end of file (all of Loop 3 + Loop 4 + final CTA).
4. Skim the Transformer station code (`apps/course2/src/stations/` — find the
   transformer station) just enough to confirm the Layer/Head controls' actual
   UI labels and behaviour, so the new slide's station callback names what
   students actually see. The station runs real Qwen3-0.6B attention; do not
   claim head behaviours you cannot reasonably expect there (see figure spec).

## Why this exists (Harry's call — this OVERRIDES existing speaker notes)

By the time Loop 3 lands, students have been absorbing hard material for ~2
hours. The current tail of Loop 3 piles on three more abstractions: positional
embedding, residual connections, and Q/K/V. Harry's decision: none of these
earn their cost at that point in the day. What DOES earn its place is
**multi-head** — it connects directly to the Layer/Head dial students just
touched in the station, and answers a question they can act on: what is a
"head" and why are there many?

Note: the QKV slide's 講者備忘 currently says 「QKV 一定要留」. That was the
earlier call; **this brief supersedes it.** QKV moves to the appendix.

## The edits

**File: `slides/marp/deck/course2.md` — this file ONLY.** Do not touch
`slides/marp/deck/sections/*.md` (stale build artifacts).

### 1. Cut four slides from the main flow (they move to the appendix, step 4)

In order of appearance after the Transformer station's 「畫面長這樣」slide:

- 「attention 的盲點 _下一道牆_」 (`attention_orderblind.png`)
- 「補丁一：把順序塞回去 _Positional Embedding_」 (`pe_stripes.png`)
- 「補丁二：給資訊一條捷徑 _Residual Connection_」 (`residual_skip.png`)
- 「attention 怎麼決定看誰 _Query · Key · Value_」 (`qkv_diagram.png`)

The main flow goes straight from the station's 「畫面長這樣」 to the new
multi-head slide (step 2), then to the reworked summary (step 3).

### 2. Add ONE new multi-head slide

Insert where the cut sequence began.

**The pedagogy** (write it in the deck's voice):

- Driving question: 站上那個 Head 轉盤，轉的是什麼?（anchor to what they JUST
  touched — the Layer/Head dial in the station）
- Core idea: 一個注意力矩陣，一次只能表達一種「誰看誰」。所以 Transformer 開了
  **好幾個頭**，同一句話同時用好幾種眼光看：可能有一個頭專盯前一個字、有一個頭
  追代名詞指的是誰、有一個頭黏著標點。每個頭各看各的，最後再把大家看到的合起來。
- Frame head behaviours honestly: 常見的頭大概長這幾種樣子, not 第 3 層第 5 號頭
  就是代名詞頭. Real heads are messier; the notes should say students may find
  heads with no obvious personality, and that is normal.
- **Station callback (this is the hands-on payoff, on the slide face):** send
  them back to `/transformer` with a hunt: 轉 Layer 和 Head，找一個「個性最明顯」
  的頭，跟隔壁的人比誰找到的頭最有戲。Use the dial names exactly as the station
  UI shows them.
- Single lime emphasis on the core idea (e.g. **好幾個頭，各看各的**).
- No formulas, no concat/projection mechanics, no head-dimension math.

**Speaker notes** (required, both blocks): 講者備忘 covers running the ~3 min
head-hunt live and debriefing one or two heads students found; 自學備註 is the
standalone explanation, and may mention that heads are learned, not assigned
roles.

### 3. Rework the Loop 3 summary slide 「拼起來，就是 Transformer _attention ＋ 三塊補丁_」

- New subtitle (no longer 三塊補丁 — those moved out).
- Capsules now cover only what the main flow taught: **注意機制 Attention**
  (每個字直接看所有字) and **多頭 Multi-head** (好幾個頭各看各的). Two capsules is
  thin for the `caps` layout, so you may add a third capsule that honestly
  recaps something taught in this Loop (e.g. causal「只看得到左邊」from the
  station slide) — judge against the COOKBOOK layout.
- Add ONE plain line under the capsules: 真正的 Transformer 還有幾塊工程補丁
  （位置、捷徑等），放在附錄，想深挖的回家看。That line is the only main-flow
  mention of PE/residual/QKV.
- Rewrite both notes blocks to match.

### 4. Build the appendix

After the final CTA slide (「零件拼起來，就是大模型」), append:

- A marker slide (`_class: divider` won't work without baked art; use
  `_class: statement` per the COOKBOOK): title like 附錄 _給想深挖的你_, one line
  telling self-study readers these pages are not taught live. Set
  `<!-- footer: 附錄 -->`.
- The four cut slides, in this order (order-blindness is PE's setup, so it
  leads): 盲點 → PE → residual → QKV. Keep their figures and 自學備註 mostly
  intact (that is the appendix's value). Rewrite each 講者備忘 to appendix
  framing: 課上不講，只有時間多到爆或被問到才回來帶. Delete the
  「QKV 一定要留」 sentence. Remove the stale `<!-- 可壓縮 -->` markers. Keep the
  STATION SPEC comments (still true). Keep the transformer-explainer chip on the
  QKV slide.
- The 盲點 slide's copy says 「下一道牆」 — soften it for appendix context (it is
  no longer a wall in the live narrative arc).

### 5. Consistency sweep over Loop 4 + timing

Nothing untaught may appear in the main flow as if it were taught:

- 「三個架構，其實是三個假設」: the Transformer column says 「再補上位置與捷徑
  兩塊」— reword around what was taught (直接互看 + 多頭各看各的). Fix the notes
  to match.
- Final CTA 「零件拼起來，就是大模型」: the parts list 「記憶、直接互看、位置、
  捷徑」 must become parts that were actually taught, e.g. drawn from 切塊、
  語意即距離、記憶、直接互看、多頭各看各的 (pick four that read well; keep the
  rhythm). Fix both notes blocks, which currently map the four words to
  PE/residual.
- `divider-04` timing comment: change to `<!-- ⏱ Loop 3：36 min · hands-on 23 -->`
  and drop the `（PE/residual 可壓縮，共 −10）` note (cuts free ~10 min; the
  multi-head slide + head-hunt spends ~4; the rest is Loop 2's, handled in a
  separate session — do not touch Loop 2 yourself).

## New figure

Write `slides/figures/generate-multihead.py` producing
`slides/figures/multihead_heads.png`:

- One short sentence (with a pronoun, e.g. 小明 養 了 一隻 貓 ， 牠 很 可愛)
  repeated in 3 side-by-side panels labelled 頭 A / 頭 B / 頭 C, each panel
  drawing a DIFFERENT arc pattern over the same tokens: one head mostly
  previous-token arcs, one head a pronoun→antecedent arc (牠→貓), one head
  arcs to punctuation/句首. Caption territory: 同一句話，三種眼光.
- Label panels 頭 A/B/C, NOT layer/head numbers — this is an illustration of
  head diversity, not a measurement. Add the deck's 示意圖 badge convention
  (see `generate-rnn-walls.py` for how the unstable-loss figure does it).
- Follow `PALETTE.md`: transparent bg, hard corners, CYAN/PURPLE/magenta
  `#FF4EAB` as the three per-head accents, CJK font helper. Copy boilerplate
  from an existing generator.
- Run with: `uv run --with matplotlib --with numpy --with fonttools python3
  slides/figures/generate-multihead.py`

## Constraints

- **Do NOT touch any 「畫面長這樣」 slides** (including the Transformer one).
- Do NOT touch the 「換個想法」 slide (`rnn_vs_attention`), the Transformer
  station hand-off slide, or anything before Loop 3.
- No em-dashes (— or ——) in slide copy. Keep copy tight.
- One lime emphasis per slide, max.
- Preserve every slide's 講者備忘 + 自學備註 two-block notes structure.

## Verify (hard gate before declaring done)

From `slides/marp/`:

```bash
npx marp --config marp.config.js --allow-local-files deck/course2.md -o out/course2.pdf
npx marp --config marp.config.js --allow-local-files deck/course2.md --images png -o out/verify/course2.png
```

Read the PNGs of: the new multi-head slide, the reworked summary, both Loop 4
slides, the appendix marker, and all four appendix slides. Then grep the deck
for `positional|residual|QKV|Q／K／V|位置編碼|殘差|捷徑` and confirm every
main-flow hit is either the summary slide's single appendix pointer or inside
the appendix. Fix and re-render until clean. Report the final slide count and
where the appendix starts.
