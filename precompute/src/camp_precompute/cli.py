"""`camp-precompute` CLI.

For now it has a single subcommand, `make-data`, which writes a hello
manifest.json into apps/course2/public/data/course2/. As the real pipeline grows,
add subcommands here (e.g. `train-rnn`, `export-onnx`) that drop their artifacts
into the same per-course public/data folder.
"""

from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from datetime import datetime, timezone
from itertools import permutations
from pathlib import Path

import numpy as np

from .embedding import build_embedding, export_server_state
from .rnn import rnn_viz, train_rnn

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
# next-token: REAL Qwen next-token distributions (wave 3).
#
# The presets are RECORDED outputs of the same Qwen3-0.6B + settings the live
# server runs (camp_precompute.qwen), so offline fallback shows exactly what
# the GPU would answer for these prompts. The browser still only does the
# light temperature/top-k transform on the exported log-probs.
# ---------------------------------------------------------------------------

# Curated preset prompts — the station's suggestion chips AND the offline
# fallback's lookup keys. zh + en on purpose: the model is multilingual and
# typing either should feel first-class.
#
# CONTEXT-WINDOW curation: each of these carries a LONG-RANGE cue set early in
# the sentence, so shrinking the context window (the station's primary knob)
# visibly changes the top token — the effect the Loop 2 slide asks students to
# find. Verified with Qwen3-0.6B at window=2 vs full (top-1 token):
#   "…living in Japan, so she speaks fluent" : English (wrong) → Japanese
#   "…grew up in Italy, so my mother tongue is": a → Italian
#   "The password is banana. … The password is": correct → banana (copy cue)
#   "他從小在日本長大，所以他能說一口流利的"      : 「，」→ 英文 (sharpens)
#   "我最喜歡的水果是香蕉，因為它的顏色是"        : 的 → 黃 (banana → yellow)
#   "台灣最高的山是玉"                            : 的 → 山 (玉山)
# The narrow-window predictions come from the live server (only it tokenizes);
# these recorded entries are the FULL-context outputs that back the 全部
# position and the offline fallback.
NEXT_TOKEN_PROMPTS = [
    "She spent ten years living in Japan, so she speaks fluent",
    "I was born and grew up in Italy, so my mother tongue is",
    "The password is banana. Please do not forget it. The password is",
    "他從小在日本長大，所以他能說一口流利的",
    "我最喜歡的水果是香蕉，因為它的顏色是",
    "台灣最高的山是玉",
]


def make_next_token(out_dir: Path) -> Path:
    """Write distributions.json: recorded Qwen top-N for the preset prompts."""
    from . import qwen
    from .embedding import _select_device

    device = _select_device()
    print(f"next-token: loading {qwen.MODEL} on {device}…")
    tok, model = qwen.load_qwen(device)

    prompts: dict[str, list[dict]] = {}
    pieces: dict[str, list[str]] = {}
    token_ids: dict[str, list[int]] = {}
    for p in NEXT_TOKEN_PROMPTS:
        prompts[p] = qwen.next_token_entries(tok, model, p)
        pieces[p] = qwen.prompt_pieces(tok, p)
        token_ids[p] = qwen.prompt_token_ids(tok, p)
        print(f"  {p!r} → {[e['token'] for e in prompts[p][:3]]}…")

    station_dir = out_dir / "next-token"
    station_dir.mkdir(parents=True, exist_ok=True)

    payload = {
        "generator": "camp-precompute next-token",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "station": "next-token",
        "model": qwen.MODEL,
        "topN": qwen.NEXT_TOKEN_TOP_N,
        "note": (
            f"Recorded real next-token distributions from {qwen.MODEL} for the "
            "preset prompts (same code + decoding settings as the live server — "
            "see camp_precompute.qwen). logit = log P(token|prompt); the browser "
            "applies softmax(logit / temperature) and top-k. Tokens are the "
            "model's real subword pieces (a leading space is part of the token)."
        ),
        "suggestions": NEXT_TOKEN_PROMPTS,
        "prompts": prompts,
        # Per-preset context strip: the prompt's decoded pieces (+ matching vocab
        # ids) in read order (len == promptTokens). Backs the token strip offline
        # at 全部; reduced windows are served live. Same tokenization as the server.
        "pieces": pieces,
        "tokenIds": token_ids,
    }

    path = station_dir / "distributions.json"
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

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
# order-shuffle station (wave 3: real models on BOTH sides)
# ---------------------------------------------------------------------------
# The wall this station exposes: word ORDER carries meaning, and an order-blind
# bag-of-words aggregate can't see it.
#
#   - BAG-OF-WORDS side: mean pool of per-word embeddings (Qwen3-Embedding —
#     the SAME encoder as the embedding station). Mean pooling is symmetric,
#     so the fingerprint provably cannot move under shuffle. The browser only
#     averages a handful of small vectors (light, allowed) — and it fetches
#     per-WORD vectors keyed on the word set, so a reorder cannot even change
#     the request. Invariance by construction, visible in the UI.
#   - ORDER-AWARE side: Qwen3-0.6B sequence log-prob (fluency / perplexity)
#     of the actual ordered sentence. Every conditional P(t_i | t_<i) changes
#     when the order does — genuinely and honestly order-sensitive.
#
# Presets are RECORDED outputs of both real models; the live server runs the
# same code (camp_precompute.qwen / .embedding) for typed sentences.

