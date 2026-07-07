"""POST /diffusion/generate — a live SD-Turbo denoising trajectory for a typed
prompt.

The live "type any prompt" upgrade for the diffusion station: it runs the SAME
checkpoint + per-step decode (camp_precompute.diffusion.generate_trajectory)
the presets were baked with, and returns the frames as webp data URIs so the
station renders them through the exact same scrubber. Optional — off unless
CAMP_ENABLE_DIFFUSION is set and diffusers is installed (loader.py); otherwise
this answers 503 and the station stays on its shipped presets.

A denoise holds the GPU for a few seconds, so it takes its OWN diffusion_lock
(not lm_lock) — the tens-of-ms Qwen forwards keep flowing while an image bakes.
"""

from __future__ import annotations

import base64
import io

from fastapi import APIRouter, HTTPException, Request

from camp_precompute import diffusion as diffusion_mod

from ..loader import ModelStore
from ..schemas import DiffusionGenerateRequest, DiffusionGenerateResponse

router = APIRouter(prefix="/diffusion", tags=["diffusion"])


def _to_data_uri(img, size: int) -> str:
    """Downscale a PIL frame and encode it as a webp data URI, matching the
    shipped frames' size + format so live and preset frames render identically."""
    from PIL import Image

    if img.size != (size, size):
        img = img.resize((size, size), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="WEBP", quality=diffusion_mod.WEBP_QUALITY, method=4)
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/webp;base64,{b64}"


@router.post("/generate", response_model=DiffusionGenerateResponse)
def generate(req: DiffusionGenerateRequest, request: Request) -> DiffusionGenerateResponse:
    store: ModelStore = request.app.state.store

    prompt = req.prompt.strip()
    if not prompt:
        raise HTTPException(status_code=422, detail="empty prompt")
    if store.diffusion_pipe is None:
        # Not the student's fault: the diffusion live path is off on this box.
        # 503 → the client shows 離線 and stays on the shipped presets.
        raise HTTPException(status_code=503, detail="diffusion live path not enabled")

    with store.diffusion_lock:
        frames = diffusion_mod.generate_trajectory(
            store.diffusion_pipe, prompt, req.seed, req.steps
        )

    return DiffusionGenerateResponse(
        prompt=req.prompt,
        seed=req.seed,
        steps=req.steps,
        model=diffusion_mod.MODEL,
        frames=[_to_data_uri(img, diffusion_mod.FRAME_SIZE) for img in frames],
        noiseLabels=diffusion_mod.noise_labels(req.steps),
    )
