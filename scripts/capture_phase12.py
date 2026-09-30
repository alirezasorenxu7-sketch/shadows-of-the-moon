#!/usr/bin/env python3
"""Phase 12 screenshot verification (SPEC §102.5, §96) — the finale.

Captures proof shots through the SAME test instrumentation the acceptance
harness uses (§73). Teleports wait SETTLE_MS for the §53 camera easing.

  1. phase12-crossing   — 1-4's 300px Sara-only gap: void below the arc +
     the intro stone slab on the far side.
  2. phase12-bridge     — 2-3's elevated bridge decks over the gorge + the
     barred cell (§52.2 glimpse dressing).
  3. phase12-pouria     — 2-5 escape fight: Pouria's corruption body + torn
     red scarf pixels, hunting after the wake.
  4. phase12-chains     — 3-4 duel: shadow-chain weak points orbiting + the
     two-pool teaching bar.
  5. phase12-queen      — 3-5: the Queen's radiant robes + crown + the
     CLOSED moon gate's stone ring.
  6. phase12-choice     — the §52 choice overlay (DOM) with the third option
     correctly LOCKED on a non-true-ending run.
  7. phase12-moonrise   — after the choice: the risen moon disc + the OPEN
     white portal.
  8. phase12-victory    — touching the gate: victory screen (DOM) + §52.6
     stopped simulation.

Then a mechanics probe: the §52.2 non-lethal routing (lethal floors realHp
at 1 and locks him; Raha's slam breaks corruption).

Server must already be running (§82).
"""
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
BASE_URL = "http://127.0.0.1:8000"
OUT = ROOT / "screenshots"

