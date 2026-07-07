"""Course 3 *diffusion* station — 「從雜訊長出一張圖」.

The pedagogy: 「AI 畫圖」不是一次畫好的。模型從一張純雜訊開始，一步步『去噪』，
結構先浮現、細節後長出，最後才成一張圖。學生換 prompt / seed / 步數，看同一條
去噪軌跡怎麼重新長出不一樣的畫面。

The golden rule holds: the browser NEVER runs the model. A curated set of
(prompt, seed, steps) presets is baked AHEAD of time by decoding the latent at
EVERY denoise step into a frame; the station just plays the frame sequence back
and scrubs it. Typed prompts optionally go to the live GPU server
(server/app/routers/diffusion.py), which runs the SAME SD-Turbo checkpoint and
returns the same kind of frame sequence; offline it falls back to the presets.

Checkpoint: **stabilityai/sd-turbo** — a distilled few-step text-to-image model.
Few steps keep the trajectory short and the frame artifacts small (rule 2:
fetch a checkpoint, never train). We do NOT fine-tune it.

TWO bakes share this module:
- `build_diffusion_artifacts` (GPU, `camp-precompute diffusion`): the REAL bake.
  SD-Turbo + VAE decode per step → real frames. GPU box only (see the runbook).
- `build_sample_artifacts` (no GPU, `camp-precompute diffusion-sample`): a
  deterministic SYNTHETIC trajectory (numpy noise blended toward a simple shape)
  so the dev MacBook can ship a small committed sample and verify the UI. It is
  NOT the model — the frames just resolve noise → a coloured shape so the
  scrubber, play/pause, and seed/steps knobs are demonstrably wired.

Frames are binary (webp) → gitignored, like *.onnx/*.bin (CLAUDE.md). Only the
small presets.json + the manifest entry are committed; the sample frames are
force-added once so a fresh checkout renders offline.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

MODEL = "stabilityai/sd-turbo"

# Real bake resolution. SD-Turbo is a 512-native SD-1.5-class model; we render
# small and downscale so the whole trajectory set stays a modest disk footprint.
RENDER_SIZE = 512
# Frames are downscaled to this before webp encoding — big enough to read the
# noise → image resolve, small enough that dozens of frames stay tiny.
FRAME_SIZE = 256
# The dev sample renders even smaller (it is only a wiring demo, not the model).
SAMPLE_FRAME_SIZE = 128

# The student's two "re-resolve it" knobs. Kept small: every (seed × steps)
# combination is a separately baked trajectory, so this is a real disk cost.
SEEDS = [7, 42, 128]
# Denoise-step counts. SD-Turbo denoises in very few steps; more steps = a
# longer, smoother trajectory to scrub. Capped well under ~25 (rule: cap frames).
STEP_CHOICES = [4, 8]

# webp quality for the saved frames (0-100). 80 keeps them small and legible.
WEBP_QUALITY = 80


@dataclass(frozen=True)
class DiffusionPreset:
    id: str
    label: str  # short 中文 chip label
    prompt_zh: str  # the 中文 prompt shown to the student
    prompt: str  # the English prompt actually fed to SD-Turbo


# Chinese-friendly subjects (rule: 正體中文 presets). The English prompt is what
# the checkpoint understands; the 中文 label/prompt is what the student reads.
PRESETS: list[DiffusionPreset] = [
    DiffusionPreset(
        id="shiba",
        label="柴犬",
        prompt_zh="一隻坐在草地上的柴犬，陽光",
        prompt="a photo of a happy shiba inu sitting on grass, warm sunlight, sharp focus",
    ),
    DiffusionPreset(
        id="night-market",
        label="台灣夜市",
        prompt_zh="熱鬧的台灣夜市，霓虹燈與小吃攤",
        prompt="a bustling taiwanese night market at night, neon signs, street food stalls, cinematic",
    ),
    DiffusionPreset(
        id="space-cat",
        label="太空貓",
        prompt_zh="一隻穿著太空衣的貓，漂浮在星空",
        prompt="an astronaut cat floating in space, stars and nebula, digital art, highly detailed",
    ),
    DiffusionPreset(
        id="jade-mountain",
        label="玉山日出",
        prompt_zh="玉山山頂的日出，雲海",
        prompt="sunrise over yushan mountain peak in taiwan, sea of clouds, golden light, landscape photo",
    ),
]


def _traj_rel_dir(preset_id: str, seed: int, steps: int) -> str:
    """Frame directory for one trajectory, relative to the data root
    (apps/course2/public/data/course2). The station prefixes it with /data/…."""
    return f"diffusion/{preset_id}/s{seed}-n{steps}"


def _frame_rel_paths(preset_id: str, seed: int, steps: int, n_frames: int) -> list[str]:
    d = _traj_rel_dir(preset_id, seed, steps)
    return [f"{d}/step-{i:02d}.webp" for i in range(n_frames)]


def _save_webp(img, out_path: Path, size: int) -> None:
    """Downscale to `size` and write a compressed webp frame."""
    from PIL import Image

    if img.size != (size, size):
        img = img.resize((size, size), Image.LANCZOS)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(out_path, format="WEBP", quality=WEBP_QUALITY, method=4)


def _noise_label(i: int, n_frames: int) -> str:
    """A coarse 中文 noise-level tag per frame — the canvas caption."""
    frac = i / (n_frames - 1) if n_frames > 1 else 1.0
    if i == 0:
        return "純雜訊"
    if frac < 0.34:
        return "還很雜訊"
    if frac < 0.7:
        return "結構浮現"
    if frac < 1.0:
        return "細節長出"
    return "成形"


def _preset_meta(
    trajectories: list[dict],
    preset: DiffusionPreset,
) -> dict:
    return {
        "id": preset.id,
        "label": preset.label,
        "promptZh": preset.prompt_zh,
        "prompt": preset.prompt,
        "trajectories": trajectories,
    }


def _payload(
    presets: list[dict], *, generator: str, sample: bool, frame_size: int, note: str
) -> dict:
    return {
        "generator": generator,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "station": "diffusion",
        "model": MODEL,
        "sample": sample,
        "note": note,
        "frameSize": frame_size,
        "seeds": SEEDS,
        "stepChoices": STEP_CHOICES,
        # Per-frame 中文 noise-level captions, indexed by frame position within
        # a trajectory of the given step count (same for every preset/seed).
        "noiseLabels": {
            str(steps): [_noise_label(i, steps + 1) for i in range(steps + 1)]
            for steps in STEP_CHOICES
        },
        "presets": presets,
    }


# --- shared generation (real bake + live server) --------------------------------


def noise_labels(steps: int) -> list[str]:
    """Per-frame 中文 noise-level captions for a `steps`-step trajectory
    (steps + 1 frames). Same function on both sides, so a live trajectory is
    labelled exactly like a preset one."""
    return [_noise_label(i, steps + 1) for i in range(steps + 1)]


def load_pipeline(device: str, dtype=None):
    """Load SD-Turbo once. Shared by the offline bake and the live server so a
    typed prompt runs the same checkpoint the presets were baked from."""
    import torch
    from diffusers import AutoPipelineForText2Image

    if dtype is None:
        dtype = torch.float16 if str(device).startswith("cuda") else torch.float32
    pipe = AutoPipelineForText2Image.from_pretrained(MODEL, torch_dtype=dtype)
    pipe = pipe.to(device)
    pipe.set_progress_bar_config(disable=True)
    return pipe


def _decode(pipe, latents):
    import torch

    with torch.no_grad():
        image = pipe.vae.decode(
            latents / pipe.vae.config.scaling_factor, return_dict=False
        )[0]
    return pipe.image_processor.postprocess(image, output_type="pil")[0]


def generate_trajectory(pipe, prompt: str, seed: int, steps: int, size: int = RENDER_SIZE):
    """Denoise `prompt` for `steps` steps, decoding the latent at every step.

    Returns a list of `steps + 1` PIL frames: frame 0 is the initial pure-noise
    latent decoded, frames 1..steps are the latent after each denoise step
    (純雜訊 → 成形). SD-Turbo runs with no classifier-free guidance."""
    import torch

    latent_ch = pipe.unet.config.in_channels
    latent_hw = size // pipe.vae_scale_factor
    gen = torch.Generator(device=pipe.device).manual_seed(int(seed))
    init_latents = torch.randn(
        (1, latent_ch, latent_hw, latent_hw),
        generator=gen,
        device=pipe.device,
        dtype=pipe.unet.dtype,
    )
    captured = [init_latents.detach().clone()]

    def _cb(_pipe, _step, _t, kw):
        captured.append(kw["latents"].detach().clone())
        return kw

    pipe(
        prompt=prompt,
        num_inference_steps=steps,
        guidance_scale=0.0,
        height=size,
        width=size,
        latents=init_latents,
        generator=gen,
        output_type="pil",
        callback_on_step_end=_cb,
        callback_on_step_end_tensor_inputs=["latents"],
    )
    return [_decode(pipe, latents) for latents in captured]


# --- real GPU bake --------------------------------------------------------------


def build_diffusion_artifacts(out_dir: Path) -> dict:
    """Run SD-Turbo over every (preset, seed, steps) and save the per-step
    frames. GPU box only — the dev machine ships the synthetic sample instead
    (see build_sample_artifacts + the runbook)."""
    from .embedding import _select_device

    device = _select_device()
    print(f"diffusion: loading {MODEL} on {device}…")
    pipe = load_pipeline(device)

    presets_meta: list[dict] = []
    for preset in PRESETS:
        trajectories: list[dict] = []
        for seed in SEEDS:
            for steps in STEP_CHOICES:
                frames = generate_trajectory(pipe, preset.prompt, seed, steps)
                rel_paths = _frame_rel_paths(preset.id, seed, steps, len(frames))
                for img, rel in zip(frames, rel_paths):
                    _save_webp(img, out_dir / rel, FRAME_SIZE)
                trajectories.append(
                    {"seed": seed, "steps": steps, "frames": rel_paths}
                )
                print(f"  {preset.id} seed={seed} steps={steps}: {len(rel_paths)} frames")
        presets_meta.append(_preset_meta(trajectories, preset))

    return _payload(
        presets_meta,
        generator="camp-precompute diffusion",
        sample=False,
        frame_size=FRAME_SIZE,
        note=(
            f"Real denoising trajectories from {MODEL}: frame 0 is the initial "
            "pure-noise latent decoded, frames 1..N are the latent after each "
            "denoise step (same checkpoint the live server runs). The browser "
            "only plays the frames back — no model runs there."
        ),
    )


# --- no-GPU synthetic sample ----------------------------------------------------


def _target_image(preset_idx: int, seed: int, size: int):
    """A simple, deterministic coloured shape standing in for the final image —
    hue from (preset, seed) so every preset/seed resolves to a visibly distinct
    picture. This is a WIRING placeholder, not the model's output."""
    from PIL import Image, ImageDraw

    rng = np.random.default_rng(seed * 131 + preset_idx * 17)
    hue = (rng.random() + preset_idx * 0.23) % 1.0
    base = _hsv_to_rgb(hue, 0.35, 0.22)
    accent = _hsv_to_rgb((hue + 0.5) % 1.0, 0.7, 0.9)
    accent2 = _hsv_to_rgb((hue + 0.12) % 1.0, 0.6, 0.8)

    img = Image.new("RGB", (size, size), base)
    draw = ImageDraw.Draw(img)
    cx, cy = size * 0.5, size * 0.52
    r = size * 0.3
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=accent)
    r2 = size * 0.14
    ox = size * (0.32 + 0.12 * rng.random())
    oy = size * (0.34 + 0.1 * rng.random())
    draw.ellipse([ox - r2, oy - r2, ox + r2, oy + r2], fill=accent2)
    # A horizon band so the different presets don't all read as "a disc".
    band = int(size * (0.7 + 0.08 * rng.random()))
    draw.rectangle([0, band, size, size], fill=_hsv_to_rgb(hue, 0.5, 0.12))
    return img


