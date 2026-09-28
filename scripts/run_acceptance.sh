#!/usr/bin/env bash
# Run acceptance for a phase with a self-contained throwaway test server
# (SPEC §82). Usage: scripts/run_acceptance.sh <phase>
set -u
PHASE="${1:?usage: run_acceptance.sh <phase>}"
REPO_DIR="/home/z/my-project/shadows-of-the-moon"
PORT=8000
BASE_URL="http://127.0.0.1:$PORT"

if curl -sf -o /dev/null -m 2 "$BASE_URL/"; then
  echo "[som] test server already up"
  python3 "$REPO_DIR/tools/acceptance.py" --phase "$PHASE"
  exit $?
fi

python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$REPO_DIR" >/dev/null 2>&1 &
SRV_PID=$!
trap 'kill "$SRV_PID" 2>/dev/null || true' EXIT

for _ in $(seq 1 60); do
  curl -sf -o /dev/null -m 2 "$BASE_URL/" && break
  sleep 0.5
done

if ! curl -sf -o /dev/null -m 2 "$BASE_URL/"; then
  echo "[som] ERROR: test server not reachable at $BASE_URL" >&2
  exit 1
fi

python3 "$REPO_DIR/tools/acceptance.py" --phase "$PHASE"
exit $?