WORLD_PROBE = """(payload) => {
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

SETTLE_MS = 1500


def ok_line(label, spec, got, minimum):
    good = got >= minimum
    print(f"  [{' ok ' if good else 'FAIL'}] {label}: {spec} -> {got} px (min {minimum})")
    return good


def main() -> int:
    OUT.mkdir(exist_ok=True)
    all_ok = True
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 1280, "height": 720})
        ctx.add_init_script("window.__SOM_TEST__ = true;")
        page = ctx.new_page()
        page.goto(BASE_URL, wait_until="load")
        page.wait_for_function("() => window.__SOM_BOOTED__ === true", timeout=8000)
        page.wait_for_function(
            "() => window.__SOM_METRICS__ && window.__SOM_METRICS__.renderCount > 5", timeout=5000)

        # ---- 1. The Crossing (1-4): the Sara-only gap + far stone ----------
        page.evaluate("() => window.__SOM_TEST_API__.teleport(11680, 594, 0)")
        page.wait_for_timeout(SETTLE_MS)
        # The gap is the ABSENCE of ground: no lit ground-edge tone may appear
        # across the crossing band (max-style check via a wide tolerance).
        counts = page.evaluate(WORLD_PROBE, [11700, [
            ['#181c24', 8, 700, 718, 0],       # ground-edge tone: must NOT appear
        ]])
        if counts[0] > 6:
            all_ok = False
            print(f"  [FAIL] 1-4 gap shows ground pixels ({counts[0]} px)")
        else:
            print(f"  [ ok ] 1-4 gap void (no ground edge, {counts[0]} px)")
        page.screenshot(path=str(OUT / f"phase12-crossing-{int(time.time())}.png"))

        # ---- 2. The Old Bridge (2-3): decks + the barred cell --------------
        page.evaluate("() => window.__SOM_TEST_API__.teleport(25680, 594, 0)")
        page.wait_for_timeout(SETTLE_MS)
        counts = page.evaluate(WORLD_PROBE, [25680, [
            ['#2e3852', 26, 120, 660, 60],      # the cell bars
            ['#05070f', 14, 680, 718, 60],      # ground void below the bridge span
        ]])
        all_ok &= ok_line("2-3 bars", '#2e3852', counts[0], 60)
        all_ok &= ok_line("2-3 span void", '#05070f', counts[1], 60)
        page.screenshot(path=str(OUT / f"phase12-bridge-{int(time.time())}.png"))

        # ---- 3. Pouria escape (2-5): he wakes and hunts --------------------
        page.evaluate("() => window.__SOM_TEST_API__.teleport(31250, 594, 0)")
        page.wait_for_timeout(1400)             # wake cinematic + pursuit starts
        m = page.evaluate("() => window.__SOM_METRICS__")
        pouria = next((e for e in m["enemies"] if e["id"] == "c2_5_pouria"), None)
        if pouria is None or pouria["mode"] != "hunting":
            all_ok = False
            print(f"  [FAIL] 2-5 pouria mode = {pouria and pouria['mode']} (expected hunting)")
        else:
            counts = page.evaluate(WORLD_PROBE, [pouria["x"] + pouria["w"] / 2, [
                ['#2a1e38', 20, 100, 700, 120],   # corruption torso
                ['#8a1010', 26, 100, 700, 24],    # the torn red scarf
            ]])
            all_ok &= ok_line("2-5 pouria body", '#2a1e38', counts[0], 120)
            all_ok &= ok_line("2-5 pouria scarf", '#8a1010', counts[1], 24)
        page.screenshot(path=str(OUT / f"phase12-pouria-{int(time.time())}.png"))

        # ---- 4. The Long Hall (3-4): chains + the two-pool bar -------------
        # Stand on the center perch ABOVE the duel: Pouria is ground-bound and
        # the chains are harmless on contact — a safe, steady camera frame for
        # the orbiting weak points (player HP from earlier shots is irrelevant).
        page.evaluate("() => window.__SOM_TEST_API__.teleport(45820, 368, 0)")
        page.wait_for_timeout(2400)             # wake + orbit
        m = page.evaluate("() => window.__SOM_METRICS__")
        chains = [e for e in m["enemies"] if e["id"].startswith("c3_4_pouria_chain")]
        live = [c for c in chains if not c["dead"]]
        if len(live) < 3:
            all_ok = False
            print(f"  [FAIL] 3-4 live chains = {len(live)} (expected 3)")
        else:
            # Position + pixel scan in ONE evaluate: the chains orbit, so the
            # probe must center on the SAME frame it reads.
            chain_px = page.evaluate("""() => {
              const M = window.__SOM_METRICS__;
              const c0 = M.enemies.find(e => e.id.startsWith('c3_4_pouria_chain') && !e.dead);
              const cam = M.camera;
              const cv = document.getElementById('game');
              const sx = Math.round((c0.x + c0.w / 2 - cam.x) * (cv.width / 1024));
              const sy = Math.round((c0.y + c0.h / 2 - cam.y) * 1.25);
              const img = cv.getContext('2d').getImageData(
                Math.max(0, sx - 14), Math.max(0, sy - 26), 28, 52);
              const d = img.data;
              let n = 0;
              const samples = [];
              for (let i = 0; i < d.length; i += 4) {
                const dr = Math.abs(d[i] - 30), dg = Math.abs(d[i + 1] - 24),
                      db = Math.abs(d[i + 2] - 43);
                if (dr <= 10 && dg <= 10 && db <= 10) n += 1;
              }
              for (let p = 600; p < d.length && samples.length < 8; p += 160) {
                samples.push([d[p], d[p + 1], d[p + 2]]);
              }
              window.__chainDbg = { sx, sy, n, samples,
                chain: [Math.round(c0.x), Math.round(c0.y)],
                cam: [Math.round(cam.x), Math.round(cam.y)] };
              return n;
            }""")
            dbg = page.evaluate("() => window.__chainDbg")
            if chain_px < 30:
                print(f"       [dbg] chain@{dbg['chain']} cam@{dbg['cam']} "
                      f"screen=({dbg['sx']},{dbg['sy']})")
            if chain_px < 30:
                all_ok = False
                print(f"  [FAIL] 3-4 chain pixels {chain_px} (min 30)")
            else:
                print(f"  [ ok ] 3-4 chain links ({chain_px} px)")
        pouria = next((e for e in m["enemies"] if e["id"] == "c3_4_pouria"), None)
        if pouria is None or pouria["corruptionHp"] != 12:
            all_ok = False
            print(f"  [FAIL] 3-4 corruption pool = {pouria and pouria['corruptionHp']}")
        else:
            print("  [ ok ] 3-4 corruption pool 12 + chains orbiting")
        page.screenshot(path=str(OUT / f"phase12-chains-{int(time.time())}.png"))

        # ---- 5. The Queen (3-5) + the CLOSED moon gate ----------------------
        # Stand near the gate: the queen wakes (deep-entry rule) and approaches
        # while the camera keeps BOTH her and the closed gate in frame.
        page.evaluate("() => window.__SOM_TEST_API__.teleport(49700, 594, 0)")
        page.wait_for_timeout(1600)
        m = page.evaluate("() => window.__SOM_METRICS__")
        queen = next((e for e in m["enemies"] if e["id"] == "c3_5_queen"), None)
        if queen is None or queen["mode"] != "active":
            all_ok = False
            print(f"  [FAIL] 3-5 queen mode = {queen and queen['mode']}")
        else:
            counts = page.evaluate(WORLD_PROBE, [queen["x"] + queen["w"] / 2, [
                ['#dce8f8', 26, 100, 700, 120],   # radiant robes
                ['#d8b96a', 20, 100, 700, 18],    # the crown of grief
            ]])
            all_ok &= ok_line("3-5 queen robes", '#dce8f8', counts[0], 120)
            all_ok &= ok_line("3-5 queen crown", '#d8b96a', counts[1], 18)
        gate = page.evaluate("() => window.__SOM_METRICS__.moonGate")
        if not gate or gate["state"] != "closed":
            all_ok = False
            print(f"  [FAIL] moon gate = {gate}")
        else:
            counts = page.evaluate(WORLD_PROBE, [gate["x"], [
                ['#2a2f3a', 24, 380, 720, 140],   # sealed stone ring
            ]])
            all_ok &= ok_line("3-5 gate ring (closed)", '#2a2f3a', counts[0], 140)
        page.screenshot(path=str(OUT / f"phase12-queen-{int(time.time())}.png"))

        # ---- 6. The choice (after burning all three pools) -------------------
        for _ in range(3):
            page.evaluate("() => window.__SOM_TEST_API__.forceKill('c3_5_queen')")
            page.wait_for_timeout(2100)
        page.wait_for_function(
            "() => window.__SOM_METRICS__.choice.active === true", timeout=8000)
        if not page.locator("#choice-overlay").is_visible():
            all_ok = False
            print("  [FAIL] choice overlay not visible")
        if page.locator("#btn-choice-sacrifice").is_visible():
            all_ok = False
            print("  [FAIL] third option visible on a non-true-ending run (§52)")
        else:
            print("  [ ok ] 6: choice overlay up, third option locked (§52)")
        page.screenshot(path=str(OUT / f"phase12-choice-{int(time.time())}.png"))

        # ---- 7. Moon rise + the OPEN gate ------------------------------------
        page.click("#btn-choice-leave")
        page.wait_for_function(
            "() => window.__SOM_METRICS__.moonGate.state === 'open'", timeout=12000)
        # Stand NEAR the gate (not on it): the camera eases in while the sim
        # still runs, THEN the portal is probed before the victory freeze.
        page.evaluate("() => window.__SOM_TEST_API__.teleport(49700, 594, 0)")
        page.wait_for_timeout(SETTLE_MS)
        counts = page.evaluate(WORLD_PROBE, [49860, [
            ['#f4f8ff', 22, 380, 720, 900],     # the open white portal
        ]])
        all_ok &= ok_line("3-5 open portal", '#f4f8ff', counts[0], 900)
        m = page.evaluate("() => window.__SOM_METRICS__")
        if m["moonRiseT"] < 5.0:
            all_ok = False
            print(f"  [FAIL] moonRiseT = {m['moonRiseT']} (moon not risen)")
        else:
            print(f"  [ ok ] 7: moon risen ({m['moonRiseT']:.1f}s) + gate open")
        page.screenshot(path=str(OUT / f"phase12-moonrise-{int(time.time())}.png"))

        # ---- 8. Victory: touch the gate --------------------------------------
        page.evaluate("() => window.__SOM_TEST_API__.teleport(49860, 594, 0)")
        page.wait_for_function(
            "() => window.__SOM_METRICS__.screen === 'victory'", timeout=6000)
        if not page.locator("#victory-screen").is_visible():
            all_ok = False
            print("  [FAIL] victory screen not visible")
        else:
            print("  [ ok ] 8: victory screen (§52.6 sim stopped)")
        page.screenshot(path=str(OUT / f"phase12-victory-{int(time.time())}.png"))

        # ---- Mechanics probe: §52.2 non-lethal routing ------------------------
        page.evaluate("() => location.reload()")
        page.wait_for_function("() => window.__SOM_BOOTED__ === true", timeout=8000)
        page.wait_for_function(
            "() => window.__SOM_METRICS__ && window.__SOM_METRICS__.renderCount > 5", timeout=5000)
        page.evaluate("() => window.__SOM_TEST_API__.forceUnlock('raha')")
        page.evaluate("() => window.__SOM_TEST_API__.forceUnlock('aram')")
        page.evaluate("() => window.__SOM_TEST_API__.teleport(45855, 594, 0)")
        page.wait_for_timeout(350)             # wake (short exposure — no death)

        # lethal: forceKill routes 999 damage into realHp -> floors at 1 + locks
        page.evaluate("() => window.__SOM_TEST_API__.forceKill('c3_4_pouria')")
        page.wait_for_timeout(250)
        m = page.evaluate("() => window.__SOM_METRICS__")
        p = next((e for e in m["enemies"] if e["id"] == "c3_4_pouria"), None)
        if not p or p["realHp"] != 1 or not p["invulnerable"] or p["corruptionHp"] != 12:
            all_ok = False
            print(f"  [FAIL] lethal routing: realHp={p and p['realHp']} invuln={p and p['invulnerable']}"
                  f" corruption={p and p['corruptionHp']} (expected 1/true/12)")
        else:
            print("  [ ok ] lethal floors realHp at 1 and locks him (§52.2 fail-safe)")

        # non-lethal: Raha slam -> corruption -2, lock clears
        page.keyboard.press("2")
        page.wait_for_timeout(150)
        page.keyboard.down("K")
        page.wait_for_timeout(60)
        page.keyboard.up("K")
        page.wait_for_timeout(500)
        m = page.evaluate("() => window.__SOM_METRICS__")
        p = next((e for e in m["enemies"] if e["id"] == "c3_4_pouria"), None)
        # The slam breaks corruption armor (-2) and may also shatter orbiting
        # chains caught in the 90px impact (-3 each) — both non-lethal §52.2.
        if (not p or p["corruptionHp"] >= 12 or p["corruptionHp"] < 4
                or p["invulnerable"] or p["realHp"] != 1):
            all_ok = False
            print(f"  [FAIL] slam routing: corruption={p and p['corruptionHp']} "
                  f"invuln={p and p['invulnerable']} realHp={p and p['realHp']} "
                  f"(expected 4..10 / false / 1)")
        else:
            print(f"  [ ok ] Raha slam routed to corruption 12 -> {p['corruptionHp']} "
                  f"(+ chains shattered in the impact) and cleared the lock (§52.2)")

        browser.close()

    print()
    print("RESULT:", "PASS" if all_ok else "FAIL")
    return 0 if all_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