# Fingerprint = the leading dims of the L2-normalised word embedding. Truncation
# is linear, so mean-of-truncated == truncated-of-mean — the shipped fingerprint
# is exactly the mean pool the lesson claims.
ORDER_FP_DIMS = 24

# Display domain for the fluency bar (avg log-prob per token): ≈ −2 reads
# "fluent", ≈ −11 reads "word salad", for both en and zh at this model size.
ORDER_LOGPROB_DOMAIN = (-11.0, -2.0)

# Curated sentences: few, short, unique words (an arrangement is an unambiguous
# index permutation; all n! arrangements are enumerated and shipped).
ORDER_SENTENCES = [
    {
        "sentenceId": "cat-chased-mouse",
        "prompt": "重新排列這些詞——通順度會變，但詞袋指紋動也不動。",
        "words": ["the", "cat", "chased", "a", "mouse"],
    },
    {
        "sentenceId": "she-opened-door",
        "prompt": "哪一種排列讀起來最像人話？",
        "words": ["she", "quietly", "opened", "the", "door"],
    },
    {
        "sentenceId": "zh-cat-eats-fish",
        "prompt": "中文也一樣：順序才讓句子成立。",
        "words": ["小貓", "喜歡", "偷", "吃", "魚"],
    },
]


def build_order_shuffle() -> dict:
    """Build the order-shuffle payload by RUNNING both real models."""
    from . import qwen
    from .embedding import _select_device, encode_words, load_encoder

    device = _select_device()
    print(f"order-shuffle: loading {qwen.MODEL} on {device}…")
    tok, model = qwen.load_qwen(device)
    print(f"order-shuffle: loading {emb_mod_name()} on {device}…")
    encoder = load_encoder(device)

    sentences = []
    for spec in ORDER_SENTENCES:
        words = spec["words"]
        n = len(words)

        vecs = encode_words(encoder, words)
        word_vectors = {
            w: [round(float(x), 4) for x in vecs[i][:ORDER_FP_DIMS]]
            for i, w in enumerate(words)
        }

        arrangements = []
        for perm in permutations(range(n)):
            text = qwen.join_tokens([words[i] for i in perm])
            score = qwen.sequence_logprob(tok, model, text)
            arrangements.append(
                {
                    "order": list(perm),
                    "avgLogProb": score["avgLogProb"],
                    "ppl": score["ppl"],
                }
            )
        natural = arrangements[0]
        print(
            f"  {spec['sentenceId']}: natural avgLogProb {natural['avgLogProb']} "
            f"(ppl {natural['ppl']}), {len(arrangements)} arrangements"
        )

        sentences.append(
            {
                "sentenceId": spec["sentenceId"],
                "prompt": spec["prompt"],
                "words": words,
                "wordVectors": word_vectors,
                "arrangements": arrangements,
            }
        )

    from .embedding import MODEL as EMB_MODEL

    return {
        "generator": "camp-precompute order-shuffle",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "station": "order-shuffle",
        "model": qwen.MODEL,
        "embeddingModel": EMB_MODEL,
        "note": (
            "Recorded real-model outputs. `wordVectors` are the leading "
            f"{ORDER_FP_DIMS} dims of each word's L2-normalised "
            "Qwen3-Embedding vector — the browser mean-pools them (symmetric, "
            "provably order-invariant). `arrangements` holds Qwen3-0.6B's "
            "sequence log-prob / perplexity for every permutation — the "
            "order-sensitive side. Same code + settings as the live server "
            "(camp_precompute.qwen)."
        ),
        "fingerprintDims": ORDER_FP_DIMS,
        "logProbDomain": list(ORDER_LOGPROB_DOMAIN),
        "sentences": sentences,
    }


def emb_mod_name() -> str:
    from .embedding import MODEL

    return MODEL


def order_shuffle(out_dir: Path) -> Path:
    """Write order-shuffle/predictions.json and register it in the manifest."""
    station_dir = out_dir / "order-shuffle"
    station_dir.mkdir(parents=True, exist_ok=True)

    payload = build_order_shuffle()
    art_path = station_dir / "predictions.json"
    art_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

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
# transformer station (pipeline overhaul: the WHOLE forward pass, recorded)
# ---------------------------------------------------------------------------
# The station is a left-to-right diagram of one forward pass: tokenizer chips →
# embedding strips → attention matrix + MLP slice (per layer/head) → next-token
# bars. EVERY number shown is a real Qwen3-0.6B output, recorded here for the
# preset sentences by qwen.pipeline_payload() — the same function + settings
# the live server runs for typed sentences, so a typed preset reproduces the
# shipped artifact. Embedding/MLP strips are fixed-stride subsamples (the full
# 1024/3072-dim vectors can't render); the UI labels them representative.

