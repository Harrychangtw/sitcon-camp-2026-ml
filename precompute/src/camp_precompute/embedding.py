"""Build the Course 2 *embedding* station artifacts.

The pedagogy: token ids gain geometry. Students browse word vectors projected to
2D/3D, search a word, and watch its nearest neighbours light up — building the
intuition that *distance ≈ similarity*, and seeing where that breaks.

The golden rule (CLAUDE.md): the browser never trains. All the heavy work —
building vectors, PCA projection, nearest-neighbour search — happens **here**,
offline. We export two small JSON files the browser just plots.

We don't ship real pretrained word2vec/GloVe here (that needs a multi-hundred-MB
download and network). Instead we synthesise vectors with a clear, deliberate
cluster structure: each semantic category gets a well-separated centroid in a
high-dimensional space, and each word is that centroid plus a little noise. This
is honest for the lesson — the *shape* of the data (tight clusters, distance =
similarity, a couple of words that sit between clusters) is exactly what real
embeddings show, without pretending to be trained vectors.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np

# --- The curated vocabulary --------------------------------------------------
# A few hundred everyday words in clear semantic clusters. Kept concrete and
# high-school friendly (animals, colors, numbers, countries, fruits, body,
# vehicles, family).
VOCAB: dict[str, list[str]] = {
    "animal": [
        "dog", "cat", "horse", "cow", "lion", "tiger", "bear", "wolf", "fox",
        "deer", "rabbit", "mouse", "elephant", "monkey", "sheep", "goat", "pig",
        "chicken", "duck", "eagle", "owl", "snake", "frog", "whale", "dolphin",
        "shark", "giraffe", "zebra", "kangaroo", "camel",
    ],
    "color": [
        "red", "blue", "green", "yellow", "purple", "pink", "brown", "black",
        "white", "gray", "cyan", "magenta", "violet", "indigo", "turquoise",
        "crimson", "scarlet", "teal", "maroon", "beige",
    ],
    "number": [
        "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
        "ten", "eleven", "twelve", "hundred", "thousand", "million", "dozen",
        "zero", "half", "quarter", "double",
    ],
    "country": [
        "france", "germany", "spain", "italy", "japan", "china", "india",
        "brazil", "canada", "mexico", "egypt", "russia", "greece", "sweden",
        "norway", "korea", "thailand", "vietnam", "portugal", "poland",
    ],
    "fruit": [
        "apple", "banana", "cherry", "grape", "lemon", "mango", "peach", "pear",
        "plum", "melon", "kiwi", "pineapple", "strawberry", "raspberry",
        "apricot", "coconut", "fig", "papaya", "lime", "blueberry",
    ],
    "body": [
        "head", "arm", "leg", "hand", "foot", "finger", "eye", "ear", "nose",
        "mouth", "shoulder", "knee", "elbow", "wrist", "ankle", "chest", "back",
        "neck", "thumb", "heel",
    ],
    "vehicle": [
        "car", "truck", "bus", "train", "plane", "boat", "ship", "bicycle",
        "motorcycle", "helicopter", "submarine", "scooter", "tram", "van",
        "taxi", "ferry", "jet", "yacht", "canoe", "wagon",
    ],
    "family": [
        "mother", "father", "sister", "brother", "daughter", "son", "aunt",
        "uncle", "cousin", "grandmother", "grandfather", "nephew", "niece",
        "parent", "child", "wife", "husband", "twin", "sibling", "spouse",
    ],
}

# --- Polysemes: words that live BETWEEN two clusters -------------------------
# The "where distance ≈ similarity breaks" beat. Each is built as a deliberate
# blend of two category centroids, so PCA lands it *between* the two clusters
# and its nearest-neighbour list mixes both senses. `category` is the label we
# color it as; the surprise is that it doesn't sit with its own kind.
POLYSEMES: list[tuple[str, str, str, str]] = [
    # (word, shown-category, sense A, sense B)
    ("orange", "fruit", "fruit", "color"),
    ("turkey", "country", "country", "animal"),
    ("crane", "animal", "animal", "vehicle"),
]

DIM = 48          # dimensionality of the "embedding" space
CENTROID = 1.0    # centroid magnitude (unit; cluster separation)
NOISE = 0.02      # per-word jitter around the centroid (cluster tightness)
BLEND = 0.62      # weight on each sense for a polyseme (>0.5 = pulled outward)
TOP_K = 15        # neighbours stored per word (station's k-slider caps at this)
SEED = 42


def _build_vectors() -> tuple[list[str], list[str], np.ndarray]:
    """Return (words, categories, vectors[N, DIM]) — deterministic."""
    rng = np.random.default_rng(SEED)

    # One well-separated centroid per category. Random normals in high-D are
    # near-orthogonal, which is exactly the separation we want. We normalise each
    # to the SAME magnitude so a polyseme built from two centroids is genuinely
    # symmetric between them (otherwise tiny norm differences make one sense win
    # every neighbour slot, and the "sits between two clusters" beat is lost).
    categories = list(VOCAB.keys())
    centroids = {}
    for c in categories:
        v = rng.normal(size=DIM)
        centroids[c] = v / np.linalg.norm(v) * CENTROID

    words: list[str] = []
    cats: list[str] = []
    vecs: list[np.ndarray] = []

    for cat, members in VOCAB.items():
        for w in members:
            words.append(w)
            cats.append(cat)
            vecs.append(centroids[cat] + rng.normal(size=DIM) * NOISE)

    # Polysemes: blend two centroids so the word sits between the clusters.
    for word, shown_cat, sense_a, sense_b in POLYSEMES:
        blended = (
            BLEND * centroids[sense_a]
            + BLEND * centroids[sense_b]
            + rng.normal(size=DIM) * NOISE
        )
        words.append(word)
        cats.append(shown_cat)
        vecs.append(blended)

    return words, cats, np.asarray(vecs)


def _pca_3d(vectors: np.ndarray) -> np.ndarray:
    """Project to the top-3 principal components (2D mode just drops z)."""
    centered = vectors - vectors.mean(axis=0, keepdims=True)
    # SVD of the centered matrix: columns of Vt are the principal axes.
    _, _, vt = np.linalg.svd(centered, full_matrices=False)
    coords = centered @ vt[:3].T
    # Scale to a comfortable ~[-5, 5] range so the viz camera framing is stable.
    coords = coords / (np.abs(coords).max() + 1e-9) * 5.0
    return coords


def _neighbors(words: list[str], vectors: np.ndarray) -> dict[str, list[dict]]:
    """Top-K cosine neighbours per word, computed in the ORIGINAL space."""
    norms = np.linalg.norm(vectors, axis=1, keepdims=True)
    unit = vectors / (norms + 1e-9)
    sims = unit @ unit.T  # [N, N] cosine similarity
    np.fill_diagonal(sims, -np.inf)  # never a word's own neighbour

    out: dict[str, list[dict]] = {}
    for i, w in enumerate(words):
        order = np.argsort(sims[i])[::-1][:TOP_K]
        out[w] = [
            {"word": words[j], "score": round(float(sims[i, j]), 4)}
            for j in order
        ]
    return out


def build_embedding(out_dir: Path) -> list[dict]:
    """Write points.json + neighbors.json under <out_dir>/embedding/.

    Returns the manifest `artifacts[]` entries for the caller to register.
    """
    words, cats, vectors = _build_vectors()
    coords = _pca_3d(vectors)
    neighbors = _neighbors(words, vectors)

    points = [
        {
            "word": w,
            "x": round(float(coords[i, 0]), 4),
            "y": round(float(coords[i, 1]), 4),
            "z": round(float(coords[i, 2]), 4),
            "category": cats[i],
        }
        for i, w in enumerate(words)
    ]

    station_dir = out_dir / "embedding"
    station_dir.mkdir(parents=True, exist_ok=True)

    (station_dir / "points.json").write_text(
        json.dumps(points, indent=2) + "\n", encoding="utf-8"
    )
    (station_dir / "neighbors.json").write_text(
        json.dumps(neighbors, indent=2) + "\n", encoding="utf-8"
    )

    return [
        {
            "id": "embedding-points",
            "kind": "json",
            "path": "embedding/points.json",
            "station": "embedding",
        },
        {
            "id": "embedding-neighbors",
            "kind": "json",
            "path": "embedding/neighbors.json",
            "station": "embedding",
        },
    ]
