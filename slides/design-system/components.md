# components.md — Attention Tracker (SITCON 2026)

Descriptive component inventory. One entry per reusable element. Skeletons are
copy-ready structural sketches (not framework code). Colors/types reference
tokens.md. Sizes are relational (see tokens.md §2).

Order: Footer · Title block · Statement block · **Capsule (+ 6 variants)** ·
Chat bubble · Flow node & connector · Attention heatmap · Distribution curve /
small-multiples · Chart + Key-Insight sidebar · Mono config appendix ·
Section-divider block · Legend / colorbar · Resource panel.

---

## 1. Footer band
- **Purpose**: constant orientation strip on every slide.
- **Anatomy**: full-width band at the bottom edge, three zones, small grey BODY.
- **Skeleton**:
  ```
  [left: SITCON 2026]   [center: N/41]   [right: <Section Label>]
  ```
- **Grid placement**: below the safe area, spanning full width, all slides.
- **Do**: keep left+center fixed; keep the right label constant within a section.
- **Don't**: place over busy imagery expecting legibility (dividers 4/26/38 lose
  contrast — a known accident, not a target).
- **Refs**: all 41 slides.

---

## 2. Title block (slide / section)
- **Purpose**: name the slide or open a section.
- **Anatomy**: 1–2 HEAD lines using the two-tier split. Common forms:
  - *Two-line cover/statement title*: L1 white, L2 grey (slide 1).
  - *Section divider*: grey "Section 0X." kicker over a white CJK question,
    left-anchored lower-third (4, 11, 26, 38).
  - *Data-viz split title*: grey lead phrase + white emphasis clause on one line
    (29 "宏觀趨勢："+"穩定的防禦邊界"; 30, 32, 33, 36).
  - *Oversized grey watermark*: title bled across the top in a low-contrast grey
    so it reads as background (15, 16, 23; ghost "Takeaway" 39).
- **Skeleton**:
  ```
  <kicker grey?>            e.g. Section 03.
  <HEAD line 1 white>
  <HEAD line 2 grey?>
  ```
- **Do**: use grey for the secondary/eyebrow half; left-anchor titles.
- **Don't**: give a slide two equal-weight full-contrast title lines (the split
  is the identity).
- **Refs**: 1, 4, 9, 11, 15, 24, 26, 29, 37, 38.

---

## 3. Statement block
- **Purpose**: a full-screen sentence / rhetorical beat; the deck's most common
  content type.
- **Anatomy**: 1–3 large lines, left-aligned within a centered measure, indented
  ~1/4 from the left, huge surrounding whitespace. Two flavours:
  - *Two-tier plain*: bold white lead + grey follow-up (12, 25).
  - *Lime-payoff*: white setup line(s) + one **lime** emphasis run or a final
    lime line (5 inline "36.8%", 10, 17 "「分心的腦袋」", 40 line-2 lime).
  - Optional top source caption with 🔗 (5) or a divider rule + grey sub-list
    (25).
- **Skeleton**:
  ```
  <🔗 source caption grey?>            (optional, top)
  <white setup line>
  <white line, with ONE lime run>      OR  <lime payoff line>
  ```
- **Do**: keep any statistic **inline at body size** and merely recolor it lime
  (slide 5) — see the big-stat note in archetypes.md.
- **Don't**: blow a number up into a hero stat; don't use more than one lime run.
- **Refs**: 5, 10, 12, 17, 25, 40.

---

## 4. CAPSULE — the core lesson card

The capsule is the deck's signature content unit. It always packs an **icon/mark
+ a heading + (optional) en subtitle + a body line** into a rounded `#171717`
card. Because its anatomy varies across slides, the variants are named below and
the **canonical** form is fixed first.

### 4.0 CANONICAL capsule = slide 9
The reference all other forms are measured against. All four slots present.

