"""`camp-precompute` CLI.

For now it has a single subcommand, `make-data`, which writes a hello
manifest.json into apps/course2/public/data/course2/. As the real pipeline grows,
add subcommands here (e.g. `train-rnn`, `export-onnx`) that drop their artifacts
into the same per-course public/data folder.
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

COURSE = "course2"
MANIFEST_VERSION = 1


def find_repo_root(start: Path) -> Path:
    """Walk up from `start` to the directory containing pnpm-workspace.yaml."""
    for d in (start, *start.parents):
        if (d / "pnpm-workspace.yaml").exists():
            return d
    raise SystemExit(
        f"camp-precompute: could not find repo root (no pnpm-workspace.yaml above {start})"
    )


def default_out_dir() -> Path:
    root = find_repo_root(Path.cwd())
    return root / "apps" / "course2" / "public" / "data" / COURSE


def make_data(out_dir: Path) -> Path:
    """Write the hello manifest.json that @camp/data.loadManifest() reads."""
    out_dir.mkdir(parents=True, exist_ok=True)

    # Touch numpy so the dependency is real and the pattern (compute → export)
    # is visible. The real pipeline does the heavy lifting here.
    sample = np.linspace(0.0, 1.0, num=5)

    manifest = {
        "course": COURSE,
        "version": MANIFEST_VERSION,
        "generator": "camp-precompute make-data",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "note": "hello from camp-precompute — replace with real artifacts",
        "sample": [round(float(x), 4) for x in sample],
        "artifacts": [],
    }

    path = out_dir / "manifest.json"
    path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return path


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="camp-precompute",
        description="SITCON Camp 2026 ML precompute pipeline.",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p_make = sub.add_parser(
        "make-data", help="Write the hello manifest.json for Course 2."
    )
    p_make.add_argument(
        "--out",
        type=Path,
        default=None,
        help="Output directory (defaults to apps/course2/public/data/course2).",
    )

    args = parser.parse_args(argv)

    if args.command == "make-data":
        out_dir = args.out or default_out_dir()
        path = make_data(out_dir)
        print(f"wrote {path}")
        return 0

    parser.error(f"unknown command: {args.command}")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
