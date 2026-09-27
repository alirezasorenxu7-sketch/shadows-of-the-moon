#!/usr/bin/env bash
# Shadows of the Moon — screenshot capture (SPEC §96, §104).
# Launches/connects the local test env, captures a headless-Chromium
# screenshot, stores it under screenshots/. No secret exposure — this
# script never reads or handles credentials.
#
# Usage: tools/screenshot.sh [name]
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT=8000
NAME="${1:-screenshot}"
BASE_URL="http://127.0.0.1:${PORT}"

started=0
server_pid=""

cleanup() {
  if [ "$started" = "1" ] && [ -n "$server_pid" ]; then
    kill "$server_pid" 2>/dev/null || true
  fi
}
trap cleanup EXIT

if ! curl -sf -o /dev/null "$BASE_URL" 2>/dev/null; then
  python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$REPO_DIR" >/dev/null 2>&1 &
  server_pid=$!
  started=1
  for _ in $(seq 1 60); do
    curl -sf -o /dev/null "$BASE_URL" 2>/dev/null && break
    sleep 0.5
  done
fi

curl -sf -o /dev/null "$BASE_URL" 2>/dev/null || { echo "screenshot: server not reachable" >&2; exit 1; }

python3 "$REPO_DIR/tools/acceptance.py" --screenshot "$NAME"
