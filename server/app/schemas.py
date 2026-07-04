"""Pydantic request/response models.

Response shapes are SCHEMA-COMPATIBLE with the precomputed artifacts each
endpoint substitutes for (the frontend renders live results through the exact
same viz path as precomputed data):

- /embedding/lookup   → one element of points.json + neighbors.json
- /next-token/predict → one context's entry list from distributions.json
- /rnn/forward        → one element of activations.json `sequences[]`
- /transformer/attention → one element of attention.json `sentences[]`

Field names come from the real artifacts — do not rename without regenerating
the artifacts to match.
"""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

# --- embedding ---------------------------------------------------------------


class EmbeddingLookupRequest(BaseModel):
    word: str = Field(min_length=1, max_length=64)


class EmbeddingPoint(BaseModel):
    """Mirrors one element of points.json (combined zh+en vocab)."""

    word: str
    # Source vocab list ("zh"/"en") for shipped words; None for a novel word —
    # the space is shared, so lang is display metadata, not a lookup key.
    lang: Optional[str] = None
    x: float
    y: float
    z: float
    category: str


class EmbeddingNeighbor(BaseModel):
    """Mirrors one element of a neighbors.json list."""

    word: str
    score: float


class EmbeddingLookupResponse(BaseModel):
    word: str
    # True → point/neighbors are served verbatim from the shipped artifacts
    # (live == precomputed by construction). False → the word was embedded live
    # with the same multilingual model and projected with the same PCA/cluster
    # params.
    inVocab: bool
    point: EmbeddingPoint
    neighbors: list[EmbeddingNeighbor]
    # Nearest known words — a graceful hint the station can show for a word
    # that is not in the precomputed vocab (it is always a prefix of
    # `neighbors[].word`).
    suggestions: list[str]


# --- next-token ----------------------------------------------------------------


class NextTokenRequest(BaseModel):
    prompt: str = Field(max_length=500)


class TokenLogit(BaseModel):
    """Mirrors one element of distributions.json bigram/fallback lists."""

    token: str
    logit: float


class NextTokenResponse(BaseModel):
    prompt: str
    context: str
    contextKnown: bool
    topN: int
    entries: list[TokenLogit]


# --- rnn -----------------------------------------------------------------------


class RnnForwardRequest(BaseModel):
    """Either free text (tokenized server-side, same word regex as the
    precompute corpus) or an explicit token list."""

    text: Optional[str] = Field(default=None, max_length=300)
    tokens: Optional[list[str]] = Field(default=None, max_length=24)


class RnnForwardResponse(BaseModel):
    """Mirrors one element of activations.json `sequences[]`."""

    sequenceId: str
    label: str
    tokens: list[str]
    hiddenSize: int
    hidden: list[list[float]]
    influence: list[float]


# --- transformer -----------------------------------------------------------------


class TransformerRequest(BaseModel):
    text: str = Field(min_length=1, max_length=200)


class TransformerHeadQKV(BaseModel):
    """Mirrors attention.json layers[l].qkv[h]."""

    q: list[list[float]]
    k: list[list[float]]
    v: list[list[float]]


class TransformerLayer(BaseModel):
    """Mirrors attention.json sentences[].layers[l]."""

    heads: list[list[list[float]]]
    qkv: list[TransformerHeadQKV]


class TransformerResponse(BaseModel):
    """Mirrors one element of attention.json `sentences[]` (plus the tensor
    metadata the artifact carries at top level, for standalone consumers)."""

    sentenceId: str
    tokens: list[str]
    layers: list[TransformerLayer]
    headLabels: list[str]
    qkvDim: int


# --- health ----------------------------------------------------------------------


class HealthResponse(BaseModel):
    status: Literal["ok"]
    device: str
    gpu: Optional[str]
    models: list[str]
