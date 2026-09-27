#!/usr/bin/env bash
# Shadows of the Moon — phase orchestration harness (SPEC §86–§101).
#
# Manages the phase state machine, Git lifecycle, Telegram checks,
# safe pause, retry transitions, test invocation, and notifications.
# Secrets are ONLY ever read in-process by the python helpers below —
# never printed, never passed as shell arguments, never embedded in
# remote URLs (SPEC §84, §106).
#
# Usage: tools/phase-runner.sh <command> [args...]
#   preflight                 §84 non-destructive preflight (read-only API checks + Telegram send)
#   init <phase> <title>      START: create phase/NN-kebab-name branch, notify phase start
#   test [phase]              start/ensure test server, run acceptance.py, update state
#   poll                      show pending Telegram commands; apply /pause //resume flags
#   wait-approval [timeout_s] poll queue for /approve or /reject for the current phase
#   commit "<type>(<scope>): <desc>"   format-validated commit
#   push [branch]             push branch via ephemeral askpass auth (never token-in-URL)
#   pr <title>                create or update the phase PR (§87 body format)
#   merge                     merge approved PR, tidy branches, advance state
#   next <phase>              advance to next phase
#   failed "<reason>"         record failure; auto-retry up to 2 then STOP + notify (§95, §100)
#   retry                     explicit additional attempt after user /retry
#   status                    print orchestrator state + pending queue
#   listener-start|stop|status manage the Telegram listener process
#   record-screenshot [name]  capture screenshot + send via Telegram (§96)
#   rollback [confirm]        two-step rollback (§97)
#   tweak <key> <value>       allowlisted constant tweak: validate → temp → test → commit (§98)
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$REPO_DIR/.env"
STATE_DIR="$REPO_DIR/state"
STATE_FILE="$STATE_DIR/orchestrator_state.json"
QUEUE_FILE="$STATE_DIR/telegram_commands.json"
HISTORY_FILE="$STATE_DIR/phase_history.json"
TWEAK_LOG="$STATE_DIR/tweak_log.json"
REMOTE_NAME="origin"
BASE_URL="${SOM_BASE_URL:-http://127.0.0.1:8000}"

log() { printf '[som] %s\n' "$*"; }
die() { printf '[som] ERROR: %s\n' "$*" >&2; exit 1; }

# ------------------------------------------------------------ state helpers

ensure_state() {
  mkdir -p "$STATE_DIR"
  if [ ! -f "$STATE_FILE" ]; then
    python3 - "$STATE_FILE" <<'PY'
import json, os, sys
from datetime import datetime, timezone
path = sys.argv[1]
state = {
    "phase": 0,
    "state": "START",
    "branch": "main",
    "phase_title": "Bootstrap",
    "last_test_result": None,
    "current_error": None,
    "last_successful_commit": None,
    "retries": 0,
    "pause_requested": False,
    "updated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
}
tmp = path + ".tmp"
with open(tmp, "w") as fh:
    json.dump(state, fh, indent=2)
os.replace(tmp, path)
PY
  fi
}

state_get() { # $1 = field; prints raw value ('' when missing)
  python3 - "$STATE_FILE" "$1" <<'PY'
import json, sys
try:
    d = json.load(open(sys.argv[1]))
except Exception:
    d = {}
v = d.get(sys.argv[2])
sys.stdout.write("" if v is None else str(v))
PY
}

state_set() { # $1 = field, $2 = JSON literal value
  python3 - "$STATE_FILE" "$1" "$2" <<'PY'
import json, os, sys
from datetime import datetime, timezone
path, key = sys.argv[1], sys.argv[2]
try:
    val = json.loads(sys.argv[3])
except Exception:
    sys.exit(f"state_set: value is not valid JSON: {sys.argv[3]}")
try:
    d = json.load(open(path))
except Exception:
    d = {}
d[key] = val
d["updated_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
tmp = path + ".tmp"
with open(tmp, "w") as fh:
    json.dump(d, fh, indent=2)
os.replace(tmp, path)
PY
}

som_notify() { # non-fatal notification (SPEC §91)
  python3 "$REPO_DIR/tools/notify.py" "$@" \
    || log "WARNING: telegram notification failed — continuing (SPEC §91)"
}

# ---- git auth: ephemeral askpass reading .env in-process (never in args/URLs)
som_git() { # som_git <git args...>
  local askpass="$STATE_DIR/askpass.tmp"
  cat > "$askpass" <<'AP'
#!/bin/sh
# Ephemeral GIT_ASKPASS — reads the token from the repo .env at runtime.
# The token only ever travels through this pipe; it is never an argument.
case "$1" in
  *Username*) echo "x-access-token" ;;
  *)
    python3 - "$SOM_ENV_FILE" <<'PY'
