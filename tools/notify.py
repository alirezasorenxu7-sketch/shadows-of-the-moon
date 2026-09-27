#!/usr/bin/env python3
"""Shadows of the Moon — Telegram notification tool (SPEC §99, §104).

Secret-safe by construction:
  - credentials are read from environment / repo .env IN-PROCESS
  - tokens are never printed, logged, or passed as shell arguments
  - failures print sanitized status only (no response bodies)

Usage:
  python tools/notify.py "message text"
  python tools/notify.py "caption" --image screenshots/shot.png

Exit codes: 0 sent · 1 failed (never raises uncaught).
"""
from __future__ import annotations

import argparse
import json
import mimetypes
import os
import sys
import uuid
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ENV_FILE = ROOT / ".env"


def load_credentials():
    """Environment variables take precedence; repo .env fills the gaps."""
    env = dict(os.environ)
    if ENV_FILE.is_file():
        for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, value = line.partition("=")
                env.setdefault(key.strip(), value.strip())
    return env.get("TELEGRAM_BOT_TOKEN"), env.get("TELEGRAM_CHAT_ID")


def api(token: str, method: str, data=None, timeout: float = 30.0):
    url = f"https://api.telegram.org/bot{token}/{method}"
    if data is None:
        req = urllib.request.Request(url, method="GET")
    else:
        req = urllib.request.Request(
            url,
            data=json.dumps(data).encode("utf-8"),
            headers={"Content-Type": "application/json"},
        )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def send_text(token: str, chat: str, text: str):
    return api(token, "sendMessage", {"chat_id": chat, "text": text[:4000]})


def send_photo(token: str, chat: str, photo: Path, caption: str | None):
    boundary = "----som" + uuid.uuid4().hex
    parts = []

    def field(name: str, value: str):
        parts.append(
            f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode()
        )

    field("chat_id", str(chat))
    if caption:
        field("caption", caption[:1024])
    fname = photo.name
    mime = mimetypes.guess_type(fname)[0] or "image/png"
    parts.append(
        f'--{boundary}\r\nContent-Disposition: form-data; name="photo"; '
        f'filename="{fname}"\r\nContent-Type: {mime}\r\n\r\n'.encode()
    )
    parts.append(photo.read_bytes())
    parts.append(f"\r\n--{boundary}--\r\n".encode())
    body = b"".join(parts)
    req = urllib.request.Request(
        f"https://api.telegram.org/bot{token}/sendPhoto",
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    with urllib.request.urlopen(req, timeout=60.0) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main() -> int:
    parser = argparse.ArgumentParser(description="Secret-safe Telegram notifier")
    parser.add_argument("message", help="message text (or photo caption)")
    parser.add_argument("--image", default=None, help="optional image path to attach")
    args = parser.parse_args()

    token, chat = load_credentials()
    if not token or not chat:
        print("notify: TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID unavailable", file=sys.stderr)
        return 1
    try:
        if args.image:
            photo = Path(args.image)
            if not photo.is_file():
                print(f"notify: image not found: {args.image}", file=sys.stderr)
                return 1
            send_photo(token, chat, photo, args.message)
        else:
            send_text(token, chat, args.message)
        print("notify: sent")
        return 0
    except urllib.error.HTTPError as exc:
        print(f"notify: send FAILED (HTTP {exc.code})", file=sys.stderr)
        return 1
    except Exception as exc:  # noqa: BLE001 — sanitized on purpose
        print(f"notify: send FAILED ({type(exc).__name__})", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
