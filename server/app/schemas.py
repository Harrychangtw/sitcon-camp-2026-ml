"""Pydantic request/response models.

Response shapes are SCHEMA-COMPATIBLE with the precomputed artifacts each
endpoint substitutes for (the frontend renders live results through the exact
same viz path as precomputed data):

- /tokenizer/encode      → real Qwen BPE pieces for the tokenizer station
- /embedding/lookup      → one element of points.json + neighbors.json
- /next-token/predict    → one prompt's entry list from distributions.json
- /rnn/forward           → one element of activations.json `sequences[]`
- /transformer/attention → one element of attention.json `sentences[]`
- /order-shuffle/score   → one element of predictions.json `arrangements[]`
- /order-shuffle/bag     → a slice of a preset's `wordVectors`

Field names come from the real artifacts — do not rename without regenerating
the artifacts to match.
"""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

from camp_precompute.steering import MAX_STRENGTH

# --- auth ----------------------------------------------------------------------


class AuthRequest(BaseModel):
    """The shared class password, posted to /auth to mint a session cookie."""

    password: str = Field(min_length=1, max_length=200)


class AuthResponse(BaseModel):
    """Success body for /auth. Carries no secret — the session rides in an
    HttpOnly cookie the browser sends automatically; this just tells the login
    screen how long the client-side "logged in" hint is good for."""

    ok: Literal[True]
    expiresInSeconds: int


# --- tokenizer -----------------------------------------------------------------


class TokenizerEncodeRequest(BaseModel):
    text: str = Field(min_length=1, max_length=500)


class TokenPiece(BaseModel):
    """One real Qwen BPE token: its vocab id and its decoded subword string
    (word-initial pieces keep a leading space; there is no unk)."""

    id: int
    piece: str


class TokenizerEncodeResponse(BaseModel):
    model: str
    tokens: list[TokenPiece]


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
    prompt: str = Field(min_length=1, max_length=500)
    # Context-window knob: how many TRAILING prompt tokens the model may see.
    # None/absent = the full NEXT_TOKEN_MAX_TOKENS tail (unchanged behaviour).
    contextTokens: Optional[int] = Field(default=None, ge=1)


class TokenLogit(BaseModel):
    """One real Qwen subword piece + its log-probability. Mirrors one element
    of a distributions.json `prompts[...]` list."""

    token: str
    logit: float


class NextTokenResponse(BaseModel):
    prompt: str
    model: str
    topN: int
    entries: list[TokenLogit]
    # promptTokens: total tokens in the prompt BEFORE truncation (lets the UI
    # clamp the slider so it never promises more context than the prompt has).
    # contextTokens: how many were ACTUALLY used (the effective window).
    promptTokens: int
    contextTokens: int
    # The prompt's decoded subword pieces, in read order (len == promptTokens).
    # The station draws them as the context strip and dims the trimmed tail.
    promptPieces: list[str]
    # The matching vocab ids (parallel to promptPieces) — shown under each chip
    # so the strip reads as the same tokens the Tokenizer station met.
    promptTokenIds: list[int]


# --- lora ----------------------------------------------------------------------


class LoraGenerateRequest(BaseModel):
    """One prompt through the shared Qwen base, optionally with a persona LoRA
    adapter glued on at strength alpha. adapter None (or alpha 0) = pure base."""

    prompt: str = Field(min_length=1, max_length=200)
    adapter: Optional[str] = Field(default=None, max_length=32)
    alpha: float = Field(default=1.0, ge=0.0, le=1.0)


class LoraGenerateResponse(BaseModel):
    """Mirrors one text cell of presets.json (`base[prompt]` or
    `outputs[adapter][prompt][i]`) — greedy decoding, so a preset prompt asked
    live reproduces its shipped text."""

    prompt: str
    adapter: Optional[str]
    alpha: float
    model: str
    text: str


# --- steering ------------------------------------------------------------------


class SteeringFeatureSetting(BaseModel):
    """One concept knob's position: the catalogued feature id and a slider
    strength. Strength is capped at ±MAX_STRENGTH (camp_precompute.steering —
    the same constant that bakes the slider range into features.json) so the
    output stays coherent enough to read the effect."""

    id: str = Field(min_length=1, max_length=32)
    strength: float = Field(ge=-MAX_STRENGTH, le=MAX_STRENGTH)


class SteeringGenerateRequest(BaseModel):
    """One prompt through the shared Qwen base with zero or more concept
    directions added to the residual stream. Empty features (or all strengths
    0) = pure base."""

    prompt: str = Field(min_length=1, max_length=200)
    features: list[SteeringFeatureSetting] = Field(default_factory=list, max_length=8)


class SteeringGenerateResponse(BaseModel):
    """Mirrors one text cell of steering/presets.json (`base[prompt]` or
    `outputs[feature][prompt][i]`) — greedy decoding, so a preset cell asked
    live reproduces its shipped text. `features` echoes the applied non-zero
    knobs."""

    prompt: str
    features: list[SteeringFeatureSetting]
    model: str
    text: str