- **Anatomy (left→right, one row)**:
  1. **Emoji icon** — flat glyph, at the **LEFT** edge (📝 提示工程, 🏰 外部護欄,
     🧹 特徵過濾, 📦 執行沙盒).
  2. **Title block** (immediately right of icon, stacked):
     - **zh heading** — bold **white** HEAD (提示工程).
     - **en subtitle** — smaller **grey** BODY directly beneath (Prompt
       Engineering).
  3. **Body line** — a single **grey** CJK sentence, to the **right** of the
     icon+title block (internal two-column: `icon+title | body`).
  - **No divider rule**, no number, no thumbnail. Rounded `#171717`, generous
    uniform padding.
- **Copy-ready skeleton**:
  ```
  ┌───────────────────────────────────────────────┐
  │ <emoji>  <zh heading (white)>   <one grey body │
  │          <en subtitle (grey)>    line, CJK>    │
  └───────────────────────────────────────────────┘
  ```
- **Why canonical**: it is the only form carrying **all four slots** (icon + zh +
  en + body) with the icon-left two-column layout, and it is the deck's own
  reference "常見防禦" list. Every other capsule is this minus/plus one slot.
- **Grid placement**: vertical stack of N in the right ~60% of a two-zone split,
  opposite a big left title.
- **Do**: one body line; icon left; en subtitle directly under zh heading.
- **Don't**: mix heading languages between capsules in one stack (that's the
  slide-8 anti-pattern).

### 4.1 Variant — HORIZONTAL (with vertical divider) — slides 24, 27, 31, 37
Canonical + a **thin vertical divider rule** separating the `icon+heading` block
from the body. This is the most-shipped form.
- Icon at **far-left**, then zh heading (+ en subtitle), **│ vertical rule │**,
  then body on the right.
- **en subtitle present** on 27 (Context length), 31 (Context Dilution), 37
  (Context-Dilution). **en subtitle ABSENT** on 24 → see 4.2.
- **Skeleton**:
  ```
  ┌──────────────────────────────────────────────────┐
  │ <emoji>  <zh heading>        │  <grey body,        │
  │          <en subtitle>       │   1–2 CJK lines>    │
  └──────────────────────────────────────────────────┘
  ```
- **Refs**: 24, 27, 31, 37. (Treat the 9-vs-24/37 divider difference as a
  sub-note, not a separate component.)

### 4.2 Variant — zh-only (no en subtitle) — slide 24 (+ 8, 32, 35)
Same horizontal card but the **en subtitle slot is dropped**; heading is zh-only.
- 24 (💡無需訓練, ⚡零耗算力, 💪降維打擊, 🚀小巧強悍): icon-left + vertical rule +
  body, no subtitle.
- The experiment-intro 實驗目標/實驗流程 capsules (32, 35) are also zh-only.
- **Rule-vs-variant signal**: 24 (zh-only) vs 27 (bilingual) are the same layout
  differing only by the subtitle slot — the cleanest evidence the en subtitle is
  optional.

### 4.3 Variant — VERTICAL — slide 39
- zh heading **top-LEFT**, emoji icon **top-RIGHT** of the same row, a
  **HORIZONTAL divider rule** beneath, then the body **below**. **No en
  subtitle**.
- Cards arranged as a **horizontal row of 3** (vs the usual vertical stack).
- **Skeleton**:
  ```
  ┌────────────────────────┐
  │ <zh heading>    <emoji> │
  │────────────────────────│
  │ <grey body, CJK>       │
  └────────────────────────┘
  ```
- **Refs**: 39.

### 4.4 Variant — NUMBERED — slide 19
- A large **faint grey ordinal** (01/02/03) replaces the emoji (top-left corner);
  zh heading, grey en subtitle, one grey body line. Own rounded panel each,
  vertical stack. Used as a walkthrough tied to numbered overlay callouts on the
  adjacent heatmap.
- **Skeleton**:
  ```
  ┌───────────────────────────────┐
  │ 0N   <zh heading>             │
  │      <en subtitle (grey)>     │
  │      <one grey body line>     │
  └───────────────────────────────┘
  ```
- **Refs**: 19.

### 4.5 Variant — THUMBNAIL — slide 16
- **No icon, no number, no body line.** zh heading + grey en subtitle top-left, a
  small **square viridis heatmap thumbnail** in the top-right corner. Six cards
  live inside two shared rounded containers (3+3) along a shallow→deep axis.
