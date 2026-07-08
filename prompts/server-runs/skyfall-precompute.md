# skyfall — bake the Stage-1「補完前」scene variants

The skyfall station ships with the REAL 補完後 scenes already (they are the
authors' published fused PLYs, downloaded + pruned by `camp-precompute
skyfall` — no GPU involved). What's missing until this runbook runs is the
**補完前** side of the A/B toggle for the real scenes: the Stage-1-only
reconstruction (plain 3DGS from satellite photos, no diffusion refinement).
That needs an upstream training run on the GPU box. Until then the station
shows the toggle disabled on real scenes with a one-line reason, and the
toy-city sample pair demonstrates the A/B mechanics.

**Scope guard:** Stage 1 ONLY. Stage 2 (FLUX.1-dev iterative dataset update)
needed a 48 GB A6000 upstream and we already have its outputs from HF —
explicitly out of scope here.

## 1. What it produces

| Artifact | Where | Committed? |
| -------- | ----- | ---------- |
| `skyfall/<sceneId>/before.splat` — pruned Stage-1 scene (~10 MB each) | `apps/course2/public/data/course2/skyfall/` | yes, **force-added** (gitignored by `public/data/**/skyfall/**/*.splat`) |
| `skyfall/scenes.json` — `before` variant entries (path/bytes/splats) merged in; poses untouched | same dir | yes (small JSON) |
| manifest update (`skyfall-scenes` id, new bytes) | `apps/course2/public/data/course2/manifest.json` | yes |

Shipped real scenes needing a `before` variant: **JAX_004, NYC_004** (check
`scenes.json` in case the set changed). Byte budget: total committed
`.splat` bytes stay **≤ 80 MB**. The `after` variants ship at 800 k splats
(25.6 MB each — smaller prunes visibly melt street-level detail, faking the
very Stage-1 look the toggle contrasts against); bake the `before` variants
at **300 k** (`--max-splats 300000`, ~10 MB each — they are SUPPOSED to look
melted). That lands at ~53 MB current + ~19 MB before ≈ 72 MB total.

## 2. Prereqs

Upstream (https://github.com/jayin92/Skyfall-GS, Apache-2.0) is picky —
these caveats are load-bearing:

- **Python 3.10** and **CUDA 12.8** are what the authors state. The V100 box
  runs driver 535 / CUDA 12.2 — build the submodules against the box's own
  CUDA toolkit and expect to relax the pin (`torch` for cu121/cu126). If the
  compile fights back, a fresh conda/uv env with `python=3.10` +
  `torch==2.x+cu121` is the known-good direction. V100 is SM70: fine for
  3DGS rasterization kernels.
- **Three custom CUDA submodules** must compile:
  `submodules/diff-gaussian-rasterization-depth`, `submodules/simple-knn`,
  `submodules/fused-ssim` (`pip install ./submodules/...` each).
- **Dataset**: the DFC2019 JAX / NYC satellite sets, prepared per the
  upstream README (its HF links). Download only the shipped scene ids.
- **This repo's side needs no GPU**: the convert step is numpy + plyfile via
  the precompute venv (`cd precompute && uv sync` — plyfile is a base dep).
  Keep it out of `server/.venv`; nothing here touches torch or the LM stack.
- Disk: ~2 GB per scene for the upstream workdir + checkpoints; keep it
  outside this repo (e.g. `~/skyfall-work`).

```bash
cd ~ && git clone --recursive https://github.com/jayin92/Skyfall-GS skyfall-work/Skyfall-GS
```

## 3. The commands

Per scene (shown for JAX_004; repeat for NYC_004). ~1-2 h/scene on a V100,
fits well under 24 GB.

```bash
cd ~/skyfall-work/Skyfall-GS

# Stage 1 ONLY — the authors' stage-1 recipe (their README, "Training"):
python train.py \
    -s ./data/datasets_JAX/JAX_004/ \
    -m ./outputs/JAX/JAX_004 \
    --eval --kernel_size 0.1 --resolution 1 --sh_degree 1 \
    --appearance_enabled \
    --lambda_depth 0 --lambda_opacity 10 \
    --densify_until_iter 21000 --densify_grad_threshold 0.0001 \
    --lambda_pseudo_depth 0.5 --start_sample_pseudo 1000 --end_sample_pseudo 21000 \
    --size_threshold 20 --scaling_lr 0.001 --rotation_lr 0.001 \
    --opacity_reset_interval 3000 --sample_pseudo_interval 10

# Fuse to a single standard 3DGS ply (adjust --iteration to the stage-1
# final iteration of your run; do NOT pass a stage-2/IDU checkpoint):
python create_fused_ply.py \
    -m ./outputs/JAX/JAX_004 \
    --output_ply ./fused/JAX_004_stage1.ply
```

Then convert through the SAME prune/convert pipeline the 補完後 scenes used:

```bash
cd ~/sitcon-camp-2026-ml/precompute

uv run camp-precompute skyfall \
    --from-ply ~/skyfall-work/Skyfall-GS/fused/JAX_004_stage1.ply \
    --scene-id JAX_004 --variant before --max-splats 300000
```

This prunes to 300 k splats (~10 MB — see the byte-budget note in §1), writes
`skyfall/JAX_004/before.splat`, and merges the variant into `scenes.json`
WITHOUT touching the scene's poses — so 補完前/補完後 share the exact same
camera frames. `--max-splats / --min-opacity / --max-scale-frac` are there if
a scene needs a different trim.

## 4. Verify

```bash
cd ~/sitcon-camp-2026-ml

# scenes.json now lists a before variant with real bytes for each scene:
python3 -c "
import json
d = json.load(open('apps/course2/public/data/course2/skyfall/scenes.json'))
for s in d['scenes']:
    print(s['id'], {k: (v['splats'], v['bytes']) for k, v in s['variants'].items()})"

# byte budget: total committed .splat stays ≤ 80 MB
du -ch apps/course2/public/data/course2/skyfall/*/*.splat | tail -1

# eyeball it: pnpm --filter @app/course2 dev → /skyfall → pick JAX_004 →
# the 補完/toggle is now ENABLED; 街景視角 → flip 補完前: the same view melts
# (camera must not move). No console errors.
```

If the Stage-1 scene reads as random noise instead of a melted city, the
fused ply probably came from the wrong checkpoint directory (a stage-2 run)
or a mid-densification iteration — refuse and re-fuse.

## 5. Deploy

```bash
cd ~/sitcon-camp-2026-ml

# splats are gitignored → force-add the new (small) variants + the JSON:
git add -f apps/course2/public/data/course2/skyfall/*/before.splat
git add apps/course2/public/data/course2/skyfall/scenes.json \
        apps/course2/public/data/course2/manifest.json
git commit -m "data(skyfall): Stage-1 補完前 variants from the V100 box"
git push
```

Static assets only — Vercel picks the new `.splat` + JSON up on redeploy;
no server restart needed (this station has no live route). Classroom smoke
test: open `/skyfall`, JAX_004, 街景視角, flip the toggle twice — instant,
camera pinned, detail appears/melts.
