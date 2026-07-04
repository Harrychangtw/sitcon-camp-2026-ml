"""camp-server — live inference for the Course 2 custom-input stations.

The golden rule (browser never trains, no runtime GPU needed) still holds for
every fixed-input station. This server is the deliberate, isolated exception
for stations where students type their OWN input: it runs the SAME model code
the precompute pipeline uses (imported from camp_precompute) and returns JSON
in the SAME shape as the precomputed artifacts, so the frontend renders live
results through the exact same viz path — and falls back to precomputed JSON
whenever this server is unreachable.

Run:  uvicorn app.main:app --host 0.0.0.0 --port $PORT  (see README runbook)
"""

from __future__ import annotations

import logging
import secrets
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .config import load_settings
from .loader import load_models
from .routers import embedding, next_token, rnn, transformer
from .schemas import HealthResponse

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")

settings = load_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Load every model + vocab into memory ONCE (and onto the resolved device).
    app.state.store = load_models(settings)
    yield


app = FastAPI(
    title="camp-server",
    description="Live inference for SITCON Camp 2026 ML Course 2 stations.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,  # no wildcard — enforced in config
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "X-Camp-Token"],
)


def require_token(
    x_camp_token: Annotated[str, Header(alias="X-Camp-Token")] = "",
) -> None:
    if not secrets.compare_digest(x_camp_token, settings.camp_token):
        raise HTTPException(status_code=401, detail="missing or invalid X-Camp-Token")


AUTH = [Depends(require_token)]

app.include_router(embedding.router, dependencies=AUTH)
app.include_router(next_token.router, dependencies=AUTH)
app.include_router(rnn.router, dependencies=AUTH)
app.include_router(transformer.router, dependencies=AUTH)


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    """Liveness + which-device-did-it-land-on. Deliberately unauthenticated —
    it leaks nothing but the GPU name and is the deploy smoke test."""
    store = app.state.store
    return HealthResponse(
        status="ok",
        device=store.device,
        gpu=store.gpu,
        models=store.model_names,
    )