- **Skeleton**:
  ```
  ┌──────────────────────────┐
  │ <zh heading>   [▦ viridis │
  │ <en subtitle>   thumbnail]│
  └──────────────────────────┘
  ```
- **Refs**: 16.

### 4.6 Anti-pattern — STRIPPED / inconsistent — slide 8 (do NOT copy)
- Within one slide the capsule headings are inconsistent: LEFT stack **Latin-only**
  (Direct Injection / Indirect Injection), CENTER stack **zh-only** (語境混淆…),
  neither carries the en subtitle. The right "災難擴散" block abandons capsule
  anatomy entirely (multi-paragraph, no single body line) → read it as a
  statement panel, not a capsule.
- **Use as the "what not to do" foil**: pick one heading convention per stack.
- **Refs**: 8.

---

## 5. Chat bubble
- **Purpose**: reconstruct an assistant/user conversation.
- **Anatomy**: rounded `#171717` bubble, width-fit to content, emoji-avatar +
  fullwidth "：" prefix. **Left-aligned = assistant** (🤖), **right-aligned =
  user** (🙂). Auto-height for multiline; may contain a mono code-fence cue
  (```cpp).
- **Skeleton**:
  ```
  [🤖：assistant text]                    (left)
                       [user text：🙂]     (right)
  [🤖：multiline…\n```lang]               (left)
  ```
- **Grid placement**: vertical stack, centered group, alternating sides.
- **Refs**: 6. (Slide 13 is a richer chat-UI widget — see one-offs, not a
  reusable bubble.)

---

## 6. Flow node & connector
- **Purpose**: show a sequence / causal chain.
- **Anatomy**: rounded nodes — small centered **pill** for a short step, or a
  wide **panel** for a step carrying a mono code/log block + bold role header
  (emoji + role name). Connected by **arrows** with small grey CJK edge labels.
  Flow can be **vertical** (7) or **horizontal 3-stage under grey stage headers**
  (8: 進入點/漏洞成因/最終衝擊). A schematic variant stacks "layer" pills with ⋮
  gaps and routes highlighted lime node-chips through an aggregation bracket into
  a binary threshold branch (23).
- **Skeleton (vertical)**:
  ```
  ( pill: step 1 )
        │  <edge label>
        ▼
  [ panel: 🚩 role — mono log block ]
        │  <edge label>
        ▼
  [ panel: 💥 role — mono log block ]
  ```
- **Do**: label arrows; use the danger/safe pair for outcome branches (23:
  拒絕 purple / 通過 green).
- **Refs**: 7, 8, 23.

---

## 7. Attention heatmap (data-viz)
- **Purpose**: show attention weights.
- **Anatomy**: matrix of cells shaded by the **viridis ramp** (purple=low →
  lime=high). Attention matrices are **lower-triangular** (causal mask — intrinsic
  to attention, not styling). Token labels on top axis (rotated) + left axis.
  Often paired with a viridis **legend/colorbar** (不關注→很關注) and lime
  highlight boxes / numbered overlay callouts (19). Cross-lingual variant is a
  full 10×10 square heatmap with a vertical colorbar (33, 34).
- **Skeleton**:
  ```
  [legend: 不關注 ▓▓▓▓ 很關注]
  <rotated col token labels>
  <row token labels> [ ▦ viridis matrix ]   (+ lime callout boxes)
  ```
- **Refs**: 14, 16 (thumbnails), 19, 33, 34.

---

## 8. Distribution curve / small-multiples
- **Purpose**: normal-vs-attack score separation, per head.
- **Anatomy**: two overlapping filled bell curves using the viridis **endpoints
  as a danger/safe pair** — **purple = low/danger**, **lime = high/safe** —
  with optional 中心點 dashed center line + "K 個標準差" span (20). Tiled as a
  **small-multiples wall** (~7–8 cols) filling the frame, with the center tiles
  cleared to seat a statement overlay (21, 22). Empty cells shown as grey-dashed
  placeholders; selected cells ringed with a **lime dashed border** (22).
- **Skeleton (wall)**:
  ```
  [tile][tile][tile] … edge-to-edge grid
  [tile][ cleared void: centered statement ][tile]
  [tile][tile][⌀ lime-dashed selected ][tile]
  ```
- **Refs**: 20, 21, 22.

---

## 9. Chart + Key-Insight sidebar (data-viz)
- **Purpose**: present an experimental result with takeaways.
- **Anatomy**: full-width slide title; **line chart left ~65%** with mono Latin
  chart title + axes + the **categorical 4-color series** (purple/magenta/cyan/
  lime), translucent confidence bands, and a dashed ~0.5 threshold line; a
  **rounded legend pill** with a 2×2 dot+label grid; **right ~35% "Key Insight:"
  numbered list** (bold CJK lead phrase + grey sentence). Top-right ↑/↓ semantic
  gloss (高分=安全 / 低分=危險). Heatmap flavour swaps the line chart for a
  viridis heatmap (33, 34).
- **Skeleton**:
  ```
  <full-width title (grey lead + white clause)>
  ┌─ line/heatmap chart ─────────┐   Key Insight:
  │  4 categorical series + band │   1. <bold lead> <body>
  │  --- threshold 0.5 ---       │   2. <bold lead> <body>
  │  [legend pill 2×2]           │   3. …
  └──────────────────────────────┘
  ```
- **Do**: use the categorical set for series; keep lime out of *text* emphasis
  here (it's a series color).
- **Refs**: 29, 30, 33, 34, 36.

---

## 10. Mono config appendix
- **Purpose**: reproducibility metadata for an experiment.
- **Anatomy**: very low-contrast (recessive) **Fira Code** block anchored bottom-
  left, laid out in columns — "Target Models" (Qwen3 IDs), "Model Configs"
  (key: value), "Languages/Conditions". Intentionally dim.
- **Skeleton**:
  ```
  Target Models      Model Configs           Languages (10x10)
  Qwen3-0.6B         max_output_tokens: 1    English (en), German (de)…
  Qwen3-8B           threshold: 0.50         …
  ```
- **Refs**: 28, 32, 35. (Contains the "tempature" typo on 35 — see bugs.)

---

## 11. Section-divider block
- **Purpose**: open a numbered section.
- **Anatomy**: grey "Section 0X." kicker over a white CJK question, left-anchored
  lower-third, over a **full-bleed glitch background** (tokens.md §5).
- **Skeleton**:
  ```
  Section 0X.            (grey kicker)
  <CJK section question>  (white HEAD)
  … over full-bleed datamosh image …
  ```
- **Refs**: 4, 11, 26, 38.

---

## 12. Legend / colorbar
- **Purpose**: decode a color mapping.
- **Two kinds**: (a) **viridis** gradient bar / vertical colorbar with CJK
  end-labels (不關注→很關注, 14/19; 高分/低分 攻擊成功率/失敗率, 33/34); (b)
  **categorical** dot+label pill (2×2) for chart series (29, 30, 36).
- **Refs**: 14, 19, 29, 33, 36.

---

## 13. Resource panel
- **Purpose**: closing references board.
- **Anatomy**: two side-by-side rounded `#171717` panels, each with a bold CJK
  header + top-right icon. Left = media gallery (thumbnail + source-name +
  underlined title). Right = citation list (underlined white link title + grey
  italic authors/venue/year). Top-right presenter credit line above the panels.
- **Refs**: 41.

---

## One-offs (documented, not reusable components)
- Cover **type/color legend** + **pirate easter-egg** mono block (1).
- Nested lime/purple **dashed annotated frames** + realistic chat-UI widget
  (Sonnet 4.6 chip, orange send button) (13) — the only orange in the deck.
- **Multi-head annotated sentence**: colored dashed underlines + emoji head
  callouts arrowing onto spans (15).
- **Fanned paper-pages** citation visual (18).
- Oversized **ghost watermark** words: "Attention Overview" (14), "Focus Score"
  (23), "Takeaway" (39).
