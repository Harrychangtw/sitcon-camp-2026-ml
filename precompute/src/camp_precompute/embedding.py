"""Build the Course 2 *embedding* station artifacts — real pretrained vectors.

The pedagogy: token ids gain geometry. Students browse word vectors projected to
2D/3D, search a word, and watch its nearest neighbours light up — building the
intuition that *distance ≈ similarity*, and seeing where that breaks.

The golden rule (CLAUDE.md): the browser never trains. All the heavy work —
embedding thousands of words with a real model, PCA projection, k-means
clustering, nearest-neighbour search — happens **here**, offline. We export small
per-language JSON files the browser just plots. "Offline precompute may run on a
GPU" does not violate the rule: the rule is about the *runtime*. We auto-select
`cuda → mps → cpu`; the browser/Vercel side needs no GPU, it only fetches JSON.

Real vectors (not synthetic clusters) so "distance ≈ similarity" is *earned*: we
embed a large frequency-ranked vocabulary (zh-TW + English, from committed word
lists — see scripts/gen_vocab.py) with a pretrained BGE model, then PCA to 3D and
cosine top-K in the ORIGINAL space. Categories come from k-means (hand-labels
don't scale to thousands of words), capped small so the cyan/purple palette reads.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np

# --- Config ------------------------------------------------------------------
# Per-language BGE embedder. `base` (~400 MB each) is the speed/quality middle;
# the lesson doesn't need `large`. Mono models are fine — the two languages ship
# as independent artifacts, loaded separately in the browser.
MODELS: dict[str, str] = {
    "zh": "BAAI/bge-base-zh-v1.5",
    "en": "BAAI/bge-base-en-v1.5",
}
LANGUAGES = ("zh", "en")

TOP_K = 15          # neighbours stored per word (station's k-slider caps here)
N_CLUSTERS = 8      # k-means groups for colouring (≤8 so the palette doesn't rainbow)
MAX_WORDS = 3600    # hard cap per language (keeps shipped JSON within budget)
PCA_CLIP_PCT = 98.0 # clip projected coords at this percentile before scaling
SEED = 42

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"


def _load_vocab(lang: str) -> list[str]:
    """Read the committed word list for `lang` (one word per line)."""
    path = DATA_DIR / f"vocab.{lang}.txt"
    if not path.exists():
        raise SystemExit(
            f"embedding: missing vocab file {path} — run "
            f"`uv run python scripts/gen_vocab.py` first"
        )
    words = [w.strip() for w in path.read_text(encoding="utf-8").splitlines()]
    return [w for w in words if w]


def _select_device() -> str:
    """Auto-pick the fastest available torch device: cuda → mps → cpu."""
    import torch

    if torch.cuda.is_available():
        return "cuda"
    if torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def _embed(words: list[str], model_name: str, device: str) -> np.ndarray:
    """Embed `words` with a BGE model. Returns L2-normalised vectors [N, D].

    Symmetric word-similarity: `normalize_embeddings=True` and NO retrieval
    instruction prefix (the query prefix is for asymmetric query→document
    retrieval and hurts symmetric similarity).
    """
    from sentence_transformers import SentenceTransformer

    model = SentenceTransformer(model_name, device=device)
    vecs = model.encode(
        words,
        batch_size=256,
        normalize_embeddings=True,
        show_progress_bar=True,
        convert_to_numpy=True,
    )
    return np.asarray(vecs, dtype=np.float64)


def _pca_3d(vectors: np.ndarray) -> np.ndarray:
    """Project to the top-3 principal components (2D mode just drops z).

    Real embeddings have outliers; scaling by the global max collapses the cloud
    into a central blob. We clip each axis at the 98th percentile of |coord|
    before scaling, so the bulk of the cloud fills the ~[-5, 5] frame.
    """
    centered = vectors - vectors.mean(axis=0, keepdims=True)
    _, _, vt = np.linalg.svd(centered, full_matrices=False)
    coords = centered @ vt[:3].T
    clip = np.percentile(np.abs(coords), PCA_CLIP_PCT, axis=0, keepdims=True)
    coords = np.clip(coords, -clip, clip)
    coords = coords / (np.abs(coords).max() + 1e-9) * 5.0
    return coords


def _cluster(vectors: np.ndarray, words: list[str]) -> tuple[list[str], dict[str, str]]:
    """k-means into N_CLUSTERS groups; label each by its most-central word.

    Returns (per-word category label, {label: central word}). Deterministic via
    a fixed random_state (mirrors the SEED convention).
    """
    from sklearn.cluster import KMeans

    n_clusters = min(N_CLUSTERS, len(words))
    km = KMeans(n_clusters=n_clusters, random_state=SEED, n_init=10)
    labels = km.fit_predict(vectors)

    # Name each cluster by the word closest to its centroid — teaching-legible.
    names: dict[int, str] = {}
    for c in range(n_clusters):
        members = np.where(labels == c)[0]
        centroid = km.cluster_centers_[c]
        best = members[np.argmin(np.linalg.norm(vectors[members] - centroid, axis=1))]
        names[c] = words[best]

    cats = [names[int(c)] for c in labels]
    legend = {names[c]: names[c] for c in range(n_clusters)}
    return cats, legend


def _neighbors(words: list[str], vectors: np.ndarray) -> dict[str, list[dict]]:
    """Top-K cosine neighbours per word, in the ORIGINAL embedding space.

    Vectors are already L2-normalised, so the Gram matrix is cosine similarity.
    """
    sims = vectors @ vectors.T
    np.fill_diagonal(sims, -np.inf)  # never a word's own neighbour

    out: dict[str, list[dict]] = {}
    for i, w in enumerate(words):
        order = np.argpartition(sims[i], -TOP_K)[-TOP_K:]
        order = order[np.argsort(sims[i, order])[::-1]]
        out[w] = [
            {"word": words[j], "score": round(float(sims[i, j]), 4)}
            for j in order
        ]
    return out


def _write_compact(path: Path, payload) -> int:
    """Write JSON compactly (no indent) — pretty-printing ~triples these big
    per-language files and is the easiest way to blow the size budget."""
    path.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    return path.stat().st_size


def _build_lang(lang: str, out_dir: Path, device: str) -> list[dict]:
    """Build + write points/neighbors for one language; return manifest entries."""
    words = _load_vocab(lang)
    if len(words) > MAX_WORDS:
        print(f"[{lang}] capping vocab {len(words)} → {MAX_WORDS} (size budget)")
        words = words[:MAX_WORDS]

    print(f"[{lang}] embedding {len(words)} words with {MODELS[lang]} on {device}…")
    vectors = _embed(words, MODELS[lang], device)
    coords = _pca_3d(vectors)
    cats, _ = _cluster(vectors, words)
    neighbors = _neighbors(words, vectors)

    points = [
        {
            "word": w,
            "x": round(float(coords[i, 0]), 3),
            "y": round(float(coords[i, 1]), 3),
            "z": round(float(coords[i, 2]), 3),
            "category": cats[i],
        }
        for i, w in enumerate(words)
    ]

    station_dir = out_dir / "embedding"
    station_dir.mkdir(parents=True, exist_ok=True)

    pts_path = station_dir / f"points.{lang}.json"
    nbr_path = station_dir / f"neighbors.{lang}.json"
    pts_bytes = _write_compact(pts_path, points)
    nbr_bytes = _write_compact(nbr_path, neighbors)

    print(
        f"[{lang}] wrote points.{lang}.json ({pts_bytes/1e6:.2f} MB), "
        f"neighbors.{lang}.json ({nbr_bytes/1e6:.2f} MB)"
    )
    for name, nbytes in (("points", pts_bytes), ("neighbors", nbr_bytes)):
        if nbytes > 4_000_000:
            print(
                f"[{lang}] WARNING: {name}.{lang}.json is {nbytes/1e6:.2f} MB "
                f"(> 4 MB budget) — lower MAX_WORDS"
            )

    return [
        {
            "id": f"embedding-points-{lang}",
            "kind": "json",
            "path": f"embedding/points.{lang}.json",
            "station": "embedding",
            "bytes": pts_bytes,
        },
        {
            "id": f"embedding-neighbors-{lang}",
            "kind": "json",
            "path": f"embedding/neighbors.{lang}.json",
            "station": "embedding",
            "bytes": nbr_bytes,
        },
    ]


def build_embedding(out_dir: Path) -> list[dict]:
    """Write per-language points/neighbors under <out_dir>/embedding/.

    Returns the manifest `artifacts[]` entries for the caller to register. Also
    removes the retired single-file (English-only synthetic) artifacts if present.
    """
    device = _select_device()
    station_dir = out_dir / "embedding"

    # Retire the old synthetic single-file artifacts (points.json / neighbors.json).
    for stale in ("points.json", "neighbors.json"):
        p = station_dir / stale
        if p.exists():
            p.unlink()

    entries: list[dict] = []
    for lang in LANGUAGES:
        entries.extend(_build_lang(lang, out_dir, device))
    return entries
