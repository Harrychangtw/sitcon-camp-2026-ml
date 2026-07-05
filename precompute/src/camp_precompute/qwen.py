"""camp_precompute.qwen — the ONE Qwen3-0.6B causal LM, shared by precompute
and the live server.

Wave 3 changed the live == precomputed contract: presets are now RECORDED REAL
MODEL OUTPUTS. This module is what keeps the recording honest — the artifact
build (next-token distributions, transformer attention, order-shuffle fluency)
and the live server both call THESE functions with THESE settings, so a preset
typed live reproduces its shipped values (up to float tolerance; exports are
rounded).

Determinism contract (do not change one side without regenerating artifacts):
- weights: ``Qwen/Qwen3-0.6B`` (~0.6B params, ~2.4 GB in float32)
- dtype: float32 — reproducible across the RTX 3090 and the Tesla V100
  (sm_70 has no usable bf16), and numerically stabler than fp16 for the small
  batches this course needs. VRAM is a non-issue at this size.
- attn_implementation="eager" — sdpa/flash kernels do not return attention
  weights; eager does, and it is the same math.
- model.eval() + torch.no_grad() everywhere; NO sampling anywhere — we export
  distributions and attention maps, never sampled text.
- exports rounded: logits/log-probs to 4 decimals, attention weights to 3.
"""

from __future__ import annotations

import math
import re

import numpy as np

MODEL = "Qwen/Qwen3-0.6B"

NEXT_TOKEN_TOP_N = 12

# Live-input caps. Next-token prompts are truncated (keep the tail — that is
# what conditions the next token); attention input is rejected beyond the cap
# because the station has to DRAW every token pair.
NEXT_TOKEN_MAX_TOKENS = 48
ATTENTION_MAX_TOKENS = 24
FLUENCY_MAX_TOKENS = 48
# Tokenizer station shows every chip; cap the run so a paste can't produce a
# thousand-chip wall (and to bound the response).
TOKENIZER_MAX_TOKENS = 128


def load_qwen(device: str):
    """Load tokenizer + causal LM once (see the determinism contract above)."""
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer

    tok = AutoTokenizer.from_pretrained(MODEL)
    model = AutoModelForCausalLM.from_pretrained(
        MODEL, dtype=torch.float32, attn_implementation="eager"
    )
    model.to(device)
    model.eval()
    return tok, model


def _decode_pieces(tok, ids: list[int]) -> list[str]:
    """Per-token display strings. These are the model's REAL subword pieces
    (decoded, so a leading space survives as " word"); stations render the
    space visibly — "tokens aren't words" is part of the lesson. A byte-level
    piece that isn't valid UTF-8 on its own decodes to the replacement char —
    also honest."""
    return [tok.decode([i]) for i in ids]


def tokenize_pieces(
    tok, text: str, max_tokens: int = TOKENIZER_MAX_TOKENS
) -> list[dict]:
    """Real Qwen BPE tokenization of arbitrary text: [{id, piece}, ...].

    This is the tokenizer station's BPE mode — the REAL merges/vocab Qwen ships,
    not the toy corpus the browser fallback approximates. ``piece`` is the
    decoded per-token string (a word-initial token keeps its leading space, so
    the station can draw the word boundary; a byte-level piece that isn't valid
    UTF-8 on its own decodes to the replacement char — honest, same as
    ``_decode_pieces``). ``add_special_tokens=False``: show only content tokens,
    no chat scaffolding. There is no ``unk`` — byte-level BPE covers every
    string, which is exactly the point ("stop guessing").
    """
    ids = tok(text, add_special_tokens=False).input_ids[:max_tokens]
    return [{"id": int(i), "piece": tok.decode([i])} for i in ids]


