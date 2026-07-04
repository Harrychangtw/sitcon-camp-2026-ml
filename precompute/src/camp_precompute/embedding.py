"""Build the Course 2 *embedding* station artifacts — real pretrained vectors.

The pedagogy: token ids gain geometry. Students browse word vectors projected to
2D/3D, search a word, and watch its nearest neighbours light up — building the
intuition that *distance ≈ similarity*, and seeing where that breaks.

The golden rule (CLAUDE.md): the browser never trains. All the heavy work —
embedding thousands of words with a real model, PCA projection, k-means
clustering, nearest-neighbour search — happens **here**, offline. We export small
JSON files the browser just plots. "Offline precompute may run on a GPU" does not
violate the rule: the rule is about the *runtime*. We auto-select
`cuda → mps → cpu`; the browser/Vercel side needs no GPU, it only fetches JSON.

ONE multilingual model embeds the zh-TW AND English vocabs into ONE shared
space: a single PCA projection, a single k-means colouring, and neighbours
computed across the combined vocab — so 貓 can sit next to `cat`, and that
cross-lingual mixing *is* the lesson. Real vectors (not synthetic clusters) so
"distance ≈ similarity" is *earned*: we embed a large frequency-ranked vocabulary
(from committed word lists — see scripts/gen_vocab.py), then PCA to 3D and cosine
top-K in the ORIGINAL space. Categories come from k-means (hand-labels don't
scale to thousands of words), capped small so the cyan/purple palette reads.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np

# --- Config ------------------------------------------------------------------
# ONE multilingual embedder for both languages. A single model → a single vector
# space → zh and en vectors are directly comparable (two mono models would give
# two incomparable spaces that can never share a plot).
MODEL = "Qwen/Qwen3-Embedding-0.6B"
LANGUAGES = ("zh", "en")  # committed vocab lists (vocab.{lang}.txt), zh first

# TOP_K trimmed 30 → 15 when the two per-language clouds merged into one: the
# combined vocab is ~2× the words, so 30 neighbours each would double
# neighbors.json past its ~3.6 MB footprint. 15 keeps the file flat while the
# station's k-slider stays useful.
TOP_K = 15          # neighbours stored per word (station's k-slider caps here)
N_CLUSTERS = 8      # k-means groups for colouring (≤8 so the palette doesn't rainbow)
MAX_WORDS = 3610    # hard cap per language (keeps shipped JSON within budget)
PCA_CLIP_PCT = 98.0 # clip projected coords at this percentile before scaling
SEED = 42

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"

STATE_NPZ = "embedding_state.npz"


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


def _load_combined_vocab() -> tuple[list[str], list[str]]:
    """The union of the per-language word lists, each capped at MAX_WORDS.

    Returns (words, langs) with langs[i] the source list of words[i]. Duplicates
    across lists keep their first (zh) occurrence — one word, one point.
    """
    words: list[str] = []
    langs: list[str] = []
    seen: set[str] = set()
    for lang in LANGUAGES:
        vocab = _load_vocab(lang)
        if len(vocab) > MAX_WORDS:
            print(f"[{lang}] capping vocab {len(vocab)} → {MAX_WORDS} (size budget)")
            vocab = vocab[:MAX_WORDS]
        for w in vocab:
            if w in seen:
                continue
            seen.add(w)
            words.append(w)
            langs.append(lang)
    return words, langs


def _select_device() -> str:
    """Auto-pick the fastest available torch device: cuda → mps → cpu."""
    import torch

    if torch.cuda.is_available():
        return "cuda"
    if torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def load_encoder(device: str):
    """Load the shared multilingual encoder (SentenceTransformer)."""
    from sentence_transformers import SentenceTransformer

    return SentenceTransformer(MODEL, device=device)


def encode_words(encoder, words: list[str]) -> np.ndarray:
    """Embed `words` with the shared encoder. Returns L2-normalised [N, D].

    THE single pooling/prefix convention, imported by both this pipeline and the
    live server so a live embed lands exactly where precompute would put it:
    plain words with NO retrieval-instruction prefix (Qwen3-Embedding's query
    instruction is for asymmetric query→document retrieval and hurts symmetric
    word similarity; last-token pooling + EOS come from the model's own
    sentence-transformers config), `normalize_embeddings=True`.
    """
    vecs = encoder.encode(
        words,
        batch_size=64,
        normalize_embeddings=True,
        show_progress_bar=len(words) > 1,
        convert_to_numpy=True,
    )
    return np.asarray(vecs, dtype=np.float64)


def _pca_3d_params(vectors: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray, float]:
    """Fit the 3D-projection parameters: (mean, components, clip, denom).

    Real embeddings have outliers; scaling by the global max collapses the cloud
    into a central blob. We clip each axis at the 98th percentile of |coord|
    before scaling, so the bulk of the cloud fills the ~[-5, 5] frame. The
    parameters are returned (not folded away) so the live server can project a
    NOVEL word into exactly the same frame.
    """
    mean = vectors.mean(axis=0, keepdims=True)
    centered = vectors - mean
    _, _, vt = np.linalg.svd(centered, full_matrices=False)
    components = vt[:3]
    coords = centered @ components.T
    clip = np.percentile(np.abs(coords), PCA_CLIP_PCT, axis=0, keepdims=True)
    coords = np.clip(coords, -clip, clip)
    denom = float(np.abs(coords).max() + 1e-9)
    return mean, components, clip, denom


def project_3d(
    vectors: np.ndarray,
    mean: np.ndarray,
    components: np.ndarray,
    clip: np.ndarray,
    denom: float,
) -> np.ndarray:
    """Apply fitted projection params to any vectors (vocab or a typed word)."""
    coords = (vectors - mean) @ components.T
    coords = np.clip(coords, -clip, clip)
    return coords / denom * 5.0


def _cluster(
    vectors: np.ndarray, words: list[str]
) -> tuple[list[str], np.ndarray, list[str]]:
    """k-means into N_CLUSTERS groups; label each by its most-central word.

    Returns (per-word category label, cluster centroids, per-cluster name).
    Deterministic via a fixed random_state (mirrors the SEED convention). The
    centroids + names are exported so the live server can categorise a novel
    word by nearest centroid. Over the COMBINED vocab a cluster (and its name)
    can span both languages — that mixing is the point.
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
    return cats, km.cluster_centers_, [names[c] for c in range(n_clusters)]


