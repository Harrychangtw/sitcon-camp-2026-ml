"""Per-person, password-gated sessions for the live-inference routes.

Replaces the old shipped-in-bundle `X-Camp-Token` (Vite inlines every `VITE_*`
into the built JS, so any client secret is public by construction) and the
later single shared class password. Now every person logs in as themselves:

- **student**: username is their name on the roster CSV, password is their
  birthday (8 digits, YYYYMMDD; separators forgiven).
- **staff**:   any display name plus the staff password (STAFF_PASSWORD).
- **admin**:   the fixed username ``admin`` plus ADMIN_PASSWORD; unlocks
  ``/admin/usage``.

On a constant-time match we mint a short-lived signed session and set it as an
**HttpOnly + Secure + SameSite** cookie. The inference routers then require a
valid session cookie, so nothing secret ships in the bundle.

The session token is **stateless** and now carries the identity:
``"<expiry>.<role>.<b64u(username)>.<hmac>"``, HMAC-SHA256-signed with
`CAMP_TOKEN` (a strong, server-only secret shared across the four replicas via
`.env`). Any replica behind the load balancer can therefore verify a cookie
any other replica minted AND attribute the request to a person for usage
logging and per-user rate limiting, with no server-side session store to keep
in sync. A restart does not log the class out.
"""

from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import time
from dataclasses import dataclass
from typing import Literal, Optional

# Cookie name carrying the signed session. HttpOnly, so client JS never reads it.
SESSION_COOKIE = "camp_session"

Role = Literal["student", "mentor", "staff", "admin"]
_ROLES: frozenset[str] = frozenset(("student", "mentor", "staff", "admin"))


@dataclass(frozen=True)
class Identity:
    """Who a verified session belongs to. Attached to request.state by the
    auth gate so the limiter and the usage log can attribute the request."""

    username: str
    role: Role


def _b64u(raw: bytes) -> str:
    """URL-safe base64 without padding (cookie-value safe)."""
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _b64u_decode(text: str) -> Optional[bytes]:
    try:
        return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))
    except (binascii.Error, ValueError):
        return None


def _sign(payload: str, key: str) -> str:
    return _b64u(hmac.new(key.encode(), payload.encode(), hashlib.sha256).digest())


def issue_session(identity: Identity, key: str, ttl_seconds: int) -> str:
    """Mint ``"<expiry>.<role>.<b64u(username)>.<signature>"`` where expiry is
    an absolute unix ts. The username rides base64url-encoded so the dot-split
    stays unambiguous for any name."""
    expiry = int(time.time()) + ttl_seconds
    payload = f"{expiry}.{identity.role}.{_b64u(identity.username.encode())}"
    return f"{payload}.{_sign(payload, key)}"


def verify_session(token: str, key: str) -> Optional[Identity]:
    """The Identity iff `token` is well-formed, correctly-signed and unexpired,
    else None.

    Constant-time on the signature compare so a forged cookie can't be tuned by
    timing. Any malformed/expired/mis-signed token returns None (then 401).
    """
    if not token or token.count(".") != 3:
        return None
    payload, sig = token.rsplit(".", 1)
    expected = _sign(payload, key)
    if not hmac.compare_digest(sig, expected):
        return None
    expiry_raw, role, username_b64 = payload.split(".", 2)
    try:
        expiry = int(expiry_raw)
    except ValueError:
        return None
    if time.time() >= expiry:
        return None
    if role not in _ROLES:
        return None
    username_raw = _b64u_decode(username_b64)
    if username_raw is None:
        return None
    try:
        username = username_raw.decode("utf-8")
    except UnicodeDecodeError:
        return None
    if not username:
        return None
    return Identity(username=username, role=role)  # type: ignore[arg-type]
