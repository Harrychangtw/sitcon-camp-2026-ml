"""Environment-driven configuration.

Portability rule (see README): the SAME code must boot on the single-GPU 3090
box and the 4x V100 VM with only `.env` differing. Nothing here (or anywhere in
`app/`) may hardcode a device id, GPU count, VRAM size, IP, or token.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv


def find_repo_root(start: Path) -> Path:
    """Walk up to the pnpm-workspace.yaml root (same convention as precompute)."""
    for d in (start, *start.parents):
        if (d / "pnpm-workspace.yaml").exists():
            return d
    raise SystemExit(
        f"camp-server: could not find repo root (no pnpm-workspace.yaml above {start})"
    )


@dataclass
class Settings:
    # Server-only HMAC key that signs session cookies (see app/auth.py). Was the
    # client `X-Camp-Token`; that shipped in the Vite bundle and is gone now — a
    # person authenticates with their own credentials instead. Never leaves the box.
    camp_token: str
    # Shared staff password: staff log in as their own display name plus this
    # (roster.py). Replaces the old single class-wide CAMP_PASSWORD; students
    # now use their roster name + birthday instead.
    staff_password: str
    # Password for the fixed `admin` username; unlocks /admin/usage.
    admin_password: str
    # Shared password for 隊輔 accounts (names from the groups CSV's 隊輔
    # column, app/groups.py). Role "mentor": ranks on the leaderboard under
    # its 小隊 so the quest flow is testable end to end. Empty → 隊輔 login
    # disabled (soft, like the groups file itself).
    mentor_password: str
    # Roster CSV of `名字,YYYY-MM-DD` rows (PII: gitignored, box-only).
    students_csv: Path
    # 小隊 mapping CSV for the quest leaderboard (PII: gitignored, pasted onto
    # the box by hand; only the 姓名/組別 columns are ever read — app/groups.py).
    # Unlike the roster this loads SOFT: missing file → students rank 未分組.
    groups_csv: Path
    # Where per-replica usage-<port>.jsonl logs and controls.json live.
    usage_dir: Path
    session_ttl_hours: int  # session cookie lifetime (short: a camp day or less)
    cookie_secure: bool  # True → Secure + SameSite=None (https); False → dev http
    allowed_origins: list[str]
    port: int
    device: str  # "auto" | "cuda:0" | "mps" | "cpu" | ...
    weights_dir: Path
    data_dir: Path
    enable_docs: bool  # /docs + /openapi.json + detailed /health (dev only)
    # Load SD-Turbo for the Course 3 diffusion station's live "type any prompt"
    # path. Off by default: it needs the `gpu` extra (diffusers) and ~2-4 GB of
    # extra VRAM, and the station is fully usable on its shipped presets without
    # it. Flip CAMP_ENABLE_DIFFUSION=1 on a GPU box that has diffusers installed.
    enable_diffusion: bool
    # Abuse guards (see limits.py). All PER PROCESS; ~4× box-wide under the
    # four-replica serve-multi deploy.
    max_concurrent_infer: int  # hard cap on simultaneous GPU-path requests
    infer_queue: int  # extra requests allowed to wait for a slot before 429
    rate_limit_per_min: int  # forgiving per-key sustained rate (0 = off)
    rate_limit_burst: int  # per-key instantaneous burst
    trusted_proxies: list[str]  # peers whose X-Forwarded-For we trust
    resolved_device: str = field(default="", init=False)  # set by loader at startup


def load_settings() -> Settings:
    # .env sits next to pyproject.toml (server/); systemd loads it via
    # EnvironmentFile instead, so missing is fine.
    server_dir = Path(__file__).resolve().parent.parent
    load_dotenv(server_dir / ".env")

    root = find_repo_root(server_dir)

    token = os.environ.get("CAMP_TOKEN", "").strip()
    if not token or token == "change-me":
        raise SystemExit(
            "camp-server: CAMP_TOKEN is unset (or still 'change-me'). It now "
            "signs the session cookies (app/auth.py) and must be a strong, "
            "server-only secret shared across replicas. Set it in server/.env."
        )

    staff_password = os.environ.get("STAFF_PASSWORD", "").strip()
    if not staff_password or staff_password == "change-me":
        raise SystemExit(
            "camp-server: STAFF_PASSWORD is unset (or still 'change-me'). "
            "Staff sessions are minted from it (roster.py); refusing to serve "
            "without one. Set it in server/.env."
        )

    admin_password = os.environ.get("ADMIN_PASSWORD", "").strip()
    if not admin_password or admin_password == "change-me":
        raise SystemExit(
            "camp-server: ADMIN_PASSWORD is unset (or still 'change-me'). "
            "It gates /admin/usage; refusing to serve without one. "
            "Set it in server/.env."
        )

    origins = [
        o.strip()
        for o in os.environ.get("ALLOWED_ORIGINS", "http://localhost:5173").split(",")
        if o.strip()
    ]
    if "*" in origins:
        raise SystemExit("camp-server: ALLOWED_ORIGINS must not contain '*'.")

    weights = os.environ.get("WEIGHTS_DIR", "").strip()
    data = os.environ.get("DATA_DIR", "").strip()

    proxies = [
        p.strip()
        for p in os.environ.get("TRUSTED_PROXIES", "127.0.0.1,::1").split(",")
        if p.strip()
    ]

    students_csv = os.environ.get("STUDENTS_CSV", "").strip()
    groups_csv = os.environ.get("GROUPS_CSV", "").strip()
    usage_dir = os.environ.get("USAGE_DIR", "").strip()

    # Optional by design: without it 隊輔 simply cannot log in. "change-me"
    # is treated as unset so the example file's value can never be a password.
    mentor_password = os.environ.get("MENTOR_PASSWORD", "").strip()
    if mentor_password == "change-me":
        mentor_password = ""

    return Settings(
        camp_token=token,
        staff_password=staff_password,
        admin_password=admin_password,
        mentor_password=mentor_password,
        # Roster + usage live outside git: the CSV is PII, the logs are runtime
        # state. Defaults keep the single-.env-per-box convention.
        students_csv=Path(students_csv) if students_csv else root / "students-bd.csv",
        groups_csv=Path(groups_csv) if groups_csv else root / "student-group-id.csv",
        usage_dir=Path(usage_dir) if usage_dir else server_dir / "usage",
        # Short by design: a session is a convenience for the class period, not a
        # long-lived credential. Daily password rotation gates new logins on top.
        session_ttl_hours=_env_int("SESSION_TTL_HOURS", 8),
        # Production is https (see README mixed-content note): Secure + SameSite=
        # None lets the cookie ride cross-origin fetches to the funnel host. Flip
        # COOKIE_SECURE=0 ONLY for same-site http localhost dev (→ SameSite=Lax).
        cookie_secure=_env_flag("COOKIE_SECURE", True),
        allowed_origins=origins,
        port=int(os.environ.get("PORT", "8300")),
        device=os.environ.get("DEVICE", "auto").strip() or "auto",
        weights_dir=Path(weights) if weights else root / "precompute" / "artifacts",
        data_dir=(
            Path(data)
            if data
            else root / "apps" / "course2" / "public" / "data" / "course2"
        ),
        # Docs/schema off by default; flip ENABLE_DOCS=1 for local API browsing.
        enable_docs=_env_flag("ENABLE_DOCS", False),
        # Diffusion live path off by default (see the field comment).
        enable_diffusion=_env_flag("CAMP_ENABLE_DIFFUSION", False),
        # Concurrency cap is the real GPU protection; keep it modest per process.
        max_concurrent_infer=_env_int("MAX_CONCURRENT_INFER", 6),
        infer_queue=_env_int("INFER_QUEUE", 12),
        # Rate limit is a deliberately forgiving last resort (see limits.py).
        rate_limit_per_min=_env_int("RATE_LIMIT_PER_MIN", 600),
        rate_limit_burst=_env_int("RATE_LIMIT_BURST", 120),
        trusted_proxies=proxies,
    )


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        raise SystemExit(f"camp-server: {name} must be an integer, got {raw!r}")


def _env_flag(name: str, default: bool) -> bool:
    raw = os.environ.get(name, "").strip().lower()
    if not raw:
        return default
    return raw in {"1", "true", "yes", "on"}


def resolve_device(requested: str) -> str:
    """`auto` → best available (cuda:0 → mps → cpu); anything else passes
    through verbatim. One process, one device — the models are tiny, so extra
    GPUs (the V100 box has 4) deliberately buy nothing."""
    import torch

    if requested != "auto":
        return requested
    if torch.cuda.is_available():
        return "cuda:0"
    if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
        return "mps"
    return "cpu"
