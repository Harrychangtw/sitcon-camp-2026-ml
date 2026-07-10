"""Manual per-person controls: ban and throttle, shared across replicas.

The shared state between the four replicas and the usage TUI
(scripts/usagetui.py) is ONE small JSON file, ``controls.json`` in USAGE_DIR:

    {"banned": ["王小明"], "throttle": {"李某": 30}}

``banned`` names get 403 on login AND on every inference call (an existing
session does not save them). ``throttle`` maps a name to a max sustained
requests/min that overrides the default per-person rate bucket in limits.py.

The TUI writes the file atomically (tmp + os.replace). Each replica re-reads
it at most once per second, mtime-gated, so a ban lands on all four replicas
within about a second with no cross-process channel, no restart, and no
behavior change when the file simply does not exist.
"""

from __future__ import annotations

import json
import logging
import os
import time
from dataclasses import dataclass, field
from pathlib import Path

log = logging.getLogger("camp.server.controls")

CONTROLS_FILENAME = "controls.json"


@dataclass(frozen=True)
class ControlState:
    banned: frozenset[str] = frozenset()
    throttle: dict[str, int] = field(default_factory=dict)  # name → max req/min


def parse_controls(raw: object) -> ControlState:
    """Lenient parse of the controls JSON; junk entries drop, they don't crash
    the serving path. Non-positive throttle values mean 'no throttle'."""
    if not isinstance(raw, dict):
        return ControlState()
    banned = frozenset(
        str(name).strip() for name in raw.get("banned", []) if str(name).strip()
    )
    throttle: dict[str, int] = {}
    for name, limit in dict(raw.get("throttle", {}) or {}).items():
        try:
            limit_int = int(limit)
        except (TypeError, ValueError):
            continue
        if str(name).strip() and limit_int > 0:
            throttle[str(name).strip()] = limit_int
    return ControlState(banned=banned, throttle=throttle)


class Controls:
    """Mtime-gated reader with a one-second recheck budget, so the hot request
    path costs one `stat()` per second per replica, not one read per request."""

    def __init__(self, path: Path) -> None:
        self._path = path
        self._state = ControlState()
        self._mtime = -1.0
        self._next_check = 0.0

    def current(self) -> ControlState:
        now = time.monotonic()
        if now < self._next_check:
            return self._state
        self._next_check = now + 1.0
        try:
            mtime = self._path.stat().st_mtime
        except OSError:
            self._mtime = -1.0
            self._state = ControlState()
            return self._state
        if mtime == self._mtime:
            return self._state
        try:
            self._state = parse_controls(json.loads(self._path.read_text("utf-8")))
            self._mtime = mtime
        except (OSError, ValueError) as exc:
            # Keep the previous state: a half-written or hand-mangled file must
            # not silently unban everyone.
            log.warning("controls.json unreadable, keeping previous state: %s", exc)
        return self._state


def write_controls(path: Path, state: ControlState) -> None:
    """Atomic write (tmp + rename) used by the TUI, so a replica's mtime-gated
    read can never observe a half-written file."""
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "banned": sorted(state.banned),
        "throttle": dict(sorted(state.throttle.items())),
    }
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", "utf-8")
    os.replace(tmp, path)
