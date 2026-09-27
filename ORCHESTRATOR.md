# ORCHESTRATOR — Shadows of the Moon

Operational manual for the phase-driven development workflow. Authoritative
sources: SPEC §84–§110. Tooling: `tools/phase-runner.sh` (state machine),
`tools/telegram-listener.py` (commands), `tools/notify.py` (notifications),
`tools/acceptance.py` (tests), `tools/screenshot.sh` (captures).

## 1. Phase state machine (§100)

```
Phase 1+:

START → PREFLIGHT → IMPLEMENT → TEST
  PASS:    COMMIT → PUSH → OPEN_PR_OR_UPDATE → NOTIFY → WAIT_APPROVAL → APPROVED → MERGE → NEXT_PHASE
  REJECT:  WAIT_APPROVAL → REJECTED → IMPLEMENT
  FAIL:    RETRY_1 → TEST → RETRY_2 → TEST → STOP + NOTIFY_ERROR
```

State persists in `state/orchestrator_state.json` (gitignored):

```json
{
  "phase": 0,
  "state": "START|PREFLIGHT|PREFLIGHT_PASSED|IMPLEMENT|TEST|COMMIT|PUSH|OPEN_PR_OR_UPDATE|NOTIFY|WAIT_APPROVAL|APPROVED|REJECTED|RETRY_1|RETRY_2|MERGE|NEXT_PHASE|STOP|DONE",
  "branch": "main",
  "phase_title": "Bootstrap",
  "last_test_result": "pass|fail|null",
  "current_error": null,
  "last_successful_commit": null,
  "retries": 0,
  "pause_requested": false,
  "updated_at": "<iso-8601 utc>"
}
```

Emergency stop conditions (any → STOP, notify, wait for `/retry` or user):

- 3 consecutive failures in one phase
- token leak suspected
- explicit `/pause` ( honored at the next safe boundary )
- more than 2 hours on one phase

Never bypass a stop.

## 2. Phase workflow discipline (§101)

Before modifying any files:

1. reread relevant SPEC sections
2. `git status`
3. `git log -5`
4. inspect `TASKS.md`
5. inspect `ORCHESTRATOR.md`
6. run existing applicable tests (`tools/phase-runner.sh test`)
7. implement only the current phase
8. do not refactor unrelated systems

Poll Telegram (`tools/phase-runner.sh poll`):

- before every major implementation step
- after every major step
- at least every 5 seconds during long operations

Honor `/pause` at safe boundaries: no new implementation step, no process kills,
wait for `/resume`.

## 3. Git lifecycle (§84–§88)

- Phase 0 (ONLY): work on local `main`; NO feature branch, NO PR, NO push (§85, §110).
- Phase 1+: every phase runs on `phase/NN-kebab-name` (e.g. `phase/01-game-loop`).
- Commit format: `<type>(<scope>): <description>` with types
  feat/fix/test/docs/chore/refactor/perf. Validated by `phase-runner.sh commit`.
- PR title: `[Phase N] Short title`. PR body: summary, changed files, acceptance
  tests, regression status, performance notes, screenshot info (§87).
- Never bypass branch protection. Never force-push main. Merge blocked →
  report, stop, wait.
- First push plan (Phase 1): push `phase/01-game-loop` (becomes the remote's
  initial content), then push local `main` (bootstrap commit) to create the PR
  base, set the default branch to `main` via the API, then open the PR. This
  honors §110 ("first push will be the initial commit on phase/01-game-loop")
  while establishing a PR-able `main`.
- Auth: ephemeral `GIT_ASKPASS` helper that reads the token from `.env`
  in-process. The token is NEVER an argument, NEVER in a remote URL, NEVER
  logged. Remote URL stays clean:
  `https://github.com/alirezasorenxu7-sketch/shadows-of-the-moon.git`.
- Existing `.git` (if any) is preserved: history, config, never reinitialized (§84).

Typical phase flow:

```
tools/phase-runner.sh init 1 "game loop"     # creates phase/01-game-loop + start notification
# ... implement ...
tools/phase-runner.sh poll                   # before/after every major step
tools/phase-runner.sh test                   # server + acceptance.py --phase 1
tools/phase-runner.sh commit "feat(loop): add fixed timestep"
tools/phase-runner.sh push
tools/phase-runner.sh pr "Game loop and pause fundamentals"
tools/phase-runner.sh wait-approval          # polls Telegram queue for /approve or /reject
tools/phase-runner.sh merge                  # after APPROVED only
tools/phase-runner.sh next 2
```

## 4. Telegram lifecycle (§90–§99)

### Listener

`tools/telegram-listener.py` runs as a SINGLE process (managed via
`phase-runner.sh listener-start|stop|status`). It long-polls `getUpdates`
(25 s), filters to `TELEGRAM_CHAT_ID` (other chats silently skipped),
deduplicates by `update_id`, advances the offset correctly, validates commands
against a strict allowlist, and persists the queue to
`state/telegram_commands.json`:

```json
{
  "last_update_id": 0,
  "queue": [
    {"update_id": 123, "received_at": "...", "command": "/approve",
     "args": "", "phase_number": 1, "consumed": false}
  ]
}
```

A heartbeat lock (`state/listener.lock`) prevents duplicate instances; stale
locks (>90 s) are taken over. Listener cannot start → notification-only mode:
report unavailability, continue workflow (§91).

### Commands (§92)

