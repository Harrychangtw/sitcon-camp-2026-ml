"""`camp-precompute` CLI.

For now it has a single subcommand, `make-data`, which writes a hello
manifest.json into apps/course2/public/data/course2/. As the real pipeline grows,
add subcommands here (e.g. `train-rnn`, `export-onnx`) that drop their artifacts
into the same per-course public/data folder.
"""

from __future__ import annotations

import argparse
import json
import math
import re
from collections import Counter, defaultdict
from datetime import datetime, timezone
from itertools import permutations
from pathlib import Path

import numpy as np

from .embedding import build_embedding

COURSE = "course2"
MANIFEST_VERSION = 1


def find_repo_root(start: Path) -> Path:
    """Walk up from `start` to the directory containing pnpm-workspace.yaml."""
    for d in (start, *start.parents):
        if (d / "pnpm-workspace.yaml").exists():
            return d
    raise SystemExit(
        f"camp-precompute: could not find repo root (no pnpm-workspace.yaml above {start})"
    )


def default_out_dir() -> Path:
    root = find_repo_root(Path.cwd())
    return root / "apps" / "course2" / "public" / "data" / COURSE


def make_data(out_dir: Path) -> Path:
    """Write the hello manifest.json that @camp/data.loadManifest() reads."""
    out_dir.mkdir(parents=True, exist_ok=True)

    # Touch numpy so the dependency is real and the pattern (compute → export)
    # is visible. The real pipeline does the heavy lifting here.
    sample = np.linspace(0.0, 1.0, num=5)

    path = out_dir / "manifest.json"
    # Preserve any artifacts already registered by station subcommands — the
    # manifest is a shared surface every station appends to.
    existing = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}

    manifest = {
        "course": COURSE,
        "version": MANIFEST_VERSION,
        "generator": "camp-precompute make-data",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "note": "hello from camp-precompute — replace with real artifacts",
        "sample": [round(float(x), 4) for x in sample],
        "artifacts": existing.get("artifacts", []),
    }

    path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return path


# ---------------------------------------------------------------------------
# next-token: a tiny word-level bigram "next-token predictor" (replay path).
#
# The heavy work (counting a corpus) happens HERE, offline. The browser only
# loads the exported table and does the light temperature/top-k transform. No
# training, no big data, no in-browser model — the golden rule holds.
# ---------------------------------------------------------------------------

# A small, deliberately-skewed toy corpus so common contexts ("the", "a", "to",
# "is") produce intuitive, demo-friendly next-token distributions.
NEXT_TOKEN_CORPUS = """
the cat sat on the mat and the dog sat on the rug
the cat chased the mouse across the room
the dog ran to the park to play with the ball
once upon a time a small robot wanted to learn
once upon a time a young student wanted to build a model
a model learns to predict the next token from data
a language model is just a next token predictor
machine learning is mostly about finding good patterns in data
machine learning is fun when the model finally works
the weather today is sunny and warm and bright
the weather today is cloudy with a little rain
i want to learn how a transformer reads a sentence
i want to build a small model that can write text
i want to understand why order matters so much
to be or not to be is the question
we train the model on data and then we test the model
the student opened the laptop and started to code
the robot picked up the ball and threw the ball back
a good model predicts the next word with high confidence
the next word is often the most likely word in context
""".strip()

# Curated starter prompts; each ends on a context the corpus knows well.
NEXT_TOKEN_SUGGESTIONS = [
    "the cat sat on the",
    "once upon a",
    "i want to",
    "machine learning is",
    "the weather today is",
    "a language model is just a next token",
]

NEXT_TOKEN_TOP_N = 12


def _tokenize(text: str) -> list[list[str]]:
    """Lowercase word-level tokens, one list per line/sentence."""
    sentences = []
    for line in text.splitlines():
        words = re.findall(r"[a-z]+", line.lower())
        if words:
            sentences.append(words)
    return sentences


def _top_n_logits(counts: Counter[str], top_n: int) -> list[dict[str, float]]:
    """Turn raw counts into the top-N tokens with log-probabilities (logits).

    logit = log(prob) so the browser's softmax(logit / T) recovers the exported
    distribution at T=1, sharpens for T<1, and flattens for T>1.
    """
    total = sum(counts.values())
    if total == 0:
        return []
    ranked = counts.most_common(top_n)
    return [
        {"token": tok, "logit": round(math.log(c / total), 4)}
        for tok, c in ranked
    ]


