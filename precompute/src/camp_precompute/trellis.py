"""Course 3 *text-to-3d* station — 「文字生 3D」.

The pedagogy: 剛剛在擴散生成圖那站，學生看到 diffusion 從一團雜訊長出一張 2D 圖。
這一站用 Microsoft TRELLIS（MIT，程式碼與權重都開源）把「同一個想法」升一個維度:
打一句話，長出一個能在瀏覽器裡轉的 3D 物件。一顆旋鈕有兩層:
  1. 文字 → 3D:挑一個 prompt chip，物件就長出來，可以繞著看。
  2. 同一句話,不只一種長法:每個 prompt 附兩顆 seed，翻另一顆會從同一句話
     重新長出一個不一樣的物件——把 sampling variance 變得摸得到（呼應擴散站的
     seed grid）。

The golden rule holds: TRELLIS runs AHEAD of time on the GPU box; the browser
only RENDERS the exported gaussians (sorting + drawing = playback, same category
as the skyfall station). Nothing is generated in the browser.

Output format — the SAME antimatter15 `.splat` files the skyfall station streams,
produced by the SAME prune/convert path (`camp_precompute.skyfall`: read the 3DGS
PLY → prune to a splat budget → write 32 B/splat). Objects are tiny next to
Skyfall city blocks, so the object-tuned defaults target ≤ ~2 MB per (prompt,
seed). We import skyfall's helpers rather than copy them — one converter across
stations 04/05.

TWO recipes produce the gaussians (open decision 1; the bake supports both behind
`--recipe`, the default is text):
  - "text": TRELLIS-text-xlarge, direct 文字 → 3D — the clean 文字→3D story.
  - "image": prompt → SD-Turbo image (the diffusion station's checkpoint, already
    on the box) → TRELLIS-image-large, image → 3D — chains the two panorama
    stations (文字→圖→3D) and upstream says image-to-3D is higher quality.

THREE entry points share this module:
- `write_sample` (`camp-precompute trellis-sample`, no network, no GPU):
  procedural splat objects (sphere / box / cylinder / torus blobs) for a handful
  of presets × 2 seeds that VISIBLY differ per seed, written with skyfall's
  converter. Marks `"sample": true`; the station renders a 示意資料 badge.
- `write_objects` (`camp-precompute trellis`, GPU box only — never run in this
  session): runs the chosen recipe per (preset, seed), exports gaussians → PLY →
  skyfall's prune/convert → `text-to-3d/objects/<presetId>-s<seed>.splat`, plus a
  small thumbnail per object for the picker.

`.splat`/thumbnail binaries are gitignored by pattern
(`public/data/**/text-to-3d/**/*.splat` + `*.webp`) and force-added deliberately,
like the skyfall + diffusion stations. Only the small presets.json is committed
normally.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

# Reuse the skyfall converter — ONE prune/convert path across stations 04/05.
from .skyfall import (
    DEFAULT_SIZE_WEIGHT,
    _blob,
    _cat,
    prune,
    read_gaussian_ply,
    write_splat,
)

STATION = "text-to-3d"

# TRELLIS text-to-3D model (default recipe). MIT code + weights.
TEXT_MODEL = "microsoft/TRELLIS-text-xlarge"
# Image-to-3D model for the "image" recipe (prompt → SD-Turbo image → 3D).
IMAGE_MODEL = "microsoft/TRELLIS-image-large"

# Objects sit in TRELLIS's canonical frame: roughly a unit cube centred at the
# origin, y-up. The viewer orbits them; this is the scene up vector.
UP = (0.0, 1.0, 0.0)

# Two seeds per prompt — 種子 A / 種子 B. Deterministic so a rebake reproduces
# the shipped objects. 2 is the budget default (open decision 3).
SEEDS = [0, 1]

# Object-tuned prune defaults (skyfall's are satellite-block sized). Cap keeps
# BOTH budgets: ≤ 2 MB / object (32 B/splat) AND ≤ 60 MB committed total across
# 16 prompts × 2 seeds = 32 objects. 55 k × 32 B ≈ 1.76 MB → ≤ 56 MB worst case.
DEFAULT_MAX_SPLATS = 55_000
DEFAULT_MIN_OPACITY = 0.02  # sigmoid-space; kills near-invisible dust
DEFAULT_MAX_SCALE_FRAC = 0.10  # of the object diagonal; kills degenerate blobs

# Thumbnail render size (the picker preview). A few KB of webp per object.
THUMB_SIZE = 160

# Recognised recipes (open decision 1). Every object records which one grew it.
RECIPES = ("text", "image")


@dataclass(frozen=True)
class TrellisPreset:
    id: str
    label: str  # zh-TW chip label (prominent in the picker)
    prompt: str  # the EXACT English prompt fed to TRELLIS (revealed on hover)
    group: str  # "taiwan" | "camp" | "fun" — roster balance only, not shipped
    # Which sampled shape the procedural dev sample uses for this preset. None →
    # the preset has no offline sample (its object only exists after the bake).
    sample_kind: str | None = None
    sample_color: tuple[float, float, float] = field(default=(200.0, 200.0, 200.0))


# The curated roster (open decision 2) — curriculum content. Object-centric,
# single-subject prompts (what TRELLIS is good at): a mix of 台灣味, camp-
# relatable objects, and a few pure-fun ones. zh-TW label + English prompt.
PRESETS: list[TrellisPreset] = [
    # --- 台灣味 -------------------------------------------------------------
    TrellisPreset(
        "bubble-tea", "珍珠奶茶",
        "a cup of Taiwanese bubble tea with tapioca pearls and a straw",
        "taiwan", sample_kind="cup", sample_color=(214.0, 196.0, 170.0),
    ),
    TrellisPreset(
        "taipei-101", "台北 101",
        "the Taipei 101 skyscraper, a tall tiered tower like a stack of pagoda segments",
        "taiwan",
    ),
    TrellisPreset(
        "lantern", "紅燈籠",
        "a traditional Chinese red paper lantern with gold rims and tassels",
        "taiwan", sample_kind="sphere", sample_color=(206.0, 54.0, 46.0),
    ),
    TrellisPreset(
        "blue-slippers", "藍白拖",
        "a pair of blue and white plastic flip-flop sandals",
        "taiwan",
    ),
    TrellisPreset(
        "fried-chicken", "雞排",
        "a piece of Taiwanese crispy fried chicken cutlet",
        "taiwan",
    ),
    TrellisPreset(
        "pineapple-cake", "鳳梨酥",
        "a Taiwanese pineapple cake, a small golden rectangular pastry",
        "taiwan", sample_kind="box", sample_color=(212.0, 176.0, 96.0),
    ),
    # --- camp-relatable objects --------------------------------------------
    TrellisPreset(
        "guitar", "木吉他",
        "an acoustic wooden guitar",
        "camp", sample_kind="torus", sample_color=(150.0, 104.0, 60.0),
    ),
    TrellisPreset(
        "skateboard", "滑板",
        "a skateboard with four wheels",
        "camp", sample_kind="board", sample_color=(70.0, 74.0, 88.0),
    ),
    TrellisPreset(
        "keyboard", "機械鍵盤",
        "a mechanical computer keyboard",
        "camp",
    ),
    TrellisPreset(
        "sneaker", "球鞋",
        "a single sneaker sports shoe",
        "camp",
    ),
    TrellisPreset(
        "headphones", "耳罩式耳機",
        "a pair of over-ear headphones",
        "camp",
    ),
    TrellisPreset(
        "backpack", "後背包",
        "a hiking backpack",
        "camp",
    ),
    # --- pure fun ----------------------------------------------------------
    TrellisPreset(
        "avocado-chair", "酪梨椅",
        "an armchair in the shape of an avocado",
        "fun", sample_kind="sphere", sample_color=(122.0, 158.0, 66.0),
    ),
    TrellisPreset(
        "robot-cat", "機器貓",
        "a cute small robot cat",
        "fun",
    ),
    TrellisPreset(
        "mushroom-house", "蘑菇小屋",
        "a tiny fairytale mushroom house with a red cap",
        "fun",
    ),
    TrellisPreset(
        "rubber-duck", "小鴨",
        "a yellow rubber duck bath toy",
        "fun", sample_kind="duck", sample_color=(232.0, 198.0, 44.0),
    ),
]

PRESETS_BY_ID = {p.id: p for p in PRESETS}


# --- object framing (auto-frame hint shipped to the viewer) ------------------


def object_frame(g: dict[str, np.ndarray]) -> dict:
    """Bounding-sphere of the PRUNED cloud: the centre + radius the orbit camera
    frames on load. Robust to a few stray splats (97th-percentile radius)."""
    pos = g["pos"]
    lo, hi = np.percentile(pos, [2.0, 98.0], axis=0)
    center = (lo + hi) / 2.0
    radius = float(np.percentile(np.linalg.norm(pos - center, axis=1), 97.0))
    radius = max(radius, 1e-3)
    return {
        "center": [float(c) for c in center],
        "radius": round(radius, 5),
    }


# --- thumbnail (numpy orthographic projection of the gaussian cloud) ---------


def render_thumbnail(
    g: dict[str, np.ndarray], out_path: Path, size: int = THUMB_SIZE
) -> int:
    """Project the gaussian cloud to a small webp preview for the picker chip.

    A hard z-buffered orthographic splat from a fixed 3/4 view (azimuth + a small
    elevation), rendered at 2× and downscaled for anti-aliasing. It is a genuine
    view of the object that ships (the same cloud the viewer streams), not a
    stock icon — so the picker preview is honest. Runs offline (numpy + PIL); the
    GPU bake and the dev sample both use it, so previews are consistent."""
    from PIL import Image

    scale = 2
    s = size * scale
    pos = g["pos"].astype(np.float64)
    frame = object_frame(g)
    center = np.asarray(frame["center"])
    radius = frame["radius"]

    # 3/4 view: rotate the cloud so we look slightly down and around it.
    azim = np.deg2rad(28.0)
    elev = np.deg2rad(16.0)
    ca, sa = np.cos(azim), np.sin(azim)
    ce, se = np.cos(elev), np.sin(elev)
    ry = np.array([[ca, 0, sa], [0, 1, 0], [-sa, 0, ca]])
    rx = np.array([[1, 0, 0], [0, ce, -se], [0, se, ce]])
    p = (pos - center) @ ry.T @ rx.T

    # Orthographic screen coords: y-up flipped to image row order; z is depth
    # (larger z = nearer the viewer). Fit the bounding sphere with a margin.
    span = radius * 2.15
    sx = ((p[:, 0] / span) + 0.5) * (s - 1)
    sy = (0.5 - (p[:, 1] / span)) * (s - 1)
    px = np.clip(np.round(sx), 0, s - 1).astype(np.int64)
    py = np.clip(np.round(sy), 0, s - 1).astype(np.int64)
    depth = p[:, 2]

    bg = np.array([10, 10, 10], dtype=np.uint8)  # theme near-black
    buf = np.tile(bg, (s * s, 1))
    rgb = np.clip(g["rgb"], 0, 255).astype(np.uint8)

    # Painter's z-buffer: draw far→near so nearer splats overwrite. A 2×2 stamp
    # (self + right/down neighbours) fills pixel gaps in the sparse projection.
    order = np.argsort(depth)  # ascending: far first, near written last
    for dx, dy in ((0, 0), (1, 0), (0, 1), (1, 1)):
        qx = np.clip(px[order] + dx, 0, s - 1)
        qy = np.clip(py[order] + dy, 0, s - 1)
        buf[qy * s + qx] = rgb[order]

    img = Image.fromarray(buf.reshape(s, s, 3), "RGB").resize(
        (size, size), Image.LANCZOS
    )
    out_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(out_path, format="WEBP", quality=82, method=4)
    return out_path.stat().st_size


# --- presets.json / manifest bookkeeping -------------------------------------


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _presets_path(out_dir: Path) -> Path:
    return out_dir / STATION / "presets.json"


def _object_rel(preset_id: str, seed: int, ext: str) -> str:
    return f"{STATION}/objects/{preset_id}-s{seed}.{ext}"


def _bake_object(
    g: dict[str, np.ndarray],
    out_dir: Path,
    preset_id: str,
    seed: int,
    *,
    thumbnail: bool,
    max_splats: int = DEFAULT_MAX_SPLATS,
    min_opacity: float = DEFAULT_MIN_OPACITY,
    max_scale_frac: float = DEFAULT_MAX_SCALE_FRAC,
    size_weight: float = DEFAULT_SIZE_WEIGHT,
) -> dict:
    """Prune + convert one gaussian cloud → text-to-3d/objects/<id>-s<seed>.splat
    (+ a thumbnail), and return its presets.json object entry."""
    before_n = len(g["alpha"])
    g = prune(g, max_splats, min_opacity, max_scale_frac, size_weight)
    splat_rel = _object_rel(preset_id, seed, "splat")
    size = write_splat(g, out_dir / splat_rel)
    frame = object_frame(g)
    entry = {
        "seed": seed,
        "path": splat_rel,
        "bytes": size,
        "splats": len(g["alpha"]),
        "center": frame["center"],
        "radius": frame["radius"],
    }
    if thumbnail:
        thumb_rel = _object_rel(preset_id, seed, "webp")
        entry["thumb"] = thumb_rel
        entry["thumbBytes"] = render_thumbnail(g, out_dir / thumb_rel)
    print(
        f"  {preset_id} s{seed}: {before_n:,} → {len(g['alpha']):,} splats, "
        f"{size / 1e6:.2f} MB"
    )
    return entry


def _preset_meta(preset: TrellisPreset, recipe: str, objects: list[dict]) -> dict:
    # Preset-level framing radius = the larger of the two seeds' bounding
    # spheres, so ONE orbit frame flatters both objects (the seed flip keeps the
    # camera still, like skyfall's A/B — comparison needs a shared frame).
    radius = max((o["radius"] for o in objects), default=1.0)
    return {
        "id": preset.id,
        "label": preset.label,
        "prompt": preset.prompt,
        "recipe": recipe,
        "framingRadius": round(radius, 5),
        "objects": sorted(objects, key=lambda o: o["seed"]),
    }


def _write_presets(
    out_dir: Path, presets_meta: list[dict], *, generator: str, sample: bool,
    model: str, note: str,
) -> Path:
    from .cli import upsert_manifest_artifact

    payload = {
        "generator": generator,
        "generatedAt": _now(),
        "station": STATION,
        "sample": sample,
        "model": model,
        "up": list(UP),
        "seeds": SEEDS,
        "note": note,
        "presets": presets_meta,
    }
    path = _presets_path(out_dir)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    upsert_manifest_artifact(
        out_dir,
        {
            "id": "text-to-3d-presets",
            "kind": "json",
            "path": f"{STATION}/presets.json",
            "station": STATION,
            "bytes": path.stat().st_size,
            "description": (
                "Prompt-preset catalog for the text-to-3d station: per preset a "
                "zh-TW label, the exact English prompt, the recipe that grew it "
                "(text | image), and per-seed object files (pruned .splat + "
                "thumbnail, bytes, bounding-sphere frame). The .splat / .webp "
                "binaries are gitignored by pattern and force-added; the browser "
                "only renders the splats — TRELLIS runs offline on the GPU box."
            ),
        },
    )
    return path


# --- the GPU bake (never run in this session) --------------------------------


def _load_text_pipeline():
    """TRELLIS text-to-3D pipeline. Import inside the call so the dev machine
    (no trellis, no GPU) never touches it — only the GPU-box bake does."""
    import os

    # SM70 (V100) has no flash-attn; upstream needs the xformers backend there.
    os.environ.setdefault("ATTN_BACKEND", "xformers")
    os.environ.setdefault("SPCONV_ALGO", "native")
    from trellis.pipelines import TrellisTextTo3DPipeline

    pipe = TrellisTextTo3DPipeline.from_pretrained(TEXT_MODEL)
    pipe.cuda()
    return pipe


def _load_image_pipeline():
    """TRELLIS image-to-3D pipeline + the SD-Turbo text→image front end (the
    diffusion station's checkpoint). GPU box only."""
    import os

    os.environ.setdefault("ATTN_BACKEND", "xformers")
    os.environ.setdefault("SPCONV_ALGO", "native")
    from trellis.pipelines import TrellisImageTo3DPipeline

    from .diffusion import load_pipeline as load_sd_turbo

    trellis = TrellisImageTo3DPipeline.from_pretrained(IMAGE_MODEL)
    trellis.cuda()
    sd = load_sd_turbo("cuda")
    return trellis, sd


def _gaussian_to_ply(outputs, ply_path: Path) -> None:
    """Save TRELLIS's gaussian output as a standard 3DGS PLY — exactly what
    skyfall.read_gaussian_ply consumes (positions, f_dc, opacity logit, log
    scales, unnormalised rot). TRELLIS's internal frame is z-up and its default
    save transform emits the 3DGS y-DOWN convention (objects land upside down
    in our y-up viewer); this transform is the z-up → y-up rotation instead."""
    ply_path.parent.mkdir(parents=True, exist_ok=True)
    outputs["gaussian"][0].save_ply(
        str(ply_path), transform=[[1, 0, 0], [0, 0, 1], [0, -1, 0]]
    )


def _run_text(pipe, prompt: str, seed: int):
    # gaussian only — skip the mesh/radiance-field decoders (we ship .splat).
    return pipe.run(prompt, seed=seed, formats=["gaussian"])


def _run_image(trellis, sd, prompt: str, seed: int):
    # prompt → SD-Turbo image (deterministic per seed) → TRELLIS image-to-3D.
    from .diffusion import generate_trajectory

    frames = generate_trajectory(sd, prompt, seed, steps=4)
    image = frames[-1]  # the final denoised image
    return trellis.run(image, seed=seed, formats=["gaussian"])


def write_objects(
    out_dir: Path,
    *,
    recipe: str = "text",
    only: list[str] | None = None,
    cache_dir: Path | None = None,
    max_splats: int = DEFAULT_MAX_SPLATS,
    min_opacity: float = DEFAULT_MIN_OPACITY,
    max_scale_frac: float = DEFAULT_MAX_SCALE_FRAC,
    size_weight: float = DEFAULT_SIZE_WEIGHT,
) -> Path:
    """Run TRELLIS for each (preset, seed), export gaussians → PLY → skyfall's
    prune/convert → .splat + thumbnail. GPU box only. `only` filters presets for
    partial rebakes; other presets in an existing presets.json are preserved."""
    if recipe not in RECIPES:
        raise SystemExit(f"trellis: unknown --recipe {recipe!r}; known: {RECIPES}")
    targets = [p for p in PRESETS if only is None or p.id in only]
    if only:
        unknown = sorted(set(only) - set(PRESETS_BY_ID))
        if unknown:
            raise SystemExit(f"trellis: unknown preset id(s) {unknown}")
    if not targets:
        raise SystemExit("trellis: no presets selected")

    cache = cache_dir or (out_dir / STATION / "_ply_cache")
    model = TEXT_MODEL if recipe == "text" else IMAGE_MODEL
    print(f"trellis: loading {model} (recipe={recipe})…")
    if recipe == "text":
        pipe = _load_text_pipeline()
        run = lambda pr, sd: _run_text(pipe, pr, sd)  # noqa: E731
    else:
        trellis, sd = _load_image_pipeline()
        run = lambda pr, sd_: _run_image(trellis, sd, pr, sd_)  # noqa: E731

    # Preserve presets not being rebaked (partial --presets runs).
    existing = _load_existing(out_dir)

    presets_meta: list[dict] = []
    baked_ids = {p.id for p in targets}
    for preset in targets:
        objects: list[dict] = []
        for seed in SEEDS:
            outputs = run(preset.prompt, seed)
            ply_path = cache / f"{preset.id}-s{seed}.ply"
            _gaussian_to_ply(outputs, ply_path)
            g = read_gaussian_ply(ply_path)
            objects.append(
                _bake_object(
                    g, out_dir, preset.id, seed, thumbnail=True,
                    max_splats=max_splats, min_opacity=min_opacity,
                    max_scale_frac=max_scale_frac, size_weight=size_weight,
                )
            )
        presets_meta.append(_preset_meta(preset, recipe, objects))

    # Merge: rebaked presets replace their old entries; the rest are kept.
    for old in existing:
        if old["id"] not in baked_ids:
            presets_meta.append(old)
    presets_meta.sort(key=_preset_rank)

    return _write_presets(
        out_dir, presets_meta,
        generator=f"camp-precompute trellis --recipe {recipe}",
        sample=False,
        model=model,
        note=(
            f"Real TRELLIS 3D objects ({model}, recipe={recipe}). Each object is "
            "a pruned 3D Gaussian cloud grown from the English prompt at the "
            "given seed, exported to the same .splat format the skyfall station "
            "streams. The browser only renders it — TRELLIS runs offline on the "
            "GPU box (see the runbook)."
        ),
    )


def _preset_rank(entry: dict) -> tuple[int, str]:
    ids = [p.id for p in PRESETS]
    idx = ids.index(entry["id"]) if entry["id"] in ids else len(ids)
    return (idx, entry["id"])


def _load_existing(out_dir: Path) -> list[dict]:
    path = _presets_path(out_dir)
    if not path.exists():
        return []
    try:
        return json.loads(path.read_text(encoding="utf-8")).get("presets", [])
    except (json.JSONDecodeError, OSError):
        return []


# --- the no-network procedural sample ----------------------------------------
#
# Tiny synthetic splat objects so the whole station — picker, seed flip, orbit,
# thumbnails — works offline before the GPU bake. Each sampled preset gets a base
# shape; seed 0 and seed 1 differ VISIBLY (proportions, hue, surface detail) so
# 「同一句話,不同的長法」reads without the real model. Badged 示意資料.


def _surface_sphere(
    rng: np.random.Generator, n: int, rx: float, ry: float, rz: float,
    color: np.ndarray, bump: float,
) -> dict[str, np.ndarray]:
    """Points on an ellipsoid surface, radius jittered by `bump` (lumpiness)."""
    v = rng.normal(size=(n, 3))
    v /= np.linalg.norm(v, axis=1, keepdims=True)
    r = 1.0 + bump * rng.normal(0, 1.0, n)
    pos = v * r[:, None] * np.array([rx, ry, rz])
    scale = np.full((n, 3), 0.03, np.float32)
    shade = 0.7 + 0.3 * np.clip(v[:, 1] * 0.5 + 0.6, 0, 1)  # top-lit
    rgb = np.clip(color[None, :] * shade[:, None], 0, 255)
    rgb += rng.normal(0, 5.0, rgb.shape)
    return _blob(pos, scale, rgb, np.full(n, 0.97, np.float32))


def _surface_box(
    rng: np.random.Generator, n: int, w: float, h: float, d: float,
    color: np.ndarray,
) -> dict[str, np.ndarray]:
    """Points on the surface of a box (per-face shading so it reads as 3D)."""
    half = np.array([w, h, d]) / 2.0
    faces = rng.integers(0, 6, n)
    p = rng.uniform(-1, 1, (n, 3)) * half
    lights = np.array([0.72, 0.92, 0.82, 1.0, 0.6, 0.88])
    shade = np.empty(n)
    for f in range(6):
        axis, sign = f // 2, (1.0 if f % 2 else -1.0)
        m = faces == f
        p[m, axis] = sign * half[axis]
        shade[m] = lights[f]
    scale = np.full((n, 3), 0.028, np.float32)
    rgb = np.clip(color[None, :] * shade[:, None], 0, 255)
    rgb += rng.normal(0, 5.0, rgb.shape)
    return _blob(p.astype(np.float32), scale, rgb, np.full(n, 0.97, np.float32))


def _surface_cylinder(
    rng: np.random.Generator, n: int, radius: float, height: float,
    color: np.ndarray, taper: float,
) -> dict[str, np.ndarray]:
    """Points on a (optionally tapered) cylinder wall + a bottom cap — a cup."""
    theta = rng.uniform(0, 2 * np.pi, n)
    t = rng.uniform(0, 1, n)  # 0 bottom → 1 top
    r = radius * (1.0 - taper * (1.0 - t))
    pos = np.stack(
        [r * np.cos(theta), (t - 0.5) * height, r * np.sin(theta)], axis=1
    )
    # A darker cap at the bottom (the drink / sole).
    cap = rng.random(n) < 0.18
    pos[cap, 1] = -height / 2.0
    pos[cap, 0] *= rng.uniform(0, 1, cap.sum())
    pos[cap, 2] *= rng.uniform(0, 1, cap.sum())
    scale = np.full((n, 3), 0.03, np.float32)
    shade = 0.7 + 0.3 * (np.cos(theta) * 0.5 + 0.5)
    rgb = np.clip(color[None, :] * shade[:, None], 0, 255)
    rgb[cap] *= 0.45  # pearls / dark base
    rgb += rng.normal(0, 5.0, rgb.shape)
    return _blob(pos.astype(np.float32), scale, rgb, np.full(n, 0.97, np.float32))


def _surface_torus(
    rng: np.random.Generator, n: int, big: float, small: float,
    color: np.ndarray,
) -> dict[str, np.ndarray]:
    u = rng.uniform(0, 2 * np.pi, n)
    v = rng.uniform(0, 2 * np.pi, n)
    pos = np.stack(
        [
            (big + small * np.cos(v)) * np.cos(u),
            small * np.sin(v),
            (big + small * np.cos(v)) * np.sin(u),
        ],
        axis=1,
    )
    scale = np.full((n, 3), 0.028, np.float32)
    shade = 0.7 + 0.3 * (np.sin(v) * 0.5 + 0.5)
    rgb = np.clip(color[None, :] * shade[:, None], 0, 255)
    rgb += rng.normal(0, 5.0, rgb.shape)
    return _blob(pos.astype(np.float32), scale, rgb, np.full(n, 0.97, np.float32))


def _sample_object(preset: TrellisPreset, seed: int) -> dict[str, np.ndarray]:
    """Build one procedural object. `seed` shifts proportions, hue and detail so
    the two seeds of a preset are clearly different objects."""
    rng = np.random.default_rng(1000 + seed * 97 + hash(preset.id) % 997)
    color = np.asarray(preset.sample_color, np.float32)
    # Seed drift: hue rotates and the shape squashes/stretches per seed.
    color = np.clip(color + (seed - 0.5) * np.array([26.0, -18.0, 22.0]), 20, 255)
    stretch = 1.0 + (seed - 0.5) * 0.5
    kind = preset.sample_kind
    n = 14_000

    if kind == "sphere":
        parts = [_surface_sphere(rng, n, 0.9, 0.9 * stretch, 0.9, color, 0.06 + 0.05 * seed)]
    elif kind == "box":
        parts = [_surface_box(rng, n, 1.4, 0.5 * stretch, 0.9, color)]
    elif kind == "board":
        # skateboard-ish: a flat deck + four dark wheels.
        parts = [_surface_box(rng, int(n * 0.7), 1.7, 0.12, 0.55 * stretch, color)]
        wheel = np.asarray((40.0, 40.0, 46.0), np.float32)
        for wx in (-0.6, 0.6):
            for wz in (-0.22, 0.22):
                w = _surface_sphere(rng, int(n * 0.075), 0.13, 0.13, 0.13, wheel, 0.02)
                w["pos"] += np.array([wx, -0.16, wz * stretch], np.float32)
                parts.append(w)
    elif kind == "cup":
        parts = [_surface_cylinder(rng, n, 0.55, 1.5 * stretch, color, 0.18 + 0.1 * seed)]
    elif kind == "torus":
        parts = [_surface_torus(rng, n, 0.7, 0.26 * stretch, color)]
    elif kind == "duck":
        # body sphere + smaller head sphere + tiny beak.
        body = _surface_sphere(rng, int(n * 0.7), 0.85, 0.7 * stretch, 0.85, color, 0.05)
        head = _surface_sphere(rng, int(n * 0.22), 0.42, 0.42, 0.42, color, 0.04)
        head["pos"] += np.array([0.55, 0.7, 0.0], np.float32)
        beak = _surface_sphere(
            rng, int(n * 0.08), 0.22, 0.12, 0.16,
            np.asarray((228.0, 132.0, 40.0), np.float32), 0.02,
        )
        beak["pos"] += np.array([1.0, 0.62, 0.0], np.float32)
        parts = [body, head, beak]
    else:  # default fallback shape
        parts = [_surface_sphere(rng, n, 0.9, 0.9, 0.9, color, 0.05)]

    return _cat(parts)


def write_sample(out_dir: Path) -> Path:
    """Bake the procedural object set (sampled presets × 2 seeds) so the whole
    station runs offline with zero downloads. Marked 示意資料."""
    sampled = [p for p in PRESETS if p.sample_kind is not None]
    presets_meta: list[dict] = []
    for preset in sampled:
        objects: list[dict] = []
        for seed in SEEDS:
            g = _sample_object(preset, seed)
            objects.append(
                _bake_object(
                    g, out_dir, preset.id, seed, thumbnail=True,
                    # The sample clouds are tiny; keep them all (no prune loss).
                    max_splats=DEFAULT_MAX_SPLATS, min_opacity=0.01,
                    max_scale_frac=1.0,
                )
            )
        presets_meta.append(_preset_meta(preset, "sample", objects))

    return _write_presets(
        out_dir, presets_meta,
        generator="camp-precompute trellis-sample",
        sample=True,
        model=TEXT_MODEL,
        note=(
            "PROCEDURAL sample objects (no model): sphere / box / cylinder / "
            "torus blobs so the dev UI can pick a prompt, flip the seed, and "
            "orbit an object offline. NOT TRELLIS output — replace with the real "
            "bake (`camp-precompute trellis`) on the GPU box (see the runbook)."
        ),
    )
