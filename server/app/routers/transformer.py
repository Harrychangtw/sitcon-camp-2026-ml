"""POST /transformer/attention — REAL self-attention from Qwen3-0.6B.

Live substitute for one element of attention.json `sentences[]`: the full
[layer][head][query][key] tensor for a typed sentence (output_attentions=True,
same code + settings as the precompute recording — camp_precompute.qwen).
Tokens are the model's real subword pieces.

Input is capped at ATTENTION_MAX_TOKENS (~24) for canvas legibility, not for
any model limitation — the station has to draw every token pair. The response
is large (28 layers × 16 heads); main.py's gzip middleware keeps it small on
the wire.
"""

from __future__ import annotations

import hashlib

from fastapi import APIRouter, HTTPException, Request

from camp_precompute import qwen

from ..loader import ModelStore
from ..schemas import TransformerRequest, TransformerResponse

router = APIRouter(prefix="/transformer", tags=["transformer"])


@router.post("/attention", response_model=TransformerResponse)
def attention(req: TransformerRequest, request: Request) -> TransformerResponse:
    store: ModelStore = request.app.state.store

    if not req.text.strip():
        raise HTTPException(status_code=422, detail="empty text")

    try:
        with store.lm_lock:
            att = qwen.attention_payload(store.qwen_tok, store.qwen_model, req.text)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e

    digest = hashlib.sha1(req.text.encode("utf-8")).hexdigest()[:8]
    return TransformerResponse(
        sentenceId=f"live-{digest}",
        tokens=att["tokens"],
        layers=att["layers"],
        nLayers=att["nLayers"],
        nHeads=att["nHeads"],
    )
