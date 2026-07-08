# FIX: Transformer — kill the redundant arrow, make Submit legible, teach heads↔layers, tame the Embedding strip — Course 2

> Paste this whole file into a fresh Claude Code session at the repo root. It is
> self-contained. Deliverable: four focused fixes to the final Course 2 station —
> (1) remove the confusing arrow, (2) a submit affordance that reflects
> unchanged-vs-changed input, (3) an on-screen explanation of what **heads** are
> and how they **relate to layers**, (4) make the in-pipeline **Embedding**
> visualization clearer (or gate it). `typecheck`/`lint`/`build` green. Run
> `/code-review high` when done. Build linearly in one thread.

## Why (trial-run feedback)

> Transformer 下方輸入處有個沒用的箭頭。Submit button 在沒有任何改變輸入的時候不會
> 變，需要有更明顯的特徵。Transformer 的 "Embedding" 視覺化，個人不確定能給學員帶
> 來什麼，擔心可能是帶來困惑比較多。I need to mention the role of "heads" in the
> system and also their correlation with layers.

## Current state (already mapped — trust this)

File: `apps/course2/src/stations/transformer.tsx`; input via `@camp/ui`
`SuggestInput`.

- **Input + submit:** `SuggestInput` wired at ~509-526 (`value={customText}`,
  `onSubmit={submitText}`). The submit **button IS an arrow SVG**
  (`packages/ui/src/SuggestInput.tsx:194-219`) — a line + right chevron. Its only
  state is `disabled={value.trim()===""}` (line ~198): lime when non-empty, grey
  when empty. It does **not** react to unchanged-vs-changed-since-last-submit.
  There is **no "dirty" state**: `customText` (~295) is the live value;
  `customSentence` (~296, set ~323) holds the last submitted payload but nothing
  compares them. Separately there are on-canvas pipeline `Arrow()` glyphs
  (~196-202; instances ~598/621/679/811) — the one right after column 01「輸入」
  (~598) is the other "arrow near the input" candidate.
- **Heads/layers:** `BlockSlider` dials — Layer ~529-538, Head ~539-548. Head's max
  is a flat `nHeads-1` **independent of the selected layer**. The only prose on
  what a head/layer *is* lives in the hover `info` (~531, ~541) and the takeaway
  (~561-568: "把這個 block 疊 N 層、每層 M 個 head"). Column-04 header shows
  `L{l} · H{h}` (~686-690). No persistent "a layer *contains* the heads" model.
- **Embedding strip:** column 03 (~623-677) renders a `VectorStrip`
  (`packages/viz/src/VectorStrip.tsx`) per token — a diverging purple↔grey↔lime
  representative slice; meaning is explained **only** in the hover tooltip
  (~649-656: "全長 N 維，這裡只畫得下 M 維的代表切片").

## What to build

1. **Remove the redundant arrow.** Decide which arrow the feedback means and fix
   the confusing one. The submit **button** already submits and Enter submits
   (`SuggestInput.tsx:168`) — if the button's arrow icon reads as "useless,"
   replace it with a clear **送出** affordance (text label, or icon+label). If it's
   the on-canvas `Arrow()` after column 01 that confuses, reconcile the pipeline
   arrows so they read as flow, not as a control. Don't leave two things that look
   like "click this arrow."
2. **Submit reflects dirty state.** Add a "changed since last submit" signal:
   thread the last-submitted text into a `SuggestInput` prop (e.g. `submittedValue`
   / `dirty`) and style the button in **three** legible states — *empty* (disabled,
   as now), *unchanged since last run* (idle/muted — "已送出"), *changed* (active
   lime — "按我重新跑"). The student must be able to tell at a glance whether
   pressing it will do anything. Keep it in `@camp/ui` so it's reusable.
3. **Teach heads ↔ layers on screen.** Add persistent copy (not hover-only) that
   says: a **layer** is one processing stage; each layer contains **several heads**
   that each watch a different relationship between words; the model **stacks N
   layers, each with M heads** (`data.nLayers`/`data.nHeads`). Make the column-04
   `L{l} · H{h}` header legibly express "layer L, its head H of M." Plain 白話文;
   pairs with `prompts/fixes/stations/FIX-jargon-inline-glossary.md` (that prompt does the *plain
   identity*; this one adds the *relationship* — don't double up wording).
4. **Tame the Embedding strip.** Make column 03 earn its place or gate it. Prefer:
   add a short **visible** caption (one line: "每個字變成一排數字，顏色 = 數字正負
   大小") so it isn't a mystery grid, and tie it back to the Embedding station's
   idea. If it still reads as noise, make it **collapsible / off by default** with
   a "展開 embedding" affordance. Don't silently delete it — but it must stop
   confusing more than it teaches.

## Constraints

- Keep the real-Qwen live-inference plumbing intact (see `prompts/DONE-06b`).
- `prompts/DESIGN.md`: theme tokens, lime = focus only, mono micro-labels.
- Changes to `SuggestInput` are shared `@camp/ui` — keep other consumers working.

## Definition of Done

- Shared DoD in `prompts/README.md`.
- At `/transformer` in dev: no ambiguous/duplicate "click this arrow"; the submit
  control visibly distinguishes empty / unchanged / changed; a student can read —
  without hovering — what a head and a layer are and that a layer contains heads;
  the Embedding column has a visible caption or is collapsed by default. Live
  inference still runs on typed input. No console errors.
