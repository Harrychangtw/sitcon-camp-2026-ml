# FIX: RNN Viz — colour legend, legible axes, and "read the bottom row" explanation — Course 2

> Paste this whole file into a fresh Claude Code session at the repo root. It is
> self-contained. Deliverable: the RNN station tells students **what the colours
> mean** (legend/spectrum), makes the **heatmap axes legible**, and makes the
> **influence (green) row + its decay** the obvious focal point. `typecheck`/
> `lint`/`build` green. Run `/code-review high` when done. This is the station
> flagged as the **biggest issue** in the trial run — prioritize clarity.

## Why (trial-run feedback)

> RNN: 重點如果只有下面那欄，要特別說（挺容易注意力在上面欄位）。學員會不知道紫色
> 跟黃色代表是什麼，要附上光譜。Heatmap 的 Axis 很不明顯。RNN next 關可以在畫面上
> 加一些解釋，譬如綠色格字代表什麼、如果綠色格字變少代表什麼。

## Current state (already mapped — trust this)

File: `apps/course2/src/stations/rnnViz.tsx`. The heatmap is a **hand-rolled CSS
grid** (not the `@camp/viz` Heatmap), lines ~285-291.

- **Colours:** `hiddenColor` (lines ~210-215): value `>= 0` → `mix(zero,
  theme.accent, t)` = **lime/yellow**; `< 0` → `mix(zero, theme.accent3, -t)` =
  **purple**; zero → grey. Domain fixed ±1 (tanh). No legend anywhere.
- **The "green cells" = the 影響 (influence) row**, rendered *below* the hidden
  block after a separator (rows at ~361-399). Always tinted `theme.accent` with
  opacity `0.12 + 0.88*influence` (~390-393). "Fewer/fainter green" = the earliest
  token's influence has **decayed** — that decay *is the whole lesson*. The 影響
  label already has a hover tooltip (~361-369) but the per-cell meaning isn't in
  visible copy.
- **Axes (too faint):** column/token headers ~295-314 use `text-[10px]
  text-muted/40`; row gutter hidden-dim labels `h00…` at ~321-323 are
  `text-[9px] text-muted`. No descriptive axis titles.

## What to build

1. **Colour legend / spectrum.** Add a small always-visible legend near the
   heatmap: a purple → grey → lime gradient bar labeled with what each end means
   (e.g. 負值 / 0 / 正值 for the hidden state), in plain 白話文. Derive colours from
   the same `theme.accent`/`accent3` so the legend and cells can't drift. Add a
   second tiny swatch for the **green 影響 row** ("越綠 = 這個字對現在的影響越大").
2. **Legible axes.** Bump the token headers and `h00…` gutter labels out of the
   `text-muted/40` / `9px` range into something readable, and add short axis
   **titles**: columns = 「一次讀進一個字 →」, rows = 「hidden state 的各維度 ↓」
   (gloss `hidden state` per `prompts/fixes/stations/FIX-jargon-inline-glossary.md` conventions).
3. **Point attention at the bottom row.** Add visible copy that says the key thing
   to watch is the **influence row**: what a green cell means, and that **fewer /
   fainter green cells over time = the RNN forgetting the earliest words** (the
   two-walls payoff). Make it read as "watch here," since students' eyes go to the
   big top grid.

## Constraints

- Follow `prompts/DESIGN.md` — theme tokens only, no hard-coded hex; lime stays the
  focus accent. The legend is explanatory chrome, quiet, not shouty.
- Don't rebuild the grid as `@camp/viz` Heatmap; this is a bespoke lesson layout.
  Keep changes additive.

## Definition of Done

- Shared DoD in `prompts/README.md`.
- In `pnpm --filter @app/course2 dev` at `/rnn-viz`: a student can, **without
  hovering**, read what purple vs yellow (lime) mean, read the axis titles, and
  see copy that tells them to watch the green influence row and what its fading
  means. Axis labels are legible at normal zoom. No console errors.