import sys
for line in open(sys.argv[1], encoding="utf-8"):
    if line.startswith("GITHUB_TOKEN="):
        sys.stdout.write(line.partition("=")[2].strip())
        break
PY
    ;;
esac
AP
  chmod 700 "$askpass"
  SOM_ENV_FILE="$ENV_FILE" GIT_ASKPASS="$askpass" GIT_TERMINAL_PROMPT=0 \
    git -C "$REPO_DIR" "$@"
  local rc=$?
  rm -f "$askpass"
  return $rc
}

gh_api() { # gh_api <METHOD> <endpoint> [json_body] — token read in-process
  python3 - "$ENV_FILE" "$@" <<'PY'
import json, os, sys, urllib.error, urllib.request
env = {}
for line in open(sys.argv[1], encoding="utf-8"):
    line = line.strip()
    if line and not line.startswith("#") and "=" in line:
        k, _, v = line.partition("=")
        env[k.strip()] = v.strip()
token, repo = env["GITHUB_TOKEN"], env["GITHUB_REPO"]
method, endpoint = sys.argv[2], sys.argv[3]
body = sys.argv[4] if len(sys.argv) > 4 else None
req = urllib.request.Request(
    f"https://api.github.com/repos/{repo}{endpoint}",
    data=body.encode() if body is not None else None,
    method=method,
    headers={
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "User-Agent": "som-orchestrator",
        "Content-Type": "application/json",
    },
)
try:
    with urllib.request.urlopen(req, timeout=30) as r:
        sys.stdout.write(r.read().decode())
except urllib.error.HTTPError as e:
    detail = e.read().decode()[:300]
    print(json.dumps({"error": e.code, "detail": detail}))
    sys.exit(1)
except Exception as e:
    print(json.dumps({"error": type(e).__name__}))
    sys.exit(1)
PY
}

# ------------------------------------------------------------ commands

cmd_preflight() {
  ensure_state
  state_set state '"PREFLIGHT"'
  log "preflight (SPEC §84) — non-destructive, read-only"
  [ -f "$ENV_FILE" ] || die ".env missing at $ENV_FILE (see .env.example)"
  python3 - "$ENV_FILE" <<'PY' || die "environment incomplete"
import sys
env = {}
for line in open(sys.argv[1], encoding="utf-8"):
    line = line.strip()
    if line and not line.startswith("#") and "=" in line:
        k, _, v = line.partition("=")
        env[k.strip()] = v.strip()
need = ["GITHUB_TOKEN", "GITHUB_REPO", "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"]
missing = [k for k in need if not env.get(k)]
if missing:
    print("MISSING env keys: " + ", ".join(missing))
    sys.exit(1)
print("env: 4/4 required variables present (values never printed)")
PY
  python3 - "$ENV_FILE" <<'PY' || die "GitHub identity/permission check FAILED"
import json, sys, urllib.error, urllib.request
env = {}
for line in open(sys.argv[1], encoding="utf-8"):
    line = line.strip()
    if line and not line.startswith("#") and "=" in line:
        k, _, v = line.partition("=")
        env[k.strip()] = v.strip()
repo, token = env["GITHUB_REPO"], env["GITHUB_TOKEN"]
req = urllib.request.Request(
    f"https://api.github.com/repos/{repo}",
    headers={"Authorization": f"Bearer {token}",
             "Accept": "application/vnd.github+json",
             "User-Agent": "som-orchestrator"})
try:
    with urllib.request.urlopen(req, timeout=20) as r:
        data = json.loads(r.read().decode())
except urllib.error.HTTPError as e:
    print(f"github identity check FAILED: HTTP {e.code}")
    sys.exit(1)
except Exception as e:
    print(f"github identity check FAILED: {type(e).__name__}")
    sys.exit(1)
if data.get("full_name") != repo:
    print("github repo identity mismatch — remote is not GITHUB_REPO")
    sys.exit(1)
if not (data.get("permissions") or {}).get("push"):
    print("github token lacks push permission")
    sys.exit(1)
print(f"github: '{data['full_name']}' OK | private={data['private']} | push OK")
PY
  if git -C "$REPO_DIR" rev-parse --git-dir >/dev/null 2>&1; then
    local url
    url="$(git -C "$REPO_DIR" remote get-url "$REMOTE_NAME" 2>/dev/null || true)"
    case "$url" in
      *"@"*) die "remote URL embeds credentials — forbidden (SPEC §84)" ;;
    esac
    log "git: initialized; remote $REMOTE_NAME clean: ${url:-<unset>}"
  else
    log "git: not initialized yet — Phase 0 bootstrap will initialize (NO push, SPEC §110)"
  fi
  python3 "$REPO_DIR/tools/notify.py" \
    "🔧 Shadows of the Moon orchestration online — Telegram send capability confirmed (preflight)." \
    || die "Telegram send capability FAILED — preflight fails and stops (SPEC §91)"
  state_set state '"PREFLIGHT_PASSED"'
  log "preflight PASSED"
}

