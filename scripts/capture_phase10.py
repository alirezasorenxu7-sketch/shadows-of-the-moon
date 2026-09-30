#!/usr/bin/env python3
"""Phase 10 screenshot verification (SPEC §102.5, §96).

Captures the game-feel + atmosphere proof shots through the SAME test
instrumentation the acceptance harness uses (§73). The §53 camera eases
to a teleport in ~1.2 s, so teleports wait SETTLE_MS before probing.
Fog/vignette blends shift tones ~25-40%, so probes use TOLERANT ranges.

  1. phase10-landing-dust   — high fall (>100px) lands: §57 dust puffs at
     the feet + metrics kinds.dust.
  2. phase10-dash-trail     — Sara dash mid-flight: §57 silhouette
     afterimages (bluish pixels behind the runner).
  3. phase10-dash-ring      — the recovering dash's §57 cooldown ring.
  4. phase10-hit-particles  — knife hit on the 1-1 mini-boss: §57 target-
     color hit particles; then forceKill → §9/§57 hit-stop freeze proof.
  5. phase10-damage-flash   — contact damage: §57 red flash frame + HP
     drop + i-frames.
  6. phase10-ambient-torch  — §56 Act 1 loops (fireflies + leaves + shaft
     motes) around the §55 dressing scene: torch flame + warm glow + rim
     light; §55 fog-sheet atmospheric perspective band.
  7. phase10-textures       — §55 procedural platform textures: breakable
     wood palette + red highlights; stone cracks + moss; dirt tufts.
  8. phase10-shake-control  — §65 pause overlay shake row; §54 setting
     honored at the trigger site (Full 12px vs Off: null).

Server must already be running (§82).
"""
import json
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
BASE_URL = "http://127.0.0.1:8000"
OUT = ROOT / "screenshots"

# In-page tolerant pixel probe: counts pixels within per-channel tolerance
# of the wanted colors, in a vertical band around a world x.
WORLD_PROBE = """(payload) => {
  const worldX = payload[0];
  const specs = payload[1];      // [[hex, tol, minY, maxY], ...]
  const cv = document.getElementById('game');
  const c2 = cv.getContext('2d');
  const M = window.__SOM_METRICS__;
  const cam = M.camera;
  const img = c2.getImageData(0, 0, cv.width, cv.height);
  const d = img.data;
  const counts = specs.map(() => 0);
  const sx = (worldX - cam.x) * (cv.width / 1024);
  const x0 = Math.max(0, Math.floor(sx - 60));
  const x1 = Math.min(cv.width - 1, Math.ceil(sx + 60));
  for (let s = 0; s < specs.length; s += 1) {
    const n = parseInt(specs[s][0].slice(1), 16);
    const tr = (n >> 16) & 255, tg = (n >> 8) & 255, tb = n & 255;
    const tol = specs[s][1];
    const y0 = specs[s][2], y1 = specs[s][3];
    for (let y = y0; y <= Math.min(y1, cv.height - 1); y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const i = (y * cv.width + x) * 4;
        if (Math.abs(d[i] - tr) <= tol && Math.abs(d[i + 1] - tg) <= tol
            && Math.abs(d[i + 2] - tb) <= tol) counts[s] += 1;
      }
    }
  }
  return counts;
}"""

# Screen-space probe (canvas-logical coordinates).
SCREEN_PROBE = """(specs) => {
  const cv = document.getElementById('game');
  const c2 = cv.getContext('2d');
  const img = c2.getImageData(0, 0, cv.width, cv.height);
  const d = img.data;
  const counts = specs.map(() => 0);
  for (let s = 0; s < specs.length; s += 1) {
    const n = parseInt(specs[s][0].slice(1), 16);
    const tr = (n >> 16) & 255, tg = (n >> 8) & 255, tb = n & 255;
    const tol = specs[s][1];
    const rect = specs[s][2];
    for (let y = rect[1]; y <= Math.min(rect[3], cv.height - 1); y += 1) {
      for (let x = rect[0]; x <= Math.min(rect[2], cv.width - 1); x += 1) {
        const i = (y * cv.width + x) * 4;
        if (Math.abs(d[i] - tr) <= tol && Math.abs(d[i + 1] - tg) <= tol
            && Math.abs(d[i + 2] - tb) <= tol) counts[s] += 1;
      }
    }
  }
  return counts;
}"""

