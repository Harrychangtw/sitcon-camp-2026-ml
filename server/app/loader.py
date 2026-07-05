"""Load every model + vocab into memory ONCE, at startup (FastAPI lifespan).

Never load per request. The models are the SAME ones the precompute pipeline
uses (imported from camp_precompute), with the same settings:

- embedding: the ONE multilingual encoder (camp_precompute.embedding.MODEL)
  on the resolved device, plus the exported npz state (combined zh+en vocab
  vectors, PCA params, k-means centroids) written by
  `camp-precompute export-embedding-state`, plus the shipped points/neighbors
  JSON so in-vocab lookups return the artifact values verbatim.
- lm: Qwen3-0.6B (camp_precompute.qwen — float32, eager attention, eval,
  no sampling), serving next-token, transformer attention, and order-shuffle
  fluency. Loaded once; ~2.4 GB VRAM.
- rnn: the TRAINED GRU language model exported by `camp-precompute train-rnn`
  (rnn_state.npz — real weights, not random).

Concurrency: deliberately ONE process on ONE device. A 0.6B model answers a
short prompt in tens of ms, but a class of ~40 students hitting Enter together
will queue (FastAPI runs these sync endpoints in a threadpool; `lm_lock` below
serialises GPU forwards so they queue predictably instead of interleaving).
Scaling to the 4× V100 box means N uvicorn workers pinned via
CUDA_VISIBLE_DEVICES=0..3 behind the existing reverse proxy, OR a batching
queue — future work, not now (see README).
"""

from __future__ import annotations

import json
import logging
import threading
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

from camp_precompute import embedding as emb_mod
from camp_precompute import qwen as qwen_mod
from camp_precompute.rnn import RnnState, load_rnn_state

from .config import Settings, resolve_device

log = logging.getLogger("camp-server")


@dataclass
class EmbeddingState:
    encoder: object  # SentenceTransformer (the shared multilingual model)
    words: list[str]
    word_index: dict[str, int]
    vectors: np.ndarray  # [N, D] float32, L2-normalised, combined zh+en vocab
    pca_mean: np.ndarray
    pca_components: np.ndarray
    pca_clip: np.ndarray
    pca_denom: float
    centroids: np.ndarray
    centroid_names: list[str]
    points: dict[str, dict]  # word → shipped points.json element
    neighbors: dict[str, list[dict]]  # word → shipped neighbors.json list


@dataclass
class ModelStore:
    settings: Settings
    device: str
    gpu: str | None
    embedding: EmbeddingState
    qwen_tok: object
    qwen_model: object
    rnn: RnnState
    # Serialises Qwen forwards across request threads: concurrent students
    # queue (predictable tens-of-ms each) instead of interleaving CUDA work.
    lm_lock: threading.Lock = field(default_factory=threading.Lock)

    @property
    def model_names(self) -> list[str]:
        return [
            f"embedding:{emb_mod.MODEL}",
            f"lm:{qwen_mod.MODEL}",
            "rnn:trained-gru16-alice",
        ]


def _load_embedding(device: str, weights_dir: Path, data_dir: Path) -> EmbeddingState:
    npz_path = weights_dir / emb_mod.STATE_NPZ
    if not npz_path.exists():
        raise SystemExit(
            f"camp-server: missing {npz_path}. Run "
            f"`uv run camp-precompute export-embedding-state` in precompute/ "
            f"(or copy precompute/artifacts/ from the machine that generated "
            f"the shipped JSON) before starting the server."
        )
    state = np.load(npz_path, allow_pickle=False)

    pts_path = data_dir / "embedding" / "points.json"
    nbr_path = data_dir / "embedding" / "neighbors.json"
    points_list = json.loads(pts_path.read_text(encoding="utf-8"))
    neighbors = json.loads(nbr_path.read_text(encoding="utf-8"))

    model_name = str(state["model"])
    if model_name != emb_mod.MODEL:
        raise SystemExit(
            f"camp-server: {npz_path} was exported with {model_name} but "
            f"camp_precompute expects {emb_mod.MODEL} — re-run "
            f"`camp-precompute export-embedding-state`."
        )
    log.info("loading %s on %s…", model_name, device)
    encoder = emb_mod.load_encoder(device)
    encoder.eval()

    words = [str(w) for w in state["words"]]
    return EmbeddingState(
        encoder=encoder,
        words=words,
        word_index={w: i for i, w in enumerate(words)},
        vectors=state["vectors"],
        pca_mean=state["pca_mean"],
        pca_components=state["pca_components"],
        pca_clip=state["pca_clip"],
        pca_denom=float(state["pca_denom"]),
        centroids=state["centroids"],
        centroid_names=[str(n) for n in state["centroid_names"]],
        points={p["word"]: p for p in points_list},
        neighbors=neighbors,
    )


def load_models(settings: Settings) -> ModelStore:
    import torch

    device = resolve_device(settings.device)
    gpu = None
    if device.startswith("cuda") and torch.cuda.is_available():
        gpu = torch.cuda.get_device_name(torch.device(device))
    # The operator's which-machine-did-it-land-on check (runbook smoke test).
    log.info(
        "resolved device=%s gpu=%s (torch %s, cuda available=%s, %d visible)",
        device,
        gpu or "-",
        torch.__version__,
        torch.cuda.is_available(),
        torch.cuda.device_count() if torch.cuda.is_available() else 0,
    )

    embedding = _load_embedding(device, settings.weights_dir, settings.data_dir)

    log.info("loading %s on %s…", qwen_mod.MODEL, device)
    qwen_tok, qwen_model = qwen_mod.load_qwen(device)

    rnn_state = load_rnn_state(settings.weights_dir)

    store = ModelStore(
        settings=settings,
        device=device,
        gpu=gpu,
        embedding=embedding,
        qwen_tok=qwen_tok,
        qwen_model=qwen_model,
        rnn=rnn_state,
    )
    log.info("models ready: %s", ", ".join(store.model_names))
    return store


def encode_word(store: ModelStore, word: str) -> np.ndarray:
    """Embed one word exactly the way precompute embedded the vocab: the same
    camp_precompute.embedding.encode_words helper (same pooling, no instruction
    prefix, L2-normalised). Deterministic (eval mode, no dropout, no sampling)."""
    import torch

    with torch.no_grad():
        vecs = emb_mod.encode_words(store.embedding.encoder, [word])
    return vecs[0]


def encode_words(store: ModelStore, words: list[str]) -> np.ndarray:
    """Batch variant of encode_word (order-shuffle's bag-of-words vectors)."""
    import torch

    with torch.no_grad():
        return emb_mod.encode_words(store.embedding.encoder, words)