def make_next_token(out_dir: Path) -> Path:
    """Write distributions.json: a bigram next-token table + unigram fallback."""
    station_dir = out_dir / "next-token"
    station_dir.mkdir(parents=True, exist_ok=True)

    sentences = _tokenize(NEXT_TOKEN_CORPUS)

    bigram_counts: dict[str, Counter[str]] = defaultdict(Counter)
    unigram_counts: Counter[str] = Counter()
    for words in sentences:
        for i, w in enumerate(words):
            unigram_counts[w] += 1
            if i > 0:
                bigram_counts[words[i - 1]][w] += 1

    bigram = {
        context: _top_n_logits(nexts, NEXT_TOKEN_TOP_N)
        for context, nexts in sorted(bigram_counts.items())
        if sum(nexts.values()) > 0
    }

    payload = {
        "generator": "camp-precompute next-token",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "station": "next-token",
        "topN": NEXT_TOKEN_TOP_N,
        "note": (
            "Word-level bigram next-token table. Keyed on the LAST token of the "
            "prompt; falls back to the unigram distribution for unknown context. "
            "logit = log(prob); the browser applies softmax(logit / temperature) "
            "and top-k."
        ),
        "vocabSize": len(unigram_counts),
        "suggestions": NEXT_TOKEN_SUGGESTIONS,
        "fallback": _top_n_logits(unigram_counts, NEXT_TOKEN_TOP_N),
        "bigram": bigram,
    }

    path = station_dir / "distributions.json"
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")

    upsert_manifest_artifact(
        out_dir,
        {
            "id": "next-token-distributions",
            "kind": "json",
            "path": "next-token/distributions.json",
            "station": "next-token",
            "bytes": path.stat().st_size,
        },
    )
    return path


def upsert_manifest_artifact(out_dir: Path, artifact: dict) -> None:
    """Merge one artifact entry into manifest.json (create it if missing).

    Every station appends to the SAME artifacts[]; this upserts by id so a
    station can be regenerated without duplicating or clobbering others.
    """
    manifest_path = out_dir / "manifest.json"
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    else:
        manifest = {
            "course": COURSE,
            "version": MANIFEST_VERSION,
            "generator": "camp-precompute",
            "artifacts": [],
        }
    artifacts = [a for a in manifest.get("artifacts", []) if a.get("id") != artifact["id"]]
    artifacts.append(artifact)
    artifacts.sort(key=lambda a: a["id"])
    manifest["artifacts"] = artifacts
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


# ---------------------------------------------------------------------------
# order-shuffle station
# ---------------------------------------------------------------------------
# The wall this station exposes: word ORDER carries meaning, and an order-blind
# bag-of-words model can't see it. Bag-of-words is order-invariant, so the
# browser recomputes it live from the word multiset (light, allowed). The
# ORDER-AWARE model's prediction for every arrangement is precomputed here — the
# browser never runs a sequence model.
#
# The toy order-aware model is a left-to-right negation/intensifier scanner:
# a negator ("not"/"never") flips the polarity of the NEXT sentiment word, and
# an intensifier ("very"/"always") scales it. That adjacency is exactly what a
# bag of words throws away — so "not bad just good" (positive) and "not good
# just bad" (negative) share one multiset yet get opposite order-aware verdicts.

# Word polarity. Sentiment words carry ±1; modifiers carry 0 so a bag-of-words
# sum (which can't bind them to a neighbour) is dominated by the sentiment words.
SENTIMENT = {
    "good": 1.0,
    "great": 1.0,
    "happy": 1.0,
    "bad": -1.0,
    "awful": -1.0,
    "sad": -1.0,
}
NEGATORS = {"not", "never"}
INTENSIFIERS = {"very", "always"}
LABELS = ["negative", "neutral", "positive"]

# Shared score → 3-label distribution mapping. Softmax over
# [negative, neutral, positive] logits = [-k·s, bias, +k·s]. At s=0 the neutral
# bias makes "neutral" the (weak) winner — a balanced multiset reads as "can't
# decide", not a 3-way tie. The BROWSER mirrors these exact constants to turn
# its bag-of-words multiset sum into a distribution, so both panels look alike
# and BoW is provably order-invariant. Keep in sync with orderShuffle.tsx.
SCORE_TEMP = 1.3
NEUTRAL_BIAS = 0.8