def _hsv_to_rgb(h: float, s: float, v: float) -> tuple[int, int, int]:
    import colorsys

    r, g, b = colorsys.hsv_to_rgb(h, s, v)
    return int(r * 255), int(g * 255), int(b * 255)


def build_sample_artifacts(out_dir: Path) -> dict:
    """Deterministic synthetic trajectories for the dev machine: pure noise
    blended toward a simple coloured shape as the step index rises. Same preset
    /seed/steps grid and same on-disk layout as the real bake, so the station
    code and manifest are identical — only the frame pixels are fake."""
    from PIL import Image

    presets_meta: list[dict] = []
    for preset_idx, preset in enumerate(PRESETS):
        trajectories: list[dict] = []
        for seed in SEEDS:
            for steps in STEP_CHOICES:
                n_frames = steps + 1
                target = np.asarray(
                    _target_image(preset_idx, seed, SAMPLE_FRAME_SIZE),
                    dtype=np.float32,
                )
                rng = np.random.default_rng(seed * 1009 + preset_idx)
                rel_paths = _frame_rel_paths(preset.id, seed, steps, n_frames)
                for i, rel in enumerate(rel_paths):
                    frac = i / (n_frames - 1) if n_frames > 1 else 1.0
                    noise = rng.integers(
                        0, 256, size=target.shape, dtype=np.int16
                    ).astype(np.float32)
                    # Ease-in so structure appears mid-trajectory, detail late.
                    signal = frac**1.7
                    frame = (1.0 - signal) * noise + signal * target
                    # A little residual noise even late, fading to zero at the end.
                    frame += (1.0 - frac) * rng.normal(0, 18, size=target.shape)
                    frame = np.clip(frame, 0, 255).astype(np.uint8)
                    _save_webp(
                        Image.fromarray(frame, "RGB"),
                        out_dir / rel,
                        SAMPLE_FRAME_SIZE,
                    )
                trajectories.append(
                    {"seed": seed, "steps": steps, "frames": rel_paths}
                )
        presets_meta.append(_preset_meta(trajectories, preset))

    return _payload(
        presets_meta,
        generator="camp-precompute diffusion-sample",
        sample=True,
        frame_size=SAMPLE_FRAME_SIZE,
        note=(
            "SYNTHETIC placeholder trajectories (no model): pure noise blended "
            "toward a simple coloured shape so the dev UI can play noise → image "
            "and exercise the seed/steps knobs. Replace with the real SD-Turbo "
            "bake (`camp-precompute diffusion`) on the GPU box — see the runbook."
        ),
    )


def write_diffusion(out_dir: Path, *, sample: bool) -> Path:
    """Bake the frames (real or sample), write presets.json, register it."""
    from .cli import upsert_manifest_artifact

    payload = (
        build_sample_artifacts(out_dir) if sample else build_diffusion_artifacts(out_dir)
    )
    station_dir = out_dir / "diffusion"
    station_dir.mkdir(parents=True, exist_ok=True)
    path = station_dir / "presets.json"
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    upsert_manifest_artifact(
        out_dir,
        {
            "id": "diffusion-presets",
            "kind": "json",
            "path": "diffusion/presets.json",
            "station": "diffusion",
            "bytes": path.stat().st_size,
            "description": (
                "Denoising-trajectory manifest for the diffusion station: per "
                "(preset, seed, steps) frame sequences (noise → image) + 中文 "
                "noise-level captions. Frames are gitignored webp; the browser "
                "plays them back, no model runs there."
            ),
        },
    )
    return path
