"""Course 3 *skyfall* station — 「衛星長出城市」.

The pedagogy: Skyfall-GS (arXiv 2510.15869) reconstructs an explorable
city-block 3D Gaussian Splatting scene from multi-view SATELLITE photos in two
stages. Stage 1 (plain 3DGS optimization) gets the geometry right but melts at
street level, because no satellite ever saw the scene from there. Stage 2 has a
diffusion model (FLUX.1-dev) hallucinate close-up texture and retrains the
splats on it. The station's one knob is a 補完前/補完後 A/B toggle: the student
flies low over a real city block and SEES which detail the data gave and which
detail the model imagined.

The golden rule holds: the browser renders splats (sorting + drawing = playback,
same category as ONNX inference); it never optimizes them. And this station
needs no GPU here at all for the "after" side — the authors published all final
fused PLY scenes (https://huggingface.co/jayinnn/Skyfall-GS-ply, 158-324 MB
each). This module downloads, prunes, and converts them to small antimatter15
`.splat` files (32 B/splat) the web viewer streams. Only the Stage-1 "before"
variants need a GPU run → prompts/server-runs/skyfall-precompute.md, which
funnels back through the SAME convert path (`skyfall --from-ply`).

THREE entry points share this module:
- `write_sample` (`camp-precompute skyfall-sample`, no network): a procedural
  toy-city scene pair (sharp "after" + deliberately melted "before") so the
  full UI — toggle included — is buildable and testable offline. Marked
  `"sample": true`; the station renders a 示意資料 badge.
- `write_scenes` (`camp-precompute skyfall --scenes …`, network, no GPU):
  downloads the published fused PLYs, prunes to a splat budget, converts.
- `write_from_ply` (`camp-precompute skyfall --from-ply …`): converts an
  arbitrary local fused PLY (e.g. the runbook's Stage-1 output) into a named
  variant of a scene, with the same prune/convert code path.

Shipping format — antimatter15 `.splat`: per splat, position 3×f32, LINEAR
scale 3×f32, RGBA 4×u8, rotation quat 4×u8 as (q/|q|)*128+128 with byte 0 = w.
Exactly what @mkkellogg/gaussian-splats-3d's SplatParser reads. SH>0 is
dropped; upstream recommends viewing at SH degree 1, so the loss is mild.

`.splat` files are binary → gitignored by pattern
(`public/data/**/skyfall/**/*.splat`), force-added deliberately, like the
diffusion station's webp frames. Only the small scenes.json is committed
normally.
"""

from __future__ import annotations

import json
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

STATION = "skyfall"

# Where the published fused scenes live. Files are `<sceneId>_final.ply`.
HF_BASE = "https://huggingface.co/jayinnn/Skyfall-GS-ply/resolve/main"

# SH band-0 constant: color = 0.5 + SH_C0 * f_dc.
SH_C0 = 0.28209479177387814

# The scene's up vector — Skyfall-GS scenes are z-up (README viewer settings).
UP = (0.0, 0.0, 1.0)

# Prune defaults (all tunable via CLI flags). ~800 k splats × 32 B ≈ 26 MB per
# variant. Tested at 450 k: street-level facades melt (the small crisp splats
# are exactly what close-up detail is made of), which would fake the very
# Stage-1 look the A/B toggle is supposed to CONTRAST against — so the after
# variants get the bigger budget and the runbook bakes the before variants
# smaller (they are supposed to look melted).
DEFAULT_MAX_SPLATS = 800_000
DEFAULT_MIN_OPACITY = 0.04  # sigmoid-space; kills near-invisible dust
DEFAULT_MAX_SCALE_FRAC = 0.05  # of the scene diagonal; kills degenerate blobs
# Importance = opacity × (projected area)^SIZE_WEIGHT. 1.0 ranks by total
# image contribution — but that keeps big background blobs and throws away the
# SMALL crisp splats that carry street-level detail (the whole point of this
# station). A mild size weight keeps detail while still preferring visible
# splats over transparent dust.
DEFAULT_SIZE_WEIGHT = 0.3


@dataclass(frozen=True)
class SkyfallScene:
    id: str
    label: str  # 中文 display name
    note: str  # one-line 中文 說明
    # Hand-picked 街景 pose (position/lookAt), overriding the automatic
    # open-spot search. Chosen by sweeping candidate viewpoints and eyeballing
    # renders — the auto search can't tell "street canyon with a view" from
    # "inside a tree". None → use the computed pose.
    street: dict | None = None