# Curated 4-word sentences. Each word is unique within a sentence, so an
# arrangement is an unambiguous permutation of indices. Every permutation is
# enumerated (4! = 24), which is small enough to ship.
SENTENCES = [
    {
        "sentenceId": "not-bad-just-good",
        "prompt": "Arrange the words. Does the meaning flip when the order does?",
        "words": ["not", "bad", "just", "good"],
    },
    {
        "sentenceId": "never-awful-always-great",
        "prompt": "Where you put “never” decides everything.",
        "words": ["never", "awful", "always", "great"],
    },
    {
        "sentenceId": "not-happy-very-sad",
        "prompt": "“very” amplifies whatever word comes next.",
        "words": ["not", "happy", "very", "sad"],
    },
]


def _order_aware_score(words: list[str]) -> float:
    """Left-to-right scan: a negator flips, an intensifier scales, the NEXT
    sentiment word. Returns the summed signed polarity."""
    total = 0.0
    negate = False
    scale = 1.0
    for w in words:
        if w in NEGATORS:
            negate = True
            continue
        if w in INTENSIFIERS:
            scale = 1.5
            continue
        if w in SENTIMENT:
            value = SENTIMENT[w] * scale * (-1.0 if negate else 1.0)
            total += value
            negate = False
            scale = 1.0
    return total


def _distribution(score: float) -> dict:
    """Map a signed score to a {label, score, scores} prediction via the shared
    softmax mapping (see SCORE_TEMP / NEUTRAL_BIAS)."""
    logits = np.array([-SCORE_TEMP * score, NEUTRAL_BIAS, SCORE_TEMP * score])
    ex = np.exp(logits - logits.max())
    probs = ex / ex.sum()
    scores = {label: round(float(p), 3) for label, p in zip(LABELS, probs)}
    argmax = int(probs.argmax())
    return {
        "label": LABELS[argmax],
        "score": scores[LABELS[argmax]],
        "scores": scores,
    }


def build_order_shuffle() -> dict:
    """Build the order-shuffle predictions payload (pure data, no I/O)."""
    sentences = []
    for spec in SENTENCES:
        words = spec["words"]
        n = len(words)
        arrangements = []
        for perm in permutations(range(n)):
            ordered = [words[i] for i in perm]
            score = _order_aware_score(ordered)
            arrangements.append(
                {
                    "order": list(perm),
                    "prediction": _distribution(score),
                }
            )
        # Per-word polarity the browser uses to recompute bag-of-words live.
        # Modifiers map to 0 — order-blind, the model can't attach them.
        lexicon = {w: SENTIMENT.get(w, 0.0) for w in words}
        sentences.append(
            {
                "sentenceId": spec["sentenceId"],
                "prompt": spec["prompt"],
                "words": words,
                "lexicon": lexicon,
                "labels": LABELS,
                "arrangements": arrangements,
            }
        )
    return {
        "generator": "camp-precompute order-shuffle",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "note": (
            "Bag-of-words is recomputed in-browser: sum `lexicon` over the word "
            "multiset (order-invariant) then apply `scoreMapping` (softmax over "
            "[-temp·s, neutralBias, temp·s]). `arrangements` holds the order-aware "
            "model's precomputed prediction for every permutation."
        ),
        "labels": LABELS,
        "scoreMapping": {"temp": SCORE_TEMP, "neutralBias": NEUTRAL_BIAS},
        "sentences": sentences,
    }


def order_shuffle(out_dir: Path) -> Path:
    """Write order-shuffle/predictions.json and register it in the manifest."""
    station_dir = out_dir / "order-shuffle"
    station_dir.mkdir(parents=True, exist_ok=True)

    payload = build_order_shuffle()
    art_path = station_dir / "predictions.json"
    art_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")

    upsert_manifest_artifact(
        out_dir,
        {
            "id": "order-shuffle-predictions",
            "kind": "json",
            "path": "order-shuffle/predictions.json",
            "station": "order-shuffle",
            "bytes": art_path.stat().st_size,
        },
    )
    return art_path


# ---------------------------------------------------------------------------
# tokenizer station
# ---------------------------------------------------------------------------
# The browser never trains a tokenizer — it only looks up ids. So here we train a
# tiny BPE on a small fixed corpus and export the vocab + ordered merges. The
# corpus is co-designed with the station's seed sentence: every common word in
# the seed appears here (so it stays a single token), but the rare word
# "tokenization" is deliberately ABSENT, forcing BPE to fall back to subword
# pieces — which is the whole point students should see.

# Word-boundary marker (SentencePiece style): prepended to each word so the
# browser can render the "space is a real token, not a gap" idea, and so BPE
# merges learn where words start.
SPACE_MARK = "▁"  # ▁
UNK_ID = 1  # 0 is reserved for padding; 1 is the shared unknown-token id

