# COOKBOOK.md - the authoring contract for the Course 2 deck

Every content session/subagent writes Marp markdown **against this file**. Each
archetype below has the exact markdown that renders it and a rendered example
in `deck/_sample.md` (export: `out/_sample.pdf`, one slide per archetype, same
order as here). If a slide you want to write does not fit an archetype, first
check whether it should exist at all (the teaching happens in the stations);
only then improvise, staying inside the shared conventions.

## 0. File setup

Every deck file starts with:

```markdown
---
marp: true
theme: camp-dark
paginate: true
footer: Cover
---
```

Slides are separated by `---`. Render/preview from `slides/marp/`:
`pnpm preview` (watch), `pnpm pdf` / `pnpm html` / `pnpm png` (export; see
README.md to point them at your file).

## 1. Shared conventions (read before writing any slide)

### Two-tier text (white primary / grey secondary), everywhere

- **Title + subtitle**: `# 白色主標 _灰色副標_` - the `_..._` inside `h1`
  renders as the grey L2 line under the white L1. Title band fits a 2-line
  title **or** 1 line + L2, never both.
- **Body grey tier**: `_..._` anywhere in body = grey. Use it for the
  receding half of a statement, examples, asides.
- Grey block: a `> blockquote` renders as a grey framing block with a thin
  left rule. Use sparingly.

### Lime = the single emphasis (text only)

- `**...**` renders lime `#D6FB00` (color only, weight unchanged).
- **At most one lime run per statement.** Stats stay inline at body size in
  lime; never blow a number up.
- The categorical accents (cyan/purple/magenta) exist only inside figures.
  Never color slide text with them; there is no markup that does, keep it so.

### Footer section label

The footer is three zones: `SITCON Camp 2026` (automatic) | `N / TT`
(automatic pagination) | **section label** (yours). Set it with the `footer`
directive; it **persists** until changed, so set it once per section, on the
section's divider slide:

```markdown
<!-- footer: MLP 吃文字 -->
```

Labels per section come from the deck plan (`slides/decks/course2.md`
"Sections & footer labels").

### Presenter notes (how the deck stays minimal AND reviewable)

The slide face carries only what the audience must read; the connective
tissue, the why, and the self-study explanation go into **Marp presenter
notes**: any HTML comment on the slide that is not a directive.

```markdown
# 順序被丟掉了 _詞袋的代價_

「狗咬人」和「人咬狗」，模型看到**同一句話**。

<!--
講者備忘：先讓學生猜兩句的預測會不會一樣，再切到站上驗證。
自學備註：詞袋把 embedding 平均，任何排列的平均都相同，
所以順序資訊在進模型前就消失了。這就是 Loop 1 的牆。
-->
```

Every content slide gets a note. Write notes as full sentences; they are the
reviewable layer Harry reads later.

### Verbatim spine (presentability)

Trial-run feedback: minimal faces alone are hard to present from live. The
reconciliation: every **key teaching beat** carries a **verbatim spine** on the
face - the one or two sentences Harry actually says, as a lead or takeaway
line - so he can present from the slide without reading notes. Notes keep the
deeper explanation.

- One spine per beat, one or two lines max; it is a lead line, **not** a wall
  of text. Everything else on the face stays cue-like.
- When a slide has a spine, open its presenter note with
  `verbatim spine：「…」` quoting it, so the reviewable layer and the face
  stay in sync.
- Dividers are exempt (their 問句 is baked into the art); hand-off slides get
  their spine on the paired screenshot slide (§2.12).

### Step reveals (fragments)

Multi-part beats reveal step by step in the **web/HTML player** (bespoke);
PDF/PNG exports show the final state - never rely on a step for meaning.

