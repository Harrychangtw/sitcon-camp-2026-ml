"""pixel-shuffle station: the CIFAR-10 pack + the fixed pixel permutation.

The station re-stages the morning class's in-browser MLP trainer as a
controlled experiment: two identical MLPs train live in a Web Worker, one on
real CIFAR-10 images, one on the same images with every pixel moved by ONE
fixed permutation. This module bakes everything the browser needs:

  - cifar10.bin.gz, copied VERBATIM from the morning class's committed pack
    (sitcon-camp-2026-ml-pt1 · public/datasets/cifar10.bin.gz): the SAME 2,000
    train + 200 val images students trained on that morning, class-balanced,
    raw bytes, sample-major, HWC-interleaved
    (byte(s,y,x,c) = s*3072 + (y*32+x)*3 + c), gzipped. Deliberately NOT a PNG
    sprite: canvas getImageData read-back goes black in headless/GPU contexts
    and silently feeds the net constant input.
  - meta.json, split sizes, labels, per-channel train mean (all verbatim from
    the morning pack's manifest, re-verified against the bytes here), zh/en
    class names, the permutation π (1,024 pixel POSITIONS, RGB triplets move
    together), and the arch/hyperparams both nets train with. The single
    source of truth the worker and the UI read.
  - reference-runs.json, a numpy mirror of the SAME twin experiment
    (permuted-copy init, shared batch schedule), so the station can overlay a
    dashed 參考曲線 and the deck gets stable final-accuracy numbers even if a
    live run is unlucky.

Baking also asserts the permutation theorem in float64 (the shuffled twin's
training is the same arithmetic under renamed wires), so a port bug in the
JS worker can't quietly ship: if the construction is wrong, the bake fails.

Source data: the reference repo is the camp's own material (same instructors;
reusing the exact subset is the point, "the net you trained this morning").
Clone it first if `.reference/` is empty:

  git clone --depth 1 https://github.com/burnedinthesky/sitcon-camp-2026-ml-pt1 \\
      .reference/sitcon-camp-2026-ml-pt1
"""

from __future__ import annotations

import gzip
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

MORNING_REPO = "https://github.com/burnedinthesky/sitcon-camp-2026-ml-pt1"

TILE = 32
DEPTH = 3
INPUT_DIM = TILE * TILE * DEPTH  # 3072
CLASSES = 10
TRAIN_N = 2000
VAL_N = 200

# Seeds are part of the artifact contract: 重來 in the browser and a re-bake
# here must reproduce the same experiment.
PERMUTATION_SEED = 314159  # the fixed π over 1,024 pixel positions
REFERENCE_SEED = 20260709  # the numpy mirror's init + batch schedule

CLASS_NAMES_ZH = ["飛機", "汽車", "鳥", "貓", "鹿", "狗", "青蛙", "馬", "船", "卡車"]

# The morning class's Small preset, with ONE deliberate change: lr 0.01
# instead of the morning default 0.05. At 0.05 this recipe oscillates on
# CIFAR (loss wobbles around ~1.4-2.5 with big spikes, val stuck ~32%); at
# 0.01 the loss drops cleanly and monotonically to ~0.01 and val reaches
# ~38-40%, same per-step browser cost. Swept 2026-07-09 over lr/batch/width/
# depth: more hidden layers bought ~1.5 val points at 2× browser compute and
# a spikier curve, so the arch stays [64]. The station fixes these knobs (the
# experiment is the point, not the dials).
ARCH_HIDDEN = [64]
TRAIN_OPTS = {"lr": 0.01, "momentum": 0.9, "batchSize": 16}

REFERENCE_STEPS = 4000
REFERENCE_EVAL_EVERY = 10


def default_source_dir() -> Path:
    from .cli import find_repo_root

    root = find_repo_root(Path.cwd())
    return root / ".reference" / "sitcon-camp-2026-ml-pt1" / "public" / "datasets"


