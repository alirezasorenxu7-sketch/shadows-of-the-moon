#!/usr/bin/env python3
"""Shadows of the Moon — Telegram command listener (SPEC §90–§99).

Single-process long-poll listener:
  - long-polls getUpdates (25 s)
  - filters messages to TELEGRAM_CHAT_ID; other chats are silently skipped
    (their update_ids still advance the offset so they are never re-fetched)
  - deduplicates by update_id; advances the offset correctly
  - validates commands against a strict allowlist — Telegram input is
    UNTRUSTED and is never executed as shell commands (SPEC §92)
  - appends queued commands to state/telegram_commands.json with records:
    {update_id, received_at, command, args, phase_number, consumed}
  - records the orchestrator phase AT RECEIVE TIME so approvals/rejections
    apply ONLY to that phase — stale approvals cannot approve later phases
  - file-lock (with heartbeat + stale takeover) prevents duplicate instances
  - /status is answered inline from state/orchestrator_state.json
    (that file never contains secrets — SPEC §94)

Usage:
  python3 tools/telegram-listener.py            (foreground)
  nohup python3 tools/telegram-listener.py &    (daemonized by phase-runner.sh)

Exit codes: 0 clean stop · 2 another instance already running.
"""
from __future__ import annotations

import json
import os
import signal
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ENV_FILE = ROOT / ".env"
STATE_DIR = ROOT / "state"
QUEUE_FILE = STATE_DIR / "telegram_commands.json"
LOCK_FILE = STATE_DIR / "listener.lock"
ORCH_STATE_FILE = STATE_DIR / "orchestrator_state.json"

POLL_TIMEOUT = 25  # seconds (long poll)
LOCK_STALE_AFTER = 90  # seconds without heartbeat → take over

ALLOWED_COMMANDS = (
    "/approve",
    "/reject",
    "/status",
    "/pause",
    "/resume",
    "/retry",
    "/screenshot",
    "/rollback",
    "/tweak",
)

RUNNING = True


# ---------------------------------------------------------------- env & io

def load_env() -> dict:
    env = dict(os.environ)
    if ENV_FILE.is_file():
        for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, value = line.partition("=")
                env.setdefault(key.strip(), value.strip())
    return env


def atomic_write_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(obj, indent=2), encoding="utf-8")
    os.replace(tmp, path)


def load_queue() -> dict:
    try:
        data = json.loads(QUEUE_FILE.read_text(encoding="utf-8"))
        if isinstance(data, dict) and isinstance(data.get("queue"), list):
            data.setdefault("last_update_id", 0)
            return data
    except Exception:
        pass
    return {"last_update_id": 0, "queue": []}


def orchestrator_phase():
    try:
        data = json.loads(ORCH_STATE_FILE.read_text(encoding="utf-8"))
        phase = data.get("phase")
        return int(phase) if isinstance(phase, int) else None
    except Exception:
        return None


# ---------------------------------------------------------------- telegram

