"""POST /transformer/attention — the REAL forward-pass pipeline from
Qwen3-0.6B.

Live substitute for one element of attention.json `sentences[]`: the full
[layer][head][query][key] attention tensor PLUS the pipeline extras the
station's diagram draws — token ids, fixed-stride embedding/MLP slices, and
the top-N next-token distribution — for a typed sentence (one forward pass,
same code + settings as the precompute recording: qwen.pipeline_payload).
Tokens are the model's real subword pieces.

Input is capped at qwen.ATTENTION_MAX_TOKENS (50) for canvas legibility, not for
any model limitation — the station has to draw every token pair. The cap counts
REAL Qwen subword tokens, which the frontend can't count without the tokenizer,
so an over-cap sentence 422s here and the field shows a "too long" hint (see
liveInferOutcome). The response is large (28 layers × 16 heads); main.py's gzip
middleware keeps it small on the wire.
"""

from __future__ import annotations

import hashlib
import logging

from fastapi import APIRouter, HTTPException, Request

from camp_precompute import qwen

from ..loader import ModelStore
from ..schemas import TransformerRequest, TransformerResponse

log = logging.getLogger("camp.transformer")

router = APIRouter(prefix="/transformer", tags=["transformer"])


@router.post("/attention", response_model=TransformerResponse)
def attention(req: TransformerRequest, request: Request) -> TransformerResponse:
    store: ModelStore = request.app.state.store

    if not req.text.strip():
        raise HTTPException(status_code=422, detail="empty text")

    try:
        with store.lm_lock:
            pipe = qwen.pipeline_payload(
                store.qwen_tok,
                store.qwen_model,
                req.text,
                context_tokens=req.contextTokens,
            )
    except ValueError as e:
        # Over the token cap (or under 2) — the input, not the server, is the
        # problem. Log it so an over-cap field isn't a silent 422.
        log.info("transformer/attention rejected: %s", e)
        raise HTTPException(status_code=422, detail=str(e)) from e

    digest = hashlib.sha1(req.text.encode("utf-8")).hexdigest()[:8]
    return TransformerResponse(
        sentenceId=f"live-{digest}",
        tokens=pipe["tokens"],
        tokenIds=pipe["tokenIds"],
        layers=pipe["layers"],
        nLayers=pipe["nLayers"],
        nHeads=pipe["nHeads"],
        embedding=pipe["embedding"],
        mlp=pipe["mlp"],
        output=pipe["output"],
    )
