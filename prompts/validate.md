# Session: **Validate** the Course 2 stations (consolidation pass)

> Paste this whole file into a fresh Claude Code session at the repo root. It is
> self-contained. Your job is **not** to build — it is to **verify** that each of
> the six station-build sessions reached its goal, and produce a single
> pass/fail report. Only fix things if explicitly asked; otherwise **report**.

This is the consolidation step for the `prompts/0X-*.md` sessions. You check the
**same Definition of Done** those prompts promised — the shared contract in
`prompts/README.md` plus each station's specific criteria.

## Step 0 — Orient

Read `prompts/README.md` (the workflow + the shared Definition of Done items
1–7), then skim each `prompts/0X-*.md`'s **"Definition of Done"** section — those
checkboxes are your rubric. The six stations and their routes:

| id | route | new/using viz primitive | artifact dir |
|----|-------|-------------------------|--------------|
| tokenizer     | `/tokenizer`     | none (DOM chips)        | `.../course2/tokenizer/` |
| embedding     | `/embedding`     | `Scatter3D`             | `.../course2/embedding/` |
| order-shuffle | `/order-shuffle` | none                    | `.../course2/order-shuffle/` |
| next-token    | `/next-token`    | `Heatmap`               | `.../course2/next-token/` |
| rnn-viz       | `/rnn-viz`       | `Heatmap` (reused)      | `.../course2/rnn-viz/` |
| transformer   | `/transformer`   | `AttentionLines`        | `.../course2/transformer/` |

(`.../course2/` = `apps/course2/public/data/course2/`.)

## Step 1 — Whole-workspace gates (run once)

```bash
pnpm install                       # ensure the workspace resolves
pnpm typecheck                     # must be clean
pnpm lint                          # must be clean
pnpm build                         # both apps build
```

Record pass/fail + the first error for each. A red gate here fails **every**
station that could have caused it — attribute it in the report.

## Step 2 — Per-station checks (repeat for all six)

For each station, verify its rubric **objectively** — inspect files and the
running route, don't just trust that a file exists.

**A. Precompute artifact & manifest (shared item 1)**
- The artifact dir exists and contains the JSON the prompt named (and, for
  next-token, a manifest entry for the model even if the `.onnx` isn't
  committed). Files are **small** (flag any committed `*.onnx`/`*.bin` — those
  are gitignored and must not be in the tree).
- `manifest.json` `artifacts[]` has an entry for the station. Confirm
  `manifest.json` is valid JSON and every listed artifact path exists (except
  intentionally-uncommitted binaries).

**B. Station loads data via `@camp/data`, not hard-coded (items 1, 4)**
- `grep` the station `.tsx` for `loadJSON` / `loadOnnxSession` / `@camp/data`
  and for a `useEffect`-based load. **Fail** if the coordinates / vocab / tensor
  / distribution are literal arrays in the `.tsx`.

**C. Golden-rule compliance (items 2, 3, 4)** — grep for violations:
- No `import ... "three"` or `"onnxruntime-web"` at **module scope** in any
  station or viz file (they must be `await import(...)` inside effects). Check
  `packages/viz/*` too.
- No `fetch(` / `loadJSON` / `axios` inside `packages/viz/*` (viz takes data via
  props). No canvas/SVG drawing or viz imports inside `packages/ui/*`. No
  `import ... react` inside `packages/data/*`.
- No training / heavy loops in browser code (no gradient/backprop/epoch loops;
  in-browser math limited to light transforms like temperature/top-k).

**D. Shared viz primitives are real, in the package (items 4, 5)**
- `packages/viz/src/Scatter3D.tsx`, `Heatmap.tsx`, `AttentionLines.tsx` are no
  longer stubs: they're resize-aware (`useResizeObserver`) and prop-driven.
- **`Heatmap` is shared by next-token AND rnn-viz** — confirm there's **one**
  `Heatmap` in `@camp/viz` (no station-local copy) and that **both** routes use
  it and both render.

**E. Route renders & delivers the station goal (item 7)** — run
`pnpm --filter @app/course2 dev` and open each route. Confirm no console errors
and the station-specific behavior from its prompt actually works:
- **tokenizer:** char/word/BPE toggle changes segmentation; token **ids** show;
  BPE subword-splits a rare word.
- **embedding:** 2D/3D toggle; 3D orbits; searching a word highlights nearest
  neighbours.
- **order-shuffle:** shuffling chips leaves bag-of-words **unchanged** and moves
  the order-aware prediction.
- **next-token:** temperature reshapes the distribution; top-k limits it; greedy
  = argmax.
- **rnn-viz:** step controls advance one token; hidden-state heatmap updates per
  step.
- **transformer:** hovering a token lights its attention links; layer **and**
  head selectors change the display.

**F. Design-language conformance (item 8 — `prompts/DESIGN.md`)**
- **Tokens retuned once:** `packages/ui/src/theme.css` `.dark` block matches the
  deck palette — bg `10 10 10` (`#0A0A0A`), accent `214 251 0` (`#D6FB00`), panel
  `23 23 23`, muted `158 158 158`; cyan/purple categoricals exist if used. There
  is **one** retune, not per-station divergence.
- **No hard-coded hexes:** grep station `.tsx` and `packages/viz/*` for
  `#[0-9a-fA-F]{3,6}` / `rgb(` / `hsl(` color literals — colors should come from
  theme utilities (`bg-bg`, `text-fg`, `text-muted`, `accent`, `border-border`)
  or CSS vars/props. Flag literals (a neutral SVG `none`/`currentColor` is fine).
- **Idioms present:** micro-labels use `font-mono ... uppercase` (the `label-mono`
  idiom); the lime accent marks only the focused/active element (not every mark).
- **Motion (if any):** guarded by `prefers-reduced-motion`.
- Judgment call, but check it against the station's **Design language** section +
  its Design checkbox. Verify on the running route where you can; otherwise mark
  "code-reviewed, not run."

> Prefer verifying routes via the running dev server (browser tools or a manual
> pass). If you can't drive a browser, fall back to reading the station source
> against its rubric and **say so** in the report — mark those items
> "code-reviewed, not run."

## Step 3 — Cross-station integration

- Sidebar/registry (`apps/course2/src/stations/registry.tsx`) still lists all six
  as `group: "lesson"` in teaching order; every route resolves.
- `manifest.json` is a single coherent file with all stations' artifacts merged
  (no station clobbered another's entry).
- No duplicate/divergent copies of a shared primitive; `cli.py` has a subcommand
  per station and `uv run camp-precompute make-data` (or the per-station
  commands) regenerates cleanly: `cd precompute && uv run camp-precompute make-data`.

## Step 4 — Report (the deliverable)

Produce a single table — one row per station — with columns:

`station | build gate (tc/lint/build) | artifact+manifest | loads via @camp/data | golden-rule compliance | primitive real & shared | route renders goal | design (DESIGN.md) | VERDICT`

Use ✅ / ⚠️ / ❌ per cell. Then:

- **VERDICT per station:** `PASS` only if every rubric item is ✅. Otherwise
  `FAIL` with the specific unmet checkbox(es) and the file:line or command
  output that proves it.
- **Overall:** how many of six pass; which shared surfaces (`cli.py`,
  `manifest.json`, `packages/viz`) show collision damage, if any.
- **Fix list:** for each FAIL, the smallest concrete change to reach PASS (point
  at the relevant `prompts/0X-*.md` step). Do not apply fixes unless asked.

End with one line: `result: N/6 stations PASS` (list the failing ids).