def tg_api(token: str, method: str, params: dict | None, timeout: float):
    url = f"https://api.telegram.org/bot{token}/{method}"
    req = urllib.request.Request(
        url,
        data=json.dumps(params or {}).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def reply(token: str, chat_id, text: str) -> None:
    try:
        tg_api(token, "sendMessage", {"chat_id": chat_id, "text": text[:4000]}, 30)
    except Exception as exc:  # noqa: BLE001 — never crash the loop
        print(f"[listener] reply failed: {type(exc).__name__}", file=sys.stderr)


def status_text() -> str:
    try:
        s = json.loads(ORCH_STATE_FILE.read_text(encoding="utf-8"))
    except Exception:
        return "No orchestrator state available yet (Phase 0 bootstrap in progress)."
    lines = [
        "Shadows of the Moon — /status",
        f"phase: {s.get('phase')}",
        f"state: {s.get('state')}",
        f"branch: {s.get('branch')}",
        f"last test result: {s.get('last_test_result')}",
        f"current error: {s.get('current_error') or 'none'}",
        f"last successful commit: {s.get('last_successful_commit') or 'none'}",
        f"retries: {s.get('retries', 0)} | pause_requested: {s.get('pause_requested', False)}",
    ]
    return "\n".join(lines)


# ---------------------------------------------------------------- commands

def parse_command(text: str):
    """Returns (command, args) for allowlisted commands, else (None, reason)."""
    parts = text.split()
    cmd = parts[0].split("@")[0].lower()  # tolerate /cmd@botname
    if cmd not in ALLOWED_COMMANDS:
        return None, f"Unsupported command: {cmd}"
    args = " ".join(parts[1:]).strip()
    if cmd == "/tweak":
        tokens = args.split()
        if len(tokens) != 2:
            return None, "usage: /tweak <key> <value>"
    if cmd == "/reject" and not args:
        return None, "usage: /reject <reason>"
    return cmd, args


def handle_update(token: str, chat_id, text: str) -> dict | None:
    """Validate one message; return a queue record or None."""
    if not text.startswith("/"):
        return None
    command, args = parse_command(text)
    if command is None:
        reply(
            token,
            chat_id,
            args
            + "\nSupported: /approve · /reject <reason> · /status · /pause · /resume · "
            "/retry · /screenshot · /rollback confirm · /tweak <key> <value>",
        )
        return None
    phase_number = orchestrator_phase()
    if command == "/status":
        reply(token, chat_id, status_text())
        return None
    record = {
        "update_id": None,  # filled by caller
        "received_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "command": command,
        "args": args,
        "phase_number": phase_number,
        "consumed": False,
    }
    ack = {
        "/approve": f"Queued: /approve for phase {phase_number}. Applied at the next safe boundary.",
        "/reject": f"Queued: /reject for phase {phase_number}. Reason: {args or '(none)'}",
        "/pause": "Pause requested. Orchestrator stops at the next safe boundary.",
        "/resume": "Resume noted. Orchestrator will continue at the next safe boundary.",
        "/retry": f"Queued: /retry for phase {phase_number} (explicit additional attempt).",
        "/screenshot": "Queued: /screenshot — captured at the next safe point.",
        "/rollback": "Queued: /rollback. NOTE: requires two-step confirmation "
        "('/rollback confirm'); plain /rollback only reports status.",
        "/tweak": f"Queued: /tweak {args} for phase {phase_number}. "
        "Key/value validated against the allowlist at consumption time.",
    }[command]
    reply(token, chat_id, ack)
    return record


# ---------------------------------------------------------------- locking

def lock_status() -> dict | None:
    try:
        return json.loads(LOCK_FILE.read_text(encoding="utf-8"))
    except Exception:
        return None


def acquire_lock() -> bool:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    cur = lock_status()
    if cur:
        age = time.time() - float(cur.get("heartbeat_ts", 0))
        pid = cur.get("pid")
        alive = False
        if isinstance(pid, int):
            try:
                os.kill(pid, 0)
                alive = True
            except OSError:
                alive = False
        if age < LOCK_STALE_AFTER and alive and pid != os.getpid():
            print(
                f"[listener] another instance is running (pid {pid}) — exiting",
                file=sys.stderr,
            )
            return False
    write_lock()
    return True


def write_lock() -> None:
    atomic_write_json(
        LOCK_FILE, {"pid": os.getpid(), "heartbeat_ts": time.time()}
    )


def release_lock() -> None:
    cur = lock_status()
    if cur and cur.get("pid") == os.getpid():
        try:
            LOCK_FILE.unlink()
        except OSError:
            pass


# ---------------------------------------------------------------- main loop

def stop_handler(signum, frame):  # noqa: ARG001
    global RUNNING
    RUNNING = False


def main() -> int:
    global RUNNING
    env = load_env()
    token = env.get("TELEGRAM_BOT_TOKEN")
    my_chat = env.get("TELEGRAM_CHAT_ID")
    if not token or not my_chat:
        print("[listener] TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID unavailable", file=sys.stderr)
        return 2
    try:
        my_chat_id = int(my_chat)
    except ValueError:
        print("[listener] TELEGRAM_CHAT_ID is not numeric", file=sys.stderr)
        return 2

    if not acquire_lock():
        return 2

    signal.signal(signal.SIGINT, stop_handler)
    signal.signal(signal.SIGTERM, stop_handler)
    print(f"[listener] online — filtering chat {my_chat_id}, allowlist only", file=sys.stderr)

    offset = int(load_queue()["last_update_id"]) + 1
    try:
        while RUNNING:
            write_lock()  # heartbeat
            try:
                result = tg_api(
                    token,
                    "getUpdates",
                    {"offset": offset, "timeout": POLL_TIMEOUT, "allowed_updates": ["message"]},
                    POLL_TIMEOUT + 15,
                )
            except urllib.error.HTTPError as exc:
                wait = 5 if exc.code == 409 else 3
                print(f"[listener] getUpdates HTTP {exc.code} — retry in {wait}s", file=sys.stderr)
                time.sleep(wait)
                continue
            except Exception as exc:  # noqa: BLE001 — network resilience
                print(f"[listener] getUpdates failed ({type(exc).__name__}) — retry in 3s", file=sys.stderr)
                time.sleep(3)
                continue

            state = load_queue()
            seen = {r.get("update_id") for r in state["queue"]}
            changed = False
            for update in result.get("result", []):
                update_id = update.get("update_id", 0)
                offset = max(offset, update_id + 1)
                if update_id in seen:
                    continue
                message = update.get("message") or update.get("channel_post") or {}
                chat = (message.get("chat") or {}).get("id")
                if chat != my_chat_id:
                    continue  # silently ignore other chats (SPEC §90)
                text = (message.get("text") or "").strip()
                record = handle_update(token, chat, text)
                if record is not None:
                    record["update_id"] = update_id
                    state["queue"].append(record)
                    seen.add(update_id)
                    changed = True
                    print(f"[listener] queued {record['command']} (phase {record['phase_number']})", file=sys.stderr)
            state["last_update_id"] = max(state["last_update_id"], offset - 1)
            if changed or True:  # persist offset every cycle (crash-safe)
                atomic_write_json(QUEUE_FILE, state)
    finally:
        release_lock()
        print("[listener] stopped cleanly", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