def _neighbors(words: list[str], vectors: np.ndarray) -> dict[str, list[dict]]:
    """Top-K cosine neighbours per word, in the ORIGINAL embedding space.

    Vectors are already L2-normalised, so the Gram matrix is cosine similarity.
    Computed across the COMBINED vocab, so a zh word can surface en neighbours
    and vice-versa.
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
    files and is the easiest way to blow the size budget."""
    path.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    return path.stat().st_size


def compute_state(device: str) -> dict:
    """The full embedding-station "model state" over the combined vocab.

    Everything downstream — the shipped JSON artifacts AND the live server's
    npz export — is derived from this one dict, so the two can never come from
    different model instances.
    """
    words, langs = _load_combined_vocab()

    print(f"embedding {len(words)} words (zh+en combined) with {MODEL} on {device}…")
    encoder = load_encoder(device)
    vectors = encode_words(encoder, words)
    mean, components, clip, denom = _pca_3d_params(vectors)
    coords = project_3d(vectors, mean, components, clip, denom)
    cats, centroids, centroid_names = _cluster(vectors, words)
    neighbors = _neighbors(words, vectors)

    return {
        "model": MODEL,
        "words": words,
        "langs": langs,
        "vectors": vectors,
        "pca_mean": mean,
        "pca_components": components,
        "pca_clip": clip,
        "pca_denom": denom,
        "coords": coords,
        "categories": cats,
        "centroids": centroids,
        "centroid_names": centroid_names,
        "neighbors": neighbors,
    }


def state_points(state: dict) -> list[dict]:
    """Render a state dict into the points.json payload."""
    coords = state["coords"]
    return [
        {
            "word": w,
            "lang": state["langs"][i],
            "x": round(float(coords[i, 0]), 3),
            "y": round(float(coords[i, 1]), 3),
            "z": round(float(coords[i, 2]), 3),
            "category": state["categories"][i],
        }
        for i, w in enumerate(state["words"])
    ]


def save_server_state(state: dict, artifacts_dir: Path) -> Path:
    """Persist the live server's inputs as ONE npz.

    Vocab vectors are float32 (~28 MB — NOT committed; the artifacts dir is
    gitignored). The projection/cluster params stay float64 so a novel word is
    placed with the same arithmetic that placed the vocab.
    """
    artifacts_dir.mkdir(parents=True, exist_ok=True)
    # Retire the wave-2 per-language state files — one space, one npz.
    for stale in ("embedding_state.zh.npz", "embedding_state.en.npz"):
        p = artifacts_dir / stale
        if p.exists():
            p.unlink()
            print(f"removed stale {p.name}")
    path = artifacts_dir / STATE_NPZ
    np.savez_compressed(
        path,
        model=np.array(state["model"]),
        words=np.array(state["words"]),
        langs=np.array(state["langs"]),
        vectors=state["vectors"].astype(np.float32),
        pca_mean=state["pca_mean"],
        pca_components=state["pca_components"],
        pca_clip=state["pca_clip"],
        pca_denom=np.array(state["pca_denom"]),
        categories=np.array(state["categories"]),
        centroids=state["centroids"],
        centroid_names=np.array(state["centroid_names"]),
    )
    print(f"wrote {path} ({path.stat().st_size/1e6:.2f} MB)")
    return path


