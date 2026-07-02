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

## Handoff — Merge order-shuffle / tokenizer / embedding station worktrees

### Done this session
- Integrated three completed station worktrees into the main tree by content (not `git merge` — live next-token WIP made a clean merge impossible): filled the orderShuffle/tokenizer/embedding canvases, unified `precompute/cli.py` (all subcommands on `upsert_manifest_artifact` + new `embedding.py`), regenerated `manifest.json` (5 artifacts), brought in `@camp/viz` Scatter2D/Scatter3D/theme.ts + `three` deps (`a303387`). typecheck + build pass.
- Removed the three worktrees and force-deleted their branches after integration (`worktree-order-shuffle` aa1afbe, `worktree-tokenizer-station` f642e37, `worktree-embedding-station` dd416f8).

### Loose ends
- next-token station is still active WIP owned by another session — left uncommitted (`nextToken.tsx`, `next-token/` data, `Heatmap.tsx`, `theme.css`, `tailwind-preset.cjs`, `loadManifest.ts`, `index.html`, slides). My commit depends on some of these (e.g. `loadManifest.ts`'s optional `station` field) but coexists in the working tree.
- Design tokens (`theme.css`/`tailwind-preset.cjs`/`index.html`) were resolved to the next-token/working-tree versions as canonical; the branches only differed in accent tuning/comments. A human could overrule.
- Integration was content-only, so no merge commits — the original per-station commits are recoverable from reflog (~90 days) if that history is wanted.

### Suggested next
- Once next-token WIP is committed, run `pnpm typecheck && pnpm build` on the combined tree and consider a `camp-precompute make-data` convenience that runs all station builders.