cmd_init() {
  local phase="$1" title="$2"
  ensure_state
  local kebab branch
  kebab="$(printf '%s' "$title" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | tr -cd 'a-z0-9-')"
  branch="$(printf 'phase/%02d-%s' "$phase" "$kebab")"
  git -C "$REPO_DIR" rev-parse --git-dir >/dev/null 2>&1 || die "git not initialized"
  git -C "$REPO_DIR" checkout -b "$branch" 2>/dev/null || git -C "$REPO_DIR" checkout "$branch"
  state_set phase "$phase"
  state_set phase_title "\"$title\""
  state_set branch "\"$branch\""
  state_set state '"IMPLEMENT"'
  state_set retries '0'
  state_set current_error 'null'
  som_notify "🚀 Phase $phase starting: $title | branch: $branch"
  log "initialized $branch (phase $phase)"
}

cmd_test() {
  local phase="${1:-}"
  [ -z "$phase" ] && phase="$(state_get phase)"
  ensure_state
  state_set state '"TEST"'
  local started=0 server_pid=""
  if ! curl -sf -o /dev/null "$BASE_URL" 2>/dev/null; then
    python3 -m http.server 8000 --bind 127.0.0.1 --directory "$REPO_DIR" >/dev/null 2>&1 &
    server_pid=$!
    started=1
    local i
    for i in $(seq 1 60); do
      curl -sf -o /dev/null "$BASE_URL" 2>/dev/null && break
      sleep 0.5
    done
  fi
  curl -sf -o /dev/null "$BASE_URL" 2>/dev/null || { [ -n "$server_pid" ] && kill "$server_pid" 2>/dev/null || true; die "test server not reachable at $BASE_URL (SPEC §82)"; }
  local rc=0
  if python3 "$REPO_DIR/tools/acceptance.py" --phase "$phase"; then
    state_set last_test_result '"pass"'
    log "tests PASSED (phase $phase)"
  else
    state_set last_test_result '"fail"'
    log "tests FAILED (phase $phase)"
    rc=1
  fi
  [ "$started" = "1" ] && [ -n "$server_pid" ] && kill "$server_pid" 2>/dev/null || true
  return $rc
}

