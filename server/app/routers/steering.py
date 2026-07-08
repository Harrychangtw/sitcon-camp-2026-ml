"""POST /steering/generate — the SAME prompt through Qwen3-0.6B with concept
directions ("旋鈕") added to the residual stream at the catalogued layer.

Live substitute for one text cell of steering/presets.json: no features (or
all strengths 0) reproduces `base[prompt]`, one feature at a baked strength
reproduces `outputs[feature][prompt][i]` — same module, same greedy decoding
(camp_precompute.steering), so live == precomputed by construction. Multiple
non-zero features simply sum their deltas (the presets only bake single-
feature cells; combinations are live-only).

The hook is registered inside lm_lock and removed in a finally (the context
manager), so every other Qwen route keeps seeing exact base behaviour.
Generation holds the lock for a few seconds — the concurrency slot and queue
in limits.py keep a classroom burst orderly.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from camp_precompute import qwen
from camp_precompute import steering as steering_mod

from ..loader import ModelStore
from ..schemas import SteeringGenerateRequest, SteeringGenerateResponse

router = APIRouter(prefix="/steering", tags=["steering"])


@router.post("/generate", response_model=SteeringGenerateResponse)
def generate(req: SteeringGenerateRequest, request: Request) -> SteeringGenerateResponse:
    store: ModelStore = request.app.state.store

    prompt = req.prompt.strip()
    if not prompt:
        raise HTTPException(status_code=422, detail="empty prompt")
    if store.steering is None:
        # Capacity-style condition, not the student's fault: the box has no
        # computed directions. 503 → the client shows 離線 and stays on presets.
        raise HTTPException(status_code=503, detail="steering directions not installed")

    unknown = [f.id for f in req.features if f.id not in store.steering.vectors]
    if unknown:
        raise HTTPException(
            status_code=422,
            detail=f"unknown features {unknown} (have: {store.steering.ids})",
        )
    # Last write wins on duplicates; strength 0 entries are no-ops.
    settings = {f.id: f.strength for f in req.features}

    with store.lm_lock:
        text = steering_mod.generate_steered(
            store.qwen_tok, store.qwen_model, store.steering, prompt, settings
        )

    return SteeringGenerateResponse(
        prompt=req.prompt,
        features=[
            {"id": fid, "strength": s} for fid, s in settings.items() if s != 0
        ],
        model=qwen.MODEL,
        text=text,
    )
