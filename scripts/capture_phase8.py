#!/usr/bin/env python3
"""Phase 8 screenshot + state verification (SPEC §102.5, §96).

Robust capture discipline (learned the hard way):
  - SETTLE: after any teleport the §53 camera eases for ~1.2 s — every shot
    waits past that BEFORE capturing, so screenshot and pixel probes agree.
  - FX CYCLES: transient states (§33 wind-up, §50 charge wind-up) are caught
    by POLLING metrics for a FRESH cycle after the settle — the entity is
    planted (vx=0) during them, so the scene is static.
  - LIVE PROBES: pixel probes read the LIVE canvas (not the saved PNG) and
    anchor on the entity's LIVE position, so sub-100 ms drift is harmless.
  - STATE assertions run through the same §73/§74 metrics the acceptance
    harness uses.

Shots:
  1. phase8-chaser  — Chaser mid-chase (§29/§34): streaming scarf, eyes.
  2. phase8-alert   — the §34 alert pause with the "!" glyph.
  3. phase8-armored — 1-2 Armored mini-boss charging (§50): boss HP bar,
     faint red chest arrow, §31 run state at charge speed.
  4. phase8-brute   — 1-1 Brute mini-boss §33 radial wind-up: red pulse,
     planted crouch, full boss bar.
  5. phase8-slam    — Raha GROUND-POUND impact (§24/§79.2): HP bar at
     exactly 4/6 (the -2 readout) + live shake + impact ring.
  6. phase8-absorb  — §29.1: an Aram magic shot hits the Armored mini-boss
     and is ABSORBED (0 damage).

Server must already be running (§82).
"""
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
BASE_URL = "http://127.0.0.1:8000"
OUT = ROOT / "screenshots"

TUTORIAL_MS = 4600          # §20.2: 4 s + fade tail, wait it out
SETTLE_MS = 1500            # §53 camera ease after a big teleport

