# Course 2 — Slide Content (模型架構演進：MLP → RNN → Transformer)

> **Status:** skeleton — content not yet written. This file is the authoring
> surface for the Course 2 lecture deck. A future Claude Code session fills in
> the per-slide entries below; Harry then lays each slide out in **Affinity**
> from the description alone. No HTML, no slide framework — this file *is* the
> deliverable.

---

## For the writing agent — read this first

You are writing **slide copy + layout notes**, not building anything. Your output
goes in the per-slide entries in this file. Harry lays them out by hand in
Affinity, so every slide needs both *what it says* and *how it sits*.

**Inputs (read both before writing):**
1. **Content source** — `docs/course-spec.md`, section **「第二堂課：模型架構演進」**.
   That spec is the ground truth for the pedagogy, the loop beats, and the
   撞牆 (hit-a-wall) rhythm. Do not invent new pedagogy; translate the spec's
   beats into slides.
2. **Form source** — `slides/design-system/` (reverse-engineered from Harry's
   shipped "Attention Tracker" deck). Read in this order:
   - `SYSTEM.md` — the mental model + the rules that matter most.
   - `archetypes.md` — the slide archetypes + fill-in skeletons. **Pick every
     slide's archetype from here.**
   - `components.md` — component anatomy, esp. the **capsule** (§4).
   - `tokens.md` — colors, the three type roles, footer/pagination system.

**The division of labor (important):** Course 2 is a **Web App** course — the
heavy interaction lives in browser *stations* (see `docs/course-spec.md`
開發清單 → 第二堂課, and `apps/course2/`). The **slides are the lecture scaffold
around those stations**: the hook, the concept reveal, the moment a method hits a
wall, the hand-off into a station, and the wrap-up. Do **not** rebuild station
content as static slides. When a beat is "students explore in the tool," the
slide is usually a short framing/transition slide, and you should note
`→ hand off to <station>`.

**Output rules:**
- Fill in the per-slide entries. Keep the numbering contiguous; renumber if you
  insert slides.
- Copy is **zh-primary** (Traditional, camp audience is TW high-schoolers). Add an
  **en subtitle** only where the chosen archetype/component uses one (e.g. the
  canonical capsule). Don't force English everywhere.
- Mark **lime emphasis** inline with `**[lime: …]**` — lime is the *single* text
  accent; at most one emphasis run per statement (SYSTEM.md rule 2).
- Mark the **white/grey two-tier split** on titles: `L1 (white)` / `L2 (grey)`.
- For capsules, specify the exact anatomy per `components.md §4` (which variant,
  emoji, zh heading, en subtitle?, one body line).
- Keep numbers/stats **inline at body size, recolored lime** — there is no
  big-stat archetype (SYSTEM.md rule 3).
- Do **not** silently borrow tokens/components that aren't in the design system.

---

## Per-slide entry template (copy this for each slide)

```
### Slide NN — <working title>
- **Archetype**: <cover | section-divider | statement | chat-log | flow-diagram |
  comparison-columns | data-viz | capsule-list | experiment-intro |
  outline/TOC | resources-board | other(describe)> (from archetypes.md)
- **Footer-right (section label)**: <constant within a section — see §Sections>
- **Loop / beat**: <which Course-2 loop + beat from docs/course-spec.md>
- **Title**: L1 (white) «…» / L2 (grey) «…»   [mark **[lime: …]** if any]
- **Body / component content**:
    - <body lines, capsule contents, chat turns, flow nodes, etc.>
    - <for capsules: variant + 📌emoji + zh heading + (en subtitle?) + one body line>
- **Layout notes (Affinity)**: <which archetype skeleton; block placement
  (left third / centered / two-zone split / full-bleed); anything non-default>
- **Assets / data needed**: <charts, station screenshots, viz, diagrams — or "none">
- **Hand-off**: <→ station name from 開發清單, or "none">
```

---

## Sections & footer labels (proposal — writer may adjust)

The deck's footer-right label stays constant across a section (tokens.md §4).
Proposed Course 2 sections, following the spec's loops. Finalize the exact label
strings when you write:

| Section | Footer-right label (proposed) | Covers |
|---------|-------------------------------|--------|
| Cover / Outline | (own labels) | title + agenda |
| Loop 0 | 文字怎麼變數字 | Tokenizer + Embedding |
| Loop 1 | MLP 吃文字 | bag-of-embeddings → 順序撞牆 |
| Loop 2 | RNN | next-token + hidden state + RNN 的牆 |
| Loop 3 | Transformer | attention + PE + residual + QKV |
| Loop 4 | 架構即樂高 | wrap-up + 銜接第三堂 |

Section boundaries open with a **section-divider** (glitch/datamosh full-bleed,
"Section 0X." kicker — tokens.md §5, archetypes.md).

