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
import time
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import Cookie, Depends, FastAPI, HTTPException, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse

from .auth import SESSION_COOKIE, issue_session, verify_session
from .config import load_settings
from .controls import CONTROLS_FILENAME, Controls
from .groups import load_groups
from .limits import InferenceLimiter, RateLimitConfig
from .loader import load_models
from .quests.storage import QuestLog
from .roster import authenticate, load_roster
from .usage import UsageLog, aggregate
from .routers import (
    diffusion,
    embedding,
    lora,
    next_token,
    order_shuffle,
    quests,
    rnn,
    steering,
    tokenizer,
    transformer,
)
from .schemas import AuthRequest, AuthResponse, HealthResponse

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
log = logging.getLogger("camp.server")

settings = load_settings()

# Fail at boot, not at first login, if the roster CSV is missing or malformed.
roster = load_roster(settings.students_csv)
log.info("roster: %d students loaded from %s", len(roster), settings.students_csv)

# Per-person usage attribution (usage.py) + manual ban/throttle state shared
# with the usage TUI (controls.py). One usage file per replica, keyed by port.
usage_log = UsageLog(settings.usage_dir, settings.port)
controls = Controls(settings.usage_dir / CONTROLS_FILENAME)

# Quest system state: the per-replica attempt log (same JSONL-per-replica
# pattern as usage.py) and the 小隊 mapping + 隊輔 accounts. The groups CSV
# loads SOFT — the real file is pasted onto the box by hand later; until then
# students rank under 未分組 and no 隊輔 can log in (app/groups.py).
quest_log = QuestLog(settings.usage_dir, settings.port)
groups_data = load_groups(settings.groups_csv)

limiter = InferenceLimiter(
    RateLimitConfig(
        max_concurrent=settings.max_concurrent_infer,
        max_queue=settings.infer_queue,
        rate_per_min=settings.rate_limit_per_min,
        rate_burst=settings.rate_limit_burst,
        trusted_proxies=frozenset(settings.trusted_proxies),
    ),
    controls=controls,
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

# Handed to the quest routes (routers/quests.py) via app.state so the router
# module stays import-cycle-free. The attempt log is read box-wide (all
# replicas' quests-*.jsonl under USAGE_DIR), written per-replica.
app.state.quest_log = quest_log
app.state.quests_usage_dir = settings.usage_dir
app.state.groups = groups_data.groups

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
    """Exchange per-person credentials for a short-lived session cookie.

    Students: roster name + birthday. Staff: own name + STAFF_PASSWORD. Admin:
    `admin` + ADMIN_PASSWORD. (Checks in app/roster.py; every compare is
    constant-time.) On success we set an HttpOnly + Secure + SameSite session
    cookie carrying the signed identity (app/auth.py) that the browser sends
    on every inference call — so no secret ever ships in the client bundle.
    Rate-limited to blunt password guessing behind the funnel, and every
    attempt (success or not, with the claimed username) lands in the usage
    log so brute-forcing is attributable."""
    ident = authenticate(
        req.username,
        req.password,
        roster,
        settings.staff_password,
        settings.admin_password,
        mentors=groups_data.mentors,
        mentor_password=settings.mentor_password,
    )
    if ident is None:
        usage_log.record(user=req.username.strip(), role="unknown", route="/auth", status=401)
        raise HTTPException(status_code=401, detail="invalid username or password")
    if ident.username in controls.current().banned:
        usage_log.record(user=ident.username, role=ident.role, route="/auth", status=403)
        raise HTTPException(
            status_code=403, detail="account disabled by staff — 帳號已被工作人員停用"
        )
    ttl = settings.session_ttl_hours * 3600
    response.set_cookie(
        key=SESSION_COOKIE,
        value=issue_session(ident, settings.camp_token, ttl),
        max_age=ttl,
        httponly=True,
        secure=settings.cookie_secure,
        # None → the cookie rides cross-site fetches to the funnel host (needs
        # Secure, hence https in prod). Lax is the same-site http-localhost dev path.
        samesite="none" if settings.cookie_secure else "lax",
        path="/",
    )
    usage_log.record(user=ident.username, role=ident.role, route="/auth", status=200)
    return AuthResponse(ok=True, expiresInSeconds=ttl, name=ident.username, role=ident.role)


def require_session(
    request: Request,
    camp_session: Annotated[str, Cookie(alias=SESSION_COOKIE)] = "",
) -> None:
    """Gate: a valid, unexpired, correctly-signed session cookie or 401. The
    verified identity is attached to request.state so the rate limiter can key
    per-person and the usage middleware can attribute the request. The
    frontend treats 401 as 'log in again' (re-shows the login screen) while
    still falling back to precomputed JSON, so a logged-out student sees the
    class keep working."""
    ident = verify_session(camp_session, settings.camp_token)
    if ident is None:
        raise HTTPException(status_code=401, detail="no valid session — POST /auth")
    request.state.camp_identity = ident


def require_admin(request: Request) -> None:
    """Gate (after require_session): admin sessions only."""
    if request.state.camp_identity.role != "admin":
        raise HTTPException(status_code=403, detail="admin only")


@app.middleware("http")
async def record_usage(request: Request, call_next):
    """Attribute every authenticated request to its person in the usage log,
    with wall-time ms (inference routes: dominated by GPU work, so this is the
    per-person compute-intensity signal the TUI ranks by). Runs outside the
    dependency stack, so it also sees the limiter's 429/403 outcomes. /auth
    logs itself inside the endpoint (no identity on request.state there)."""
    start = time.perf_counter()
    response = await call_next(request)
    ident = getattr(request.state, "camp_identity", None)
    if ident is not None:
        usage_log.record(
            user=ident.username,
            role=ident.role,
            route=request.url.path,
            status=response.status_code,
            ms=(time.perf_counter() - start) * 1000,
        )
    return response


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
app.include_router(lora.router, dependencies=GUARDS)
app.include_router(steering.router, dependencies=GUARDS)
app.include_router(diffusion.router, dependencies=GUARDS)

# Quest routes: session + rate limit but NO gpu_slot — they are not inference
# routes. Hunt verifiers that do touch a model serialize on store.lm_lock like
# every inference router, and the wrong-attempt cooldown (quests/storage.py)
# damps repeat verification, so the GPU stays protected without a slot.
QUEST_GUARDS = [
    Depends(require_session),
    Depends(limiter.rate_limit),
]
app.include_router(quests.router, dependencies=QUEST_GUARDS)


@app.get(
    "/admin/usage",
    dependencies=[Depends(require_session), Depends(require_admin), Depends(limiter.rate_limit)],
)
def admin_usage() -> JSONResponse:
    """Box-wide per-person usage summary (all replicas' JSONL files) plus the
    live ban/throttle state. Admin session only. The heavier interactive view
    is the usage TUI on the box (scripts/usagetui.py); this endpoint is the
    remote/scriptable equivalent: `curl -b <cookie> /admin/usage | jq`."""
    data = aggregate(settings.usage_dir)
    state = controls.current()
    data["controls"] = {"banned": sorted(state.banned), "throttle": state.throttle}
    return JSONResponse(data)


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
