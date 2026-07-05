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
