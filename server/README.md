# camp-server — live inference for Course 2 custom input

A small FastAPI + torch service that runs the **same models the precompute
pipeline uses** for arbitrary student input, on the five stations where the
precomputed lookup table has no row for what the student typed: **embedding**,
**next-token**, **rnn-viz**, **transformer**, **order-shuffle**.

The golden rule (browser never trains, fixed-input stations use precomputed
JSON) still holds everywhere else. This server is opt-in per station via
`VITE_LIVE_INFERENCE_URL`; if it is unset or the server is unreachable, every
station falls back to the precomputed artifacts and the class keeps working.

Since wave 3, the models are **real**: one `Qwen/Qwen3-0.6B` causal LM serves
every LM-shaped route (next-token distributions, transformer attention,
order-shuffle fluency), the embedding routes keep `Qwen3-Embedding-0.6B`, and
rnn-viz runs a small GRU **trained** by `camp-precompute train-rnn` (Qwen is a
transformer — using it for the RNN lesson would defeat the lesson).

## Endpoints

| Route | Mirrors artifact | Notes |
| --- | --- | --- |
| `GET /health` | — | No auth. `{status, device, gpu, models}` (models includes the loaded Qwen name). |
| `POST /embedding/lookup` | one word of `points.json` + `neighbors.json` | `{word}` → `{inVocab, point, neighbors, suggestions}`. One shared zh+en space (`Qwen/Qwen3-Embedding-0.6B`). In-vocab words return the shipped values verbatim; novel words are embedded live with the same multilingual model + PCA/cluster params. |
| `POST /next-token/predict` | one prompt of `distributions.json prompts{}` | `{prompt}` → `{prompt, model, topN, entries}` — real Qwen top-N log-probs over the full vocab; tokens are real subword pieces. Long prompts are truncated to the last 48 tokens, not rejected. |
| `POST /rnn/forward` | one element of `activations.json sequences[]` | `{text}` or `{tokens}` → `{sequenceId, label, tokens, hiddenSize, hidden, influence}` from the **trained** GRU (`rnn_state.npz`). Out-of-vocab words map to `<unk>`. Max 24 tokens. |
| `POST /transformer/attention` | one element of `attention.json sentences[]` | `{text}` → `{sentenceId, tokens, layers, nLayers, nHeads}` — real Qwen attention, all 28 layers × 16 heads (gzip on the wire). Max ~24 tokens (canvas legibility, not a model limit). |
| `POST /order-shuffle/score` | one element of `predictions.json arrangements[]` | `{tokens}` → `{tokens, text, avgLogProb, ppl}` — Qwen sequence log-prob of the ordered arrangement (the order-SENSITIVE side). |
| `POST /order-shuffle/bag` | a slice of `predictions.json wordVectors` | `{words}` → `{vectors, fingerprintDims}` — per-word embedding fingerprints; the browser mean-pools them (the order-INVARIANT side). The request takes a word *set*, so reordering can't even change it. |

All inference routes require the `X-Camp-Token` header (shared secret from
`CAMP_TOKEN`). CORS is restricted to `ALLOWED_ORIGINS`. Input lengths are
capped; bad input gets a 4xx with a clear message, never a stack trace.

## How live == precomputed is guaranteed

**The contract changed in wave 3.** Before, live == precomputed *by
construction*: both sides imported the same deterministic function (bigram
counts, fixed-seed RNN, synthetic attention), so equality was a mathematical
identity. With real models that's no longer automatic. The new contract:
**presets are recorded real-model outputs.**

- Precompute **runs the real models** to bake the shipped preset artifacts
  (`camp-precompute next-token / transformer / order-shuffle / rnn-viz`), and
  the server runs the **same models with the same settings** for typed input —
  both sides call the same helpers in `camp_precompute.qwen` (and
  `camp_precompute.rnn`), with the determinism contract documented there:
  float32, `attn_implementation="eager"`, `eval()` + `no_grad()`, no sampling
  anywhere, exports rounded (log-probs 4 dp, attention 3 dp). So typing a
  preset prompt live reproduces its shipped values, and offline fallback stays
  honest. (Tiny cross-torch-version float drift below the rounding precision
  is possible in principle; regenerate artifacts on the serving box if you
  ever see a last-digit mismatch.)
- The RNN's weights are a **file**, not a seed: `train-rnn` exports
  `precompute/artifacts/rnn_state.npz`, and both the `rnn-viz` artifact build
  and this server load that same npz (the server refuses to start without it).
