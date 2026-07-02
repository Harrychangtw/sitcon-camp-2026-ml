# archetypes.md — Attention Tracker (SITCON 2026)

One entry per slide archetype. Each has a fill-in skeleton an authoring agent can
populate. Components referenced come from components.md; colors/types from
tokens.md. **Every one of the 41 slides is mapped in §Master map at the bottom.**

Archetypes present (count): cover (1), section-divider (4), statement (6),
chat-log (2), flow-diagram (3), data-viz (11), capsule-list (7), about/bio (1),
outline/TOC (1), experiment-intro (3), reference/citation (1), resources-board
(1), annotated-sentence (1). **big-stat and standalone comparison-columns do not
occur** — see notes.

---

## cover
- **Refs**: 1.
- **What**: title deck opener; here also self-documents the tokens (legend +
  swatches) and hides a themed prompt-injection easter egg.
- **Skeleton**:
  ```
  <HEAD title L1 (white)>
  <HEAD title L2 (grey)>
  … bottom band …
  [legend: HEAD/BODY/MONO + swatch row]   [metadata table: Speaker/Venue/Date]
  [footer]
  ```

## section-divider
- **Refs**: 4, 11, 26, 38.
- **What**: numbered section boundary over a full-bleed glitch/datamosh image.
- **Skeleton**:
  ```
  Section 0X.               (grey kicker, left-anchored lower-third)
  <CJK section question>    (white HEAD)
  [full-bleed datamosh background]
  [footer]
  ```

## statement
- **Refs**: 5, 10, 12, 17, 25, 40.
- **What**: full-screen sentence/beat, huge whitespace, left-aligned in a centered
  measure. Two flavours: two-tier plain (12, 25) and lime-payoff (5, 10, 17, 40).
- **Skeleton**:
  ```
  <🔗 source caption>                       (optional, top — slide 5)
  <white setup line(s)>
  <lime payoff line  OR  white line w/ one lime run>
  <optional divider + grey sub-question list>   (slide 25)
  [footer]
  ```
- **Note (big-stat)**: the deck has **no big-stat slide**. Its convention is to
  keep a statistic **inline at body size and recolor it lime** (slide 5 "36.8%"),
  never blown up as a hero number. Authoring agents should follow this, not invent
  a big-stat layout.

## chat-log
- **Refs**: 6, 13.
- **What**: reconstructed conversation. 6 = plain alternating bubbles. 13 = a
  bespoke nested annotated-frame explainer (model-view vs user-view) — same
  "chat" family but a one-off composite, not a reusable pattern.
