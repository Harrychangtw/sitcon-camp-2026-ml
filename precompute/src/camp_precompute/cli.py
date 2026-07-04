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
import zlib
from collections import Counter, defaultdict
from datetime import datetime, timezone
from itertools import permutations
from pathlib import Path

import numpy as np

from .embedding import build_embedding, export_server_state
from .rnn import rnn_viz

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


def default_artifacts_dir() -> Path:
    """Where server-side state (npz weights/vocab) lands. Gitignored — these are
    the live server's inputs, not browser artifacts."""
    root = find_repo_root(Path.cwd())
    return root / "precompute" / "artifacts"


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


def build_next_token_tables() -> dict:
    """The next-token "model": bigram table + unigram fallback, as pure data.

    Deterministic counting over the committed corpus, so the artifact build AND
    the live server rebuild identical tables by calling this — no file to drift.
    Returns the artifact payload minus generator/timestamp metadata.
    """
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

    return {
        "topN": NEXT_TOKEN_TOP_N,
        "vocabSize": len(unigram_counts),
        "suggestions": NEXT_TOKEN_SUGGESTIONS,
        "fallback": _top_n_logits(unigram_counts, NEXT_TOKEN_TOP_N),
        "bigram": bigram,
    }


def make_next_token(out_dir: Path) -> Path:
    """Write distributions.json: a bigram next-token table + unigram fallback."""
    station_dir = out_dir / "next-token"
    station_dir.mkdir(parents=True, exist_ok=True)

    tables = build_next_token_tables()

    payload = {
        "generator": "camp-precompute next-token",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "station": "next-token",
        "topN": tables["topN"],
        "note": (
            "Word-level bigram next-token table. Keyed on the LAST token of the "
            "prompt; falls back to the unigram distribution for unknown context. "
            "logit = log(prob); the browser applies softmax(logit / temperature) "
            "and top-k."
        ),
        "vocabSize": tables["vocabSize"],
        "suggestions": tables["suggestions"],
        "fallback": tables["fallback"],
        "bigram": tables["bigram"],
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


def remove_manifest_artifact(out_dir: Path, artifact_id: str) -> None:
    """Drop an artifact entry from manifest.json by id (no-op if absent)."""
    manifest_path = out_dir / "manifest.json"
    if not manifest_path.exists():
        return
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    before = manifest.get("artifacts", [])
    after = [a for a in before if a.get("id") != artifact_id]
    if len(after) == len(before):
        return
    manifest["artifacts"] = after
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

# --- Chinese (zh-TW) content axis --------------------------------------------
# The bilingual upgrade: a second corpus/vocab the student can switch to. Chinese
# has no spaces, so char / 詞 / BPE genuinely diverge — each 漢字 is a char-token,
# but a 詞 like「機器學習」spans several characters with no delimiter (斷詞 is a
# real problem), and BPE-style subwords sit in between.
#
# The corpus is co-designed so all three schemes VISIBLY differ on the seed:
#   - 機器 / 學習 / 模型 recur → BPE merges them into whole 詞 (same as the dict).
#   - the FUNCTION-word pairs「不是」「讀的」recur even more → BPE merges them too,
#     but the 詞典 keeps 不·是 and 讀·的 apart. So BPE lands strictly between raw
#     chars and dictionary 斷詞 — driven by frequency, not by a word list.
ZH_TOKENIZER_CORPUS = """
機器學習模型讀的是不是字也不是詞
模型讀的是不是字模型讀的也不是詞
機器學習讓模型讀懂不是讀懂字
字不是詞詞不是字也不是字
模型讀的是讀的不是字讀的也不是詞
機器學習就是讓模型讀不是讀字
一個模型讀再讀一個不是讀詞
機器讀的是機器學習讀的也是
學習讓機器讀懂不是讀懂字也不是詞
模型不是讀字模型不是讀詞模型讀的是
機器學習的模型讀的是不是讀字
機器學習模型不是字不是詞讀的是
""".strip()

# The seed the zh textarea opens with. No space around "token" on purpose: the
# lesson is "中文 沒有空格", so the teaching sentence must not contain one.
ZH_TOKENIZER_SEED = "機器學習模型讀的是token，不是字也不是詞"

# The 詞典 (word list) the browser greedy-longest-matches for 斷詞. Common 詞 plus
# the single-char 詞 that appear; "機器學習" is deliberately ABSENT so it segments
# to 機器·學習 (visibly more than one chip), and「不是」「讀的」are absent so word
# mode keeps them split where BPE merges them.
ZH_WORDS = [
    "機器", "學習", "模型", "讀懂", "一個", "就是", "token",
    "讀", "的", "是", "不", "字", "也", "詞", "讓", "再", "懂",
]

# Splits text into word / punctuation units (words are lowercased downstream).
_UNIT_RE = re.compile(r"[A-Za-z0-9]+|[^\sA-Za-z0-9]")

# Han-run / ASCII-word / single-symbol splitter for the Chinese BPE path.
_HAN_RE = re.compile(r"[一-鿿]")
_ZH_UNIT_RE = re.compile(r"[一-鿿]+|[A-Za-z0-9]+|[^\s]")


def _units(text: str) -> list[str]:
    return _UNIT_RE.findall(text)


def _bpe_from_freqs(
    freqs: Counter[str],
    num_merges: int,
    space_mark: str,
    max_len: int | None = None,
) -> tuple[list[list[str]], list[str]]:
    """Core BPE trainer over a word→frequency table.

    Each word becomes ``[space_mark, c0, c1, ...]`` (English, SentencePiece
    style) or ``[c0, c1, ...]`` when ``space_mark`` is "" (Chinese — no spaces,
    so no leading-space marker). The most frequent adjacent pair is merged
    repeatedly, up to ``num_merges`` times.

    ``max_len`` caps the character length of a merge product. English needs no
    cap (subwords like "token" run long); Chinese uses max_len=2, because its
    BPE "words" are whole 漢字 runs (no spaces to bound them) and, on this tiny
    corpus, an uncapped trainer would greedily fuse entire sentence fragments
    into one absurd token. Capping keeps BPE producing short subword pieces that
    honestly sit between single 字 and multi-character 詞.
    """
    prefix = [space_mark] if space_mark else []
    words: dict[str, list[str]] = {w: [*prefix, *list(w)] for w in freqs}

    merges: list[list[str]] = []
    for _ in range(num_merges):
        pair_counts: Counter[tuple[str, str]] = Counter()
        for w, syms in words.items():
            f = freqs[w]
            for a, b in zip(syms, syms[1:]):
                if max_len is not None and len(a) + len(b) > max_len:
                    continue
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
    vocab: set[str] = set(prefix)
    for w in freqs:
        vocab.update(list(w))
    for a, b in merges:
        vocab.add(a + b)
    return merges, sorted(vocab)


def _train_bpe(corpus: str, num_merges: int) -> tuple[list[list[str]], list[str]]:
    """Train English BPE over lowercased alphanumeric words (with ▁ marker)."""
    freqs: Counter[str] = Counter()
    for unit in _units(corpus):
        if unit.isalnum():
            freqs[unit.lower()] += 1
    return _bpe_from_freqs(freqs, num_merges, SPACE_MARK)


def _train_bpe_zh(corpus: str, num_merges: int) -> tuple[list[list[str]], list[str]]:
    """Train Chinese BPE over maximal runs of 漢字 (no space marker)."""
    freqs: Counter[str] = Counter()
    for run in re.findall(r"[一-鿿]+", corpus):
        freqs[run] += 1
    return _bpe_from_freqs(freqs, num_merges, "", max_len=2)


def _build_lang_en() -> dict:
    """English char / word / BPE lookup tables."""
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
        "sampleText": TOKENIZER_SEED,
        "char": {"vocab": char_vocab},
        "word": {"vocab": word_vocab},
        "bpe": {"vocab": bpe_vocab, "merges": merges},
    }