- The embedding station keeps its wave-2 guarantee: state is exported by
  `camp-precompute export-embedding-state`, which **verifies** the recomputed
  state reproduces the shipped `points`/`neighbors` JSON exactly and refuses
  (exit 1) if it does not. In-vocab lookups are additionally served verbatim
  from the shipped JSON. If verification fails, re-run with
  `--write-artifacts` and commit the JSON.

## Concurrency: one process per GPU, replicated behind a proxy

**The app is one process on one device** — GPU forwards serialise behind an
in-process lock (`lm_lock`), so a burst degrades to predictable queueing, not
interleaved chaos. That stays true. **Scaling is pure deploy config**: on the
4× V100 camp box we run **four copies of the unchanged app**, each pinned to
one physical card via `CUDA_VISIBLE_DEVICES=<i>` (each process sees only its
card, so `DEVICE=auto` still resolves `cuda:0` inside it), listening on
`127.0.0.1:8301..8304`, behind one caddy reverse proxy on the single public
port (default 8300 — the port the backend tailscale funnel targets).

Why replication, not the alternatives: the models fit on one card with room to
spare, so sharding (`device_map="auto"`, DP/DDP) solves the wrong problem and
is slower; `uvicorn --workers N` can't give each worker its own
`CUDA_VISIBLE_DEVICES`; an in-process replica pool hits the GIL on the
CPU-heavy attention-JSON path. Separate processes reuse the code verbatim and
sidestep all three.

The proxy (`deploy/Caddyfile`) balances by **in-flight count**
(`lb_policy least_conn` — a transformer request costs far more than an
embedding lookup), health-checks `GET /health` (unauthenticated by design) so
a crashed replica is ejected instead of 502-ing a quarter of the class, and
passes `X-Camp-Token` / CORS / the backends' gzip straight through.

Launch it with systemd (`deploy/camp-server@.service` ×4 +
`deploy/camp-proxy.service`) or tmux (`scripts/serve-multi.sh`) — see the
runbook below. The 3090/dev box keeps the single process (`camp-server.service`
/ `scripts/serve.sh`); never run both deploys on one machine.

**Measured** (60-way synchronized burst, `server/scripts/loadtest.py`, local,
warm, V100):

| Route | Deploy | p50 | p95 | max | req/s |
| --- | --- | --- | --- | --- | --- |
| `/transformer/attention` | 1 process | 2.45 s | 3.63 s | 3.74 s | 15.9 |
| `/transformer/attention` | 4 + proxy | **0.46 s** | **0.75 s** | **0.80 s** | **72.1** |
| `/embedding/lookup` (novel word) | 1 process | 4.24 s | 6.18 s | 6.22 s | 9.6 |
| `/embedding/lookup` (novel word) | 4 + proxy | **1.82 s** | **1.98 s** | **1.99 s** | **30.0** |

Reproduce: `.venv/bin/python scripts/loadtest.py --base http://127.0.0.1:8300
--route /transformer/attention -n 60` (token read from `server/.env`). If
4-way ever isn't enough, the next lever is a cross-request batching queue —
deliberately not built for a 60-person camp.

---

# Deploy runbook

Two targets, one codebase. **Only `server/.env` differs between machines.**

| | Home box | TWCC VM |
| --- | --- | --- |
| GPU | 1× RTX 3090 24 GB | 4× Tesla V100 SXM2 32 GB |
| Driver | likely present | **absent** — Sidebar A |
| Inbound | LAN / router port-forward — Sidebar B | TWCC security group — Sidebar A |

The models are small: `Qwen3-Embedding-0.6B` + `Qwen3-0.6B`, both loaded in
float32 (~2.4 GB VRAM each — float32 on purpose: the V100 has no usable bf16,
and it keeps precompute/server outputs agreeing to the exported rounding),
plus a ~120 kB GRU npz. ~5 GB total per process — a sliver on either machine.
The 3090 box runs **one** process; the V100 box runs **four** (one per card,
~5 GB on each 32 GB card — see "Concurrency" above). `DEVICE=cpu` also fully
works (laptop dev / last-ditch fallback) — expect hundreds of ms instead of
tens.

## Shared path (identical on both machines)

### 0. Prereqs