# The published scenes this station knows how to fetch. Shipped: JAX_004
# (smallest source, 158 MB), NYC_004 (a second city for variety), plus the two
# densest blocks JAX_164 + NYC_219 — self-hosted deploy, so the old 80 MB
# splat budget no longer binds.
SCENES: list[SkyfallScene] = [
    SkyfallScene(
        id="JAX_004",
        label="傑克遜維爾",
        note="美國佛州 Jacksonville 的真實街區，從衛星照片重建",
        # Rooftop-height drone pass over the houses — pedestrian height in
        # this wooded suburb reads as tree soup at any angle.
        street={
            "position": [-112.0, 56.0, 59.0],
            "lookAt": [221.0, 56.0, 29.0],
        },
    ),
    SkyfallScene(
        id="NYC_004",
        label="紐約",
        note="美國紐約市的真實街區，從衛星照片重建",
        # A street canyon: brick facades both sides, towers down the block.
        street={
            "position": [25.0, 165.0, -21.0],
            "lookAt": [-92.0, -8.0, -16.0],
        },
    ),
    SkyfallScene(
        id="JAX_164",
        label="傑克遜維爾 164",
        note="Jacksonville 最密的街區（市中心），從衛星照片重建",
    ),
    SkyfallScene(
        id="NYC_219",
        label="紐約 219",
        note="紐約市最密的街區，從衛星照片重建",
    ),
    SkyfallScene(
        id="JAX_214",
        label="傑克遜維爾 214",
        note="Jacksonville 的另一個街區，從衛星照片重建",
    ),
]

SAMPLE_SCENE = SkyfallScene(
    id="toy-city",
    label="示意小鎮",
    note="程式合成的示意場景，不是真的衛星重建",
)


# --- gaussian cloud (canonical in-memory form) -----------------------------------
#
# dict of numpy arrays, all row-aligned:
#   pos   f32 [n,3]   world position
#   scale f32 [n,3]   LINEAR scale (already exp'd)
#   rgb   f32 [n,3]   0..255 display color (SH band 0 already applied)
#   alpha f32 [n]     0..1 opacity (already sigmoided)
#   rot   f32 [n,4]   unit quaternion, (w, x, y, z)


def _sigmoid(x: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-x))


def read_gaussian_ply(path: Path) -> dict[str, np.ndarray]:
    """Read a standard 3DGS PLY (positions, f_dc, opacity logit, log scales,
    unnormalized rot) into the canonical linear-space cloud. SH rest bands are
    dropped — the shipping format is SH degree 0."""
    from plyfile import PlyData

    ply = PlyData.read(str(path))
    v = ply["vertex"]
    names = set(v.data.dtype.names or ())
    needed = {"x", "y", "z", "opacity"} | {f"f_dc_{i}" for i in range(3)}
    needed |= {f"scale_{i}" for i in range(3)} | {f"rot_{i}" for i in range(4)}
    missing = sorted(needed - names)
    if missing:
        raise SystemExit(
            f"skyfall: {path} is not a 3DGS ply (missing properties: {missing})"
        )

    pos = np.stack([v["x"], v["y"], v["z"]], axis=1).astype(np.float32)
    log_scale = np.stack([v[f"scale_{i}"] for i in range(3)], axis=1).astype(np.float32)
    rot = np.stack([v[f"rot_{i}"] for i in range(4)], axis=1).astype(np.float32)
    sh0 = np.stack([v[f"f_dc_{i}"] for i in range(3)], axis=1).astype(np.float32)
    opacity = np.asarray(v["opacity"], dtype=np.float32)

    norm = np.linalg.norm(rot, axis=1, keepdims=True)
    norm[norm == 0] = 1.0
    return {
        "pos": pos,
        "scale": np.exp(log_scale),
        "rgb": np.clip((0.5 + SH_C0 * sh0) * 255.0, 0.0, 255.0),
        "alpha": _sigmoid(opacity),
        "rot": rot / norm,
    }