def _load_morning_pack(source_dir: Path) -> tuple[Path, dict, np.ndarray]:
    """Read + validate the morning class's committed pack. Returns the .gz
    path (copied verbatim into our artifacts), its manifest, and the decoded
    [N, 3072] HWC byte matrix."""
    gz_path = source_dir / "cifar10.bin.gz"
    json_path = source_dir / "cifar10.json"
    if not gz_path.exists() or not json_path.exists():
        raise SystemExit(
            f"pixel-shuffle: morning-class pack not found in {source_dir}.\n"
            "Clone the reference repo first:\n"
            f"  git clone --depth 1 {MORNING_REPO} .reference/sitcon-camp-2026-ml-pt1"
        )
    manifest = json.loads(json_path.read_text(encoding="utf-8"))
    for key, want in (
        ("tile", TILE), ("depth", DEPTH), ("trainN", TRAIN_N), ("valN", VAL_N),
    ):
        if manifest.get(key) != want:
            raise SystemExit(
                f"pixel-shuffle: morning pack {key}={manifest.get(key)} (expected {want})"
            )
    bytes_flat = np.frombuffer(gzip.decompress(gz_path.read_bytes()), dtype=np.uint8)
    expected = (TRAIN_N + VAL_N) * INPUT_DIM
    if bytes_flat.size != expected:
        raise SystemExit(
            f"pixel-shuffle: pack byte length {bytes_flat.size} != expected {expected}"
        )
    labels = np.asarray(manifest["labels"], dtype=np.int64)
    counts = np.bincount(labels[:TRAIN_N], minlength=CLASSES)
    if not (counts == TRAIN_N // CLASSES).all():
        raise SystemExit(f"pixel-shuffle: train split not class-balanced: {counts}")
    # re-verify the manifest's per-channel mean against the bytes (catches a
    # format drift between their build script and this bake). Their packBytes
    # averages over ALL samples (train+val), so mirror that here.
    mean = (bytes_flat.reshape(-1, DEPTH).astype(np.float64) / 255.0).mean(axis=0)
    drift = np.abs(mean - np.asarray(manifest["mean"], dtype=np.float64)).max()
    if drift > 1e-6:
        raise SystemExit(
            f"pixel-shuffle: recomputed channel mean drifts {drift} from the "
            "pack manifest, layout mismatch?"
        )
    return gz_path, manifest, bytes_flat.reshape(-1, INPUT_DIM)


# ---------------------------------------------------------------------------
# numpy mirror of the browser trainer (net.ts): 3072 → [64] → 10 ReLU MLP,
# mini-batch SGD + momentum on softmax cross-entropy. Not bit-identical to the
# JS run (different RNG + float summation order), it's an honest independent
# run of the same experiment, shipped as the dashed reference curve.
# ---------------------------------------------------------------------------


class _NumpyMlp:
    def __init__(self, sizes: list[int], rng: np.random.Generator, dtype=np.float32):
        self.dtype = dtype
        self.W = [
            (rng.standard_normal((sizes[i + 1], sizes[i])) * np.sqrt(2 / sizes[i])).astype(dtype)
            for i in range(len(sizes) - 1)
        ]
        self.b = [np.zeros(sizes[i + 1], dtype=dtype) for i in range(len(sizes) - 1)]
        self.vW = [np.zeros_like(w) for w in self.W]
        self.vb = [np.zeros_like(b) for b in self.b]

    def forward(self, x: np.ndarray) -> list[np.ndarray]:
        acts = [x]
        for i, (w, b) in enumerate(zip(self.W, self.b)):
            z = acts[-1] @ w.T + b
            if i < len(self.W) - 1:
                acts.append(np.maximum(z, 0))
            else:
                z = z - z.max(axis=1, keepdims=True)
                e = np.exp(z)
                acts.append((e / e.sum(axis=1, keepdims=True)).astype(self.dtype))
        return acts

    def train_batch(self, x: np.ndarray, y: np.ndarray, lr: float, momentum: float) -> float:
        n = x.shape[0]
        acts = self.forward(x)
        probs = acts[-1]
        loss = float(-np.log(np.maximum(probs[np.arange(n), y], 1e-12)).mean())
        delta = probs.copy()
        delta[np.arange(n), y] -= 1
        for layer in range(len(self.W) - 1, -1, -1):
            g_w = (delta.T @ acts[layer]) / n
            g_b = delta.mean(axis=0)
            if layer > 0:
                delta = (delta @ self.W[layer]) * (acts[layer] > 0)
            self.vW[layer] = momentum * self.vW[layer] - lr * g_w.astype(self.dtype)
            self.vb[layer] = momentum * self.vb[layer] - lr * g_b.astype(self.dtype)
            self.W[layer] += self.vW[layer]
            self.b[layer] += self.vb[layer]
        return loss

    def val_acc(self, x: np.ndarray, y: np.ndarray) -> float:
        return float((self.forward(x)[-1].argmax(axis=1) == y).mean())


def _scalar_perm(perm: np.ndarray) -> np.ndarray:
    """Expand a pixel-position permutation to scalar indices (RGB together)."""
    return (perm[:, None] * DEPTH + np.arange(DEPTH)[None, :]).reshape(-1)


def _permuted_copy(net: _NumpyMlp, perm: np.ndarray) -> _NumpyMlp:
    """Net B's init: net A's weights with the first layer's input wires
    relabeled by π. Shuffled position p holds original pixel perm[p], so
    W_B[:, p*3+c] = W_A[:, perm[p]*3+c]; biases + deeper layers exact copies."""
    twin = _NumpyMlp.__new__(_NumpyMlp)
    twin.dtype = net.dtype
    twin.W = [w.copy() for w in net.W]
    twin.W[0] = net.W[0][:, _scalar_perm(perm)]
    twin.b = [b.copy() for b in net.b]
    twin.vW = [np.zeros_like(w) for w in twin.W]
    twin.vb = [np.zeros_like(b) for b in twin.b]
    return twin


def _apply_perm(x: np.ndarray, perm: np.ndarray) -> np.ndarray:
    """Move whole RGB pixels: shuffled position p shows original pixel perm[p]."""
    return x[:, _scalar_perm(perm)]


def _assert_theorem(x_train: np.ndarray, y_train: np.ndarray, perm: np.ndarray) -> None:
    """float64 spot-check: with permuted-copy init + a shared batch schedule,
    the twin runs are the same arithmetic under renamed wires, losses match
    to float64 tolerance and the relabel invariant survives training."""
    sizes = [INPUT_DIM, *ARCH_HIDDEN, CLASSES]
    rng = np.random.default_rng(7)
    net_a = _NumpyMlp(sizes, rng, dtype=np.float64)
    net_b = _permuted_copy(net_a, perm)
    x_shuf = _apply_perm(x_train, perm).astype(np.float64)
    x_a = x_train.astype(np.float64)
    batch_rng = np.random.default_rng(11)
    for _ in range(30):
        idx = batch_rng.integers(0, x_train.shape[0], size=TRAIN_OPTS["batchSize"])
        la = net_a.train_batch(x_a[idx], y_train[idx], TRAIN_OPTS["lr"], TRAIN_OPTS["momentum"])
        lb = net_b.train_batch(x_shuf[idx], y_train[idx], TRAIN_OPTS["lr"], TRAIN_OPTS["momentum"])
        assert abs(la - lb) < 1e-9, f"twin losses diverged: {la} vs {lb}"
    # the invariant the reveal relies on: W_B[:, p] == W_A[:, π(p)] survives
    # training (equivalently: gathering W_A by π reproduces W_B, and gathering
    # W_B by π⁻¹, what the browser's 還原排列 does, reproduces W_A).
    gap = np.abs(net_b.W[0] - net_a.W[0][:, _scalar_perm(perm)]).max()
    assert gap < 1e-9, f"W_B drifted off the π-relabeled W_A (max gap {gap})"


def _train_reference(
    x_train: np.ndarray,
    y_train: np.ndarray,
    x_val: np.ndarray,
    y_val: np.ndarray,
    perm: np.ndarray,
    steps: int,
    eval_every: int,
) -> dict:
    """The twin experiment in float32: run A on the real pixels, run B on the
    π-moved pixels, permuted-copy init, same batch indices every step."""
    sizes = [INPUT_DIM, *ARCH_HIDDEN, CLASSES]
    rng = np.random.default_rng(REFERENCE_SEED)
    net_a = _NumpyMlp(sizes, rng)
    net_b = _permuted_copy(net_a, perm)
    x_shuf_train = _apply_perm(x_train, perm)
    x_shuf_val = _apply_perm(x_val, perm)

    batch_rng = np.random.default_rng(REFERENCE_SEED + 1)
    xs: list[int] = []
    curves = {"normal": {"loss": [], "valAcc": []}, "shuffled": {"loss": [], "valAcc": []}}
    ema_a = ema_b = 0.0
    for step in range(1, steps + 1):
        idx = batch_rng.integers(0, x_train.shape[0], size=TRAIN_OPTS["batchSize"])
        la = net_a.train_batch(x_train[idx], y_train[idx], TRAIN_OPTS["lr"], TRAIN_OPTS["momentum"])
        lb = net_b.train_batch(x_shuf_train[idx], y_train[idx], TRAIN_OPTS["lr"], TRAIN_OPTS["momentum"])
        # Same EMA smoothing as the worker, so the dashed overlay is comparable.
        ema_a = la if ema_a == 0 else ema_a * 0.9 + la * 0.1
        ema_b = lb if ema_b == 0 else ema_b * 0.9 + lb * 0.1
        if step % eval_every == 0:
            xs.append(step)
            curves["normal"]["loss"].append(round(ema_a, 4))
            curves["shuffled"]["loss"].append(round(ema_b, 4))
            curves["normal"]["valAcc"].append(round(net_a.val_acc(x_val, y_val), 4))
            curves["shuffled"]["valAcc"].append(round(net_b.val_acc(x_shuf_val, y_val), 4))

    return {
        "seed": REFERENCE_SEED,
        "steps": steps,
        "evalEvery": eval_every,
        "xs": xs,
        "runs": curves,
        "finalValAcc": {
            "normal": curves["normal"]["valAcc"][-1],
            "shuffled": curves["shuffled"]["valAcc"][-1],
        },
    }


def write_pixel_shuffle(
    out_dir: Path,
    source_dir: Path | None = None,
    *,
    reference_steps: int = REFERENCE_STEPS,
) -> list[Path]:
    """Bake the pack + meta + reference runs and register them in the manifest."""
    from .cli import upsert_manifest_artifact

    src = source_dir or default_source_dir()
    gz_path, morning, packed = _load_morning_pack(src)
    labels = np.asarray(morning["labels"], dtype=np.int64)

    perm = np.random.default_rng(PERMUTATION_SEED).permutation(TILE * TILE)

    # Float tensors for the theorem check + the reference runs (mean-subtracted,
    # exactly what the browser trains on).
    mean = np.asarray(morning["mean"], dtype=np.float64)
    x_all = (packed.astype(np.float32) / 255.0) - np.tile(
        mean.astype(np.float32), TILE * TILE
    )
    x_train, y_train = x_all[:TRAIN_N], labels[:TRAIN_N]
    x_val, y_val = x_all[TRAIN_N:], labels[TRAIN_N:]

    print("pixel-shuffle: verifying the permutation theorem (float64, 30 steps)…")
    _assert_theorem(x_train, y_train, perm)

    print(f"pixel-shuffle: baking reference twin runs ({reference_steps} steps)…")
    reference = _train_reference(
        x_train, y_train, x_val, y_val, perm, reference_steps, REFERENCE_EVAL_EVERY
    )
    print(
        "  final val acc, normal "
        f"{reference['finalValAcc']['normal']:.3f}, shuffled "
        f"{reference['finalValAcc']['shuffled']:.3f}"
    )

    station_dir = out_dir / "pixel-shuffle"
    station_dir.mkdir(parents=True, exist_ok=True)

    # The pack ships byte-for-byte as the morning class committed it, the
    # station literally trains on the images students already met.
    pack_path = station_dir / "cifar10.bin.gz"
    shutil.copyfile(gz_path, pack_path)

    now = datetime.now(timezone.utc).isoformat()
    meta = {
        "generator": "camp-precompute pixel-shuffle",
        "generatedAt": now,
        "station": "pixel-shuffle",
        "note": (
            "CIFAR-10 subset pack for the pixel-shuffle station, the morning "
            "class's own 2,000+200 pack, copied verbatim from "
            "sitcon-camp-2026-ml-pt1. Bytes in cifar10.bin.gz are sample-major "
            "HWC (train first, then val); the browser feeds v/255 - mean[c]. "
            "`permutation` is the fixed π over the 1,024 pixel POSITIONS (RGB "
            "moves together): shuffled position p shows original pixel "
            "permutation[p]."
        ),
        "sourcePack": f"{MORNING_REPO} · public/datasets/cifar10.bin.gz",
        "tile": TILE,
        "depth": DEPTH,
        "trainN": TRAIN_N,
        "valN": VAL_N,
        "labels": labels.tolist(),
        "mean": morning["mean"],
        "classNames_en": morning["classNames"],
        "classNames_zh": CLASS_NAMES_ZH,
        "permutation": perm.tolist(),
        "permutationSeed": PERMUTATION_SEED,
        "arch": {"inputDim": INPUT_DIM, "hidden": ARCH_HIDDEN, "classes": CLASSES},
        "train": TRAIN_OPTS,
        # the experiment's defined endpoint: the worker auto-pauses here (same
        # horizon as the baked reference curves), so a forgotten tab can't run
        # into the post-plateau divergence zone.
        "maxSteps": REFERENCE_STEPS,
    }
    meta_path = station_dir / "meta.json"
    meta_path.write_text(
        json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    reference_payload = {
        "generator": "camp-precompute pixel-shuffle",
        "generatedAt": now,
        "station": "pixel-shuffle",
        "note": (
            "numpy mirror of the twin experiment (same data, arch, hyperparams, "
            "permuted-copy init, shared batches), the station's dashed 參考曲線 "
            "and the deck's stable numbers. Loss is EMA-smoothed like the live "
            "worker. Not bit-identical to a browser run (different RNG / float "
            "summation order)."
        ),
        **reference,
    }
    reference_path = station_dir / "reference-runs.json"
    reference_path.write_text(
        json.dumps(reference_payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    for art_id, path, kind in (
        ("pixel-shuffle-pack", pack_path, "bin"),
        ("pixel-shuffle-meta", meta_path, "json"),
        ("pixel-shuffle-reference", reference_path, "json"),
    ):
        upsert_manifest_artifact(
            out_dir,
            {
                "id": art_id,
                "kind": kind,
                "path": f"pixel-shuffle/{path.name}",
                "station": "pixel-shuffle",
                "bytes": path.stat().st_size,
            },
        )
    return [pack_path, meta_path, reference_path]
