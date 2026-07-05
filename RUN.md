# Run it

The system is two processes: a **live-inference backend** (FastAPI + torch, real
Qwen models on the GPU) and the **course2 frontend** (Vite). `scripts/serve.sh`
starts both in a tmux session; a tailscale funnel exposes them publicly.

Runs identically on the home 3090 box and the 4× V100 VM — **only `server/.env`
differs** (see `server/README.md` for the full deploy runbook).

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

## 4. Launch (tmux: backend + frontend)

```bash
scripts/serve.sh          # build + preview (public/funnel deploy)
scripts/serve.sh dev      # hot-reload (local iteration)
```

Two panes: left = uvicorn backend, right = vite frontend. Detach with `Ctrl-b d`;
reattach with `tmux attach -t camp`.

## 5. Expose publicly

```bash
tailscale funnel 5173     # public https URL for the frontend
```

Because the page is served over **https**, the backend must be reachable over
https too (mixed content). Simplest: put `/api` on the same origin via
`tailscale serve` path-mount, or funnel the backend port as well and point
`VITE_LIVE_INFERENCE_URL` at it. See `server/README.md` → Deploy runbook.

## Sanity check

```bash
curl -s localhost:8300/health          # {"status":"ok","device":"cuda:0",...}
```
