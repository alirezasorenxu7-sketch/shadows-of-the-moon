#!/usr/bin/env python3
"""Phase 7 screenshot verification (SPEC §102.5, §96).

Captures the roster/gate proof shots through the SAME test instrumentation
the acceptance harness uses (§73). The §20.2 game-start tutorial plate
(4 s, bottom-center, alpha 0.72) and the §55 fog/vignette atmosphere blend
over the ground band, so character captures WAIT for the tutorial to
expire and use TOLERANT color ranges (atmosphere accounts for ~25-40%
luminance shift near the ground line; gates sit high, unblended).

  1. phase7-raha    — Raha idle at the 1-1 spawn: §18.2 armor + red tunic +
     scarf + helm/braid, §57 drop shadow + silhouette outline.
  2. phase7-aram    — Aram idle: §18.3 purple robe + trim, silver-white hair,
     floating orb with pulsing glow, glowing pupils.
  3. phase7-sara    — Sara regression with the new shadow + outline pass.
  4. phase7-barrier — the §50 magic barrier vault in 1-2 (purple wall).
  5. phase7-timedoor — the §50 time-locked door pocket in 1-3 (rune clock).
Server must already be running (§82).
"""
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
BASE_URL = "http://127.0.0.1:8000"
OUT = ROOT / "screenshots"

# In-page tolerant pixel probe: counts pixels within a per-channel tolerance
# of the wanted colors, in a vertical band around a world x.
PROBE = """(payload) => {
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

TUTORIAL_MS = 4600          # §20.2: 4 s + fade tail, wait it out


def shot(ctx, name, setup, checks, wait_boot=TUTORIAL_MS):
    page = ctx.new_page()
    page.goto(BASE_URL, wait_until="load", timeout=15000)
    page.wait_for_function("() => window.__SOM_BOOTED__ === true", timeout=5000)
    page.wait_for_function(
        "() => window.__SOM_METRICS__ && window.__SOM_METRICS__.renderCount > 8", timeout=5000)
    page.wait_for_timeout(wait_boot)     # §20.2 tutorial plate expired
    setup(page)
    page.wait_for_timeout(700)           # camera eases in; FX settle
    out = OUT / f"{name}-{int(time.time())}.png"
    page.screenshot(path=str(out))
    ok = True
    for label, world_x, colors in checks:
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

        # ---- Raha at spawn (upper body: above the fog's strong band) --------
        def setup_raha(page):
            page.evaluate("() => window.__SOM_TEST_API__.forceUnlock('raha')")
            page.keyboard.press("2")
            page.wait_for_timeout(250)
            page.evaluate("() => window.__SOM_TEST_API__.teleport(300, 594, 0)")
        ok, _ = shot(ctx, "phase7-raha", setup_raha, [
            ("armor", 300, [["#2a2a2a", 26, 560, 640, 60]]),
            ("red tunic", 300, [["#e63946", 45, 590, 640, 25]]),
            ("scarf", 300, [["#8a1f2a", 40, 570, 640, 12]]),
            ("helm/braid hair", 300, [["#241812", 30, 560, 600, 10]]),
        ])
        all_ok = all_ok and ok

        # ---- Aram at spawn ---------------------------------------------------
        def setup_aram(page):
            page.evaluate("() => window.__SOM_TEST_API__.forceUnlock('aram')")
            page.keyboard.press("3")
            page.wait_for_timeout(250)
            page.evaluate("() => window.__SOM_TEST_API__.teleport(300, 594, 0)")
        ok, _ = shot(ctx, "phase7-aram", setup_aram, [
            ("purple robe", 300, [["#9d4edd", 50, 570, 645, 40]]),
            ("silver hair", 300, [["#eee8ff", 60, 560, 605, 25]]),
            ("orb glow", 300, [["#c77dff", 55, 540, 640, 12]]),
        ])
        all_ok = all_ok and ok

        # ---- Sara regression -------------------------------------------------
        def setup_sara(page):
            page.evaluate("() => window.__SOM_TEST_API__.teleport(300, 594, 0)")
        ok, _ = shot(ctx, "phase7-sara", setup_sara, [
            ("blue tunic", 300, [["#4a9eff", 50, 590, 640, 30]]),
            ("blonde hair", 300, [["#e8d174", 55, 560, 605, 20]]),
        ])
        all_ok = all_ok and ok

        # ---- §50 magic barrier (1-2 vault, x 6810..6830 y 320..420) -----------
        def setup_barrier(page):
            page.evaluate("() => window.__SOM_TEST_API__.teleport(6700, 594, 0)")
        ok, _ = shot(ctx, "phase7-barrier", setup_barrier, [
            ("rune anchors", 6820, [["#c77dff", 40, 60, 520, 10]]),
        ])
        all_ok = all_ok and ok

        # ---- §50 time-locked door (1-3 tower top, x 9155..9179 y 240..340) ----
        def setup_door(page):
            page.evaluate("() => window.__SOM_TEST_API__.teleport(9080, 278, 0)")
        ok, _ = shot(ctx, "phase7-timedoor", setup_door, [
            ("stone slab", 9167, [["#2a2f3a", 20, 60, 500, 40]]),
            ("lintel band", 9167, [["#3a4050", 25, 60, 500, 12]]),
            ("rune clock ring", 9167, [["#c77dff", 40, 60, 520, 4]]),
        ])
        all_ok = all_ok and ok

        browser.close()
    print("ALL:", "PASS" if all_ok else "FAIL")
    return 0 if all_ok else 1


if __name__ == "__main__":
    sys.exit(main())
