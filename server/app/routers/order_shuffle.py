"""Order-shuffle live routes — real models on BOTH sides of the contrast.

POST /order-shuffle/score — Qwen3-0.6B sequence log-prob / perplexity of the
  CURRENT chip arrangement (joined with the same rule precompute used). This is
  the order-SENSITIVE side: every reorder changes every conditional.

POST /order-shuffle/bag — per-word embedding fingerprints (leading dims of the
  L2-normalised Qwen3-Embedding vector, same encoder + dims as the shipped
  `wordVectors`). This is the order-INVARIANT side's raw material: the request
  takes a word SET (the station sends it sorted), so reordering chips cannot
  even change what is asked — the browser's mean pool over these vectors is
  symmetric, so the fingerprint provably cannot move.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from camp_precompute import qwen
from camp_precompute.cli import ORDER_FP_DIMS

from ..loader import ModelStore, encode_words
from ..schemas import (
    OrderBagRequest,
    OrderBagResponse,
    OrderScoreRequest,
    OrderScoreResponse,
)

router = APIRouter(prefix="/order-shuffle", tags=["order-shuffle"])

MAX_TOKEN_LEN = 20


def _clean_tokens(raw: list[str]) -> list[str]:
    tokens = [t.strip() for t in raw if t.strip()]
    if not tokens:
        raise HTTPException(status_code=422, detail="no tokens in input")
    if any(len(t) > MAX_TOKEN_LEN for t in tokens):
        raise HTTPException(
            status_code=422, detail=f"token too long (max {MAX_TOKEN_LEN} chars)"
        )
    return tokens


@router.post("/score", response_model=OrderScoreResponse)
def score(req: OrderScoreRequest, request: Request) -> OrderScoreResponse:
    store: ModelStore = request.app.state.store
    tokens = _clean_tokens(req.tokens)

    text = qwen.join_tokens(tokens)
    try:
        with store.lm_lock:
            result = qwen.sequence_logprob(store.qwen_tok, store.qwen_model, text)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e

    return OrderScoreResponse(
        tokens=tokens,
        text=text,
        avgLogProb=result["avgLogProb"],
        ppl=result["ppl"],
    )


@router.post("/bag", response_model=OrderBagResponse)
def bag(req: OrderBagRequest, request: Request) -> OrderBagResponse:
    store: ModelStore = request.app.state.store
    words = sorted(set(_clean_tokens(req.words)))

    vecs = encode_words(store, words)
    vectors = {
        w: [round(float(x), 4) for x in vecs[i][:ORDER_FP_DIMS]]
        for i, w in enumerate(words)
    }
    return OrderBagResponse(vectors=vectors, fingerprintDims=ORDER_FP_DIMS)
