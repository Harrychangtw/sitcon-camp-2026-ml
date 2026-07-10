#!/usr/bin/env python3
"""Live per-person usage TUI — the bottom pane of the "control" window in
scripts/serve-multi.sh (the classroom lock/unlock TUI sits above it).

Tails every replica's usage-<port>.jsonl (written by app/usage.py), aggregates
per person over sliding 1-minute / 5-minute windows, and ranks by summed
inference milliseconds (the compute-intensity signal: request wall time on the
inference routes is dominated by GPU work). Staff can act on what they see:

    ↑/↓ or j/k   select a person
    b            ban / unban the selected person
    t            throttle: prompt for max requests/min (empty input = clear)
    c            clear the selected person's throttle
    q            quit (the pane drops to a shell; rerun with
                 `uv run python scripts/usagetui.py`)

Bans and throttles are written atomically to controls.json (app/controls.py);
every replica re-reads it within ~1s, so enforcement is effectively immediate
across the whole box, with no restart. The screen refreshes every 2 seconds.

Standalone by design: reads USAGE_DIR from the environment or server/.env and
imports only app.controls (stdlib-only), so it never triggers the FastAPI /
torch import chain and starts instantly.

Run from server/:  uv run python scripts/usagetui.py
"""

from __future__ import annotations

import curses
import json
import locale
import os
import subprocess
import sys
import time
import unicodedata
from collections import deque
from pathlib import Path

SERVER_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SERVER_DIR))

from app.controls import (  # noqa: E402  (path bootstrap above)
    CONTROLS_FILENAME,
    ControlState,
    parse_controls,
    write_controls,
)

REFRESH_MS = 2000
WINDOW_LONG = 300.0  # keep 5 minutes of events for the windowed columns
_ROLE_ORDER = {"student": 0, "staff": 1, "admin": 2, "unknown": 3}


def usage_dir() -> Path:
    """USAGE_DIR env var, else the USAGE_DIR= line in server/.env, else the
    server/usage default — the same resolution order as app/config.py."""
    env = os.environ.get("USAGE_DIR", "").strip()
    if env:
        return Path(env)
    dotenv = SERVER_DIR / ".env"
    if dotenv.is_file():
        for line in dotenv.read_text("utf-8").splitlines():
            if line.startswith("USAGE_DIR="):
                value = line.split("=", 1)[1].strip()
                if value:
                    return Path(value)
    return SERVER_DIR / "usage"


class Tail:
    """Incremental reader over all usage-*.jsonl files: remembers per-file
    offsets so each tick only parses appended bytes."""

    def __init__(self, directory: Path) -> None:
        self.dir = directory
        self.offsets: dict[Path, int] = {}

    def read_new(self) -> list[dict]:
        events: list[dict] = []
        for path in sorted(self.dir.glob("usage-*.jsonl")):
            offset = self.offsets.get(path, 0)
            try:
                size = path.stat().st_size
                if size < offset:  # truncated / rotated: start over
                    offset = 0
                if size == offset:
                    continue
                with path.open(encoding="utf-8") as fh:
                    fh.seek(offset)
                    chunk = fh.read()
                    self.offsets[path] = fh.tell()
            except OSError:
                continue
            for line in chunk.splitlines():
                line = line.strip()
                if not line:
                    continue
                try:
                    event = json.loads(line)
                except ValueError:
                    continue
                if isinstance(event, dict):
                    events.append(event)
        return events


class Stats:
    """All-time totals per person plus a 5-minute event window for rates."""

    def __init__(self) -> None:
        self.totals: dict[str, dict] = {}
        self.window: deque[tuple[float, str, float, int]] = deque()  # ts, user, ms, status

    def add(self, ev: dict) -> None:
        user = str(ev.get("user", "?"))
        role = str(ev.get("role", "?"))
        route = str(ev.get("route", "?"))
        status = int(ev.get("status", 0))
        ts = float(ev.get("ts", 0.0))
        ms = float(ev.get("ms", 0.0))
        t = self.totals.setdefault(
            user,
            {"role": role, "requests": 0, "errors": 0, "ms": 0.0, "last_ts": ts, "last_route": route},
        )
        t["requests"] += 1
        t["ms"] += ms
        if status >= 400:
            t["errors"] += 1
        if role != "unknown":
            t["role"] = role
        if ts >= t["last_ts"]:
            t["last_ts"] = ts
            t["last_route"] = route
        self.window.append((ts, user, ms, status))

    def rows(self, now: float) -> list[dict]:
        while self.window and self.window[0][0] < now - WINDOW_LONG:
            self.window.popleft()
        recent: dict[str, dict] = {}
        for ts, user, ms, _status in self.window:
            r = recent.setdefault(user, {"r1": 0, "r5": 0, "ms1": 0.0})
            r["r5"] += 1
            if ts >= now - 60.0:
                r["r1"] += 1
                r["ms1"] += ms
        rows = []
        for user, t in self.totals.items():
            r = recent.get(user, {"r1": 0, "r5": 0, "ms1": 0.0})
            rows.append({"user": user, **t, **r})
        rows.sort(key=lambda x: (-x["ms1"], -x["r1"], -x["requests"], _ROLE_ORDER.get(x["role"], 9), x["user"]))
        return rows


