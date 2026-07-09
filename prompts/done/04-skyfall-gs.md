# Session: **Skyfall-GS — 衛星長出城市** — Course 3 panorama

> Paste this whole file into a fresh Claude Code session at the repo root. It is
> self-contained. Deliverable: a new `panorama` station `skyfall` where students
> **free-fly through a real city-block 3D Gaussian Splatting scene reconstructed
> from satellite photos** (the published Skyfall-GS scenes), with one knob: a
> **補完前 / 補完後** A/B toggle showing that the close-up detail was *imagined*
> by a diffusion model, not photographed. Also builds the shared **`SplatViewer`**
> primitive in `@camp/viz` that session `05-trellis-text-to-3d.md` reuses — build
> this session FIRST. `typecheck`/`lint`/`build` green, station renders with the
> real downloaded scene, runbook emitted. When the diff is done, run
> `/code-review high`.
>
> Build linearly in one thread. The viz primitive, the compression pipeline, and
> the station are tightly coupled (one file format decision flows through all
> three) — do not fan out into parallel worktrees.

This is panorama station 4 (see `prompts/course3-panorama/README.md` — rules
1–8 there apply, cited by number below, plus the shared Definition of Done in
`prompts/README.md` #1–8).

---

## What this station is (the pedagogy spine)

**Skyfall-GS** (Apache-2.0, https://github.com/jayin92/Skyfall-GS, arXiv
2510.15869) turns multi-view **satellite imagery** into an explorable
city-block 3DGS scene in two stages:

1. **Stage 1 — reconstruction:** plain 3DGS optimization from satellite photos.
   Looking straight down it's fine; flying low, walls and streets are blurry
   melted geometry, because **no satellite ever saw the scene from street
   level**.
2. **Stage 2 — synthesis:** FLUX.1-dev (a diffusion model) hallucinates
   close-up texture at progressively lower camera elevations and the splats are
   retrained on the refined renders.

The station's one idea: **the data gives you geometry; a generative prior
imagines the detail.** The student flies low over a real Jacksonville /
NYC block, flips 補完前↔補完後, and *sees* what the model made up. This is
model hallucination made literal and spatial — a perfect honesty beat late in
camp, and the flashiest canvas in the panorama line.

**Why this is unusually cheap:** the authors published all 12 **final** fused
`.ply` scenes at https://huggingface.co/jayinnn/Skyfall-GS-ply (158–324 MB
each, ~0.7–1.5 M gaussians, SH degree 1, up vector `0,0,1`), and their own
project page proves browser playback (it iframes superspl.at; paper reports
40 FPS on an M2 MacBook Air). We never run their training to ship the "after"
scenes — we download, prune, compress, and play. Only the "before" (Stage-1)
scenes need a GPU run, and that goes in the runbook (rule 8).

## Decisions already made (do not re-litigate — build to these)

1. **No live server route.** Scene generation takes ~7 h/scene; "live" was
   never on the table. This station is the panorama's pure rule-4 case: fully
   static assets, usable with the server off AND on. Rule 6 is N/A here —
   state that in your report instead of inventing a router.
2. **The browser renders splats; it never optimizes them.** Splat rasterization
   (sorting + drawing) is playback, not training — same category as ONNX
   inference. Golden rule intact.
3. **`SplatViewer` goes in `@camp/viz`** (rule of ≥2: station 05 reuses it).
   Generic: takes a URL + camera config via props, no fetch of lesson data, no
   controls, lazy-imports `three` + the splat library inside an effect
   (CLAUDE.md lazy-import rule — `three` is ALREADY a `@camp/viz` dep at
   0.171.0; keep that version and pick a splat lib compatible with it).
4. **Scenes ship compressed, gitignored by pattern, force-added deliberately**
   — the exact convention `diffusion` uses for its webp frames. Add a
   `public/data/**/skyfall/**/*.splat` (or chosen extension) gitignore pattern;
   commit the final small set with `git add -f`. Budget: **≤ 80 MB total
   committed** (2–3 scenes × 2 variants × ~10–20 MB). If you can't hit that,
   ship fewer scenes, not a busted budget.
5. **The knob is the A/B toggle** (補完前 / 補完後), camera pose preserved
   across the flip so the student compares the *same* view. Scene picker and
   fly camera are supporting cast, not the knob (rule 1).
