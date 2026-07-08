# Session: **Rewrite the UI copy to 正體中文 (zh-TW)** — Course 2 (wave 2, run first)

> Paste this whole file into a fresh Claude Code session at the repo root. It is
> self-contained. Deliverable: the **UI chrome** (shell landing/index/nav + the
> three non-upgraded stations) reads as **正體中文**, with technical terms kept in
> English — `typecheck`/`lint`/`build` green.

This is the **first prompt of wave 2** (upgrades to the already-built Course 2).
All six stations already exist and work in English. See `prompts/README.md` →
**Wave 2**.

## No i18n framework — just write zh-TW

We are **not** adding `react-i18next` or a locale system. The camp is Taiwanese;
the canonical UI language is **正體中文 (zh-TW)**. **Directly rewrite** the
user-facing English copy to zh-TW in place. No `t()` helper, no catalog, no
language switch. Keep it simple: the words on screen change, the code shape
doesn't.

## Two language axes — don't conflate them

1. **UI language (this prompt).** Interface chrome — buttons, control labels,
   headings, hints, takeaways, nav, the landing page → **static zh-TW**.
2. **Content language (later prompts, NOT here).** In `01a`/`02a` the *thing the
   student analyzes* (text being tokenized, words being embedded) can be Chinese
   or English via a **lesson control**. That's a teaching knob, a different axis.
   **Do not build any content toggle here.**

## Scope — touch each station once

- **You localize:** the **shell** (`apps/shell`) landing / index / nav, and the
  three stations **no other wave-2 prompt rewrites**: `order-shuffle`,
  `next-token`, `rnn-viz`.
- **You do NOT touch:** `tokenizer`, `embedding`, `transformer`. Their own wave-2
  prompts (`01a`/`02a`/`06a`) rewrite them (new controls + copy) in one pass;
  localizing them here would be redone work. Leave them English for now.

## Keep these in English (do-not-translate glossary)

Terms the camp teaches in English on purpose — keep verbatim (a one-time gloss in
parentheses on first use is fine, e.g. `Transformer（轉換器）`):

```
Transformer  RNN  MLP  BPE  token  tokenizer  embedding  attention
softmax  logit  vector  layer  head  self-attention  Q / K / V
next token  epoch  loss  bag-of-words  argmax  top-k  temperature
```

Also keep: route names, code identifiers, the `▁` marker, digits/indices.
Translate everything else: instructions, hints, takeaways, section titles,
empty/loading/error copy. When a term is a control label, keep the English term
but put zh-TW scaffolding around it (「切換 head」,「選擇句子」).

## Prerequisites & shared surface

- No wave-1 primitive work — copy only.
- Package boundaries still bind: don't move lesson copy into `@camp/viz` /
  `@camp/data`. Strings stay where they already are (in the stations / shell).

## Step 0 — Read first

1. `CLAUDE.md` — golden rules + boundaries.
2. `prompts/README.md` → Wave 2 + the shared Definition of Done.
3. `prompts/DESIGN.md` — the label idioms to preserve while swapping copy.
4. `apps/shell/app/page.tsx` + `apps/shell/app/layout.tsx` — landing/nav copy.
5. `apps/course2/src/stations/orderShuffle.tsx`, `nextToken.tsx`, `rnnViz.tsx`.
6. `apps/course2/src/stations/registry.tsx` — where sidebar `title`/`blurb` live.

## Step 1 — Localize the shell

`apps/shell/app/page.tsx`, `layout.tsx`, and any nav/index components: headline,
section blurbs, station index labels/blurbs, footer → zh-TW (glossary terms stay
English). Set `<html lang="zh-Hant-TW">` in the layout.

## Step 2 — Localize order-shuffle, next-token, rnn-viz

For each: rewrite **all** user-facing copy to zh-TW — `StationLayout`
`title`/`subtitle`, every control `label`, hints, `takeaway`,
loading/empty/error states, inline prose. **Do not change** logic, data, or viz —
copy only.

> The sidebar entry comes from `registry.tsx` (`title`/`blurb`), not the station
> body. Localize the registry entries for these three stations too, so the
> sidebar label matches the localized station header. (Leave the tokenizer/
> embedding/transformer registry entries alone — their prompts own them.)

## Step 3 — Audit `@camp/ui` for stray English

Grep control components (`SegmentedControl`, `LabeledSlider`, `Toggle`,
`RunButton`, `StationLayout`) for hard-coded user-facing English (default running
text, `aria-label`s, placeholders). Most labels are passed as props by stations
(good). Anything with a hard-coded English **default** that a station can't
override: give it a prop (preferred — keeps `@camp/ui` copy-free) or make the
default zh-TW. Don't add a copy catalog inside `@camp/ui`.

## Step 4 — Verify

```bash
pnpm typecheck && pnpm lint && pnpm build
pnpm dev   # shell :3000 (zh-TW) + course2 :5173
```

Open the shell landing and the three localized routes: zh-TW chrome, English
glossary terms intact, no layout breakage from string-length changes, no console
errors. Confirm tokenizer/embedding/transformer still build/render (English,
untouched).

## Design language (follow `prompts/DESIGN.md`)

- Only words change; idioms stay. **Latin** micro-labels keep
  `font-mono uppercase tracking-wide`. For **CJK** runs, `uppercase` is a no-op
  and heavy `tracking` hurts legibility — **drop letter-spacing on Han text**,
  keep the mono/label *role* (size + muted color) so the editorial rhythm holds.
- Zero-padded numeric indices stay digits.
- Color roles are untouched: lime = focus, cyan/purple = category.
- Confirm the CJK font fallbacks in `@camp/ui` (`Noto Sans TC` / `PingFang TC`)
  actually render the new Han body copy.

## Definition of Done (checked by `prompts/validate.md`)

Shared contract (`prompts/README.md` items 1–8), plus **zh-TW-specific**:

- [ ] No i18n library was added; copy is written directly in zh-TW.
- [ ] Shell landing / index / nav are zh-TW; `<html lang>` = `zh-Hant-TW`.
- [ ] `order-shuffle`, `next-token`, `rnn-viz` UIs are fully zh-TW (title,
      controls, hints, takeaway, states); glossary terms kept English.
- [ ] Sidebar labels for those three match their localized headers (registry
      updated).
- [ ] `@camp/ui` has no un-overridable user-facing English default; no copy
      catalog added inside `@camp/ui`.
- [ ] `tokenizer` / `embedding` / `transformer` left untouched.
- [ ] `pnpm typecheck && pnpm lint && pnpm build` are green.

## Report when done

Output: files changed, any string awkward in Han script (so later prompts follow
the same convention), and a one-line pass/fail per checkbox.
