# TODO

Session handoffs, newest at the bottom.

## Handoff — Attention Tracker design system + Course 2 slide scaffold

### Done this session
- Reverse-engineered the shipped Attention Tracker deck into a design system: 41 per-slide findings + synthesized `SYSTEM.md`/`tokens.md`/`components.md`/`archetypes.md` under `slides/design-system/` (`f13849a`).
- Filed the ML course spec to `docs/course-spec.md`; scaffolded `slides/decks/course2.md` (copy-ready skeleton) and `slides/decks/handoff.md` (fresh-session writer prompt) (`26b3994`).

### Loose ends
- Reference image binaries under `slides/reference/` are still untracked (large, not created this session) — decide gitignore vs. Git LFS vs. commit.
- Course 2 footer section labels are proposed in zh in `course2.md`; decide zh vs. English (to match the reference deck) — one-line change.
- Design-system note: the categorical 4-accent palette is treated as **on-system** (verified from slide 1's legend), tightening the earlier "off-system" read.

### Suggested next
- Run a fresh writer session via `slides/decks/handoff.md` to fill in Course 2 slide content (it pauses for review after Loop 0).
- Repeat the design-system + deck flow for Course 1 and Course 3 (`slides/decks/course1.md`, `course3.md`).
