"""Student roster and credential checks (token scheme: see auth.py).

The roster CSV (`STUDENTS_CSV`, default `<repo>/students-bd.csv`) holds one
`名字,YYYY-MM-DD` row per student. It contains names and birthdays, i.e. PII:
the file is gitignored, lives only on the box, and never ships to the client.
Students log in with their roster name and their birthday as an 8-digit
password (separators forgiven: 20110922, 2011-09-22 and 2011/09/22 all work).

Staff log in as their own display name with the shared STAFF_PASSWORD, so the
usage log can still tell staff members apart. The fixed username ``admin``
with ADMIN_PASSWORD unlocks the /admin routes.
"""

from __future__ import annotations

import csv
import secrets
from pathlib import Path
from typing import Optional

from .auth import Identity

ADMIN_USERNAME = "admin"


def _digits(text: str) -> str:
    """Keep only ASCII digits: '2011-09-22' → '20110922'."""
    return "".join(ch for ch in text if ch.isdigit())


def load_roster(path: Path) -> dict[str, str]:
    """Parse the roster CSV into ``{name: 'YYYYMMDD'}``. Refuses to boot on a
    missing/empty/malformed file: a silently empty roster would lock every
    student out while the class is standing in front of the stations."""
    if not path.is_file():
        raise SystemExit(
            f"camp-server: roster CSV not found at {path}. Set STUDENTS_CSV in "
            "server/.env (rows: 名字,YYYY-MM-DD). Refusing to serve without a "
            "roster: students could not log in."
        )
    roster: dict[str, str] = {}
    with path.open(encoding="utf-8-sig", newline="") as fh:
        for lineno, row in enumerate(csv.reader(fh), start=1):
            if not row or not row[0].strip():
                continue
            name = row[0].strip()
            birthday = _digits(row[1]) if len(row) > 1 else ""
            if len(birthday) != 8:
                raise SystemExit(
                    f"camp-server: roster line {lineno} ({name!r}): birthday "
                    f"{row[1] if len(row) > 1 else ''!r} does not contain 8 "
                    "digits (expected YYYY-MM-DD)."
                )
            if name in roster:
                raise SystemExit(
                    f"camp-server: roster line {lineno}: duplicate name {name!r}. "
                    "Names are login usernames and must be unique; disambiguate "
                    "the row (e.g. append a digit) and tell that student."
                )
            roster[name] = birthday
    if not roster:
        raise SystemExit(f"camp-server: roster CSV {path} has no usable rows.")
    return roster


def authenticate(
    username: str,
    password: str,
    roster: dict[str, str],
    staff_password: str,
    admin_password: str,
) -> Optional[Identity]:
    """Check credentials against admin, then the roster, then the staff
    password; None means rejected. Every password comparison is constant-time
    (`secrets.compare_digest`), so a wrong guess carries no timing tell about
    how close it was."""
    username = username.strip()
    password = password.strip()
    if not username or not password:
        return None
    if username == ADMIN_USERNAME:
        if secrets.compare_digest(password, admin_password):
            return Identity(username=ADMIN_USERNAME, role="admin")
        return None
    birthday = roster.get(username)
    if birthday is not None and secrets.compare_digest(_digits(password), birthday):
        return Identity(username=username, role="student")
    # Off-roster name, or a roster name with a non-birthday password: the staff
    # password grants a staff session under whatever name they typed, so staff
    # stay individually attributable in the usage log.
    if secrets.compare_digest(password, staff_password):
        return Identity(username=username, role="staff")
    return None