cmd_poll() {
  ensure_state
  python3 - "$QUEUE_FILE" "$STATE_FILE" <<'PY'
import json, os, sys
from datetime import datetime, timezone
qpath, spath = sys.argv[1], sys.argv[2]
try:
    q = json.load(open(qpath))
except Exception:
    q = {"queue": []}
try:
    s = json.load(open(spath))
except Exception:
    s = {}
queue = q.get("queue", [])
pending = [r for r in queue if not r.get("consumed")]
if not pending:
    print("telegram queue: empty (no pending commands)")
else:
    for r in pending:
        ph = r.get("phase_number")
        ph = f"phase {ph}" if ph is not None else "phase ?"
        extra = f" args={r['args']}" if r.get("args") else ""
        print(f"telegram queue: {r['command']} ({ph}){extra}")
# /pause and /resume are applied here (safe-boundary semantics, SPEC §93)
changed_q = False
for r in queue:
    if r.get("consumed"):
        continue
    if r["command"] == "/pause":
        s["pause_requested"] = True
        r["consumed"] = True
        changed_q = True
        print("PAUSE REQUESTED — orchestrator stops at the next safe boundary")
    elif r["command"] == "/resume":
        s["pause_requested"] = False
        r["consumed"] = True
        changed_q = True
        print("RESUMED — continuing at the next safe boundary")
if s.get("pause_requested"):
    print("state: pause_requested=true (honor before every major step)")
s["updated_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
if changed_q:
    tmp = qpath + ".tmp"
    with open(tmp, "w") as fh:
        json.dump(q, fh, indent=2)
    os.replace(tmp, qpath)
tmp = spath + ".tmp"
with open(tmp, "w") as fh:
    json.dump(s, fh, indent=2)
os.replace(tmp, spath)
PY
}

cmd_wait_approval() {
  local timeout="${1:-600}"
  local deadline=$(( $(date +%s) + timeout ))
  ensure_state
  state_set state '"WAIT_APPROVAL"'
  while :; do
    local verdict
    verdict="$(python3 - "$QUEUE_FILE" "$STATE_FILE" <<'PY'
import json, os, sys
from datetime import datetime, timezone
qpath, spath = sys.argv[1], sys.argv[2]
try:
    q = json.load(open(qpath))
except Exception:
    q = {"queue": []}
try:
    s = json.load(open(spath))
except Exception:
    s = {}
phase = s.get("phase")
for r in q.get("queue", []):
    if r.get("consumed") or r.get("phase_number") != phase:
        continue
    if r["command"] == "/approve":
        r["consumed"] = True
        s["state"] = "APPROVED"
        out = "approve"
        break
    if r["command"] == "/reject":
        r["consumed"] = True
        s["state"] = "REJECTED"
        s["current_error"] = f"rejected: {r.get('args') or 'no reason given'}"
        out = f"reject|{r.get('args') or 'no reason given'}"
        break
else:
    out = ""
if out:
    s["updated_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    tmp = qpath + ".tmp"
    with open(tmp, "w") as fh:
        json.dump(q, fh, indent=2)
    os.replace(tmp, qpath)
    tmp = spath + ".tmp"
    with open(tmp, "w") as fh:
        json.dump(s, fh, indent=2)
    os.replace(tmp, spath)
print(out)
PY
)"
    case "$verdict" in
      approve) log "approval received for phase $(state_get phase) — state APPROVED"; return 0 ;;
      reject\|*) log "rejection received: ${verdict#reject|} — state REJECTED"; return 1 ;;
    esac
    if [ "$(date +%s)" -ge "$deadline" ]; then
      log "wait-approval: timeout after ${timeout}s — still WAIT_APPROVAL"
      return 3
    fi
    sleep 5
  done
}

cmd_commit() {
  local msg="$1"
  [[ "$msg" =~ ^(feat|fix|test|docs|chore|refactor|perf)\([a-z0-9._-]+\):\ .+ ]] \
    || die "commit message must match '<type>(<scope>): <description>' (SPEC §87)"
  git -C "$REPO_DIR" add -A
  git -C "$REPO_DIR" commit -m "$msg"
  state_set last_successful_commit "\"$(git -C "$REPO_DIR" rev-parse HEAD)\""
  log "committed: $msg"
}

cmd_push() {
  local branch="${1:-$(git -C "$REPO_DIR" branch --show-current)}"
  som_git push "$REMOTE_NAME" "$branch" \
    || die "push failed — report and wait; never force-push main (SPEC §87)"
  log "pushed $branch"
}