---

# SKELETON — fill in the slides below

> Each loop lists its beats from `docs/course-spec.md`. Turn each beat into one
> or more slide entries using the template. Delete the `TODO` lines as you go.
> Slide counts are illustrative — add/remove to fit the beat and the 3-hour run.

## Front matter
### Slide 01 — Cover
TODO — archetype `cover`. Course-2 title (模型架構演進：MLP → RNN → Transformer),
speaker/venue/date meta block. Mirror the Attention Tracker cover pattern.

### Slide 02 — Outline
TODO — archetype `outline/TOC`. The five loops as the agenda.

## Loop 0 — 文字怎麼變數字：Tokenizer + Embedding (~40 min)
Beats (docs/course-spec.md): 要餵文字得先把字變數字 → **Tokenizer 探索**（一段字→
token/id，「模型眼中只有 token」）→ **Embedding 探索**（逛 embedding space，相近語意
靠在一起）→ bias 收尾（man:king :: woman:? → arXiv 1607.06520）→ 「每個字都是一排
數字，可以餵給上一堂的 MLP 了」。
Stations: Tokenizer 探索站, Embedding 探索站.

### Slide 03 — <section divider: Loop 0>
TODO — `section-divider`, "Section 01." + zh title.
### Slide 04 — <Loop 0 hook / framing>
TODO — likely `statement`.
TODO — add slides for: tokenizer hand-off, embedding hand-off, bias payoff,
Loop 0 收束 into "可以餵給 MLP 了".

## Loop 1 — MLP 吃文字 + 順序撞牆 (~40 min) 〔本堂核心 beat〕
Beats: 橋接（bag-of-embeddings → 上一堂 MLP，做國會情感分析，**會動、假安全感**
「那不就 MLP 就好？」）→ **撞牆 demo**（shuffle 開關：MLP(bag) shuffle 前後輸出逐字
相同 → 順序被丟掉；對照「不好」vs「好不」）→ 收束：MLP 沒有「順序」假設 → 需要
**假設順序有意義**的架構 → RNN。
Station: 順序撞牆站.

### Slide 05 — <section divider: Loop 1>
TODO — `section-divider`, "Section 02.".
TODO — add slides for: 橋接/假安全感 statement, shuffle 撞牆 hand-off,
「不好 vs 好不」對照 (comparison-columns?), 收束到 RNN 的 statement.

## Loop 2 — RNN：把順序吃進去 (~50 min)
Beats: next-token 互動（context 越大猜越準，參考 Brilliant）→ 引入 RNN（逐 token 吃、
hidden state 往後傳，動畫）→ 暴露 RNN 的牆（長 context 易忘；訓練不穩 梯度爆炸/消失，
loss 亂跳）為 Transformer 鋪路。
Stations: next-token 站, RNN 視覺化.

### Slide 06 — <section divider: Loop 2>
TODO — `section-divider`, "Section 03.".
TODO — add slides for: next-token hand-off, RNN concept reveal (flow-diagram of
hidden state), RNN 的兩道牆 (capsule-list or statement).

## Loop 3 — Transformer：讓每個字直接看到所有字 (~50 min)
Beats: 解法切入（與其一站站傳記憶，不如每個 token 直接看向所有 token = attention）→
逐步補架構（時間緊可略）：① PE（attention 對順序無感 → 塞回「第幾個」）② residual
（疊深訓練變難 → 捷徑繞過層，loss 變穩）③ QKV（attention 來源解釋；接
transformer-explainer / poloclub）。
Station: Transformer 站 (attention 連線, PE on/off, residual on/off, QKV).

### Slide 07 — <section divider: Loop 3>
TODO — `section-divider`, "Section 04.".
TODO — add slides for: attention 解法 statement, attention hand-off,
PE / residual / QKV patch reveals (each a short statement or flow-diagram).

## Loop 4 — 收尾：架構即樂高 (~15 min)
Beats: 串成一條線 **MLP（order-blind）→ RNN（假設順序/記憶）→ Transformer（全局直接
互看 + 補丁）**；銜接第三堂（LoRA / 生成 / RL）。

### Slide 08 — <wrap-up: 三架構一條線>
TODO — likely `comparison-columns` or `capsule-list` (3 architectures).
### Slide 09 — <銜接第三堂>
TODO — `statement`, lime CTA line.
### Slide 10 — Resources
TODO — `resources-board` (Brilliant next-token, transformer-explainer,
arXiv 1607.06520, etc.).

---

## Notes back to Harry (writer fills as they go)
- Open questions / decisions needed:
- Slides that depend on a station screenshot not yet built:
- Any place the spec beat didn't map cleanly to an archetype:
