#!/usr/bin/env python3
"""Shadows of the Moon — phase-aware acceptance harness (SPEC §79–§82, §88).

Usage:
  python tools/acceptance.py --phase N [--static-only] [--list]
  python tools/acceptance.py --screenshot NAME

Behavior:
  - Static checks ALWAYS run: required files, runtime size (< 400 KB),
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
SIZE_LIMIT = 400 * 1024  # strictly below 400 KB (amended SPEC §77)

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
        return Result("static: runtime size < 400KB (§77)", "FAIL",
                      f"{kb:.1f} KB over budget across {len(files)} files")
    return Result("static: runtime size < 400KB (§77)", "PASS", f"{kb:.1f} KB / 390.6 KB")


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


# ------------------------------------------------------------------ phase 1 tests

# Harness-side test instrumentation (SPEC §73): the flag is injected BEFORE
# navigation; production behavior never depends on it. The visibility shim
# lets the harness drive document.visibilityState in headless Chromium.
TEST_INIT_SCRIPT = """
window.__SOM_TEST__ = true;
(() => {
  let vis = 'visible';
  try {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => vis });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => vis !== 'visible' });
  } catch (err) { /* shim best-effort */ }
  window.__somSetVisibility = (state) => {
    vis = String(state);
    document.dispatchEvent(new Event('visibilitychange'));
  };
})();
"""


def _new_test_context(browser, viewport=None, has_touch=False):
    kwargs = {"viewport": viewport or {"width": 1280, "height": 720}}
    if has_touch:
        kwargs["has_touch"] = True
    ctx = browser.new_context(**kwargs)
    ctx.add_init_script(TEST_INIT_SCRIPT)
    return ctx


def _boot_page(ctx):
    page = ctx.new_page()
    page.goto(BASE_URL, wait_until="load", timeout=15000)
    page.wait_for_function("() => window.__SOM_BOOTED__ === true", timeout=5000)
    page.wait_for_function(
        "() => window.__SOM_METRICS__ && window.__SOM_METRICS__.renderCount > 5",
        timeout=5000)
    return page


def _metrics(page):
    return page.evaluate("() => window.__SOM_METRICS__")


def test_visibility_pause(browser):
    """SPEC §79.7: hide tab for 30 s, return, accumulator reset, no physics
    explosion, remains paused, explicit Resume required."""
    name = "test: visibility pause semantics (§79.7)"
    ctx = _new_test_context(browser)
    page = _boot_page(ctx)
    try:
        if _metrics(page)["paused"]:
            return Result(name, "FAIL", "game was paused before the test began")
        page.evaluate("() => window.__somSetVisibility('hidden')")
        page.wait_for_timeout(250)             # let the pause settle
        m_hidden = _metrics(page)
        t0 = m_hidden["gameTime"]
        s0 = m_hidden["simStepsTotal"]
        if not m_hidden["paused"]:
            return Result(name, "FAIL", "hidden document did not pause the game")
        page.wait_for_timeout(30_000)          # §79.7 step 3: 30 s hidden
        page.evaluate("() => window.__somSetVisibility('visible')")
        page.wait_for_timeout(400)
        m1 = _metrics(page)
        problems = []
        if not m1["paused"]:
            problems.append("did not remain paused after return")
        if m1["accumulator"] != 0:
            problems.append(f"accumulator not reset ({m1['accumulator']})")
        if abs(m1["gameTime"] - t0) > 1e-9:
            problems.append(f"gameTime advanced while hidden ({m1['gameTime'] - t0:+.4f}s)")
        if m1["simStepsTotal"] != s0:
            problems.append("simulation stepped while hidden (physics explosion)")
        if m1["maxFrameSteps"] > 5:
            problems.append(f"maxFrameSteps={m1['maxFrameSteps']} exceeds cap")
        if not page.locator("#pause-overlay").is_visible():
            problems.append("pause overlay not visible after return")
        if problems:
            return Result(name, "FAIL", "; ".join(problems))
        page.keyboard.press("R")              # §79.7 step 8: explicit Resume
        page.wait_for_timeout(500)
        m2 = _metrics(page)
        if m2["paused"] or m2["gameTime"] <= t0:
            return Result(name, "FAIL", "R did not explicitly resume gameplay")
        return Result(name, "PASS",
                      "30 s hidden: frozen, accumulator 0, overlay shown, R resumed")
    finally:
        ctx.close()


def test_multi_touch(browser):
    """SPEC §79.8: simultaneous Left + Jump + Attack for >= 500 ms; all
    register independently."""
    name = "test: multi-touch Left+Jump+Attack >= 500ms (§79.8)"
    ctx = _new_test_context(browser, has_touch=True)
    page = _boot_page(ctx)
    try:
        if _metrics(page)["paused"]:
            return Result(name, "FAIL", "game paused at boot")
        points = []
        for sel in ("#btn-left", "#btn-jump", "#btn-attack"):
            if not page.locator(sel).is_visible():
                return Result(name, "FAIL", f"{sel} not visible")
            box = page.locator(sel).bounding_box()
            if box is None:
                return Result(name, "FAIL", f"{sel} has no bounding box")
            points.append({
                "x": box["x"] + box["width"] / 2,
                "y": box["y"] + box["height"] / 2,
                "id": len(points) + 1,
            })
        cdp = ctx.new_cdp_session(page)
        cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": points})
        page.wait_for_timeout(600)             # >= 500 ms hold
        m = _metrics(page)
        inp = m["input"]
        problems = []
        if not inp["left"]:
            problems.append("left not held")
        if not inp["jump"]:
            problems.append("jump not held")
        if not inp["attack"]:
            problems.append("attack not held")
        if inp["jumpCount"] < 1:
            problems.append("jump press not registered")
        if inp["attackCount"] < 1:
            problems.append("attack press not registered")
        if inp["activeTouches"] < 3:
            problems.append(f"activeTouches={inp['activeTouches']} (< 3)")
        cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
        page.wait_for_timeout(250)
        m2 = _metrics(page)
        if m2["input"]["left"] or m2["input"]["jump"] or m2["input"]["attack"]:
            problems.append("buttons stuck after release")
        if m2["input"]["activeTouches"] != 0:
            problems.append(f"activeTouches after release={m2['input']['activeTouches']}")
        if problems:
            return Result(name, "FAIL", "; ".join(problems))
        return Result(name, "PASS", "3 simultaneous touches registered independently")
    finally:
        ctx.close()


def test_portrait_behavior(browser):
    """SPEC §79.13: portrait pauses + overlay + input disabled + frozen;
    landscape return stays paused until explicit Resume."""
    name = "test: portrait overlay; landscape stays paused (§79.13)"
    ctx = _new_test_context(browser)
    page = _boot_page(ctx)
    try:
        m0 = _metrics(page)
        t0 = m0["gameTime"]
        if m0["paused"]:
            return Result(name, "FAIL", "game paused at boot")
        page.set_viewport_size({"width": 720, "height": 1280})
        page.wait_for_timeout(500)
        m1 = _metrics(page)
        problems = []
        if not m1["paused"]:
            problems.append("portrait did not pause gameplay")
        if not page.locator("#rotation-overlay").is_visible():
            problems.append("rotation overlay not visible")
        if page.locator("#btn-left").is_visible() or page.locator("#btn-jump").is_visible():
            problems.append("gameplay touch controls not hidden")
        if m1["input"]["enabled"]:
            problems.append("gameplay input not disabled")
        page.keyboard.down("KeyA")
        page.wait_for_timeout(300)
        m_k = _metrics(page)
        page.keyboard.up("KeyA")
        if m_k["input"]["left"]:
            problems.append("keyboard gameplay input registered while paused")
        if abs(m1["gameTime"] - t0) > 1e-9 or abs(m_k["gameTime"] - t0) > 1e-9:
            problems.append("physics advanced while portrait-paused")
        page.set_viewport_size({"width": 1280, "height": 720})
        page.wait_for_timeout(500)
        m2 = _metrics(page)
        if page.locator("#rotation-overlay").is_visible():
            problems.append("rotation overlay still visible in landscape")
        if not m2["paused"]:
            problems.append("auto-resumed on landscape return (forbidden, §8.2)")
        if abs(m2["gameTime"] - t0) > 1e-9:
            problems.append("gameTime changed before explicit resume")
        page.keyboard.press("R")
        page.wait_for_timeout(500)
        m3 = _metrics(page)
        if m3["paused"] or m3["gameTime"] <= t0:
            problems.append("R did not resume after landscape return")
        if problems:
            return Result(name, "FAIL", "; ".join(problems))
        return Result(name, "PASS",
                      "portrait: overlay+paused+frozen; landscape stayed paused; R resumed")
    finally:
        ctx.close()


# ------------------------------------------------------------------ phase 2 tests

# In-page maneuver sampler for §79.1: watches the ACTUAL simulation state via
# __SOM_METRICS__ (§73/§74) once per animation frame and drives the second
# jump through a REAL keydown event at apex timing. The takeoff reference is
# seeded from the known-grounded state so a first tick landing mid-flight
# (rAF scheduling race) cannot lose the measurement. Space is HELD for the
# whole maneuver (§38: "hold Jump during first jump; not release early");
# the second press is a distinct physical source (ArrowUp) — never a
# consecutive-frame jump call.
_DJ_SAMPLER = """() => {
  const M0 = window.__SOM_METRICS__;
  const p0 = M0 && M0.player;
  window.__somDJ = {
    fired: false, takeoffFeet: null, peakFeet: null,
    lastGroundedFeet: (p0 && p0.onGround) ? p0.y + p0.h : null,
    jumpsAtFire: -1, vyAtFire: null, airborneAtFire: null,
    maxJumpsUsed: 0, tTakeoff: null, tFire: null,
  };
  const tick = () => {
    const M = window.__SOM_METRICS__;
    if (!M || !M.player) return requestAnimationFrame(tick);
    const p = M.player;
    const feet = p.y + p.h;
    if (p.jumpsUsed > window.__somDJ.maxJumpsUsed) {
      window.__somDJ.maxJumpsUsed = p.jumpsUsed;
    }
    if (p.onGround) {
      window.__somDJ.lastGroundedFeet = feet;
      return requestAnimationFrame(tick);
    }
    if (window.__somDJ.lastGroundedFeet != null
        && window.__somDJ.takeoffFeet == null && p.jumpsUsed >= 1) {
      window.__somDJ.takeoffFeet = window.__somDJ.lastGroundedFeet;
      window.__somDJ.tTakeoff = M.gameTime;
    }
    if (window.__somDJ.takeoffFeet != null) {
      window.__somDJ.peakFeet = Math.min(window.__somDJ.peakFeet ?? Infinity, feet);
    }
    if (!window.__somDJ.fired && window.__somDJ.takeoffFeet != null
        && p.jumpsUsed === 1 && Math.abs(p.vy) <= 90) {
      window.__somDJ.fired = true;
      window.__somDJ.jumpsAtFire = p.jumpsUsed;
      window.__somDJ.vyAtFire = p.vy;
      window.__somDJ.airborneAtFire = !p.onGround;
      window.__somDJ.tFire = M.gameTime;
      window.dispatchEvent(new KeyboardEvent('keydown', {code: 'ArrowUp'}));
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}"""


def test_sara_double_jump(browser):
    """SPEC §79.1 (procedure §38): hold Jump through the first jump, trigger
    the second jump at apex timing while airborne via a distinct press, and
    measure feet-at-first-takeoff to highest-feet >= 260px from the actual
    simulation state."""
    name = "test: Sara double jump >= 260px (§79.1)"
    ctx = _new_test_context(browser)
    page = _boot_page(ctx)
    errors: list[str] = []
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    page.on("console", lambda m: errors.append(f"console: {m.text}") if m.type == "error" else None)
    try:
        m = _metrics(page)
        p = m["player"]
        if p["character"] != "sara":
            return Result(name, "FAIL", f"active character is {p['character']}, not sara")
        # Amended §18 scale pass: spawn top sits at groundY - 62 = 594
        # (feet exactly on the 656 ground line for the 62px-tall roster).
        if not p["onGround"] or abs(p["y"] - 594) > 0.001:
            return Result(name, "FAIL", "player not standing at spawn before the maneuver")
        page.evaluate(_DJ_SAMPLER)
        page.keyboard.down("Space")          # HELD through the entire maneuver
        deadline = time.time() + 4.0
        landed = False
        while time.time() < deadline:
            page.wait_for_timeout(100)
            p = _metrics(page)["player"]
            if p["onGround"] and p["jumpsUsed"] == 0 and page.evaluate("() => window.__somDJ.takeoffFeet != null"):
                landed = True
                break
        page.wait_for_timeout(150)           # let the sampler see the landing
        dj = page.evaluate("() => window.__somDJ")
        m = _metrics(page)
        page.keyboard.up("Space")
        page.evaluate("() => window.dispatchEvent(new KeyboardEvent('keyup', {code: 'ArrowUp'}))")
        problems = []
        if not landed:
            problems.append("maneuver never completed (no landing after double jump)")
        if not dj["fired"]:
            problems.append("second jump was never triggered at apex")
        elif not dj["airborneAtFire"] or dj["jumpsAtFire"] != 1:
            problems.append("second jump not triggered while airborne after the first")
        if dj["maxJumpsUsed"] < 2:
            problems.append(f"max jumpsUsed observed = {dj['maxJumpsUsed']} (< 2)")
        if dj["tTakeoff"] is None or dj["tFire"] is None:
            problems.append("takeoff/fire timing not observed")
        elif dj["tFire"] - dj["tTakeoff"] < 0.15:
            problems.append(
                f"jump presses only {dj['tFire'] - dj['tTakeoff']:.3f}s apart "
                "(consecutive-frame jump calls, forbidden by §38)")
        height = None
        if dj["takeoffFeet"] is not None and dj["peakFeet"] is not None:
            height = dj["takeoffFeet"] - dj["peakFeet"]
            if height < 260:
                problems.append(f"measured double-jump height {height:.2f}px < 260px (§38)")
        else:
            problems.append("takeoff/peak not measured")
        if m["input"]["jumpCount"] != 2:
            problems.append(f"jump press count = {m['input']['jumpCount']} (expected 2: one Space + one ArrowUp)")
        if errors:
            problems.append("; ".join(errors[:3]))
        if problems:
            return Result(name, "FAIL", "; ".join(problems))
        return Result(name, "PASS",
                      f"height {height:.1f}px >= 260px; second jump airborne at "
                      f"vy={dj['vyAtFire']:.0f}px/s, presses {dj['tFire'] - dj['tTakeoff']:.2f}s apart")
    finally:
        ctx.close()


def test_horizontal_collision(browser):
    """SPEC §79.6: run into a wall — no clipping, X corrected, vx = 0 while
    blocked; position holds after release."""
    name = "test: horizontal collision resolution (§79.6)"
    ctx = _new_test_context(browser)
    page = _boot_page(ctx)
    errors: list[str] = []
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    page.on("console", lambda m: errors.append(f"console: {m.text}") if m.type == "error" else None)
    try:
        p = _metrics(page)["player"]
        if abs(p["x"] - 300) > 0.001 or not p["onGround"]:
            return Result(name, "FAIL", "player not standing at spawn (x=300) before the run")
        page.keyboard.down("KeyA")           # hold LEFT into the wall
        wall_x = 60.0                        # wall right face (platform 0..60)
        min_x = None
        settled = None
        deadline = time.time() + 3.0
        while time.time() < deadline:
            page.wait_for_timeout(100)
            p = _metrics(page)["player"]
            min_x = p["x"] if min_x is None else min(min_x, p["x"])
            if abs(p["x"] - wall_x) < 0.001 and p["vx"] == 0:
                settled = p
                break
        page.keyboard.up("KeyA")
        page.wait_for_timeout(300)
        after = _metrics(page)["player"]
        problems = []
        if settled is None:
            problems.append(f"never settled at the wall face (min x observed {min_x})")
        if min_x is None or min_x > 290:
            problems.append("player never moved left — collision path not exercised")
        if min_x is not None and min_x < wall_x - 0.001:
            problems.append(f"wall clipped: x reached {min_x:.3f} < {wall_x}")
        if settled is not None and abs(settled["x"] - wall_x) > 0.001:
            problems.append(f"X not corrected: settled at {settled['x']:.3f}, expected {wall_x}")
        if settled is not None and settled["vx"] != 0:
            problems.append(f"vx = {settled['vx']} while blocked (expected 0)")
        if abs(after["x"] - wall_x) > 0.001 or after["vx"] != 0:
            problems.append("position/velocity changed after release")
        if abs(after["y"] - 594) > 0.001:   # amended §18 spawn fixture (groundY - 62)
            problems.append("vertical position disturbed during a horizontal test")
        if errors:
            problems.append("; ".join(errors[:3]))
        if problems:
            return Result(name, "FAIL", "; ".join(problems))
        return Result(name, "PASS",
                      f"ran left, corrected to x={wall_x:.0f} exactly, vx=0 while blocked, "
                      "no clipping, stable after release")
    finally:
        ctx.close()


def test_fall_death(browser):
    """SPEC §79.12: without an active checkpoint, falling past the active
    chapter's groundY + 400 (amended §43) triggers the final death flow
    (frozen entity, recorded death, input ignored, no auto-reset)."""
    name = "test: fall death final flow (§79.12)"
    ctx = _new_test_context(browser)
    page = _boot_page(ctx)
    errors: list[str] = []
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    page.on("console", lambda m: errors.append(f"console: {m.text}") if m.type == "error" else None)
    try:
        m = _metrics(page)
        if m["activeCheckpoint"] is not None:
            return Result(name, "FAIL", "an active checkpoint exists — test requires none (§79.12)")
        if m["chapter"]["id"] != "1-1" or m["chapter"]["act"] != 1:
            return Result(name, "FAIL",
                          f"chapter metrics wrong at spawn: {m['chapter']} (expected 1-1 / act 1)")
        ground_y = m["chapter"]["groundY"]
        threshold = ground_y + 400
        page.keyboard.down("KeyD")           # walk right into the pit
        dead_state = None
        deadline = time.time() + 12.0
        while time.time() < deadline:
            page.wait_for_timeout(100)
            p = _metrics(page)["player"]
            if p["dead"]:
                dead_state = p
                break
        page.wait_for_timeout(400)           # still holding right: must stay frozen
        frozen = _metrics(page)["player"]
        page.keyboard.up("KeyD")
        problems = []
        if dead_state is None:
            return Result(name, "FAIL", "player never died after falling into the pit")
        if dead_state["deathReason"] != "fall":
            problems.append(f"deathReason = {dead_state['deathReason']}, expected 'fall'")
        if dead_state["y"] <= threshold:
            problems.append(f"y at death {dead_state['y']:.1f} <= groundY+400 ({threshold})")
        if not _metrics(page)["lastDeath"] or _metrics(page)["lastDeath"]["reason"] != "fall":
            problems.append("game.lastDeath not recorded for the fall death")
        if frozen["x"] != dead_state["x"] or frozen["y"] != dead_state["y"]:
            problems.append("dead player moved while input was held (must be frozen)")
        if frozen["vx"] != 0 or frozen["vy"] != 0:
            problems.append(f"dead player velocity ({frozen['vx']}, {frozen['vy']}) nonzero")
        if not frozen["dead"]:
            problems.append("death state did not persist (auto-reset forbidden)")
        if errors:
            problems.append("; ".join(errors[:3]))
        if problems:
            return Result(name, "FAIL", "; ".join(problems))
        return Result(name, "PASS",
                      f"fell past y={threshold:.0f}, deathReason=fall, entity frozen "
                      f"at y={dead_state['y']:.0f} with input held, no auto-reset")
    finally:
        ctx.close()


def test_enemy_score_uniqueness(browser):
    """SPEC §79.17: the kill score is awarded exactly once per enemy per run,
    at the authoritative DEAD transition (§28/§59) — no re-award through
    duplicate DEAD transitions, no re-award when the corpse is struck again,
    and the corpse never damages. The checkpoint/Restart clauses reuse the
    same defeatedEnemyIds authority and activate with those flows (Phases
    11/13)."""
    name = "test: Enemy score uniqueness (§79.17)"
    ctx = _new_test_context(browser)
    page = _boot_page(ctx)
    errors: list[str] = []
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    page.on("console", lambda m: errors.append(f"console: {m.text}") if m.type == "error" else None)

    def metrics():
        return _metrics(page)

    def find(mid):
        return next((e for e in metrics()["enemies"] if e["id"] == mid), None)

    try:
        m = metrics()
        ids = [e["id"] for e in m["enemies"]]
        if "c1_1_enemy_001" not in ids or "c1_1_enemy_002" not in ids:
            return Result(name, "FAIL", f"chapter 1-1 patrollers missing: {ids}")
        e1 = find("c1_1_enemy_001")
        if (e1["w"], e1["h"]) != (42, 62):
            return Result(name, "FAIL",
                          f"patroller dims {e1['w']}x{e1['h']}, expected 42x62 (§29 x1.3)")
        if m["score"] != 0 or m["kills"] != 0 or m["defeatedEnemyIds"]:
            return Result(name, "FAIL",
                          f"fresh-run state wrong: score={m['score']} kills={m['kills']} "
                          f"defeated={m['defeatedEnemyIds']}")
        if m["player"]["hp"] != 5:
            return Result(name, "FAIL", f"Sara starting HP {m['player']['hp']}, expected 5")

        problems: list[str] = []

        # 1) ORGANIC stomp kill through the real collision + award path (§40):
        #    teleport above the patroller and drop — vy>200 crossing the top.
        e1 = find("c1_1_enemy_001")
        px = e1["x"] + e1["w"] / 2 - m["player"]["w"] / 2
        page.evaluate(f"() => window.__SOM_TEST_API__.teleport({px}, {e1['y'] - 100}, 250)")
        deadline = time.time() + 5.0
        killed = None
        while time.time() < deadline:
            page.wait_for_timeout(100)
            killed = find("c1_1_enemy_001")
            if killed and killed["dead"]:
                break
        after_stomp = metrics()
        if not (killed and killed["dead"]):
            problems.append("stomp never killed the patroller")
        else:
            # 100 base x3 Perfect Landing (§41: stomp kill) = 300, awarded once
            if after_stomp["score"] != 300:
                problems.append(f"score after stomp kill = {after_stomp['score']}, "
                                f"expected 300 (base 100 x3 Perfect Landing, §41/§59)")
            if after_stomp["kills"] != 1:
                problems.append(f"kills = {after_stomp['kills']}, expected 1")
            if "c1_1_enemy_001" not in after_stomp["defeatedEnemyIds"]:
                problems.append("id missing from defeatedEnemyIds (§28)")
            if after_stomp["player"]["hp"] != 5:
                problems.append(f"player HP {after_stomp['player']['hp']} after a clean "
                                f"stomp — expected 5 (no contact damage on stomp)")

        # 2) no duplicate award while idle
        page.wait_for_timeout(800)
        m2 = metrics()
        if m2["score"] != after_stomp["score"] or m2["kills"] != after_stomp["kills"]:
            problems.append("score/kills changed while idle (duplicate award path)")

        # 3) the corpse is non-collidable + non-damaging (§31): drop onto it
        e1 = find("c1_1_enemy_001")
        page.evaluate(f"() => window.__SOM_TEST_API__.teleport({e1['x']}, {e1['y'] - 60}, 300)")
        page.wait_for_timeout(700)
        m3 = metrics()
        if m3["score"] != after_stomp["score"] or m3["kills"] != after_stomp["kills"]:
            problems.append("re-award after striking the corpse (§28)")
        if m3["player"]["hp"] < after_stomp["player"]["hp"]:
            problems.append("dead enemy dealt contact damage (§31 non-damaging)")

        # 4) duplicate DEAD transition through the award path itself: the
        #    second patroller is force-killed (organic §59 path, base score —
        #    not a stomp, so no Perfect Landing; streak 1 < 3 -> no combo),
        #    then the same kill is forced AGAIN — exactly one award total.
        page.evaluate("() => window.__SOM_TEST_API__.forceKill('c1_1_enemy_002')")
        page.wait_for_timeout(200)
        ma = metrics()
        page.evaluate("() => window.__SOM_TEST_API__.forceKill('c1_1_enemy_002')")
        page.wait_for_timeout(200)
        mb = metrics()
        if ma["score"] != after_stomp["score"] + 100 or ma["kills"] != 2:
            problems.append(f"second kill award wrong: score={ma['score']} kills={ma['kills']} "
                            f"(expected +100 / 2)")
        if mb["score"] != ma["score"] or mb["kills"] != ma["kills"]:
            problems.append("duplicate DEAD transition re-awarded the kill (§28/§59)")
        if len(mb["defeatedEnemyIds"]) != 2:
            problems.append(f"defeatedEnemyIds = {mb['defeatedEnemyIds']}, expected 2 entries")

        if errors:
            problems.append("; ".join(errors[:3]))
        if problems:
            return Result(name, "FAIL", "; ".join(problems))
        return Result(name, "PASS",
                      f"stomp kill awarded once (100x3 Perfect Landing = 300, kills 1); "
                      f"no idle/corpse/duplicate-transition re-award; second kill +100 "
                      f"exactly once; corpse non-damaging")
    finally:
        ctx.close()


# ------------------------------------------------------------------ phase 7 tests

# In-page slow-motion domain sampler (§79.3): records per rendered frame the
# enemy-domain clock (walkTime advances by simDt every step regardless of
# patrol pauses/turns — the clean 0.35 factor probe), enemy position, the
# enemy hurt timer, player vx, and the Aram attack cooldown.
_SM_SAMPLER = """() => {
  window.__somSM = { rows: [] };
  const tick = () => {
    const M = window.__SOM_METRICS__;
    if (M && M.player && M.enemies) {
      const e1 = M.enemies.find((e) => e.id === 'c1_1_enemy_001');
      window.__somSM.rows.push({
        t: M.gameTime, slow: M.slowMoActive, slowT: M.slowMoT,
        pvx: M.player.vx, cdA: M.player.cooldowns.aram.attack,
        ex: e1 ? e1.x : null, walk: e1 ? e1.walkTime : null,
        hurtT: e1 ? e1.hurtT : null,
      });
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}"""


def _sm_rows(page):
    return page.evaluate("() => window.__somSM.rows")


def _slope(rows, key, t0, t1):
    """Linear slope of `key` vs t over [t0, t1] (None if insufficient)."""
    pts = [(r["t"], r[key]) for r in rows
           if t0 <= r["t"] <= t1 and r[key] is not None]
    if len(pts) < 4:
        return None
    (ta, va), (tb, vb) = pts[0], pts[-1]
    if tb - ta < 0.05:
        return None
    return (vb - va) / (tb - ta)


def test_aram_slow_motion(browser):
    """SPEC §79.3: Aram slow-motion — enemy systems at 0.35 (movement AND AI
    timers), player at 1.0, duration 3.0s, player ability cooldowns NOT
    slowed. Measured from the actual simulation state via a per-frame
    sampler; walkTime is the §31 enemy-domain AI/walk-cycle clock (advances
    by simDt each step — pause/turn-immune), the patrol path proves slowed
    MOVEMENT, and the magic-shot kill proves §21 damage through the organic
    award path."""
    name = "test: Aram slow-motion time domains (§79.3)"
    ctx = _new_test_context(browser)
    page = _boot_page(ctx)
    errors: list[str] = []
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    page.on("console", lambda m: errors.append(f"console: {m.text}") if m.type == "error" else None)
    try:
        if not page.evaluate("() => window.__SOM_TEST_API__.forceUnlock('aram')"):
            return Result(name, "FAIL", "forceUnlock('aram') refused")
        page.keyboard.press("3")
        page.wait_for_timeout(150)
        m = _metrics(page)
        if m["player"]["character"] != "aram":
            return Result(name, "FAIL", "switch to Aram did not land (§20)")
        # Stand near the first patroller's patrol stretch (1450..1850). The
        # player never moves before the shot, so facing stays 'right'.
        page.evaluate("() => window.__SOM_TEST_API__.teleport(1650, 594, 0)")
        page.wait_for_timeout(120)
        page.evaluate(_SM_SAMPLER)

        # Phase A: ~0.9s at the normal domain rate.
        page.wait_for_timeout(900)
        rows_a = _sm_rows(page)
        tA0 = rows_a[-1]["t"]
        score_before = _metrics(page)["score"]

        # K TAP (< 300 ms) -> slow-motion (§25).
        page.keyboard.down("K")
        page.wait_for_timeout(70)
        page.keyboard.up("K")
        page.wait_for_timeout(120)
        m = _metrics(page)
        if not m["slowMoActive"]:
            return Result(name, "FAIL", "K tap did not activate slow-motion (§25.1)")
        t_on = m["gameTime"]

        # Phase B: ~0.9s inside the slow-motion window.
        page.wait_for_timeout(900)
        rows_b = _sm_rows(page)
        tB1 = rows_b[-1]["t"]

        # Magic shot (§25.3) into the patroller from its left: the ATTACK
        # COOLDOWN decays at the player rate while the world is slowed, and
        # the 1-HP patroller dies through the organic award path (+100).
        m = _metrics(page)
        e1 = [e for e in m["enemies"] if e["id"] == "c1_1_enemy_001"][0]
        page.evaluate(f"() => window.__SOM_TEST_API__.teleport({e1['x'] - 70}, 594, 0)")
        page.wait_for_timeout(100)
        t_shot = _metrics(page)["gameTime"]
        page.keyboard.press("J")
        page.wait_for_timeout(550)          # flight + kill award

        # Player at 1.0: hold D and sample vx inside the same slow-mo.
        page.keyboard.down("D")
        page.wait_for_timeout(400)
        page.keyboard.up("D")
        m = _metrics(page)
        if not m["slowMoActive"]:
            return Result(name, "FAIL", "slow-motion expired before the player-rate "
                                       "sample (duration < 3.0s)")
        t_off_sample = m["gameTime"]

        # Wait out the remainder of the 3.0s duration + margin.
        page.wait_for_timeout(int(max(0.0, 3.0 - (t_off_sample - t_on)) * 1000) + 700)
        rows = _sm_rows(page)

        # ---- analysis -------------------------------------------------------
        problems = []
        slope_walk_pre = _slope(rows, "walk", rows[0]["t"], tA0)
        slope_walk_slow = _slope(rows, "walk", t_on + 0.1, tB1)
        cd_pts = [(r["t"], r["cdA"]) for r in rows
                  if r["t"] >= t_shot and 0 < r["cdA"] < 0.36]
        slope_cd = None
        if len(cd_pts) >= 4 and cd_pts[-1][0] - cd_pts[0][0] > 0.05:
            (ta, va), (tb, vb) = cd_pts[0], cd_pts[-1]
            slope_cd = (vb - va) / (tb - ta)
        pvx_pts = [abs(r["pvx"]) for r in rows
                   if t_off_sample - 0.4 <= r["t"] <= t_off_sample and r["pvx"] is not None]
        mean_pvx = sum(pvx_pts) / len(pvx_pts) if pvx_pts else None
        slow_rows = [r for r in rows if r["slow"]]
        duration = None
        if slow_rows:
            after = [r for r in rows if r["t"] > slow_rows[-1]["t"] and not r["slow"]]
            t_end = after[0]["t"] if after else slow_rows[-1]["t"]
            duration = t_end - slow_rows[0]["t"]
        # Slowed MOVEMENT: patrol path length per sim-second inside the
        # slow-mo window vs the pre window (loose bounds — pauses/turns).
        path_a = sum(abs(b - a) for a, b in zip(
            [r["ex"] for r in rows if r["t"] <= tA0 and r["ex"] is not None],
            [r["ex"] for r in rows if r["t"] <= tA0 and r["ex"] is not None][1:]))
        path_b = sum(abs(b - a) for a, b in zip(
            [r["ex"] for r in rows if t_on + 0.1 <= r["t"] <= tB1 and r["ex"] is not None],
            [r["ex"] for r in rows if t_on + 0.1 <= r["t"] <= tB1 and r["ex"] is not None][1:]))
        score_after = _metrics(page)["score"]

        if slope_walk_pre is None or not (0.90 <= slope_walk_pre <= 1.10):
            problems.append(f"pre slow-mo enemy AI clock rate {slope_walk_pre} != 1.0")
        if slope_walk_slow is None or not (0.28 <= slope_walk_slow <= 0.44):
            problems.append(f"slow-mo enemy AI clock rate {slope_walk_slow} != 0.35 (§79.3)")
        if path_a <= 0 or path_b <= 0 or not (0.15 <= path_b / path_a <= 0.60):
            problems.append(f"enemy movement ratio {path_b}/{path_a} not slowed (§79.3)")
        if mean_pvx is None or not (330 <= mean_pvx <= 390):
            problems.append(f"player speed during slow-mo {mean_pvx} != full rate (§79.3)")
        if slope_cd is None or not (-1.25 <= slope_cd <= -0.80):
            problems.append(f"player cooldown decay {slope_cd} is slowed (§79.3)")
        if duration is None or not (2.6 <= duration <= 3.4):
            problems.append(f"slow-motion duration {duration} != 3.0s (§79.3)")
        if score_after != score_before + 100:
            problems.append(f"magic-shot kill award {score_after - score_before} != +100 (§21/§59)")
        if errors:
            problems.append("; ".join(errors[:3]))
        if problems:
            return Result(name, "FAIL", "; ".join(str(p) for p in problems))
        return Result(name, "PASS",
                      f"enemy AI clock {slope_walk_pre:.2f} -> {slope_walk_slow:.2f} (0.35); "
                      f"movement ratio {path_b / path_a:.2f}; player {mean_pvx:.0f}px/s; "
                      f"cooldown decay {slope_cd:.2f}/s; duration {duration:.2f}s; kill +100")
    finally:
        ctx.close()


def test_character_switching(browser):
    """SPEC §79.4: character switching — HP ratio via the §20 round formula,
    unlock gating (locked slots never selectable), the 0.35s i-frame floor,
    and the blocked-while rules (switch refused during Sara's dash)."""
    name = "test: character switching HP formula (§79.4)"
    ctx = _new_test_context(browser)
    page = _boot_page(ctx)
    errors: list[str] = []
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    page.on("console", lambda m: errors.append(f"console: {m.text}") if m.type == "error" else None)
    try:
        m = _metrics(page)
        p = m["player"]
        if p["character"] != "sara" or p["hp"] != 5 or p["maxHp"] != 5:
            return Result(name, "FAIL", f"boot state wrong: {p['character']} {p['hp']}/{p['maxHp']}")
        problems = []

        # 1) Locked gating: Raha is NOT selectable at chapter 1-1 (§20).
        page.keyboard.press("2")
        page.wait_for_timeout(120)
        m = _metrics(page)
        if m["player"]["character"] != "sara":
            problems.append("switched to LOCKED Raha at chapter 1-1 (§20)")
        if m["unlockedCharacters"] != ["sara"]:
            problems.append(f"unlockedCharacters at boot = {m['unlockedCharacters']}")

        # 2) Two organic contact hits -> Sara hp 3 / 5 (§21/§22).
        for _ in range(2):
            em = _metrics(page)
            e1 = [e for e in em["enemies"] if e["id"] == "c1_1_enemy_001"][0]
            page.evaluate(f"() => window.__SOM_TEST_API__.teleport({e1['x']}, 594, 0)")
            page.wait_for_timeout(140)
            page.evaluate("() => window.__SOM_TEST_API__.teleport(300, 594, 0)")   # safe spot
            page.wait_for_timeout(1100)            # i-frames run out
        m = _metrics(page)
        if m["player"]["hp"] != 3 or m["damageTaken"] != 2:
            problems.append(f"setup damage wrong: hp={m['player']['hp']} "
                            f"damageTaken={m['damageTaken']} (expected 3 / 2)")

        # 3) Organic unlock: enter chapter 1-3 -> Raha joins (§20 story event).
        page.evaluate("() => window.__SOM_TEST_API__.teleport(7100, 594, 0)")
        page.wait_for_timeout(200)
        m = _metrics(page)
        if m["currentChapter"] != "1-3":
            problems.append(f"teleport did not reach chapter 1-3 ({m['currentChapter']})")
        if "raha" not in m["unlockedCharacters"]:
            problems.append(f"Raha not unlocked at 1-3: {m['unlockedCharacters']}")
        if m["tutorial"] is None or m["tutorial"]["key"] != "raha":
            problems.append(f"Raha unlock tutorial missing: {m['tutorial']} (§20.2)")

        # 4) Sara 3/5 -> Raha: round(8 * 3/5) = round(4.8) = 5, i-frame floor.
        page.keyboard.press("2")
        page.wait_for_timeout(60)
        m = _metrics(page)
        p = m["player"]
        if p["character"] != "raha":
            problems.append("switch to Raha refused after unlock (§20)")
        elif p["hp"] != 5 or p["maxHp"] != 8:
            problems.append(f"Sara->Raha HP formula: {p['hp']}/{p['maxHp']} (expected 5/8)")
        if p["invuln"] < 0.25:
            problems.append(f"switch i-frame floor {p['invuln']} < 0.35 (§20)")

        # 5) Raha 5/8 -> Sara: round(5 * 5/8) = round(3.125) = 3.
        page.keyboard.press("1")
        page.wait_for_timeout(80)
        m = _metrics(page)
        p = m["player"]
        if p["character"] != "sara":
            problems.append("switch back to Sara refused (§20)")
        elif p["hp"] != 3 or p["maxHp"] != 5:
            problems.append(f"Raha->Sara HP formula: {p['hp']}/{p['maxHp']} (expected 3/5)")

        # 6) Blocked while Sara's dash is active (§20).
        page.keyboard.down("K")
        page.wait_for_timeout(40)
        page.keyboard.press("2")                   # inside the 0.22s dash
        page.keyboard.up("K")
        page.wait_for_timeout(40)
        m = _metrics(page)
        if m["player"]["character"] != "sara" or m["player"]["dashT"] <= 0:
            problems.append("switch during active dash was not blocked (§20)")
        page.wait_for_timeout(400)                 # dash long over
        page.keyboard.press("2")
        page.wait_for_timeout(80)
        m = _metrics(page)
        if m["player"]["character"] != "raha":
            problems.append("switch to Raha refused AFTER the dash ended (§20)")

        if errors:
            problems.append("; ".join(errors[:3]))
        if problems:
            return Result(name, "FAIL", "; ".join(str(p) for p in problems))
        return Result(name, "PASS",
                      "locked slot refused; 3/5 -> round(8*3/5)=5/8 -> round(5*5/8)=3/5; "
                      "i-frame floor 0.35; switch blocked during dash, allowed after")
    finally:
        ctx.close()


# In-page jump sampler (§79.5): per rendered frame, feet y + jumpsUsed.
_MJ_SAMPLER = """() => {
  window.__somMJ = { rows: [], run: 0, peak: null };
  const tick = () => {
    const M = window.__SOM_METRICS__;
    if (M && M.player) {
      const p = M.player;
      const r = window.__somMJ;
      if (r.run > 0) {
        r.rows.push({ t: M.gameTime, run: r.run, y: p.y, ju: p.jumpsUsed,
                      og: p.onGround });
        r.peak = Math.min(r.peak ?? Infinity, p.y);
      }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}"""


def test_midair_double_jump(browser):
    """SPEC §79.5: midair double jump — Sara YES, Raha NO, Aram NO. One
    single-jump reference flight, then a second flight where a distinct
    physical jump source (ArrowUp, §37/§38) fires midair near apex."""
    name = "test: Midair double jump: Sara yes, others no (§79.5)"
    results = []
    for key, unlock in (("sara", False), ("raha", True), ("aram", True)):
        ctx = _new_test_context(browser)
        page = _boot_page(ctx)
        errors: list[str] = []
        page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
        try:
            if unlock:
                if not page.evaluate(f"() => window.__SOM_TEST_API__.forceUnlock('{key}')"):
                    results.append(f"{key}: forceUnlock refused")
                    ctx.close()
                    continue
                page.keyboard.press("2" if key == "raha" else "3")
                page.wait_for_timeout(150)
            m = _metrics(page)
            if m["player"]["character"] != key:
                results.append(f"{key}: switch did not land (§20)")
                ctx.close()
                continue
            page.evaluate("() => window.__SOM_TEST_API__.teleport(300, 594, 0)")
            page.wait_for_timeout(120)
            page.evaluate(_MJ_SAMPLER)

            # Flight 1: single-jump reference. Space is HELD through the
            # ascent in BOTH flights (identical hold profile => identical
            # variable-jump-cut behavior => comparable apex heights).
            page.evaluate("() => { window.__somMJ.run = 1; window.__somMJ.peak = null; }")
            page.keyboard.down("Space")
            page.wait_for_timeout(700)            # apex + descent underway
            page.keyboard.up("Space")
            page.wait_for_timeout(400)            # landing
            single_peak = page.evaluate("() => window.__somMJ.peak")

            # Flight 2: first jump, then a DISTINCT source midair near apex.
            page.evaluate("() => { window.__somMJ.run = 2; window.__somMJ.peak = null; }")
            page.keyboard.down("Space")
            page.wait_for_timeout(220)            # airborne, jumpsUsed == 1
            page.evaluate(
                "() => window.dispatchEvent(new KeyboardEvent('keydown', {code: 'ArrowUp'}))")
            page.wait_for_timeout(500)
            page.keyboard.up("Space")
            page.wait_for_timeout(500)
            mj = page.evaluate("() => ({ peak: window.__somMJ.peak, "
                               "rows: window.__somMJ.rows.filter(r => r.run === 2) })")
            max_ju = max((r["ju"] for r in mj["rows"]), default=0)

            if single_peak is None or mj["peak"] is None:
                results.append(f"{key}: flight sampling failed")
            elif key == "sara":
                if max_ju != 2:
                    results.append(f"sara: midair second jump never fired (jumpsUsed max {max_ju})")
                elif mj["peak"] > single_peak - 80:
                    results.append(f"sara: second rise only {single_peak - mj['peak']:.0f}px (< 80)")
                else:
                    results.append(f"sara: +{single_peak - mj['peak']:.0f}px second rise OK")
            else:
                if max_ju != 1:
                    results.append(f"{key}: midair double jump fired (jumpsUsed {max_ju}) — forbidden")
                elif abs(mj["peak"] - single_peak) > 20:
                    results.append(f"{key}: trajectory diverged {abs(mj['peak'] - single_peak):.0f}px")
                else:
                    results.append(f"{key}: single-jump trajectory only OK")
            if errors:
                results.append(f"{key}: " + "; ".join(errors[:2]))
        finally:
            ctx.close()

    problems = [r for r in results if not r.endswith("OK")]
    if problems:
        return Result(name, "FAIL", "; ".join(str(p) for p in problems))
    summary = "; ".join(r for r in results if r.endswith("OK"))
    return Result(name, "PASS", summary)


def test_raha_slam(browser):
    """SPEC §79.2: Raha Slam — airborne K enters fast-fall (gravity-boosted,
    exceeding the 1500px/s terminal fall), the landing impact radius is 90px
    (an in-range enemy hit, an out-of-range enemy untouched), enemies in
    radius take EXACTLY 2 damage, breakables in radius break, and a large
    §54 shake triggers. Targets: the 1-1 brute mini-boss (§50, HP 6 — an
    exact -2 readout) and the 1-3 authored breakable c1_3_brk_001."""
    name = "test: Raha slam: fast-fall, 90px radius, 2 dmg (§79.2)"
    ctx = _new_test_context(browser)
    page = _boot_page(ctx)
    errors: list[str] = []
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    page.on("console", lambda m: errors.append(f"console: {m.text}") if m.type == "error" else None)

    def metrics():
        return _metrics(page)

    def find(mid):
        return next((e for e in metrics()["enemies"] if e["id"] == mid), None)

    def brute_center():
        e = find("c1_1_miniboss")
        return e["x"] + e["w"] / 2 if e else 3000.0

    def slam_from(page_, place):
        """Go airborne high above `place()`'s area, then — immediately before
        the K press — re-derive the target x from a FRESH enemy read (the
        brute patrols ~35px/s; a pre-read would drift during the ~0.4 s
        setup+fall and could X-overlap the 78px-wide brute, degenerating the
        slam into a stomp bounce chain). K press -> fast-fall; sample the
        descent (max |vy| + slamActive); wait for the landing."""
        # §11.1 authoritative gate: a previous slam's cooldown (1.8 s) must
        # clear before the next K press can trigger — poll it via metrics.
        deadline = time.time() + 3.0
        while time.time() < deadline:
            if _metrics(page_)["player"]["cooldowns"]["raha"]["special"] <= 0:
                break
            page_.wait_for_timeout(80)
        x0 = place()
        page_.evaluate(f"() => window.__SOM_TEST_API__.teleport({x0}, 260, 0)")
        page_.wait_for_timeout(120)                    # airborne, at rest
        x1 = place()                                   # FRESH read — minimal drift window
        page_.evaluate(f"() => window.__SOM_TEST_API__.teleport({x1}, 260, 0)")
        page_.keyboard.down("K")
        page_.wait_for_timeout(40)
        page_.keyboard.up("K")
        max_vy = 0.0
        slam_seen = False
        deadline = time.time() + 1.4
        while time.time() < deadline:
            page_.wait_for_timeout(28)
            m_ = _metrics(page_)
            p_ = m_["player"]
            max_vy = max(max_vy, abs(p_["vy"]))
            slam_seen = slam_seen or p_["slamActive"]
            if p_["onGround"]:
                break
        return max_vy, slam_seen

    try:
        if not page.evaluate("() => window.__SOM_TEST_API__.forceUnlock('raha')"):
            return Result(name, "FAIL", "forceUnlock('raha') refused")
        page.keyboard.press("2")
        page.wait_for_timeout(150)
        if _metrics(page)["player"]["character"] != "raha":
            return Result(name, "FAIL", "switch to Raha did not land (§20)")

        problems: list[str] = []

        # ---- A: MISS — slam 200px right of the brute center (> 90px) -------
        # Right-side placement keeps both the fall corridor and the landing
        # on authored ground for ANY brute patrol offset (arena + 1-2 ground
        # are contiguous), and never X-overlaps the 78px-wide brute.
        e1 = find("c1_1_miniboss")
        if not e1:
            return Result(name, "FAIL", "1-1 brute mini-boss did not spawn (§50)")
        hp_full = e1["hp"]
        miss_at = lambda: brute_center() + 200
        max_vy, slam_seen = slam_from(page, miss_at)
        if not slam_seen:
            problems.append("airborne K never entered slam fast-fall")
        if max_vy <= 1500:
            problems.append(f"descent max vy {max_vy:.0f} <= 1500 terminal (no fast-fall)")
        e1 = find("c1_1_miniboss")
        if e1["hp"] != hp_full:
            problems.append(f"out-of-radius enemy damaged {hp_full}->{e1['hp']} (radius > 90px?)")

        # ---- B: HIT — slam ~84px right of the brute center (within 90px) ---
        # Offset +62 keeps the fall corridor clear of the brute's right edge
        # for the residual ~10px patrol drift before the §33 wind-up plants
        # it; the impact circle still lands ~27..55px from the AABB — hit.
        hit_at = lambda: brute_center() + 62
        max_vy2, _ = slam_from(page, hit_at)
        page.wait_for_timeout(50)
        m = metrics()
        e1 = next((e for e in m["enemies"] if e["id"] == "c1_1_miniboss"), None)
        if e1["hp"] != hp_full - 2:
            problems.append(f"in-radius damage {hp_full}->{e1['hp']}, expected exactly -2 (§21/§79.2)")
        if not m["shake"] or m["shake"]["mag"] != 12:
            problems.append(f"large shake not live after impact: {m['shake']} (§54/§79.2)")
        if max_vy2 <= 1500:
            problems.append(f"hit-case descent max vy {max_vy2:.0f} <= 1500 (no fast-fall)")

        # ---- C: BREAKABLE — slam onto the 1-3 stone breakable --------------
        page.wait_for_timeout(600)                     # let the shake clear
        slam_from(page, lambda: 8486)                  # over c1_3_brk_001
        deadline = time.time() + 1.2                   # settle after falling through
        while time.time() < deadline:
            page.wait_for_timeout(60)
            if _metrics(page)["player"]["onGround"]:
                break
        m = metrics()
        if "c1_3_brk_001" not in m["brokenPlatformIds"]:
            problems.append(f"breakable not broken: {m['brokenPlatformIds']} (§24/§79.2)")
        if not m["player"]["onGround"]:
            problems.append("player did not settle after breaking through")

        if errors:
            problems.append("; ".join(errors[:3]))
        if problems:
            return Result(name, "FAIL", "; ".join(str(p) for p in problems))
        return Result(name, "PASS",
                      f"fast-fall vy {max(max_vy, max_vy2):.0f}px/s; radius: "
                      f"miss@200 untouched / hit@74 -2dmg; breakable broken; shake 12px")
    finally:
        ctx.close()


_IMPLS = {
    "visibility_pause": test_visibility_pause,
    "multi_touch": test_multi_touch,
    "portrait_behavior": test_portrait_behavior,
    "sara_double_jump": test_sara_double_jump,
    "horizontal_collision": test_horizontal_collision,
    "fall_death": test_fall_death,
    "enemy_score_uniqueness": test_enemy_score_uniqueness,
    "aram_slow_motion": test_aram_slow_motion,
    "character_switching": test_character_switching,
    "midair_double_jump": test_midair_double_jump,
    "raha_slam": test_raha_slam,
}
for _t in TESTS:
    if _t["id"] in _IMPLS:
        _t["impl"] = _IMPLS[_t["id"]]


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
