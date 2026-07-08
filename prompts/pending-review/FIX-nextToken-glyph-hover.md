# FIX: Next Token — undisplayable tokens show the original character on hover — Course 2

> Paste this whole file into a fresh Claude Code session at the repo root. It is
> self-contained. Deliverable: BPE tokens that render as tofu/blank boxes get a
> readable placeholder **and** a hover that reveals what they actually are.
> `typecheck`/`lint`/`build` green. Run `/code-review high` when done.

## Why (trial-run feedback)

> Next Token 中有些字沒辦法正常顯示。
> (Harry's response: 中文有些無法顯示是正常的，但會加 hover 會顯示原本是哪個字。)

Qwen BPE tokens are often **fragments of a multi-byte UTF-8 sequence**, so a single
token can be half a Chinese character and renders as a replacement box. Students
see meaningless tofu with no way to tell what it is.

## Current state (already mapped — trust this)

File: `apps/course2/src/stations/nextToken.tsx`.

- Token text renders via `displayToken()` in two places: context-strip chips
  (~385) and probability-bar rows (~450).
- `displayToken` (lines ~79-81) only maps a leading space → `␣` and `\n` → `⏎`:
  `token.replace(/^ /, "␣").replace(/\n/g, "⏎")`. Anything else (partial-byte
  subwords, `�`, byte-level artifacts) passes through raw → tofu.
- **No `title`/hover** reveals the original anywhere: context chips (~373-395) have
  no `title`; bar-row token span (~445-451) has `truncate` but no `title`. Only a
  vocab **id** is printed under each chip (~392), not the character/bytes.

## What to build

1. **Detect undisplayable / partial tokens.** In or beside `displayToken`, detect
   tokens that won't render as clean text — e.g. contains the replacement char
   `�`, is a lone/partial UTF-8 continuation, or is otherwise non-printable.
   For those, render a **clear placeholder** (e.g. `▢` or a small "半個字" chip
   style) instead of a raw tofu box, so it's obviously "a fragment," not a bug.
2. **Hover reveals the truth.** Add a `title` (or the shared tooltip idiom) on
   **both** render sites that shows the useful reveal: the raw token string, its
   bytes / code points, and its vocab id — so a curious student can see "this is
   half of 「順」" or "byte 0xE9". Apply to normal tokens too (cheap, and helps with
   truncated bar rows).
3. Keep the existing `␣` / `⏎` substitutions.

## Notes

- This is display-only; don't touch the model/inference path or the id mapping.
- If several adjacent tokens combine into one visible character, a short hover note
  like "與前後 token 合起來才是一個字" would help — optional, only if easy.
- Follow `prompts/DESIGN.md`; the placeholder is quiet, not alarming.

## Definition of Done

- Shared DoD in `prompts/README.md`.
- At `/next-token` in dev, feeding input that produces a partial-byte token shows a
  clean placeholder (no raw tofu), and hovering any token reveals its raw
  string/bytes/id. No console errors.
