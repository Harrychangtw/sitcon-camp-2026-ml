#!/usr/bin/env bash
# V100-box prod launcher: the whole system in ONE tmux session —
#   window "camp":
#     panes 0..3 = live-inference backends, one per GPU (CUDA_VISIBLE_DEVICES=i,
#                  port BASE_PORT+1+i, bound to 127.0.0.1)
#     pane  4    = caddy load balancer on 127.0.0.1:PROXY_PORT (deploy/Caddyfile)
#     pane  5    = course2 frontend (vite, :5173)
#   window "classroom": the classroom control TUI (scripts/classroom.mjs) —
#     global lock / per-station open-close / goto broadcasts. Quitting it (q)
#     drops to a shell in that window; rerun with `node scripts/classroom.mjs`.
#
# The two tailscale funnels are UNTOUCHED: the frontend funnel keeps serving
# 5173, and the backend funnel keeps targeting PROXY_PORT — only what sits
# behind that port changes (proxy → 4 uvicorns instead of 1 uvicorn). Students'
# URLs and VITE_LIVE_INFERENCE_URL do not change.
#
# Single-GPU dev/3090 path: scripts/serve.sh (unchanged). Durable alternative
# to this tmux session: systemd camp-server@0..3 + camp-proxy (server/deploy/).
#
# Usage:
#   scripts/serve-multi.sh          # frontend: build once + preview (prod)
#   scripts/serve-multi.sh dev      # frontend: hot-reload
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
MODE="${1:-preview}"
SESSION="camp"
NGPU="${NGPU:-4}"

# Ports from server/.env (defaults: proxy 8300, backends 8301..8304).
env_get() { grep -E "^$1=" server/.env 2>/dev/null | cut -d= -f2 | tr -d '[:space:]' || true; }
BASE_PORT="$(env_get BASE_PORT)"; BASE_PORT="${BASE_PORT:-8300}"
PROXY_PORT="$(env_get PROXY_PORT)"; PROXY_PORT="${PROXY_PORT:-8300}"

CADDY="$(command -v caddy || echo "$HOME/.local/bin/caddy")"
[ -x "$CADDY" ] || { echo "caddy not found — install it first (see server/README.md)"; exit 1; }

DETECTED="$(nvidia-smi -L 2>/dev/null | wc -l || echo 0)"
if [ "$DETECTED" != "$NGPU" ]; then
  echo "warning: $DETECTED GPUs detected but launching $NGPU backends" \
       "(deploy/Caddyfile expects 4 upstreams; set NGPU or edit it)" >&2
fi

if [ "$MODE" = "dev" ]; then
  FRONTEND="cd '$ROOT' && pnpm --filter @app/course2 dev --host --port 5173"
else
  FRONTEND="cd '$ROOT' && pnpm --filter @app/course2 build && pnpm --filter @app/course2 preview --host --port 5173"
fi

tmux kill-session -t "$SESSION" 2>/dev/null || true
# kill-session only HUPs the panes. The uvicorns die on SIGHUP, but caddy
# IGNORES it — it reparents to init and keeps sharing PROXY_PORT via
# SO_REUSEPORT, so every relaunch used to leak one proxy (55 piled up once).
# vite can survive the same way. Reap this repo's strays before relaunching.
pkill -f "caddy run --config $ROOT/server/deploy/Caddyfile" 2>/dev/null || true
pkill -f "$ROOT/apps/course2/node_modules/.*vite" 2>/dev/null || true
for _ in $(seq 1 20); do
  pgrep -f "caddy run --config $ROOT/server/deploy/Caddyfile" >/dev/null || break
  sleep 0.5
done

tmux new-session -d -s "$SESSION" -c "$ROOT" -n camp

for i in $(seq 0 $((NGPU - 1))); do
  PORT_I=$((BASE_PORT + 1 + i))
  BACKEND="cd '$ROOT/server' && CUDA_VISIBLE_DEVICES=$i uv run uvicorn app.main:app --host 127.0.0.1 --port $PORT_I"
  [ "$i" -gt 0 ] && tmux split-window -t "$SESSION" -c "$ROOT"
  tmux send-keys -t "$SESSION" "$BACKEND" C-m
  tmux select-layout -t "$SESSION" tiled
done

tmux split-window -t "$SESSION" -c "$ROOT"
tmux send-keys -t "$SESSION" "PROXY_PORT=$PROXY_PORT '$CADDY' run --config '$ROOT/server/deploy/Caddyfile' --adapter caddyfile" C-m
tmux select-layout -t "$SESSION" tiled

tmux split-window -t "$SESSION" -c "$ROOT"
tmux send-keys -t "$SESSION" "$FRONTEND" C-m
tmux select-layout -t "$SESSION" tiled

# Separate window for the classroom control TUI (lock / open-close / goto).
# "$SESSION:" (trailing colon) — bare "camp" would match the WINDOW named camp.
tmux new-window -t "$SESSION:" -c "$ROOT" -n classroom
tmux send-keys -t "$SESSION:classroom" "node scripts/classroom.mjs" C-m

# Land on the serve window; the TUI is one `next-window` (prefix-n) away.
tmux select-window -t "$SESSION:camp"
tmux select-pane -t "$SESSION".0
if [ -t 0 ]; then exec tmux attach -t "$SESSION"; else
  echo "started detached — attach with: tmux attach -t $SESSION"
fi