# Preset sentences, recorded through Qwen. Short (≤ ~8 subword tokens) so the
# all-layer/all-head tensor stays within the JSON size budget.
TRANSFORMER_SENTENCES = [
    {"sentenceId": "cat-mat", "text": "the cat sat on the mat"},
    {"sentenceId": "water-glass", "text": "she poured water into the glass"},
    {"sentenceId": "zh-cat-fish", "text": "小貓在廚房偷吃魚"},
]


def build_transformer() -> dict:
    """Record the full pipeline payload (attention + embedding/MLP slices +
    next-token output) for the preset sentences."""
    from . import qwen
    from .embedding import _select_device

    device = _select_device()
    print(f"transformer: loading {qwen.MODEL} on {device}…")
    tok, model = qwen.load_qwen(device)

    sentences = []
    n_layers = n_heads = 0
    for spec in TRANSFORMER_SENTENCES:
        pipe = qwen.pipeline_payload(tok, model, spec["text"])
        n_layers, n_heads = pipe["nLayers"], pipe["nHeads"]
        print(f"  {spec['sentenceId']}: tokens {pipe['tokens']}")
        sentences.append(
            {
                "sentenceId": spec["sentenceId"],
                # Verbatim source, so a windowed re-run sends the exact text
                # (joining tokens can mangle CJK byte-fallback pieces).
                "text": spec["text"],
                "tokens": pipe["tokens"],
                "tokenIds": pipe["tokenIds"],
                "layers": pipe["layers"],
                "embedding": pipe["embedding"],
                "mlp": pipe["mlp"],
                "output": pipe["output"],
            }
        )

    return {
        "generator": "camp-precompute transformer",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "station": "transformer",
        "model": qwen.MODEL,
        "note": (
            f"REAL forward-pass numbers from {qwen.MODEL} "
            "(qwen.pipeline_payload — same code + settings as the live "
            "server). layers[l].heads[h] is a [query][key] attention matrix; "
            "rows are softmax distributions over keys (causal: keys ≤ query). "
            "embedding.vectors / mlp.layers are fixed-stride representative "
            "slices of the real 1024-dim input embeddings and ~3072-dim MLP "
            "intermediates (down_proj input, all layers). output is the real "
            "top-N next-token log-prob distribution. Tokens are the model's "
            "real subword pieces."
        ),
        "nLayers": n_layers,
        "nHeads": n_heads,
        "sentences": sentences,
    }


def transformer(out_dir: Path) -> Path:
    """Write transformer/attention.json and register it in the manifest."""
    station_dir = out_dir / "transformer"
    station_dir.mkdir(parents=True, exist_ok=True)

    payload = build_transformer()
    art_path = station_dir / "attention.json"
    # Compact write: the all-layer/all-head tensor is big; indenting would
    # roughly triple it.
    art_path.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    print(f"  wrote {art_path} ({art_path.stat().st_size / 1e6:.2f} MB)")

    upsert_manifest_artifact(
        out_dir,
        {
            "id": "transformer-attention",
            "kind": "json",
            "path": "transformer/attention.json",
            "station": "transformer",
            "bytes": art_path.stat().st_size,
            "description": (
                "Recorded REAL Qwen3-0.6B forward-pass pipeline for the "
                "preset sentences: [layer][head][query][key] attention, "
                "fixed-stride embedding/MLP slices, and the top-N next-token "
                "distribution. Replayed in-browser; no model runs there."
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
        help="Record real Qwen next-token distributions for the preset prompts.",
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

    p_train_rnn = sub.add_parser(
        "train-rnn",
        help="Train the small GRU language model (Alice corpus) and export its "
        "weights npz for the rnn-viz artifact build + the live server.",
    )
    p_train_rnn.add_argument(
        "--artifacts",
        type=Path,
        default=None,
        help="Where to write the npz state (defaults to precompute/artifacts).",
    )

    p_rnn = sub.add_parser(
        "rnn-viz",
        help="Write the RNN Viz station's per-timestep hidden-state activations "
        "from the TRAINED GRU (run train-rnn first).",
    )
    p_rnn.add_argument(
        "--out",
        type=Path,
        default=None,
        help="Output directory (defaults to apps/course2/public/data/course2).",
    )
    p_rnn.add_argument(
        "--artifacts",
        type=Path,
        default=None,
        help="Directory holding rnn_state.npz (defaults to precompute/artifacts).",
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

    if args.command == "train-rnn":
        artifacts_dir = args.artifacts or default_artifacts_dir()
        train_rnn(artifacts_dir)
        return 0

    if args.command == "rnn-viz":
        out_dir = args.out or default_out_dir()
        artifacts_dir = args.artifacts or default_artifacts_dir()
        path = rnn_viz(out_dir, artifacts_dir)
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