def prune(
    g: dict[str, np.ndarray],
    max_splats: int,
    min_opacity: float,
    max_scale_frac: float,
    size_weight: float = DEFAULT_SIZE_WEIGHT,
) -> dict[str, np.ndarray]:
    """Drop low-opacity / degenerate / fly-away gaussians, then keep the top-N
    by an opacity×projected-area importance rank, sorted most-important first."""
    pos, scale, alpha = g["pos"], g["scale"], g["alpha"]

    finite = (
        np.isfinite(pos).all(axis=1)
        & np.isfinite(scale).all(axis=1)
        & np.isfinite(alpha)
        & np.isfinite(g["rot"]).all(axis=1)
    )
    keep = finite & (alpha >= min_opacity)
    if not keep.any():
        raise SystemExit(
            f"skyfall: no gaussians survive --min-opacity {min_opacity} "
            "(the source's opacities are all below it) — lower the threshold."
        )

    # Fly-away floaters: a robust per-axis box (0.2/99.8 percentiles of the
    # opaque-enough splats, padded 15%) — satellite scenes grow a halo of
    # sparse junk far outside the block.
    core = pos[keep]
    lo, hi = np.percentile(core, [0.2, 99.8], axis=0)
    pad = 0.15 * (hi - lo)
    lo, hi = lo - pad, hi + pad
    keep &= ((pos >= lo) & (pos <= hi)).all(axis=1)

    # Degenerate mega-blobs: anything wider than a fraction of the scene
    # diagonal is reconstruction junk, not content.
    diag = float(np.linalg.norm(hi - lo))
    keep &= scale.max(axis=1) <= max_scale_frac * diag

    idx = np.flatnonzero(keep)
    if idx.size == 0:
        raise SystemExit(
            "skyfall: every gaussian was pruned as a floater/mega-blob — "
            "check --max-scale-frac (and that the PLY is a fused 3DGS scene)."
        )
    # Importance ≈ opacity × (largest projected area)^size_weight, area from
    # the two biggest linear scales. The damped size term keeps the small
    # crisp splats that carry close-up detail (see DEFAULT_SIZE_WEIGHT).
    s_sorted = np.sort(scale[idx], axis=1)
    importance = alpha[idx] * (s_sorted[:, 2] * s_sorted[:, 1]) ** size_weight
    order = np.argsort(-importance)
    idx = idx[order[:max_splats]]

    return {k: v[idx] for k, v in g.items()}


def write_splat(g: dict[str, np.ndarray], path: Path) -> int:
    """Write the antimatter15 .splat layout (32 B/splat) and return the byte
    size. Matches @mkkellogg/gaussian-splats-3d's SplatParser: position 3×f32,
    linear scale 3×f32, RGBA 4×u8, rot 4×u8 = (q/|q|)*128+128 with byte 0 = w."""
    n = len(g["alpha"])
    rec = np.zeros(
        n,
        dtype=[
            ("pos", "<f4", 3),
            ("scale", "<f4", 3),
            ("rgba", "u1", 4),
            ("rot", "u1", 4),
        ],
    )
    rec["pos"] = g["pos"]
    rec["scale"] = g["scale"]
    rec["rgba"][:, :3] = np.clip(g["rgb"], 0, 255).astype(np.uint8)
    rec["rgba"][:, 3] = np.clip(g["alpha"] * 255.0, 0, 255).astype(np.uint8)
    rot = g["rot"] / np.linalg.norm(g["rot"], axis=1, keepdims=True)
    rec["rot"] = np.clip(rot * 128.0 + 128.0, 0, 255).astype(np.uint8)

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(rec.tobytes())
    return path.stat().st_size


# --- camera poses -----------------------------------------------------------------


def scene_geometry(g: dict[str, np.ndarray]) -> dict:
    """Robust bounds / ground height / flight box, computed from the PRUNED
    cloud so the poses frame what actually ships."""
    pos = g["pos"]
    lo, hi = np.percentile(pos, [1.0, 99.0], axis=0)
    center = (lo + hi) / 2.0
    extent = hi - lo
    ground_z = float(np.percentile(pos[:, 2], 3.0))
    diag_h = float(np.hypot(extent[0], extent[1]))
    # Where the CONTENT is: the centroid of splats in the building-height band
    # above ground. The bbox center can sit over empty ground / water; poses
    # anchored here point the camera at the built-up part of the block.
    band = (pos[:, 2] > ground_z + 0.008 * diag_h) & (
        pos[:, 2] < ground_z + 0.06 * diag_h
    )
    focus_xy = pos[band][:, :2].mean(axis=0) if band.any() else center[:2]
    street = _street_pose(pos, ground_z, diag_h, lo, hi, band)
    # Flight clamp: generous sideways, extra headroom upward, a little below
    # ground so imperfect ground estimates never trap the camera.
    fly_lo = [
        float(lo[0] - 0.3 * extent[0]),
        float(lo[1] - 0.3 * extent[1]),
        float(ground_z - 0.02 * diag_h),
    ]
    fly_hi = [
        float(hi[0] + 0.3 * extent[0]),
        float(hi[1] + 0.3 * extent[1]),
        float(ground_z + 1.2 * diag_h),
    ]
    return {
        "center": [float(c) for c in center],
        "focus": [float(focus_xy[0]), float(focus_xy[1])],
        "street": street,
        "groundZ": ground_z,
        "diag": diag_h,
        "bounds": [fly_lo, fly_hi],
    }


