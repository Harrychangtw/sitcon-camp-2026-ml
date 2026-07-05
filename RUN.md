# Run it

The system is a **live-inference backend** (FastAPI + torch, real Qwen models
on the GPU) and the **course2 frontend** (Vite), exposed publicly by two
tailscale funnels. Two launch paths, same code:

- **prod / 4× V100 camp box** — four GPU-pinned backend replicas behind a
  caddy load balancer (`scripts/serve-multi.sh`), § 4a
- **dev / 3090 box** — one backend process (`scripts/serve.sh`), § 4b

**Only `server/.env` and the launcher differ** between them (see
`server/README.md` for the full deploy runbook and the burst benchmark).

## 1. Install

```bash
corepack enable && pnpm install          # frontend workspace
cd server && uv sync && cd ..            # backend (torch + models)
```

## 2. Model state

The backend needs two npz files at `precompute/artifacts/` (gitignored). Copy
them from the box that built the shipped JSON, or regenerate:

```bash
cd precompute && uv sync
uv run camp-precompute export-embedding-state    # embedding_state.npz
uv run camp-precompute train-rnn                 # rnn_state.npz (~1 min)
cd ..
```

First backend start also downloads `Qwen3-Embedding-0.6B` + `Qwen3-0.6B`
(~2.7 GB) into `~/.cache/huggingface`.

## 3. Configure

```bash
cp server/.env.example server/.env
# set CAMP_TOKEN (python3 -c 'import secrets;print(secrets.token_urlsafe(32))'),
# ALLOWED_ORIGINS, PORT, leave DEVICE=auto

cp apps/course2/.env.example apps/course2/.env.local
# set VITE_LIVE_INFERENCE_URL (the funnel URL) + VITE_LIVE_INFERENCE_TOKEN (= CAMP_TOKEN)
```

Leaving `apps/course2/.env.local` unset ⇒ every station runs on precomputed JSON
only (no backend needed).

## 4a. Launch — prod (4× V100 box)

One public URL per funnel, four GPUs behind them. The backend funnel targets
the **proxy port** (8300); the proxy `least_conn`-balances across four backend
replicas on `127.0.0.1:8301..8304`, one per GPU. The funnels and
`VITE_LIVE_INFERENCE_URL` never change when you switch between one and four
backends — only what sits behind port 8300 does.

In order:

```bash
# 1. start the stack: 4 pinned backends + caddy proxy (:8300) + frontend (:5173)
scripts/serve-multi.sh              # tmux session "camp"; Ctrl-b d to detach
#    (durable alternative: systemd camp-server@0..3 + camp-proxy — server/README.md § 4b)

# 2. wait for the replicas to load models (~30 s), then confirm each is on its own card
for p in 8301 8302 8303 8304; do curl -s 127.0.0.1:$p/health | grep -o 'CUDA_VISIBLE_DEVICES=.'; done
#    → =0 =1 =2 =3, one line each; nvidia-smi shows one python per GPU

# 3. confirm BOTH funnels are up (frontend 443→5173, backend 8443→8300)
tailscale funnel status
#    if missing:  sudo tailscale funnel 5173
#                 sudo tailscale funnel --bg --https 8443 8300

# 4. sanity checks
curl -s 127.0.0.1:8300/health                      # proxy → some backend
curl -s https://<ts-host>:8443/health              # through the funnel
curl -s https://<ts-host>/ | grep -o '<title>.*'   # frontend up
```

Then the real end-to-end test: open the public frontend URL, type a **novel**
word/prompt on a live station, and confirm a live result (funnel → proxy → a
GPU backend). Requires caddy: a single static binary in `~/.local/bin` —
install one-liner in `server/README.md` § 4b.

## 4b. Launch — dev / 3090 box (single process)

```bash
scripts/serve.sh          # build + preview (funnel deploy)
scripts/serve.sh dev      # hot-reload (local iteration)
```

Two panes: left = one uvicorn backend on `PORT` (8300), right = vite frontend.
Detach with `Ctrl-b d`; reattach with `tmux attach -t camp`. Expose the same
way as prod (funnel 5173 + funnel the backend port); with a single backend the
funnel targets uvicorn directly instead of the proxy.

## 5. Public URLs / https

Both funnels give https URLs on the same tailnet host; the page is https, so
the backend must be too (mixed content) — the funnel terminates TLS for it.
`VITE_LIVE_INFERENCE_URL` = the backend funnel URL (`https://<ts-host>:8443`).

## Sanity check

```bash
curl -s localhost:8300/health          # {"status":"ok","device":"cuda:0",...}
# prod: also per-replica — curl -s localhost:8301/health … :8304
```
