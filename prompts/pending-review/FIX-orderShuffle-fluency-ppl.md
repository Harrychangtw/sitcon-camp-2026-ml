# FIX: Order Shuffle — explain 通順度 / PPL on hover, and stop a good sentence showing a scary negative — Course 2

> Paste this whole file into a fresh Claude Code session at the repo root. It is
> self-contained. Deliverable: the **通順度** and **困惑度 (PPL)** readouts each
> carry a plain-language explanation, and a clearly-correct sentence no longer
> reads as "negative = bad." `typecheck`/`lint`/`build` green. Run
> `/code-review high` when done.

## Why (trial-run feedback)

> On the order-shuffling page, not only do 通順度 and probably ppl need a hover
> modal, but when 通順度 shows negative on a very clearly correct line, it's
> confusing.

## Current state (already mapped — trust this)

File: `apps/course2/src/stations/orderShuffle.tsx`.

- **通順度** is `shownFluency.avgLogProb` (assembled ~286-294, shown ~846-851). It's
  an **average log-probability → essentially always negative** (a correct sentence
  still prints e.g. `-2.34`). The bar `fluencyPct` normalizes over a fixed negative
  domain `logProbDomain ?? [-11, -2]` (~381-384). The raw negative number is
  printed verbatim with no rescaling — that's the confusion.
- **PPL** is `shownFluency.ppl` (label `困惑度 ppl`, shown ~863-868); its bar fills
  as the sentence gets **worse**, width `(1 - fluencyPct)*100%` (~873). `ln(ppl) ==
  -avgLogProb` (comment ~859-862). Higher = worse.
- **No tooltip exists on either readout** — both labels are plain `<span>` (~847,
  ~865). The only `title` in the file is on token cards (~729).

## What to build

1. **Hover explanation on both readouts.** Reuse the shared `InfoLabel`/tooltip
   idiom (see `prompts/fixes/shared-ui/FIX-hover-reveal-controls.md`; if that's merged, use the
   same `(i)`-marked hover so it's discoverable). Plain 白話文:
   - 通順度 = 模型覺得這句話有多「順」/像人話；越高越順。
   - 困惑度 (PPL) = 模型看到這句話有多「困惑」；越低越好，順的句子困惑度低。
   Mention they're two views of the same number (`ln(ppl) = −通順度`) if it fits.
2. **Fix the scary negative.** A correct sentence must not read as "negative =
   bad." Pick one and apply consistently:
   - **Preferred:** show 通順度 as the **normalized 0–100 bar value** (or a "越順
     →" scale) as the headline number, and demote the raw `avgLogProb` to a small
     mono sub-value / hover detail. Then a good sentence shows a *high* number.
   - Or rescale/relabel so the sign isn't the first thing a student reads.
   Keep the underlying math and the PPL relationship intact; this is a
   presentation fix. Make 通順度 and PPL visibly move in **opposite** directions on
   a good vs bad sentence so the pairing teaches itself.

## Constraints

- `prompts/DESIGN.md` — theme tokens, mono micro-labels, lime for focus only.
- Don't change what's computed upstream (`presetScore`/`liveMatches`); change how
  it's presented/derived for display.

## Definition of Done

- Shared DoD in `prompts/README.md`.
- At `/order-shuffle` in dev: hovering 通順度 or 困惑度 shows a plain explanation;
  a clearly-correct sentence shows a **good-looking** 通順度 (not a bare negative),
  and 通順度 ↔ PPL visibly move opposite ways when the order is shuffled. No
  console errors.
