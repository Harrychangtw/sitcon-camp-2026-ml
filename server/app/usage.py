"""Per-person usage log (JSONL) + the aggregation behind /admin/usage.

Every authenticated request is attributed to the person named in the session
cookie (auth.py) and appended as ONE JSON line to this replica's own file,
``usage-<port>.jsonl`` under USAGE_DIR. One file per replica means concurrent
replicas never interleave half-lines; small single-line appends in "a" mode
are atomic enough on Linux for this scale (a camp classroom, not a fleet).

Line shape:
    {"ts": 1752130000.123, "user": "曹品浩", "role": "student",
     "route": "/transformer/attention", "status": 200, "ms": 412.3}

``ms`` is wall time for the whole request, which on the inference routes is
dominated by GPU work, so summing it per person is the "compute intensity"
signal the usage TUI ranks by. Login attempts are logged too (route "/auth",
with the CLAIMED username and 200/401/403), so password guessing is just as
attributable as GPU burning.

`aggregate()` reads ALL ``usage-*.jsonl`` files in the dir, so any one replica
behind the load balancer can serve the box-wide answer.
"""

from __future__ import annotations

import json
import logging
import time
from pathlib import Path
from typing import Iterator, Optional

log = logging.getLogger("camp.server.usage")

# Cap the aggregate's "recent failed logins" list; the raw JSONL keeps it all.
_MAX_FAILURES = 50


class UsageLog:
    """Appender for THIS replica's usage file. Never raises: losing one log
    line must not fail a student's request."""

    def __init__(self, usage_dir: Path, port: int) -> None:
        usage_dir.mkdir(parents=True, exist_ok=True)
        self._path = usage_dir / f"usage-{port}.jsonl"

    def record(
        self,
        *,
        user: str,
        role: str,
        route: str,
        status: int,
        ms: Optional[float] = None,
    ) -> None:
        event: dict = {
            "ts": round(time.time(), 3),
            "user": user[:80],
            "role": role,
            "route": route,
            "status": status,
        }
        if ms is not None:
            event["ms"] = round(ms, 1)
        try:
            with self._path.open("a", encoding="utf-8") as fh:
                fh.write(json.dumps(event, ensure_ascii=False) + "\n")
        except OSError as exc:
            log.warning("usage log append failed (%s): %s", self._path, exc)


def iter_events(usage_dir: Path) -> Iterator[dict]:
    """Yield every parseable event from every replica's file, oldest file
    first. Malformed lines (a torn write, a manual edit) are skipped, not
    fatal: this feeds a dashboard, not billing."""
    for path in sorted(usage_dir.glob("usage-*.jsonl")):
        try:
            with path.open(encoding="utf-8") as fh:
                for line in fh:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        event = json.loads(line)
                    except ValueError:
                        continue
                    if isinstance(event, dict):
                        yield event
        except OSError:
            continue


def aggregate(usage_dir: Path) -> dict:
    """Box-wide per-person summary for /admin/usage: request counts, error
    counts, summed inference milliseconds, per-route counts, first/last seen,
    plus the most recent failed logins (who is guessing passwords)."""
    users: dict[tuple[str, str], dict] = {}
    failures: list[dict] = []
    for ev in iter_events(usage_dir):
        user = str(ev.get("user", "?"))
        role = str(ev.get("role", "?"))
        route = str(ev.get("route", "?"))
        status = int(ev.get("status", 0))
        ts = float(ev.get("ts", 0.0))
        if route == "/auth":
            if status != 200:
                failures.append({"ts": ts, "user": user, "status": status})
            # A successful login still counts toward the person's row below.
        entry = users.setdefault(
            (user, role),
            {
                "user": user,
                "role": role,
                "requests": 0,
                "errors": 0,
                "inferenceMs": 0.0,
                "byRoute": {},
                "firstSeen": ts,
                "lastSeen": ts,
            },
        )
        entry["requests"] += 1
        if status >= 400:
            entry["errors"] += 1
        entry["inferenceMs"] += float(ev.get("ms", 0.0))
        entry["byRoute"][route] = entry["byRoute"].get(route, 0) + 1
        entry["firstSeen"] = min(entry["firstSeen"], ts)
        entry["lastSeen"] = max(entry["lastSeen"], ts)
    for entry in users.values():
        entry["inferenceMs"] = round(entry["inferenceMs"], 1)
    failures.sort(key=lambda f: f["ts"])
    return {
        "generatedAt": round(time.time(), 3),
        "users": sorted(users.values(), key=lambda u: -u["requests"]),
        "recentAuthFailures": failures[-_MAX_FAILURES:],
    }
