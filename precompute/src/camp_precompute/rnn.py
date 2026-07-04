"""Build the Course 2 *rnn-viz* station artifact.

The pedagogy: the first real answer to "how do we handle order" is to **carry a
hidden state along the sequence**. Students step through a sequence token by
token and watch the hidden-state vector evolve — then feel the wall: the earliest
token's fingerprint washes out of a single fixed-size vector (long-range
dependencies decay), which motivates attention next.

The golden rule (CLAUDE.md): the browser never runs the RNN. All the heavy work —
the forward pass through a small vanilla RNN — happens **here**, offline. We
export the hidden-state vector at every timestep as small JSON; the browser just
replays it on a heatmap.

We don't ship a trained language model (that needs weights + a runtime). Instead
we build a small, deterministic vanilla RNN with **fixed random weights**. The
one thing that matters for the lesson is that the recurrence is **contractive**
(spectral radius of W_h < 1) and the inputs are **modest**, so tanh stays in its
interior: the state evolves smoothly and — crucially — the influence of the first
token *decays* rather than saturating or exploding. That decay is the wall.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

# Small, legible dimensions so the heatmap is readable (16 rows) and the JSON
# stays tiny. The input embedding is deliberately low-dim; only the hidden state
# is shown.
HIDDEN_SIZE = 16
INPUT_SIZE = 8

# Contractive recurrence: we rescale W_h to this spectral radius. Below 1 so the
# state (and any single token's fingerprint) decays instead of blowing up;
# high enough that the state doesn't die in one step. Tuned so the token-0
# influence signal falls smoothly and monotonically across ~8 steps.
SPECTRAL_RADIUS = 0.85
INPUT_SCALE = 0.6  # keep tanh in its interior — modest inputs, legible structure

SEED = 20260702

# Seed namespace for tokens OUTSIDE the preset vocab (live server input). Each
# unseen token gets a deterministic embedding from a crc32-derived seed, so the
# same typed word always drives the RNN identically — while the preset vocab
# keeps the ORIGINAL rng-stream embeddings (so live output for the preset
# sequences matches the precomputed artifact exactly).
_LIVE_EMB_NAMESPACE = "camp-rnn-live-emb"

# Short, concrete sentences. Length ~8 so the decay is visible across the row.
SEQUENCES: list[dict] = [
    {
        "sequenceId": "cat-on-the-mat",
        "label": "the cat sat on the mat by the door",
        "tokens": ["the", "cat", "sat", "on", "the", "mat", "by", "the", "door"],
    },
    {
        "sequenceId": "never-very-happy",
        "label": "she never said she was very happy today",
        "tokens": ["she", "never", "said", "she", "was", "very", "happy", "today"],
    },
    {
        "sequenceId": "robot-learned-to-read",
        "label": "a small robot slowly learned to read text",
        "tokens": ["a", "small", "robot", "slowly", "learned", "to", "read", "text"],
    },
]


def _build_weights(rng: np.random.Generator) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Fixed vanilla-RNN weights: a contractive W_h, a modest W_x, zero bias."""
    w_h = rng.standard_normal((HIDDEN_SIZE, HIDDEN_SIZE))
    # Rescale to a known spectral radius (largest |eigenvalue|) so the recurrence
    # is contractive — this is what makes early signal *fade*.
    radius = max(np.abs(np.linalg.eigvals(w_h)).max(), 1e-9)
    w_h = w_h * (SPECTRAL_RADIUS / radius)

    w_x = rng.standard_normal((HIDDEN_SIZE, INPUT_SIZE)) * INPUT_SCALE
    b = np.zeros(HIDDEN_SIZE)
    return w_h, w_x, b


def _forward(
    embeddings: np.ndarray,
    w_h: np.ndarray,
    w_x: np.ndarray,
    b: np.ndarray,
) -> np.ndarray:
    """Run the vanilla RNN. Returns the hidden state AFTER each token, shape
    (steps, HIDDEN_SIZE)."""
    h = np.zeros(HIDDEN_SIZE)
    states = []
    for x in embeddings:
        h = np.tanh(w_h @ h + w_x @ x + b)
        states.append(h.copy())
    return np.array(states)


def build_rnn_state() -> tuple[np.ndarray, np.ndarray, np.ndarray, dict[str, np.ndarray]]:
    """The model: weights + the preset-vocab embedding table.

    Fully deterministic from SEED, so both the artifact build and the live
    server rebuild the *same* model by calling this — no weight file to drift.
    The rng stream order (weights first, then embeddings over the SORTED vocab)
    is load-bearing: changing it changes every shipped artifact.
    """
    rng = np.random.default_rng(SEED)
    w_h, w_x, b = _build_weights(rng)

    # One fixed random embedding per distinct token across all sequences, so a
    # repeated word ("the") drives the RNN identically each time it appears.
    vocab = sorted({t for seq in SEQUENCES for t in seq["tokens"]})
    emb = {tok: rng.standard_normal(INPUT_SIZE) for tok in vocab}
    return w_h, w_x, b, emb


