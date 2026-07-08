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
import os
import threading
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

from camp_precompute import embedding as emb_mod
from camp_precompute import lora as lora_mod
from camp_precompute import qwen as qwen_mod
from camp_precompute import steering as steering_mod
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
    # The SAME Qwen instance wrapped with the persona LoRA adapters (weights
    # under <weights_dir>/lora/, trained by `camp-precompute train-lora`), or
    # None when no adapters are installed (→ /lora/generate answers 503 and the
    # station stays on presets). Adapters idle DISABLED, so every other router
    # keeps seeing exact base behaviour; the lora router enables one inside
    # lm_lock and detaches it again before releasing.
    lora_model: object | None = None
    lora_adapters: list[str] = field(default_factory=list)
    # The steering station's concept directions (contrastive activation-
    # addition vectors under <weights_dir>/steering/directions.npz, computed by
    # `camp-precompute steering-vectors`), or None when not installed (→
    # /steering/generate answers 503 and the station stays on presets). The
    # steering router adds a forward hook to the shared Qwen inside lm_lock and
    # removes it before releasing, so every other route sees exact base
    # behaviour.
    steering: steering_mod.SteeringState | None = None
    # SD-Turbo pipeline for the diffusion station's live "type any prompt" path,
    # or None when the diffusion live path is off (CAMP_ENABLE_DIFFUSION unset or
    # diffusers not installed) → /diffusion/generate answers 503 and the station
    # stays on its shipped presets. Its own lock: a denoise holds the GPU for a
    # few seconds and must not block the tens-of-ms Qwen forwards under lm_lock.
    diffusion_pipe: object | None = None
    diffusion_lock: threading.Lock = field(default_factory=threading.Lock)
    # Serialises Qwen forwards across request threads: concurrent students
    # queue (predictable tens-of-ms each) instead of interleaving CUDA work.
    lm_lock: threading.Lock = field(default_factory=threading.Lock)

    @property
    def model_names(self) -> list[str]:
        names = [
            f"embedding:{emb_mod.MODEL}",
            f"lm:{qwen_mod.MODEL}",
            "rnn:trained-gru16-alice",
        ]
        if self.lora_adapters:
            names.append(f"lora:{'+'.join(self.lora_adapters)}")
        if self.steering is not None:
            names.append(f"steering:{'+'.join(self.steering.ids)}")
        if self.diffusion_pipe is not None:
            from camp_precompute import diffusion as diffusion_mod

            names.append(f"diffusion:{diffusion_mod.MODEL}")
        return names


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
        # Under the replicated multi-GPU deploy each process is pinned to one
        # physical card via CUDA_VISIBLE_DEVICES, so "cuda:0" is ambiguous
        # across replicas; tag the reported GPU with the mask so journalctl
        # and /health show which physical card this process landed on.
        visible = os.environ.get("CUDA_VISIBLE_DEVICES")
        if visible:
            gpu = f"{gpu} (CUDA_VISIBLE_DEVICES={visible})"
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

    # Persona LoRA adapters — optional: without them the lora station's live
    # path degrades to its precomputed presets, everything else is unaffected.
    lora_model, lora_ids = lora_mod.attach_adapters(qwen_model, settings.weights_dir)
    if lora_model is None:
        log.warning(
            "lora: no trained adapters under %s — /lora/generate will answer "
            "503 (station falls back to shipped presets). Run "
            "`uv run camp-precompute train-lora` to install them.",
            lora_mod.lora_weights_dir(settings.weights_dir),
        )
    else:
        log.info("lora: attached adapters (idle-disabled): %s", ", ".join(lora_ids))

    # Steering concept directions — optional: without them the steering
    # station's live path degrades to its shipped presets (which, on the dev
    # sample, are hand-authored anyway).
    steering_state = steering_mod.load_directions(settings.weights_dir)
    if steering_state is None:
        log.warning(
            "steering: no directions under %s — /steering/generate will answer "
            "503 (station falls back to shipped presets). Run "
            "`uv run camp-precompute steering-vectors` to install them.",
            steering_mod.directions_path(settings.weights_dir),
        )
    else:
        log.info(
            "steering: loaded directions (layer %d): %s",
            steering_state.layer,
            ", ".join(steering_state.ids),
        )

    # SD-Turbo for the diffusion live path — optional, off unless explicitly
    # enabled (it needs the `gpu` extra + a few GB of extra VRAM). A failure to
    # load never sinks the server: the station just stays on its shipped presets.
    diffusion_pipe = None
    if settings.enable_diffusion:
        from camp_precompute import diffusion as diffusion_mod

        try:
            log.info("loading %s on %s…", diffusion_mod.MODEL, device)
            diffusion_pipe = diffusion_mod.load_pipeline(device)
            log.info("diffusion: SD-Turbo ready")
        except Exception as exc:  # noqa: BLE001 — degrade, don't crash the server
            log.warning(
                "diffusion: failed to load %s (%s) — /diffusion/generate will "
                "answer 503 (station falls back to shipped presets). Install the "
                "`gpu` extra (`uv sync --extra gpu`) to enable it.",
                diffusion_mod.MODEL,
                exc,
            )
    else:
        log.info(
            "diffusion: live path off (CAMP_ENABLE_DIFFUSION unset) — "
            "/diffusion/generate answers 503, station uses shipped presets."
        )

    store = ModelStore(
        settings=settings,
        device=device,
        gpu=gpu,
        embedding=embedding,
        qwen_tok=qwen_tok,
        qwen_model=qwen_model,
        rnn=rnn_state,
        lora_model=lora_model,
        lora_adapters=lora_ids,
        steering=steering_state,
        diffusion_pipe=diffusion_pipe,
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
