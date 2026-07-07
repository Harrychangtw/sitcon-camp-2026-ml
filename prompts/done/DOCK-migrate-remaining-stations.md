# Session: Migrate the remaining stations onto the bottom-center control dock

> Paste this whole file into a fresh Claude Code session at the repo root. It is
> self-contained. Deliverable: transformer, order-shuffle, rnn-viz, and
> tokenizer stations moved onto the new dock, with `pnpm --filter @camp/ui
> typecheck` and `pnpm --filter @app/course2 typecheck` green.

## Context: what already exists

A previous session (`091c2b2`) replaced `StationLayout`'s full-height right rail
with a floating **bottom-center dock** and migrated **embedding** + **next-token**
as the reference. Read those two stations first — copy their structure exactly:

- `apps/course2/src/stations/embedding.tsx`
- `apps/course2/src/stations/nextToken.tsx`

`StationLayout` now takes an `input?` slot (left of the dock) plus `controls`
(right). Title floats top-left; the `重點` takeaway is an auto hover-reveal info
badge top-right — nothing to do there per station.

## The shared `@camp/ui` controls (use these, don't rebuild)

- **`SuggestInput`** — the one primary text field. Props: `value`, `onChange`,
  `onSubmit`, `placeholder`, `ariaLabel`, `presets` (`{label,value}[]` shown as a
  vertical popover when focused-and-empty), `status` (e.g. `<LiveStatus/>`). This
  is where **preset/試試看/sentence-picker chips get merged** — pass them as
  `presets`, delete the old separate picker block.
- **`DockControls`** — wraps the controls; a 2-col `[label | control]` grid.
- **`BlockToggle<T>`** — full-width segmented pick-one (`label`, `value`,
  `onChange`, `options`).
- **`BlockSlider`** — blocky gradient slider (`label`, `min`, `max`, `step`,
  `value`, `onChange`, optional `format`, `disabled`, `ariaLabel`).

## The principle (from the user)

- The dock holds **controls only**: the primary input (left) + a short stack of
  toggles/sliders (right). Keep it lean.
- **Everything else gets thrown OUTSIDE the dock** onto the canvas as a floating
  overlay the station positions itself (neighbour lists, legends, help text,
  step commentary, readouts). See embedding's canvas overlays for the pattern
  (`absolute` panels with `bg-panel/90 backdrop-blur`, quiet caption bottom-left).
- Stations are `fullBleed` where the canvas is the focus.

## Per-station work

1. **transformer** (`transformer.tsx`) — biggest. Two modes via `BlockToggle`
   (模式). 真實模型: the typed-sentence box → `SuggestInput` with the recorded
   sentence presets merged in as `presets`; Layer/Head → `BlockSlider`s. 機制示意:
   step controls stay, but move the long help/commentary blocks out of `controls`
   onto the canvas. The pipeline table + `AttentionLines` are canvas content.
2. **order-shuffle** (`orderShuffle.tsx`) — move its controls into `DockControls`;
   input (if any) → `SuggestInput`.
3. **rnn-viz** (`rnnViz.tsx`) — same treatment.
4. **tokenizer** (`tokenizer.tsx`) — NOTE: this file may be actively edited by
   another session (it showed as modified in the dock session's tree). Check
   `git status` first; if it has uncommitted changes you don't own, coordinate or
   skip it and note that in your handoff.

## Guardrails

- Don't cross package boundaries (`CLAUDE.md`): controls/layout live in
  `@camp/ui`; no lesson data or fetching in the packages. If a control shape
  recurs and isn't yet in `@camp/ui`, add it there rather than inline.
- Keep each station's existing state/logic; this is a **presentation** move.
- The submit arrow on live-on-type stations is cosmetic (`onSubmit` idempotent) —
  mirror what embedding/next-token do.

## Done when

- All four stations render on the dock with lean controls + canvas overlays.
- `pnpm --filter @camp/ui typecheck` and `pnpm --filter @app/course2 typecheck`
  are green. Eyeball with `pnpm --filter @app/course2 dev`.
- Commit per the repo convention; append a `## Handoff` block to `TODO.md`.
