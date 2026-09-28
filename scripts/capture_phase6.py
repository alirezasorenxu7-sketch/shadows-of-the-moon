#!/usr/bin/env python3
"""Phase 6 screenshot verification (SPEC §102.5, §96).

Captures two proof shots through the SAME test instrumentation the
acceptance harness uses (§73):
  1. phase6-spawn  — chapter 1-1 spawn: Act 1 canon sky (NO moon, stars
     only), ZOOM 1.25 window, x1.3 Sara silhouette, platform edge shadows.
  2. phase6-patroller — near c1_1_enemy_001: the §30 Patroller procedural
     art (armor cubes, red scarf, glowing eyes) on the zoomed ground.

The player is positioned with the test-mode teleport facility; production
rendering is untouched. Server must already be running (§82).
"""
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
BASE_URL = "http://127.0.0.1:8000"
OUT = ROOT / "screenshots"

TEST_INIT = """
window.__SOM_TEST__ = true;
"""

def main() -> int:
    OUT.mkdir(exist_ok=True)
    stamp = int(time.time())
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 1280, "height": 720})
        ctx.add_init_script(TEST_INIT)

        # ---- shot 1: spawn (Act 1 canon — no moon) --------------------------
        page = ctx.new_page()
        page.goto(BASE_URL, wait_until="load", timeout=15000)
        page.wait_for_function("() => window.__SOM_BOOTED__ === true", timeout=5000)
        page.wait_for_timeout(900)   # stars twinkle; camera settles
        out1 = OUT / f"phase6-spawn-{stamp}.png"
        page.screenshot(path=str(out1))
        print(f"saved {out1.relative_to(ROOT)}")

        # ---- shot 2: the patroller (teleport near c1_1_enemy_001) -----------
        page.evaluate("() => window.__SOM_TEST_API__.teleport(1180, 500, 0)")
        page.wait_for_timeout(1200)  # camera eases; patroller patrols in view
        out2 = OUT / f"phase6-patroller-{stamp}.png"
        page.screenshot(path=str(out2))
        print(f"saved {out2.relative_to(ROOT)}")

        m = page.evaluate("() => window.__SOM_METRICS__")
        enemies = [e for e in m["enemies"] if not e["dead"]]
        print(f"enemies alive: {[(e['id'], round(e['x']), e['state']) for e in enemies]}")
        print(f"player: x={m['player']['x']:.0f} y={m['player']['y']:.0f} "
              f"hp={m['player']['hp']} camera=({m['camera']['x']:.0f},{m['camera']['y']:.0f})")
        page.close()
        ctx.close()
        browser.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
