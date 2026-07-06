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

from fastapi import Cookie, Depends, FastAPI, HTTPException, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse

from .auth import SESSION_COOKIE, issue_session, verify_session
from .config import load_settings
from .limits import InferenceLimiter, RateLimitConfig
from .loader import load_models
from .routers import embedding, next_token, order_shuffle, rnn, tokenizer, transformer
from .schemas import AuthRequest, AuthResponse, HealthResponse

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
log = logging.getLogger("camp.server")

settings = load_settings()

limiter = InferenceLimiter(
    RateLimitConfig(
        max_concurrent=settings.max_concurrent_infer,
        max_queue=settings.infer_queue,
        rate_per_min=settings.rate_limit_per_min,
        rate_burst=settings.rate_limit_burst,
        trusted_proxies=frozenset(settings.trusted_proxies),
    )
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Load every model + vocab into memory ONCE (and onto the resolved device).
    app.state.store = load_models(settings)
    yield


# /docs, /redoc and /openapi.json are OFF by default — they hand out the entire
# API shape to anyone. Flip ENABLE_DOCS=1 (config.py) for local API browsing.
_docs_urls = (
    {}
    if settings.enable_docs
    else {"docs_url": None, "redoc_url": None, "openapi_url": None}
)

app = FastAPI(
    title="camp-server",
    description="Live inference for SITCON Camp 2026 ML Course 2 stations.",
    lifespan=lifespan,
    **_docs_urls,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,  # no wildcard — enforced in config
    # The browser sends the session cookie only when the response opts into
    # credentialed CORS (and the origin is explicit, never '*' — already enforced).
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],  # X-Camp-Token retired — auth is a cookie now
)

# The transformer route returns the full 28-layer × 16-head attention tensor
# (~1–2 MB of highly repetitive JSON for a 24-token sentence); gzip shrinks it
# ~10× on the wire.
app.add_middleware(GZipMiddleware, minimum_size=8192)


@app.exception_handler(RequestValidationError)
async def log_validation_error(request: Request, exc: RequestValidationError):
    """Log schema-level 422s (e.g. text over the char cap, token list too long)
    so a rejected request is never silent server-side — then return FastAPI's
    default 422 body unchanged."""
    log.info("422 %s: %s", request.url.path, exc.errors())
    return JSONResponse(status_code=422, content={"detail": exc.errors()})


@app.post("/auth", response_model=AuthResponse, dependencies=[Depends(limiter.rate_limit)])
def auth(req: AuthRequest, response: Response) -> AuthResponse:
    """Exchange the shared class password for a short-lived session cookie.

    Constant-time compare against CAMP_PASSWORD (a wrong password is a 401 with
    no timing tell). On success we set an HttpOnly + Secure + SameSite session
    cookie (app/auth.py) the browser then sends on every inference call — so no
    secret ever ships in the client bundle. Rate-limited (shared with the
    inference bucket) to blunt password guessing behind the funnel."""
    if not secrets.compare_digest(req.password, settings.camp_password):
        raise HTTPException(status_code=401, detail="invalid password")
    ttl = settings.session_ttl_hours * 3600
    response.set_cookie(
        key=SESSION_COOKIE,
        value=issue_session(settings.camp_token, ttl),
        max_age=ttl,
        httponly=True,
        secure=settings.cookie_secure,
        # None → the cookie rides cross-site fetches to the funnel host (needs
        # Secure, hence https in prod). Lax is the same-site http-localhost dev path.
        samesite="none" if settings.cookie_secure else "lax",
        path="/",
    )
    return AuthResponse(ok=True, expiresInSeconds=ttl)


def require_session(
    camp_session: Annotated[str, Cookie(alias=SESSION_COOKIE)] = "",
) -> None:
    """Gate: a valid, unexpired, correctly-signed session cookie or 401. The
    frontend treats 401 as 'log in again' (re-shows the password screen) while
    still falling back to precomputed JSON, so a logged-out student sees the
    class keep working."""
    if not verify_session(camp_session, settings.camp_token):
        raise HTTPException(status_code=401, detail="no valid session — POST /auth")


# Every inference route runs, in order: session auth (unauth requests never touch
# the limiter), then the forgiving rate limit, then a concurrency slot held for
# the whole request. The slot (limits.py) is the real GPU protection; the rate
# limit is a last-resort backstop. /health and /auth stay outside the auth gate.
GUARDS = [
    Depends(require_session),
    Depends(limiter.rate_limit),
    Depends(limiter.gpu_slot),
]

app.include_router(embedding.router, dependencies=GUARDS)
app.include_router(tokenizer.router, dependencies=GUARDS)
app.include_router(next_token.router, dependencies=GUARDS)
app.include_router(rnn.router, dependencies=GUARDS)
app.include_router(transformer.router, dependencies=GUARDS)
app.include_router(order_shuffle.router, dependencies=GUARDS)


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    """Liveness probe. Deliberately unauthenticated — Caddy least_conn
    health-checks it. Public body is coarse (`status` + `device_kind`); the
    exact card name and loaded-model list are only exposed when ENABLE_DOCS is
    set (dev), so a passer-by can't fingerprint the box. The resolved device and
    GPU name are also printed to the startup log for the deploy smoke test."""
    store = app.state.store
    device_kind = store.device.split(":", 1)[0]  # "cuda:0" → "cuda"
    if settings.enable_docs:
        return HealthResponse(
            status="ok",
            device_kind=device_kind,
            device=store.device,
            gpu=store.gpu,
            models=store.model_names,
        )
    return HealthResponse(status="ok", device_kind=device_kind)