# --- diffusion -----------------------------------------------------------------


class DiffusionGenerateRequest(BaseModel):
    """A typed prompt to denoise with SD-Turbo. seed/steps are the student's
    re-resolve knobs; steps is capped so the trajectory stays short + cheap."""

    prompt: str = Field(min_length=1, max_length=150)
    seed: int = Field(default=7, ge=0, le=2**31 - 1)
    steps: int = Field(default=8, ge=1, le=12)


class DiffusionGenerateResponse(BaseModel):
    """A live denoising trajectory: `frames` are webp data URIs (pure noise →
    image, len steps + 1), `noiseLabels` the matching 中文 captions. Rendered
    through the same scrubber the shipped presets use."""

    prompt: str
    seed: int
    steps: int
    model: str
    frames: list[str]
    noiseLabels: list[str]


# --- rnn -----------------------------------------------------------------------


class RnnForwardRequest(BaseModel):
    """Either free text (tokenized server-side, same word regex as the
    precompute corpus) or an explicit token list."""

    text: Optional[str] = Field(default=None, max_length=300)
    tokens: Optional[list[str]] = Field(default=None, max_length=50)


class RnnForwardResponse(BaseModel):
    """Mirrors one element of activations.json `sequences[]`."""

    sequenceId: str
    label: str
    tokens: list[str]
    hiddenSize: int
    hidden: list[list[float]]
    # influence[q][k]: per-(query-step, key-token) ablation matrix (see run_sequence).
    influence: list[list[float]]


# --- transformer -----------------------------------------------------------------


# The char cap is a coarse guard only; the real limit is the 50 REAL-token cap
# in qwen.pipeline_payload (over that → 422 → field shows a "too long" hint).
# Sized so ~50 English tokens fit before the char cap bites.
class TransformerRequest(BaseModel):
    text: str = Field(min_length=1, max_length=280)


class TransformerLayer(BaseModel):
    """Mirrors attention.json sentences[].layers[l]: heads[h] is a real Qwen
    [query][key] attention matrix (causal — keys ≤ query)."""

    heads: list[list[list[float]]]


class TransformerEmbedding(BaseModel):
    """Per-token input-embedding slice: `vectors[token][d]` holds `dims` real
    values sampled at a fixed stride from the `fullDims`-dim embedding."""

    dims: int
    fullDims: int
    vectors: list[list[float]]


class TransformerMlp(BaseModel):
    """Per-(layer, token) MLP activation slice: `layers[l][token][d]` holds
    `dims` real values sampled at a fixed stride from the `fullDims`-dim MLP
    intermediate (down_proj input)."""

    dims: int
    fullDims: int
    layers: list[list[list[float]]]


class TransformerResponse(BaseModel):
    """Mirrors one element of attention.json `sentences[]` (the full pipeline
    payload: attention + embedding/MLP slices + next-token output) plus the
    tensor dims the station needs for its layer/head dials."""

    sentenceId: str
    tokens: list[str]
    tokenIds: list[int]
    layers: list[TransformerLayer]
    nLayers: int
    nHeads: int
    embedding: TransformerEmbedding
    mlp: TransformerMlp
    output: list[TokenLogit]


# --- order-shuffle ----------------------------------------------------------------


class OrderScoreRequest(BaseModel):
    """The current chip arrangement, in order."""

    tokens: list[str] = Field(min_length=2, max_length=12)


class OrderScoreResponse(BaseModel):
    """Qwen's fluency for the ordered sequence — mirrors one element of
    predictions.json `arrangements[]` (minus the preset-only `order` index)."""

    tokens: list[str]
    text: str
    avgLogProb: float
    ppl: float


class OrderBagRequest(BaseModel):
    """The word SET for the bag-of-words side. Deliberately order-free: the
    station sends sorted unique words, so a reorder cannot even change the
    request — invariance by construction."""

    words: list[str] = Field(min_length=1, max_length=12)


class OrderBagResponse(BaseModel):
    """Per-word embedding fingerprints (leading dims of the L2-normalised
    Qwen3-Embedding vector) — mirrors a preset's `wordVectors`."""

    vectors: dict[str, list[float]]
    fingerprintDims: int


# --- health ----------------------------------------------------------------------


class HealthResponse(BaseModel):
    status: Literal["ok"]
    # Coarse device family ("cuda" / "cpu" / "mps") — safe to expose publicly.
    device_kind: str
    # Detailed fields are populated ONLY when ENABLE_DOCS is set (see main.py):
    # the exact "cuda:0" id, the card model string, and the loaded-model list
    # would otherwise fingerprint the box to any unauthenticated caller.
    device: Optional[str] = None
    gpu: Optional[str] = None
    models: list[str] = []
