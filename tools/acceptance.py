#!/usr/bin/env python3
"""Shadows of the Moon — phase-aware acceptance harness (SPEC §79–§82, §88).

Usage:
  python tools/acceptance.py --phase N [--static-only] [--list]
  python tools/acceptance.py --screenshot NAME

Behavior:
  - Static checks ALWAYS run: required files, runtime size (< 200 KB),
    forbidden-dependency scan, secrets-untracked.
  - Page-load smoke check runs when the test server is reachable
    (SOM_BASE_URL, default http://127.0.0.1:8000). Start the server first
    (SPEC §82): python -m http.server 8000 --bind 127.0.0.1
  - Gameplay tests run when test.min_phase <= phase AND the test is
    implemented. Not-yet-eligible tests are reported as skipped.
  - Phase >= 14 implies STRICT mode: eligible-but-unimplemented tests FAIL.
  - Exit code 1 if any executed test fails; 0 otherwise.

Gameplay test bodies are implemented in the phase that owns the feature
(see TASKS.md "Acceptance test → phase map"). The registry below carries
every §79 test with its min_phase from §80.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BASE_URL = os.environ.get("SOM_BASE_URL", "http://127.0.0.1:8000")
SIZE_LIMIT = 200 * 1024  # strictly below 200 KB (SPEC §77)

try:
    from playwright.sync_api import sync_playwright
    HAVE_PLAYWRIGHT = True
except ImportError:
    HAVE_PLAYWRIGHT = False

# ------------------------------------------------------------------ registry

TESTS = [
    {"id": "visibility_pause", "name": "Visibility pause semantics (§79.7)", "min_phase": 1, "impl": None},
    {"id": "multi_touch", "name": "Multi-touch: Left+Jump+Attack >= 500ms (§79.8)", "min_phase": 1, "impl": None},
    {"id": "portrait_behavior", "name": "Portrait overlay; landscape stays paused (§79.13)", "min_phase": 1, "impl": None},
    {"id": "sara_double_jump", "name": "Sara double jump >= 260px (§79.1)", "min_phase": 2, "impl": None},
    {"id": "horizontal_collision", "name": "Horizontal collision resolution (§79.6)", "min_phase": 2, "impl": None},
    {"id": "fall_death", "name": "Fall death final flow (§79.12)", "min_phase": 2, "impl": None},
    {"id": "enemy_score_uniqueness", "name": "Enemy score uniqueness (§79.17)", "min_phase": 6, "impl": None},
    {"id": "aram_slow_motion", "name": "Aram slow-motion time domains (§79.3)", "min_phase": 7, "impl": None},
    {"id": "character_switching", "name": "Character switching HP formula (§79.4)", "min_phase": 7, "impl": None},
    {"id": "midair_double_jump", "name": "Midair double jump: Sara yes, others no (§79.5)", "min_phase": 7, "impl": None},
    {"id": "raha_slam", "name": "Raha slam: fast-fall, 90px radius, 2 dmg (§79.2)", "min_phase": 8, "impl": None},
    {"id": "fullscreen", "name": "First-gesture fullscreen best-effort (§79.14)", "min_phase": 9, "impl": None},
    {"id": "persistence", "name": "localStorage save at game-over/victory only (§79.15)", "min_phase": 9, "impl": None},
    {"id": "checkpoint_duplicate_score", "name": "Checkpoint duplicate-score protection (§79.9)", "min_phase": 11, "impl": None},
    {"id": "final_battle_gate", "name": "Final battle gate logic (§79.18)", "min_phase": 12, "impl": None},
    {"id": "restart_duplicate_score", "name": "Restart Zone duplicate-score protection (§79.10)", "min_phase": 13, "impl": None},
    {"id": "performance", "name": "Performance: 10s CPU x4, median/p95/max (§79.11)", "min_phase": 14, "impl": None},
    {"id": "safe_area", "name": "Safe-area synthetic insets, test mode only (§79.16)", "min_phase": 14, "impl": None},
]

REQUIRED_FILES = [
    "index.html", "style.css", "README.md", "SPEC.md", "TASKS.md",
    "ORCHESTRATOR.md", ".env.example", ".gitignore",
    "src/main.js", "src/constants.js", "src/input.js", "src/physics.js",
    "src/ai.js", "src/level.js", "src/render.js", "src/loop.js",
    "src/entities/player.js", "src/entities/enemy.js",
    "src/entities/projectile.js", "src/entities/particle.js",
    "src/entities/coin.js",
    "tools/notify.py", "tools/telegram-listener.py", "tools/screenshot.sh",
    "tools/acceptance.py", "tools/phase-runner.sh",
    "screenshots/.gitkeep",
    ".github/workflows/test.yml", ".github/workflows/deploy-pages.yml",
]
# NOTE: state/telegram_commands.json is created on demand by the listener and
# is gitignored by design (SPEC §76) — intentionally not in this list.

# ------------------------------------------------------------------ helpers

class Result:
    def __init__(self, name, status, detail=""):
        self.name, self.status, self.detail = name, status, detail


def fmt(name, status, detail=""):
    line = f"[{status:<4}] {name}"
    if detail and status == "FAIL":
        line += f" — {detail}"
    return line


def runtime_files() -> list[Path]:
    files = []
    for rel in ("index.html", "style.css"):
        p = ROOT / rel
        if p.is_file():
            files.append(p)
    src = ROOT / "src"
    if src.is_dir():
        files.extend(sorted(p for p in src.rglob("*") if p.is_file()))
    return files


def server_ready(timeout: float = 3.0) -> bool:
    import urllib.request
    import urllib.error
    try:
        with urllib.request.urlopen(BASE_URL, timeout=timeout) as resp:
            return resp.status == 200
    except Exception:
        return False


def strip_comments(text: str) -> str:
    text = re.sub(r"<!--.*?-->", "", text, flags=re.S)       # html comments
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)          # block comments
    text = re.sub(r"//[^\n]*", "", text)                       # line comments
    return text


# Raw-content patterns (checked BEFORE comment stripping so URLs in strings
# can never be masked by the stripper).
RAW_FORBIDDEN = [
    (r"https?://", "runtime network/CDN URL"),
    (r"\bfetch\s*\(", "runtime network fetch"),
    (r"XMLHttpRequest", "runtime network XHR"),
    (r"\bWebSocket\b", "runtime WebSocket"),
    (r"EventSource", "runtime EventSource"),
    (r"sendBeacon", "runtime beacon"),
    (r"localhost:", "backend reference"),
    (r"127\.0\.0\.1:", "backend reference"),
]

# Comment-stripped patterns (framework/engine names — curated to avoid false
# positives on legitimate words like "impact" or "solid platforms").
STRIPPED_FORBIDDEN = [
    (r"\bwebgl\b", "WebGL usage"),
    (r"three\.js|babylon\.js|\bbabylonjs\b|pixi\.js|pixijs|\bphaser\b|\bkaplay\b|"
     r"melon\.js|melonjs|impact\.js|\breact\b|\bvue\b|svelte|solid\.js|preact",
     "forbidden framework/library"),
    (r"typescript|coffeescript|\bvite\b|\bwebpack\b|\brollup\b|\bparcel\b|\besbuild\b",
     "forbidden transpiler/bundler"),
    (r"\bgodot\b|\bunity\b|\bunreal\b|\bpygame\b|\blove2d\b|\bbevy\b",
     "forbidden engine"),
    (r"\bnpm\b|\byarn\b|\bpnpm\b|node_modules|\brequire\s*\(",
     "runtime package manager / CJS require"),
    (r"getContext\(\s*(['\"])(?!2d\1)", "non-2d canvas context"),
    (r"\bfrom\s+['\"][^'./][^'\"]*['\"]", "bare module specifier (npm dependency)"),
    (r"\bimport\s*\(\s*['\"][^'./][^'\"]*['\"]", "bare dynamic import (npm dependency)"),
]


# ------------------------------------------------------------------ static checks

def check_required_files() -> Result:
    missing = [rel for rel in REQUIRED_FILES if not (ROOT / rel).is_file()]
    if missing:
        return Result("static: required files (§75)", "FAIL", "missing: " + ", ".join(missing))
    return Result("static: required files (§75)", "PASS", f"{len(REQUIRED_FILES)} files present")


def check_runtime_size() -> Result:
    files = runtime_files()
    total = sum(p.stat().st_size for p in files)
    kb = total / 1024.0
    if total >= SIZE_LIMIT:
        return Result("static: runtime size < 200KB (§77)", "FAIL",
                      f"{kb:.1f} KB over budget across {len(files)} files")
    return Result("static: runtime size < 200KB (§77)", "PASS", f"{kb:.1f} KB / 195.3 KB")


def check_forbidden_deps() -> Result:
    violations = []
    for path in runtime_files():
        try:
            raw = path.read_text(encoding="utf-8")
        except Exception as exc:
            violations.append(f"{path.name}: unreadable ({type(exc).__name__})")
            continue
        for pattern, label in RAW_FORBIDDEN:
            if re.search(pattern, raw):
                violations.append(f"{path.relative_to(ROOT)}: {label}")
        stripped = strip_comments(raw)
        for pattern, label in STRIPPED_FORBIDDEN:
            if re.search(pattern, stripped):
                violations.append(f"{path.relative_to(ROOT)}: {label}")
    if violations:
        return Result("static: forbidden runtime deps (§81)", "FAIL",
                      "; ".join(violations[:6]))
    return Result("static: forbidden runtime deps (§81)", "PASS", "clean")


def check_secrets_untracked() -> Result:
    if not (ROOT / ".git").exists():
        return Result("static: secrets untracked (§106)", "SKIP", "no local git yet")
    import subprocess
    try:
        code = subprocess.run(
            ["git", "-C", str(ROOT), "check-ignore", "-q", ".env"],
            capture_output=True,
        ).returncode
    except Exception as exc:
        return Result("static: secrets untracked (§106)", "FAIL", type(exc).__name__)
    if code == 0:
        return Result("static: secrets untracked (§106)", "PASS", ".env ignored")
    return Result("static: secrets untracked (§106)", "FAIL",
                  ".env NOT ignored by .gitignore")


# ------------------------------------------------------------------ load check

def load_check(browser) -> Result:
    page = browser.new_page(viewport={"width": 1280, "height": 720})
    errors: list[str] = []
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    page.on("console", lambda m: errors.append(f"console: {m.text}") if m.type == "error" else None)
    name = "load: page boots without uncaught errors (§102.2)"
    try:
        page.goto(BASE_URL, wait_until="load", timeout=15000)
        try:
            page.wait_for_function("() => window.__SOM_BOOTED__ === true", timeout=5000)
        except Exception:
            return Result(name, "FAIL", "window.__SOM_BOOTED__ never became true")
        page.wait_for_timeout(400)
        if errors:
            return Result(name, "FAIL", "; ".join(errors[:3]))
        return Result(name, "PASS")
    finally:
        page.close()


# ------------------------------------------------------------------ reporting

def run_screenshot(name: str) -> int:
    if not HAVE_PLAYWRIGHT:
        print("screenshot: playwright unavailable", file=sys.stderr)
        return 1
    if not server_ready():
        print(f"screenshot: server not reachable at {BASE_URL} (start it first, §82)", file=sys.stderr)
        return 1
    out_dir = ROOT / "screenshots"
    out_dir.mkdir(exist_ok=True)
    out = out_dir / f"{name}-{int(time.time())}.png"
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1280, "height": 720})
        page.goto(BASE_URL, wait_until="load", timeout=15000)
        try:
            page.wait_for_function("() => window.__SOM_BOOTED__ === true", timeout=5000)
        except Exception:
            pass  # capture whatever rendered
        page.wait_for_timeout(600)
        page.screenshot(path=str(out))
        browser.close()
    print(f"screenshot: saved {out.relative_to(ROOT)}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Phase-aware acceptance harness")
    parser.add_argument("--phase", type=int, default=None)
    parser.add_argument("--static-only", action="store_true")
    parser.add_argument("--list", action="store_true")
    parser.add_argument("--screenshot", metavar="NAME", default=None)
    args = parser.parse_args()

    if args.list:
        print(f"{'test id':<28} {'min_phase':>9}  name")
        for t in TESTS:
            print(f"{t['id']:<28} {t['min_phase']:>9}  {t['name']}")
        return 0
    if args.screenshot:
        return run_screenshot(args.screenshot)
    if args.phase is None:
        parser.error("--phase is required (or use --list / --screenshot)")

    phase = args.phase
    strict = phase >= 14
    results: list[Result] = []

    print(f"=== Shadows of the Moon — acceptance, phase {phase}"
          f"{' (STRICT)' if strict else ''} ===")

    results.append(check_required_files())
    results.append(check_runtime_size())
    results.append(check_forbidden_deps())
    results.append(check_secrets_untracked())

    use_browser = not args.static_only and HAVE_PLAYWRIGHT
    browser = None
    pw_cm = None
    if use_browser:
        if not server_ready():
            results.append(Result("load: page boots without uncaught errors (§102.2)",
                                  "FAIL", f"server not reachable at {BASE_URL} — start it first (§82)"))
            use_browser = False
        else:
            pw_cm = sync_playwright()
            pw = pw_cm.__enter__()
            browser = pw.chromium.launch(headless=True)
            results.append(load_check(browser))
    elif not args.static_only:
        results.append(Result("load: page boots without uncaught errors (§102.2)",
                              "SKIP", "playwright not installed"))

    for test in TESTS:
        eligible = test["min_phase"] <= phase
        if not eligible:
            results.append(Result(f"test: {test['name']}", "SKIP",
                                  f"min_phase {test['min_phase']} > {phase}"))
            continue
        if test["impl"] is None:
            if strict:
                results.append(Result(f"test: {test['name']}", "FAIL",
                                      "eligible in strict mode but not implemented"))
            else:
                results.append(Result(f"test: {test['name']}", "SKIP",
                                      "not yet implemented (arrives with its phase)"))
            continue
        try:
            results.append(test["impl"](browser))
        except Exception as exc:  # noqa: BLE001 — a crashing test is a failed test
            results.append(Result(f"test: {test['name']}", "FAIL",
                                  f"{type(exc).__name__}: {exc}"))

    if browser is not None:
        browser.close()
    if pw_cm is not None:
        pw_cm.__exit__(None, None, None)

    print()
    passed = failed = skipped = 0
    for r in results:
        print(fmt(r.name, r.status, r.detail))
        if r.status == "PASS":
            passed += 1
        elif r.status == "FAIL":
            failed += 1
        else:
            skipped += 1
    print()
    print(f"Summary: {passed} passed, {failed} failed, {skipped} skipped"
          f" (executed: {passed + failed})")
    if failed:
        print("EXIT: 1 — failing tests above must be fixed (never weaken tests)")
        return 1
    print("EXIT: 0")
    return 0


if __name__ == "__main__":
    sys.exit(main())