# Red-dominance probe for the §57 damage flash: counts pixels whose red
# channel clearly leads the others (the flash lifts r over the dark base).
RED_PROBE = """(rect) => {
  const cv = document.getElementById('game');
  const c2 = cv.getContext('2d');
  const img = c2.getImageData(0, 0, cv.width, cv.height);
  const d = img.data;
  let n = 0;
  for (let y = rect[1]; y <= Math.min(rect[3], cv.height - 1); y += 1) {
    for (let x = rect[0]; x <= Math.min(rect[2], cv.width - 1); x += 1) {
      const i = (y * cv.width + x) * 4;
      if (d[i] >= 34 && d[i] > d[i + 1] + 14 && d[i] > d[i + 2] + 10) n += 1;
    }
  }
  return n;
}"""

# Bluish-pixel counter for the dash trail zone (afterimages read as
# blue-leading pixels; fireflies/leaves/dust do not).
BLUEISH_PROBE = """(payload) => {
  const cv = document.getElementById('game');
  const c2 = cv.getContext('2d');
  const M = window.__SOM_METRICS__;
  const cam = M.camera;
  const img = c2.getImageData(0, 0, cv.width, cv.height);
  const d = img.data;
  const worldX0 = payload[0], worldX1 = payload[1], worldY0 = payload[2], worldY1 = payload[3];
  const k = cv.width / 1024;
  const x0 = Math.max(0, Math.floor((worldX0 - cam.x) * k));
  const x1 = Math.min(cv.width - 1, Math.ceil((worldX1 - cam.x) * k));
  const y0 = Math.max(0, Math.floor((worldY0 - cam.y) * k));
  const y1 = Math.min(cv.height - 1, Math.ceil((worldY1 - cam.y) * k));
  let n = 0;
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const i = (y * cv.width + x) * 4;
      if (d[i + 2] > d[i] + 26 && d[i + 2] > 62) n += 1;
    }
  }
  return n;
}"""

# Warm-pixel counter for the §55 torch light scene (flame + sconce + pole
# + ground pool are red-dominant; the cold scene is blue-dominant).
WARM_PROBE = """(rect) => {
  const cv = document.getElementById('game');
  const c2 = cv.getContext('2d');
  const img = c2.getImageData(0, 0, cv.width, cv.height);
  const d = img.data;
  let n = 0;
  for (let y = rect[1]; y <= Math.min(rect[3], cv.height - 1); y += 1) {
    for (let x = rect[0]; x <= Math.min(rect[2], cv.width - 1); x += 1) {
      const i = (y * cv.width + x) * 4;
      if (d[i] > d[i + 2] + 6) n += 1;
    }
  }
  return n;
}"""

SETTLE_MS = 1500            # §53 camera easing window for teleports


def dom_check(label, cond):
    tag = "ok" if cond else "FAIL"
    print(f"  [{tag:>4}] {label}")
    return bool(cond)


def run_probes(page, world_checks, screen_checks):
    ok = True
    for label, world_x, colors in world_checks:
        counts = page.evaluate(WORLD_PROBE, [world_x, colors])
        for spec, got in zip(colors, counts):
            minimum = spec[4]
            if got < minimum:
                ok = False
                print(f"  [FAIL] {label}: {spec[0]} -> {got} px (min {minimum})")
            else:
                print(f"  [ ok ] {label}: {spec[0]} -> {got} px (min {minimum})")
    for label, specs in screen_checks:
        counts = page.evaluate(SCREEN_PROBE, [[s[0], s[1], s[2]] for s in specs])
        for spec, got in zip(specs, counts):
            minimum = spec[3]
            if got < minimum:
                ok = False
                print(f"  [FAIL] {label}: {spec[0]} -> {got} px (min {minimum})")
            else:
                print(f"  [ ok ] {label}: {spec[0]} -> {got} px (min {minimum})")
    return ok


def gameplay_page(ctx, wait_boot=4600):
    """Fresh auto-started test page with the §20.2 tutorial expired."""
    page = ctx.new_page()
    page.goto(BASE_URL, wait_until="load", timeout=15000)
    page.wait_for_function("() => window.__SOM_BOOTED__ === true", timeout=5000)
    page.wait_for_function(
        "() => window.__SOM_METRICS__ && window.__SOM_METRICS__.renderCount > 8",
        timeout=5000)
    if wait_boot:
        page.wait_for_timeout(wait_boot)     # tutorial plate fades out
    return page


def main() -> int:
    OUT.mkdir(exist_ok=True)
    all_ok = True
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 1280, "height": 720})
        ctx.add_init_script("window.__SOM_TEST__ = true;")

        # ---- 1. §57 landing dust (fall > 100px) --------------------------
        print("shot 1: landing dust")
        page = gameplay_page(ctx)
        # The boot itself ends in a landing (lastLandAt > 0 from spawn), so
        # wait for a NEW landing stamp after the teleport.
        m0 = page.evaluate("() => window.__SOM_METRICS__.player.lastLandAt")
        # Fall from high above the tutorial ground: apex ~y 150 -> 656.
        page.evaluate("() => window.__SOM_TEST_API__.teleport(500, 150)")
        page.wait_for_function(
            f"() => window.__SOM_METRICS__.player.onGround === true"
            f" && window.__SOM_METRICS__.player.lastLandAt > {m0}", timeout=8000)
        page.wait_for_timeout(60)            # dust still alive (~0.42 s life)
        m = page.evaluate("() => window.__SOM_METRICS__")
        kinds = (m["particles"] or {}).get("kinds", {})
        ok = dom_check(f"landing-dust: kinds.dust = {kinds.get('dust', 0)}",
                       kinds.get("dust", 0) >= 8)
        ok = dom_check("landing-dust: player landed on the ground",
                       m["player"]["onGround"]) and ok
        # dust tones around the feet band (world x 500; feet at screen ~656)
        ok = run_probes(page,
            [("landing dust puffs (grey tones)", 500,
              [["#4a4a55", 42, 640, 676, 12]])],
            []) and ok
        page.screenshot(path=str(OUT / f"phase10-landing-dust-{int(time.time())}.png"))
        page.close()
        all_ok = all_ok and ok

        # ---- 2. §57 dash trail, then the cooldown ring -------------------
        print("shot 2+3: dash trail + cooldown ring")
        page = gameplay_page(ctx)
        page.evaluate("() => window.__SOM_TEST_API__.teleport(520, 594)")
        page.wait_for_timeout(SETTLE_MS)
        page.keyboard.press("K")             # Sara K press -> dash (§23)
        page.wait_for_timeout(110)           # mid-dash: trail alive
        m = page.evaluate("() => window.__SOM_METRICS__")
        ok = dom_check(f"dash: dashT active mid-flight ({m['player']['dashT']:.2f}s)",
                       m["player"]["dashT"] > 0)
        px = m["player"]["x"]
        # afterimage zone: behind the current player position
        trail_px = page.evaluate(BLUEISH_PROBE, [px - 190, px - 24, 560, 660])
        ok = dom_check(f"dash: bluish afterimage pixels behind player ({trail_px})",
                       trail_px >= 60) and ok
        page.screenshot(path=str(OUT / f"phase10-dash-trail-{int(time.time())}.png"))
        page.wait_for_timeout(280)           # dash ends; cooldown ring live
        m = page.evaluate("() => window.__SOM_METRICS__")
        cd = m["player"]["cooldowns"]["sara"]["special"]
        ok = dom_check(f"cooldown ring: sara special cd = {cd:.2f}s (active)",
                       cd > 0.6) and ok
        page.screenshot(path=str(OUT / f"phase10-dash-ring-{int(time.time())}.png"))
        page.close()
        all_ok = all_ok and ok

        # ---- 4. §57 hit particles + §9 hit-stop --------------------------
        print("shot 4: hit particles + hit-stop")
        page = gameplay_page(ctx)
        # 1-1 mini-boss (brute, hp 6, arena 2820..3400): stand 170px left of
        # its LIVE position (outside the 90px radial trigger), knife right.
        page.evaluate("() => window.__SOM_TEST_API__.teleport(2950, 594)")
        page.wait_for_timeout(SETTLE_MS)
        m = page.evaluate("() => window.__SOM_METRICS__")
        boss = [e for e in m["enemies"] if e["miniBoss"] and e["id"] == "c1_1_miniboss"]
        ok = dom_check("hit: 1-1 mini-boss present", len(boss) == 1)
        if boss:
            bx = boss[0]["x"] + boss[0]["w"] / 2
            hp0 = boss[0]["hp"]
            stand = max(2850, min(3230, boss[0]["x"] - 170))
            page.evaluate(f"() => window.__SOM_TEST_API__.teleport({stand}, 594)")
            page.wait_for_timeout(350)
            page.keyboard.press("d")         # ensure facing right
            page.keyboard.press("J")         # knife toward the boss
            page.wait_for_function(
                "() => window.__SOM_METRICS__.enemies.some("
                f"e => e.miniBoss && e.hp < {hp0})", timeout=4000)
            page.wait_for_timeout(60)
            m = page.evaluate("() => window.__SOM_METRICS__")
            b2 = [e for e in m["enemies"] if e["miniBoss"]][0]
            ok = dom_check(f"hit: boss hp {hp0} -> {b2['hp']} (knife damage)",
                           b2["hp"] == hp0 - 1) and ok
            ok = run_probes(page,
                [("hit particles in target color (steel grey)", bx,
                  [["#b8c2d4", 46, 540, 700, 8]])],
                []) and ok
            # §9/§57 hit-stop on kill: forceKill -> deadTransition freezes
            page.evaluate(f"() => window.__SOM_TEST_API__.forceKill({json.dumps(b2['id'])})")
            page.wait_for_function(
                "() => window.__SOM_METRICS__.hitStopRemaining > 0", timeout=4000)
            m = page.evaluate("() => window.__SOM_METRICS__")
            ok = dom_check(f"hit-stop: remaining {m['hitStopRemaining']:.3f}s > 0",
                           m["hitStopRemaining"] > 0) and ok
            ok = dom_check("hit-stop: kill recorded (score + kills)",
                           m["kills"] >= 1 and m["score"] >= 250) and ok
            page.screenshot(path=str(OUT / f"phase10-hit-particles-{int(time.time())}.png"))
        page.close()
        all_ok = all_ok and ok

        # ---- 5. §57 damage flash -----------------------------------------
        print("shot 5: damage flash")
        page = gameplay_page(ctx, wait_boot=300)
        # teleport ONTO the patroller -> side contact damage -> flash
        page.evaluate("() => window.__SOM_TEST_API__.teleport(1500, 594)")
        page.wait_for_function(
            "() => window.__SOM_METRICS__ && window.__SOM_METRICS__.damageFlashT > 0",
            timeout=6000)
        m = page.evaluate("() => window.__SOM_METRICS__")
        ok = dom_check(f"damage: flash state {m['damageFlashT']:.3f}s",
                       m["damageFlashT"] > 0)
        ok = dom_check("damage: HP lost (5 -> 4) + i-frames",
                       m["player"]["hp"] == 4 and m["player"]["invuln"] > 0) and ok
        ok = dom_check("damage: damageTaken recorded (§61)",
                       m["damageTaken"] == 1) and ok
        red = page.evaluate(RED_PROBE, [300, 120, 980, 500])
        ok = dom_check(f"damage: red-dominant flash pixels ({red})", red >= 400) and ok
        page.screenshot(path=str(OUT / f"phase10-damage-flash-{int(time.time())}.png"))
        page.close()
        all_ok = all_ok and ok

        # ---- 6. §56 ambient loops + §55 dressing/torch/fog sheet ---------
        print("shot 6: ambient + torch + fog sheet")
        page = gameplay_page(ctx, wait_boot=6500)   # let Act 1 loops build up
        page.evaluate("() => window.__SOM_TEST_API__.teleport(560, 594)")
        page.wait_for_timeout(SETTLE_MS + 900)
        m = page.evaluate("() => window.__SOM_METRICS__")
        kinds = (m["particles"] or {}).get("kinds", {})
        amb = (m["particles"] or {}).get("ambient", 0)
        ok = dom_check(f"ambient: fireflies {kinds.get('firefly', 0)}, "
                       f"leaves {kinds.get('leaf', 0)}, motes {kinds.get('shaftMote', 0)}",
                       kinds.get("firefly", 0) >= 1 and kinds.get("leaf", 0) >= 1
                       and kinds.get("shaftMote", 0) >= 1)
        ok = dom_check(f"ambient: live ambient count {amb} <= 110 (§78 reserve)",
                       amb <= 110) and ok
        # torch flame at world (564, ~582); feet band at screen ~656
        ok = run_probes(page,
            [("torch flame (warm core)", 560,
              [["#e07b2a", 50, 540, 610, 6]])],
            []) and ok
        # warm light signature around the torch (screen box around the
        # flame: cam.x ~107 -> flame screen x ~571, y ~563)
        warm = page.evaluate(WARM_PROBE, [481, 480, 661, 655])
        ok = dom_check(f"torch: warm-dominant light pixels ({warm})", warm >= 150) and ok
        # §55 fog sheet: darker band across the mid horizon (screen space)
        ok = run_probes(page, [],
            [("fog sheet darkening (atmospheric perspective)",
              [["#10161f", 12, [80, 520, 560, 620], 900]])]) and ok
        page.screenshot(path=str(OUT / f"phase10-ambient-torch-{int(time.time())}.png"))
        page.close()
        all_ok = all_ok and ok

        # ---- 7. §55 procedural platform textures -------------------------
        print("shot 7: platform textures")
        page = gameplay_page(ctx)
        # 1-3 breakable (8460, 500) floats over ground stretch 2 (8420+):
        # stand at 8500; breakable tops at screen y ~461-486.
        page.evaluate("() => window.__SOM_TEST_API__.teleport(8500, 594)")
        page.wait_for_timeout(SETTLE_MS)
        ok = run_probes(page,
            [("breakable wood body (§55 palette)", 8480,
              [["#5a4030", 30, 458, 488, 40]]),
             ("breakable red highlight (§55)", 8490,
              [["#743427", 42, 458, 488, 4]])],
            [])
        page.screenshot(path=str(OUT / f"phase10-wood-{int(time.time())}.png"))
        # stone stair 2 (940, 460, 140x24): moss + cracks near the top
        page.evaluate("() => window.__SOM_TEST_API__.teleport(960, 594)")
        page.wait_for_timeout(SETTLE_MS)
        ok = run_probes(page,
            [("stone moss patch (green-dark blend)", 960,
              [["#141d17", 24, 405, 440, 4]]),
             ("stone crack seam (dark)", 960,
              [["#0c0f16", 16, 405, 445, 5]])],
            []) and ok
        page.screenshot(path=str(OUT / f"phase10-stone-{int(time.time())}.png"))
        # dirt ground: grass tufts above the top edge at spawn
        page.evaluate("() => window.__SOM_TEST_API__.teleport(400, 594)")
        page.wait_for_timeout(SETTLE_MS)
        ok = run_probes(page,
            [("dirt grass tufts (green-dark)", 400,
              [["#1e3324", 36, 640, 662, 8]])],
            []) and ok
        page.screenshot(path=str(OUT / f"phase10-textures-{int(time.time())}.png"))
        page.close()
        all_ok = all_ok and ok

        # ---- 8. §65/§54 shake intensity control --------------------------
        print("shot 8: shake control")
        page = gameplay_page(ctx)
        page.evaluate("() => window.__SOM_TEST_API__.teleport(520, 594)")
        page.wait_for_timeout(SETTLE_MS)
        page.keyboard.press("Escape")        # manual pause (§8.4)
        page.wait_for_timeout(250)
        ok = dom_check("pause: overlay visible",
                       page.locator("#pause-overlay").is_visible())
        ok = dom_check("pause: shake row visible (§65)",
                       page.locator("#shake-row").is_visible()) and ok
        ok = dom_check("pause: Full selected by default",
                       page.evaluate(
                           "() => document.querySelector('.shake-opt[data-mode=full]')"
                           ".getAttribute('aria-pressed') === 'true'")) and ok
        page.screenshot(path=str(OUT / f"phase10-shake-control-{int(time.time())}.png"))
        # functional §54 proof at the trigger site: Raha slam, Full vs Off.
        page.keyboard.press("R")             # resume (§8.4 explicit source)
        page.evaluate("() => window.__SOM_TEST_API__.forceUnlock('raha')")
        page.keyboard.press("2")             # switch to Raha
        page.wait_for_timeout(400)
        page.evaluate("() => window.__SOM_TEST_API__.teleport(600, 120)")
        page.wait_for_timeout(300)
        page.keyboard.press("K")             # airborne slam -> fast-fall
        page.wait_for_function(
            "() => window.__SOM_METRICS__ && window.__SOM_METRICS__.shake !== null",
            timeout=6000)
        m = page.evaluate("() => window.__SOM_METRICS__")
        ok = dom_check(f"shake FULL: mag {m['shake']['mag']} px (expect 12)",
                       abs(m["shake"]["mag"] - 12) < 0.01) and ok
        # switch to Off through the pause overlay, then slam again
        page.wait_for_timeout(2200)          # SLAM_COOLDOWN 1.8 s
        page.keyboard.press("Escape")
        page.wait_for_timeout(250)
        page.click(".shake-opt[data-mode=off]")
        page.wait_for_timeout(150)
        m = page.evaluate("() => window.__SOM_METRICS__")
        ok = dom_check(f"shake OFF: metrics mode = {m['shakeMode']}",
                       m["shakeMode"] == "off") and ok
        ok = dom_check("shake OFF: aria-pressed flipped",
                       page.evaluate(
                           "() => document.querySelector('.shake-opt[data-mode=off]')"
                           ".getAttribute('aria-pressed') === 'true'"
                           " && document.querySelector('.shake-opt[data-mode=full]')"
                           ".getAttribute('aria-pressed') === 'false'")) and ok
        page.keyboard.press("R")             # resume
        page.evaluate("() => window.__SOM_TEST_API__.teleport(600, 120)")
        page.wait_for_timeout(300)
        page.keyboard.press("K")             # slam again under Off
        page.wait_for_function(
            "() => window.__SOM_METRICS__ && window.__SOM_METRICS__.player.onGround === true",
            timeout=6000)
        page.wait_for_timeout(250)
        m = page.evaluate("() => window.__SOM_METRICS__")
        ok = dom_check("shake OFF: slam impact leaves shake null",
                       m["shake"] is None) and ok
        page.close()
        all_ok = all_ok and ok

        ctx.close()
        browser.close()

    print()
    if not all_ok:
        print("CAPTURE AUDIT FAILED")
        return 1
    print("CAPTURE AUDIT PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
