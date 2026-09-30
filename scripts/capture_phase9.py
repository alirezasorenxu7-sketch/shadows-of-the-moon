#!/usr/bin/env python3
"""Phase 9 screenshot verification (SPEC §102.5, §96).

Captures the collectible/HUD/screen proof shots through the SAME test
instrumentation the acceptance harness uses (§73). Coins near the ground
band sit under the §55 fog/vignette blend (~25-40% luminance shift), so
probes use TOLERANT color ranges. The §53 camera eases to a teleport in
~1.2 s, so every teleport waits SETTLE_MS before probing.

  1. phase9-title    — production title screen: start screen DOM + world
     backdrop (ground band + spawn-area framing).
  2. phase9-coins    — common coins on the 1-1 tutorial stretch + HUD
     (HP bar, coin glyph); near-miss teleport proves the pickup radius
     discipline (no collection, coins render).
  3. phase9-crystal  — the 1-1 moon crystal + the high-bonus rare coin.
  4. phase9-death    — organic fall death → §65 death screen with stats.
  5. phase9-victory  — §73 forceVictory → §65 victory screen.

Also asserts the §15 locked-selector DOM state (greyed + lock classes).
Server must already be running (§82).
"""
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

# Screen-space probe (HUD regions are canvas-logical, not world).
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

        # ---- 1. production title screen ---------------------------------
        page = browser.new_page(viewport={"width": 1280, "height": 720})
        page.goto(BASE_URL, wait_until="load", timeout=15000)
        page.wait_for_function("() => window.__SOM_BOOTED__ === true", timeout=5000)
        page.wait_for_timeout(700)
        ok = dom_check("title: start screen visible",
                       page.locator("#start-screen").is_visible())
        ok = dom_check("title: Start Journey button visible",
                       page.locator("#btn-start").is_visible()) and ok
        ok = dom_check("title: story lines present",
                       "Three strangers" in page.locator("#start-screen").inner_text()) and ok
        ok = dom_check("title: gameplay controls hidden",
                       not page.locator("#btn-left").is_visible()) and ok
        # world backdrop: the 1-1 ground band under the title plate
        counts = page.evaluate(SCREEN_PROBE, [["#0a0d14", 14, [300, 660, 900, 700]]])
        ok = dom_check(f"title: world backdrop ground band ({counts[0]} px)",
                       counts[0] >= 1200) and ok
        page.screenshot(path=str(OUT / f"phase9-title-{int(time.time())}.png"))
        page.close()
        all_ok = all_ok and ok

        # ---- gameplay shots (test instrumentation, §73) ------------------
        ctx = browser.new_context(viewport={"width": 1280, "height": 720})
        ctx.add_init_script("window.__SOM_TEST__ = true;")

        # ---- 2. common coins + HUD + locked selectors -------------------
        # near-miss: 42px from coin 001 — outside the pickup radius
        page = gameplay_page(ctx)
        page.evaluate("() => window.__SOM_TEST_API__.teleport(380, 594)")
        page.wait_for_timeout(SETTLE_MS)
        m = page.evaluate("() => window.__SOM_METRICS__")
        ok = dom_check("coins: near-miss did NOT collect (currentRunCoins 0)",
                       m["currentRunCoins"] == 0)
        ok = dom_check("coins: c1_1_coin_001 still active",
                       any(c["id"] == "c1_1_coin_001" for c in m["collectibles"])) and ok
        ok = dom_check(
            "locked-selectors: raha/aram greyed, sara current",
            page.evaluate(
                "() => document.getElementById('btn-select-raha').classList.contains('locked')"
                " && document.getElementById('btn-select-aram').classList.contains('locked')"
                " && document.getElementById('btn-select-sara').classList.contains('current')")) and ok
        ok = run_probes(page,
            [("coin c1_1_coin_001 (gold face, fog-blended)", 460,
              [["#c9a227", 45, 570, 645, 20]]),
             ("coin c1_1_coin_002 (gold face, fog-blended)", 620,
              [["#c9a227", 45, 570, 645, 20]]),
             ("coin c1_1_coin_003 on stair (gold face)", 770,
              [["#c9a227", 45, 480, 560, 15]])],
            [("HUD: HP bar gradient (sara blue)",
              [["#4a9eff", 60, [18, 38, 168, 48], 300]]),
             ("HUD: coin glyph (gold disc)",
              [["#c9a227", 45, [1072, 16, 1092, 34], 20]])]) and ok
        page.screenshot(path=str(OUT / f"phase9-coins-{int(time.time())}.png"))
        page.close()
        all_ok = all_ok and ok

        # ---- 3. moon crystal + rare coin --------------------------------
        page = gameplay_page(ctx)
        page.evaluate("() => window.__SOM_TEST_API__.teleport(1600, 594)")
        page.wait_for_timeout(SETTLE_MS)
        # Screen Y for grounded play = (worldY - 131.2) * 1.25 (camera rest:
        # groundY 656 - CAMERA_REST_GROUND_SCREEN_Y/1.25). Crystal at world
        # y 430 -> screen ~373; rare coin at world y 290 -> screen ~199.
        ok = run_probes(page,
            [("moon crystal body + glow (purple)", 1620,
              [["#c77dff", 42, 335, 415, 60]]),
             ("moon crystal bright core facet (alpha-blended)", 1620,
              [["#d6adff", 34, 340, 395, 20]]),
             ("rare coin c1_1_coin_006 (pale silver-blue)", 1800,
              [["#aebfdd", 40, 170, 230, 15]])],
            [])
        page.screenshot(path=str(OUT / f"phase9-crystal-{int(time.time())}.png"))
        page.close()
        all_ok = all_ok and ok

        # ---- 4. death screen (organic fall death) ------------------------
        page = gameplay_page(ctx, wait_boot=300)
        page.evaluate("() => window.__SOM_TEST_API__.teleport(2700, 1200)")
        page.wait_for_function(
            "() => window.__SOM_METRICS__ && window.__SOM_METRICS__.screen === 'dead'",
            timeout=5000)
        page.wait_for_timeout(400)
        ok = dom_check("death: screen visible",
                       page.locator("#death-screen").is_visible())
        stats = page.locator("#death-stats").inner_text()
        ok = dom_check("death: stats show Score/Kills/Coins/Rank",
                       all(k in stats for k in ("Score", "Kills", "Coins", "Rank"))) and ok
        ok = dom_check("death: 'Darkness prevailed...' headline",
                       "Darkness prevailed" in page.locator("#death-screen").inner_text()) and ok
        page.screenshot(path=str(OUT / f"phase9-death-{int(time.time())}.png"))
        page.close()
        all_ok = all_ok and ok

        # ---- 5. victory screen (§73 forceVictory) -------------------------
        page = gameplay_page(ctx, wait_boot=300)
        page.evaluate("() => window.__SOM_TEST_API__.forceVictory()")
        page.wait_for_function(
            "() => window.__SOM_METRICS__ && window.__SOM_METRICS__.screen === 'victory'",
            timeout=5000)
        page.wait_for_timeout(400)
        ok = dom_check("victory: screen visible",
                       page.locator("#victory-screen").is_visible())
        ok = dom_check("victory: 'The Moon Has Returned' headline",
                       "The Moon Has Returned" in page.locator("#victory-screen").inner_text()) and ok
        m = page.evaluate("() => window.__SOM_METRICS__")
        ok = dom_check(f"victory: +500 completion bonus (score {m['score']})",
                       m["score"] == 500) and ok
        page.screenshot(path=str(OUT / f"phase9-victory-{int(time.time())}.png"))
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