# A small fixed corpus. Repetition gives common words enough frequency that BPE
# merges them into whole-word tokens. "tokenization" never appears.
TOKENIZER_CORPUS = """
the model reads tokens not letters and not words
a model reads tokens the model never reads letters
the cat sat on the mat and the dog sat on the mat
the quick brown fox jumps over the lazy dog
the dog and the cat play in the park every day
tokens are not letters tokens are not words
the model reads a token then reads the next token
letters make words and words make a sentence
the model reads the sentence one token at a time
reads reads reads tokens tokens tokens the the the
a token is not a letter a word is not a token
the model is lossy the tokens are lossy but useful
the sentence the model reads is made of tokens
letters words tokens the model reads them all
the model reads tokens but not letters but not words
it reads a token but the token is not a letter but a word
but the model is lossy but the tokens are still useful
""".strip()

# The seed sentence the station text box opens with. "tokenization" is the rare
# word that BPE must subword-split.
TOKENIZER_SEED = "the model reads tokens not letters but tokenization is lossy"

# Splits text into word / punctuation units (words are lowercased downstream).
_UNIT_RE = re.compile(r"[A-Za-z0-9]+|[^\sA-Za-z0-9]")


def _units(text: str) -> list[str]:
    return _UNIT_RE.findall(text)


def _train_bpe(corpus: str, num_merges: int) -> tuple[list[list[str]], list[str]]:
    """Train a tiny BPE. Returns (ordered merges, sorted vocab of subwords).

    Each word is represented as ``[SPACE_MARK, c0, c1, ...]`` so a leading-space
    marker participates in merges (SentencePiece style). The most frequent
    adjacent pair is merged repeatedly, up to ``num_merges`` times.
    """
    # word -> frequency (lowercased alphanumeric words only; punctuation is a
    # single symbol and needs no merging).
    freqs: Counter[str] = Counter()
    for unit in _units(corpus):
        if unit.isalnum():
            freqs[unit.lower()] += 1

    # Represent each word as a list of symbols, starting with the space marker.
    words: dict[str, list[str]] = {
        w: [SPACE_MARK, *list(w)] for w in freqs
    }

    merges: list[list[str]] = []
    for _ in range(num_merges):
        pair_counts: Counter[tuple[str, str]] = Counter()
        for w, syms in words.items():
            f = freqs[w]
            for a, b in zip(syms, syms[1:]):
                pair_counts[(a, b)] += f
        if not pair_counts:
            break
        (best_a, best_b), best_n = pair_counts.most_common(1)[0]
        if best_n < 2:  # stop once no pair is worth merging
            break
        merged = best_a + best_b
        merges.append([best_a, best_b])
        for w, syms in words.items():
            out: list[str] = []
            i = 0
            while i < len(syms):
                if i < len(syms) - 1 and syms[i] == best_a and syms[i + 1] == best_b:
                    out.append(merged)
                    i += 2
                else:
                    out.append(syms[i])
                    i += 1
            words[w] = out

    # Collect the subword vocab: every base char/marker, plus every merge
    # product. We add merge products (not just surviving symbols) so that any
    # subword the browser can produce when encoding an *unseen* word — e.g.
    # "at" inside "tokenization" — still resolves to a real id, not UNK.
    vocab: set[str] = {SPACE_MARK}
    for w in freqs:
        vocab.update(list(w))
    for a, b in merges:
        vocab.add(a + b)
    return merges, sorted(vocab)


def build_tokenizer_vocab() -> dict:
    """Build the char / word / BPE lookup tables the station loads."""
    corpus = TOKENIZER_CORPUS

    # CHAR scheme: every character in the corpus (plus a space so char-mode can
    # id whitespace), assigned a stable id.
    chars = sorted({*corpus.replace("\n", " "), " "})
    char_vocab = {ch: UNK_ID + 1 + i for i, ch in enumerate(chars)}

    # WORD scheme: each distinct lowercased word, id-assigned. Anything not seen
    # (punctuation, the rare word) resolves to UNK at lookup time in the browser.
    word_list = sorted({u.lower() for u in _units(corpus) if u.isalnum()})
    word_vocab = {w: UNK_ID + 1 + i for i, w in enumerate(word_list)}

    # BPE scheme: trained merges + subword vocab.
    merges, subwords = _train_bpe(corpus, num_merges=200)
    bpe_vocab = {s: UNK_ID + 1 + i for i, s in enumerate(subwords)}

    return {
        "generatedBy": "camp-precompute tokenizer",
        "spaceMarker": SPACE_MARK,
        "unkId": UNK_ID,
        "sampleText": TOKENIZER_SEED,
        "char": {"vocab": char_vocab},
        "word": {"vocab": word_vocab},
        "bpe": {"vocab": bpe_vocab, "merges": merges},
    }


