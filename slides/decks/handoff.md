# Handoff — Course 2 slide-content writing session

> **For Harry:** open a fresh Claude Code session in this repo and paste
> everything below the line into it. It's self-contained. Come back after Loop 0
> to calibrate voice before it writes the rest.

---

You are writing the **Course 2 lecture-slide content** for SITCON Camp 2026's
Machine Learning curriculum. Your job is to turn a curriculum spec into
**copy-ready slide content + layout notes** that Harry will lay out by hand in
**Affinity**. You are NOT building anything — no HTML, no slide framework, no
code. Your entire deliverable is edits to one markdown file.

## Step 1 — Read these before writing anything (in order)
1. `slides/decks/course2.md` — the file you will fill in. Read its
   **"For the writing agent — read this first"** section and the **SKELETON**.
   This is your task surface and it already encodes the rules; treat it as
   authoritative.
2. `docs/course-spec.md` — section **「第二堂課：模型架構演進」**. This is the
   pedagogy ground truth: the five loops, their beats, and the 撞牆
   (hit-a-wall) rhythm. Translate these beats into slides; do not invent new
   pedagogy.
3. `slides/design-system/` — the visual system (reverse-engineered from Harry's
   shipped "Attention Tracker" deck). Read `SYSTEM.md` → `archetypes.md` →
   `components.md` → `tokens.md`. Every slide's archetype and every capsule's
   anatomy comes from here.

## Step 2 — Understand the shape of the work
Course 2 is a **Web App course**: the heavy interaction happens in browser
*stations* (see `docs/course-spec.md` 開發清單 → 第二堂課, and `apps/course2/`).
The **slides are the lecture scaffold around those stations** — the hook, the
concept reveal, the moment a method hits a wall, the hand-off into a station, and
the wrap-up. Do **not** rebuild station content as static slides. When a beat is
"students explore in the tool," the slide is a short framing/transition slide and
should carry `→ hand off to <station>`.

## Step 3 — Write, one loop at a time
Fill in the per-slide entries in `slides/decks/course2.md` using the template
that's already in that file. Work **sequentially, loop by loop** (Front matter →
Loop 0 → 1 → 2 → 3 → 4), so voice and density stay consistent.

- Replace the `TODO` lines with real slide entries; renumber contiguously as you
  add/remove slides.
- **CHECKPOINT:** after you finish **Loop 0**, stop and show Harry the Loop 0
  slides for a voice/density calibration pass before continuing. Don't write all
  five loops blind.
- Fill the "Notes back to Harry" section at the bottom as you go (open questions,
  slides blocked on a station screenshot, beats that didn't map to an archetype).

## Copy & voice rules
- **zh-primary** (Traditional Chinese; audience = Taiwanese high-schoolers).
  Add an **en subtitle** only where the chosen archetype/component uses one
  (e.g. the canonical capsule) — don't force English everywhere.
- **Slide copy, not prose.** Titles are short; body lines are one idea each.
  A capsule is one heading + at most one body line (see `components.md §4`).
- Honor the loop's **撞牆 → 新工具/概念 → 再摸索** rhythm: name the wall the old
  method hits *before* you introduce the next architecture. Let the environment
  do the teaching; slides frame, they don't lecture.
- **Lime is the single text accent** — mark it `**[lime: …]**`, at most one
  emphasis run per statement.
- Titles use the **white (primary) / grey (secondary)** two-tier split — mark as
  `L1 (white)` / `L2 (grey)`.
- Numbers/stats stay **inline at body size, recolored lime** — there is no
  big-stat archetype.

## Do NOT
- Don't build HTML, a deck framework, or run any app. Output is markdown only.
- Don't restate interactive station content as slides (Step 2).
- Don't invent design tokens, colors, or components not in
  `slides/design-system/`. Pick archetypes from `archetypes.md` only.
- Don't invent pedagogy beyond `docs/course-spec.md`.

## Definition of done
- `slides/decks/course2.md` has every loop's beats turned into slide entries,
  no `TODO` lines left, contiguous numbering.
- Each slide has: archetype, footer label, loop/beat, title (with tiers/lime
  marked), body/component content, Affinity layout notes, assets needed, hand-off.
- The "Notes back to Harry" section captures every open question and blocker.
- Harry can lay out each slide in Affinity from its entry alone, with no
  follow-up questions.

## Your first action
Read the three inputs in Step 1, then reply with a **one-paragraph plan for Loop
0** (how many slides, each one's archetype and one-line purpose) and wait for
Harry's go-ahead before writing the slide entries.