def token_embedding(token: str, emb: dict[str, np.ndarray]) -> np.ndarray:
    """Embedding for any token: the preset table when known, otherwise a
    deterministic crc32-seeded vector (same word → same vector, every request)."""
    import zlib

    known = emb.get(token)
    if known is not None:
        return known
    seed = zlib.crc32(f"{_LIVE_EMB_NAMESPACE}|{token}".encode("utf-8"))
    return np.random.default_rng(seed).standard_normal(INPUT_SIZE)


def run_sequence(
    tokens: list[str],
    w_h: np.ndarray,
    w_x: np.ndarray,
    b: np.ndarray,
    emb: dict[str, np.ndarray],
) -> tuple[list[list[float]], list[float]]:
    """Forward a token sequence; return (hidden, influence) rounded like the
    artifact. `influence` re-runs with the FIRST token's input zeroed and takes
    the normalized L2 divergence at each step — the fingerprint that decays.
    """
    xs = np.array([token_embedding(t, emb) for t in tokens])

    states = _forward(xs, w_h, w_x, b)

    # Ablate the first token (zero its input) and re-run: the divergence
    # between the two runs at each step is the first token's lingering
    # fingerprint.
    xs_ablated = xs.copy()
    xs_ablated[0] = 0.0
    states_ablated = _forward(xs_ablated, w_h, w_x, b)

    diff = np.linalg.norm(states - states_ablated, axis=1)
    base = diff[0] if diff[0] > 1e-9 else 1.0
    influence = diff / base

    hidden = [[round(float(v), 4) for v in step] for step in states]
    return hidden, [round(float(v), 4) for v in influence]


def build_rnn_viz() -> dict:
    """Build the rnn-viz activations payload (pure data, no I/O).

    For each sequence we export the hidden-state vector at every step, plus an
    `influence` trace: how much the first token still moves the hidden state at
    each step. We measure it by re-running the forward pass with the FIRST
    token's input removed (zeroed) and taking the L2 distance between the two
    hidden states at each step, normalized so step 0 = 1.0. It decays toward 0 —
    the earliest token's fingerprint fading is exactly the wall the station names.
    """
    w_h, w_x, b, emb = build_rnn_state()

    out_sequences = []
    for spec in SEQUENCES:
        tokens = spec["tokens"]
        hidden, influence = run_sequence(tokens, w_h, w_x, b, emb)
        out_sequences.append(
            {
                "sequenceId": spec["sequenceId"],
                "label": spec["label"],
                "tokens": tokens,
                "hidden": hidden,
                "influence": influence,
            }
        )

    return {
        "generator": "camp-precompute rnn-viz",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "station": "rnn-viz",
        "note": (
            "Hidden-state activations from a small, fixed-weight vanilla RNN "
            "(h_t = tanh(W_h h_{t-1} + W_x x_t)). W_h is rescaled to a spectral "
            "radius < 1 so the recurrence is contractive. `hidden[step]` is the "
            "hidden vector after consuming that token; `influence[step]` is the "
            "normalized L2 divergence when the FIRST token's input is ablated — "
            "it decays as the earliest token's fingerprint washes out. Values are "
            "tanh outputs in [-1, 1] (signed → diverging heatmap)."
        ),
        "hiddenSize": HIDDEN_SIZE,
        "sequences": out_sequences,
    }


def rnn_viz(out_dir: Path) -> Path:
    """Write rnn-viz/activations.json and register it in the manifest."""
    from .cli import upsert_manifest_artifact

    station_dir = out_dir / "rnn-viz"
    station_dir.mkdir(parents=True, exist_ok=True)

    payload = build_rnn_viz()
    art_path = station_dir / "activations.json"
    art_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")

    upsert_manifest_artifact(
        out_dir,
        {
            "id": "rnn-viz-activations",
            "kind": "json",
            "path": "rnn-viz/activations.json",
            "station": "rnn-viz",
            "bytes": art_path.stat().st_size,
            "description": (
                "Per-timestep hidden-state vectors from a small fixed-weight "
                "vanilla RNN, plus a token-0 influence-decay trace. Replayed on a "
                "heatmap; the browser never runs the RNN."
            ),
        },
    )
    return art_path
