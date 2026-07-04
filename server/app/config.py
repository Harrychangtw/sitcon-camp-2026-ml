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
    camp_token: str
    allowed_origins: list[str]
    port: int
    device: str  # "auto" | "cuda:0" | "mps" | "cpu" | ...
    weights_dir: Path
    data_dir: Path
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
            "camp-server: CAMP_TOKEN is unset (or still 'change-me'). The box "
            "may have a public IP — refusing to serve an open inference "
            "endpoint. Set a strong secret in server/.env."
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

    return Settings(
        camp_token=token,
        allowed_origins=origins,
        port=int(os.environ.get("PORT", "8300")),
        device=os.environ.get("DEVICE", "auto").strip() or "auto",
        weights_dir=Path(weights) if weights else root / "precompute" / "artifacts",
        data_dir=(
            Path(data)
            if data
            else root / "apps" / "course2" / "public" / "data" / "course2"
        ),
    )


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