def _street_pose(
    pos: np.ndarray,
    ground_z: float,
    diag: float,
    lo: np.ndarray,
    hi: np.ndarray,
    band: np.ndarray,
) -> dict:
    """Pick the street viewpoint EMPIRICALLY: a spot that is OPEN at head
    height (so the camera isn't parked inside a tree or a wall) but SEES a lot
    of built-up content nearby. Grid the scene, score every central cell by
    (clutter at eye level, content within view radius), stand in the best open
    cell and gaze at the surrounding content's centroid."""
    eye_h = ground_z + 0.018 * diag
    cell = 0.02 * diag
    nx = max(8, int((hi[0] - lo[0]) / cell))
    ny = max(8, int((hi[1] - lo[1]) / cell))
    xedges = np.linspace(lo[0], hi[0], nx + 1)
    yedges = np.linspace(lo[1], hi[1], ny + 1)

    # Clutter: splats around head height — standing where these are dense
    # means standing inside foliage / a building.
    head = (pos[:, 2] > ground_z + 0.003 * diag) & (pos[:, 2] < eye_h + 0.02 * diag)
    clutter, _, _ = np.histogram2d(
        pos[head, 0], pos[head, 1], bins=(xedges, yedges)
    )
    # Content: the building-height band — what the camera should be looking at.
    content, _, _ = np.histogram2d(
        pos[band, 0], pos[band, 1], bins=(xedges, yedges)
    )

    # View score per cell: content mass within ~0.12·diag, via a box blur.
    r = max(1, int(0.12 * diag / cell))
    kernel_sum = np.cumsum(np.cumsum(content, axis=0), axis=1)
    padded = np.pad(kernel_sum, ((1, 0), (1, 0)))

    def box(i0: int, j0: int, i1: int, j1: int) -> float:
        return float(
            padded[i1 + 1, j1 + 1]
            - padded[i0, j1 + 1]
            - padded[i1 + 1, j0]
            + padded[i0, j0]
        )

    # Candidates: the central 20-80% region, open at eye level.
    ci0, ci1 = int(nx * 0.2), int(nx * 0.8)
    cj0, cj1 = int(ny * 0.2), int(ny * 0.8)
    central = clutter[ci0:ci1, cj0:cj1]
    open_cut = max(4.0, float(np.percentile(central, 30)))
    best, best_score = None, -1.0
    for i in range(ci0, ci1):
        for j in range(cj0, cj1):
            if clutter[i, j] > open_cut:
                continue
            score = box(max(0, i - r), max(0, j - r), min(nx - 1, i + r), min(ny - 1, j + r))
            if score > best_score:
                best, best_score = (i, j), score
    if best is None:  # degenerate scene — fall back to the band centroid
        fx, fy = (
            pos[band][:, :2].mean(axis=0) if band.any() else ((lo + hi) / 2)[:2]
        )
        return {"position": [float(fx), float(fy), eye_h], "lookAt": [float(fx) + 1.0, float(fy), eye_h]}

    bi, bj = best
    ex = float((xedges[bi] + xedges[bi + 1]) / 2)
    ey = float((yedges[bj] + yedges[bj + 1]) / 2)
    # Gaze: the content centroid within the view radius (not the global one),
    # so the camera looks at the buildings it actually stands among.
    near = band.copy()
    near &= (np.abs(pos[:, 0] - ex) < r * cell) & (np.abs(pos[:, 1] - ey) < r * cell)
    if near.any():
        tx, ty = pos[near][:, :2].mean(axis=0)
    else:
        tx, ty = ex + cell, ey
    # Degenerate gaze (target on top of the eye) → nudge east.
    if abs(tx - ex) + abs(ty - ey) < cell * 0.5:
        tx = ex + cell * 2
    # Standoff: back the eye away from the gaze target so the camera never
    # opens nose-to-facade — the contrast needs a readable middle distance.
    dx, dy = float(ex - tx), float(ey - ty)
    dist = float(np.hypot(dx, dy))
    standoff = 0.07 * diag
    if 0 < dist < standoff:
        ex = float(tx + dx / dist * standoff)
        ey = float(ty + dy / dist * standoff)
    return {
        "position": [ex, ey, eye_h],
        "lookAt": [float(tx), float(ty), eye_h],
    }


def _poses_for(geom: dict, meta: SkyfallScene | None) -> list[dict]:
    """Poses for one scene: the computed set, with the catalog's hand-picked
    街景 override (when present) winning over the automatic search. Every bake
    entry point MUST build poses through here, or the eyeballed pose silently
    reverts on a fresh-catalog rebake."""
    poses = make_poses(geom)
    if meta and meta.street:
        for p in poses:
            if p["id"] == "street":
                p.update(meta.street)
    return poses


