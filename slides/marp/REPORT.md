# REPORT: Course 2 deck rebuild (self-contained Marp)

Rebuild of the Course 2 deck (模型架構演進：MLP → RNN → Transformer, 180 min,
zh-TW) as a single self-contained Marp presentation. Bar for every slide:
**a student who missed the last 20 seconds of narration can re-orient from the
slide alone.** Contract: `slides/marp/CONVENTIONS.md` (layered on COOKBOOK.md).

## What shipped

| Artifact | Path |
|---|---|
| Merged deck (38 slides) | `slides/marp/deck/course2.md` |
| Section sources (5 files, merge inputs) | `slides/marp/deck/sections/00-front-loop0.md` … `04-loop4-resources.md` |
| Built HTML / PDF | `slides/marp/out/course2.html`, `out/course2.pdf` |
| Visual-verify renders (all 38, 0.5×) | `slides/marp/out/verify2/s.*.png` |
| Screenshot swap-in list | `slides/marp/ASSETS-TODO.md` |
| New figures + committed generators | `slides/figures/*.png` + `generate-*.py` |

Build command (verified passing for both targets):

```bash
cd slides/marp && pnpm exec marp --config marp.config.js --allow-local-files \
  deck/course2.md -o out/course2.html   # and -o out/course2.pdf
```

Merge recipe: frontmatter (`marp/theme: camp-dark/paginate/footer`) + the five
section files concatenated in order, joined by `---`. Re-run it after editing
any section file; sections contain slide markdown only, no frontmatter.

## Structure and timing (177 / 180 min)

| Section | Slides | Timing comment (in deck) |
|---|---|---|
| Front + Loop 0 文字怎麼變數字 | 1–12 | 42 min · hands-on 18 |
| Loop 1 MLP 吃文字 | 13–19 | 30 min · hands-on 14 ＋ ☕ 10 min |
| Loop 2 RNN | 20–26 | 43 min · hands-on 19 |
| Loop 3 Transformer | 27–34 | 42 min · hands-on 20（PE/residual 可壓縮，共 −10） |
| Loop 4 架構即樂高 + Resources | 35–38 | 10 min · 收尾 |

Total 177 min against the 180 budget; the two `<!-- 可壓縮 -->` slides (PE,
residual, slides 31–32) buy back 10 min if a hands-on runs over. Timing lives
in `<!-- ⏱ … -->` comments on each divider, never on the slide face.

## Per-loop changes vs the old deck (`deck/part-*.md`, now deleted)

The loop rhythm (問題 → 摸索 → 撞牆 → 新工具 → 再摸索) and the course-spec
beats are unchanged. What changed is self-containedness:

- **Front matter.** Stale baked `toc.png` replaced by a markdown outline slide
  that names the five loops (editable, stays in sync with the deck).
- **Loop 0.** Tokenizer and Embedding hand-offs rebuilt as fixed-structure
  station cards. Debriefs now carry evidence: tokenizer Text/Token-IDs panel
  pair (slide 6), projector nearest-neighbour panel + two analogy projections
  under a new 方向類比 heading (slide 10), and the embedding-bias point is
  anchored to the real Bolukbasi et al. NeurIPS 2016 paper (cited again in
  Resources). Loop 0→1 cliffhanger kept as a justified breathing beat.
- **Loop 1.** The bag-of-words wall now shows **real numbers**: the Iyyer et
  al. 2015 table on the debrief slide (no invented results anywhere in the
  deck). 順序撞牆站 card with the shuffle knob and MLP(bag) ↔ RNN toggle.
  Break slide kept after the wall (justified breathing beat, functional copy).
- **Loop 2.** next-token 站 (context slider) and RNN 視覺化站 cards; the
  context-length accuracy curve and the unstable-loss animation stills are
  generated figures visibly labeled 示意圖.
- **Loop 3.** Divider carries the bridging question baked into the art
  (justified breathing beat). rnn_vs_attention, attention_orderblind,
  pe_stripes, residual_skip, qkv_diagram figures generated for each beat; PE
  and residual slides marked 可壓縮; QKV kept (chip link to
  transformer-explainer, no embedded screenshot to avoid overflow); loop
  closes on a four-capsule recap 「拼起來，就是 Transformer」.
- **Loop 4.** Three-architectures synthesis gets a hero figure
  (`three_arch_glyphs.png`) over the three-column 假設 comparison; final CTA
  kept bare (4th justified breathing beat); Resources slide embeds the two
  take-home interactive previews + the full bias-paper citation.

Convention checks passing across all 38 slides: no bare statement slides
outside the 4 justified 呼吸拍; one lime `**…**` run per slide max; no
em-dashes; per-section footers (文字怎麼變數字 / MLP 吃文字 / RNN / Transformer /
架構即樂高 / Resources); every content slide has a presenter note with 講者備忘
＋ 自學備註.

## Station-builder requirements (collected STATION SPECs)