def _build_lang_zh() -> dict:
    """Chinese char / 詞 / BPE lookup tables + the greedy-斷詞 word list."""
    corpus = ZH_TOKENIZER_CORPUS
    seen = corpus + ZH_TOKENIZER_SEED

    # CHAR scheme: every non-space character across corpus + seed (漢字, ASCII,
    # punctuation), stable id. No whitespace: Chinese has no spaces to id.
    chars = sorted({ch for ch in seen if not ch.isspace()})
    char_vocab = {ch: UNK_ID + 1 + i for i, ch in enumerate(chars)}

    # WORD scheme: the curated 詞典. `dict` is the greedy-match list the browser
    # walks; `vocab` gives each entry a stable id.
    word_list = sorted(set(ZH_WORDS))
    word_vocab = {w: UNK_ID + 1 + i for i, w in enumerate(word_list)}

    # BPE scheme: merges over 漢字 runs, plus atomic ASCII words / punctuation so
    # the browser resolves "token" and「，」to an id instead of UNK.
    merges, subwords = _train_bpe_zh(corpus, num_merges=200)
    bpe_set = set(subwords)
    for unit in _ZH_UNIT_RE.findall(seen):
        if _HAN_RE.search(unit):
            continue
        bpe_set.add(unit.lower() if unit.isalnum() else unit)
    bpe_list = sorted(bpe_set)
    bpe_vocab = {s: UNK_ID + 1 + i for i, s in enumerate(bpe_list)}

    return {
        "sampleText": ZH_TOKENIZER_SEED,
        "char": {"vocab": char_vocab},
        "word": {"vocab": word_vocab, "dict": word_list},
        "bpe": {"vocab": bpe_vocab, "merges": merges},
    }