def make_poses(geom: dict) -> list[dict]:
    """Three named viewpoints that tell the story: 俯瞰 (the satellite's honest
    view), 半空 (the transition), 街景 (where the A/B contrast lives). Street
    and oblique aim at the content centroid, not the (possibly empty) bbox
    center."""
    cx, cy, _ = geom["center"]
    fx, fy = geom.get("focus", (cx, cy))
    gz, diag = geom["groundZ"], geom["diag"]
    return [
        {
            "id": "overhead",
            "label": "俯瞰",
            # Slightly tilted off straight-down so lookAt never degenerates
            # against the z up-vector.
            "position": [cx, cy - 0.18 * diag, gz + 0.85 * diag],
            "lookAt": [cx, cy, gz],
        },
        {
            "id": "oblique",
            "label": "半空",
            "position": [fx - 0.5 * diag, fy - 0.5 * diag, gz + 0.32 * diag],
            "lookAt": [fx, fy, gz + 0.02 * diag],
        },
        {
            "id": "street",
            "label": "街景視角",
            # Empirically chosen: an OPEN spot at eye height with the most
            # built-up content in view (see _street_pose).
            "position": geom["street"]["position"],
            "lookAt": geom["street"]["lookAt"],
        },
    ]


# --- scenes.json / manifest bookkeeping --------------------------------------------


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _scenes_path(out_dir: Path) -> Path:
    return out_dir / STATION / "scenes.json"


def _load_payload(out_dir: Path) -> dict:
    path = _scenes_path(out_dir)
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return {
        "station": STATION,
        "source": "Skyfall-GS, 李杰穎 Jie-Ying Lee et al. (arXiv 2510.15869; "
        "github.com/jayin92/Skyfall-GS, Apache-2.0), fused scenes from "
        "huggingface.co/jayinnn/Skyfall-GS-ply",
        "format": "splat",
        "up": list(UP),
        "scenes": [],
    }


def _scene_rank(scene_id: str) -> int:
    for i, s in enumerate(SCENES):
        if s.id == scene_id:
            return i
    return len(SCENES)  # sample / unknown scenes sort last


def _upsert_scene(payload: dict, entry: dict) -> None:
    scenes = [s for s in payload.get("scenes", []) if s.get("id") != entry["id"]]
    scenes.append(entry)
    scenes.sort(key=lambda s: (_scene_rank(s["id"]), s["id"]))
    payload["scenes"] = scenes


def _write_payload(out_dir: Path, payload: dict, generator: str) -> Path:
    from .cli import upsert_manifest_artifact

    payload["generator"] = generator
    payload["generatedAt"] = _now()
    path = _scenes_path(out_dir)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    upsert_manifest_artifact(
        out_dir,
        {
            "id": "skyfall-scenes",
            "kind": "json",
            "path": f"{STATION}/scenes.json",
            "station": STATION,
            "bytes": path.stat().st_size,
            "description": (
                "Scene catalog for the skyfall station: per-scene 中文 labels, "
                "camera poses (俯瞰/半空/街景), flight bounds, and the byte "
                "sizes of the pruned .splat variants (補完後 = published "
                "Skyfall-GS fused scene; 補完前 = Stage-1-only, baked via the "
                "runbook). The .splat binaries are gitignored by pattern and "
                "force-added; the browser only renders them."
            ),
        },
    )
    return path


def _variant_entry(rel_path: str, size: int, count: int, generator: str) -> dict:
    return {
        "path": rel_path,
        "bytes": size,
        "splats": count,
        "generator": generator,
        "generatedAt": _now(),
    }


def _bake_variant(
    g: dict[str, np.ndarray],
    out_dir: Path,
    scene_id: str,
    variant: str,
    max_splats: int,
    min_opacity: float,
    max_scale_frac: float,
    size_weight: float = DEFAULT_SIZE_WEIGHT,
) -> tuple[dict[str, np.ndarray], str, int]:
    """Prune + convert one cloud → skyfall/<scene>/<variant>.splat. Returns the
    pruned cloud (for pose computation) + the rel path + byte size."""
    before_n = len(g["alpha"])
    g = prune(g, max_splats, min_opacity, max_scale_frac, size_weight)
    rel = f"{STATION}/{scene_id}/{variant}.splat"
    size = write_splat(g, out_dir / rel)
    print(
        f"  {scene_id}/{variant}: {before_n:,} → {len(g['alpha']):,} splats, "
        f"{size / 1e6:.1f} MB"
    )
    return g, rel, size


# --- real scenes: download + convert ------------------------------------------------


