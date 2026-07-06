#!/usr/bin/env bash
#
# Classroom progression lock for Course 2.
#
# Reveals the first N *lesson* stations (in registry order). The web app polls a
# tiny file — apps/course2/public/unlocked.txt — roughly once a second, so a
# change here lands on every student's screen almost immediately, with NO rebuild.
#
# We write the number to two places:
#   - public/unlocked.txt : survives rebuilds (serve.sh rebuilds on each start)
#   - dist/unlocked.txt   : the file `vite preview` is actually serving right now,
#                           so the change is live without waiting for a rebuild.
#
# Usage:
#   scripts/unlock.sh              # interactive menu
#   scripts/unlock.sh <N>          # open the first N stations
#   scripts/unlock.sh next         # open one more
#   scripts/unlock.sh all          # open everything
#   scripts/unlock.sh reset        # remove the lock file (fail-open = all open)
#   scripts/unlock.sh status       # print current state and exit
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REG="$ROOT/apps/course2/src/stations/registry.tsx"
PUB="$ROOT/apps/course2/public/unlocked.txt"
DIST="$ROOT/apps/course2/dist/unlocked.txt"

# --- read the ordered lesson stations straight from the registry (no drift) ---
IDS=()
TITLES=()
while IFS= read -r line; do
  IDS+=("$(printf '%s' "$line" | sed -E 's/.*id: "([^"]*)".*/\1/')")
  TITLES+=("$(printf '%s' "$line" | sed -E 's/.*title: "([^"]*)".*/\1/')")
done < <(grep 'group: "lesson"' "$REG")
TOTAL=${#IDS[@]}

if [ "$TOTAL" -eq 0 ]; then
  echo "error: no lesson stations found in $REG" >&2
  exit 1
fi

# --- current count: prefer public/, then dist/, else 'unset' (fail-open) ---
current_count() {
  if [ -f "$PUB" ]; then cat "$PUB"
  elif [ -f "$DIST" ]; then cat "$DIST"
  else echo ""; fi
}

write_count() {
  local n="$1"
  printf '%s\n' "$n" > "$PUB"
  # Only touch dist if a build exists — otherwise the live update is a no-op.
  if [ -d "$(dirname "$DIST")" ]; then printf '%s\n' "$n" > "$DIST"; fi
}

print_status() {
  local cur="$1"
  echo ""
  echo "  Course 2 — station progression"
  echo "  ------------------------------"
  local i=1
  for t in "${TITLES[@]}"; do
    if [ -z "$cur" ] || [ "$i" -le "$cur" ]; then
      printf "  \033[32m●\033[0m  %d. %s\n" "$i" "$t"        # open (green)
    else
      printf "  \033[90m🔒 %d. %s\033[0m\n" "$i" "$t"         # locked (dim)
    fi
    i=$((i + 1))
  done
  echo "  ------------------------------"
  if [ -z "$cur" ]; then
    echo "  state: no lock file — ALL $TOTAL open (fail-open default)"
  else
    echo "  state: $cur of $TOTAL open"
  fi
  echo ""
}

apply() {
  local n="$1"
  # clamp to 1..TOTAL
  if [ "$n" -lt 1 ]; then n=1; fi
  if [ "$n" -gt "$TOTAL" ]; then n="$TOTAL"; fi
  write_count "$n"
  echo "→ unlocked up to station $n (\"${TITLES[$((n - 1))]}\")."
}

# --- non-interactive shortcuts ------------------------------------------------
cur="$(current_count)"
case "${1:-}" in
  status)
    print_status "$cur"; exit 0 ;;
  next)
    base="${cur:-0}"; apply $((base + 1)); exit 0 ;;
  all)
    apply "$TOTAL"; exit 0 ;;
  reset|none|unlock)
    rm -f "$PUB" "$DIST"; echo "→ lock removed (all stations open)."; exit 0 ;;
  ''|menu)
    : ;;  # fall through to interactive menu
  *)
    if printf '%s' "$1" | grep -qE '^[0-9]+$'; then apply "$1"; exit 0; fi
    echo "unknown argument: $1" >&2
    echo "usage: unlock.sh [N | next | all | reset | status]" >&2
    exit 2 ;;
esac

# --- interactive menu ---------------------------------------------------------
while true; do
  cur="$(current_count)"
  print_status "$cur"
  echo "  choose: [1-$TOTAL] open up to N   [n] open next   [a] all   [r] remove lock   [q] quit"
  printf "  > "
  read -r choice || { echo; break; }
  case "$choice" in
    [0-9]*)  apply "$choice" ;;
    n|N)     base="${cur:-0}"; apply $((base + 1)) ;;
    a|A)     apply "$TOTAL" ;;
    r|R)     rm -f "$PUB" "$DIST"; echo "→ lock removed (all stations open)." ;;
    q|Q|"")  break ;;
    *)       echo "  ?" ;;
  esac
done