def build_tokenizer_vocab() -> dict:
    """Build the bilingual char / word / BPE lookup tables the station loads."""
    return {
        "generatedBy": "camp-precompute tokenizer",
        "spaceMarker": SPACE_MARK,
        "unkId": UNK_ID,
        "languages": {
            "en": _build_lang_en(),
            "zh": _build_lang_zh(),
        },
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
# The heavy work (embedding the combined zh+en vocab with one multilingual
# model, PCA projection, and nearest-neighbour search) lives in embedding.py and
# runs offline. Here we just invoke it and register its two artifacts in the
# shared manifest.

# Wave-2 per-language manifest ids, retired when zh+en merged into one space.
STALE_EMBEDDING_IDS = tuple(
    f"embedding-{kind}-{lang}" for kind in ("points", "neighbors") for lang in ("zh", "en")
)


def embedding(out_dir: Path) -> list[Path]:
    """Build the embedding station's unified points/neighbors and register."""
    entries = build_embedding(out_dir)
    # Drop the retired per-language manifest ids (wave-2 layout).
    for stale_id in STALE_EMBEDDING_IDS:
        remove_manifest_artifact(out_dir, stale_id)
    paths = []
    for entry in entries:
        art_path = out_dir / entry["path"]
        entry.setdefault("bytes", art_path.stat().st_size)
        upsert_manifest_artifact(out_dir, entry)
        paths.append(art_path)
    return paths


# ---------------------------------------------------------------------------
# transformer station
# ---------------------------------------------------------------------------
# The payoff station: self-attention. Every token can look at every other token
# directly, and different heads/layers attend differently. Running a real
# transformer is heavy → offline; the browser only replays the weights.
#
# Following embedding.py's precedent, we DON'T ship a trained model (that needs
# torch + a corpus + training time). A randomly-initialised tiny transformer
# would instead emit near-uniform noise — which defeats the whole lesson ("heads
# attend differently", "attention specializes across layers"). So we synthesise a
# STRUCTURED attention tensor with hand-designed, recognisable per-head patterns,
# each row a real softmax distribution over keys. This is honest for the lesson:
# the *shapes* students see (a local head, a content-word head, a first-token
# sink; sharp early layers → diffuse later ones) are exactly the patterns real
# transformers learn — without pretending to be trained weights.

# Function words get low salience so the "content head" ignores them; content
# words (nouns/verbs) pull attention. Kept lowercase; matched case-insensitively.
TRANSFORMER_FUNCTION_WORDS = {
    "the", "a", "an", "on", "in", "into", "up", "to", "of", "and", "is", "it",
    "she", "he", "they", "with", "at", "for", "over", "then",
}

# Human-readable head roles, surfaced in the UI so students can name what they
# see. Index i == head i. (These are the patterns _head_affinity builds.)
TRANSFORMER_HEAD_LABELS = ["local", "content", "first-token"]
TRANSFORMER_N_LAYERS = 3

# A few short sentences; each token is a word so links read cleanly.
TRANSFORMER_SENTENCES = [
    {"sentenceId": "cat-mat", "text": "the cat sat on the mat"},
    {"sentenceId": "poured-glass", "text": "she poured water into the glass"},
    {"sentenceId": "robot-ball", "text": "the robot picked up the ball"},
]


def _transformer_salience(tokens: list[str]) -> np.ndarray:
    """Content words → 1.0, function words → 0.2 (higher = more attended-to)."""
    return np.array(
        [0.2 if t.lower() in TRANSFORMER_FUNCTION_WORDS else 1.0 for t in tokens]
    )


def _head_affinity(tokens: list[str], head: int) -> np.ndarray:
    """Raw per-head affinity matrix (n×n, higher = stronger), roughly in [0,1].

    Head 0 (local):       each query attends to nearby tokens (distance decay).
    Head 1 (content):     every query attends to salient content tokens.
    Head 2 (first-token): every query attends to token 0 (a classic BOS sink).
    A small self-attention bump is added to every head.
    """
    n = len(tokens)
    idx = np.arange(n)
    if head == 0:
        dist = np.abs(idx[:, None] - idx[None, :]).astype(float)
        aff = 1.0 - dist / max(n - 1, 1)
    elif head == 1:
        sal = _transformer_salience(tokens)
        aff = np.tile(sal, (n, 1))
    else:
        aff = np.zeros((n, n))
        aff[:, 0] = 1.0
    aff = aff + 0.25 * np.eye(n)  # a little self-attention everywhere
    return aff


def _affinity_logits(tokens: list[str], layer: int, head: int) -> np.ndarray:
    """Pre-softmax attention logits for one (layer, head): the head affinity with
    a depth-dependent gain (sharp early layers → diffuse later ones)."""
    aff = _head_affinity(tokens, head)
    # Logit gain shrinks with depth → deeper layers flatten toward global mixing.
    gain = 3.0 / (1.0 + 0.9 * layer)
    return aff * gain


def _attention_matrix(tokens: list[str], layer: int, head: int) -> list[list[float]]:
    """Softmax the head affinity into a [q][k] distribution, sharper in early
    layers and more diffuse (global) in later ones."""
    logits = _affinity_logits(tokens, layer, head)
    logits = logits - logits.max(axis=1, keepdims=True)
    ex = np.exp(logits)
    probs = ex / ex.sum(axis=1, keepdims=True)
    return [[round(float(p), 4) for p in row] for row in probs]


# The 06a "mechanism" upgrade: tiny per-token Q/K/V vectors so the browser can
# SHOW the dot products that build the scores students then see soft-maxed. The
# browser only does light arithmetic on them (8-dim dot products + a softmax
# over ≤6 scores) — no model, no training.
TRANSFORMER_QKV_DIM = 8


def _factor_qk(logits: np.ndarray, dim: int) -> tuple[np.ndarray, np.ndarray]:
    """Factor an n×n logit matrix into per-token Q, K (n×dim) such that
    Q @ K.T / sqrt(dim) == logits (exactly, up to float precision).

    The sentences are short (n ≤ dim), so a full-rank SVD factorisation of
    sqrt(dim)·logits is exact: the dot products students watch in the browser
    rebuild the SAME scores that produced the shipped attention matrices.
    """
    target = logits * math.sqrt(dim)
    u, s, vt = np.linalg.svd(target)
    r = min(dim, len(s))
    root = np.sqrt(s[:r])
    n = logits.shape[0]
    q = np.zeros((n, dim))
    k = np.zeros((n, dim))
    q[:, :r] = u[:, :r] * root
    k[:, :r] = vt[:r, :].T * root
    return q, k


def _value_vectors(tokens: list[str], layer: int, head: int, dim: int) -> np.ndarray:
    """Small deterministic V vectors in [-1, 1]. Seeded per (token, layer, head)
    so the same word carries the same V wherever it appears — the weighted sum
    the browser shows is stable and reproducible."""
    rows = []
    for tok in tokens:
        seed = zlib.crc32(f"{tok}|{layer}|{head}".encode("utf-8"))
        rng = np.random.default_rng(seed)
        rows.append(rng.uniform(-1.0, 1.0, dim))
    return np.array(rows)


def _head_qkv(tokens: list[str], layer: int, head: int) -> dict:
    """Q/K/V vectors (each [token][dim]) for one (layer, head), with the Q/K
    factorisation verified against the shipped attention matrix."""
    dim = TRANSFORMER_QKV_DIM
    logits = _affinity_logits(tokens, layer, head)
    q, k = _factor_qk(logits, dim)
    v = _value_vectors(tokens, layer, head, dim)

    # Round for export, then verify the browser's arithmetic (rounded vectors →
    # dot products → softmax) still reproduces the shipped matrix.
    q = np.round(q, 4)
    k = np.round(k, 4)
    scores = (q @ k.T) / math.sqrt(dim)
    scores = scores - scores.max(axis=1, keepdims=True)
    ex = np.exp(scores)
    probs = ex / ex.sum(axis=1, keepdims=True)
    shipped = np.array(_attention_matrix(tokens, layer, head))
    if not np.allclose(probs, shipped, atol=5e-3):
        raise SystemExit(
            f"transformer: Q/K factorisation drifted from the attention matrix "
            f"(layer={layer}, head={head}, max err={np.abs(probs - shipped).max():.4f})"
        )

    return {
        "q": [[round(float(x), 4) for x in row] for row in q],
        "k": [[round(float(x), 4) for x in row] for row in k],
        "v": [[round(float(x), 3) for x in row] for row in v],
    }


def build_transformer_sentence(sentence_id: str, tokens: list[str]) -> dict:
    """One sentence's full attention payload: layers × (heads tensor + qkv).

    Pure function of the tokens — the artifact build AND the live server call
    this, so a typed sentence gets exactly the patterns the shipped ones show.
    NOTE: the Q/K factorisation is exact only while len(tokens) ≤ qkvDim (8);
    callers must cap input length.
    """
    layers = [
        {
            # The RESULT view's tensor — unchanged shape, kept additive.
            "heads": [
                _attention_matrix(tokens, layer, head)
                for head in range(len(TRANSFORMER_HEAD_LABELS))
            ],
            # The MECHANISM view's vectors: qkv[h].q/k/v are [token][dim],
            # factored so softmax(Q·Kᵀ/√d) reproduces heads[h] exactly.
            "qkv": [
                _head_qkv(tokens, layer, head)
                for head in range(len(TRANSFORMER_HEAD_LABELS))
            ],
        }
        for layer in range(TRANSFORMER_N_LAYERS)
    ]
    return {
        "sentenceId": sentence_id,
        "tokens": tokens,
        "layers": layers,
    }


def build_transformer() -> dict:
    """Build the attention tensor payload (pure data, no I/O)."""
    sentences = []
    for spec in TRANSFORMER_SENTENCES:
        tokens = re.findall(r"[a-z]+", spec["text"].lower())
        sentences.append(build_transformer_sentence(spec["sentenceId"], tokens))
    return {
        "generator": "camp-precompute transformer",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "station": "transformer",
        "note": (
            "Self-attention weights for a few sentences. layers[l].heads[h] is a "
            "[query][key] matrix; each row is a softmax distribution over keys. "
            "Synthesised offline with hand-designed head patterns (local / "
            "content-word / first-token sink), sharp in early layers and diffuse "
            "in later ones. layers[l].qkv[h] adds tiny per-token Q/K/V vectors "
            "(dim qkvDim) factored so softmax(Q·Kᵀ/√d) reproduces heads[h] — the "
            "browser replays them and does only light dot-product/softmax "
            "arithmetic, never a model forward pass."
        ),
        "layers": TRANSFORMER_N_LAYERS,
        "heads": len(TRANSFORMER_HEAD_LABELS),
        "headLabels": TRANSFORMER_HEAD_LABELS,
        "qkvDim": TRANSFORMER_QKV_DIM,
        "sentences": sentences,
    }


def transformer(out_dir: Path) -> Path:
    """Write transformer/attention.json and register it in the manifest."""
    station_dir = out_dir / "transformer"
    station_dir.mkdir(parents=True, exist_ok=True)

    payload = build_transformer()
    art_path = station_dir / "attention.json"
    art_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")

    upsert_manifest_artifact(
        out_dir,
        {
            "id": "transformer-attention",
            "kind": "json",
            "path": "transformer/attention.json",
            "station": "transformer",
            "bytes": art_path.stat().st_size,
            "description": (
                "Precomputed self-attention tensor ([layer][head][query][key]) "
                "plus per-token Q/K/V vectors (qkv, factored to reproduce it) "
                "for the Transformer station's step-through. Replayed "
                "in-browser; only light dot-product/softmax arithmetic runs "
                "there."
            ),
        },
    )
    return art_path


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

    p_exp = sub.add_parser(
        "export-embedding-state",
        help="Export the live server's embedding state (one npz, combined "
        "zh+en vocab) and verify it reproduces the shipped points/neighbors "
        "JSON.",
    )
    p_exp.add_argument(
        "--out",
        type=Path,
        default=None,
        help="Artifact directory holding the shipped JSON (defaults to "
        "apps/course2/public/data/course2).",
    )
    p_exp.add_argument(
        "--artifacts",
        type=Path,
        default=None,
        help="Where to write the npz state (defaults to precompute/artifacts).",
    )
    p_exp.add_argument(
        "--write-artifacts",
        action="store_true",
        help="Also (re)write points/neighbors JSON from the same model state, "
        "so npz and JSON provably come from one instance.",
    )

    p_rnn = sub.add_parser(
        "rnn-viz",
        help="Write the RNN Viz station's per-timestep hidden-state activations.",
    )
    p_rnn.add_argument(
        "--out",
        type=Path,
        default=None,
        help="Output directory (defaults to apps/course2/public/data/course2).",
    )

    p_tf = sub.add_parser(
        "transformer",
        help="Write the Transformer station's attention.json and register it in "
        "manifest.json.",
    )
    p_tf.add_argument(
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

    if args.command == "export-embedding-state":
        out_dir = args.out or default_out_dir()
        artifacts_dir = args.artifacts or default_artifacts_dir()
        ok = export_server_state(
            out_dir, artifacts_dir, write_artifacts=args.write_artifacts
        )
        if args.write_artifacts:
            # The JSON was rewritten outside embedding(); refresh its manifest
            # entries so bytes stay accurate.
            for stale_id in STALE_EMBEDDING_IDS:
                remove_manifest_artifact(out_dir, stale_id)
            for kind in ("points", "neighbors"):
                rel = f"embedding/{kind}.json"
                art = out_dir / rel
                if art.exists():
                    upsert_manifest_artifact(
                        out_dir,
                        {
                            "id": f"embedding-{kind}",
                            "kind": "json",
                            "path": rel,
                            "station": "embedding",
                            "bytes": art.stat().st_size,
                        },
                    )
        if not ok:
            print(
                "export-embedding-state: VERIFY FAILED — the recomputed state "
                "does not reproduce the shipped JSON. Re-run with "
                "--write-artifacts to regenerate JSON + npz from one model "
                "instance (then commit the JSON)."
            )
            return 1
        return 0

    if args.command == "rnn-viz":
        out_dir = args.out or default_out_dir()
        path = rnn_viz(out_dir)
        print(f"wrote {path}")
        print(f"updated {out_dir / 'manifest.json'}")
        return 0

    if args.command == "transformer":
        out_dir = args.out or default_out_dir()
        path = transformer(out_dir)
        print(f"wrote {path}")
        print(f"updated {out_dir / 'manifest.json'}")
        return 0

    parser.error(f"unknown command: {args.command}")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
