# R2 — Real GPU models + typed input across next-token / rnn / transformer / bag-of-words

> **Wave 3, prompt 2 of 2.** Self-contained session prompt. Paste into a fresh
> Claude Code session in this repo. **Run `R1-embedding-unified-space.md` FIRST** —
> it builds the shared `@camp/data` `liveInferTimed` + `@camp/ui` `LiveStatus`
> this prompt reuses. Read `CLAUDE.md`, `prompts/DESIGN.md`, `prompts/README.md`,
> and `server/README.md` first. This is the bigger of the two sessions; work
> station-by-station and keep the build green between stations.

## Why this refactor

All four LM-shaped stations are now backed by a real GPU, but today their
"models" are **toy stand-ins**, so the promise "a GPU is computing your input"
is theatre:

| Station | What runs today | Real GPU? |
|---|---|---|
| next-token | word **bigram count table**; miss → unigram fallback | ❌ |
| rnn-viz | **fixed random-seed** weights (structure is noise) | ❌ |
| transformer | **synthesised** attention patterns, capped at 8 tokens | ❌ |
| order-shuffle (bag-of-words) | in-browser lexicon sum; **no typing at all** | ❌ |

**Decision (made — don't relitigate):** upgrade to **real models on-device, reusing
`Qwen/Qwen3-0.6B` wherever the task is LM-shaped.** Then: let students type freely,
show a real GPU latency note, and cut the UI down so exploration is the point.
The golden rule still holds — the *browser* never trains; heavy compute runs on
the **server** (the sanctioned exception established in `SERVER-live-inference.md`).
The browser only does light playback transforms.

## The invariant that changes (call it out in `server/README.md`)

Today "live == precomputed **by construction**" because both import the same
deterministic function. With a real Qwen model that no longer holds automatically.
New contract: **presets are recorded real Qwen outputs.** Precompute *runs Qwen*
to bake the shipped preset artifacts; the server runs the *same* Qwen + same
decoding settings for typed input; so a preset typed live reproduces its shipped
values, and offline fallback stays honest. Document this shift; update the
"How live == precomputed is guaranteed" section.

## Part 0 — server: load Qwen3-0.6B once, reuse everywhere

Edit `server/app/loader.py`, `config.py`, `main.py`, `schemas.py`, routers.

- Load `Qwen/Qwen3-0.6B` (causal LM, `output_attentions=True` capable) **once** at
  startup on the resolved device (bf16/fp16; ~1.2 GB VRAM — fine on both boxes),
  plus its tokenizer. Add to `ModelStore`; extend `model_names`.
- **Concurrency note (don't over-build):** the server is deliberately one process
  / one device. A 0.6B model answers a short prompt in tens of ms, but a class of
  ~40 students hitting Enter together will queue. Keep single-process for now;
  add a short comment + `server/README.md` note that scaling to the 4× V100 box
  means N uvicorn workers pinned via `CUDA_VISIBLE_DEVICES=0..3` behind the
  existing reverse proxy, OR a batching queue — future work, not this session.
- Timing for the GPU note is measured **client-side** (`liveInferTimed`), so no
  server timing changes are required. `/health` may additionally report the
  loaded Qwen name.
- Keep the never-throw + `X-Camp-Token` + CORS + input-cap discipline exactly as
  the existing routers do.

## Part 1 — next-token (the flagship exploration win)

Real next-token distribution from Qwen for **any** typed prompt.

- **Server `/next-token/predict`:** run the prompt through Qwen, softmax the final
  logits, return top-N `{token, logit}` (real Qwen **subword** tokens — surface
  them honestly; "tokens aren't words" is a teachable moment). Drop the
  bigram/`context`/`contextKnown` concept entirely.
- **Precompute `next-token`:** regenerate `distributions.json` as Qwen top-N for
  the preset prompts (so fallback matches live). Keep the `suggestions` chips.
- **Station (`nextToken.tsx`):** prompt box drives everything; keep the in-browser
  `temperature` / `top-k` / greedy transform on the returned logits (light, still
  allowed). **Remove** the `context = …未知，改用詞頻` micro-copy and the whole
  bigram-miss branch — fewer moving parts. Add `<LiveStatus>` (pending → live ms →
  cached). This is where "exploration is rewarded" lands hardest: today most typed
  prompts miss the bigram table; now every prompt gets a real distribution.

## Part 2 — transformer (the hard one — real attention, keep the mechanism)

Qwen has 28 layers × 16 heads × hidden 1024 — the current 8-dim
Q·K→√d→softmax→ΣwV VectorStrip walkthrough **cannot** render real 1024-dim
vectors, and the exact-factorisation 8-token cap is gone. Resolve the tension by
**splitting the station into two clearly-labelled modes** (this also *reduces*
the current combinatorial control soup of view×sentence×layer×head×step):

- **`真實模型` (primary, live, typed):** the `AttentionLines` overview fed by
  **real Qwen attention**. Type a sentence (cap ~24 tokens for legibility), pick a
  layer + head, hover a token → see its real attention to every other token.
  `output_attentions=True` gives `[layer][head]` matrices directly; no Q/K/V
  export needed for this view. **Drop the synthetic `headLabels`** (`local` /
  `content` / `first-token`) — real heads don't carry those clean labels; show
  `L{n} · H{m}` indices instead (less false precision).
- **`機制示意` (secondary, canned, tiny):** keep the beloved five-step walkthrough
  as a **fixed schematic** on a hand-picked ~4–6-dim toy example (clearly marked
  「示意」/ schematic — NOT the live model), so the Q·K·V payoff of the course
  survives without pretending 1024-dim vectors fit on screen. It needs no server.
- **Server `/transformer/attention`:** return real per-layer/head attention for
  the typed sentence (`{sentenceId, tokens, layers:[{heads:[[...]]}], nLayers,
  nHeads}`). Drop `qkv`/`qkvDim`/`headLabels` from the live path. Raise the token
  cap from 8 to ~24. **Precompute `transformer`:** regenerate `attention.json`
  preset sentences from real Qwen attention (same shape) for fallback.
- **Station (`transformer.tsx`):** `<LiveStatus>`; simplify controls to: mode
  toggle (`真實模型` / `機制示意`), sentence/typed-input, and layer+head pickers
  (live mode only). Retire the 5-button `步驟` control from the live path (it now
  belongs only to the canned schematic).

## Part 3 — rnn (the one station Qwen can't be — a real small RNN)

Qwen is a transformer, not an RNN; reusing it would defeat the lesson (hidden
state passed along a chain; earliest token's influence decays → motivates
attention). So train a **real, tiny RNN** — this is the deliberate exception.

- **Precompute:** train a small GRU/LSTM LM (hidden ~16–32) on a modest corpus on
  the GPU (minutes), export small weights (gitignored `*.npz` under
  `precompute/artifacts/`, like the embedding state). Real trained hidden states,
  real influence-decay trace (perturb/ablate token 0, measure its lingering effect
  on `hidden[t]`). Regenerate `activations.json` presets from this real RNN.
- **Server `/rnn/forward`:** load the exported weights at startup; forward the
  typed sentence on the GPU (drop the fixed-random `build_rnn_state`). Same
  response shape (`{sequenceId, tokens, hiddenSize, hidden, influence}`), so the
  station's heatmap + influence-bar path is unchanged.
- **Station (`rnnViz.tsx`):** the custom-text input becomes primary (it's already
  gated on live — ungate it, live is always on now); add `<LiveStatus>`. The
  step/scrub controls stay (they're the lesson), but the input is no longer a
  bolt-on. If real training proves fiddly in one session, an acceptable fallback
  is a **trained** (not random) tiny RNN with a fixed small vocab — but it must be
  *trained*, not random-seed noise.

## Part 4 — order-shuffle / bag-of-words (typed input + real order-aware side)

Preserve the payoff — **bag-of-words is order-blind, a real model isn't** — but
make both sides accept typed sentences and make the order-aware side real.

- **Bag-of-words side (stays order-invariant by construction):** mean-pool word
  embeddings (reuse R1's `Qwen3-Embedding` or a light in-browser lexicon) → a
  permutation-**invariant** aggregate. It must provably not move under shuffle
  (mean pooling is symmetric) — that invariance is the whole point.
- **Order-aware side (real, GPU):** score the *actual ordered* sentence with Qwen.
  Recommended framing that stays honestly order-sensitive and is simplest to read:
  **fluency / likelihood** — Qwen's sequence log-prob (or perplexity) for the
  current arrangement, which genuinely changes when you reorder the chips, while
  bag-of-words doesn't. (Keeping the existing 3-way sentiment framing is fine too,
  via a short zero-shot prompt, but perplexity is cleaner and unambiguously
  order-driven — pick one and keep the contrast legible.)
- **Server:** add an `/order-shuffle/*` route (or fold into next-token's scoring)
  returning the order-aware score for a token sequence. **Precompute:** if you
  keep preset sentences, regenerate their order-aware scores from Qwen.
- **Station (`orderShuffle.tsx`):** add a typed-sentence input (tokenize to chips),
  keep the reorder interaction, show bag-of-words (flat under shuffle) vs
  order-aware (flips) side by side; add `<LiveStatus>`. This is the least-specified
  station — spend design care here; the acceptance test is "reorder the chips → the
  bag-of-words number does not move, the order-aware number does."

## Cross-cutting Definition of Done (extends `prompts/README.md` §DoD)

1. Server loads `Qwen/Qwen3-0.6B` once at startup on the resolved device;
   `/health` reports it; a cold typed prompt on each of next-token / transformer /
   order-shuffle returns a real Qwen-derived response, and rnn-viz returns a real
   *trained* forward pass.
2. Each of the four stations: **typing is the primary interaction**, works for
   arbitrary input (no dead-ends), and shows `<LiveStatus>` (`GPU · N ms` live;
   `離線 · 顯示預先計算的結果` when the server is stopped — verify by stopping it:
   presets still render from the shipped JSON).
3. Preset artifacts are regenerated from the **real** models so live == fallback
   for presets; `server/README.md`'s "how live == precomputed" section documents
   the recorded-outputs shift.
4. **UI got simpler, not busier:** next-token lost the bigram-context copy;
   transformer collapsed view×layer×head×step into two clean modes; the rnn/
   order-shuffle inputs are primary, not bolt-ons. Cite the specific controls you
   removed in the handoff.
5. Golden rules: browser does only light transforms (softmax/temp/top-k, mean
   pooling, heatmap playback) — **no model runs in the browser**; `three`/onnx
   lazy-in-effect; no hard-coded hexes; `DESIGN.md` idioms hold; `LiveStatus` /
   `liveInferTimed` reused from R1, not reimplemented.
6. Green: `pnpm typecheck && pnpm lint && pnpm build`; all four routes render with
   no console errors; `uv run camp-precompute make-data` (or the per-station
   commands) regenerates every artifact.

## Notes / gotchas

- **Determinism:** pin Qwen decoding for the recorded presets (greedy / fixed
  seed, `torch.no_grad()`, eval) so precompute and server agree; document the
  exact settings next to the loader.
- **Token identity:** real Qwen tokens are BPE subwords (may include leading
  spaces `Ġ`). Clean them for display but keep the honest "these are the model's
  tokens" framing — it connects back to the tokenizer station.
- **Attention memory:** `output_attentions=True` over 28 layers × 24 tokens is
  cheap; still cap tokens and only return the layers/heads the UI can show, or
  return all and slice client-side — measure and keep the JSON small.
- **rnn corpus/licensing:** use a small, clearly-licensed corpus for the RNN
  training; note its source in `precompute`.
- Don't touch the embedding station (R1 owns it) or the tokenizer/order-shuffle
  *design language* beyond what's specified — reuse, don't rebuild, shared
  `@camp/viz` primitives (`AttentionLines`, `Heatmap`, `VectorStrip`).
