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
- **Leave room for the interactive parts.** Each station gets its own slide(s): a
  *hand-off slide* that frames the task + poses the question students explore
  (fill `INTERACTIVE / STATION`), and — where it earns it — a short *debrief
  slide* after (what we saw → the wall/insight it sets up). The deck must account
  for station time, not skip over it. `ASSETS` for a not-yet-built station =
  "station screenshot TBD" so nothing silently blocks layout.
- **Write the whole deck end-to-end.** Complete every loop; the deck must read
  cover → resources as one continuous talk, each slide's exit setting up the
  next. Don't leave `TODO` holes.

---

## Per-slide entry format (Affinity-migration-friendly — copy this per slide)

Each slide is **two blocks**: **TEXT** = the exact strings to typeset (Harry
copies these straight into Affinity — no rewriting, no interpreting) and
**LAYOUT** = how to arrange them. Keep them separate so migration is copy-paste.
Footer values are spelled out on every slide. `TT` = total slide count — fill it
once numbering is final.

```
### Slide NN · <archetype> · <working title>
Footer — L: SITCON 2026 · C: NN / TT · R: <section label>

TEXT (verbatim — typeset exactly; mark accents, don't restyle)
- Title L1 (white): 「…」
- Title L2 (grey): 「…」
- Body: 「…」                         ← emphasis run marked [lime: …]
- Capsule N: 📌 · zh「…」 · en「…」 · body「…」   (variant: <from components.md §4>)
- (chat turn / flow node / axis label / list item — whatever the archetype needs)

LAYOUT
- Archetype skeleton: <name from archetypes.md>
- Block placement: <left third | centered | two-zone split | full-bleed | chart+sidebar>
- Notes: <anything non-default; if a staged build/reveal, give the order>

ASSETS: <charts, station screenshots, diagrams — or "none">
INTERACTIVE / STATION: <→ hand off to <station from 開發清單>; the one knob students
turn; what they should notice — or "none">
```

**Worked example** (shows the *format*, mirror this shape):
```
### Slide 01 · cover · 課程封面
Footer — L: SITCON 2026 · C: 01 / TT · R: Cover

TEXT (verbatim)
- Title L1 (white): 「模型架構演進」
- Title L2 (grey): 「MLP → RNN → Transformer」
- Meta — Speaker「…」 · Course「SITCON Camp 2026 ｜ ML」 · Date「…」

LAYOUT
- Archetype skeleton: cover
- Block placement: title lower-left third; meta block lower-right
- Notes: mirror the Attention Tracker cover; faint background grid on base

ASSETS: none
INTERACTIVE / STATION: none
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

## Time budget (180 min — the run plan)

Course 2 is 3 hours. This budget is **segment-level, not loop-level**, so the
lecture-vs-station split is visible: every slide that isn't a station hand-off is
lecture time, and lecture time is what steals from hands-on. **~95 of 180 min is
students' hands-on** — that ratio is the point (環境即引導). One **10-min break**
sits inside the 180, after Loop 1's 撞牆 (natural seam before RNN).

| Segment | Slides | Min | of which hands-on |
|---------|--------|-----|-------------------|
| Cover + outline | 01–02 | 3 | — |
| **Loop 0** divider + hook | 03–04 | 3 | — |
| · Tokenizer 探索站 | 05 | 10 | 8 |
| · tokenizer debrief | 06 | 2 | — |
| · 為什麼這樣切（subword） | 07 | 3 | — |
| · one-hot → embedding | 08 | 4 | — |
| · Embedding 探索站 | 09 | 12 | 10 |
| · debrief + bias | 10 | 6 | — |
| · Loop 0 close | 11 | 2 | — |
| **Loop 1** divider + bag-of-emb + 假安全感 | 12–14 | 6 | — |
| · **順序撞牆站** (本堂核心 beat) | 15 | 16 | 14 |
| · debrief（不好/好不）+ close → RNN | 16–17 | 8 | — |
| **☕ 休息** | — | 10 | — |
| **Loop 2** divider + next-token hook | 18–19 | 3 | — |
| · next-token 站 | 20 | 11 | 9 |
| · next-token debrief | 21 | 3 | — |
| · RNN flow-diagram | 22 | 5 | — |
| · RNN 視覺化站 | 23 | 13 | 10 |
| · RNN 兩道牆 | 24 | 8 | — |
| **Loop 3** divider + attention 切入 | 25–26 | 4 | — |
| · Transformer 站（attention） | 27 | 12 | 10 |
| · attention debrief（順序無感） | 28 | 3 | — |
| · PE patch *(compressible)* | 29 | 5 | 3 |
| · residual patch *(compressible)* | 30 | 5 | 3 |
| · QKV | 31 | 7 | 4 |
| · Transformer 零件 recap | 32 | 6 | — |
| **Loop 4** 三架構 + 銜接 + resources | 33–35 | 10 | — |
| **Total** | | **180** | **~95** |

**Release valve:** slides 29–30 (PE / residual) are marked *compressible* — the
spec itself says the Transformer patches are「時間緊的話可以直接去掉」(course-spec
Loop 3). QKV (31) stays — the spec says keep it (「不然最重要的 attention 來源沒有
解釋有點怪」). If a loop overruns, compress 29–30 first; that's the ~10-min buffer,
and it's spec-grounded, not invented.

---

# SKELETON — fill in the slides below

> Each loop lists its beats from `docs/course-spec.md`. Turn each beat into one
> or more slide entries using the template. Delete the `TODO` lines as you go.
> Slide counts are illustrative — add/remove to fit the beat and the 3-hour run.
> Size each loop's slides to its time budget (Loop 0 ~40 / L1 ~40 / L2 ~50 /
> L3 ~50 / L4 ~15 min), remembering the station time lives inside those budgets.
>
> **Finish with a continuity pass.** After the last slide, reread cover →
> resources and confirm: (1) footer `NN / TT` is contiguous and TT is correct;
> (2) each station has a hand-off slide (and a debrief where useful); (3) every
> loop's 撞牆 → new-tool → re-explore beat is intact and each slide sets up the
> next; (4) no `TODO` left. Record anything unresolved in "Notes back to Harry".

## Front matter

### Slide 01 · cover · 課程封面
Footer — L: SITCON 2026 · C: 01 / 35 · R: Cover

TEXT (verbatim — typeset exactly; mark accents, don't restyle)
- Title L1 (white): 「機器，是怎麼讀懂一句話的？」
- Title L2 (grey): 「模型架構演進：MLP → RNN → Transformer」
- Meta — Speaker「講者姓名」 · Course「SITCON Camp 2026 ｜ ML」 · Date「營期日期」

LAYOUT
- Archetype skeleton: cover
- Block placement: title lower-left third; meta block lower-right
- Notes: mirror the Attention Tracker cover — flat `#0A0A0A` + faint square grid
  on base; two-tier title (white over grey). This deck is a lecture scaffold, so
  no need to reproduce the cover's token-legend / easter-egg one-offs; a plain
  meta table (grey labels / white values) is enough.

ASSETS: none
INTERACTIVE / STATION: none

### Slide 02 · outline/TOC · 課程地圖
Footer — L: SITCON 2026 · C: 02 / 35 · R: Outline

TEXT (verbatim)
- Title L1 (white): 「這堂課，我們要蓋一台語言模型」
- Title L2 (grey): 「五個關卡，一次補一個零件」
- Group 01 header (grey numeral + white name): 「01. 文字怎麼變數字」
  - item: 「Tokenizer 探索站 ……… P. 05」
  - item: 「從 one-hot 到 embedding ……… P. 08」
  - item: 「Embedding 探索站 ……… P. 09」
  - item: 「語意裡的偏見 ……… P. 10」
