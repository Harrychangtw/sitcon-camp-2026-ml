"""POST /next-token/predict — live substitute for one context's entry in
distributions.json (tokens + next-token logit distribution).

The tables are rebuilt at startup by the SAME camp_precompute function that
writes the artifact, so entries are identical to the shipped JSON for every
context. The lookup rule mirrors the station: key on the LAST word of the
prompt, fall back to the unigram distribution for unknown context.
"""

from __future__ import annotations

import re

from fastapi import APIRouter, Request

from ..loader import ModelStore
from ..schemas import NextTokenRequest, NextTokenResponse, TokenLogit

router = APIRouter(prefix="/next-token", tags=["next-token"])

# Same word regex as the precompute corpus tokenizer and the station.
_WORD_RE = re.compile(r"[a-z]+")


@router.post("/predict", response_model=NextTokenResponse)
def predict(req: NextTokenRequest, request: Request) -> NextTokenResponse:
    store: ModelStore = request.app.state.store
    tables = store.next_token

    words = _WORD_RE.findall(req.prompt.lower())
    context = words[-1] if words else ""

    entries = tables["bigram"].get(context)
    context_known = entries is not None
    if entries is None:
        entries = tables["fallback"]

    return NextTokenResponse(
        prompt=req.prompt,
        context=context,
        contextKnown=context_known,
        topN=tables["topN"],
        entries=[TokenLogit(**e) for e in entries],
    )