def _download(scene_id: str, cache_dir: Path) -> Path:
    """Fetch <sceneId>_final.ply from HF into the (gitignored) cache dir; skip
    if already there. These are 158-324 MB — never committed."""
    cache_dir.mkdir(parents=True, exist_ok=True)
    dest = cache_dir / f"{scene_id}_final.ply"
    if dest.exists() and dest.stat().st_size > 0:
        print(f"  {scene_id}: using cached {dest}")
        return dest
    url = f"{HF_BASE}/{scene_id}_final.ply"
    print(f"  {scene_id}: downloading {url}")
    tmp = dest.with_suffix(".part")

    def _hook(blocks: int, block_size: int, total: int) -> None:
        done = blocks * block_size
        if total > 0 and blocks % 256 == 0:
            print(f"    {done / 1e6:.0f} / {total / 1e6:.0f} MB", end="\r")

    urllib.request.urlretrieve(url, tmp, reporthook=_hook)
    print()
    tmp.rename(dest)
    return dest


def write_scenes(
    out_dir: Path,
    scene_ids: list[str],
    cache_dir: Path,
    max_splats: int = DEFAULT_MAX_SPLATS,
    min_opacity: float = DEFAULT_MIN_OPACITY,
    max_scale_frac: float = DEFAULT_MAX_SCALE_FRAC,
    size_weight: float = DEFAULT_SIZE_WEIGHT,
) -> Path:
    """Download the published fused PLYs and bake their 補完後 (`after`)
    variants. Preserves any existing `before` variants and other scenes."""
    catalog = {s.id: s for s in SCENES}
    unknown = [sid for sid in scene_ids if sid not in catalog]
    if unknown:
        known = ", ".join(catalog)
        raise SystemExit(f"skyfall: unknown scene(s) {unknown}; known: {known}")

    payload = _load_payload(out_dir)
    existing = {s["id"]: s for s in payload.get("scenes", [])}
    generator = "camp-precompute skyfall"

    for sid in scene_ids:
        ply_path = _download(sid, cache_dir)
        g = read_gaussian_ply(ply_path)
        g, rel, size = _bake_variant(
            g, out_dir, sid, "after", max_splats, min_opacity, max_scale_frac,
            size_weight,
        )
        geom = scene_geometry(g)
        old = existing.get(sid, {})
        variants = dict(old.get("variants") or {})
        variants["after"] = _variant_entry(rel, size, len(g["alpha"]), generator)
        meta = catalog[sid]
        poses = _poses_for(geom, meta)
        _upsert_scene(
            payload,
            {
                "id": sid,
                "label": meta.label,
                "note": meta.note,
                "sample": False,
                "groundZ": geom["groundZ"],
                "diag": geom["diag"],
                "bounds": geom["bounds"],
                "poses": poses,
                "initialPose": "oblique",
                "variants": variants,
            },
        )

    return _write_payload(out_dir, payload, generator)


def write_from_ply(
    out_dir: Path,
    ply_path: Path,
    scene_id: str,
    variant: str,
    max_splats: int = DEFAULT_MAX_SPLATS,
    min_opacity: float = DEFAULT_MIN_OPACITY,
    max_scale_frac: float = DEFAULT_MAX_SCALE_FRAC,
    size_weight: float = DEFAULT_SIZE_WEIGHT,
) -> Path:
    """Convert an arbitrary local fused PLY (the runbook's Stage-1 output) into
    a named variant, through the same prune/convert path. Keeps the scene's
    existing poses when present, so 補完前/補完後 share the exact camera frame."""
    generator = "camp-precompute skyfall --from-ply"
    g = read_gaussian_ply(ply_path)
    g, rel, size = _bake_variant(
        g, out_dir, scene_id, variant, max_splats, min_opacity, max_scale_frac,
        size_weight,
    )

    payload = _load_payload(out_dir)
    existing = {s["id"]: s for s in payload.get("scenes", [])}
    old = existing.get(scene_id)
    if old is None:
        # First variant of a scene the catalog may not know — compute poses
        # from this cloud so the entry is self-sufficient.
        geom = scene_geometry(g)
        meta = next((s for s in SCENES if s.id == scene_id), None)
        entry = {
            "id": scene_id,
            "label": meta.label if meta else scene_id,
            "note": meta.note if meta else "",
            "sample": False,
            "groundZ": geom["groundZ"],
            "diag": geom["diag"],
            "bounds": geom["bounds"],
            "poses": _poses_for(geom, meta),
            "initialPose": "oblique",
            "variants": {},
        }
    else:
        entry = old
    variants = dict(entry.get("variants") or {})
    variants[variant] = _variant_entry(rel, size, len(g["alpha"]), generator)
    entry["variants"] = variants
    _upsert_scene(payload, entry)

    return _write_payload(out_dir, payload, generator)


# --- the no-network procedural sample pair ------------------------------------------


