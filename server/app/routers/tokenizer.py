"""POST /tokenizer/encode — REAL Qwen3-0.6B BPE tokenization of typed text.

The tokenizer station's BPE mode. The browser ships a tiny toy-corpus BPE it
runs as a fallback (offline / server down), but when this server is reachable
the station shows the SAME merges/vocab Qwen actually uses — no guessing, no
unk. Every other scheme (字元 / 詞) stays client-side; only BPE calls here.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from camp_precompute import qwen

from ..loader import ModelStore
from ..schemas import TokenizerEncodeRequest, TokenizerEncodeResponse, TokenPiece

router = APIRouter(prefix="/tokenizer", tags=["tokenizer"])


@router.post("/encode", response_model=TokenizerEncodeResponse)
def encode(req: TokenizerEncodeRequest, request: Request) -> TokenizerEncodeResponse:
    store: ModelStore = request.app.state.store

    if not req.text.strip():
        raise HTTPException(status_code=422, detail="empty text")

    with store.lm_lock:
        pieces = qwen.tokenize_pieces(store.qwen_tok, req.text)
    if not pieces:
        raise HTTPException(status_code=422, detail="text produced no tokens")

    return TokenizerEncodeResponse(
        model=qwen.MODEL,
        tokens=[TokenPiece(**p) for p in pieces],
    )
