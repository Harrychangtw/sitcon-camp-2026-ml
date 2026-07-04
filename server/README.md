# camp-server — live inference for Course 2 custom input

A small FastAPI + torch service that runs the **same models the precompute
pipeline uses** for arbitrary student input, on the four stations where the
precomputed lookup table has no row for what the student typed: **embedding**,
**next-token**, **rnn-viz**, **transformer**.

The golden rule (browser never trains, fixed-input stations use precomputed
JSON) still holds everywhere else. This server is opt-in per station via
`VITE_LIVE_INFERENCE_URL`; if it is unset or the server is unreachable, every
station falls back to the precomputed artifacts and the class keeps working.

## Endpoints

| Route | Mirrors artifact | Notes |
| --- | --- | --- |
| `GET /health` | — | No auth. `{status, device, gpu, models}` |
| `POST /embedding/lookup` | one word of `points.{lang}.json` + `neighbors.{lang}.json` | `{word, lang}` → `{inVocab, point, neighbors, suggestions}`. In-vocab words return the shipped values verbatim; novel words are embedded live with the same BGE model + PCA/cluster params. |
| `POST /next-token/predict` | one context of `distributions.json` | `{prompt}` → `{context, contextKnown, topN, entries}` (same bigram/unigram tables, rebuilt from the same code). |
| `POST /rnn/forward` | one element of `activations.json sequences[]` | `{text}` or `{tokens}` → `{sequenceId, label, tokens, hiddenSize, hidden, influence}`. Preset vocab reuses the artifact's exact embeddings; novel tokens get deterministic crc32-seeded ones. Max 24 tokens. |
| `POST /transformer/attention` | one element of `attention.json sentences[]` | `{text}` → `{sentenceId, tokens, layers, headLabels, qkvDim}`. Max 8 tokens (Q/K factorisation is exact only up to d=8). |

All inference routes require the `X-Camp-Token` header (shared secret from
`CAMP_TOKEN`). CORS is restricted to `ALLOWED_ORIGINS`. Input lengths are
capped; bad input gets a 4xx with a clear message, never a stack trace.

## How live == precomputed is guaranteed

- The server **imports** `camp_precompute` (path dependency): bigram tables,
  RNN weights, and transformer attention are rebuilt at startup by the same
  deterministic functions that wrote the artifacts — there is no second model.
- The embedding station's state (vocab vectors, PCA params, k-means centroids)
  is exported by `camp-precompute export-embedding-state`, which **verifies**
  the recomputed state reproduces the shipped `points`/`neighbors` JSON exactly
  and refuses (exit 1) if it does not. In-vocab lookups are additionally served
  verbatim from the shipped JSON.
- If verification fails (e.g. the Python env changed since the artifacts were
  generated), run `camp-precompute export-embedding-state --write-artifacts`
  to regenerate JSON + npz from **one** model instance, then commit the JSON.

---

# Deploy runbook

Two targets, one codebase. **Only `server/.env` differs between machines.**

| | Home box | TWCC VM |
| --- | --- | --- |
| GPU | 1× RTX 3090 24 GB | 4× Tesla V100 SXM2 32 GB |
| Driver | likely present | **absent** — Sidebar A |
| Inbound | LAN / router port-forward — Sidebar B | TWCC security group — Sidebar A |

The models are tiny (two ~400 MB BGE encoders; everything else is numpy). One
process on `cuda:0` uses a sliver of VRAM on either machine; the extra V100s
buy nothing at this load and are deliberately not used. `DEVICE=cpu` also fully
works (laptop dev / last-ditch fallback) — lookups take ~100 ms instead of ~10.

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

The embedding npz state must exist at `precompute/artifacts/`. Either copy it
from the machine that generated the shipped JSON:

```bash
scp dev-box:sitcon-camp-2026-ml/precompute/artifacts/embedding_state.*.npz precompute/artifacts/
```

or regenerate + verify on this box (downloads the two BGE models, ~800 MB,
then embeds the vocab — minutes on GPU):

```bash
cd ../precompute && uv sync
uv run camp-precompute export-embedding-state   # exits 1 if it can't reproduce the shipped JSON
cd ../server
```

First server start also downloads the BGE models into `~/.cache/huggingface`
if they aren't there yet.

### 3. Config — the only per-machine step

```bash
cp .env.example .env
python3 -c "import secrets; print(secrets.token_urlsafe(32))"   # → CAMP_TOKEN
```

Edit `.env`: set `CAMP_TOKEN`, set `ALLOWED_ORIGINS` to the deployed course2
origin (plus `http://localhost:5173` for dev), pick `PORT`, leave
`DEVICE=auto`. **Nothing else changes between the 3090 and the V100 VM.**

### 4. Run persistently (systemd)

`/etc/systemd/system/camp-server.service` — identical on both machines
(adjust `User` and the repo path):

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

The startup log prints the resolved device and GPU name — confirm it says
`resolved device=cuda:0 gpu=NVIDIA GeForce RTX 3090` (or `Tesla V100-SXM2-32GB`)
so you know which machine it landed on and that it didn't silently fall back
to CPU.

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
  -d '{"word":"the","lang":"en"}'            # inVocab:true, point+neighbors == artifact values
curl -s -X POST $BASE/embedding/lookup -H "X-Camp-Token: $TOKEN" -H "Content-Type: application/json" \
  -d '{"word":"blockchain","lang":"en"}'     # inVocab:false, live point + neighbors + suggestions
curl -s -X POST $BASE/next-token/predict -H "X-Camp-Token: $TOKEN" -H "Content-Type: application/json" \
  -d '{"prompt":"the cat sat on the"}'       # context:"the", contextKnown:true, entries[]
curl -s -X POST $BASE/rnn/forward -H "X-Camp-Token: $TOKEN" -H "Content-Type: application/json" \
  -d '{"text":"the cat sat on the mat by the door"}'   # hidden 9×16, influence decays
curl -s -X POST $BASE/transformer/attention -H "X-Camp-Token: $TOKEN" -H "Content-Type: application/json" \
  -d '{"text":"the cat sat on the mat"}'     # 3 layers × 3 heads + qkv
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