| Command | Effect |
|---|---|
| `/approve` | Approves the phase recorded at receive time. Stale approvals cannot approve a later phase. |
| `/reject <reason>` | Rejects that phase → REJECTED → back to IMPLEMENT. |
| `/status` | Inline reply: phase, state, branch, last test result, current error, last successful commit. No secrets. |
| `/pause` | `pause_requested=true`; agent stops at the next safe boundary. |
| `/resume` | Clears the pause; agent continues at the next safe boundary. |
| `/retry` | Explicit additional attempt after STOP (§95). |
| `/screenshot` | Captures at the next safe point via `screenshot.sh`, optionally sends the PNG. |
| `/rollback confirm` | Two-step rollback (§97); plain `/rollback` only reports that confirmation is required. |
| `/tweak <key> <value>` | Allowlisted constant tweak (§98). |

Telegram input is UNTRUSTED: allowlist validation only, never executed as
shell commands, never `shell=True`, never passed to the filesystem unvalidated.

### Retry (§95)

Automatic limit: 2 retries (`phase-runner.sh failed "reason"` counts).
After 2 automatic failures: STOP + notify. `/retry` grants exactly one
additional attempt. Never silently bypass persistent failure.

### Rollback (§97)

`state/phase_history.json` records each merged phase (phase, branch, timestamp).
Rollback: current phase branch only; never past the last merged phase; never
rewrites main; prefers `git revert`; refuses when uncommitted changes would be
lost.

### Tweak (§98)

Allowlist (validated in `phase-runner.sh tweak`): `GRAVITY`, `MAX_FALL`,
`JUMP_SARA`, `JUMP_RAHA`, `JUMP_ARAM`, `MOVE_SPEED`, `SLOWMO_FACTOR`,
`PARTICLE_CAP` — each with type and range validation. NEVER allowed: tokens,
env values, security settings, shell scripts, URLs, file paths, Git config,
level geometry, enemy IDs, persistence key, test-security controls. Full
procedure: validate → temp copy → run tests → commit only on pass → log to
`state/tweak_log.json`.

### Notifications (§99)

- Phase start: `🚀 Phase N starting: <title> | branch: <branch>`
- Long phases: screenshot every 5–10 min
- Completion: `✅ Phase N done | tests: passed/total | PR: <link> | awaiting /approve`
- Error: `❌ Error in Phase N | <short> | <file:line> | reply /retry`

Never send secrets.

## 5. CI (§88)

`.github/workflows/test.yml` triggers on push to `main`, push to `phase/**`,
and PRs targeting `main`. Branch → phase extraction:

```
BRANCH="${GITHUB_HEAD_REF:-${GITHUB_REF#refs/heads/}}"
PHASE=$(echo "$BRANCH" | sed -nE 's|^phase/([0-9]+)(-.+)?$|\1|p')   # else 14
```

Steps: install Playwright (test env only) → start `python -m http.server 8000
--bind 127.0.0.1` → wait for readiness (no tests before) →
`python tools/acceptance.py --phase "$PHASE"` → upload screenshots artifact →
stop server. Hard-fails on executed test failure, runtime size ≥ 200 KB,
forbidden runtime dependency, missing required file.

## 6. GitHub Pages (§89)

`.github/workflows/deploy-pages.yml` deploys on push to `main` (plus manual
`workflow_dispatch`) using the official Pages Actions — never branch-root
deployment. Only runtime assets are staged: `index.html`, `style.css`,
`src/**`. Expected URL: `https://<username>.github.io/<repo>/`.

## 7. Static checks & size budget (§77, §81)

`tools/acceptance.py` enforces:

- Required files (all §75 files; `state/telegram_commands.json` is created on
  demand by the listener and intentionally gitignored per §76)
- Runtime size: raw bytes of `index.html + style.css + src/**` strictly < 200 KB
- Forbidden runtime scan: no WebGL / non-2d canvas context, no forbidden
  engine/framework/bundler/package-manager references, no bare module
  specifiers (npm), no CDN/network usage (`fetch(`, XHR, WebSocket,
  EventSource, beacons, any http(s) URL), no backend references
  (localhost/127.0.0.1)
- Secrets untracked: `.env` must be gitignored
- Doc/tool mentions of forbidden names never fail the scan — only RUNTIME
  source files are scanned

Runtime code discipline: never mention forbidden engine names in
`index.html`, `style.css`, or `src/**`, even in comments.

## 8. Test server (§82)

CI and local runs use `python -m http.server 8000 --bind 127.0.0.1`. The
server is dev/test infrastructure only — never backend logic. Wait until port
8000 is reachable before any test; terminate after tests.

## 9. Secrets policy (§84, §106)

- Secrets live ONLY in the gitignored repo-local `.env` (permissions 600) and
  orchestration env vars.
- The browser client NEVER contains GitHub/Telegram tokens or any credential.
- Never print, log, echo, or commit secret values; never embed them in remote
  URLs; never pass them as shell arguments (all API calls go through the
  in-process python helpers).
- `tools/notify.py` prints sanitized statuses only (e.g. `HTTP 401`), never
  response bodies.

## 10. Phase 0 special rules (§85, §108, §110)

- Phase 0 started ONLY after the explicit user command "Start Phase 0".
- No feature branch, no PR, no push. The remote stays empty until Phase 1.
- Deliverables: §75 scaffold, SPEC.md mirror, TASKS.md, ORCHESTRATOR.md,
  README.md, all five tools, both workflows, `.env.example`, `.gitignore`,
  local git with a clean remote configured.
- Exit: completion notification, then stop and await approval to begin Phase 1.
