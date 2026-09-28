#!/usr/bin/env bash
# Phase 6 screenshot verification wrapper (SPEC §82): ensures the test
# server, runs scripts/capture_phase6.py, tears the server down.
set -u
REPO_DIR="/home/z/my-project/shadows-of-the-moon"
PORT=8000
BASE_URL="http://127.0.0.1:${PORT}"

if curl -sf -o /dev/null -m 2 "$BASE_URL/"; then
  python3 "$REPO_DIR/scripts/capture_phase6.py"
  exit $?
fi

python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$REPO_DIR" >/dev/null 2>&1 &
SRV_PID=$!
trap 'kill "$SRV_PID" 2>/dev/null || true' EXIT
for _ in $(seq 1 60); do
  curl -sf -o /dev/null -m 2 "$BASE_URL/" && break
  sleep 0.5
done
python3 "$REPO_DIR/scripts/capture_phase6.py"
exit $?