6. **Dev-machine truth (rule 8, adapted):** unlike the LM stations, the REAL
   "after" artifacts are producible on the no-GPU dev Mac right now (download
   from HF + compress — no CUDA involved). Do that in this session: the station
   ships with at least one real refined scene. Only the Stage-1 "before"
   variants need the GPU box → runbook. Until the runbook runs, the toggle
   shows a **per-scene availability state** (disabled with a one-line 說明 for
   scenes lacking a before-variant), driven by `scenes.json` — never a fake
   placeholder pretending to be Stage 1.
7. **Copy is 正體中文**, tight, **no em-dashes** (glossary terms stay English:
   `Gaussian Splatting`, `diffusion`). Inline glossary via `InfoLabel`
   (`info` + `gloss`), hover-reveal docks, GuidedTour on first load — the
   panorama UI conventions (README §UI conventions).

## Prerequisites & shared surface

- **Shared files other prompts also touch — extend, never clobber:**
  `precompute/src/camp_precompute/cli.py` (add subcommands),
  `apps/course2/public/data/course2/manifest.json` (upsert artifacts),
  `apps/course2/src/stations/registry.tsx` (one new entry),
  `packages/viz/src/index.ts` (export `SplatViewer`), `.gitignore`.
- **Session 05 depends on this one:** `SplatViewer` must support both a
  **fly** mode (this station: WASD + drag-look, for walking a city) and an
  **orbit** mode (station 05: turntable around an object). Design the prop
  surface for both now (`controls: "fly" | "orbit"`, `up`, initial pose,
  optional named camera presets); implement fly here, orbit can be minimal but
  must work.
- **Python deps:** the compression step needs `plyfile` (or equivalent) +
  numpy in the `precompute` project. Keep it out of the server venv unless the
  runbook needs it there.

## Step 0 — Read first

1. `CLAUDE.md` — golden rules, package boundaries, lazy-import rule.
2. `prompts/course3-panorama/README.md` — panorama rules 1–8 + UI conventions.
3. `prompts/README.md` — shared Definition of Done; `prompts/DESIGN.md` —
   visual language (near-black surface, lime `#D6FB00` focus accent only,
   mono/uppercase micro-labels, no hard-coded hexes).
4. `apps/course2/src/stations/diffusion.tsx` +
   `prompts/server-runs/diffusion-precompute.md` — the sample-vs-real artifact
   pattern and the force-add binary convention this station copies.
5. `apps/course2/src/stations/lora.tsx` — GuidedTour usage, panorama station
   shape, `InfoLabel` gloss conventions.
6. `packages/viz/src/Scatter3D.tsx` — how an existing `@camp/viz` three.js
   primitive does lazy import + resize + teardown. `SplatViewer` follows it.
7. `precompute/src/camp_precompute/diffusion.py` + `cli.py` — subcommand +
   manifest-upsert idioms.
8. Upstream references (fetch, don't guess): the Skyfall-GS README (viewer
   settings: SH degree 1, up `0,0,1`), the HF PLY listing (scene ids + sizes),
   and your chosen splat lib's docs (format support, three peer range).

## Step 1 — Precompute: `skyfall` subcommands

In `precompute/src/camp_precompute/skyfall.py` + `cli.py`:

