"""Build the Course 2 *rnn-viz* station artifact — from a REAL trained RNN.

The pedagogy: the first real answer to "how do we handle order" is to **carry a
hidden state along the sequence**. Students step through a sequence token by
token and watch the hidden-state vector evolve — then feel the wall: the earliest
token's fingerprint washes out of a single fixed-size vector (long-range
dependencies decay), which motivates attention next.

Wave 3 upgrade: the weights are no longer fixed random noise. `camp-precompute
train-rnn` trains a small word-level GRU language model (hidden 16) on a modest
public-domain corpus and exports the weights as one npz (gitignored, like the
embedding state). The artifact build AND the live server both load that npz and
run the SAME numpy forward pass below — so presets are recorded real-model
outputs and a preset typed live reproduces its shipped values.

Corpus: "Alice's Adventures in Wonderland" (Project Gutenberg ebook #11, public
domain), committed at precompute/data/rnn_corpus.txt with the Gutenberg
header/footer stripped. ~27k words — a GRU this small trains on it in well
under a minute on GPU (and only minutes on CPU).

The golden rule still holds: the browser never runs the RNN. Training happens
here; the server does one tiny forward per request; the browser replays JSON.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

# Small, legible dimensions: 16 hidden dims = 16 readable heatmap rows.
HIDDEN_SIZE = 16
EMBED_SIZE = 16

# Words seen fewer than MIN_FREQ times in the corpus fold into <unk> — and so
# does ANY out-of-corpus word a student types (typing is unrestricted; unknown
# words are honest <unk>s, not crashes).
MIN_FREQ = 2
UNK = "<unk>"

SEED = 20260704
EPOCHS = 30
BPTT = 32          # training chunk length
BATCH = 64
LR = 3e-3

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"
CORPUS_TXT = "rnn_corpus.txt"
STATE_NPZ = "rnn_state.npz"

# Preset sequences — every word is in the training vocab (checked at build
# time), so the presets show the trained dynamics, not <unk> mush.
SEQUENCES: list[dict] = [
    # Short preset: the 短句 half of the deck's 短句/長句 contrast — at 3 tokens
    # the first word's influence is still visibly alive at the end.
    {
        "sequenceId": "cat-sat",
        "label": "the cat sat",
        "tokens": ["the", "cat", "sat"],
    },
    {
        "sequenceId": "cat-by-the-door",
        "label": "the cat sat by the door and looked at the queen",
        "tokens": ["the", "cat", "sat", "by", "the", "door", "and", "looked", "at", "the", "queen"],
    },
    {
        "sequenceId": "alice-golden-key",
        "label": "alice opened the little door with the golden key",
        "tokens": ["alice", "opened", "the", "little", "door", "with", "the", "golden", "key"],
    },
    {
        "sequenceId": "rabbit-ran-away",
        "label": "the white rabbit ran away down the hall again",
        "tokens": ["the", "white", "rabbit", "ran", "away", "down", "the", "hall", "again"],
    },
]


def _corpus_words() -> list[str]:
    import re

    path = DATA_DIR / CORPUS_TXT
    if not path.exists():
        raise SystemExit(
            f"rnn: missing corpus {path} — it should be committed "
            f"(Project Gutenberg #11, public domain)."
        )
    return re.findall(r"[a-z]+", path.read_text(encoding="utf-8").lower())


@dataclass
class RnnState:
    """The trained GRU LM, as plain numpy — everything a forward pass needs.

    Weight layout follows torch's GRU convention: w_ih/w_hh stack the three
    gates as [r; z; n] along axis 0 (each block is HIDDEN_SIZE rows).
    """

    vocab: list[str]
    word_index: dict[str, int]
    emb: np.ndarray    # [V, EMBED_SIZE]
    w_ih: np.ndarray   # [3H, E]
    w_hh: np.ndarray   # [3H, H]
    b_ih: np.ndarray   # [3H]
    b_hh: np.ndarray   # [3H]


def _sigmoid(x: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-x))


def gru_step(state: RnnState, x: np.ndarray, h: np.ndarray) -> np.ndarray:
    """One torch-convention GRU step in numpy (gates stacked [r; z; n])."""
    H = HIDDEN_SIZE
    gi = state.w_ih @ x + state.b_ih
    gh = state.w_hh @ h + state.b_hh
    r = _sigmoid(gi[:H] + gh[:H])
    z = _sigmoid(gi[H : 2 * H] + gh[H : 2 * H])
    n = np.tanh(gi[2 * H :] + r * gh[2 * H :])
    return (1.0 - z) * n + z * h


def _forward(state: RnnState, xs: np.ndarray) -> np.ndarray:
    """Run the GRU over embedded inputs [T, E]; return hidden after each token
    [T, H]. h starts at zero; values stay in [-1, 1] (convex mix of tanh)."""
    h = np.zeros(HIDDEN_SIZE)
    states = []
    for x in xs:
        h = gru_step(state, x, h)
        states.append(h.copy())
    return np.array(states)


def token_ids(state: RnnState, tokens: list[str]) -> list[int]:
    unk = state.word_index[UNK]
    return [state.word_index.get(t, unk) for t in tokens]


def run_sequence(state: RnnState, tokens: list[str]) -> tuple[list[list[float]], list[list[float]]]:
    """Forward a token sequence through the TRAINED GRU; return (hidden,
    influence) rounded like the artifact.

    `hidden[q]` is the hidden vector after consuming token `q`.

    `influence` is a real per-(query-step, key-token) ablation matrix. For each
    key token `k` we zero *its* input, re-forward, and take the L2 divergence of
    the hidden state at every query step `q`. `influence[q][k]` is that
    divergence at step `q`, normalised by token `k`'s *immediate* footprint (its
    own divergence at step `k`) — so every token starts at 1.0 the moment it is
    consumed and decays as its fingerprint washes out of the fixed-size vector.
    Entries with `k > q` are 0.0 (that token has not been seen yet), and column
    0 is exactly the old token-0 decay trace. This is measured on the real
    trained weights, not modelled from distance alone.
    """
    xs = state.emb[token_ids(state, tokens)]
    T = len(tokens)

    states = _forward(state, xs)

    influence = [[0.0] * T for _ in range(T)]
    for k in range(T):
        xs_ablated = xs.copy()
        xs_ablated[k] = 0.0
        states_ablated = _forward(state, xs_ablated)
        diff = np.linalg.norm(states - states_ablated, axis=1)  # [T]
        base = diff[k] if diff[k] > 1e-9 else 1.0
        for q in range(k, T):
            influence[q][k] = round(float(np.clip(diff[q] / base, 0.0, None)), 4)

    hidden = [[round(float(v), 4) for v in step] for step in states]
    return hidden, influence


# --- training (torch, offline only) -------------------------------------------


def train_rnn(artifacts_dir: Path) -> Path:
    """Train the word-level GRU LM on the committed corpus and export the npz.

    Runs on cuda if available (seconds), else cpu (minutes). Deterministic via
    seeded torch/numpy. After training, the exported numpy forward pass is
    verified against torch's GRU on a probe sequence.
    """
    import torch
    from torch import nn

    torch.manual_seed(SEED)
    np.random.seed(SEED)
    device = "cuda" if torch.cuda.is_available() else "cpu"

    words = _corpus_words()
    from collections import Counter

    freqs = Counter(words)
    vocab = [UNK] + sorted(w for w, c in freqs.items() if c >= MIN_FREQ)
    index = {w: i for i, w in enumerate(vocab)}
    ids = torch.tensor([index.get(w, 0) for w in words], dtype=torch.long)
    print(f"rnn: corpus {len(words)} words, vocab {len(vocab)} (min freq {MIN_FREQ})")

    class GruLM(nn.Module):
        def __init__(self, v: int):
            super().__init__()
            self.emb = nn.Embedding(v, EMBED_SIZE)
            self.gru = nn.GRU(EMBED_SIZE, HIDDEN_SIZE, batch_first=True)
            self.head = nn.Linear(HIDDEN_SIZE, v)

        def forward(self, x, h=None):
            e = self.emb(x)
            out, h = self.gru(e, h)
            return self.head(out), h

    model = GruLM(len(vocab)).to(device)
    opt = torch.optim.Adam(model.parameters(), lr=LR)
    loss_fn = nn.CrossEntropyLoss()

    # Chop the stream into BPTT-length chunks; shuffle chunks each epoch.
    n_chunks = (len(ids) - 1) // BPTT
    xs = ids[: n_chunks * BPTT].view(n_chunks, BPTT)
    ys = ids[1 : n_chunks * BPTT + 1].view(n_chunks, BPTT)

    model.train()
    for epoch in range(EPOCHS):
        perm = torch.randperm(n_chunks)
        total, count = 0.0, 0
        for start in range(0, n_chunks, BATCH):
            batch = perm[start : start + BATCH]
            logits, _ = model(xs[batch].to(device))
            loss = loss_fn(logits.reshape(-1, len(vocab)), ys[batch].to(device).reshape(-1))
            opt.zero_grad()
            loss.backward()
            opt.step()
            total += float(loss.detach()) * len(batch)
            count += len(batch)
        if epoch % 5 == 0 or epoch == EPOCHS - 1:
            print(f"rnn: epoch {epoch:02d} loss {total / count:.3f} (ppl {np.exp(total / count):.0f})")

    model.eval()
    sd = {k: v.detach().cpu().numpy().astype(np.float64) for k, v in model.state_dict().items()}
    state = RnnState(
        vocab=vocab,
        word_index=index,
        emb=sd["emb.weight"],
        w_ih=sd["gru.weight_ih_l0"],
        w_hh=sd["gru.weight_hh_l0"],
        b_ih=sd["gru.bias_ih_l0"],
        b_hh=sd["gru.bias_hh_l0"],
    )

    # Verify the exported numpy forward reproduces torch's GRU exactly.
    probe = SEQUENCES[0]["tokens"]
    with torch.no_grad():
        e = model.emb(torch.tensor([token_ids(state, probe)], device=device))
        torch_h, _ = model.gru(e)
    np_h = _forward(state, state.emb[token_ids(state, probe)])
    err = float(np.abs(torch_h[0].cpu().numpy() - np_h).max())
    if err > 1e-5:
        raise SystemExit(f"rnn: numpy forward drifted from torch (max err {err:.2e})")
    print(f"rnn: numpy forward verified against torch (max err {err:.1e})")

    artifacts_dir.mkdir(parents=True, exist_ok=True)
    path = artifacts_dir / STATE_NPZ
    np.savez_compressed(
        path,
        corpus=np.array("gutenberg-11-alice-wonderland"),
        hidden_size=np.array(HIDDEN_SIZE),
        embed_size=np.array(EMBED_SIZE),
        vocab=np.array(vocab),
        emb=state.emb,
        w_ih=state.w_ih,
        w_hh=state.w_hh,
        b_ih=state.b_ih,
        b_hh=state.b_hh,
    )
    print(f"wrote {path} ({path.stat().st_size / 1e3:.0f} kB)")
    return path


def load_rnn_state(artifacts_dir: Path) -> RnnState:
    """Load the trained GRU from the npz `train-rnn` exported."""
    path = artifacts_dir / STATE_NPZ
    if not path.exists():
        raise SystemExit(
            f"rnn: missing {path}. Run `uv run camp-precompute train-rnn` in "
            f"precompute/ (or copy precompute/artifacts/ from the machine that "
            f"generated the shipped JSON) first."
        )
    z = np.load(path, allow_pickle=False)
    if int(z["hidden_size"]) != HIDDEN_SIZE or int(z["embed_size"]) != EMBED_SIZE:
        raise SystemExit(
            f"rnn: {path} was trained with hidden={int(z['hidden_size'])}, "
            f"embed={int(z['embed_size'])} but the code expects "
            f"{HIDDEN_SIZE}/{EMBED_SIZE} — re-run `camp-precompute train-rnn`."
        )
    vocab = [str(w) for w in z["vocab"]]
    return RnnState(
        vocab=vocab,
        word_index={w: i for i, w in enumerate(vocab)},
        emb=z["emb"],
        w_ih=z["w_ih"],
        w_hh=z["w_hh"],
        b_ih=z["b_ih"],
        b_hh=z["b_hh"],
    )


# --- artifact build -------------------------------------------------------------


def build_rnn_viz(state: RnnState) -> dict:
    """Build the rnn-viz activations payload from the TRAINED model."""
    out_sequences = []
    for spec in SEQUENCES:
        tokens = spec["tokens"]
        oov = [t for t in tokens if t not in state.word_index]
        if oov:
            raise SystemExit(f"rnn: preset {spec['sequenceId']} has out-of-vocab words {oov}")
        hidden, influence = run_sequence(state, tokens)
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
            "Hidden-state activations from a REAL word-level GRU language model "
            f"(hidden {HIDDEN_SIZE}), trained by `camp-precompute train-rnn` on "
            "Alice's Adventures in Wonderland (Project Gutenberg #11, public "
            "domain). `hidden[step]` is the hidden vector after consuming that "
            "token; `influence[q][k]` is a per-(query-step, key-token) ablation "
            "matrix — the L2 divergence of the step-`q` hidden state when token "
            "`k`'s input is zeroed, normalised by token `k`'s immediate footprint "
            "so each token starts at 1.0 when consumed and decays as its "
            "fingerprint washes out (entries with k>q are 0). Hidden values are "
            "in [-1, 1] (signed → diverging heatmap). Presets are recorded "
            "outputs of the same weights the live server loads."
        ),
        "hiddenSize": HIDDEN_SIZE,
        "sequences": out_sequences,
    }


def rnn_viz(out_dir: Path, artifacts_dir: Path) -> Path:
    """Write rnn-viz/activations.json from the trained npz and register it."""
    from .cli import upsert_manifest_artifact

    state = load_rnn_state(artifacts_dir)

    station_dir = out_dir / "rnn-viz"
    station_dir.mkdir(parents=True, exist_ok=True)

    payload = build_rnn_viz(state)
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
                "Per-timestep hidden-state vectors from a small TRAINED GRU "
                "language model (train-rnn), plus a per-(query-step, key-token) "
                "ablation influence matrix. Replayed on a heatmap; the browser "
                "never runs the RNN."
            ),
        },
    )
    return art_path