- Group 02 header (grey numeral + white name): 「02. MLP 吃文字」
  - item: 「bag-of-embeddings ……… P. 13」
  - item: 「順序撞牆站 ……… P. 15」
  - item: 「順序丟不得 → RNN ……… P. 17」
- Group 03 header (grey numeral + white name): 「03. RNN」
  - item: 「next-token 站 ……… P. 20」
  - item: 「RNN 視覺化 ……… P. 23」
  - item: 「RNN 的兩道牆 ……… P. 24」
- Group 04 header (grey numeral + white name): 「04. Transformer」
  - item: 「attention：每個字互看 ……… P. 27」
  - item: 「位置與捷徑（PE／residual）……… P. 29」
  - item: 「Q／K／V ……… P. 31」
- Group 05 header (grey numeral + white name): 「05. 架構即樂高」
  - item: 「三架構一條線 ……… P. 33」
  - item: 「銜接第三堂 ……… P. 34」

LAYOUT
- Archetype skeleton: outline/TOC
- Block placement: five loop **groups**, each = a grey numeral「0N.」+ white loop
  name (mirrors the footer-right section label), with 2–3 grey sub-items beneath,
  right-aligned dotted leaders → `P. n` on the right (the Attention Tracker
  `……… P. n` pattern). Two-column feel: item label left, page number right.
- Notes: page numbers are the section divider / key-beat slides — keep them synced
  if slides get inserted (currently: L0 divider P.03, L1 P.12, L2 P.18, L3 P.25,
  L4 starts P.33). The group headers double as the section labels students see in
  the footer, so the agenda maps 1:1 onto the deck's sections.

ASSETS: none
INTERACTIVE / STATION: none

## Loop 0 — 文字怎麼變數字：Tokenizer + Embedding (~42 min)
Beats (docs/course-spec.md): 要餵文字得先把字變數字 → **Tokenizer 探索**（一段字→
token/id，「模型眼中只有 token」）→ 為什麼這樣切（subword 折衷）→ 從 one-hot 到
**Embedding**（編號沒語意 → one-hot 每字等距 → embedding 把語意壓進位置）→
**Embedding 探索**（逛 embedding space，相近語意靠在一起）→ bias 收尾（man:king ::
woman:? → arXiv 1607.06520）→ 「每個字都是一排數字，可以餵給上一堂的 MLP 了」。
Stations: Tokenizer 探索站, Embedding 探索站.

### Slide 03 · section-divider · Loop 0 進場
Footer — L: SITCON 2026 · C: 03 / 35 · R: 文字怎麼變數字

TEXT (verbatim)
- Kicker (grey): 「Section 01.」
- Title L1 (white): 「文字，怎麼變成數字？」

LAYOUT
- Archetype skeleton: section-divider
- Block placement: kicker + title left-anchored in the lower-third
- Notes: full-bleed glitch/datamosh background (tokens.md §5) replacing the grid;
  footer will lose contrast over the image — that's the known divider trade-off,
  fine here.