PROBE = """(payload) => {
  const worldX = payload[0];
  const specs = payload[1];
  const cv = document.getElementById('game');
  const c2 = cv.getContext('2d');
  const M = window.__SOM_METRICS__;
  const cam = M.camera;
  const img = c2.getImageData(0, 0, cv.width, cv.height);
  const d = img.data;
  const counts = specs.map(() => 0);
  const sx = (worldX - cam.x) * (cv.width / 1024);
  const x0 = Math.max(0, Math.floor(sx - 90));
  const x1 = Math.min(cv.width - 1, Math.ceil(sx + 90));
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

M = lambda page: page.evaluate("() => window.__SOM_METRICS__")
FIND = lambda page, mid: next(
    (e for e in M(page)["enemies"] if e["id"] == mid), None)


def poll(page, cond, timeout_s=14.0, tick_ms=30):
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        page.wait_for_timeout(tick_ms)
        if cond(page):
            return True
    return False


def shot(ctx, name, setup, probe_fn, state_fn=None, settle_ms=SETTLE_MS,
         fire=None, wait_fx=None):
    page = ctx.new_page()
    page.goto(BASE_URL, wait_until="load", timeout=15000)
    page.wait_for_function("() => window.__SOM_BOOTED__ === true", timeout=5000)
    page.wait_for_function(
        "() => window.__SOM_METRICS__ && window.__SOM_METRICS__.renderCount > 8", timeout=5000)
    page.wait_for_timeout(TUTORIAL_MS)   # §20.2 tutorial plate expired
    setup(page)
    page.wait_for_timeout(settle_ms)     # §53 camera fully eased
    ok = True
    if fire is not None:
        fire(page)                        # trigger the transient FX now
    if wait_fx is not None:
        if not poll(page, wait_fx):
            ok = False
            print(f"  [FAIL] {name}/fx: FX window never opened")
    if state_fn is not None:
        s_ok, detail = state_fn(page)
        ok = ok and s_ok
        tag = "ok" if s_ok else "FAIL"
        print(f"  [{tag:>4}] {name}/state: {detail}")
    out = OUT / f"{name}-{int(time.time())}.png"
    page.screenshot(path=str(out))
    for label, world_x, colors in probe_fn(page):
        counts = page.evaluate(PROBE, [world_x, colors])
        for (hexc, tol, y0, y1, minimum), got in zip(colors, counts):
            if got < minimum:
                ok = False
                print(f"  [FAIL] {name}/{label}: {hexc}±{tol} -> {got} px (min {minimum})")
            else:
                print(f"  [ ok ] {name}/{label}: {hexc}±{tol} -> {got} px (min {minimum})")
    page.close()
    return ok, out


def main() -> int:
    OUT.mkdir(exist_ok=True)
    all_ok = True
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 1280, "height": 720})
        ctx.add_init_script("window.__SOM_TEST__ = true;")

        # ---- 1. Chaser mid-chase (1-2 chaser, post 5321) --------------------
        # Captured during the APPROACH (100..220px out): not yet overlapping
        # the player sprite (which would cover the eyes), outside telegraph
        # range (110px) — a clean chase read.
        def setup_chaser(page):
            page.evaluate("() => window.__SOM_TEST_API__.teleport(5571, 594, 0)")
            page.wait_for_timeout(SETTLE_MS)          # settle FAR (outside trigger)
            page.evaluate("() => window.__SOM_TEST_API__.teleport(5440, 594, 0)")
        def fx_chaser(page):
            e = FIND(page, "c1_2_enemy_002")
            if not e or e["chaseState"] != "chase":
                return False
            d = abs((e["x"] + e["w"] / 2) - 5459)
            return 100 < d < 220
        def state_chaser(page):
            e = FIND(page, "c1_2_enemy_002")
            if not e:
                return False, "chaser missing"
            if e["chaseState"] != "chase":
                return False, f"chaseState {e['chaseState']} != chase (§34 chain)"
            return True, f"chaseState=chase vx={e['vx']:.0f} state={e['state']}"
        def probes_chaser(page):
            e = FIND(page, "c1_2_enemy_002")
            x = e["x"] + e["w"] / 2 if e else 5380
            return [
                ("streaming scarf", x, [["#8a1010", 45, 500, 660, 14]]),
                ("armor cubes", x, [["#1e1e1e", 30, 500, 660, 40]]),
                ("glowing eyes", x, [["#f0f0f0", 55, 550, 625, 2]]),
            ]
        ok, _ = shot(ctx, "phase8-chaser", setup_chaser, probes_chaser,
                     state_fn=state_chaser, wait_fx=fx_chaser, settle_ms=60)
        all_ok = all_ok and ok

        # ---- 2. Chaser ALERT pause with the "!" glyph (§34) -----------------
        def setup_alert(page):
            page.evaluate("() => window.__SOM_TEST_API__.teleport(5571, 594, 0)")
            page.wait_for_timeout(SETTLE_MS)          # settle FAR (outside trigger)
            page.evaluate("() => window.__SOM_TEST_API__.teleport(5440, 594, 0)")
        def fx_alert(page):
            e = FIND(page, "c1_2_enemy_002")
            return bool(e) and e["chaseState"] == "alert" and e["alertT"] > 0.08
        def state_alert(page):
            e = FIND(page, "c1_2_enemy_002")
            if not e:
                return False, "chaser missing"
            if e["chaseState"] != "alert" or e["alertT"] <= 0:
                return False, f"alert state {e['chaseState']}/{e['alertT']}"
            return True, f"alertT={e['alertT']:.2f} (\"!\" rendered above)"
        def probes_alert(page):
            e = FIND(page, "c1_2_enemy_002")
            x = e["x"] + e["w"] / 2 if e else 5340
            return [("exclaim glyph", x, [["#f0f0f0", 45, 500, 610, 3]])]
        ok, _ = shot(ctx, "phase8-alert", setup_alert, probes_alert,
                     state_fn=state_alert, wait_fx=fx_alert, settle_ms=60)
        all_ok = all_ok and ok

        # ---- 3. Armored mini-boss CHARGING (1-2 arena, §50/§31 run) ---------
        def setup_armored(page):
            page.evaluate("() => window.__SOM_TEST_API__.forceUnlock('raha')")
            page.keyboard.press("2")
            page.wait_for_timeout(250)
            page.evaluate("() => window.__SOM_TEST_API__.teleport(6720, 594, 0)")
        def fx_armored(page):
            e = FIND(page, "c1_2_miniboss")
            return bool(e) and e["chargeState"] == "charging"
        def state_armored(page):
            e = FIND(page, "c1_2_miniboss")
            if not e:
                return False, "armored mini-boss missing (§50)"
            if e["chargeState"] != "charging":
                return False, f"chargeState {e['chargeState']}"
            if e["state"] != "run":
                return False, f"§31 state {e['state']} != run (240 > 200 hysteresis)"
            if e["hp"] != 7:
                return False, f"hp {e['hp']} != 7"
            return True, f"charging at {e['vx']:.0f}px/s state=run hp=7"
        def probes_armored(page):
            e = FIND(page, "c1_2_miniboss")
            x = e["x"] + e["w"] / 2 if e else 6700
            return [
                ("boss HP bar (full)", x, [["#c02020", 40, 495, 550, 25]]),
                ("thick armor", x, [["#1e1e1e", 30, 540, 660, 50]]),
                ("chest arrow blend", x, [["#731b1b", 34, 550, 610, 3]]),
                ("cloak", x, [["#8a1010", 45, 540, 660, 6]]),
            ]
        ok, _ = shot(ctx, "phase8-armored", setup_armored, probes_armored,
                     state_fn=state_armored, wait_fx=fx_armored)
        all_ok = all_ok and ok

        # ---- 4. Brute mini-boss radial wind-up (§33 red pulse) --------------
        def setup_brute(page):
            page.evaluate("() => window.__SOM_TEST_API__.forceUnlock('raha')")
            page.keyboard.press("2")
            page.wait_for_timeout(250)
            page.evaluate("() => window.__SOM_TEST_API__.teleport(3190, 594, 0)")
        def fx_brute(page):
            e = FIND(page, "c1_1_miniboss")
            return bool(e) and 0.12 < e["radialWindup"] < 0.46
        def state_brute(page):
            e = FIND(page, "c1_1_miniboss")
            if not e:
                return False, "brute mini-boss missing (§50)"
            if e["radialWindup"] <= 0:
                return False, f"radialWindup {e['radialWindup']} (§33 trigger)"
            if e["state"] != "crouch":
                return False, f"state {e['state']} != crouch (§31 planted)"
            return True, f"radialWindup={e['radialWindup']:.2f} state=crouch hp={e['hp']}"
        def probes_brute(page):
            e = FIND(page, "c1_1_miniboss")
            x = e["x"] + e["w"] / 2 if e else 3120
            return [
                ("boss HP bar (full)", x, [["#c02020", 40, 465, 515, 25]]),
                ("mass armor", x, [["#1e1e1e", 30, 490, 660, 50]]),
                ("red pulse blend", x, [["#3a1414", 28, 490, 650, 8]]),
                ("wide cloak", x, [["#8a1010", 45, 490, 660, 6]]),
            ]
        ok, _ = shot(ctx, "phase8-brute", setup_brute, probes_brute,
                     state_fn=state_brute, wait_fx=fx_brute)
        all_ok = all_ok and ok

        # ---- 5. Raha GROUND-POUND impact: HP bar exactly 4/6 (§79.2) --------
        def setup_slam(page):
            page.evaluate("() => window.__SOM_TEST_API__.forceUnlock('raha')")
            page.keyboard.press("2")
            page.wait_for_timeout(250)
            e = FIND(page, "c1_1_miniboss")
            bcx = (e["x"] + e["w"] / 2) if e else 3120
            page.evaluate(f"() => window.__SOM_TEST_API__.teleport({bcx + 75}, 594, 0)")
        def fire_slam(page):
            # GROUNDED K = immediate §24 ground pound (same 90px impact):
            # no fall, no camera vertical chase — the scene stays static.
            page.keyboard.down("K")
            page.wait_for_timeout(40)
            page.keyboard.up("K")
        def fx_slam(page):
            m = M(page)
            return bool(m["shake"]) and m["shake"]["mag"] == 12
        def state_slam(page):
            m = M(page)
            e = FIND(page, "c1_1_miniboss")
            if not e:
                return False, "brute missing"
            if e["hp"] != 4:
                return False, f"brute hp {e['hp']} != 4 (exactly -2, §79.2)"
            if not m["shake"]:
                return False, "no live shake after impact (§54)"
            return True, f"hp=4 (−2) shake={m['shake']['mag']}px rings={m['particles']['rings']}"
        def probes_slam(page):
            e = FIND(page, "c1_1_miniboss")
            x = e["x"] + e["w"] / 2 if e else 3120
            return [
                ("impact ring", x, [["#833030", 45, 440, 660, 4]]),
                ("HP bar 4/6 red", x, [["#c02020", 40, 465, 515, 18]]),
                ("HP bar 2/6 grey", x, [["#2a2f3a", 22, 465, 515, 6]]),
            ]
        ok, _ = shot(ctx, "phase8-slam", setup_slam, probes_slam,
                     state_fn=state_slam, fire=fire_slam, wait_fx=fx_slam,
                     settle_ms=SETTLE_MS + 400)
        all_ok = all_ok and ok

        # ---- 6. §29.1 Armored ABSORBS Aram magic (0 damage) ------------------
        def setup_absorb(page):
            page.evaluate("() => window.__SOM_TEST_API__.forceUnlock('aram')")
            page.keyboard.press("3")
            page.wait_for_timeout(250)
            page.evaluate("() => window.__SOM_TEST_API__.teleport(6560, 594, 0)")
        def fire_absorb(page):
            # Re-read the mini-boss RIGHT before firing — it patrols/charges
            # around its arena, so a stale position could send the shot into
            # empty air. Aram always stands 140px to its LEFT, facing right.
            e = FIND(page, "c1_2_miniboss")
            mx = (e["x"] + e["w"] / 2) if e else 6720
            page.evaluate(f"() => window.__SOM_TEST_API__.teleport({mx - 140}, 594, 0)")
            page.wait_for_timeout(120)              # grounded, facing right
            page.keyboard.press("J")              # magic shot toward it
        def fx_absorb(page):
            # impact completed: the shot is consumed AND the absorb burst
            # particles are live (count >= 4 — nothing else emits here).
            m = M(page)
            return len(m["projectiles"]) == 0 and m["particles"]["count"] >= 4
        def state_absorb(page):
            m = M(page)
            e = FIND(page, "c1_2_miniboss")
            if not e:
                return False, "armored mini-boss missing"
            if e["hp"] != 7:
                return False, f"hp {e['hp']} != 7 — magic damage leaked past §29.1!"
            if m["projectiles"]:
                return False, "magic shot still flying (impact not reached)"
            return True, "hp=7 after impact — magic ABSORBED (§29.1)"
        def probes_absorb(page):
            e = FIND(page, "c1_2_miniboss")
            x = e["x"] + e["w"] / 2 if e else 6700
            return [
                # by probe time the burst chips have faded to alpha ~0.5-0.8
                # over the dark sky — anchor on that blended purple.
                ("absorb burst (mid-fade)", x, [["#8e5bb8", 45, 480, 660, 2]]),
                ("boss HP bar (full)", x, [["#c02020", 40, 495, 550, 25]]),
            ]
        ok, _ = shot(ctx, "phase8-absorb", setup_absorb, probes_absorb,
                     state_fn=state_absorb, fire=fire_absorb, wait_fx=fx_absorb,
                     settle_ms=SETTLE_MS + 200)
        all_ok = all_ok and ok

        browser.close()
    print("ALL:", "PASS" if all_ok else "FAIL")
    return 0 if all_ok else 1


if __name__ == "__main__":
    sys.exit(main())
