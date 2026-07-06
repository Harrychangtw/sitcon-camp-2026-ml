"""Backend abuse guards: a global concurrency cap plus a forgiving rate limit.

The routes are gated by a shared class password → session cookie (app/auth.py),
but every student in the room holds that password, so a valid session can still
call the GPU directly. These guards bound the blast radius so a holder of a valid
session still can't peg the box. (They also throttle /auth to blunt password
guessing — /auth carries the rate-limit dependency but not the GPU slot.)

What actually protects the GPU here is the **concurrency cap**, not the rate
limit. It is source-independent: no matter how a flood arrives, at most
`max_concurrent` inference requests run at once per process (and `lm_lock` in
loader.py already serialises the actual CUDA forward to one at a time per card),
so the GPU cannot be pegged regardless of who is calling. The rate limit is a
deliberately *forgiving* last-resort backstop layered on top.

Per-client-IP attribution behind the Tailscale funnel — the resolution:
    public client → tailscale funnel (localhost TLS terminator)
                  → caddy reverse_proxy (127.0.0.1)
                  → uvicorn worker (127.0.0.1:830x)
    The funnel is anonymous: it does NOT inject the originating public IP, and
    the only X-Forwarded-For the worker sees is the loopback hop Caddy appends.
    So per-IP attribution is UNRELIABLE behind the funnel — every request
    collapses to the same key. We therefore fall back to a strict GLOBAL rate
    bucket + the global concurrency cap (both per process). Where a real client
    IP *is* available (a direct LAN deploy, `request.client.host` is the
    student, or a future trusted proxy that forwards the public IP), the same
    code keys per-IP automatically. See `client_key`.

All limits are PER PROCESS. Under the multi-GPU deploy (scripts/serve-multi.sh,
four replicas behind the Caddy least_conn LB) the effective box-wide ceiling is
~4× these numbers, which is intended: the caps scale with the replica count.
"""

from __future__ import annotations

import asyncio
import logging
import time
from collections import OrderedDict
from dataclasses import dataclass
from typing import Optional

from fastapi import HTTPException, Request

log = logging.getLogger("camp.server.limits")

# Sentinel key used when a request cannot be attributed to a distinct client IP
# (the funnel case): all such requests share one global rate bucket.
_GLOBAL_KEY = "__global__"

# Cap the per-IP bucket table so a spray of distinct source IPs (only possible
# on a non-funnel deploy) can't grow it without bound; oldest entries evict.
_MAX_BUCKETS = 4096


@dataclass(frozen=True)
class RateLimitConfig:
    """Env-driven limiter knobs (defaults in config.load_settings)."""

    max_concurrent: int  # simultaneous inference requests admitted to the GPU path
    max_queue: int  # extra requests allowed to WAIT for a slot before we 429
    rate_per_min: int  # token-bucket refill: sustained requests/min per key
    rate_burst: int  # token-bucket capacity: instantaneous burst per key
    # Peers whose X-Forwarded-For we trust (the local Caddy/funnel hop). Only
    # from one of these do we read XFF to find the real client; from anyone else
    # the direct peer IS the client (never trust XFF from arbitrary callers —
    # it is trivially spoofable).
    trusted_proxies: frozenset[str]


class _Bucket:
    __slots__ = ("tokens", "updated")

    def __init__(self, tokens: float, updated: float) -> None:
        self.tokens = tokens
        self.updated = updated


class InferenceLimiter:
    """Owns the concurrency semaphore + the per-key token buckets.

    Both dependency methods are async, so they run on the event loop even though
    the inference endpoints are sync `def` (FastAPI dispatches those to a
    threadpool). Because the loop is single-threaded and neither the admission
    counter check nor the bucket update awaits mid-update, they need no lock.
    """

    def __init__(self, cfg: RateLimitConfig) -> None:
        self.cfg = cfg
        # Constructed at import time (no running loop): fine on Python ≥3.10,
        # where asyncio.Semaphore no longer binds to a loop at construction.
        self._sem: Optional[asyncio.Semaphore] = (
            asyncio.Semaphore(cfg.max_concurrent) if cfg.max_concurrent > 0 else None
        )
        self._max_admitted = cfg.max_concurrent + max(0, cfg.max_queue)
        self._admitted = 0  # running + waiting; gates admission without a timeout
        self._buckets: "OrderedDict[str, _Bucket]" = OrderedDict()
        self._refill_per_sec = cfg.rate_per_min / 60.0

    # -- client identity ------------------------------------------------------

    def client_key(self, request: Request) -> str:
        """Best-effort real client IP, or `_GLOBAL_KEY` when unattributable.

        Trust X-Forwarded-For ONLY when the direct peer is a configured local
        proxy, and read it right-to-left (each hop appends its own client), so
        the first non-trusted entry is the real client. Behind the funnel every
        hop is loopback → no real client → global bucket.
        """
        peer = request.client.host if request.client else ""
        if peer and peer not in self.cfg.trusted_proxies:
            # Direct connection (e.g. LAN deploy): the peer is the client.
            return peer
        xff = request.headers.get("x-forwarded-for", "")
        for hop in reversed([p.strip() for p in xff.split(",") if p.strip()]):
            if hop not in self.cfg.trusted_proxies:
                return hop
        return _GLOBAL_KEY

    # -- rate limit (forgiving backstop) --------------------------------------

    def _allow(self, key: str) -> bool:
        if self.cfg.rate_per_min <= 0:  # 0 disables the rate limit entirely
            return True
        now = time.monotonic()
        b = self._buckets.get(key)
        if b is None:
            b = _Bucket(tokens=float(self.cfg.rate_burst), updated=now)
            self._buckets[key] = b
            if len(self._buckets) > _MAX_BUCKETS:
                self._buckets.popitem(last=False)  # evict oldest
        else:
            elapsed = now - b.updated
            b.tokens = min(self.cfg.rate_burst, b.tokens + elapsed * self._refill_per_sec)
            b.updated = now
            self._buckets.move_to_end(key)
        if b.tokens >= 1.0:
            b.tokens -= 1.0
            return True
        return False

    async def rate_limit(self, request: Request) -> None:
        """Dependency: 429 when the (per-IP or global) bucket is empty."""
        if not self._allow(self.client_key(request)):
            raise HTTPException(
                status_code=429,
                detail="rate limit exceeded — showing precomputed results",
            )

    # -- concurrency cap (the real GPU protection) ----------------------------

    async def gpu_slot(self):
        """Dependency (yields): hold one of `max_concurrent` slots for the whole
        request, or 429 immediately when both the slots and the wait queue are
        full. No acquire timeout — admission is gated by a counter instead, so
        there is no wait_for/semaphore leak race."""
        if self._sem is None:
            yield
            return
        if self._admitted >= self._max_admitted:
            raise HTTPException(
                status_code=429,
                detail="inference server busy — showing precomputed results",
            )
        self._admitted += 1
        try:
            async with self._sem:
                yield
        finally:
            self._admitted -= 1
