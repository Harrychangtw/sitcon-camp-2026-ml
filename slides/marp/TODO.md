# TODO — marp Course 2 deck

## Handoff — capsule component + set-piece dividers

### Done this session
- Whole-slide vertical centering + footer/statement/title tweaks, and a structured `.caps`/`.cap` capsule component (native Apple emoji, Lantinghei-Heavy or Artific-Bold `.en` title + grey `.sub`, aligned dividers via fixed `--cap-label-w`); migrated all 4 capsule groups. Committed in `32734e0`.
- Wired cover/toc + all 5 section dividers to `assets/bg/*.png` via `![bg cover]`; discovered the divider art bakes its own text, so stripped the h1/h2 overlay (was double-printing), added the missing Section 05 divider, and removed the placeholder chrome. `32734e0`.

### Loose ends
- `assets/bg/*.png` add ~28MB to the repo (divider-02 alone is 12MB); they are tracked by design (only fonts are gitignored) but consider optimizing/downsampling if repo size matters.
- Divider baked text is authoritative and can differ from old markdown wording (e.g. Section 04 PNG says "直接互看", deck comment noted the old "直接看到所有字").
- `pnpm pdf`/`png` scripts still target `deck/_sample.md`; build the real deck with `pnpm exec marp --config marp.config.js --allow-local-files deck/course2.md -o out/course2.pdf`.

### Suggested next
- Point the `package.json` scripts (or add a `course2` script) at `deck/course2.md` so the canonical build isn't a manual command.
- Eyeball group-4 title sizing (MLP/RNN 144px vs Transformer 116px) and the RNN sub sizes (52 vs 38px) if per-stack uniformity is wanted.

## Handoff — web-hosting pipeline + capsule layout revisions

### Done this session
- Web-bundle pipeline `scripts/build-web.mjs` (`pnpm web`): exports the bespoke HTML player (presenter view = notes + timer, native to Marp), flattens `../assets`/`../../figures` to one `assets/` root, and syncs a self-contained bundle. `--base` rewrites asset refs absolute for pretty URLs. Synced to `harrychang-me/public/slides/sitcon-camp-26-ml-course2/` + Next rewrite in that repo → hosted at `harrychang.me/slides/sitcon-camp-26-ml-course2`. `1df1c99`.
- `camp-dark` capsule revisions: half-width right-aligned by default (left edge on page center axis, `.caps.full` opt-out), equal-height rows via subgrid with aligned dividers + 50px gaps, 96px titles, and title+subtitle vertically center on capsule pages via `section:has(.caps) h1`. `1df1c99`.

### Loose ends
- Portfolio bundle is committed in the *harrychang-me* repo (uncommitted there) — not this repo; re-run the `build-web.mjs --base=… <dest>` command after any deck change to resync.
- Capsule layout uses subgrid + `:has()` (Chrome 105/117+); fine for Marp's Chromium export and modern browsers, but not older engines.
- Artific TTF ships in the public web bundle; relies on harrychang-me already licensing/serving Artific via its own font pipeline (README updated to note this).

### Suggested next
- Add a `pnpm web:deploy` script hardcoding the portfolio `--base`/dest so resync is one command.
- Re-eyeball the 4 capsule stacks now that titles are 96px and label columns auto-hug (the old per-stack `--cap-label-w` overrides are gone).
