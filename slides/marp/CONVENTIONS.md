# CONVENTIONS.md - the self-contained-deck contract (Course 2 rebuild)

Read `COOKBOOK.md` first (archetypes, two-tier text, footer, notes). This file
ADDS the self-containedness layer on top of it. Where the two disagree, this
file wins.

## The bar every slide must pass

**「一個沒在聽的學員，看這頁能不能自己接上？」** If not: add the artifact
(figure / table / annotated example / screenshot placeholder), or merge the
slide into a neighbor. Max ~5 bullets or one hero visual + caption per slide.
No paragraph prose on the slide face; teaching intent, timing and fallback
lines go into the HTML-comment presenter note (every content slide has one).

**No bare statement slides**, except intentional breathing beats (section
dividers, the Loop 0→1 cliffhanger, the final CTA — ≤4 in the whole deck).
Every allowed breathing beat carries a justifying comment:
`<!-- 呼吸拍：<why this slide may stay bare> -->`.

## Station cards (every station hand-off, fixed structure)

```markdown
# 換你動手 _像素撞牆站_

<div class="station">
<div class="st">
<h4>你要動的旋鈕</h4>

「▶ 訓練」讓兩顆一樣的 MLP 同時開練；按「還原排列 π⁻¹」

</div>
<div class="st">
<h4>試試看</h4>

- 按「▶ 訓練」，盯著兩條 loss 曲線，等它自己跑完
- 點兩邊網路圖上同一顆隱藏神經元，再按「還原排列 π⁻¹」

</div>
<div class="st">
<h4>你應該會看到</h4>

兩條 loss 曲線疊在一起，收在同一個準度。

</div>
<div class="st check">
<h4>檢核點</h4>

我看到打亂像素那顆 MLP，學得跟原始那顆一模一樣好。

</div>
</div>

<span class="chip">🛠 講師畫面／各組電腦已開好 · <a href="https://camp.harrychang.me/pixel-shuffle">/pixel-shuffle</a></span>
```

- Blocks stack vertically full-width; each `.st` is a 1:3 grid — grey `<h4>`
  label vertically centered on the left, body right, grey vertical divider
  between (檢核點 included — `.check` is just a hook, no special styling). The
  chip is auto-pinned to the slide's top-right corner by the theme
  (`section:has(.station) .chip`).
- 旋鈕 = the ONE knob from `docs/course-spec.md`. 試試看 = 2–3 concrete inputs
  to type / toggles to flip. 你應該會看到 = the expected observation, stated
  concretely. 檢核點 = one line, first person, checkable at a glance.
- Blank lines inside the divs are required (markdown must render inside HTML).
- Where the card asserts UI the station does not have yet, add
  `<!-- STATION SPEC: <what the builder must support for this card to be true> -->`.
  These are the inference-UI requirements handed to the station builders.

## Debriefs carry evidence

Every debrief embeds the artifact that proves the point (screenshot panels,
cited table, generated figure). Never a payoff sentence alone. A screenshot in
a debrief is recap, allowed; do not rebuild full station interactions.

## Timing + structure comments

- Each section starts with `<!-- ⏱ <segment> min · hands-on <n> -->` right
  after its divider. Timing lives in comments, never on the slide face.
- Compressible slides (PE / residual) are marked `<!-- 可壓縮 -->`.
- Footer labels per section (set on the divider): 文字怎麼變數字 / MLP 吃文字 /
  RNN / Transformer / 架構即樂高.

## Figures

- Output path: `slides/figures/<name>.png`, one committed generator
  `slides/figures/generate-<name>.py` each (or grouped). Reuse what exists:
  `onehot_encoding.png`, `word_embedding.png`, `bag_of_embeddings.png` + their
  generators.
- Palette constants (from `slides/figures/PALETTE.md`, verbatim):
  `BG #0A0A0A · CARD #171717 · GREY_MID #585858 · GREY #9E9E9E · WHITE #FFFFFF ·
  LIME #D6FB00 · CYAN #34E3ED · PURPLE #7235FF · MAGENTA #FF4EAB`, viridis ramp
  `#350B4C → #B8EF18` for heatmap-like data. Categorical accents for series;
  never mix the two families.
- Run headless: `uv run --with matplotlib --with numpy --with fonttools python3 <script>.py`.
  `matplotlib.use("Agg")`, dark canvas, `transparent=True`, `dpi=300`.
- **CJK in figures (departure from PALETTE.md):** the deck is now
  self-contained, so figures carry their own zh labels. Register Noto Sans TC
  alongside Artific and set a fallback list:

  ```python
  from matplotlib import font_manager
  noto = "slides/marp/assets/fonts/NotoSansTC-Regular.ttf"  # adjust rel path
  font_manager.fontManager.addfont(noto)
  plt.rcParams["font.family"] = [artific_family, "Noto Sans TC"]
  ```

  (Artific instancing helper: PALETTE.md §Typeface. Artific has no `∥` — use `||`.)
- Any illustrative (non-measured) curve is visibly labeled **示意圖** on the
  figure itself. Never invent experimental numbers; real cited data (Iyyer
  2015) is fine.
- Embed per COOKBOOK §2.8: `![h:1150](../../figures/foo.png)` + `######` caption.
  Content area is 3640 x 1500; leave caption room.

## Web assets you cannot fetch

Use the pre-generated placeholder frames in `slides/figures/` (dark dashed
frame + URL + 「截圖：…」 capture instruction), created by
`generate-web-placeholders.py`:

| File | Stands in for |
|---|---|
| `placeholder_tokenizer_text.png` | platform.openai.com/tokenizer, Text view (彩色切塊) |
| `placeholder_tokenizer_ids.png` | same page, Token IDs view |
| `placeholder_projector_neighbors.png` | projector.tensorflow.org, cat 最近鄰 panel |
| `placeholder_projector_tense.png` | projector 3D, walking→walked ‖ swimming→swam |
| `placeholder_projector_royal.png` | projector 3D, man→king ‖ woman→queen |
| `placeholder_transformer_explainer.png` | poloclub.github.io/transformer-explainer |
| `placeholder_brilliant_nexttoken.png` | Brilliant next-token 互動 |
| `placeholder_station_<tokenizer·embedding·shuffle·nexttoken·rnn·transformer>.png` | the six course2 stations |

Reference them like any figure. Every placeholder you use must appear in your
section's `<!-- ASSET TODO: <file>: <exact capture instruction> -->` comment
recording how to capture the real asset.

## Copy rules (delta over COOKBOOK)

- zh-TW Traditional, Taiwan usage; English inline for domain-native terms
  (token, embedding, attention, loss, shuffle, context). Latin runs get a
  space each side.
- **No em-dashes anywhere** (`—`/`——` banned). Fullwidth 、：，。「」; halfwidth `?`.
- **ONE lime `**…**` run per slide max** (tightened from per-statement).
- No manual slide counts, no NN/TT bookkeeping, no archetype labels on slides.
- Section files contain slide markdown ONLY (no frontmatter); slides separated
  by `---`; the merge adds frontmatter and concatenates in order.