The six stations run as live inference UIs on the 4×V100 server; the browser
never trains (loss curves replay precomputed logs). Each station card in the
deck asserts UI that must exist for the card to be true. Collected verbatim
from the `<!-- STATION SPEC -->` comments:

1. **Tokenizer 探索站** (slide 5) — must accept free-text input（中英混寫、
   標點、空格、任意罕見詞／人名）, and for that input display **both** the
   coloured token segmentation and the numeric token id array, live.
2. **Embedding 探索站** (slide 9) — 2D/3D projection of the embedding space;
   select any word to highlight it; list its nearest neighbours
   (cosine/euclidean) so 「距離即語意」 is directly observable.
3. **順序撞牆站** (slide 16) — shuffle on/off 開關、MLP(bag) ↔ RNN 模型切換、
   同一句 shuffle 前後與兩模型的準度即時對比（course-spec l.80「兩者準度即時
   對比」）.
4. **next-token 站** (slide 22) — 可調 context 視窗長度的逐字預測介面
   （context 滑桿）＋每個候選字的機率顯示（機率條），讓「context 越長、機率越
   集中」可被學員直接觀察.
5. **RNN 視覺化站** (slide 25) — hidden state 沿序列逐步流動的播放／步進動畫
   （每步可見記憶更新、且早期資訊隨距離變淡）＋同步顯示訓練 loss 曲線亂跳的
   不穩動畫.
6. **Transformer 站** (slides 29, 31, 32) — three sub-requirements on one
   station（此站 12 min、hands-on 10）:
   - 點選任一 token，畫出它到所有 token 的 attention 權重連線（權重以線粗細或
     不透明度呈現）.
   - PE on/off 開關 ＋ 順序打亂鈕；PE 開時打亂順序輸出會變，PE 關時打亂輸出
     不變.
   - residual on/off 開關 ＋ 訓練 loss 曲線；關掉時 loss 亂跳、開起來就穩；
     曲線播放預算好的 loss 紀錄，瀏覽器不訓練.

Once URLs exist, fill the six 「URL 開站後補」 chips (see ASSETS-TODO.md).

## Judgment calls

1. **Infra path divergence.** The task brief assumed `slides/course2/`; the
   repo's real, working Marp infra (theme, fonts, config, figure pipeline,
   baked divider art) lives in `slides/marp/` ＋ `slides/figures/`. Rebuilt in
   place there rather than duplicating the toolchain. The old `deck/part-*.md`
   files are superseded by `deck/sections/*` ＋ merged `deck/course2.md`
   (deletion staged in git).
2. **TOC un-baked.** The old cover flow used a pre-baked `toc.png` that no
   longer matched the loop structure; replaced with a markdown outline slide.
3. **CJK in figures.** Figures now carry zh labels, so generators register
   Noto Sans TC as fallback after Artific (a recorded departure from
   PALETTE.md, documented in CONVENTIONS.md §Figures). Artific has no `∥`;
   analogy figures use `||`.
4. **QKV slide keeps the diagram, not the screenshot.** Embedding the
   transformer-explainer capture alongside `qkv_diagram.png` overflowed the
   content area; the slide uses the diagram + a chip link, and the screenshot
   appears once, in Resources.
5. **Unused station placeholders.** `generate-web-placeholders.py` produced
   six `placeholder_station_*.png` frames that no section ended up using
   (station hand-offs use cards + chips, not screenshots). Kept on disk,
   flagged in ASSETS-TODO.md.
6. **Slide 34 title shortened** to 「拼起來，就是 Transformer」 both to clear
   the capsule stack (see fixes below) and to echo slide 37's 「零件拼起來，
   就是大模型」.

## Verification pass (all 38 slides rendered and inspected)

Rendered every slide to PNG (`out/verify2/`) and checked: loop-chain
continuity, station cards complete (5 fixed parts each), debrief evidence
present, 示意圖 labels visible on every illustrative curve
(context_accuracy, residual inset, 兩道牆), Iyyer numbers match the paper,
breathing beats ≤4 and commented, footers and pagination correct. Three
layout defects found and fixed, then re-rendered and confirmed:

| Slide | Defect | Fix |
|---|---|---|
| 10 | Right column (analogy projections) lacked a heading; layout unbalanced | Added `### 方向類比` |
| 34 | Long h1 collided with the right-half capsule stack (`:has(.caps)` centering) | Title shortened to 「拼起來，就是 Transformer」 |
| 38 | 2× `h:420` resource images overflowed up into the title band (whole-slide vertical centering) | `h:420` → `h:300` |

## Known gaps / next steps

- 7 placeholder frames await real screenshots: see `ASSETS-TODO.md` (swap by
  filename, rebuild; no markdown edits).
- 6 station-card chips await live station URLs.
- Uncommitted: rebuilt deck ＋ sections, new figures ＋ generators, `out/`
  artifacts, this report, and the staged deletion of `deck/part-*.md`.