def _cat(parts: list[dict[str, np.ndarray]]) -> dict[str, np.ndarray]:
    return {k: np.concatenate([p[k] for p in parts], axis=0) for k in parts[0]}


def _blob(
    pos: np.ndarray, scale: np.ndarray, rgb: np.ndarray, alpha: np.ndarray
) -> dict[str, np.ndarray]:
    n = len(alpha)
    rot = np.zeros((n, 4), dtype=np.float32)
    rot[:, 0] = 1.0  # identity (w=1)
    return {
        "pos": pos.astype(np.float32),
        "scale": scale.astype(np.float32),
        "rgb": rgb.astype(np.float32),
        "alpha": alpha.astype(np.float32),
        "rot": rot,
    }


def _box_shell(
    rng: np.random.Generator,
    x0: float,
    y0: float,
    w: float,
    d: float,
    h: float,
    color: np.ndarray,
    spacing: float,
) -> dict[str, np.ndarray]:
    """Surface-sample a building: 4 walls + roof, thin gaussians lying in each
    face, colors banded by floor and lit per-face so the box reads as 3D."""
    parts: list[dict[str, np.ndarray]] = []
    faces = [
        # (axis fixed, at, u-axis, u-range, v-axis(z), light)
        (1, y0, 0, (x0, x0 + w), 0.82),  # south wall
        (1, y0 + d, 0, (x0, x0 + w), 1.0),  # north wall
        (0, x0, 1, (y0, y0 + d), 0.72),  # west wall
        (0, x0 + w, 1, (y0, y0 + d), 0.92),  # east wall
    ]
    floor_h = 4.0
    for fixed_axis, at, u_axis, (u0, u1), light in faces:
        nu = max(2, int((u1 - u0) / spacing))
        nv = max(2, int(h / spacing))
        u = np.linspace(u0 + spacing / 2, u1 - spacing / 2, nu)
        v = np.linspace(spacing / 2, h - spacing / 2, nv)
        uu, vv = np.meshgrid(u, v)
        n = uu.size
        pos = np.zeros((n, 3), np.float32)
        pos[:, fixed_axis] = at
        pos[:, u_axis] = uu.ravel()
        pos[:, 2] = vv.ravel()
        pos += rng.normal(0, 0.12, pos.shape)
        scale = np.full((n, 3), spacing * 0.62, np.float32)
        scale[:, fixed_axis] = 0.25  # thin along the face normal
        rgb = np.tile(color * light, (n, 1))
        # Darker horizontal bands every "floor" → windows/floors suggestion.
        band = (vv.ravel() % floor_h) < 0.35 * floor_h
        rgb[band] *= 0.55
        parts.append(_blob(pos, scale, rgb, np.full(n, 0.96, np.float32)))
    # Roof.
    nu = max(2, int(w / spacing))
    nv = max(2, int(d / spacing))
    u = np.linspace(x0 + spacing / 2, x0 + w - spacing / 2, nu)
    v = np.linspace(y0 + spacing / 2, y0 + d - spacing / 2, nv)
    uu, vv = np.meshgrid(u, v)
    n = uu.size
    pos = np.stack([uu.ravel(), vv.ravel(), np.full(n, h, np.float32)], axis=1)
    scale = np.full((n, 3), spacing * 0.62, np.float32)
    scale[:, 2] = 0.25
    rgb = np.tile(color * 0.5 + 40.0, (n, 1))
    parts.append(_blob(pos, scale, rgb, np.full(n, 0.96, np.float32)))
    return _cat(parts)