- Bullet lists: write `*` instead of `-` and each item becomes a step
  (Marpit's native fragmented list).
- Anything else (capsule rows, contrast columns, prose blocks): add
  `data-marpit-fragment="N"` to the HTML block. The player steps elements in
  DOM order; number them 1, 2, 3… in that order anyway, for the reader.
  Hidden steps keep their layout space (`visibility`, not `display`), so the
  slide never reflows mid-reveal.

```markdown
<div class="cols">
<div>

### One-hot（先出現）

</div>
<div data-marpit-fragment="1">

### Embedding（按一下才出現）

</div>
</div>
```

Use steps only where the reveal IS the pedagogy (contrast-then-answer,
candidate reveal, parts-list recap). Default is still everything at once.

### Copy rules

- **zh-primary** (Traditional, TW high-schoolers). English only where the term
  itself is the point (token, RNN, attention) or in the grey L2 tier.
- **No em-dashes.** `—` and `——` are banned in slide copy. Use 、 ： or a
  line break instead.
- Fullwidth CJK punctuation (、 ： ， 。 「」), halfwidth `?` for questions
  per the shipped deck's dominant form.
- Latin runs sit inline inside CJK with a space each side: `一顆 token 的價格`.
- Writing reference: **Denny's slide voice**
  (https://github.com/denny0223/SITCON-Camp-2026-Prep-Course/blob/gh-pages/AGENTS.md#dennys-slide-voice):
  one concept per slide, short visible text, cues/contrast over paragraphs,
  no mini-articles.

### Figures

Figures come from `slides/figures/` (dark, transparent, on-palette). Reference
them relative to the deck file (deck files live in `deck/`):

```markdown
![h:1150](../../figures/word_embedding.png)

###### 圖：詞向量把「意思相近」變成「距離相近」
```

Size with `h:<px>` (content area is 3640 x 1500; h:1150 leaves room for a
caption). `######` (h6) is the caption style: small, grey, centered.

---

## 2. Archetypes

### 2.1 cover (sample slide 1)

Course opener. All visible text lives in the Affinity art
(`assets/bg/cover.png`); the slide face stays **empty**.

```markdown
<!-- _class: cover -->

<!-- 封面文字（課名、講者、日期）都在 assets/bg/cover.png 裡。 -->
```

Do: keep the face empty; note anything cover-related in the comment.
Don't: put a `#` title here; it would double with the art's text.

### 2.2 outline / toc (sample slide 2)

Same contract as cover: the agenda is baked into `assets/bg/toc.png`.

```markdown
<!-- _class: toc -->
<!-- footer: Outline -->

<!-- 大綱文字在 assets/bg/toc.png 裡。 -->
```

### 2.3 section-divider (sample slide 3)

Opens every section. Affinity glitch art behind; Marp overlays the grey
kicker + white question, lower-left. **This is also where the footer label
changes.**

```markdown
<!-- _class: divider -->
<!-- footer: 文字怎麼變數字 -->

## Section 01.

# 電腦怎麼「讀」文字？
```

Do: phrase the title as the section's driving question when it has one.
Don't: add body text; a divider is art + kicker + one line.

### 2.4 title + body - the workhorse (sample slide 4)

Most slides are this: a cue-like title, a few short lines, one idea.

```markdown
# 詞是怎麼變成數字的 _Tokenizer 與 Embedding_

模型看不到文字，只看得到數字。

第一步，先把句子**切成 token**，再把每個 token 變成一串數字。

<!-- 講者備忘：... -->
```

Do: fragments and keywords over sentences; 2 to 4 short lines max.
Don't: more than one lime run per statement; no paragraphs.

### 2.5 list / checklist (sample slide 6)

```markdown
# 你應該注意的三件事 _觀察重點_

- 中文和英文的切法**不一樣**
- 常見詞是一顆 token，罕見詞會被切碎
- token 數量就是你付的錢
```

Do: one line per point, 3 to 5 points, front-load the keyword.
Don't: nested lists; sub-points mean the slide wants to be two slides.

### 2.6 contrast pair (sample slide 7)

Two-column A-vs-B: contrast before definition. Blank lines inside the divs
are required (they let markdown render inside the HTML).

```markdown
# 有順序 vs. 沒順序 _兩種讀法_

<div class="cols">
<div>

### 詞袋 MLP

把整句**攪在一起**再看。

_「狗咬人」和「人咬狗」長一樣。_

</div>
<div>

### RNN

一個字一個字**照順序**讀。

_讀到後面，還記得前面。_

</div>
</div>
```

Do: keep the two sides structurally parallel (same tiers, same line count).
Don't: more than two columns; a 3-way comparison is a table or two slides.

### 2.7 code / command (sample slide 8)

Fira Code block (tight tracking is in the theme) for commands, config, token
sequences.

````markdown
# 讓模型接下一個字 _它其實在做什麼_

```python
tokens = tokenizer.encode("今天天氣真")
logits = model(tokens)          # 每個候選字一個分數
next_id = logits.argmax()      # 挑分數最高的
```

輸出的不是答案，是**每個字的機率**。
````

Do: 3 to 6 lines of code max; one takeaway line under the block.
Don't: syntax-highlight expectations beyond white/grey; the theme keeps code
monochrome on purpose.

### 2.8 figure (sample slide 9)

```markdown
# 每個詞都是空間裡的一個點 _向量的長相_

![h:1150](../../figures/word_embedding.png)

###### 圖：詞向量把「意思相近」變成「距離相近」
```

Do: one figure per slide, centered (automatic); caption via `######`.
Don't: shrink a figure to sit beside body text; split into two slides.

### 2.9 station hand-off (sample slide 10)

The framing slide before students switch to a station. The teaching happens
in the tool; the slide only poses the question.

```markdown
# 換你動手 _Tokenizer 探索站_

丟三句話進去，觀察它怎麼切：

- 一句全中文、一句全英文、一句混著寫
- 找一個會被**切碎**的詞

<span class="chip">🛠 apps/course2 · Tokenizer 站</span>

<!-- 講者備忘：開站後閉嘴讓他們玩 8 分鐘，巡場時提示罕見字。 -->
```

Do: 1 or 2 concrete things to try + 1 thing to notice; the chip carries the
station pointer.
Don't: screenshot-walkthroughs of the station; the station speaks for itself.

### 2.10 resources (sample slide 11)

Link-first closing slide.

```markdown
# 帶回家的東西 _Resources_

- 課程互動站：`camp.sitcon.org/ml`
- 今天的投影片與程式碼：`github.com/sitcon-tw`
- 想更深入：**3Blue1Brown 的 Transformer 系列**
```

### 2.11 capsule - OPTIONAL, not the backbone (sample slide 12)

A `--card` block for the rare slide that genuinely wants a boxed recap.
Default to plain text; reach for capsules only when boxing adds meaning
(e.g. a parts-list recap).

```markdown
<div class="capsule">

💡 **殘差連接** _Residual_ 讓深層網路記得原本的輸入。

</div>
```

Do: at most 3 capsules per slide; keep each to one line.
Don't: use capsules as generic paragraph wrappers; most slides need none.

### 2.12 station screenshot -「畫面長這樣」

Follows every station hand-off (§2.9). Trial-run feedback: describing the
interface aloud loses students - they find the control just as the
explanation moves past it. This slide shows the **actual station screen**
with the control to touch **annotated** (lime box + pill label), before
students switch over.

```markdown
# 畫面長這樣 _Tokenizer 探索站_

<div class="shot">

![h:1250](../assets/stations/tokenizer.png)

<div class="anno" style="left:6%; top:20%; width:40%; height:12%;"><span>切分方式在這裡切換</span></div>

</div>

###### 上面輸入文字，切換切分方式，下面就是切出來的 token 與編號
```

- Screenshots live in `assets/stations/<station-id>.png` (committed, ~1920px
  wide); recapture when a station's UI changes.
- `.anno` positions in **% of the image**, so coords survive `h:` resizes.
  Label sits above the box; add class `below` if the box hugs the top edge.
- One box per slide (two only if the task truly needs two controls); the
  caption reads the screen layout left-to-right / top-to-bottom.
- The slide's verbatim spine is the hand-off sentence:「畫面長這樣，你要動的
  旋鈕在這裡」- give students a beat to locate the control before opening
  the station.

---

## 3. Render checklist (per section file)

- [ ] Footer label set on the section's divider slide and correct throughout.
- [ ] Max one `**lime**` run per statement; no blown-up stats.
- [ ] Every content slide has a presenter-note comment.
- [ ] No `—` / `——` anywhere in slide copy.
- [ ] `pnpm png` renders the file with no overflowing slide (nothing pushed
      into the footer band).
