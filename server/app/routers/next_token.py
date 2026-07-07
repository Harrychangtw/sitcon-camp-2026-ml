"""POST /next-token/predict — REAL next-token distribution from Qwen3-0.6B.

Live substitute for one prompt's entry in distributions.json. The presets in
that artifact are recorded outputs of the SAME model + settings (see
camp_precompute.qwen), so typing a preset prompt live reproduces its shipped
values. Any other prompt gets a genuine distribution too — no bigram table,
no unknown-context fallback, no dead-ends.

Long prompts are truncated to the last NEXT_TOKEN_MAX_TOKENS tokens (the tail
is what conditions the next token) rather than rejected.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from camp_precompute import qwen

from ..loader import ModelStore
from ..schemas import NextTokenRequest, NextTokenResponse, TokenLogit

router = APIRouter(prefix="/next-token", tags=["next-token"])


@router.post("/predict", response_model=NextTokenResponse)
def predict(req: NextTokenRequest, request: Request) -> NextTokenResponse:
    store: ModelStore = request.app.state.store

    if not req.prompt.strip():
        raise HTTPException(status_code=422, detail="empty prompt")

    with store.lm_lock:
        # Decode the prompt's pieces + ids once (this also gives the honest
        # token count), then run the windowed prediction.
        pieces = qwen.prompt_pieces(store.qwen_tok, req.prompt)
        token_ids = qwen.prompt_token_ids(store.qwen_tok, req.prompt)
        entries = qwen.next_token_entries(
            store.qwen_tok,
            store.qwen_model,
            req.prompt,
            context_tokens=req.contextTokens,
        )
    if not entries:
        raise HTTPException(status_code=422, detail="prompt produced no tokens")

    # Effective window: the requested cap (or the hard cap) but never more than
    # the prompt actually has.
    prompt_tokens = len(pieces)
    window = min(req.contextTokens or qwen.NEXT_TOKEN_MAX_TOKENS, qwen.NEXT_TOKEN_MAX_TOKENS)
    context_tokens = min(window, prompt_tokens)

    return NextTokenResponse(
        prompt=req.prompt,
        model=qwen.MODEL,
        topN=qwen.NEXT_TOKEN_TOP_N,
        entries=[TokenLogit(**e) for e in entries],
        promptTokens=prompt_tokens,
        contextTokens=context_tokens,
        promptPieces=pieces,
        promptTokenIds=token_ids,
    )
