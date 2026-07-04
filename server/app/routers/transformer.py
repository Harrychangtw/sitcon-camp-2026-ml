"""POST /transformer/attention — live substitute for one element of
attention.json `sentences[]` (per-layer/head attention matrices + Q/K/V).

Pure playback of the SAME synthesis camp_precompute uses: the head patterns
(local / content / first-token) and the Q/K factorisation are deterministic
functions of the tokens, so a typed sentence gets exactly the patterns the
shipped sentences show. Input is capped at qkvDim (8) tokens because the Q/K
factorisation is exact only up to that rank (cli.py enforces the equality and
aborts beyond it).
"""

from __future__ import annotations

import hashlib
import re

from fastapi import APIRouter, HTTPException

from camp_precompute.cli import (
    TRANSFORMER_HEAD_LABELS,
    TRANSFORMER_QKV_DIM,
    build_transformer_sentence,
)

from ..schemas import TransformerRequest, TransformerResponse

router = APIRouter(prefix="/transformer", tags=["transformer"])

MAX_TOKENS = TRANSFORMER_QKV_DIM  # 8 — exact-factorisation bound

# Lowercase words, or single Han characters (zh input works char-by-char).
_TOKEN_RE = re.compile(r"[a-z]+|[一-鿿]")


@router.post("/attention", response_model=TransformerResponse)
def attention(req: TransformerRequest) -> TransformerResponse:
    tokens = _TOKEN_RE.findall(req.text.lower())
    if not tokens:
        raise HTTPException(status_code=422, detail="no tokens found in input")
    if len(tokens) < 2:
        raise HTTPException(status_code=422, detail="need at least 2 tokens")
    if len(tokens) > MAX_TOKENS:
        raise HTTPException(
            status_code=422,
            detail=f"too many tokens (max {MAX_TOKENS} — the Q/K factorisation "
            f"is exact only up to d={TRANSFORMER_QKV_DIM})",
        )

    digest = hashlib.sha1("|".join(tokens).encode("utf-8")).hexdigest()[:8]
    sentence = build_transformer_sentence(f"live-{digest}", tokens)

    return TransformerResponse(
        sentenceId=sentence["sentenceId"],
        tokens=sentence["tokens"],
        layers=sentence["layers"],
        headLabels=list(TRANSFORMER_HEAD_LABELS),
        qkvDim=TRANSFORMER_QKV_DIM,
    )
