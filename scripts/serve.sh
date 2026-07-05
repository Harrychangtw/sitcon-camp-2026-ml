#!/usr/bin/env bash
# Launch the whole system in ONE tmux session with two panes:
#   left  = live-inference backend  (uvicorn, reads server/.env)
#   right = course2 frontend        (vite)
# Expose publicly with tailscale funnel (see RUN.md).
#
# Usage:
#   scripts/serve.sh            # preview: build once, serve the built app (funnel/prod)
#   scripts/serve.sh dev        # dev: hot-reload (local iteration)
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
MODE="${1:-preview}"
SESSION="camp"

# Backend port comes from server/.env (falls back to 8300).
PORT="$(grep -E '^PORT=' server/.env 2>/dev/null | cut -d= -f2 | tr -d '[:space:]')"
PORT="${PORT:-8300}"

BACKEND="cd '$ROOT/server' && uv run uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"
if [ "$MODE" = "dev" ]; then
  FRONTEND="cd '$ROOT' && pnpm --filter @app/course2 dev --host --port 5173"
else
  FRONTEND="cd '$ROOT' && pnpm --filter @app/course2 build && pnpm --filter @app/course2 preview --host --port 5173"
fi

tmux kill-session -t "$SESSION" 2>/dev/null || true
tmux new-session -d -s "$SESSION" -c "$ROOT" -n camp
tmux send-keys  -t "$SESSION" "$BACKEND" C-m          # pane 0 → backend
tmux split-window -h -t "$SESSION" -c "$ROOT"
tmux send-keys  -t "$SESSION" "$FRONTEND" C-m         # pane 1 → frontend
tmux select-pane -t "$SESSION".0
exec tmux attach -t "$SESSION"
