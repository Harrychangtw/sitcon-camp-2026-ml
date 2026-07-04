"""POST /rnn/forward — live substitute for one element of activations.json
`sequences[]` (per-timestep hidden vectors + the token-0 influence-decay trace).

The weights and the preset-vocab embeddings are rebuilt deterministically from
camp_precompute.rnn (same seed, same rng stream), so a preset sequence typed
here returns exactly the shipped artifact values. Tokens outside the preset
vocab get deterministic crc32-seeded embeddings (same word → same vector on
every request and every machine).
"""

from __future__ import annotations

import hashlib
import re

from fastapi import APIRouter, HTTPException, Request

from camp_precompute.rnn import HIDDEN_SIZE, run_sequence

from ..loader import ModelStore
from ..schemas import RnnForwardRequest, RnnForwardResponse

router = APIRouter(prefix="/rnn", tags=["rnn"])

MAX_TOKENS = 24
MAX_TOKEN_LEN = 30

# Lowercase words, or single Han characters (so zh input steps char-by-char).
_TOKEN_RE = re.compile(r"[a-z]+|[一-鿿]")


@router.post("/forward", response_model=RnnForwardResponse)
def forward(req: RnnForwardRequest, request: Request) -> RnnForwardResponse:
    store: ModelStore = request.app.state.store

    if req.tokens is not None:
        tokens = [t.strip().lower() for t in req.tokens if t.strip()]
    elif req.text is not None:
        tokens = _TOKEN_RE.findall(req.text.lower())
    else:
        raise HTTPException(status_code=422, detail="provide `text` or `tokens`")

    if not tokens:
        raise HTTPException(status_code=422, detail="no tokens found in input")
    if len(tokens) > MAX_TOKENS:
        raise HTTPException(
            status_code=422, detail=f"too many tokens (max {MAX_TOKENS})"
        )
    if any(len(t) > MAX_TOKEN_LEN for t in tokens):
        raise HTTPException(
            status_code=422, detail=f"token too long (max {MAX_TOKEN_LEN} chars)"
        )

    hidden, influence = run_sequence(
        tokens, store.rnn_w_h, store.rnn_w_x, store.rnn_b, store.rnn_emb
    )

    digest = hashlib.sha1("|".join(tokens).encode("utf-8")).hexdigest()[:8]
    return RnnForwardResponse(
        sequenceId=f"live-{digest}",
        label=" ".join(tokens),
        tokens=tokens,
        hiddenSize=HIDDEN_SIZE,
        hidden=hidden,
        influence=influence,
    )
