"""Load every model + vocab into memory ONCE, at startup (FastAPI lifespan).

Never load per request. The models are the SAME ones the precompute pipeline
uses:

- embedding: the pretrained BGE encoders (via camp_precompute's MODELS map) on
  the resolved device, plus the exported npz state (vocab vectors, PCA params,
  k-means centroids) written by `camp-precompute export-embedding-state`, plus
  the shipped points/neighbors JSON so in-vocab lookups return the artifact
  values verbatim.
- next-token: the bigram/unigram tables, rebuilt deterministically by importing
  camp_precompute.cli.build_next_token_tables (pure counting — no file).
- rnn: the fixed-seed weights + preset vocab embeddings, rebuilt
  deterministically by importing camp_precompute.rnn.build_rnn_state.
- transformer: pure functions of the tokens (camp_precompute.cli
  .build_transformer_sentence) — nothing to preload beyond the import.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from camp_precompute import embedding as emb_mod
from camp_precompute.rnn import build_rnn_state

from .config import Settings, resolve_device

log = logging.getLogger("camp-server")


@dataclass
class LangEmbedding:
    encoder: object  # SentenceTransformer
    words: list[str]
    word_index: dict[str, int]
    vectors: np.ndarray  # [N, D] float32, L2-normalised
    pca_mean: np.ndarray
    pca_components: np.ndarray
    pca_clip: np.ndarray
    pca_denom: float
    centroids: np.ndarray
    centroid_names: list[str]
    points: dict[str, dict]  # word → shipped points.{lang}.json element
    neighbors: dict[str, list[dict]]  # word → shipped neighbors.{lang}.json list


@dataclass
class ModelStore:
    settings: Settings
    device: str
    gpu: str | None
    embeddings: dict[str, LangEmbedding]
    next_token: dict
    rnn_w_h: np.ndarray
    rnn_w_x: np.ndarray
    rnn_b: np.ndarray
    rnn_emb: dict[str, np.ndarray]

    @property
    def model_names(self) -> list[str]:
        return [
            *(f"embedding:{emb_mod.MODELS[lang]}" for lang in sorted(self.embeddings)),
            "next-token:bigram",
            "rnn:fixed-weights",
            "transformer:synthetic-attention",
        ]


def _load_lang(lang: str, device: str, weights_dir: Path, data_dir: Path) -> LangEmbedding:
    from sentence_transformers import SentenceTransformer

    npz_path = weights_dir / f"embedding_state.{lang}.npz"
    if not npz_path.exists():
        raise SystemExit(
            f"camp-server: missing {npz_path}. Run "
            f"`uv run camp-precompute export-embedding-state` in precompute/ "
            f"(or copy precompute/artifacts/ from the machine that generated "
            f"the shipped JSON) before starting the server."
        )
    state = np.load(npz_path, allow_pickle=False)

    pts_path = data_dir / "embedding" / f"points.{lang}.json"
    nbr_path = data_dir / "embedding" / f"neighbors.{lang}.json"
    points_list = json.loads(pts_path.read_text(encoding="utf-8"))
    neighbors = json.loads(nbr_path.read_text(encoding="utf-8"))

    model_name = str(state["model"])
    log.info("[%s] loading %s on %s…", lang, model_name, device)
    encoder = SentenceTransformer(model_name, device=device)
    encoder.eval()

    words = [str(w) for w in state["words"]]
    return LangEmbedding(
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

    embeddings = {
        lang: _load_lang(lang, device, settings.weights_dir, settings.data_dir)
        for lang in emb_mod.LANGUAGES
    }

    from camp_precompute.cli import build_next_token_tables

    w_h, w_x, b, rnn_emb = build_rnn_state()

    store = ModelStore(
        settings=settings,
        device=device,
        gpu=gpu,
        embeddings=embeddings,
        next_token=build_next_token_tables(),
        rnn_w_h=w_h,
        rnn_w_x=w_x,
        rnn_b=b,
        rnn_emb=rnn_emb,
    )
    log.info("models ready: %s", ", ".join(store.model_names))
    return store


def encode_word(store: ModelStore, lang: str, word: str) -> np.ndarray:
    """Embed one word exactly the way precompute embedded the vocab: BGE,
    L2-normalised, NO retrieval instruction prefix. Deterministic (eval mode,
    no dropout, no sampling)."""
    import torch

    lang_state = store.embeddings[lang]
    with torch.no_grad():
        vec = lang_state.encoder.encode(
            [word],
            batch_size=1,
            normalize_embeddings=True,
            show_progress_bar=False,
            convert_to_numpy=True,
        )
    return np.asarray(vec, dtype=np.float64)[0]