def next_token_entries(tok, model, prompt: str, top_n: int = NEXT_TOKEN_TOP_N) -> list[dict]:
    """Top-N next-token log-probs for a prompt: [{token, logit}, ...].

    ``logit`` is log P(token | prompt) over the FULL vocab (log-softmax), so the
    browser's softmax(logit / T) over the top-N recovers the renormalised
    distribution at T=1 — the same light transform the station always did.
    Special tokens (im_end etc.) are skipped; they are chat scaffolding, not
    language.
    """
    import torch

    ids = tok(prompt, return_tensors="pt").input_ids
    if ids.shape[1] == 0:
        return []
    ids = ids[:, -NEXT_TOKEN_MAX_TOKENS:]
    with torch.no_grad():
        logits = model(ids.to(model.device)).logits[0, -1]
    logprobs = torch.log_softmax(logits.float(), dim=-1)
    special = set(tok.all_special_ids)

    ranked = torch.argsort(logprobs, descending=True)
    entries: list[dict] = []
    for idx in ranked.tolist():
        if idx in special:
            continue
        entries.append(
            {"token": tok.decode([idx]), "logit": round(float(logprobs[idx]), 4)}
        )
        if len(entries) >= top_n:
            break
    return entries


def attention_payload(
    tok, model, text: str, max_tokens: int = ATTENTION_MAX_TOKENS
) -> dict:
    """Real per-layer / per-head attention for one sentence.

    Returns {tokens, layers: [{heads: [[q][k]]}], nLayers, nHeads} — the element
    shape of attention.json ``sentences[]`` (minus sentenceId, which the caller
    stamps). Raises ValueError on too-few/too-many tokens; the server maps that
    to a 422, precompute treats it as a build error.
    """
    import torch

    ids = tok(text, return_tensors="pt").input_ids
    n = int(ids.shape[1])
    if n < 2:
        raise ValueError("need at least 2 tokens")
    if n > max_tokens:
        raise ValueError(f"too many tokens ({n} > max {max_tokens})")

    with torch.no_grad():
        out = model(ids.to(model.device), output_attentions=True)

    layers = []
    for layer_att in out.attentions:  # each: [1, heads, n, n]
        heads = np.round(layer_att[0].float().cpu().numpy(), 3)
        layers.append({"heads": heads.tolist()})

    return {
        "tokens": _decode_pieces(tok, ids[0].tolist()),
        "layers": layers,
        "nLayers": len(layers),
        "nHeads": int(out.attentions[0].shape[1]),
    }


def join_tokens(tokens: list[str]) -> str:
    """Rebuild text from word/character chips: a space between two ASCII-alnum
    chips (English words), nothing otherwise (Chinese characters). Shared by
    precompute and the server so an arrangement is scored on the same string."""
    out = ""
    prev_ascii = False
    for t in tokens:
        is_ascii = bool(re.fullmatch(r"[A-Za-z0-9]+", t))
        if out and is_ascii and prev_ascii:
            out += " "
        out += t
        prev_ascii = is_ascii
    return out


def sequence_logprob(tok, model, text: str) -> dict:
    """Fluency of a token sequence: mean log P(t_i | t_<i) over positions ≥ 1
    (the first token has no context), plus perplexity = exp(−mean).

    Genuinely order-sensitive — reordering the words changes every conditional —
    which is exactly the contrast the order-shuffle station needs against the
    order-invariant bag-of-words mean pool.
    """
    import torch

    ids = tok(text, return_tensors="pt").input_ids
    n = int(ids.shape[1])
    if n < 2:
        raise ValueError("need at least 2 tokens to score fluency")
    if n > FLUENCY_MAX_TOKENS:
        raise ValueError(f"too many tokens ({n} > max {FLUENCY_MAX_TOKENS})")

    ids = ids.to(model.device)
    with torch.no_grad():
        logits = model(ids).logits[0]
    logprobs = torch.log_softmax(logits.float(), dim=-1)
    # position i predicts token i+1
    tail = ids[0, 1:]
    picked = logprobs[torch.arange(n - 1), tail]
    # ppl derives from the ROUNDED mean so precompute and server agree to the
    # digit even across minor torch-version float drift.
    avg = round(float(picked.mean()), 4)
    return {
        "avgLogProb": avg,
        "ppl": round(math.exp(-avg), 2),
        "nTokens": n,
    }
