# text-to-3d — bake the real TRELLIS 3D objects

> **STATUS: DONE (2026-07-09).** All 16 presets × 2 seeds baked on the V100 box
> with `--recipe text` (TRELLIS-text-xlarge), 54 MB total, thumbnails eyeballed,
> station verified headlessly (badge gone, seed flip works). The install below
> was adjusted to what actually worked — **no conda, no CUDA compilation**: see
> §2. Two code fixes landed in `trellis.py` during the bake: gaussian-only
> decode (`formats=["gaussian"]`, skips the mesh/RF decoders → no kaolin/
> nvdiffrast/diffoctreerast needed) and a `save_ply` transform fix (TRELLIS's
> default emits 3DGS y-DOWN; we pass the z-up → y-up rotation or objects land
> upside down). Re-bakes: `--presets <id>` with the §3 command as-is.

Replaces the PROCEDURAL dev sample in
`apps/course2/public/data/course2/text-to-3d/` with REAL Microsoft **TRELLIS**
(MIT code + weights) 3D objects: one pruned gaussian splat per (prompt, seed),
plus a small picker thumbnail. The station plays them back through the SAME
`SplatViewer` (orbit mode) the skyfall station uses.

The dev machine ships a hand-off sample baked by `camp-precompute
trellis-sample` (sphere / box / cylinder / torus blobs — NOT the model). This
runbook produces the real thing on the GPU box. There is **no live server
route** this session (see "Deferred" at the bottom), so this is a static-asset
bake only: no router, restart is for manifest freshness only.

## 1. What it produces

| Artifact | Where | Committed? |
| -------- | ----- | ---------- |
| Per-(preset × seed) object `.splat` (pruned gaussians, ≤ ~2 MB) | `apps/course2/public/data/course2/text-to-3d/objects/<presetId>-s<seed>.splat` | yes, but **force-added** (gitignored by pattern) |
| Per-(preset × seed) picker thumbnail (webp, ~5-9 KB) | `.../text-to-3d/objects/<presetId>-s<seed>.webp` | yes, **force-added** |
| `text-to-3d/presets.json` — preset catalog (label, English prompt, recipe, per-seed file paths + bytes + bounding-sphere frame) | `.../text-to-3d/` | yes (small JSON) |
| manifest update (`text-to-3d-presets` id, real bytes) | `.../manifest.json` | yes |

Model: **microsoft/TRELLIS-text-xlarge** (2.0 B, direct text→3D) for the default
`text` recipe; **microsoft/TRELLIS-image-large** (1.2 B) + the diffusion
station's **stabilityai/sd-turbo** for the `image` recipe. Fetched from
HuggingFace, NOT trained or fine-tuned here (rule 2). The 16-prompt roster (台灣味
/ camp objects / fun) + the two seeds live in
`precompute/src/camp_precompute/trellis.py` (`PRESETS` / `SEEDS`) — edit there
before baking to change the set.

**Binary commit note:** the `.splat` / `.webp` are gitignored by
`public/data/**/text-to-3d/**/*.{splat,webp}` (so a careless unpruned bake can't
land by accident). The final small set is committed deliberately with
`git add -f` — see §5. Budget: ≤ 2 MB per object, **≤ 60 MB committed total**
(16 prompts × 2 seeds × ≤ 2 MB). The exported TRELLIS PLYs stay in the
gitignored `text-to-3d/_ply_cache/` — never committed.

## 2. Prereqs

- The base deploy from `server/README.md` is in place (repo cloned,
  `server/.venv` synced, systemd replicas running).
