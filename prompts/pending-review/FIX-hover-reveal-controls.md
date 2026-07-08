# FIX: control explanations must reveal on hovering the control (not a hidden label), with an obvious (i) affordance — Course 2

> Paste this whole file into a fresh Claude Code session at the repo root. It is
> self-contained. Deliverable: hovering **anywhere on a dock control** (slider
> track, toggle segments) reveals that control's `info` explanation, and every
> control with an `info` shows a **persistent, obvious `(i)` icon** so students
> know an explanation is there. One shared change in `@camp/ui`; **no per-station
> edits**. `typecheck`/`lint`/`build` green. Run `/code-review high` when done.

## Why (trial-run feedback)

> 下方欄位的解釋原本是用 hover 在上方會出現 — 問題：很不容易被發現。或許可以直接
> 出現，或者加個 (i) 的 icon 會比較意識到要 hover。使用者 hover over slider 或
> toggle 就應該直接出現。

Today the explanation is triggered **only by hovering the small dotted-underlined
label text**, and the panel pops **above** the label. Students never discover it,
and hovering the actual slider/toggle does nothing.

## Current state (already mapped — trust this)

- The **single explanation primitive** is `packages/ui/src/InfoLabel.tsx`. When
  `info` is set it puts `cursor-help` + a dotted underline on the **label text
  only** (line ~22) and folds an absolutely-positioned panel out **above** the
  label on `group-hover/infolabel` (lines ~25-27). That's the whole affordance.
- `BlockSlider` (`packages/ui/src/BlockSlider.tsx`) and `BlockToggle`
  (`packages/ui/src/BlockToggle.tsx`) both render `<InfoLabel label info/>` then
  the control body. `BlockSlider` has its *own* `group/blockslider` hover that
  reveals only the **numeric value bubble** (lines ~49, 54-59) — don't break that.
- `DockControls` (`packages/ui/src/DockControls.tsx`) is a 2-col grid; each Block\*
  emits a **label cell** and a **control cell** as two sibling grid children with
  no wrapping element — this is the structural constraint for "hover the whole row."
- **Consumers only pass `info="…"` strings** (nextToken, embedding, rnnViz,
  transformer, tokenizer, rlPlayground). A behavior change inside the shared
  components needs **zero** station edits.

## What to build

1. **Add a persistent `(i)` icon** next to any label that has `info`, in
   `InfoLabel.tsx`. Small, muted, theme-token colored (no hard-coded hex — see
   `prompts/DESIGN.md`); it replaces "dotted underline is the only hint" with an
   actually-noticeable marker. Keep the dotted underline or drop it — your call,
   but the `(i)` must be the obvious cue.

2. **Make the whole control reveal the explanation.** Hovering the slider track or
   the toggle segments — not just the label — must open the `info` panel. The
   cleanest place is to promote the **entire Block\* row** (label cell + control
   cell) into one shared `group` scope so hover anywhere in the row triggers the
   `InfoLabel` panel. Because `DockControls` flattens the two cells with no
   wrapper, do this **inside** `BlockSlider`/`BlockToggle` (e.g. each wraps its own
   label+body in a `group/control` and `InfoLabel`'s panel keys off that group),
   OR give each Block\* a wrapping element that spans both grid columns. Reconcile
   with `BlockSlider`'s existing `group/blockslider` value-bubble hover so the two
   group scopes don't collide.

3. **Reveal immediately** — no long delay; the panel should feel instant on hover.
   Keep it CSS-only (theme tokens), matching the existing idiom.

4. Consider anchoring the panel so it doesn't get clipped by the dock; above is
   fine if it stays on-screen, but verify at the dock's real position.

## Out of scope (note, don't do)

- `BlockButtons`/`LabeledSlider`/`Toggle`/`SegmentedControl` don't take `info`
  today — leave them unless trivially free to include.
- The `StationLayout` **重點 (i)** top-panel badge (`StationLayout.tsx:96-131`) is
  a **separate** mechanism (driven by the `takeaway` prop). Out of scope here.
- On-canvas tooltips (`transformer.tsx` `HoverTip`, `rnnViz.tsx` `影響` label) are
  not control-dock explanations — leave them.

## Definition of Done

- Shared DoD in `prompts/README.md` (green `typecheck`/`lint`/`build`, package
  boundaries, theme tokens only).
- Hovering the **slider track** in `/transformer` (Layer/Head/Temperature) or the
  **toggle** in `/next-token` reveals the explanation; a visible `(i)` marks every
  control that has one. Verified in `pnpm --filter @app/course2 dev`, no console
  errors. **No station file was edited** (the win is that the shared change
  propagates to all six).