def gpu_util() -> str:
    try:
        out = subprocess.run(
            ["nvidia-smi", "--query-gpu=utilization.gpu", "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=1.5,
        )
        if out.returncode == 0:
            return " ".join(f"{v.strip()}%" for v in out.stdout.split())
    except (OSError, subprocess.TimeoutExpired):
        pass
    return "n/a"


def wide_pad(text: str, width: int) -> str:
    """ljust that counts CJK characters as 2 columns, truncating to fit."""
    out, cols = [], 0
    for ch in text:
        w = 2 if unicodedata.east_asian_width(ch) in ("W", "F") else 1
        if cols + w > width:
            break
        out.append(ch)
        cols += w
    return "".join(out) + " " * (width - cols)


def age(seconds: float) -> str:
    if seconds < 0:
        return "-"
    if seconds < 60:
        return f"{int(seconds)}s"
    if seconds < 3600:
        return f"{int(seconds // 60)}m"
    return f"{int(seconds // 3600)}h"


def load_controls(path: Path) -> ControlState:
    try:
        return parse_controls(json.loads(path.read_text("utf-8")))
    except (OSError, ValueError):
        return ControlState()


def prompt(stdscr, text: str) -> str:
    h, w = stdscr.getmaxyx()
    stdscr.move(h - 1, 0)
    stdscr.clrtoeol()
    stdscr.addstr(h - 1, 0, text[: w - 2], curses.A_BOLD)
    curses.echo()
    curses.curs_set(1)
    stdscr.timeout(-1)  # block while typing
    try:
        raw = stdscr.getstr(h - 1, min(len(text), w - 2), 12)
        return raw.decode("utf-8", "replace").strip()
    finally:
        curses.noecho()
        curses.curs_set(0)
        stdscr.timeout(REFRESH_MS)


def draw(stdscr, rows: list[dict], controls: ControlState, selected: str, msg: str) -> None:
    h, w = stdscr.getmaxyx()
    stdscr.erase()
    now = time.time()
    active = sum(1 for r in rows if r["r1"] > 0)
    req1 = sum(r["r1"] for r in rows)
    header = (
        f" camp usage · {active} active/1m · {req1} req/1m · GPU {gpu_util()}"
        f" · banned {len(controls.banned)} · throttled {len(controls.throttle)}"
    )
    stdscr.addnstr(0, 0, header + " " * w, w - 1, curses.A_REVERSE)
    cols = f" {'USER':<14}{'ROLE':<8}{'1m':>5}{'5m':>6}{'GPUms/1m':>10}{'TOTAL':>7}{'ERR':>5}  {'LAST':<26}FLAGS"
    stdscr.addnstr(1, 0, cols, w - 1, curses.A_BOLD)
    visible = rows[: max(0, h - 4)]
    for i, r in enumerate(visible):
        flags = []
        if r["user"] in controls.banned:
            flags.append("BAN")
        if r["user"] in controls.throttle:
            flags.append(f"THR@{controls.throttle[r['user']]}")
        last = f"{r['last_route']} {age(now - r['last_ts'])}"
        line = (
            f"{wide_pad(r['user'], 14)}{r['role']:<8}{r['r1']:>5}{r['r5']:>6}"
            f"{r['ms1']:>10.0f}{r['requests']:>7}{r['errors']:>5}  {wide_pad(last, 26)}{' '.join(flags)}"
        )
        attr = curses.A_REVERSE if r["user"] == selected else curses.A_NORMAL
        if "BAN" in flags:
            attr |= curses.A_DIM
        marker = ">" if r["user"] == selected else " "
        stdscr.addnstr(2 + i, 0, marker + line, w - 1, attr)
    footer = " [↑↓] select  [b]an/unban  [t]hrottle  [c]lear throttle  [q]uit"
    if msg:
        footer += f"  ·  {msg}"
    stdscr.addnstr(h - 1, 0, footer, w - 1, curses.A_DIM)
    stdscr.refresh()


def main(stdscr) -> None:
    curses.curs_set(0)
    curses.use_default_colors()
    stdscr.timeout(REFRESH_MS)
    directory = usage_dir()
    directory.mkdir(parents=True, exist_ok=True)
    controls_path = directory / CONTROLS_FILENAME
    tail = Tail(directory)
    stats = Stats()
    selected = ""
    msg = f"reading {directory}"
    while True:
        for ev in tail.read_new():
            stats.add(ev)
        rows = stats.rows(time.time())
        controls = load_controls(controls_path)
        names = [r["user"] for r in rows]
        if names and selected not in names:
            selected = names[0]
        draw(stdscr, rows, controls, selected, msg)
        key = stdscr.getch()
        if key == -1:
            continue
        msg = ""
        idx = names.index(selected) if selected in names else -1
        if key in (ord("q"), ord("Q")):
            return
        if key in (curses.KEY_UP, ord("k")) and names:
            selected = names[max(0, idx - 1)]
        elif key in (curses.KEY_DOWN, ord("j")) and names:
            selected = names[min(len(names) - 1, idx + 1)]
        elif key == ord("b") and selected:
            banned = set(controls.banned)
            if selected in banned:
                banned.discard(selected)
                msg = f"unbanned {selected}"
            else:
                banned.add(selected)
                msg = f"BANNED {selected}"
            write_controls(controls_path, ControlState(frozenset(banned), dict(controls.throttle)))
        elif key == ord("t") and selected:
            raw = prompt(stdscr, f" throttle {selected} to N req/min (empty = clear): ")
            throttle = dict(controls.throttle)
            if raw.isdigit() and int(raw) > 0:
                throttle[selected] = int(raw)
                msg = f"throttled {selected} to {raw}/min"
            else:
                throttle.pop(selected, None)
                msg = f"cleared throttle on {selected}"
            write_controls(controls_path, ControlState(controls.banned, throttle))
        elif key == ord("c") and selected:
            throttle = dict(controls.throttle)
            if throttle.pop(selected, None) is not None:
                write_controls(controls_path, ControlState(controls.banned, throttle))
                msg = f"cleared throttle on {selected}"


if __name__ == "__main__":
    locale.setlocale(locale.LC_ALL, "")
    try:
        curses.wrapper(main)
    except KeyboardInterrupt:
        pass