- `git pull` so the tree has the `trellis` / `trellis-sample` cli subcommands.
- **TRELLIS install** (https://github.com/microsoft/TRELLIS, MIT). Upstream's
  `setup.sh` wants conda and compiles custom CUDA ops — **neither is needed**
  for the gaussian-only bake (we never render or mesh on the GPU box; the
  rasterizers live in `trellis/renderers/`, which the pipelines never import).
  What actually worked on the V100 box (2026-07-09), plain uv venv:

  ```bash
  cd ~ && git clone --recursive https://github.com/microsoft/TRELLIS trellis-work
  uv venv ~/trellis-work/.venv --python 3.11
  export VIRTUAL_ENV=~/trellis-work/.venv
  uv pip install torch==2.7.1 torchvision==0.22.1 --index-url https://download.pytorch.org/whl/cu126
  uv pip install easydict transformers safetensors huggingface_hub pillow imageio \
      imageio-ffmpeg tqdm scipy opencv-python-headless plyfile open3d spconv-cu120 \
      rembg onnxruntime
  uv pip install "git+https://github.com/EasternJournalist/utils3d.git@9a4eb15e4021b67b12c460c7057d642626897ec8"
  uv pip install xformers==0.0.31.post1 --index-url https://download.pytorch.org/whl/cu126
  uv pip install -e ~/sitcon-camp-2026-ml/precompute
  uv pip install numpy==1.26.4   # last: pin below 2.x for spconv/open3d
  ```

  - **No flash-attn on SM70 (V100)** → xformers backend; the bake sets
    `ATTN_BACKEND=xformers` + `SPCONV_ALGO=native` itself. (`sdpa` also works
    as an attention fallback if xformers ever breaks.)
  - **One patch**: the vendored FlexiCubes imports kaolin for an optional
    assert helper. Wrap it (`~/trellis-work/trellis/representations/mesh/
    flexicubes/flexicubes.py`): `try: from kaolin.utils.testing import
    check_tensor except ImportError: check_tensor = lambda *a, **k: True`-style
    stub. The mesh decoder still *loads* (pipeline.json lists it) but never
    runs (`formats=["gaussian"]`).
  - `trellis` is not pip-installed — run with `PYTHONPATH=~/trellis-work`.
  - fp16 on V100 is fine; ~8 GB VRAM at bake time, so it coexists with a
    serving replica on the same card. Measured: **~17–20 s sampling +
    ~5 s decode/prune per object** → the 32-object bake ≈ 15 min.
- **Model download** happens on first `.from_pretrained(...)` into the HF cache
  (`TRELLIS-text-xlarge` ~ a few GB; add `TRELLIS-image-large` + `sd-turbo`
  ~2.5 GB only if running `--recipe image`).

## 3. The commands

Run from the TRELLIS env (so `trellis` imports) with `camp_precompute` installed:

```bash
cd ~/sitcon-camp-2026-ml/precompute
# the env prefix that works on the box (add CUDA_VISIBLE_DEVICES=<n> to pick a GPU):
alias camp-precompute='ATTN_BACKEND=xformers SPCONV_ALGO=native PYTHONPATH=~/trellis-work ~/trellis-work/.venv/bin/camp-precompute'

# SMOKE RUN FIRST — one preset, both seeds, default recipe. Eyeball it in the
# station before committing to the ~30-40 min full bake (open decision 1: this
# is where you pick the recipe for the full run).
camp-precompute trellis --recipe text --presets bubble-tea

#   → optionally compare the image recipe on the same preset:
# camp-precompute trellis --recipe image --presets bubble-tea

# FULL BAKE — all 16 presets × 2 seeds with the chosen recipe. ~10 s–1 min per
# object → ~5-30 min total on a V100 depending on sampler steps.
camp-precompute trellis --recipe text
```

`--presets a,b,c` (re)bakes only those and preserves the rest of presets.json —
use it to swap a dud (decision 5) without a full rebake. `--max-splats /
--min-opacity / --max-scale-frac` trim an object that lands over budget.

## 4. Verify

```bash
cd ~/sitcon-camp-2026-ml

# generator is now "camp-precompute trellis --recipe …" and sample=false:
python3 -c "import json;d=json.load(open('apps/course2/public/data/course2/text-to-3d/presets.json'));print(d['generator'],'sample=',d['sample'],'model=',d['model'],'presets=',len(d['presets']))"

# per-object bytes ≤ 2 MB and the pair of seeds both exist:
python3 -c "
import json
d=json.load(open('apps/course2/public/data/course2/text-to-3d/presets.json'))
for p in d['presets']:
    print(p['id'], [(o['seed'], round(o['bytes']/1e6,2)) for o in p['objects']])"

# total committed budget ≤ 60 MB:
du -ch apps/course2/public/data/course2/text-to-3d/objects/*.splat | tail -1

# eyeball it: pnpm --filter @app/course2 dev → /text-to-3d → for each preset,
#   flip 種子 A/B (the two objects must be visibly DIFFERENT), orbit, hover a
#   card to see its English prompt, and confirm the 示意資料 badge is GONE.
```

If a preset bakes badly (blob / unrecognisable — TRELLIS is weakest on
multi-subject or very abstract prompts), tune its English `prompt` in
`trellis.py` or swap the preset, then `--presets <id>` re-bake just that one
(decision 5 — ship no duds). Record the recipe verdict from the smoke run.

## 5. Deploy

```bash
cd ~/sitcon-camp-2026-ml

# binaries are gitignored → force-add the real (small) set + thumbnails + JSON:
git add -f apps/course2/public/data/course2/text-to-3d/objects/*.splat \
           apps/course2/public/data/course2/text-to-3d/objects/*.webp
git add apps/course2/public/data/course2/text-to-3d/presets.json \
        apps/course2/public/data/course2/manifest.json
git commit -m "data(text-to-3d): real TRELLIS objects from the V100 box"
git push
```

Static assets only — Vercel picks the new `.splat` + `.webp` + JSON up on
redeploy; the station serves them offline (no server needed). If the box also
runs replicas, restart them so the manifest is fresh:
`sudo systemctl restart camp-server@0 camp-server@1 camp-server@2 camp-server@3`
(no new router — restart is for manifest freshness only). Classroom smoke test:
open `/text-to-3d`, pick a preset, flip 種子 A/B, orbit — instant, no badge.

## Deferred — a future live "type any prompt" route

Not built this session (decision 1). What `server/app/routers/trellis.py` would
need if added later:

- **xformers on V100** (`ATTN_BACKEND=xformers`), **fp16**, TRELLIS resident in
  VRAM (~a few GB per replica) behind its own lock (like `diffusion_lock`), not
  the LM lock.
- **~30–60 s per request** + queueing — far slower than a Qwen forward; a class
  typing at once would queue hard. Client `liveInferTimed` + `LiveStatus` wiring
  (latency + fallback transparency), with a generous timeout and honest
  fall-back to the presets on miss.
- **Prompt moderation** for free-text 3D — the presets sidestep this; a live
  route opens arbitrary student input and needs a filter.
- **VRAM budget** — loading TRELLIS on every replica is heavy; likely one
  dedicated replica or an on-demand load behind an env flag
  (`CAMP_ENABLE_TRELLIS`), mirroring `CAMP_ENABLE_DIFFUSION`.

## Notes / knobs

- `--recipe text` (TRELLIS-text-xlarge) is the default — the clean 文字→3D story.
  `--recipe image` chains prompt → SD-Turbo image → TRELLIS-image-large (文字→
  圖→3D, likely prettier, ties into the diffusion station); the smoke run decides
  the full-bake recipe. presets.json records which recipe grew each object.
- `DEFAULT_MAX_SPLATS` (60 k ≈ 2 MB) / `DEFAULT_MIN_OPACITY` / `DEFAULT_MAX_SCALE_FRAC`
  live in `trellis.py`; lower `--max-splats` to shrink an object further.
- Thumbnails are a numpy orthographic projection of the SAME pruned cloud that
  ships (`render_thumbnail`), so the picker preview is an honest view of the
  object, not a stock icon — no extra GPU render needed.
- Mesh view (splat vs textured GLB) is a deferred follow-up (open decision 4):
  TRELLIS can emit GLB too, and a 高斯/mesh flip would teach representation
  trade-offs, but it adds a GLTF path to the viewer.
