"""Password-gated sessions for the live-inference routes.

Replaces the old shipped-in-bundle `X-Camp-Token` (Vite inlines every `VITE_*`
into the built JS, so any client secret is public by construction). Instead a
student POSTs the shared class password — spoken aloud, never shipped — to
`/auth`; on a constant-time match against `CAMP_PASSWORD` we mint a short-lived
signed session and set it as an **HttpOnly + Secure + SameSite** cookie. The
inference routers then require a valid session cookie, so nothing secret ships
in the bundle.

The session token is **stateless**: `"<expiry>.<hmac>"`, HMAC-SHA256-signed
with `CAMP_TOKEN` (a strong, server-only secret shared across the four replicas
via `.env`). Any replica behind the load balancer can therefore verify a cookie
any other replica minted, and a restart does not log the class out — no
server-side session store to keep in sync. Rotating `CAMP_PASSWORD` daily is a
separate control (it gates *new* logins); a shorter TTL bounds how long an
already-minted session survives.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import time

# Cookie name carrying the signed session. HttpOnly, so client JS never reads it.
SESSION_COOKIE = "camp_session"


def _b64u(raw: bytes) -> str:
    """URL-safe base64 without padding (cookie-value safe)."""
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _sign(payload: str, key: str) -> str:
    return _b64u(hmac.new(key.encode(), payload.encode(), hashlib.sha256).digest())


def issue_session(key: str, ttl_seconds: int) -> str:
    """Mint `"<expiry>.<signature>"`, where `expiry` is an absolute unix ts."""
    expiry = int(time.time()) + ttl_seconds
    payload = str(expiry)
    return f"{payload}.{_sign(payload, key)}"


def verify_session(token: str, key: str) -> bool:
    """True iff `token` is a well-formed, correctly-signed, unexpired session.

    Constant-time on the signature compare so a forged cookie can't be tuned by
    timing. Any malformed/expired/mis-signed token returns False (→ 401).
    """
    if not token or token.count(".") != 1:
        return False
    payload, sig = token.split(".", 1)
    expected = _sign(payload, key)
    if not hmac.compare_digest(sig, expected):
        return False
    try:
        expiry = int(payload)
    except ValueError:
        return False
    return time.time() < expiry