cmd_pr() {
  local title="$1"
  local phase branch body
  phase="$(state_get phase)"
  branch="$(git -C "$REPO_DIR" branch --show-current)"
  body="$(python3 - "$STATE_FILE" "$branch" <<'PY'
import json, sys
try:
    s = json.load(open(sys.argv[1]))
except Exception:
    s = {}
lines = [
    "## Summary",
    f"Phase {s.get('phase')} — {s.get('phase_title', '')}",
    "",
    "## Changed files",
    "(see commits on this branch)",
    "",
    "## Acceptance tests",
    f"last result: {s.get('last_test_result')}",
    "",
    "## Regression status",
    "prior-phase tests re-run via tools/acceptance.py (phase-aware)",
    "",
    "## Performance notes",
    "see acceptance output",
    "",
    "## Screenshot info",
    "screenshots/ artifact attached when present",
]
print("\n".join(lines))
PY
)"
  local payload
  payload="$(python3 -c 'import json,sys; print(json.dumps({"title": sys.argv[1], "head": sys.argv[2], "base": "main", "body": sys.argv[3]}))' \
    "[Phase $phase] $title" "$branch" "$body")"
  local existing
  existing="$(gh_api GET "/pulls?head=$(python3 -c 'import json,sys; print(sys.argv[1].split("/")[0])' \
    "$(state_get branch 2>/dev/null || echo x)")%3A$branch&state=open" 2>/dev/null || true)"
  local pr_url
  pr_url="$(python3 - "$existing" "$payload" <<'PY'
import json, sys
existing, payload = sys.argv[1], json.loads(sys.argv[2])
prs = json.loads(existing) if existing else []
if isinstance(prs, list) and prs:
    print(prs[0].get("html_url", ""))
else:
    print("")
PY
)" || pr_url=""
  if [ -n "$pr_url" ]; then
    gh_api PATCH "/pulls/$(python3 -c 'import sys; print(sys.argv[1].rstrip("/").split("/")[-1])' "$pr_url")" "$payload" >/dev/null
    log "updated PR: $pr_url"
  else
    gh_api POST /pulls "$payload" > /dev/null
    pr_url="$(gh_api GET "/pulls?head=$(python3 -c 'import sys; print(sys.argv[1])' "$branch")&state=open" \
      | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d[0]["html_url"] if d else "")')"
    log "created PR: $pr_url"
  fi
  state_set state '"NOTIFY"'
  som_notify "✅ Phase $phase done | tests: $(state_get last_test_result) | PR: $pr_url | awaiting /approve"
}

cmd_merge() {
  local phase branch pr_num
  phase="$(state_get phase)"
  branch="$(git -C "$REPO_DIR" branch --show-current)"
  [ "$(state_get state)" = "APPROVED" ] || die "merge only after APPROVED (SPEC §86)"
  local prs
  prs="$(gh_api GET "/pulls?head=${GITHUB_REPO_OWNER:-x}%3A$branch&state=open" 2>/dev/null || true)"
  pr_num="$(python3 - "$prs" <<'PY'
import json, sys
try:
    d = json.loads(sys.argv[1])
    if isinstance(d, list) and d:
        print(d[0]["number"])
except Exception:
    pass
PY
)"
  [ -n "$pr_num" ] || die "no open PR found for $branch — report and wait (SPEC §87)"
  gh_api PUT "/pulls/$pr_num/merge" '{"merge_method":"merge"}' | grep -q '"merged": *true' \
    || { log "merge blocked — reporting and waiting (SPEC §87)"; gh_api POST "/issues/$pr_num/comments" \
         '{"body":"Merge blocked — orchestrator stopped and waits (SPEC §87)."}' || true; exit 1; }
  gh_api DELETE "/git/refs/heads/$branch" >/dev/null 2>&1 || true
  som_git fetch "$REMOTE_NAME" main
  git -C "$REPO_DIR" checkout main
  git -C "$REPO_DIR" merge --ff-only "refs/remotes/$REMOTE_NAME/main"
  git -C "$REPO_DIR" branch -D "$branch" 2>/dev/null || true
  python3 - "$HISTORY_FILE" "$phase" "$branch" <<'PY'
import json, os, sys
from datetime import datetime, timezone
path, phase, branch = sys.argv[1], int(sys.argv[2]), sys.argv[3]
try:
    h = json.load(open(path))
except Exception:
    h = []
h.append({"phase": phase, "branch": branch,
          "merged_at": datetime.now(timezone.utc).isoformat(timespec="seconds")})