- **`camp-precompute skyfall-sample`** (no network, no GPU): writes a tiny
  procedural scene pair — a few thousand gaussians forming a toy "city"
  (boxes/blobs), plus a deliberately blurred/inflated variant as the fake
  "before" — so the full UI (toggle included) is buildable and testable
  offline. Mark it `"sample": true` in `scenes.json` and render a small
  「示意資料」 badge in the station when a sample scene is active (same honesty
  convention as diffusion's synthetic sample).
- **`camp-precompute skyfall --scenes JAX_004,JAX_214,NYC_004`** (network, no
  GPU): downloads the published fused PLYs from `jayinnn/Skyfall-GS-ply`,
  then **prunes + converts** to the shipping format. Pruning: drop
  low-opacity / degenerate gaussians, then keep top-N by an
  opacity×volume-style importance rank; target **≤ ~500 k splats and
  ≤ ~20 MB per scene** (tunable flags, defaults stated in `--help`).
  Start with `JAX_004` (smallest, 158 MB source) as the mandatory scene;
  add 1–2 more only if the budget (decision 4) holds.
- **Shipping format — recommended: antimatter15 `.splat`** (32 B/splat:
  pos 3×f32, scale 3×f32, RGBA 4×u8, rot quat 4×u8), written directly from
  numpy — no node tooling in the loop, and both candidate viewer libs load it.
  It drops SH>0 (upstream recommends degree 1, so the loss is mild — eyeball
  it). If quality visibly suffers, `.ksplat`/SOG via `@playcanvas/splat-transform`
  is the fallback — open decision 2.
- **`skyfall/scenes.json`** (small, committed): per scene — id, 中文 display
  name + one-line 說明, up vector, initial camera pose + 2–3 named viewpoints
  (a low street-level pose is mandatory: it's where the A/B contrast lives),
  file paths + byte sizes for available variants (`after`, optionally
  `before`), `sample` flag. Upsert a `skyfall-scenes` entry in
  `manifest.json`.
- The **same prune/convert code path** must serve the runbook's Stage-1 PLYs
  later — factor it so `skyfall --from-ply <path>` converts an arbitrary local
  fused PLY into a named variant.

## Step 2 — `@camp/viz`: `SplatViewer`

New `packages/viz/src/SplatViewer.tsx`:

- Props (roughly): `src: string`, `controls: "fly" | "orbit"`, `up?: [x,y,z]`,
  `initialPose`, `poses?: NamedPose[]`, `activePose?: string`,
  `onProgress?: (frac) => void`, `onReady?: () => void`, `className`.
  Data via props only — no fetch of lesson JSON, no lesson copy (package
  boundaries).
- **Lazy-import** `three` and the splat library inside `useEffect`; never at
  module scope. Dispose renderer/scene/workers on unmount and on `src` change.
  Resize via the existing `useResizeObserver`.
- **Library choice — recommended: `@mkkellogg/gaussian-splats-3d`** (MIT,
  mature, loads `.splat`/`.ksplat`/`.ply`, works with three ~0.17x). Verify
  its peer range against the workspace's `three@0.171.0` before committing;
  **Spark** (sparkjs.dev, also MIT) is the alternative — open decision 2. Do
  NOT bump the workspace three version for this; pick the lib that fits.
- **A/B without pose jumps:** swapping `src` must preserve the current camera.
  Either keep two loaded scenes and toggle visibility (memory cost: ~2× splat
  buffers — fine at ≤500 k each) or re-apply the camera pose after reload.
  Preferring the no-flicker option; state which you shipped.
- Fly mode: pointer-drag look + WASD/arrows + scroll for speed or altitude;
  clamp to a sane bounding box so students can't fly to infinity. Touch: at
  minimum drag-look + pinch-dolly (camp laptops have trackpads; don't build a
  full mobile scheme).
- Progress: these are 10–20 MB files — surface load progress (the station
  wires `onProgress` into a themed loader; `@camp/ui` has `LoadingTimer`).

## Step 3 — The station

New `apps/course2/src/stations/skyfall.tsx`, registered in `registry.tsx` as
`{ id: "skyfall", title: "衛星長出城市", group: "panorama" }` (blurb: one tight
zh-TW line, e.g. 從衛星照片長出一座能飛進去的城市,近看的細節是模型想像的 —
tune it, no em-dashes).

- Loads `scenes.json` via `@camp/data` `loadJSON` in an effect; canvas is a
  pure function of state (controls-drive-state, reference.tsx pattern).
- **Dock controls:** scene picker (`SegmentedControl`/`BlockButtons`), the
  **補完前/補完後 `BlockToggle`** (the knob — lime accent lives here),
  viewpoint preset buttons (至少一個「街景視角」), and a small
  reset-camera button. Every jargon label gets `InfoLabel` `info`+`gloss`
  (e.g. `Gaussian Splatting` → gloss: 用幾十萬個彩色小橢圓拼出的 3D 場景).
- **The honesty readout:** when 補完後 is active at low altitude, a quiet
  one-liner notes 這些牆面和街道細節是 diffusion model 想像的,衛星沒拍過這個角度;
  when 補完前 is active: 這是只用衛星照片能重建的樣子. This copy IS the
  takeaway — make it land, keep it tight.
- **GuidedTour** (panorama rule 5), skippable, first-load: 這是從衛星照片長出的
  城市 → 用滑鼠和 WASD 飛低一點 → 切到補完前 → 差在哪裡?那些細節是模型想像的.
- Toggle disabled state (decision 6) when the active scene has no `before`
  variant, with the one-line reason.
- Sample badge when `scenes.json` marks the active scene `sample: true`.

## Step 4 — Runbook: `prompts/server-runs/skyfall-precompute.md`

Follow the `server-runs/README.md` template (produces / prereqs / commands /
verify / deploy). It covers the **GPU-box Stage-1 runs** that produce the
"before" variants:

- Clone jayin92/Skyfall-GS; env caveats stated loudly: Python 3.10,
  **CUDA 12.8**, custom submodules to build (`diff-gaussian-rasterization-depth`,
  `simple-knn`, `fused-ssim`); dataset download (DFC2019 JAX / NYC sets from
  the repo's HF links). Stage 1 ONLY — ~1–2 h/scene, fits 24 GB; **no FLUX,
  no Stage 2** (that needed a 48 GB A6000 upstream; explicitly out of scope).
- Run Stage 1 for exactly the shipped scene ids → `create_fused_ply.py` →
  copy the fused PLYs back → `uv run camp-precompute skyfall --from-ply …`
  to prune/convert with the SAME pipeline → update `scenes.json` variants →
  force-add the new binaries → verify (byte sizes in manifest, toggle enables
  itself) → deploy per the standard restart + smoke test.

## Step 5 — Verify

```bash
uv run camp-precompute skyfall-sample          # procedural pair, UI testable offline
uv run camp-precompute skyfall --scenes JAX_004  # real refined scene (network, no GPU)
pnpm typecheck && pnpm lint && pnpm build
pnpm --filter @app/course2 dev                 # http://localhost:5173/skyfall
```

Manually confirm: the real JAX_004 scene loads with visible progress, fly
controls feel sane at street level, frame rate is acceptable on the dev Mac
(if it chugs, prune harder — that's a flag, not a shrug), the A/B toggle
preserves the camera (against the sample pair until the runbook runs), the
disabled-toggle state + reason shows on the real scene, GuidedTour runs once
and is skippable, no console errors, and `git status` shows no accidentally
staged multi-hundred-MB PLY (source PLYs live outside the repo or in a
gitignored scratch dir).

## Definition of Done

Shared contract (`prompts/README.md` #1–8) + panorama rules, plus:

- [ ] `SplatViewer` lives in `@camp/viz`, lazy-imports `three` + splat lib in
      an effect, disposes cleanly, supports fly now and orbit at least
      minimally, takes everything via props (no fetch, no lesson copy).
- [ ] `skyfall-sample` (offline procedural pair) and `skyfall` (HF download +
      prune + convert, no GPU) subcommands exist; the convert path is reusable
      via `--from-ply` for the runbook.
- [ ] At least one REAL refined scene ships, pruned to ≤ ~20 MB, gitignored by
      pattern and force-added; total committed splat bytes ≤ 80 MB;
      `scenes.json` + manifest upserted with real byte sizes.
- [ ] The 補完前/補完後 toggle is the station's one knob, preserves camera pose,
      and degrades honestly (disabled + reason) when a scene lacks a before
      variant; sample scenes carry a 示意資料 badge.
- [ ] The honesty copy lands: students can articulate that low-altitude detail
      is model-imagined. GuidedTour walks the loop once, skippable.
- [ ] No live route, stated as N/A (decision 1); station fully usable with the
      server off. Browser does playback only.
- [ ] zh-TW copy, no em-dashes, `InfoLabel` gloss on jargon, DESIGN.md palette
      (no hard-coded hexes), lime only on the focused control.
- [ ] `prompts/server-runs/skyfall-precompute.md` emitted per template.
- [ ] `pnpm typecheck && pnpm lint && pnpm build` green; `/skyfall` renders
      with no console errors; `/code-review high` run on the final diff.

## Open decisions — make the call, then flag it in your report

1. **Scene set:** JAX_004 mandatory; which 1–2 others (JAX_214? NYC_004?)
   fit the 80 MB budget after pruning? Recommended: ship 2 total first; a
   third only if bytes allow.
2. **Format × viewer lib:** `.splat` + `@mkkellogg/gaussian-splats-3d`
   (recommended default) vs `.ksplat`/SOG + Spark. Decide by: three@0.171
   peer compat, visual quality after SH drop, load time at ~20 MB.
3. **A/B mechanism:** dual-loaded scenes with visibility toggle (no flicker,
   2× memory) vs reload-with-pose-restore. Recommended: dual-loaded.
4. **Prune target:** 500 k splats is the starting point; tune per-scene until
   the dev Mac holds a smooth frame rate at street level. Report final counts
   + bytes per scene.
5. **Viewpoint presets:** which 2–3 named poses per scene tell the story best
   (one MUST be low/street-level).

## Report when done

Output: the scene set + final splat counts/bytes per variant; format + viewer
lib chosen and why (incl. the three peer-range check); the A/B mechanism; what
the sample pair looks like; frame rate observed on the dev Mac at street
level; the five open-decision calls; files changed; manifest/scenes.json
entries; runbook path; and one-line pass/fail per Definition-of-Done checkbox.
