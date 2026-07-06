"""POST /rnn/forward — live substitute for one element of activations.json
`sequences[]` (per-timestep hidden vectors + the token-0 influence-decay trace).

The weights are the TRAINED GRU exported by `camp-precompute train-rnn` — the
same npz the artifact build reads — so a preset sequence typed here returns
exactly the shipped values. Words outside the training vocab map to <unk>
(honest: the model never saw them), which still drives a real forward pass.
"""

from __future__ import annotations

import hashlib
import logging
import re

from fastapi import APIRouter, HTTPException, Request

from camp_precompute.rnn import HIDDEN_SIZE, run_sequence

from ..loader import ModelStore
from ..schemas import RnnForwardRequest, RnnForwardResponse

log = logging.getLogger("camp.rnn")

router = APIRouter(prefix="/rnn", tags=["rnn"])

# Matches the frontend cap (rnnViz.tsx MAX_RNN_TOKENS) — keep the two in sync so
# the field never sends a request the server will 422.
MAX_TOKENS = 50
MAX_TOKEN_LEN = 30

# Lowercase words, or single Han characters (so zh input steps char-by-char —
# the GRU was trained on English, so Han tokens are honest <unk>s).
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
        log.info("rnn/forward rejected: %d tokens > max %d", len(tokens), MAX_TOKENS)
        raise HTTPException(
            status_code=422, detail=f"too many tokens ({len(tokens)} > max {MAX_TOKENS})"
        )
    if any(len(t) > MAX_TOKEN_LEN for t in tokens):
        log.info("rnn/forward rejected: token > %d chars", MAX_TOKEN_LEN)
        raise HTTPException(
            status_code=422, detail=f"token too long (max {MAX_TOKEN_LEN} chars)"
        )

    hidden, influence = run_sequence(store.rnn, tokens)

    digest = hashlib.sha1("|".join(tokens).encode("utf-8")).hexdigest()[:8]
    return RnnForwardResponse(
        sequenceId=f"live-{digest}",
        label=" ".join(tokens),
        tokens=tokens,
        hiddenSize=HIDDEN_SIZE,
        hidden=hidden,
        influence=influence,
    )