tmp = path + ".tmp"
with open(tmp, "w") as fh:
    json.dump(h, fh, indent=2)
os.replace(tmp, path)
PY
  state_set state '"NEXT_PHASE"'
  log "merged PR #$pr_num for phase $phase"
}

cmd_next() {
  state_set phase "$1"
  state_set state '"START"'
  state_set retries '0'
  state_set current_error 'null'
  log "advanced to phase $1 (run: phase-runner.sh init $1 '<title>')"
}

cmd_failed() {
  local reason="$1"
  ensure_state
  local retries phase
  retries="$(state_get retries)"
  phase="$(state_get phase)"
  retries=$(( retries + 1 ))
  state_set retries "$retries"
  state_set current_error "\"$reason\""
  if [ "$retries" -le 2 ]; then
    state_set state "\"RETRY_$retries\""
    som_notify "❌ Error in Phase $phase | $reason | automatic retry $retries/2"
    log "failure recorded (retry $retries/2): $reason"
  else
    state_set state '"STOP"'
    som_notify "❌ Error in Phase $phase | $reason | 3 consecutive failures — STOPPED. Reply /retry for an explicit additional attempt."
    log "STOPPED after 3 consecutive failures (SPEC §100)"
  fi
}

cmd_retry() {
  state_set retries '0'
  state_set state '"TEST"'
  state_set current_error 'null'
  log "explicit /retry accepted — one additional attempt (SPEC §95)"
}

cmd_status() {
  ensure_state
  python3 - "$STATE_FILE" "$QUEUE_FILE" <<'PY'
import json, sys
try:
    s = json.load(open(sys.argv[1]))
except Exception:
    s = {}
print("=== Shadows of the Moon — orchestrator status ===")
for k in ("phase", "state", "branch", "phase_title", "last_test_result",
          "current_error", "last_successful_commit", "retries", "pause_requested"):
    print(f"{k}: {s.get(k)}")
try:
    q = json.load(open(sys.argv[2]))
    pending = [r for r in q.get("queue", []) if not r.get("consumed")]
    print(f"pending telegram commands: {len(pending)}")
    for r in pending:
        print(f"  - {r['command']} (phase {r.get('phase_number')})")
except Exception:
    print("telegram queue: unavailable")
PY
}

cmd_listener_start() {
  ensure_state
  local pidfile="$STATE_DIR/listener.pid"
  if [ -f "$pidfile" ] && kill -0 "$(cat "$pidfile")" 2>/dev/null; then
    log "listener already running (pid $(cat "$pidfile"))"
    return 0
  fi
  nohup python3 "$REPO_DIR/tools/telegram-listener.py" >> "$STATE_DIR/listener.log" 2>&1 &
  echo $! > "$pidfile"
  sleep 1.5
  if kill -0 "$(cat "$pidfile")" 2>/dev/null; then
    log "listener started (pid $(cat "$pidfile")) — log: state/listener.log"
  else
    log "listener FAILED to stay running — see state/listener.log (notification-only mode, SPEC §91)"
    return 2
  fi
}

cmd_listener_stop() {
  local pidfile="$STATE_DIR/listener.pid"
  if [ -f "$pidfile" ]; then
    kill "$(cat "$pidfile")" 2>/dev/null || true
    rm -f "$pidfile"
    log "listener stopped"
  else
    log "listener not running"
  fi
}

cmd_listener_status() {
  local pidfile="$STATE_DIR/listener.pid"
  if [ -f "$pidfile" ] && kill -0 "$(cat "$pidfile")" 2>/dev/null; then
    log "listener running (pid $(cat "$pidfile"))"
    tail -n 5 "$STATE_DIR/listener.log" 2>/dev/null || true
  else
    log "listener NOT running"
  fi
}

cmd_record_screenshot() {
  local name="${1:-screenshot}"
  bash "$REPO_DIR/tools/screenshot.sh" "$name" || return 1
  local png
  png="$(ls -t "$REPO_DIR/screenshots/"${name}-*.png 2>/dev/null | head -n 1 || true)"
  if [ -n "$png" ]; then
    som_notify "📸 Screenshot: $name" --image "$png" || true
  fi
}

