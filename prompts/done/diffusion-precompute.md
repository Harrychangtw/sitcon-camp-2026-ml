# diffusion — bake the real SD-Turbo denoising trajectories

Replaces the SYNTHETIC dev sample in
`apps/course2/public/data/course2/diffusion/` with REAL SD-Turbo trajectories
(the latent decoded at every denoise step), and optionally turns on the live
`/diffusion/generate` "type any prompt" path.

The dev machine ships a hand-off sample baked by `camp-precompute
diffusion-sample` (noise blended toward a coloured shape — NOT the model). This
runbook produces the real thing on the GPU box.

## 1. What it produces

| Artifact | Where | Committed? |
| -------- | ----- | ---------- |
| Per-(preset × seed × steps) frame sequences (webp, noise → image) | `apps/course2/public/data/course2/diffusion/<presetId>/s<seed>-n<steps>/step-XX.webp` | yes, but **force-added** (gitignored by pattern) |
| `diffusion/presets.json` — trajectory manifest (frame lists + 中文 noise captions) | `apps/course2/public/data/course2/diffusion/` | yes (small JSON) |
| manifest update (`diffusion-presets` id, real bytes) | `apps/course2/public/data/course2/manifest.json` | yes |

Checkpoint: **stabilityai/sd-turbo** — a distilled few-step text-to-image model,
fetched from HuggingFace. NOT trained or fine-tuned here (rule 2). Presets:
柴犬 / 台灣夜市 / 太空貓 / 玉山日出, each baked at seeds {7, 42, 128} × steps
{4, 8} (frame count = steps + 1, capped well under ~25). Edit the grid in
`precompute/src/camp_precompute/diffusion.py` (`PRESETS` / `SEEDS` /
`STEP_CHOICES`) before baking if you want a different set.

**Frame commit note:** the frames are gitignored by
`public/data/**/diffusion/**/*.webp` (so a careless full-res bake can't be
committed by accident). The final small set is committed deliberately with
`git add -f` — see §5. Keep them small: 256 px webp @ q80, a few KB each;
4 presets × 3 seeds × 2 step-counts ≈ 168 frames ≈ ~1–2 MB total.

## 2. Prereqs

- The base deploy from `server/README.md` is in place (repo cloned,
  `server/.venv` synced, systemd replicas running).
- `git pull` so the tree has the `diffusion` / `diffusion-sample` cli
  subcommands + router.
- Install the GPU extra (diffusers + accelerate) into the SERVER venv so the
  bake uses the same torch the live server runs:

```bash
cd ~/sitcon-camp-2026-ml/server && uv sync --extra gpu
```

## 3. The commands

Run precompute through the SERVER venv so the recorded frames use the exact
torch/diffusers the live server answers with:

```bash
cd ~/sitcon-camp-2026-ml/precompute

# Bake the real trajectories: SD-Turbo over every (preset, seed, steps),
# decoding the latent at each denoise step → a webp frame. Overwrites the
# synthetic dev sample and updates manifest.json.
uv run --project ../server camp-precompute diffusion
```

First run downloads the checkpoint (~2.5 GB) into the HF cache. A full bake is a
few minutes on a V100.

## 4. Verify

```bash
# generator must now be "camp-precompute diffusion" and sample=false:
python3 -c "import json;d=json.load(open('../apps/course2/public/data/course2/diffusion/presets.json'));print(d['generator'], 'sample=', d['sample'], 'presets=', [p['id'] for p in d['presets']])"

# a preset's last frame should be a real image, its first frame pure noise —
# eyeball a couple:
ls ../apps/course2/public/data/course2/diffusion/shiba/s7-n8/
#   step-00.webp (純雜訊) … step-08.webp (成形)

# the JSON + manifest bytes changed:
git diff --stat ../apps/course2/public/data/course2/diffusion/presets.json \
               ../apps/course2/public/data/course2/manifest.json
```

If a preset reads muddy, tune its English `prompt` in `diffusion.py` and re-bake.
To keep the artifact smaller, drop a seed or a step-count from `SEEDS` /
`STEP_CHOICES` and re-run.

## 5. Deploy

```bash
cd ~/sitcon-camp-2026-ml

# frames are gitignored → force-add the real (small) set, plus the JSON:
git add -f apps/course2/public/data/course2/diffusion/**/*.webp
git add apps/course2/public/data/course2/diffusion/presets.json \
        apps/course2/public/data/course2/manifest.json
git commit -m "data: real SD-Turbo diffusion trajectories from the V100 box"
git push
```

The station serves these frames offline (no server needed) — Vercel picks up the
committed webp + JSON on redeploy. Scrub / play / seed / steps all work with the
backend OFF.

### Optional: the live "type any prompt" path

`/diffusion/generate` is OFF by default (loading SD-Turbo costs ~2–4 GB VRAM per
replica). To enable it on a box that ran §2's `uv sync --extra gpu`:

```bash
# in server/.env (or the systemd EnvironmentFile):
CAMP_ENABLE_DIFFUSION=1

sudo systemctl restart camp-server@0 camp-server@1 camp-server@2 camp-server@3

# startup log should show "diffusion: SD-Turbo ready" and /health (ENABLE_DOCS)
# lists "diffusion:stabilityai/sd-turbo":
journalctl -u camp-server@0 -n 30 | grep -i diffusion

# smoke test (after /auth per server/README.md §5): a typed prompt returns
# steps+1 webp data-URI frames.
curl -sb "$JAR" -H 'Content-Type: application/json' \
  -d '{"prompt":"a red bicycle on a beach","seed":7,"steps":8}' \
  http://127.0.0.1:8300/diffusion/generate | python3 -c "import sys,json;d=json.load(sys.stdin);print('frames',len(d['frames']),'labels',d['noiseLabels'])"
```

Leave `CAMP_ENABLE_DIFFUSION` unset to keep the box presets-only — the station
degrades to the shipped trajectories and shows 離線 on typed prompts.

## Notes / knobs

- `/diffusion/generate` holds its OWN `diffusion_lock` (not `lm_lock`), so a
  multi-second denoise never blocks the tens-of-ms Qwen forwards. It still takes
  a concurrency slot (`MAX_CONCURRENT_INFER` / `INFER_QUEUE`); a denoise is slow,
  so a class typing at once will queue — the station falls back to presets when
  the wait times out (`LIVE_TIMEOUT_MS` = 90 s client-side).
- `RENDER_SIZE` (512, what SD-Turbo denoises at) and `FRAME_SIZE` (256, the
  saved/served size) live in `diffusion.py`. Lower `FRAME_SIZE` to shrink the
  committed artifact further.
