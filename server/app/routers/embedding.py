"""POST /embedding/lookup — live substitute for one word's entry in
points.json + neighbors.json (the combined zh+en cloud).

In-vocab words are answered VERBATIM from the shipped artifacts (live ==
precomputed by construction). A novel word — zh, en, or anything else the
multilingual model can read — is embedded with the same model, projected with
the same PCA params, categorised by nearest k-means centroid, and given cosine
top-K neighbours against the same combined vocab vectors — it lands exactly
where the precompute pipeline would have put it.
"""

from __future__ import annotations

import numpy as np
from fastapi import APIRouter, HTTPException, Request

from camp_precompute.embedding import TOP_K, project_3d

from ..loader import ModelStore, encode_word
from ..schemas import (
    EmbeddingLookupRequest,
    EmbeddingLookupResponse,
    EmbeddingNeighbor,
    EmbeddingPoint,
)

router = APIRouter(prefix="/embedding", tags=["embedding"])


@router.post("/lookup", response_model=EmbeddingLookupResponse)
def lookup(req: EmbeddingLookupRequest, request: Request) -> EmbeddingLookupResponse:
    store: ModelStore = request.app.state.store
    emb = store.embedding

    # Same normalisation as the station's search box (query.trim().toLowerCase()).
    # Phrases are allowed: the model reads a short sentence as one vector and it
    # lands near the words closest to its meaning. The 64-char cap (schema
    # max_length + the input's maxLength) bounds the cost, so whitespace no
    # longer needs rejecting.
    word = req.word.strip().lower()
    if not word:
        raise HTTPException(status_code=422, detail="input is empty")

    shipped = emb.points.get(word)
    if shipped is not None:
        neighbors = emb.neighbors.get(word, [])
        return EmbeddingLookupResponse(
            word=word,
            inVocab=True,
            point=EmbeddingPoint(**shipped),
            neighbors=[EmbeddingNeighbor(**n) for n in neighbors],
            suggestions=[],
        )

    # Novel word: same model, same projection, same neighbour math.
    vec = encode_word(store, word)
    coords = project_3d(
        vec[None, :],
        emb.pca_mean,
        emb.pca_components,
        emb.pca_clip,
        emb.pca_denom,
    )[0]

    # Vectors are L2-normalised → dot product is cosine similarity.
    sims = emb.vectors.astype(np.float64) @ vec
    order = np.argpartition(sims, -TOP_K)[-TOP_K:]
    order = order[np.argsort(sims[order])[::-1]]
    neighbors = [
        EmbeddingNeighbor(word=emb.words[j], score=round(float(sims[j]), 4))
        for j in order
    ]

    # Category = nearest k-means centroid, named like the shipped clusters.
    dists = np.linalg.norm(emb.centroids - vec, axis=1)
    category = emb.centroid_names[int(np.argmin(dists))]

    return EmbeddingLookupResponse(
        word=word,
        inVocab=False,
        point=EmbeddingPoint(
            word=word,
            lang=None,
            x=round(float(coords[0]), 3),
            y=round(float(coords[1]), 3),
            z=round(float(coords[2]), 3),
            category=category,
        ),
        neighbors=neighbors,
        suggestions=[n.word for n in neighbors[:8]],
    )