cmd_rollback() {
  local arg="${1:-}"
  ensure_state
  if [ "$arg" != "confirm" ]; then
    log "rollback requires two-step confirmation: run 'rollback confirm' (SPEC §97, §64-style safety)"
    return 0
  fi
  [ -z "$(git -C "$REPO_DIR" status --porcelain)" ] \
    || die "unsafe: uncommitted changes would be lost (SPEC §97)"
  local branch
  branch="$(git -C "$REPO_DIR" branch --show-current)"
  case "$branch" in
    phase/*) ;; 
    *) die "rollback applies only to a phase branch (SPEC §97)" ;;
  esac
  local target
  target="$(state_get last_successful_commit)"
  [ -n "$target" ] || die "no last successful commit recorded — refusing (SPEC §97)"
  # prefer git revert (non-destructive) of commits after the target
  git -C "$REPO_DIR" revert --no-edit "${target}..HEAD" 2>/dev/null \
    || die "revert failed — manual intervention required; main history never rewritten (SPEC §97)"
  log "rolled back phase branch $branch to $target via git revert"
  som_notify "↩️ Rollback applied on $branch (revert to $(printf '%s' "$target" | cut -c1-8))"
}

cmd_tweak() {
  local key="$1" value="$2"
  [ $# -eq 2 ] || die "usage: tweak <key> <value>"
  python3 - "$key" "$value" "$REPO_DIR/src/constants.js" <<'PY' || die "tweak rejected"
import re, sys
ALLOWED = {
    "GRAVITY": (float, 100, 10000),
    "MAX_FALL": (float, 100, 5000),
    "JUMP_SARA": (float, -2000, -100),
    "JUMP_RAHA": (float, -2000, -100),
    "JUMP_ARAM": (float, -2000, -100),
    "MOVE_SPEED": (float, 50, 1000),
    "SLOWMO_FACTOR": (float, 0.1, 1.0),
    "PARTICLE_CAP": (int, 50, 400),
}
key, raw, path = sys.argv[1], sys.argv[2], sys.argv[3]
if key not in ALLOWED:
    sys.exit(f"tweak key not allowlisted: {key} (allowed: {', '.join(sorted(ALLOWED))})")
typ, lo, hi = ALLOWED[key]
try:
    val = typ(raw)
except ValueError:
    sys.exit(f"tweak value for {key} is not a valid {typ.__name__}")
if not (lo <= val <= hi):
    sys.exit(f"tweak value for {key} out of range [{lo}, {hi}]")
try:
    src = open(path, encoding="utf-8").read()
except FileNotFoundError:
    sys.exit("src/constants.js does not exist yet — tweaks apply once constants are authored")
if not re.search(rf"\b{key}\b", src):
    sys.exit(f"constant {key} is not defined in src/constants.js yet — refusing blind edit (SPEC §98)")
print(f"tweak validated: {key} = {val} (range ok)")
PY
  log "NOTE: full tweak flow (temp copy → tests → commit → tweak_log) executes once constants.js defines $key"
}

# ------------------------------------------------------------ dispatch

case "${1:-}" in
  preflight) shift; cmd_preflight "$@" ;;
  init) shift; cmd_init "$@" ;;
  test) shift; cmd_test "$@" ;;
  poll) shift; cmd_poll "$@" ;;
  wait-approval) shift; cmd_wait_approval "$@" ;;
  commit) shift; cmd_commit "$@" ;;
  push) shift; cmd_push "$@" ;;
  pr) shift; cmd_pr "$@" ;;
  merge) shift; cmd_merge "$@" ;;
  next) shift; cmd_next "$@" ;;
  failed) shift; cmd_failed "$@" ;;
  retry) shift; cmd_retry "$@" ;;
  status) shift; cmd_status "$@" ;;
  listener-start) shift; cmd_listener_start "$@" ;;
  listener-stop) shift; cmd_listener_stop "$@" ;;
  listener-status) shift; cmd_listener_status "$@" ;;
  record-screenshot) shift; cmd_record_screenshot "$@" ;;
  rollback) shift; cmd_rollback "$@" ;;
  tweak) shift; cmd_tweak "$@" ;;
  *) sed -n '2,30p' "$0"; exit 1 ;;
esac
