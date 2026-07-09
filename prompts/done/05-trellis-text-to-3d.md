# Session: **TRELLIS — 文字生 3D** — Course 3 panorama

> Paste this whole file into a fresh Claude Code session at the repo root. It is
> self-contained. Deliverable: a new `panorama` station `text-to-3d` where
> students pick a **prompt preset** (打一句話) and get a **real 3D object they
> can spin** — precomputed with Microsoft **TRELLIS** (MIT) on the GPU box, played
> back through the `SplatViewer` primitive that session `04-skyfall-gs.md`
> built. **Prerequisite: 04 is merged** (this session extends `SplatViewer`'s
> orbit mode; if 04 hasn't run, stop and say so — do not build a second viewer).
> `typecheck`/`lint`/`build` green against a committed sample artifact, runbook
> emitted for the real GPU bake. When the diff is done, run `/code-review high`.
>
> Build linearly in one thread — the preset schema, the precompute pipeline, and
> the station UI move together.

This is panorama station 5 (see `prompts/course3-panorama/README.md` — rules
1–8 there apply, cited by number below, plus the shared Definition of Done in
`prompts/README.md` #1–8).

---

## What this station is (the pedagogy spine)

**TRELLIS** (https://github.com/microsoft/TRELLIS, MIT code AND weights) turns
a text prompt or image into a full 3D asset — 3D gaussians, radiance field, or
textured mesh — via a unified structured-latent (SLAT) representation. It's the
"generative AI escapes the flat screen" moment: students just saw diffusion
grow a 2D image from noise (擴散生成圖 station); now the same idea grows an
**object** they can orbit.

Two ideas, one knob:

1. **文字 → 3D 物件**: pick a prompt chip, an object appears, spin it.
2. **同一句話,不只一種長法**: each prompt ships **2 seeds** — flipping the
   seed chip regrows a *different* object from the same words. Sampling
   variance made tangible (echoes the diffusion station's seed grid).

The knob (rule 1) is the **prompt-preset picker + seed flip**; the orbit camera
is how you *look*, the picker is what you *turn*.

## Decisions already made (do not re-litigate — build to these)

1. **Presets are the product; live generation is a deferred stretch.** TRELLIS
   inference is ~10s–1min on a modern 24 GB card, but the prod box is 4× V100
   (SM70: no flash-attn, fp16 only — upstream needs `ATTN_BACKEND=xformers`
   there), and free-text 3D generation of student input raises moderation
   questions the presets sidestep. So: **no `server/app/routers/` route in
   this session** (rule 6 deferred, stated in the report), presets cover
   everything (rule 4). Open decision 5 records what a future live route
   would need — record it, don't build it.
2. **Model + recipe:** default to **`TRELLIS-text-xlarge`** (direct
   text-to-3D) for the clean 文字→3D story. Known trade-off: upstream says
   image-to-3D (`TRELLIS-image-large`, 1.2 B) is higher quality. The
   alternative recipe — prompt → SD-Turbo image (the diffusion station's
   checkpoint, already on the box) → TRELLIS image-to-3D — chains the two
   panorama stations beautifully (文字→圖→3D) and may look better. This is
   open decision 1; the PIPELINE must support both (a preset records which
   recipe produced it), the DEFAULT bake uses one. The 30-min classroom story
   works either way.
3. **Output format: pruned gaussian splats through `SplatViewer` (orbit
   mode)** — one viewer stack across stations 04/05, no GLB/mesh path in the
   browser for now (a mesh toggle is open decision 4). Objects are tiny
   compared to Skyfall city blocks: target **≤ ~2 MB per (prompt, seed)**
   after the same prune/convert path 04 built.
4. **Asset budget: ≤ 60 MB committed total.** ~16 prompts × 2 seeds × ≤2 MB.
   Same convention as 04/diffusion: gitignore
   `public/data/**/text-to-3d/**/*.splat` (or 04's chosen extension),
   force-add the final set deliberately.
5. **Preset list is curated in the precompute source** (like diffusion's
   `PRESETS`), zh-TW display labels + English internal prompts. Mix:
   台灣味 (珍珠奶茶、台北101、廟口燈籠、藍白拖、夜市小吃攤…), camp-relatable
   objects (吉他、滑板、機械鍵盤…), and 2–3 pure-fun ones. Keep prompts
   object-centric and single-subject — that's what TRELLIS is good at; flag
   any preset that bakes badly and swap it rather than shipping a dud.
6. **Dev-machine truth (rule 8):** the real bake needs a GPU → this session
   ships a **`trellis-sample`** procedural artifact (tiny synthetic splat
   objects: sphere/box/torus-ish blobs, one per a handful of presets × 2
   "seeds" that visibly differ) so the full UI works offline, badged 示意資料,
   and a runbook produces the real set. Same honesty convention as
   diffusion/04.
7. **Copy is 正體中文**, tight, **no em-dashes** (glossary English terms:
   `TRELLIS`, `prompt`, `seed`). `InfoLabel` info+gloss on jargon,
   hover-reveal docks, skippable first-load GuidedTour (rule 5).

## Prerequisites & shared surface

- **Hard dependency: session 04** — `packages/viz/src/SplatViewer.tsx`
  exists with `controls: "fly" | "orbit"`. This session makes orbit
  first-class: auto-framing the object's bounding box, drag-orbit +
  scroll-dolly, optional slow idle autorotate (stops on first interaction).
  Extend the primitive in the package; don't fork it into the station.
- **Shared files — extend, never clobber:** `cli.py`, `manifest.json`,
  `registry.tsx`, `packages/viz/src/index.ts`, `.gitignore`,
  `precompute/src/camp_precompute/` (new `trellis.py`; reuse 04's
  prune/convert helpers — import them, don't copy-paste).
- **The prune/convert path from 04** (`skyfall --from-ply`-style) is the
  contract: TRELLIS emits gaussians → export PLY → same pruning/format code.
  If 04's helpers need a small refactor to be object-friendly (different
  default prune targets), refactor in place with 04's station still green.

## Step 0 — Read first

1. `CLAUDE.md`; `prompts/course3-panorama/README.md` (rules + UI conventions);
   `prompts/README.md` (Definition of Done); `prompts/DESIGN.md`.
2. `prompts/course3-panorama/04-skyfall-gs.md` + the code it produced:
   `packages/viz/src/SplatViewer.tsx`, `precompute/src/camp_precompute/skyfall.py`
   (the prune/convert helpers you'll reuse), `apps/course2/src/stations/skyfall.tsx`
   (per-scene variant/badge handling to mirror).
3. `apps/course2/src/stations/diffusion.tsx` + `precompute/.../diffusion.py` —
   the preset-grid pattern (PRESETS × seeds), sample-vs-real convention, and
   the station whose story this one continues.
4. `prompts/server-runs/diffusion-precompute.md` + `server-runs/README.md` —
   runbook template and force-add convention.
5. Upstream (fetch, don't guess): TRELLIS README — install matrix,
   `ATTN_BACKEND`/`SPCONV_ALGO` env switches, text vs image pipeline APIs,
   gaussian export; HF model cards for `TRELLIS-text-xlarge` /
   `TRELLIS-image-large` (sizes, VRAM claims).

## Step 1 — Precompute: `trellis` subcommands

New `precompute/src/camp_precompute/trellis.py` + `cli.py` wiring:

- **`camp-precompute trellis-sample`** (no network, no GPU): procedural splat
  objects for ~6 presets × 2 seeds, visibly different per seed, written with
  04's converter. Marks `"sample": true`.
- **`camp-precompute trellis`** (GPU box only — never run in this session):
  for each preset × seed: run the chosen recipe (decision 2) → gaussian
  output → PLY → 04's prune/convert (object-tuned defaults, target ≤ 2 MB) →
  `text-to-3d/objects/<presetId>-s<seed>.splat`. Deterministic seeds. A
  `--presets` filter for partial rebakes, `--recipe text|image` for open
  decision 1.
- **`text-to-3d/presets.json`** (small, committed): per preset — id, zh-TW
  label, the exact English prompt, recipe, seeds, per-seed file path + bytes,
  suggested framing radius if auto-framing needs a hint, `sample` flag.
  Upsert `text-to-3d-presets` in `manifest.json`.
- Renders/thumbnails: the picker wants a small preview per object. Baking
  ~160 px webp thumbnails per (preset, seed) on the GPU box is cheap and makes
  the picker legible — include it in the bake, a few KB each, committed via
  the same force-add.

## Step 2 — `@camp/viz`: orbit mode grows up

In `SplatViewer` (package, not station): bounding-box auto-framing on load,
drag-orbit + scroll-dolly clamped to sane radii, `autorotate?: boolean`
(slow, stops on interaction), and whatever small prop additions orbit needs
(e.g. `framingRadius?: number`). Keep fly mode untouched — re-verify
`/skyfall` still behaves after the edit.

## Step 3 — The station

New `apps/course2/src/stations/textTo3d.tsx`, registered as
`{ id: "text-to-3d", title: "文字生 3D", group: "panorama" }` (blurb: one
tight zh-TW line, e.g. 打一句話,長出一個能轉的 3D 物件 — tune it).

- Loads `presets.json` via `@camp/data` in an effect; pure
  controls-drive-state.
- **Dock:** the prompt-preset picker (chips with thumbnails, zh-TW label
  prominent, the English prompt revealed on hover via `InfoLabel` info —
  students should SEE that the model was fed English words), the **seed flip**
  (`BlockToggle`/`BlockButtons`, 種子 A/B with a gloss explaining seed =
  隨機起點), autorotate toggle. Lime accent on the active preset chip.
- **The two-beat copy:** on load, one quiet line: 這個物件是模型從一句話長出來的,
  不是人建模的; on seed flip: 同一句話,不同的隨機起點,長出不同的東西. Tight,
  no em-dashes.
- **GuidedTour** first-load: 挑一句話 → 轉轉看這個物件 → 換個 seed,再長一次 →
  同一句話會長出不一樣的東西.
- Sample badge (示意資料) when active preset is `sample: true` — the entire
  station may be sample-mode until the runbook runs; that must look intentional,
  not broken.
- Loading: objects are ≤2 MB so loads are quick, but still wire `onProgress`
  → a themed micro-loader; instant flips between already-viewed objects
  (cache the loaded scenes per session — bounded, ~32 objects × 2 MB is fine).

## Step 4 — Runbook: `prompts/server-runs/trellis-precompute.md`

Per the `server-runs/README.md` template:

- **Prereqs:** GPU box with ≥16 GB card; TRELLIS install (pinned torch/CUDA
  combo per upstream README, `ATTN_BACKEND=xformers` on V100 — no flash-attn
  on SM70, `SPCONV_ALGO=native` if spconv misbehaves), model download
  (`TRELLIS-text-xlarge`, plus `TRELLIS-image-large` + the SD-Turbo checkpoint
  if the image recipe won open decision 1).
- **Commands:** the exact `uv run camp-precompute trellis …` invocations,
  including a smoke run (`--presets <one>`) before the full bake; expected
  wall time for 16×2 objects.
- **Verify:** spot-check objects in the local station, byte sizes vs budget,
  seed pairs actually differ, no preset shipped as a dud (decision 5 — swap
  and rebake instead).
- **Deploy:** force-add binaries + presets.json + manifest, standard restart
  + smoke test (restart is only for manifest freshness here — no new router).

## Step 5 — Verify

```bash
uv run camp-precompute trellis-sample
pnpm typecheck && pnpm lint && pnpm build
pnpm --filter @app/course2 dev   # http://localhost:5173/text-to-3d AND /skyfall
```

Manually confirm: preset picker + seed flip + orbit all work against the
sample set, sample badge shows, GuidedTour runs once and is skippable,
`/skyfall` fly mode is unregressed by the `SplatViewer` edits, no console
errors, no giant binaries staged by accident.

## Definition of Done

Shared contract (`prompts/README.md` #1–8) + panorama rules, plus:

- [ ] `SplatViewer` orbit mode is first-class (auto-framing, clamped orbit,
      optional autorotate) — extended in `@camp/viz`, fly mode + `/skyfall`
      unregressed.
- [ ] `trellis-sample` (procedural, offline) and `trellis` (GPU bake, runbook
      only) subcommands exist; the bake reuses 04's prune/convert helpers
      (imported, not duplicated) and supports both recipes behind `--recipe`.
- [ ] `presets.json` schema records label, English prompt, recipe, seeds,
      files, bytes, sample flag; manifest upserted; thumbnails included in the
      bake plan.
- [ ] The knob is the preset picker + seed flip; seed pairs visibly differ;
      the English prompt is discoverable on hover; the two-beat copy lands.
- [ ] Asset budget honored: ≤2 MB per object, ≤60 MB committed total,
      gitignored by pattern + force-added.
- [ ] No live route shipped; deferral + what a future route needs recorded in
      the report (decision 1 of Open decisions notes quality; decision 5 the
      route). Station fully usable offline via presets.
- [ ] zh-TW copy, no em-dashes, `InfoLabel` glosses, DESIGN.md palette, lime
      only on the active element, GuidedTour skippable, 示意資料 badge until
      the real bake lands.
- [ ] `prompts/server-runs/trellis-precompute.md` emitted per template.
- [ ] `pnpm typecheck && pnpm lint && pnpm build` green; both `/text-to-3d`
      and `/skyfall` render with no console errors; `/code-review high` run.

## Open decisions — make the call, then flag it in your report

1. **Recipe default:** direct `TRELLIS-text-xlarge` (cleaner story) vs
   SD-Turbo image → `TRELLIS-image-large` (likely prettier, chains the
   diffusion station). Recommended: build both behind `--recipe`, default
   text, and let the runbook's smoke run decide what the full bake uses —
   record the visual verdict.
2. **Preset roster:** the exact ~16 prompts (balance 台灣味 / camp objects /
   fun). List them in the report; they're curriculum content.
3. **Seeds per prompt:** 2 (budget default) vs 3. Recommended: 2; revisit only
   if bytes are way under budget.
4. **Mesh toggle (splat vs textured mesh view):** TRELLIS can emit GLB too —
   a 高斯/mesh flip would teach representation trade-offs, but adds a GLTF
   path to the viewer. Recommended: defer; note it as a follow-up.
5. **Future live route:** what `server/app/routers/trellis.py` would need
   (xformers on V100, fp16, per-request ~30–60 s + queueing, prompt
   moderation for free text, `liveInferTimed`/`LiveStatus` wiring). Record,
   don't build.

## Report when done

Output: the recipe decision + why; the preset roster; final per-object bytes +
total; what the sample objects look like; the `SplatViewer` prop additions and
the `/skyfall` regression check result; the five open-decision calls; files
changed; manifest/presets.json entries; runbook path; and one-line pass/fail
per Definition-of-Done checkbox.
