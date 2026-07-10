"""小隊 (team) mapping for the quest leaderboard, plus 隊輔 (mentor) accounts.

The groups CSV (`GROUPS_CSV`, default `<repo>/student-group-id.csv`) is the
camp's full logistics sheet — its header carries far more than we need
(年齡/房號/衣服size/性別/飲食/…). This loader reads ONLY three columns:

- 姓名 + 組別 → ``{student: 小隊}`` for leaderboard grouping.
- 隊輔 + 組別 → ``{mentor: 小隊}``: each team's row block names its 隊輔 once
  (「Yuto、牛排」style, 、-separated). Mentors are not on the birthday roster;
  they log in with their listed name + the shared MENTOR_PASSWORD
  (roster.py) as role "mentor", so staff can test the quest flow end to end
  and their points land on the right team.

Every other column is ignored, never logged, never exposed. The file is PII:
gitignored, pasted onto the box by hand (see server/README.md), with only the
fake-name `student-group-id.example.csv` in the repo to document the shape.

Unlike the roster (roster.py), this loader fails SOFT: the real CSV arrives
late by design, and a missing 小隊 mapping must never keep the server from
booting — students without a group simply rank under 未分組 until the file
lands (restart to pick it up); with no file there are simply no mentor logins.
"""

from __future__ import annotations

import csv
import logging
import re
from dataclasses import dataclass, field
from pathlib import Path

log = logging.getLogger("camp.server.groups")

NAME_COLUMN = "姓名"
GROUP_COLUMN = "組別"
MENTOR_COLUMN = "隊輔"

# The label shown for students the CSV does not (yet) cover.
UNGROUPED = "未分組"

# 「Yuto、牛排」 → ["Yuto", "牛排"]; forgive comma/slash variants.
_MENTOR_SEPARATORS = re.compile(r"[、,，/;；]+")


@dataclass(frozen=True)
class GroupsData:
    """Parsed groups CSV. ``groups`` maps every known person (students AND
    mentors) to a 小隊 label for leaderboard display; ``mentors`` is the
    subset allowed to log in with MENTOR_PASSWORD."""

    groups: dict[str, str] = field(default_factory=dict)
    mentors: dict[str, str] = field(default_factory=dict)


def load_groups(path: Path) -> GroupsData:
    """Parse the groups CSV. Any problem — missing file, unreadable bytes,
    absent columns — logs a warning and returns what could be read (possibly
    nothing); the server serves either way."""
    if not path.is_file():
        log.warning(
            "groups: CSV not found at %s — every student ranks under %s and "
            "no 隊輔 accounts exist until the real file is deployed (set "
            "GROUPS_CSV in server/.env, then restart).",
            path,
            UNGROUPED,
        )
        return GroupsData()
    students: dict[str, str] = {}
    mentors: dict[str, str] = {}
    try:
        with path.open(encoding="utf-8-sig", newline="") as fh:
            reader = csv.DictReader(fh)
            fields = reader.fieldnames or []
            if NAME_COLUMN not in fields or GROUP_COLUMN not in fields:
                log.warning(
                    "groups: %s is missing the %s/%s columns (header: %d cols) "
                    "— serving with no 小隊 mapping.",
                    path,
                    NAME_COLUMN,
                    GROUP_COLUMN,
                    len(fields),
                )
                return GroupsData()
            has_mentors = MENTOR_COLUMN in fields
            for row in reader:
                # Only these cells are ever read; the rest of the row
                # (年齡/房號/…) stays untouched and unlogged.
                group = (row.get(GROUP_COLUMN) or "").strip()
                if not group:
                    continue
                name = (row.get(NAME_COLUMN) or "").strip()
                if name:
                    if name in students and students[name] != group:
                        log.warning(
                            "groups: duplicate name %r with differing 組別 — "
                            "keeping the first.",
                            name,
                        )
                    else:
                        students.setdefault(name, group)
                if has_mentors:
                    for mentor in _MENTOR_SEPARATORS.split(
                        (row.get(MENTOR_COLUMN) or "").strip()
                    ):
                        mentor = mentor.strip()
                        if not mentor:
                            continue
                        if mentor in mentors and mentors[mentor] != group:
                            log.warning(
                                "groups: 隊輔 %r listed for two different 組別 "
                                "— keeping the first.",
                                mentor,
                            )
                        else:
                            mentors.setdefault(mentor, group)
    except (OSError, csv.Error, UnicodeError) as exc:
        log.warning(
            "groups: could not read %s (%s) — serving with the rows parsed "
            "so far.",
            path,
            exc,
        )
    # One display mapping for the leaderboard. A name that is somehow both a
    # student and a 隊輔 keeps the student row (the roster wins at login too).
    merged = {**mentors, **students}
    overlap = set(students) & set(mentors)
    if overlap:
        log.warning(
            "groups: %d name(s) appear as both 姓名 and 隊輔 — treating them "
            "as students.",
            len(overlap),
        )
    log.info(
        "groups: %d students + %d 隊輔 mapped to 小隊 from %s",
        len(students),
        len(mentors),
        path,
    )
    return GroupsData(groups=merged, mentors=mentors)