ASSETS: full-bleed glitch/datamosh background (reuse the deck's divider treatment)
INTERACTIVE / STATION: none

### Slide 04 · statement · 上一堂的模型，看不懂字
Footer — L: SITCON 2026 · C: 04 / 35 · R: 文字怎麼變數字

TEXT (verbatim)
- Setup line (white): 「上一堂，我們的模型只吃得下數字。」
- Payoff line (white, one lime run): 「但這堂課的輸入，是 **[lime: 一句話]**。」
- Follow-up (grey): 「要餵文字進模型，得先把字變成數字。」

LAYOUT
- Archetype skeleton: statement (lime-payoff flavour)
- Block placement: left-aligned within a centered measure, indented ~1/4 from
  left, generous whitespace
- Notes: this is the loop's 撞牆 setup — name the gap (模型只吃數字 vs 輸入是文字)
  before introducing the tool. One lime run only, on 一句話.

ASSETS: none
INTERACTIVE / STATION: none

### Slide 05 · statement · Tokenizer 探索站（hand-off）
Footer — L: SITCON 2026 · C: 05 / 35 · R: 文字怎麼變數字

TEXT (verbatim)
- Setup line (white): 「先看看：機器是怎麼『讀』一句話的。」
- Task line (white, one lime run): 「把一段字丟進去，看它被切成哪些 **[lime: token]**。」
- Follow-up (grey): 「輪到你動手 → 換不同的字、不同語言，看看切法怎麼變。」

LAYOUT
- Archetype skeleton: statement (hand-off framing)
- Block placement: left-aligned centered measure; seat a station/tokenizer
  screenshot in the lower or right band (the colored-token view reads as the
  slide's visualization)
- Notes: short framing slide — the teaching happens in the tool, not here. The
  reference visual is the coloured-chunk output from platform.openai.com/tokenizer;
  drop a real screenshot in so students recognise the tool.

ASSETS: tokenizer screenshot — pull the coloured-token view from
platform.openai.com/tokenizer (reference); station screenshot TBD (Tokenizer 探索站)
INTERACTIVE / STATION: → hand off to **Tokenizer 探索站**. Knob students turn:
輸入文字 → 看切出來的 token 與 id（換字、換標點、換中英文）。Notice: 一個「字」常被
拆成好幾塊、空格與大小寫也算數 → 切法不直覺。

### Slide 06 · statement + tokenizer screenshot · Tokenizer 收束（debrief）
Footer — L: SITCON Camp 2026 · C: 06 · R: ML Course 2 ｜ 文字怎麼變數字

TEXT (verbatim — typeset exactly; mark accents, don't restyle)
- Payoff line (white, top, one lime run): 「所以在模型眼中，只有 **[lime: Token]** 和它的編號。」
- Left panel toggle (chip): 「Text」（selected）／「Token IDs」
- Left panel body: coloured-chunk tokenised text (tiktokenizer-style — each token a different pastel highlight)
- Right panel toggle (chip): 「Text」／「Token IDs」（selected）
- Right panel body: the same text as an id array, e.g. 「[12488, 6391, 4014, 316, 1001, …]」

LAYOUT
- Archetype skeleton: statement (lime-payoff) HEADLINE over two side-by-side
  screenshot panels — reflects the built slide; no longer a pure statement.
- Block placement: payoff line centered across the top; two equal panels beneath —
  LEFT = coloured-token「Text」view, RIGHT =「Token IDs」array view; each panel
  carries the Text / Token IDs toggle chip (selected state differs per panel).
- Notes: Harry seated the platform.openai.com/tokenizer (tiktokenizer) Text +
  Token-IDs views under the payoff, so「只有 token 和編號」is SHOWN, not just stated.
  One lime run only, on Token.

ASSETS: tokenizer screenshot — coloured-token「Text」view +「Token IDs」array from
platform.openai.com/tokenizer (built into this slide as two panels).
INTERACTIVE / STATION: none

### Slide 07 · capsule-list · 為什麼是這樣切？（subword 的由來）
Footer — L: SITCON 2026 · C: 07 / 35 · R: 文字怎麼變數字

TEXT (verbatim)
- Title L1 (white): 「為什麼切成這種怪東西？」
- Title L2 (grey): 「字太細、詞太多，取中間」
- Capsule 1: 🔠 · zh「照字母切」 · en「Character-level」 · body「切得最細，但一句話變超長，模型很難讀。e.g., 'hello' → ['h', 'e', 'l', 'l', 'o']」   (variant: §4.1 horizontal + vertical divider, bilingual)
- Capsule 2: 📚 · zh「照整詞切」 · en「Word-level」 · body「詞表爆炸，還老是遇到沒收錄過的新詞。e.g., 'GPT-4o' → [UNK]（詞表沒有）」   (variant: §4.1 horizontal + vertical divider, bilingual)
- Capsule 3: ✂️ · zh「照字塊切」 · en「Subword」 · body「常用字整塊、罕見字拆小塊，長度與詞表兩邊都顧到。e.g., 'tokenizer' → ['token', 'izer']」   (variant: §4.1 horizontal + vertical divider, bilingual)

LAYOUT
- Archetype skeleton: capsule-list (big left title + right vertical stack of 3)
- Block placement: two-zone split — big two-tier title left third, 3 capsules
  stacked in the right ~60%
- Notes: motivation-only「came-from」slide (per Harry's call — no word2vec/BPE
  history). Keep one heading convention across the stack (all bilingual, en
  subtitle under zh heading; §4.1). No lime — the payoff is the third capsule
  landing on subword as the compromise. Icon far-left, │ divider │, body right.

ASSETS: optional — a tiny「一句話切三種切法」對照 sketch, or reuse the
platform.openai.com/tokenizer screenshot to show real subword pieces
INTERACTIVE / STATION: none

### Slide 08 · two-panel comparison · 從 one-hot 到 embedding（編號 → 有語意的數字）
Footer — L: SITCON Camp 2026 · C: 08 · R: ML Course 2 ｜ 文字怎麼變數字

TEXT (verbatim — typeset exactly; mark accents, don't restyle)
- Top question (white, spanning): 「怎麼把沒有意義的『Token 編號』變成有意義的數字？」
- Edge label L (grey, over left panel): 「攤平成一排 0／1」
- Edge label R (grey, over right panel): 「壓縮 ＋ 從資料學」
- Left panel title: 「One-hot Encoding」
- Left panel viz: tall sparse binary matrix (lime = 1) over token cells「the / cat / sat / on / mat」→ sentence「the cat sat on mat」; bracket「≈ vocab size」
- Left panel note (grey): 「跟字典一樣長；每個字互相垂直，兩兩距離都一樣 → 沒有語意」
- Right panel title: 「Token Embedding」
- Right panel viz: short dense viridis matrix over an「Embedding table」box over token cells → sentence; bracket「= embedding dim」
- Right panel note (grey): 「短、密；相近語意的字位置也相近。語意不是規定的，是從資料裡學出來的位置」

LAYOUT
- Archetype skeleton: two-panel comparison composite — built as a
  One-hot | Embedding side-by-side, spanned by a top question + two bridging edge
  labels (a flow read left→right across the two panels). Reflects the built slide;
  replaces the earlier id-pill → one-hot → embedding horizontal flow.
- Block placement: oversized top question spanning the width; two large panels
  below — LEFT「One-hot Encoding」(sparse binary matrix), RIGHT「Token Embedding」
  (dense viridis matrix via an Embedding table); a grey edge label sits above each
  panel; each panel reads bottom→up (sentence → tokens → [table] → matrix); a
  sub-note under each panel.
- Notes: One-hot panel = the wall (long, sparse, equidistant → 沒有語意); embedding
  panel = the resolution. Numbers illustrative; no formulas, no math notation.

ASSETS: two generated figures, both already in the repo —
`slides/figures/onehot_encoding.png` (sparse lime-on-dark binary matrix) and
`slides/figures/word_embedding.png` (dense viridis matrix + Embedding table).
Regenerate via `slides/figures/generate-encoding-figures.py`.
INTERACTIVE / STATION: none

### Slide 09 · statement · Embedding 探索站（hand-off）
Footer — L: SITCON 2026 · C: 09 / 35 · R: 文字怎麼變數字

TEXT (verbatim)
- Setup line (white): 「這排『有語意的數字』，就住在一個空間裡。」
- Task line (white, one lime run): 「逛一逛，看看哪些字 **[lime: 靠在一起]**。」
- Follow-up (grey): 「輪到你動手 → 挑一個字，找出離它最近的鄰居。」

LAYOUT
- Archetype skeleton: statement (hand-off framing)
- Block placement: left-aligned centered measure; lower band open for a station
  peek-thumbnail
- Notes: short framing slide; the embedding space is explored in the tool. Picks
  up directly from slide 08's embedding panel.

ASSETS: station screenshot TBD (Embedding 探索站 — 2D/3D projection)
INTERACTIVE / STATION: → hand off to **Embedding 探索站**. Knob students turn:
在 embedding space（2D/3D 投影）裡逛、挑字看最近鄰。Notice: 語意相近的字距離也近
（貓/狗、國王/皇后），語意是「位置」學出來的。

### Slide 10 · data-viz · Embedding 收束 + bias（debrief）
Footer — L: SITCON Camp 2026 · C: 10 · R: ML Course 2 ｜ 文字怎麼變數字

TEXT (verbatim — typeset exactly; mark accents, don't restyle)
- Title (grey ghost watermark, oversized, bled across top): 「向量嵌入 · 特性」
- Left panel label (grey): 「embedding space：語意相近 → 位置相近」
- Left panel source (grey, 🔗): 「projector.tensorflow.org」
- Right-top sketch caption (grey): 「同樣的偏移 = 同一個『方向』」
  - analogy pair A (cyan): 「walking → walked」
  - analogy pair A (cyan): 「swimming → swam」
- Right-bottom sketch caption (grey): 「king − man + woman ≈ queen」
  - analogy pair B (purple): 「man → king」
  - analogy pair B (purple): 「woman → queen」
- Payoff line (white, spanning the bottom, one lime run): 「方向是有意義的——embedding 學到了語意，也學到了 **[lime: 偏見]**。」
- Bias source (grey, 🔗, inline beside the payoff): 「Bolukbasi et al., 2016 · arXiv 1607.06520」

LAYOUT
- Archetype skeleton: data-viz — the「big viz left · panels right」composite
  (AT refs 29/30/33/34/36), mirroring the 2025 deck's presentation_30
  (「向量嵌入｜特性」) slide Harry flagged as the target shape.
- Block placement: oversized grey ghost watermark title bled across the top, then
  two zones —
  · LEFT (~55%): one large panel = the embedding-space projection (scatter +
    nearest-neighbour list); 🔗 source caption beneath it.
  · RIGHT (~45%): two stacked sketch panels, each a small vector-space diagram
    where a consistent offset is drawn as two parallel dashed arrows — top = tense
    analogy (walking→walked ∥ swimming→swam), bottom = gender/royalty analogy
    (man→king ∥ woman→queen, i.e. king − man + woman ≈ queen).
  · payoff line spans the bottom; lime run on 偏見; bias citation inline beside it.
- Notes: converted from `statement` per Harry — the debrief now SHOWS「方向是有意義的」
  (left recap + right analogy sketches) before the one-line bias payoff, instead of
  merely stating the arithmetic. The LEFT panel is a station / reference
  SCREENSHOT (recap of what students just explored on slide 09 — a screenshot in a
  debrief is recap, not a rebuilt canvas, so it stays inside CLAUDE.md's「don't
  restate station content」). The RIGHT sketches are NEW slide content (the
  arithmetic isn't in the station) and carry the teaching weight. Keep the
  arithmetic inline Latin/math; one lime run only, on 偏見; both 🔗 citations stay
  inline at body size (no standalone reference/citation slide). Two-color-families
  rule (tokens.md §3c): the two analogy pairs use categorical CYAN / PURPLE — NOT
  lime, NOT the viridis ramp.

ASSETS:
- LEFT: Embedding 探索站 screenshot (2D/3D projection + nearest-neighbour panel) —
  station screenshot TBD; the 2025 reference is projector.tensorflow.org.
- RIGHT: vector-analogy sketch — `slides/figures/embedding_analogy.png`
  (two stacked panels: tense + gender/royalty offsets), matplotlib + transparent,
  palette per `slides/figures/PALETTE.md`. Regenerate via
  `slides/figures/generate-embedding-analogy.py`.
INTERACTIVE / STATION: none — this is the Embedding 探索站 debrief; the exploration
already happened on slide 09.

### Slide 11 · statement · Loop 0 收束（bridge → Loop 1）
Footer — L: SITCON 2026 · C: 11 / 35 · R: 文字怎麼變數字

TEXT (verbatim)
- Setup line (white): 「現在，每個字都是一排數字了。」
- Payoff line (white, one lime run): 「那……**[lime: 就能餵給上一堂的 MLP 了嗎？]**」

LAYOUT
- Archetype skeleton: statement (lime-payoff; payoff is a question → sets up Loop 1)
- Block placement: two lines, left-aligned centered measure, big whitespace
- Notes: deliberately ends on a question so Loop 1 opens by answering it (and then
  hitting the 順序 wall). Bridges the two loops.

ASSETS: none
INTERACTIVE / STATION: none

## Loop 1 — MLP 吃文字 + 順序撞牆 (~30 min) 〔本堂核心 beat〕
Beats: 橋接（bag-of-embeddings → 上一堂 MLP，做國會情感分析，**會動、假安全感**
「那不就 MLP 就好？」）→ **撞牆 demo**（shuffle 開關：MLP(bag) shuffle 前後輸出逐字
相同 → 順序被丟掉；對照「不好」vs「好不」）→ 收束：MLP 沒有「順序」假設 → 需要
**假設順序有意義**的架構 → RNN。**Loop 1 結束後接 10 分鐘休息**（撞牆後的自然斷點）。
Station: 順序撞牆站.

### Slide 12 · section-divider · Loop 1 進場
Footer — L: SITCON 2026 · C: 12 / 35 · R: MLP 吃文字

TEXT (verbatim — typeset exactly; mark accents, don't restyle)
- Kicker (grey): 「Section 02.」
- Title L1 (white): 「直接餵給 MLP，會怎樣？」

LAYOUT
- Archetype skeleton: section-divider
- Block placement: kicker + title left-anchored in the lower-third
- Notes: full-bleed glitch/datamosh background (tokens.md §5) replacing the grid;
  no lime run (dividers carry no text accent — matches slide 03); fullwidth 「？」;
  footer will lose contrast over the image — known divider trade-off, fine here.

ASSETS: full-bleed glitch/datamosh background (reuse the deck's divider treatment)
INTERACTIVE / STATION: none

### Slide 13 · flow-diagram · bag-of-embeddings → 丟進 MLP（橋接）
Footer — L: SITCON 2026 · C: 13 / 35 · R: MLP 吃文字

TEXT (verbatim)
- Title (grey ghost watermark, oversized, bled across top): 「bag-of-embeddings」
- Title L2 (grey): 「一句話 → 一個向量 → 上一堂的 MLP」
- Flow node 1 (pill): 「一句話（國會發言）」
- Edge label 1 (grey): 「查每個 token 的 embedding」
- Flow node 2 (panel): 「一排 embedding：[…][…][…]…」
- Edge label 2 (grey): 「全部加起來取平均」
- Flow node 3 (pill): 「一個向量（bag-of-embeddings）」
- Edge label 3 (grey): 「丟進上一堂的 MLP」
- Flow node 4 (pill): 「情緒：正面 / 負面」
- Caption line under flow (white, one lime run): 「不用改上一堂的模型——它 **[lime: 居然會動]**。」

LAYOUT
- Archetype skeleton: flow-diagram (horizontal, 4 stages)
- Block placement: full-bleed; four nodes left→right (句子 → embeddings → 平均向量
  → MLP → 情緒), arrows carrying the edge labels; grey watermark
  「bag-of-embeddings」bled across top; caption line beneath the flow
- Notes: converted from a statement so the「平均成一個向量」pipeline is *shown*, not
  narrated — it makes the「丟掉順序」wall (slide 15–16) legible in hindsight (a bag
  has no order). Directly answers Loop 0's cliff-hanger (slide 11). Keep 準度 out of
  here — that escalation is slide 14. One lime run only, on 居然會動.

ASSETS: none (diagram is the hero — hand-drawn in Affinity)
INTERACTIVE / STATION: none

### Slide 14 · statement · 那不就 MLP 就好？（假安全感）
Footer — L: SITCON 2026 · C: 14 / 35 · R: MLP 吃文字

TEXT (verbatim)
- Setup line (white): 「而且準度……還不錯。」
- Follow-up (grey): 「看起來，文字這一關就這樣解決了。」
- Payoff line (white, one lime run): 「那 **[lime: 不就 MLP 就好了嗎？]**」

LAYOUT
- Archetype skeleton: statement (lime-payoff)
- Block placement: three lines, left-aligned centered measure, big whitespace
- Notes: the trap before the wall — the lime run lands on the whole false-security
  question (whole-question lime is in-system; see slide 11 precedent). Keep 準度
  qualitative (spec only says 還不錯); do NOT invent an accuracy %. Slide 15
  immediately pokes the hole.

ASSETS: none
INTERACTIVE / STATION: none

### Slide 15 · statement · 順序撞牆站（hand-off）
Footer — L: SITCON 2026 · C: 15 / 35 · R: MLP 吃文字

TEXT (verbatim)
- Setup line (white): 「先別急著下結論。」
- Task line (white, one lime run): 「同一句話，把字 **[lime: 打散順序]** 再丟一次。」
- Follow-up (grey): 「輪到你動手 → 開關 shuffle、切換 MLP(bag) 與 RNN，看兩邊輸出怎麼變。」

LAYOUT
- Archetype skeleton: statement (hand-off framing)
- Block placement: left-aligned centered measure; leave the lower band open for a
  station screenshot if Harry wants a peek-thumbnail
- Notes: short framing slide — the teaching happens in the tool. One lime run only,
  on 打散順序 (in the TEXT, not the hand-off line).

ASSETS: station screenshot TBD (順序撞牆站)
INTERACTIVE / STATION: → hand off to **順序撞牆站**. Knob students turn: shuffle
on/off、切換 MLP(bag) / RNN 重跑，兩者準度即時對比。Notice: MLP(bag) shuffle 前後
輸出逐字相同 → 它把順序整個丟掉了。

### Slide 16 · annotated-sentence · 一袋無序的字（debrief）
Footer — L: SITCON 2026 · C: 16 / 35 · R: MLP 吃文字

TEXT (verbatim)
- Title (grey watermark, oversized): 「一袋無序的字」
- Sentence A (centered, coloured dashed underline per char): 「不 好」
- Sentence B (centered, coloured dashed underline per char): 「好 不」
- Callout under A (grey): 「👍 偏正面」
- Callout under B (grey): 「👎 偏負面」
- Bridge note (grey, centered between): 「同一袋『不』＋『好』 → MLP(bag) 給出一模一樣的輸出」
- Payoff line (white, one lime run): 「語意明明相反，它卻 **[lime: 分不出來]**。」

LAYOUT
- Archetype skeleton: annotated-sentence (AT slide 15 — coloured dashed underlines
  on spans + emoji callouts; NOT a capsule, no card/body)
- Block placement: two short phrases stacked centre-stage, each char on a coloured
  dashed-underline span; the two use the **same two colours** for 不 / 好 so it
  reads as「同一袋字，只是換順序」; emoji callouts arrow up from below; bridge note
  between the two; lime payoff line at the bottom
- Notes: converted from a statement so the「不好 vs 好不」contrast is *shown* — this
  is legal because it stays an annotated sentence, NOT a standalone
  comparison-columns layout (archetypes.md forbids that). Colour comes from the
  categorical set (§3c), one hue per character, reused across both phrases; lime
  stays reserved for the single text-emphasis run 分不出來. This is the wall made
  concrete before slide 17 names it.

ASSETS: none
INTERACTIVE / STATION: none

### Slide 17 · statement · MLP 沒有「順序」這個假設（收束 → Loop 2）
Footer — L: SITCON 2026 · C: 17 / 35 · R: MLP 吃文字

TEXT (verbatim)
- Setup line (white): 「問題不在準度，在假設。」
- Body line (white): 「MLP 的設計裡，根本沒有「順序」這回事。」
- Payoff line (white, one lime run): 「我們需要一個 **[lime: 假設順序有意義]** 的架構 → RNN。」

LAYOUT
- Archetype skeleton: statement (lime-payoff; payoff tees up Loop 2)
- Block placement: three lines, left-aligned centered measure, big whitespace
- Notes: names the wall as a missing assumption (not a bug), then bridges to RNN
  so Loop 2 opens on 「假設順序有意義」的架構. One lime run only, on 假設順序有意義.

ASSETS: none
INTERACTIVE / STATION: none

> **☕ 10-min break here** — between Loop 1 (順序撞牆) and Loop 2 (RNN). Not a
> slide; the section divider (slide 18) doubles as the「回來上課」re-entry. If you
> want an explicit break slide, add one before 18 and bump TT to 36.

## Loop 2 — RNN：把順序吃進去 (~43 min)
Beats: next-token 互動（context 越大猜越準，參考 Brilliant）→ 引入 RNN（逐 token 吃、
hidden state 往後傳，動畫）→ 暴露 RNN 的牆（長 context 易忘；訓練不穩 梯度爆炸/消失，
loss 亂跳）為 Transformer 鋪路。
Stations: next-token 站, RNN 視覺化.

### Slide 18 · section-divider · Loop 2 進場
Footer — L: SITCON 2026 · C: 18 / 35 · R: RNN

TEXT (verbatim — typeset exactly; mark accents, don't restyle)
- Kicker (grey): 「Section 03.」
- Title L1 (white): 「怎麼把『順序』吃進去？」

LAYOUT
- Archetype skeleton: section-divider
- Block placement: kicker + title left-anchored in the lower-third
- Notes: full-bleed glitch/datamosh background (tokens.md §5) replacing the grid;
  footer will lose contrast over the image — known divider trade-off, fine here.
  Picks up directly from Loop 1's close (MLP 沒有順序假設 → 需要假設順序有意義的架構).

ASSETS: full-bleed glitch/datamosh background (reuse the deck's divider treatment)
INTERACTIVE / STATION: none

### Slide 19 · statement · 先玩個遊戲：猜下一個字（hook）
Footer — L: SITCON 2026 · C: 19 / 35 · R: RNN

TEXT (verbatim)
- Setup line (white): 「在教架構之前，先玩個遊戲。」
- Task line (white, one lime run): 「給你目前的字，猜 **[lime: 下一個字]** 是什麼。」
- Follow-up (grey): 「『今天天氣真___』——你腦中大概已經有答案了。」

LAYOUT
- Archetype skeleton: statement (lime-payoff flavour)
- Block placement: left-aligned within a centered measure, indented ~1/4 from
  left, generous whitespace
- Notes: the hook that opens the next-token game; the fill-in-the-blank example
  primes the intuition that 前文 決定 下一個字. One lime run only, on 下一個字.

ASSETS: none
INTERACTIVE / STATION: none

### Slide 20 · statement · next-token 站（hand-off）
Footer — L: SITCON 2026 · C: 20 / 35 · R: RNN

TEXT (verbatim)
- Setup line (white): 「換模型來猜——給它目前的字，看它押哪個字。」
- Task line (white, one lime run): 「慢慢放寬它能看的前文，看準度 **[lime: 怎麼變]**。」
- Follow-up (grey): 「輪到你動手 → 調 context 視窗大小、決定要不要看更前面的字。」

LAYOUT
- Archetype skeleton: statement (hand-off framing)
- Block placement: left-aligned centered measure; leave the lower band visually
  open for a station screenshot
- Notes: short framing slide — the teaching happens in the tool, not here. Mirrors
  Brilliant's next-token interaction.

ASSETS: station screenshot TBD (next-token 站)
INTERACTIVE / STATION: → hand off to **next-token 站**. Knob students turn: context
視窗大小 / 要不要看更前面的字. Notice: 看得越多、猜得越準——context 給得越長，下一個
字押得越有把握。

### Slide 21 · statement · next-token 收束 → 需要「記憶」（debrief → bridge）
Footer — L: SITCON 2026 · C: 21 / 35 · R: RNN

TEXT (verbatim)
- Setup line (white): 「所以猜下一個字，得靠前面看過的字。」
- Follow-up (grey): 「可是句子一長，總不能每次都把整段從頭讀一遍。」
- Payoff line (white, one lime run): 「模型需要一種能力：把前面 **[lime: 記住、一路帶著走]**。」

LAYOUT
- Archetype skeleton: statement (lime-payoff)
- Block placement: three lines, left-aligned centered measure
- Notes: the debrief payoff for the next-token station, then names the need that
  RNN answers. Keep the middle line grey so the lime payoff stands alone. Sets up
  slide 22's RNN reveal.

ASSETS: none
INTERACTIVE / STATION: none

### Slide 22 · flow-diagram · RNN：一次吃一個 token，記憶往後傳
Footer — L: SITCON 2026 · C: 22 / 35 · R: RNN

TEXT (verbatim)
- Title (grey ghost watermark, oversized, bled across top): 「RNN」
- Title L2 (grey): 「一次吃一個 token，把記憶往後傳」
- Flow node 1 (pill): 「token₁」
- Edge label 1 (grey): 「hidden state（記憶）」
- Flow node 2 (pill): 「token₂」
- Edge label 2 (grey): 「hidden state（更新後的記憶）」
- Flow node 3 (pill): 「token₃」
- Caption line under flow (grey, one lime run): 「每讀一個字，就把前面的記憶 **[lime: 更新一次]** 再傳下去。」

LAYOUT
- Archetype skeleton: flow-diagram (horizontal)
- Block placement: full-bleed; three token pills left→right across the centered
  band, arrows carrying the hidden-state edge labels between them; grey watermark
  「RNN」bled across the top; caption line beneath the flow
- Notes: STATIC explanation — the station animates this next, so keep it a clean
  node-and-connector chain (components.md §6): small centered pills for tokens,
  arrows labeled with the hidden-state hand-off. No mono log blocks needed. The
  recurring loop-back (hidden state feeding the next step) is the whole point —
  draw the arrow flowing forward, same「記憶」channel each hop.

ASSETS: none (diagram is the hero — hand-drawn in Affinity)
INTERACTIVE / STATION: none

### Slide 23 · statement · RNN 視覺化（hand-off）
Footer — L: SITCON 2026 · C: 23 / 35 · R: RNN

TEXT (verbatim)
- Setup line (white): 「剛剛是靜態圖——現在讓記憶動起來。」
- Task line (white, one lime run): 「看 hidden state 一站一站 **[lime: 沿著句子往後流]**。」
- Follow-up (grey): 「輪到你動手 → 看記憶怎麼流動，也看訓練時的 loss。」

LAYOUT
- Archetype skeleton: statement (hand-off framing)
- Block placement: left-aligned centered measure; leave the lower band visually
  open for a station screenshot
- Notes: short framing slide — the animation carries the teaching. Sets up the
  wall slide (24): watch the early info fade on long sentences.

ASSETS: station screenshot TBD (RNN 視覺化)
INTERACTIVE / STATION: → hand off to **RNN 視覺化**. Knob students turn: 看 hidden
state 沿序列流動 / 看 loss. Notice: 記憶一站一站往後傳；句子一長，前面的資訊就被一路
沖淡。

### Slide 24 · capsule-list · RNN 撞到的兩道牆
Footer — L: SITCON 2026 · C: 24 / 35 · R: RNN

TEXT (verbatim)
- Title L1 (white): 「RNN 撞到的兩道牆」
- Title L2 (grey): 「所以我們還需要下一個架構」
- Capsule 1: 🧠 · zh「記憶健忘」 · en「Long-Context Forgetting」 · body「記憶一路傳下去，前面的資訊被沖淡，長句子就記不住開頭。」 (variant: horizontal with vertical divider, §4.1)
- Capsule 2: ⚡ · zh「訓練不穩」 · en「Exploding / Vanishing Gradients」 · body「梯度一路相乘，不是爆炸就是消失，loss 亂跳、練不起來。」 (variant: horizontal with vertical divider, §4.1)

LAYOUT
- Archetype skeleton: capsule-list
- Block placement: two-zone split — big left title「RNN 撞到的兩道牆」+ right
  vertical stack of 2 capsules
- Notes: horizontal-with-divider capsules (icon far-left, zh heading + en subtitle,
  │ rule │, one body line). Both capsules bilingual and consistent (don't mix
  heading languages — avoid the slide-8 anti-pattern). No lime text accent here;
  the two walls are what motivates the Transformer section next. This is Loop 2's
  撞牆 close → Loop 3 (Transformer) answers both.

ASSETS: none
INTERACTIVE / STATION: none

## Loop 3 — Transformer：讓每個字直接看到所有字 (~42 min)
Beats: 解法切入（與其一站站傳記憶，不如每個 token 直接看向所有 token = attention）→
逐步補架構（時間緊可略）：① PE（attention 對順序無感 → 塞回「第幾個」）② residual
（疊深訓練變難 → 捷徑繞過層，loss 變穩）③ QKV（attention 來源解釋；接
transformer-explainer / poloclub）。PE／residual（slides 29–30）為**可壓縮**段，時間
緊時先砍這兩塊（course-spec 明示可略）；QKV 保留。
Station: Transformer 站 (attention 連線, PE on/off, residual on/off, QKV).

### Slide 25 · section-divider · Loop 3 進場
Footer — L: SITCON 2026 · C: 25 / 35 · R: Transformer

TEXT (verbatim — typeset exactly; mark accents, don't restyle)
- Kicker (grey, left-anchored lower-third): 「Section 04.」
- Section question L1 (white): 「能不能讓每個字，」
- Section question L2 (white): 「直接看到所有字？」

LAYOUT
- Archetype skeleton: section-divider (grey kicker over white CJK question,
  left-anchored lower-third)
- Block placement: full-bleed background; kicker + two-line question pinned
  lower-left
- Notes: question breaks across two white lines (both full-contrast here — the
  divider question is the exception, not the title two-tier split); footer loses
  contrast over the image by design.

ASSETS: full-bleed glitch/datamosh background
INTERACTIVE / STATION: none

### Slide 26 · statement · 解法切入：attention
Footer — L: SITCON 2026 · C: 26 / 35 · R: Transformer

TEXT (verbatim)
- Setup line (white): 「RNN 的記憶要一站一站往後傳，傳到後面就淡了。」
- Payoff line (white, one lime run): 「換個想法——讓每個字直接看向序列裡所有字，這就是 **[lime: attention]**。」

LAYOUT
- Archetype skeleton: statement (lime-payoff)
- Block placement: left-aligned centered measure, huge surrounding whitespace
- Notes: this line directly answers Loop 2 的健忘牆（不用一站站傳記憶了）; one lime
  run on attention only.

ASSETS: none
INTERACTIVE / STATION: none

### Slide 27 · statement · Transformer 站（attention view · hand-off）
Footer — L: SITCON 2026 · C: 27 / 35 · R: Transformer

TEXT (verbatim)
- Setup line (white): 「先看看：一個字到底把注意力放在哪些字上。」
- Task line (white, one lime run): 「點一個字，看它的 **[lime: attention]** 連到哪些字。」
- Follow-up (grey): 「輪到你動手 → 點不同的字，看連線怎麼跳。」

LAYOUT
- Archetype skeleton: statement (hand-off framing)
- Block placement: left-aligned centered measure; leave the lower band open for a
  station screenshot
- Notes: short framing slide — teaching happens in the tool, not here.

ASSETS: station screenshot TBD (Transformer 站, attention 連線)
INTERACTIVE / STATION: → hand off to **Transformer 站**. Knob students turn: 點一個
字 → 看它的 attention 連到哪些字。Notice: 每個字直接連到相關的字，不必再逐站傳遞記憶。

### Slide 28 · statement · attention 的盲點：對順序無感（debrief + next wall）
Footer — L: SITCON 2026 · C: 28 / 35 · R: Transformer

TEXT (verbatim)
- Setup line (white): 「attention 解決了健忘——每個字都看得到所有字。」
- Payoff line (white, one lime run): 「但它有個盲點：對 **[lime: 順序]** 無感。」
- Follow-up (grey): 「把句子打散重排，attention 算出來的結果一模一樣。」

LAYOUT
- Archetype skeleton: statement (lime-payoff, debrief → next-wall framing)
- Block placement: left-aligned centered measure
- Notes: names the wall (順序無感) before the next slide patches it; one lime run
  on 順序.

ASSETS: none
INTERACTIVE / STATION: none

### Slide 29 · statement · 補 positional embedding（patch: PE · 可壓縮）
Footer — L: SITCON 2026 · C: 29 / 35 · R: Transformer

TEXT (verbatim)
- Setup line (white): 「attention 看得到所有字，卻分不出誰在前、誰在後。」
- Payoff line (white, one lime run): 「補一塊 **[lime: positional embedding]**，把『第幾個』塞回去。」
- Follow-up (grey): 「輪到你動手 → 把 PE 關掉，再打亂順序，看輸出變不變。」

LAYOUT
- Archetype skeleton: statement (lime-payoff, patch framing)
- Block placement: left-aligned centered measure; lower band open for station reference
- Notes: one lime run on positional embedding; this closes 28 的順序牆. Compressible
  段 — if time is tight, this and slide 30 (residual) are the first to cut
  (course-spec sanctions dropping the patches).

ASSETS: none
INTERACTIVE / STATION: → hand off to **Transformer 站**. Knob students turn: PE
on/off。Notice: 開 PE 時打亂順序輸出會變、關掉時卻不變 → 順序資訊真的被塞回去了。

### Slide 30 · statement · 補 residual connection（patch: residual · 可壓縮）
Footer — L: SITCON 2026 · C: 30 / 35 · R: Transformer

TEXT (verbatim)
- Setup line (white): 「想更聰明就把層疊更深——但疊深之後，訓練開始不穩，loss 亂跳。」
- Payoff line (white, one lime run): 「補一條 **[lime: residual connection]**，給資訊一條捷徑繞過層。」
- Follow-up (grey): 「輪到你動手 → 切換 residual on/off，看 loss 穩不穩。」

LAYOUT
- Archetype skeleton: statement (lime-payoff, patch framing)
- Block placement: left-aligned centered measure; lower band open for station reference
- Notes: 「loss」inline at body size; one lime run on residual connection.
  Compressible 段 (with slide 29) — cut first if time is tight.

ASSETS: none
INTERACTIVE / STATION: → hand off to **Transformer 站**. Knob students turn:
residual on/off。Notice: 關掉時 loss 亂跳、開起來就穩下來 → 捷徑讓深層也訓練得動。

### Slide 31 · flow-diagram · attention 怎麼決定看誰（concept: QKV）
Footer — L: SITCON 2026 · C: 31 / 35 · R: Transformer

TEXT (verbatim)
- Title (grey ghost watermark, oversized, bled across top): 「Q / K / V」
- Title L2 (grey): 「attention 怎麼決定『看誰』」
- Flow node 1 (pill): 「Query（我想找什麼）」
- Edge label 1 (grey): 「拿去比對每個字的…」
- Flow node 2 (panel): 「Key（每個字的標籤）」
- Edge label 2 (grey): 「挑出最對得上的那把」
- Flow node 3 (pill): 「Value（那個字的內容）」
- Caption line under flow (white, one lime run): 「問題對上哪把鑰匙，就多讀那個字的 **[lime: 內容]**。」

LAYOUT
- Archetype skeleton: flow-diagram (Query → 比對 Keys → 取 Value)
- Block placement: full-bleed; three nodes (Query pill → Key panel → Value pill)
  with the two edge labels; grey watermark「Q / K / V」bled across top; caption
  line beneath
- Notes: converted from a statement so 問題→比對→取內容 reads as a mechanism, not a
  sentence; it also avoids two back-to-back capsule/statement slides before the
  slide-32 recap. Keep it intuitive — Q/K/V glossed as 問題/標籤(鑰匙)/內容; NO
  formulas, NO dot-product / softmax notation. One lime run only, on 內容. QKV is
  the *kept* patch (spec says don't drop it), unlike 29–30.

ASSETS: none (diagram is the hero — hand-drawn in Affinity)
INTERACTIVE / STATION: → hand off to **Transformer 站 (QKV) / transformer-explainer**
(https://poloclub.github.io/transformer-explainer/). Knob students turn: 看一個字的
Query 對上各字的 Key。Notice: Q 與 K 對得越上，那個字分到的注意力越多。

### Slide 32 · capsule-list · Loop 3 收束：Transformer 的零件
Footer — L: SITCON 2026 · C: 32 / 35 · R: Transformer

TEXT (verbatim)
- Title L1 (white): 「Transformer 就是這幾塊拼起來」
- Title L2 (grey): 「attention ＋ 三塊補丁」
- Capsule 1: 👀 · zh「注意力」· en「Attention」· body「每個字直接看向所有字，不必逐站傳記憶。」  (variant: §4.1 horizontal + vertical divider, bilingual)
- Capsule 2: 📍 · zh「位置編碼」· en「Positional Embedding」· body「把『第幾個』塞回去，補上順序。」  (variant: §4.1 horizontal + vertical divider, bilingual)
- Capsule 3: 🔗 · zh「殘差連接」· en「Residual Connection」· body「給資訊一條捷徑繞過層，訓練更穩。」  (variant: §4.1 horizontal + vertical divider, bilingual)
- Capsule 4: 🔑 · zh「Q／K／V」· en「Query · Key · Value」· body「問題對上鑰匙，決定注意力看誰。」  (variant: §4.1 horizontal + vertical divider, bilingual)

LAYOUT
- Archetype skeleton: capsule-list (big left title + right vertical stack of 4)
- Block placement: two-zone split — big two-tier title left third, 4 capsules
  stacked in the right ~60%
- Notes: keep one heading convention across the stack (all bilingual, en subtitle
  under zh heading); one body line each; icon far-left, │ divider │, body right.
  Recaps Loop 3 and tees up Loop 4 的 MLP → RNN → Transformer 一條線.

ASSETS: none
INTERACTIVE / STATION: none

## Loop 4 — 收尾：架構即樂高 (~15 min)
Beats: 串成一條線 **MLP（order-blind）→ RNN（假設順序/記憶）→ Transformer（全局直接
互看 + 補丁）**；銜接第三堂（LoRA / 生成 / RL）。

### Slide 33 · capsule-list · 三架構一條線
Footer — L: SITCON 2026 · C: 33 / 35 · R: 架構即樂高

TEXT (verbatim — typeset exactly; mark accents, don't restyle)
- Title L1 (white): 「三個架構，其實是三個假設」
- Title L2 (grey): 「MLP → RNN → Transformer」
- Capsule 1: 👜 · zh「MLP」· body「沒有順序假設，句子只是一袋字」   (variant: vertical, §4.3)
- Capsule 2: 🔗 · zh「RNN」· body「假設順序有意義，用記憶一路帶著走」   (variant: vertical, §4.3)
- Capsule 3: 👀 · zh「Transformer」· body「假設每個字該直接互看，再補上位置與捷徑」   (variant: vertical, §4.3)

LAYOUT
- Archetype skeleton: capsule-list (centered title + 3-across row, like slide 39)
- Block placement: centered title band on top, three vertical-variant cards in one
  left→right row beneath
- Notes: vertical variant (§4.3) = zh heading top-left, emoji top-right, horizontal
  divider, body below; no en subtitle. Place a grey「→」connector between card 1→2
  and 2→3 so the row reads as the 一條線 progression (same order as title L2). No
  lime here — lime is reserved for the slide 34 payoff. Optional ghost watermark
  title「架構」bled low-contrast behind the row (per slide 39 "Takeaway" ghost).

ASSETS: none
INTERACTIVE / STATION: none

### Slide 34 · statement · 銜接第三堂（lime CTA）
Footer — L: SITCON 2026 · C: 34 / 35 · R: 架構即樂高

TEXT (verbatim)
- Setup line (white): 「記憶、直接互看、位置、捷徑——」
- Body line (white): 「這些零件拼起來，就是你正在用的大模型。」
- Payoff line (white, one lime run): 「下一堂，我們拿它來 **[lime: 玩]**：LoRA、生成、RL。」

LAYOUT
- Archetype skeleton: statement (lime-payoff)
- Block placement: three lines, left-aligned in a centered measure, big whitespace
- Notes: lime falls on the single forward-looking verb「玩」(the CTA payoff,
  mirroring the slide 40 imperative). Setup line lists the parts students built
  this session; payoff line hands off to Course 3. One lime run only.

ASSETS: none
INTERACTIVE / STATION: none

### Slide 35 · resources-board · 收尾參考資源
Footer — L: SITCON 2026 · C: 35 / 35 · R: Resources

TEXT (verbatim — typeset exactly; mark accents, don't restyle)
- Presenter credit (top-right, grey): 「Designed & Presented by 講者」
- Left panel header (white) + icon: 「延伸互動 · 影片」 🎬
- Resource card (left, media): thumb〔Brilliant 截圖 TBD〕· source「Brilliant」· title「Next-token 預測直覺」· link「brilliant.org」
- Resource card (left, media): thumb〔transformer-explainer 截圖 TBD〕· source「poloclub · Georgia Tech」· title「Transformer Explainer（互動視覺化）」· link「poloclub.github.io/transformer-explainer/」
- Right panel header (white) + icon: 「相關文獻」 📄
- Resource card (right, citation): link title (white, underlined)「Man is to Computer Programmer as Woman is to Homemaker? Debiasing Word Embeddings」· byline (grey italic)「Bolukbasi, Chang, Zou, Saligrama, Kalai · NeurIPS 2016 · arXiv:1607.06520」

LAYOUT
- Archetype skeleton: resources-board (two-panel: media gallery + citation list)
- Block placement: two-panel split — left `#171717` panel = media gallery
  (thumbnail + source-name + underlined title cards, stacked); right `#171717`
  panel = citation list; presenter credit line pinned top-right above both panels
- Notes: each panel = bold CJK header + top-right icon (§13). Left cards carry a
  small square thumbnail; right cards are text-only (underlined white link title +
  grey italic authors/venue/year). The arXiv paper is the Loop 0 embedding-bias
  reference. No lime.

ASSETS: two link thumbnails — Brilliant screenshot TBD, transformer-explainer
screenshot TBD
INTERACTIVE / STATION: none

---

## Notes back to Harry (writer fills as they go)

**Addendum (2026-07-02 · build-sync pass).** Harry is laying the deck out off a
prior ~49-slide keynote and is currently through page 9; per Harry, **slide
numbering / footer counts in this md are NOT synced to the live build** (ignore
the `NN / 35` counts below — the built footer format is L「SITCON Camp 2026」·
R「ML Course 2 ｜ <section>」). This pass touched only slides verified against the
page-1–9 export plus the requested slide 10:
- **Slide 10 — converted `statement` → `data-viz`** (Harry's call: "shouldn't be a
  statement"). New shape mirrors the 2025 deck's `presentation_30`
  (「向量嵌入｜特性」): big embedding-space projection panel left, two stacked
  vector-analogy sketches right (tense + king−man+woman≈queen), bias payoff spans
  the bottom (lime on 偏見, both 🔗 citations inline). Generated the right-hand
  sketch: **`slides/figures/embedding_analogy.png`** (+ generator
  `generate-embedding-analogy.py`), matplotlib/transparent/palette per PALETTE.md.
  LEFT panel is a station/reference *screenshot* (recap of slide 09) — not a
  rebuilt canvas, so it stays inside CLAUDE.md's "don't restate station content".
- **Slide 06 — synced to the built layout:** now the payoff headline over two
  tokenizer screenshot panels (Text view | Token-IDs array), not a pure statement.
- **Slide 08 — synced to the built layout:** now a One-hot | Token Embedding
  two-panel comparison built from `slides/figures/onehot_encoding.png` +
  `word_embedding.png` (those figures already exist in the repo), replacing the
  earlier id-pill→one-hot→embedding horizontal flow.
- **Watch-out — outline (slide 02) page refs drift by one from the build:** the
  typeset outline lists 「Embedding 探索站 P.08 / 語意裡的偏見 P.09」, but the export
  shows the Embedding 探索站 hand-off on page 9 and this bias debrief on page 10.
  Left the outline as Harry typeset it; flagging the off-by-one rather than
  silently "fixing" it either way. Slides 11+ in this md are unverified against the
  live build (only pages 1–9 were exported).

**Status (original writing pass): complete + revised.** Deck runs cover →
resources, **35 slides**, footer `NN / 35` contiguous, no `TODO` left. Revision pass (this session) did three
things on top of the first draft: (1) added a **segment-level 180-min time budget**
(new section above the SKELETON) with a 10-min break after Loop 1 and PE/residual
marked compressible; (2) added Loop 0 concept grounding — **one-hot** and the
tokenizer **subword rationale** (motivation-only, your call); (3) **rebalanced
archetypes** off `statement` per your Image #1 / #3 note.

- Decisions locked this session (were open questions):
  - **Break:** 10 min, inside the 180, after Loop 1 (before RNN). It's a note +
    the slide-18 divider doubles as re-entry, not its own slide. Want an explicit
    break slide? That'd bump TT to 36.
  - **One-hot → Loop 0** (not Loop 1): it's the motivation *for* embedding, so it
    sits in the tokenizer→embedding bridge (slide 08). Confirmed with you.
  - **"Came-from" depth = motivation only** — no word2vec/GloVe/BPE history named
    (slides 07 subword, 08 one-hot).
- Still needs your input:
  - **Cover meta (slide 01):** Speaker name + Date are placeholders (「講者姓名」/
    「營期日期」). Slide 35's presenter credit「Designed & Presented by 講者」too.
  - **Loop 4 has no section-divider** — the 10-min wrap flows straight out of
    Transformer (32 → 33). AT gave Conclusions its own divider; say the word and
    I'll add "Section 05." (→ TT 36, shift 33–35 → 34–36).
  - **Emoji / en-subtitle picks** in the capsule slides (07, 24, 32, 33) are my
    calls (🔠📚✂️ subword; 🧠⚡ RNN walls; 👀📍🔗🔑 Transformer parts; 👜🔗👀 three
    architectures). 🔗 is reused (32-3 residual, 33-2 RNN) — swap if you want
    distinct glyphs.
- Archetype rebalance (the Image #1 / #3 concern) — statements dropped from
  ~68% (23/34) → ~54% (19/35). Conversions:
  - **07** subword rationale → `capsule-list` (3 horizontal capsules, §4.1) — the
    Image #1 shape.
  - **08** one-hot → embedding → `flow-diagram` (id → one-hot → embedding).
  - **13** bag-of-embeddings → `flow-diagram` (句子 → embeddings → 平均 → MLP → 情緒).
  - **16**「不好/好不」→ `annotated-sentence` (AT slide 15; coloured span underlines).
  - **31** QKV → `flow-diagram` (Query → Key → Value).
  - Kept from draft: `capsule-list` 24 / 32 / 33, `flow-diagram` 22 (RNN),
    `resources-board` 35, `section-divider` 03/12/18/25.
  - I did **not** add static data-viz + Key-Insight slides (Image #3 shape)
    mid-loop: that data lives in the stations, and a static chart would rebuild
    station content (against CLAUDE.md / the spec's 環境即引導). The one natural fit
    is a next-token 「準度 vs context 長度」chart+insight as a slide-21 debrief —
    say the word if you want it and I'll add it (that's real takeaway, not the
    station itself).
- Station screenshots (marked "station screenshot TBD" so nothing blocks layout):
  - Slide 05 — Tokenizer 探索站 (**+ pull a real screenshot from
    platform.openai.com/tokenizer** for the coloured-token reference; also reusable
    on slide 07)
  - Slide 09 — Embedding 探索站 (2D/3D projection view)
  - Slide 15 — 順序撞牆站 (shuffle + MLP(bag)/RNN toggle)
  - Slide 20 — next-token 站 (context-window slider)
  - Slide 23 — RNN 視覺化 (hidden-state flow + loss)
  - Slide 27 — Transformer 站 (attention 連線; also referenced by 29 PE on/off,
    30 residual on/off, 31 QKV)
  - Slide 35 — resources-board thumbnails: Brilliant + transformer-explainer
- Watch-outs for typesetting:
  - Bias citation (arXiv 1607.06520) is inlined as a 🔗 caption on slide 10 (not a
    standalone `reference/citation` slide); full entry also in slide-35 資源 list.
  - No standalone comparison-columns anywhere (per archetypes.md): 不好/好不 is an
    `annotated-sentence` (16), the 3-architecture compare is a `capsule-list` (33).
  - `flow-diagram` 22 (RNN) uses subscript tokens (token₁/₂/₃) — check those glyphs
    typeset cleanly, or fall back to token1/2/3. The new flow-diagrams (08/13/31)
    use plain inline numbers/vectors — no subscripts.