def verify_state_against_artifacts(state: dict, out_dir: Path) -> bool:
    """Check the freshly computed state reproduces the SHIPPED artifacts.

    This is the no-drift proof: if it passes, a live lookup lands exactly where
    the precomputed JSON puts it. Returns True when everything matches.
    """
    station_dir = out_dir / "embedding"
    pts_path = station_dir / "points.json"
    nbr_path = station_dir / "neighbors.json"
    if not pts_path.exists() or not nbr_path.exists():
        print(f"VERIFY SKIP: no shipped artifacts at {station_dir}")
        return False

    shipped_pts = json.loads(pts_path.read_text(encoding="utf-8"))
    shipped_nbr = json.loads(nbr_path.read_text(encoding="utf-8"))
    fresh_pts = state_points(state)

    ok = True
    if fresh_pts != shipped_pts:
        bad = sum(1 for a, b in zip(fresh_pts, shipped_pts) if a != b)
        print(f"VERIFY FAIL: {bad}/{len(fresh_pts)} points differ")
        ok = False
    if state["neighbors"] != shipped_nbr:
        bad = sum(1 for w in state["neighbors"] if state["neighbors"][w] != shipped_nbr.get(w))
        print(f"VERIFY FAIL: {bad}/{len(state['neighbors'])} neighbor lists differ")
        ok = False
    if ok:
        print("VERIFY OK: recomputed state reproduces shipped points + neighbors exactly")
    return ok


def _write_state(state: dict, out_dir: Path) -> list[dict]:
    """Write the unified points/neighbors JSON; return manifest entries."""
    neighbors = state["neighbors"]
    points = state_points(state)

    station_dir = out_dir / "embedding"
    station_dir.mkdir(parents=True, exist_ok=True)

    pts_path = station_dir / "points.json"
    nbr_path = station_dir / "neighbors.json"
    pts_bytes = _write_compact(pts_path, points)
    nbr_bytes = _write_compact(nbr_path, neighbors)

    print(
        f"wrote points.json ({pts_bytes/1e6:.2f} MB), "
        f"neighbors.json ({nbr_bytes/1e6:.2f} MB)"
    )
    for name, nbytes in (("points", pts_bytes), ("neighbors", nbr_bytes)):
        if nbytes > 4_000_000:
            print(
                f"WARNING: {name}.json is {nbytes/1e6:.2f} MB (> 4 MB budget) "
                f"— lower MAX_WORDS or TOP_K"
            )

    return [
        {
            "id": "embedding-points",
            "kind": "json",
            "path": "embedding/points.json",
            "station": "embedding",
            "bytes": pts_bytes,
        },
        {
            "id": "embedding-neighbors",
            "kind": "json",
            "path": "embedding/neighbors.json",
            "station": "embedding",
            "bytes": nbr_bytes,
        },
    ]


def remove_stale_lang_artifacts(out_dir: Path) -> None:
    """Delete the retired per-language JSON files (wave-2 layout)."""
    station_dir = out_dir / "embedding"
    for lang in LANGUAGES:
        for kind in ("points", "neighbors"):
            p = station_dir / f"{kind}.{lang}.json"
            if p.exists():
                p.unlink()
                print(f"removed stale {p.name}")


def build_embedding(out_dir: Path) -> list[dict]:
    """Write the unified points/neighbors under <out_dir>/embedding/.

    Returns the manifest `artifacts[]` entries for the caller to register.
    Also removes the retired per-language JSON files if present.
    """
    device = _select_device()
    remove_stale_lang_artifacts(out_dir)
    state = compute_state(device)
    return _write_state(state, out_dir)


def export_server_state(
    out_dir: Path, artifacts_dir: Path, write_artifacts: bool = False
) -> bool:
    """Export the live server's state npz.

    Re-runs the embedding pipeline (same code path as the artifact build) and
    verifies the result reproduces the SHIPPED points/neighbors JSON — the
    proof that live output will match the precomputed baseline. With
    `write_artifacts=True` the JSON artifacts are (re)written from the same
    state, guaranteeing npz + JSON come from one model instance.

    Returns True when the state verified clean.
    """
    device = _select_device()
    state = compute_state(device)
    if write_artifacts:
        remove_stale_lang_artifacts(out_dir)
        _write_state(state, out_dir)
    ok = verify_state_against_artifacts(state, out_dir)
    save_server_state(state, artifacts_dir)
    return ok