def build_toy_city(seed: int = 7) -> dict[str, np.ndarray]:
    """A deterministic procedural "city block" of gaussians: dark ground with a
    street grid, colored box buildings, a few tree blobs. ~60 k splats. This is
    a WIRING sample, not a reconstruction — the station badges it 示意資料."""
    rng = np.random.default_rng(seed)
    parts: list[dict[str, np.ndarray]] = []

    n_blocks = 5  # 5×5 city blocks
    block = 64.0
    street = 16.0
    pitch = block + street
    size = n_blocks * pitch + street
    spacing = 3.0

    # Ground: one flat splat lattice; street lanes darker than block interiors.
    ng = int(size / 4.0)
    gx = np.linspace(2.0, size - 2.0, ng)
    gxx, gyy = np.meshgrid(gx, gx)
    n = gxx.size
    pos = np.stack([gxx.ravel(), gyy.ravel(), np.zeros(n, np.float32)], axis=1)
    pos[:, :2] += rng.normal(0, 0.6, (n, 2))
    scale = np.full((n, 3), 3.2, np.float32)
    scale[:, 2] = 0.2
    in_street_x = (pos[:, 0] % pitch) < street
    in_street_y = (pos[:, 1] % pitch) < street
    is_street = in_street_x | in_street_y
    grey = np.where(is_street, 52.0, 84.0).astype(np.float32)
    rgb = np.stack([grey, grey * 1.02, grey * 0.94], axis=1)
    rgb += rng.normal(0, 4.0, rgb.shape)
    parts.append(_blob(pos, scale, rgb, np.full(n, 0.98, np.float32)))

    # Buildings: 1-2 per block, muted facade palette.
    palette = np.array(
        [
            [168, 148, 128],
            [140, 145, 155],
            [176, 166, 142],
            [120, 110, 104],
            [150, 128, 118],
            [130, 138, 128],
        ],
        dtype=np.float32,
    )
    for bi in range(n_blocks):
        for bj in range(n_blocks):
            ox = street + bi * pitch
            oy = street + bj * pitch
            for _ in range(int(rng.integers(1, 3))):
                w = float(rng.uniform(0.32, 0.55)) * block
                d = float(rng.uniform(0.32, 0.55)) * block
                x0 = ox + float(rng.uniform(0.05, 0.9 - w / block)) * block
                y0 = oy + float(rng.uniform(0.05, 0.9 - d / block)) * block
                h = float(rng.uniform(14.0, 62.0))
                color = palette[int(rng.integers(0, len(palette)))].copy()
                color += rng.normal(0, 6.0, 3)
                parts.append(_box_shell(rng, x0, y0, w, d, h, color, spacing))

    # Trees: small green blob clusters on street corners.
    for bi in range(n_blocks + 1):
        for bj in range(n_blocks + 1):
            if rng.random() > 0.45:
                continue
            cx = bi * pitch + street / 2 + float(rng.normal(0, 2.0))
            cy = bj * pitch + street / 2 + float(rng.normal(0, 2.0))
            nt = 14
            pos = np.column_stack(
                [
                    rng.normal(cx, 1.6, nt),
                    rng.normal(cy, 1.6, nt),
                    rng.uniform(2.5, 7.0, nt),
                ]
            )
            scale = rng.uniform(1.0, 2.2, (nt, 3)).astype(np.float32)
            g_col = np.column_stack(
                [
                    rng.uniform(38, 62, nt),
                    rng.uniform(96, 132, nt),
                    rng.uniform(40, 60, nt),
                ]
            )
            parts.append(_blob(pos, scale, g_col, np.full(nt, 0.92, np.float32)))

    return _cat(parts)


def melt(g: dict[str, np.ndarray], seed: int = 11) -> dict[str, np.ndarray]:
    """Degrade the toy city into a fake 補完前: inflate scales, jitter
    positions, wash colors toward grey, thin the cloud — the melted look
    Stage-1-only satellite reconstruction has at street level."""
    rng = np.random.default_rng(seed)
    n = len(g["alpha"])
    keep = rng.random(n) < 0.55
    out = {k: v[keep].copy() for k, v in g.items()}
    m = len(out["alpha"])
    out["pos"] += rng.normal(0, 1.7, (m, 3)).astype(np.float32)
    out["scale"] *= rng.uniform(3.0, 5.5, (m, 1)).astype(np.float32)
    mean = out["rgb"].mean(axis=0, keepdims=True)
    out["rgb"] = 0.45 * out["rgb"] + 0.55 * mean
    out["alpha"] = np.clip(out["alpha"] * 0.85, 0.0, 1.0)
    return out


def write_sample(out_dir: Path) -> Path:
    """Bake the toy-city pair (after + melted before) so the whole station —
    A/B toggle included — runs offline with zero downloads."""
    generator = "camp-precompute skyfall-sample"
    city = build_toy_city()

    payload = _load_payload(out_dir)
    after, rel_after, size_after = _bake_variant(
        city, out_dir, SAMPLE_SCENE.id, "after", 800_000, 0.01, 1.0
    )
    before, rel_before, size_before = _bake_variant(
        melt(city), out_dir, SAMPLE_SCENE.id, "before", 800_000, 0.01, 1.0
    )
    geom = scene_geometry(after)
    _upsert_scene(
        payload,
        {
            "id": SAMPLE_SCENE.id,
            "label": SAMPLE_SCENE.label,
            "note": SAMPLE_SCENE.note,
            "sample": True,
            "groundZ": geom["groundZ"],
            "diag": geom["diag"],
            "bounds": geom["bounds"],
            "poses": make_poses(geom),
            "initialPose": "oblique",
            "variants": {
                "after": _variant_entry(
                    rel_after, size_after, len(after["alpha"]), generator
                ),
                "before": _variant_entry(
                    rel_before, size_before, len(before["alpha"]), generator
                ),
            },
        },
    )
    return _write_payload(out_dir, payload, generator)
