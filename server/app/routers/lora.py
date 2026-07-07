"""POST /lora/generate — the SAME prompt through base Qwen3-0.6B vs a persona
LoRA adapter at strength alpha.

Live substitute for one text cell of lora/presets.json: adapter None (or
alpha 0) reproduces `base[prompt]`, adapter + a baked alpha reproduces
`outputs[adapter][prompt][i]` — same module, same greedy decoding
(camp_precompute.lora), so live == precomputed by construction.

The adapters idle DISABLED on the shared Qwen instance; this router enables
one inside lm_lock and always detaches it again before releasing, so every
other Qwen route keeps seeing exact base behaviour. Generation holds the lock
for a few seconds (up to MAX_NEW_TOKENS greedy steps) — the concurrency slot
and queue in limits.py are what keep a classroom burst orderly.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from camp_precompute import lora as lora_mod
from camp_precompute import qwen

from ..loader import ModelStore
from ..schemas import LoraGenerateRequest, LoraGenerateResponse

router = APIRouter(prefix="/lora", tags=["lora"])


@router.post("/generate", response_model=LoraGenerateResponse)
def generate(req: LoraGenerateRequest, request: Request) -> LoraGenerateResponse:
    store: ModelStore = request.app.state.store

    prompt = req.prompt.strip()
    if not prompt:
        raise HTTPException(status_code=422, detail="empty prompt")
    if store.lora_model is None:
        # Capacity-style condition, not the student's fault: the box has no
        # trained adapters. 503 → the client shows 離線 and stays on presets.
        raise HTTPException(status_code=503, detail="lora adapters not installed")
    if req.adapter is not None and req.adapter not in store.lora_adapters:
        raise HTTPException(
            status_code=422,
            detail=f"unknown adapter {req.adapter!r} (have: {store.lora_adapters})",
        )

    # alpha 0 = adapter fully detached = base, exactly.
    use_adapter = req.adapter if req.alpha > 0 else None

    with store.lm_lock:
        try:
            if use_adapter:
                lora_mod.set_adapter_strength(store.lora_model, use_adapter, req.alpha)
            text = lora_mod.generate_reply(store.qwen_tok, store.lora_model, prompt)
        finally:
            # Always back to base before the lock frees — the other Qwen
            # routes must never see a persona.
            lora_mod.reset_adapters(store.lora_model)

    return LoraGenerateResponse(
        prompt=req.prompt,
        adapter=use_adapter,
        alpha=req.alpha if use_adapter else 0.0,
        model=qwen.MODEL,
        text=text,
    )