- **Skeleton**:
  ```
  [🤖：assistant]                 (left)
                  [user：🙂]       (right)
  [🤖：multiline … ```lang]        (left)
  [footer]
  ```

## flow-diagram
- **Refs**: 7, 8, 23.
- **What**: nodes + labeled connectors showing a sequence/causal chain. Vertical
  (7), horizontal 3-stage under grey stage headers (8), or schematic layer-stack
  routed into a threshold branch (23).
- **Skeleton**:
  ```
  [stage headers?]  進入點   漏洞成因   最終衝擊     (slide 8)
  ( node )──label──▶( node )──label──▶( node )
     (nodes may carry mono log blocks / lime highlight chips)
  [footer]
  ```

## data-viz
- **Refs**: 14, 16*, 19, 20, 21, 22, 29, 30, 33, 34, 36. (*16 is capsule-list
  primary with a data-viz thumbnail role.)
- **What**: a chart is the hero. Sub-patterns:
  - *attention heatmap* (14, 19, 33, 34) — viridis matrix + legend/colorbar.
  - *distribution / small-multiples* (20, 21, 22) — danger-purple/safe-lime curves.
  - *chart + Key-Insight sidebar* (29, 30, 33, 34, 36) — chart left, numbered
    takeaways right.
- **Skeleton (chart + insight)**:
  ```
  <full-width title (grey lead + white clause)>
  ┌─ chart (viridis heatmap OR 4-color line series + threshold) ─┐   Key Insight:
  │  [legend]                                                    │   1. <lead> <body>
  └──────────────────────────────────────────────────────────────┘  2. …
  [footer]
  ```
- **Note (comparison-columns)**: no slide is a *standalone* comparison-columns
  archetype. Comparison appears **inside** data-viz: the 人類視角|機器視角 split
  (14) and the chart|Key-Insight split (29/30/33/34/36). Do not promote it to a
  top-level archetype.

## capsule-list
- **Refs**: 9, 16, 24, 27, 31, 37, 39.
- **What**: a set of capsules is the hero (see components.md §4 for variants).
  Usual layout = big left title + right vertical stack; 39 = centered title +
  3-across row; 16 = grouped stacks along a shallow→deep axis.
- **Skeleton**:
  ```
  <big left title>        ┌ capsule ┐
                          ┌ capsule ┐
                          ┌ capsule ┐   (stack of N)
  [footer]
  ```
  Pick a capsule variant: canonical(9) / horizontal+divider(24,27,31,37) /
  zh-only(24) / vertical(39) / numbered(19) / thumbnail(16).

## about / bio
- **Refs**: 2.
- **What**: speaker intro; two-column, oversized name left, bio detail right.
- **Skeleton**:
  ```
  <NAME (huge white)>          興趣與專長：<…>
  <email (grey)>              <affiliation / results lines>
  [footer]
  ```

## outline / TOC
- **Refs**: 3.
- **What**: agenda; grey section numerals + white section questions on the left,
  right-aligned page-number sub-lists on the right.
- **Skeleton**:
  ```
  01.  <section question>      <topic> ……… P. n
  02.  <section question>      <topic> ……… P. n
  03.  <section question>      <topic> ……… P. n
  [footer]
  ```

## experiment-intro
- **Refs**: 28, 32, 35. (Strong recurring "other" cluster.)
- **What**: experiment brief — big left two-line title, a 實驗目標/實驗流程
  capsule pair top-right, a recessive mono config appendix bottom-left. Capsule A
  (目標) = emoji+head │ vertical rule │ body; Capsule B (流程) = head, horizontal
  rule, numbered 1/2/3 list.
- **Skeleton**:
  ```
  實驗N：                       🎯 實驗目標 │ <body paragraph>
  <CJK sub-title>              🧬 實驗流程
                                 ── 1. … 2. … 3. …
  [mono config appendix]
  [footer]
  ```

## reference / citation
- **Refs**: 18.
- **What**: credit the source paper — lime+white title over a fanned paper-pages
  visual + grey byline.
- **Skeleton**:
  ```
  <lime accent run>: <white title remainder>
  <grey byline: authors | venue year>
  [fanned paper-pages image]
  [footer]
  ```

## resources-board
- **Refs**: 41.
- **What**: closing two-panel appendix — media gallery + citation list.
- **Skeleton**:
  ```
  Designed & Presented by <email>          (top-right)
  ┌ 延伸影片: thumb+source+title cards ┐  ┌ 相關文獻: link + citation lines ┐
  [footer]
  ```

## annotated-sentence (one-off, filed under "other")
- **Refs**: 15.
- **What**: one CJK sentence as a stage with color-coded emoji **head callouts**
  arrowing onto underlined spans (per-head coloring from the categorical set).
  Not a capsule (no card/divider/body). Closest enum neighbor is flow-diagram but
  the "flow" is annotation, not boxes.
- **Skeleton**:
  ```
  Multi-head Attention.          (grey watermark title)
  <centered CJK sentence w/ colored dashed underlines on spans>
  🤔 <head name>  👮 <head name>  … (colored arrows → spans)
  [footer]
  ```

---

## Master map — all 41 slides
| # | Archetype | Section label (footer-right) |
|---|-----------|------------------------------|
| 1 | cover | Cover |
| 2 | about/bio | About |
| 3 | outline/TOC | Outline |
| 4 | section-divider | The Injection Threat |
| 5 | statement (inline lime stat) | The Injection Threat |
| 6 | chat-log | The Injection Threat |
| 7 | flow-diagram | The Injection Threat |
| 8 | flow-diagram (3-stage; stripped-capsule anti-pattern) | The Injection Threat |
| 9 | capsule-list (**canonical capsule**) | The Injection Threat |
| 10 | statement (lime payoff) | The Injection Threat |
| 11 | section-divider | How LLMs "Listen" |
| 12 | statement (two-tier plain) | How LLMs "Listen" |
| 13 | chat-log (nested-frame one-off) | How LLMs "Listen" |
| 14 | data-viz (attention heatmap) | The Attention Tracker |
| 15 | annotated-sentence (other) | The Attention Tracker |
| 16 | capsule-list (thumbnail variant) + data-viz | The Attention Tracker |
| 17 | statement (lime run) | The Attention Tracker |
| 18 | reference/citation (other) | The Attention Tracker |
| 19 | data-viz (heatmap) + capsule-list (numbered) | The Attention Tracker |
| 20 | data-viz (distribution curves) | The Attention Tracker |
| 21 | data-viz (small-multiples wall) | The Attention Tracker |
| 22 | data-viz (small-multiples grid) | The Attention Tracker |
| 23 | flow-diagram (schematic + threshold) | The Attention Tracker |
| 24 | capsule-list (horizontal, zh-only) | The Attention Tracker |
| 25 | statement (heading + divider + list) | The Attention Tracker |
| 26 | section-divider | Exp 1: Context Length |
| 27 | capsule-list (horizontal, bilingual) | Exp 1: Context Length |
| 28 | experiment-intro (other) | Exp 1: Context Length |
| 29 | data-viz (chart + Key-Insight) | Exp 1: Context Length |
| 30 | data-viz (chart + Key-Insight) | Exp 1: Context Length |
| 31 | capsule-list (horizontal, bilingual) | Exp 1: Context Length |
| 32 | experiment-intro (other) | Exp 2: Cross-Language |
| 33 | data-viz (viridis heatmap + Key-Insight) | Exp 3: Forced Prefixes ⚠ |
| 34 | data-viz (viridis heatmap + annotations) | Exp 3: Forced Prefixes ⚠ |
| 35 | experiment-intro (other) | Exp 3: Forced Prefixes |
| 36 | data-viz (chart + Key-Insight) | Exp 3: Forced Prefixes |
| 37 | capsule-list (horizontal variant) | Conclusions |
| 38 | section-divider | Conclusions |
| 39 | capsule-list (vertical variant) | Conclusions |
| 40 | statement (lime CTA) | Conclusions |
| 41 | resources-board (other) | Resources |

⚠ = footer section-label mismatch (see SYSTEM.md bug list): 33/34 content is
cross-language but footer says "Exp 3: Forced Prefixes".
