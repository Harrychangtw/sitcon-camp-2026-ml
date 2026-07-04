"""POST /embedding/lookup — live substitute for one word's entry in
points.{lang}.json + neighbors.{lang}.json.

In-vocab words are answered VERBATIM from the shipped artifacts (live ==
precomputed by construction). A novel word is embedded with the same BGE model,
projected with the same PCA params, categorised by nearest k-means centroid,
and given cosine top-K neighbours against the same vocab vectors — it lands
exactly where the precompute pipeline would have put it.
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
    lang_state = store.embeddings[req.lang]

    # Same normalisation as the station's search box (query.trim().toLowerCase()).
    word = req.word.strip().lower()
    if not word:
        raise HTTPException(status_code=422, detail="word is empty")
    if any(ch.isspace() for ch in word):
        raise HTTPException(status_code=422, detail="one word at a time (no spaces)")

    shipped = lang_state.points.get(word)
    if shipped is not None:
        neighbors = lang_state.neighbors.get(word, [])
        return EmbeddingLookupResponse(
            word=word,
            lang=req.lang,
            inVocab=True,
            point=EmbeddingPoint(**shipped),
            neighbors=[EmbeddingNeighbor(**n) for n in neighbors],
            suggestions=[],
        )

    # Novel word: same model, same projection, same neighbour math.
    vec = encode_word(store, req.lang, word)
    coords = project_3d(
        vec[None, :],
        lang_state.pca_mean,
        lang_state.pca_components,
        lang_state.pca_clip,
        lang_state.pca_denom,
    )[0]

    # Vectors are L2-normalised → dot product is cosine similarity.
    sims = lang_state.vectors.astype(np.float64) @ vec
    order = np.argpartition(sims, -TOP_K)[-TOP_K:]
    order = order[np.argsort(sims[order])[::-1]]
    neighbors = [
        EmbeddingNeighbor(word=lang_state.words[j], score=round(float(sims[j]), 4))
        for j in order
    ]

    # Category = nearest k-means centroid, named like the shipped clusters.
    dists = np.linalg.norm(lang_state.centroids - vec, axis=1)
    category = lang_state.centroid_names[int(np.argmin(dists))]

    return EmbeddingLookupResponse(
        word=word,
        lang=req.lang,
        inVocab=False,
        point=EmbeddingPoint(
            word=word,
            x=round(float(coords[0]), 3),
            y=round(float(coords[1]), 3),
            z=round(float(coords[2]), 3),
            category=category,
        ),
        neighbors=neighbors,
        suggestions=[n.word for n in neighbors[:8]],
    )