- GPU driver installed (`nvidia-smi` works) — see sidebars if not.
- [uv](https://docs.astral.sh/uv/) installed:
  `curl -LsSf https://astral.sh/uv/install.sh | sh`
  (uv manages its own venvs, so PEP 668 "externally managed environment" on
  modern Ubuntu is a non-issue.)

### 1. Clone + install

```bash
git clone <repo-url> sitcon-camp-2026-ml
cd sitcon-camp-2026-ml/server
uv sync            # creates server/.venv with fastapi + torch + camp_precompute
```

The default PyPI torch wheel bundles CUDA 12 and supports both sm_86 (3090)
and sm_70 (V100); `pyproject.toml` pins `torch<2.8` to keep V100 support. If
you ever need a specific CUDA build instead:
`uv pip install torch==2.7.1 --index-url https://download.pytorch.org/whl/cu126`.

Verify torch sees the GPU(s):

```bash
uv run python -c "import torch; print(torch.cuda.is_available(), torch.cuda.device_count())"
# 3090 box: True 1     V100 VM: True 4     — both are fine (we use cuda:0 only)
```

### 2. Model state (weights + vocab)

TWO npz files must exist at `precompute/artifacts/`: the embedding state and
the trained GRU. Either copy them from the machine that generated the shipped
JSON:

```bash
scp dev-box:sitcon-camp-2026-ml/precompute/artifacts/{embedding_state,rnn_state}.npz precompute/artifacts/
```

or regenerate on this box:

```bash
cd ../precompute && uv sync
uv run camp-precompute export-embedding-state   # exits 1 if it can't reproduce the shipped JSON
uv run camp-precompute train-rnn                # trains the GRU on the committed Alice corpus (~1 min)
cd ../server
```

Note: retraining the GRU produces (slightly) different weights than the ones
that recorded the shipped `activations.json` presets — after `train-rnn` on a
new box, also run `camp-precompute rnn-viz` and commit the regenerated JSON so
presets and server state stay one pair.

First server start also downloads `Qwen3-Embedding-0.6B` and `Qwen3-0.6B`
(~1.2 GB + ~1.5 GB) into `~/.cache/huggingface` if they aren't there yet.

### 3. Config — the only per-machine step

```bash
cp .env.example .env
python3 -c "import secrets; print(secrets.token_urlsafe(32))"   # → CAMP_TOKEN
```

Edit `.env`: set `CAMP_TOKEN`, set `ALLOWED_ORIGINS` to the deployed course2
origin (plus `http://localhost:5173` for dev), pick `PORT`, leave
`DEVICE=auto`. **Nothing else changes between the 3090 and the V100 VM.**

### 4. Run persistently (systemd)

Two mutually exclusive options — pick by box, never enable both:

**(a) Single process — 3090 / dev box.**
`/etc/systemd/system/camp-server.service` (adjust `User` and the repo path):

```ini
[Unit]
Description=SITCON camp live inference server
After=network-online.target
Wants=network-online.target

[Service]
User=harry
WorkingDirectory=/home/harry/sitcon-camp-2026-ml/server
EnvironmentFile=/home/harry/sitcon-camp-2026-ml/server/.env
ExecStart=/home/harry/sitcon-camp-2026-ml/server/.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port ${PORT}
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now camp-server
journalctl -u camp-server -f     # watch the startup log
```

**(b) One replica per GPU — the 4× V100 camp box.** Install caddy (a single
static binary, no root needed for the binary itself:
`curl -sL "https://github.com/caddyserver/caddy/releases/download/v2.10.0/caddy_2.10.0_linux_amd64.tar.gz" | tar -xz caddy && mv caddy ~/.local/bin/`),
then:

```bash
sudo cp server/deploy/camp-server@.service server/deploy/camp-proxy.service /etc/systemd/system/
# edit both: User= and the absolute paths for this box
sudo systemctl daemon-reload
sudo systemctl enable --now camp-server@0 camp-server@1 camp-server@2 camp-server@3
sudo systemctl enable --now camp-proxy
journalctl -u camp-server@2 -f   # per-replica startup log
```

Instance `%i` = physical GPU index: it gets `CUDA_VISIBLE_DEVICES=%i` and
listens on `127.0.0.1:$((BASE_PORT+1+i))` (8301..8304 by default); the proxy
serves `127.0.0.1:PROXY_PORT` (8300). All read the shared `server/.env`.
Startup note: the HF weight cache is shared on disk, so if it's cold, start
`camp-server@0` alone first, let it download (~2.7 GB), then start the rest —
they'll read from cache and just load VRAM.

The startup log prints the resolved device and GPU name — confirm it says
`resolved device=cuda:0 gpu=NVIDIA GeForce RTX 3090` (or `Tesla V100-SXM2-32GB
(CUDA_VISIBLE_DEVICES=2)` per replica) so you know which card it landed on and
that it didn't silently fall back to CPU. On the multi-GPU deploy, each
internal `127.0.0.1:830x/health` must report a **different**
`CUDA_VISIBLE_DEVICES`, and `nvidia-smi` must show one python process per
card.

### 5. Smoke test

On the box:

```bash
curl -s localhost:$PORT/health
# {"status":"ok","device":"cuda:0","gpu":"...","models":[...]}
```

From an **outside** machine (this is the reachability test):

```bash
curl -s http://<public-ip-or-hostname>:PORT/health
```

Then one authed call per route, checking the shape against the artifact it
mirrors:

```bash
TOKEN=<your CAMP_TOKEN>; BASE=http://<host>:<port>
curl -s -X POST $BASE/embedding/lookup -H "X-Camp-Token: $TOKEN" -H "Content-Type: application/json" \
  -d '{"word":"貓"}'                         # inVocab:true, point+neighbors == artifact values (en words mixed in)
curl -s -X POST $BASE/embedding/lookup -H "X-Camp-Token: $TOKEN" -H "Content-Type: application/json" \
  -d '{"word":"blockchain"}'                 # inVocab:false, live point + neighbors + suggestions
curl -s -X POST $BASE/next-token/predict -H "X-Camp-Token: $TOKEN" -H "Content-Type: application/json" \
  -d '{"prompt":"the cat sat on the"}'       # real Qwen entries[]; matches distributions.json prompts{} verbatim
curl -s -X POST $BASE/rnn/forward -H "X-Camp-Token: $TOKEN" -H "Content-Type: application/json" \
  -d '{"text":"the cat sat by the door and looked at the queen"}'  # hidden 11×16; matches activations.json preset
curl -s -X POST $BASE/transformer/attention -H "X-Camp-Token: $TOKEN" -H "Content-Type: application/json" \
  -d '{"text":"the cat sat on the mat"}'     # 28 layers × 16 heads of real attention (large; gzipped on the wire)
curl -s -X POST $BASE/order-shuffle/score -H "X-Camp-Token: $TOKEN" -H "Content-Type: application/json" \
  -d '{"tokens":["the","cat","chased","a","mouse"]}'   # avgLogProb ≈ -5.5; shuffle the tokens → ppl explodes
curl -s -X POST $BASE/order-shuffle/bag -H "X-Camp-Token: $TOKEN" -H "Content-Type: application/json" \
  -d '{"words":["cat","mouse"]}'             # 24-dim fingerprints per word
```

An unauthed POST must return 401; a 30-token transformer prompt must return
422 (not a 500).

### 6. Point the frontend at it

In the course2 deployment env (e.g. Vercel project settings or
`apps/course2/.env`):

```
VITE_LIVE_INFERENCE_URL=http://<host>:<port>
VITE_LIVE_INFERENCE_TOKEN=<same CAMP_TOKEN>
```

Unset ⇒ all stations behave exactly as before (precomputed only).

> Note: a page served over **https** cannot call an **http** endpoint (mixed
> content). For an https course2 deployment, put the server behind TLS (e.g.
> a caddy/nginx reverse proxy or a Cloudflare tunnel) — for a camp-LAN dev
> serve over http this doesn't apply.

## Sidebar A — TWCC V100 VM (`203.145.221.64`)

Driver is **not** installed on a fresh VM:

```bash
sudo apt update && sudo apt install -y nvidia-driver-535-server
sudo reboot        # (or: sudo modprobe nvidia)
nvidia-smi         # must list 4× Tesla V100-SXM2-32GB
```

Reachability: host `iptables` is already open; inbound is gated by the **TWCC
web-console security group**. In the console, open **only** the one service
port (TCP, source as narrow as the venue allows). Outside smoke test:
`curl http://203.145.221.64:<PORT>/health` — if it hangs, the security group
is still closed. Because this box has a public IP: keep `CAMP_TOKEN` strong and
secret, expose only the one port, and consider a reverse proxy with rate
limiting before exposing beyond the camp network.

## Sidebar B — Home 3090 box

Driver is likely already installed (headless Ubuntu Server):

```bash
nvidia-smi         # must list 1× RTX 3090
# if missing: sudo apt install -y nvidia-driver-570-server && sudo reboot
```

Reachability: no cloud security group. If the camp is on the same LAN as the
box, use the box's LAN IP and expose nothing publicly. Otherwise port-forward
the one service port on the router (or use a tunnel, e.g. cloudflared / tailscale,
which also solves the https mixed-content note above). Same security posture:
one port, strong token.

## Local development (no GPU needed)

```bash
cd server
cp .env.example .env   # set CAMP_TOKEN to anything, DEVICE=cpu
uv run uvicorn app.main:app --port 8300
```