def tokenizer(out_dir: Path) -> Path:
    """Write tokenizer/vocab.json and register it in the manifest."""
    station_dir = out_dir / "tokenizer"
    station_dir.mkdir(parents=True, exist_ok=True)

    vocab = build_tokenizer_vocab()
    vocab_path = station_dir / "vocab.json"
    vocab_path.write_text(json.dumps(vocab, ensure_ascii=False, indent=2) + "\n",
                          encoding="utf-8")

    upsert_manifest_artifact(
        out_dir,
        {
            "id": "tokenizer-vocab",
            "kind": "json",
            "path": "tokenizer/vocab.json",
            "station": "tokenizer",
            "bytes": vocab_path.stat().st_size,
            "description": (
                "Char / word / BPE lookup tables (vocab + ordered merges) "
                "for the Tokenizer station. Segmentation runs in the "
                "browser; this only supplies ids."
            ),
        },
    )
    return vocab_path


# ---------------------------------------------------------------------------
# embedding station
# ---------------------------------------------------------------------------
# The heavy work (synthesising clustered word vectors, PCA projection, and
# nearest-neighbour search) lives in embedding.py and runs offline. Here we just
# invoke it and register its two artifacts in the shared manifest.


def embedding(out_dir: Path) -> list[Path]:
    """Build the embedding station's points/neighbors and register them."""
    entries = build_embedding(out_dir)
    paths = []
    for entry in entries:
        art_path = out_dir / entry["path"]
        entry.setdefault("bytes", art_path.stat().st_size)
        upsert_manifest_artifact(out_dir, entry)
        paths.append(art_path)
    return paths


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="camp-precompute",
        description="SITCON Camp 2026 ML precompute pipeline.",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p_make = sub.add_parser(
        "make-data", help="Write the hello manifest.json for Course 2."
    )
    p_make.add_argument(
        "--out",
        type=Path,
        default=None,
        help="Output directory (defaults to apps/course2/public/data/course2).",
    )

    p_next = sub.add_parser(
        "next-token",
        help="Write the Course 2 next-token bigram distribution table.",
    )
    p_next.add_argument(
        "--out",
        type=Path,
        default=None,
        help="Output directory (defaults to apps/course2/public/data/course2).",
    )

    p_order = sub.add_parser(
        "order-shuffle",
        help="Write the order-shuffle predictions artifact for Course 2.",
    )
    p_order.add_argument(
        "--out",
        type=Path,
        default=None,
        help="Output directory (defaults to apps/course2/public/data/course2).",
    )

    p_tok = sub.add_parser(
        "tokenizer",
        help="Write the Tokenizer station's char/word/BPE vocab.json and "
        "register it in manifest.json.",
    )
    p_tok.add_argument(
        "--out",
        type=Path,
        default=None,
        help="Output directory (defaults to apps/course2/public/data/course2).",
    )

    p_emb = sub.add_parser(
        "embedding",
        help="Rebuild just the embedding station's points.json + neighbors.json.",
    )
    p_emb.add_argument(
        "--out",
        type=Path,
        default=None,
        help="Output directory (defaults to apps/course2/public/data/course2).",
    )

    args = parser.parse_args(argv)

    if args.command == "make-data":
        out_dir = args.out or default_out_dir()
        path = make_data(out_dir)
        print(f"wrote {path}")
        return 0

    if args.command == "next-token":
        out_dir = args.out or default_out_dir()
        path = make_next_token(out_dir)
        print(f"wrote {path}")
        return 0

    if args.command == "order-shuffle":
        out_dir = args.out or default_out_dir()
        path = order_shuffle(out_dir)
        print(f"wrote {path}")
        return 0

    if args.command == "tokenizer":
        out_dir = args.out or default_out_dir()
        path = tokenizer(out_dir)
        print(f"wrote {path}")
        print(f"updated {out_dir / 'manifest.json'}")
        return 0

    if args.command == "embedding":
        out_dir = args.out or default_out_dir()
        for path in embedding(out_dir):
            print(f"wrote {path}")
        return 0

    parser.error(f"unknown command: {args.command}")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
