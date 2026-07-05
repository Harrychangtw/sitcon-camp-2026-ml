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

## Handoff — R1: unified embedding space + live GPU status infra

### Done this session
- Full R1 refactor (`3161493`): single `Qwen3-Embedding-0.6B` space over combined zh+en vocab (precompute + server + station), always-embed typed words, and the shared wave-3 infra R2 needs (`@camp/data` `liveInferTimed`, `@camp/ui` `LiveStatus`). Export verify-guard passes; typecheck/lint/build green; browser-verified live (`GPU · 443 ms`) and offline-fallback paths on the 3090.
- Fixed a latent bug: `liveEnv()`'s `import.meta` aliasing disabled live inference in dev AND prod builds — `liveInfer` had never actually fired anywhere.

### Loose ends
- Server-side 422s (spaces, >64 chars) render as the 離線 line — honest enough, but R2 could add a distinct "rejected input" state.
- The uvicorn server on :8300 was restarted with the new unified state; `dist/` rebuilt, so the :5173 preview now really calls the tailscale URL (mixed-content/CORS applies for remote clients).

### Suggested next
- Run `prompts/R2-real-models-live-gpu.md` (reuses `liveInferTimed`/`LiveStatus` verbatim); sanity-check the other three stations' live paths now that the env fix makes them actually fire.

## Handoff — Bottom-center control dock for stations

### Done this session
- Replaced the full-height right rail with a floating **bottom-center dock** in `StationLayout` (title floats top-left, 重點 collapses to a hover-reveal info badge top-right, `input` slot left / `controls` slot right); added shared `@camp/ui` controls `SuggestInput`, `BlockToggle`, `BlockSlider`, `DockControls`; migrated the embedding + next-token stations onto it with readouts thrown onto the canvas as overlays (`091c2b2`). `@camp/ui` + `@app/course2` typecheck green.
- Aesthetic per user mockup: big borderless prompt box (top-aligned text, submit arrow, focus-empty preset chips as a vertical popover), blocky dark→lime gradient slider with slim hover-thickening handle + pop-up value + step ticks, concentric dock corner radius (`rounded-[18px]` = inner `md` + `p-3`).

### Loose ends
- Only embedding + next-token are migrated. The other stations (tokenizer, order-shuffle, rnn-viz, transformer) still pass their old vertical control stacks into `controls`, so they render cramped in the dock until migrated — see `prompts/DOCK-migrate-remaining-stations.md`.
- Slider CSS verified only by typecheck, not in-browser: the `group-hover/blockslider:[&::-webkit-slider-thumb]` handle-thicken and the value-bubble position at range extremes should be eyeballed with `pnpm --filter @app/course2 dev`.
- The submit arrow on live-on-type stations (both migrated ones) is cosmetic — `onSubmit` is idempotent; hide it later if it reads as dead.

### Suggested next
- Run `prompts/DOCK-migrate-remaining-stations.md` to move transformer / order-shuffle / rnn-viz / tokenizer onto the dock (transformer's sentence presets → `SuggestInput`).

## Handoff — Migrate remaining stations onto the bottom-center dock

### Done this session
- Migrated **transformer / order-shuffle / rnn-viz / tokenizer** onto the dock (`e694182`): primary text → `SuggestInput` with the recorded presets folded in as focus-empty chips (a submitted/typed text that exactly matches a preset selects the recorded artifact locally, no round-trip); toggles/sliders → `BlockToggle`/`BlockSlider` in `DockControls`; instructional helper labels deleted per user; tokenizer's stats `dl` floats top-right on the canvas.
- Per user direction mid-session: **no submit arrow** on live-on-type stations (embedding, next-token, tokenizer, order-shuffle, rnn-viz all run debounced live-on-type now; only transformer keeps Enter/arrow submit — its response is a full 28×16 attention tensor). rnn-viz lost 餵給RNN / 上一步 / 下一個token / 跑整段序列 (the 拖曳 slider is the only step control; `playing` auto-advance removed). order-shuffle lost 拆成詞塊 and its right column — 打亂 (lime) / 還原 (borderless) sit inside the input box via a new `SuggestInput` `actions` slot.
- `@camp/ui` additions/tweaks: `BlockButtons` (dock action row, used by transformer 播放); `SuggestInput` is now an auto-growing textarea (`max-h-36` then scrolls) with borderless preset chips, the `actions` slot, and a `multiline={false}` opt-out (kept single-line on embedding / next-token / transformer per user); order-shuffle's box is taller by default (`min-h-20 w-96`); `DockControls` column is `minmax(8rem,auto)`; `BlockToggle`/`BlockButtons` segments `whitespace-nowrap px-2`; `StationLayout` controls column top-aligned so a grown input doesn't drag it down.
- `@camp/ui` + `@app/course2` typecheck and lint green.

### Loose ends
- Not browser-verified (user is eyeballing themselves). Worth checking: textarea auto-grow at the `max-h-36` cap, the order-shuffle in-box action buttons vs long status text (`right-28` truncation), transformer schematic step names in the slider bubble.
- Live-on-type on order-shuffle re-splits chips per keystroke (order resets to natural while typing); /score (300ms) and /bag (now 350ms) are debounced, rnn-viz /rnn/forward at 400ms.
- The SuggestInput preset-chip popover container still has a border; only the chips themselves were de-bordered (user asked about the items).

### Suggested next
- Fix whatever the in-browser eyeball turns up (dock sizing at narrow viewports is the likeliest); then delete `prompts/DOCK-migrate-remaining-stations.md` — it's done.
