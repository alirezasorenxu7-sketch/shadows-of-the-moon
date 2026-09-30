#!/usr/bin/env python3
"""Phase 11 screenshot verification (SPEC §102.5, §96) — storytelling,
checkpoints, adaptive difficulty.

Captures proof shots through the SAME test instrumentation the acceptance
harness uses (§73). The §53 camera eases to a teleport in ~1.2 s, so
teleports wait SETTLE_MS before probing. Blended plates shift with the
world behind them, so probes use TOLERANT ranges (phase-10 precedent).

  1. phase11-inscription   — §67 intro stone (world prop) + active plate
     hairline + metrics.story.inscription.
  2. phase11-flashback     — §67 2 s black-bg/white-text window (trigger at
     the 1-1 dead zone) + metrics latch.
  3. phase11-npc-statue    — §68 statue prop (Sara near: NO prompt — the
     Aram-only rule).
  4. phase11-npc-dialogue  — §68 Aram + prompt + J consumed AS interaction
     (no projectile) + 5 s dialogue plate.
  5. phase11-cinematic     — §67 unlock cinematic: letterbox bars + title
     (forceUnlock raha — the same path the chapter-entry rule uses).
  6. phase11-quip          — §67 authored switch quip above the character.
  7. phase11-respawn       — §45 checkpoint respawn: back at the chapter
     start, full HP, playing, enemies reset, streak counted.

Server must already be running (§82).
"""
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
  const specs = payload[1];      // [hex, tol, minY, maxY], ...
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

# Screen-space probe (canvas-logical coordinates, dpr 1 in headless).
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
        ctx = browser.new_context(viewport={"width": 1280, "height": 720})
        ctx.add_init_script("window.__SOM_TEST__ = true;")

        # ---- 1. §67 inscription stone + plate ------------------------------
        print("shot 1: inscription")
        page = gameplay_page(ctx)
        page.evaluate("() => window.__SOM_TEST_API__.teleport(450, 594)")
        page.wait_for_timeout(700)           # plate fade-in (0.35 s)
        m = page.evaluate("() => window.__SOM_METRICS__")
        ok = dom_check("story.inscription active (intro stone)",
                       bool(m["story"]["inscription"])
                       and "forest of Midnight" in (m["story"]["inscription"] or ""))
        ok = run_probes(page, [],
            [("inscription plate hairline (cyan blend)",
              [["#546880", 40, [340, 539, 940, 545], 200]])]) and ok
        page.screenshot(path=str(OUT / f"phase11-inscription-{int(time.time())}.png"))
        # Step out of range and let the ~5 s plate expire: the stone then
        # renders clean (no plate band, no active halo veil) for the prop
        # probes — the plate rect (rows 540..596) covers the cap edge.
        page.evaluate("() => window.__SOM_TEST_API__.teleport(750, 594)")
        page.wait_for_function(
            "() => window.__SOM_METRICS__.story.inscription === null", timeout=8000)
        page.wait_for_timeout(SETTLE_MS)
        ok = run_probes(page,
            [("inscription stone slab", 450,
              [["#232b3d", 14, 600, 650, 700],
               ["#4a5878", 18, 578, 588, 40]])],
            []) and ok
        page.close()
        all_ok = all_ok and ok

        # ---- 2. §67 flashback window ---------------------------------------
        print("shot 2: flashback")
        page = gameplay_page(ctx)
        page.evaluate("() => window.__SOM_TEST_API__.teleport(1880, 594)")
        page.wait_for_timeout(500)           # mid-window (fade-in 0.22 s)
        m = page.evaluate("() => window.__SOM_METRICS__")
        ok = dom_check("story.flashback active (once per run)",
                       bool(m["story"]["flashback"]))
        ok = run_probes(page, [],
            [("flashback black window",
              [["#050505", 12, [200, 100, 1080, 620], 280000]]),
             ("flashback white text",
              [["#ffffff", 55, [300, 300, 980, 420], 60]])]) and ok
        page.screenshot(path=str(OUT / f"phase11-flashback-{int(time.time())}.png"))
        page.close()
        all_ok = all_ok and ok

        # ---- 3. §68 NPC statue (Sara near: NO prompt) ----------------------
        print("shot 3: NPC statue")
        page = gameplay_page(ctx)
        page.evaluate("() => window.__SOM_TEST_API__.teleport(1968, 594)")
        page.wait_for_timeout(SETTLE_MS)
        m = page.evaluate("() => window.__SOM_METRICS__")
        ok = dom_check("Sara near the statue: no prompt (§68 Aram-only)",
                       m["player"]["character"] == "sara"
                       and m["story"]["npcPrompt"] is None)
        ok = run_probes(page,
            [("NPC statue robe", 2000,
              [["#262f45", 16, 584, 648, 400]])],
            []) and ok
        page.screenshot(path=str(OUT / f"phase11-npc-statue-{int(time.time())}.png"))
        page.close()
        all_ok = all_ok and ok

        # ---- 4. §68 Aram interaction: prompt + J + dialogue ----------------
        print("shot 4: NPC dialogue")
        page = gameplay_page(ctx)
        page.evaluate("() => window.__SOM_TEST_API__.forceUnlock('aram')")
        page.keyboard.press("Digit3")
        page.wait_for_function(
            "() => window.__SOM_METRICS__.player.character === 'aram'", timeout=5000)
        page.evaluate("() => window.__SOM_TEST_API__.teleport(1975, 594)")
        page.wait_for_timeout(400)
        m = page.evaluate("() => window.__SOM_METRICS__")
        ok = dom_check("npcPrompt live for Aram",
                       m["story"]["npcPrompt"] == "c1_1_npc_001")
        projs0 = len(m["projectiles"])
        page.keyboard.press("KeyJ")          # §68: interaction, NOT an attack
        page.wait_for_function(
            "() => window.__SOM_METRICS__.story && window.__SOM_METRICS__.story.npcDialogue",
            timeout=5000)
        page.wait_for_timeout(300)
        m = page.evaluate("() => window.__SOM_METRICS__")
        ok = dom_check("J consumed as interaction (no projectile fired)",
                       len(m["projectiles"]) == projs0) and ok
        ok = dom_check("dialogue text + once-per-run latch",
                       bool(m["story"]["npcDialogue"])
                       and "weeping warden" in (m["story"]["npcDialogue"] or "")
                       and m["story"]["npcInteracted"] == ["c1_1_npc_001"]) and ok
        ok = run_probes(page, [],
            [("NPC dialogue plate (stone-tone blend)",
              [["#2a2438", 46, [340, 600, 940, 636], 300]])]) and ok
        page.screenshot(path=str(OUT / f"phase11-npc-dialogue-{int(time.time())}.png"))
        page.close()
        all_ok = all_ok and ok

        # ---- 5. §67 unlock cinematic (letterbox) ----------------------------
        print("shot 5: unlock cinematic")
        page = gameplay_page(ctx)
        page.evaluate("() => window.__SOM_TEST_API__.forceUnlock('raha')")
        page.wait_for_timeout(700)           # bars eased in (0.3 s fade)
        m = page.evaluate("() => window.__SOM_METRICS__")
        ok = dom_check("cinematic live (RAHA title)",
                       m["story"]["cinematic"] == "RAHA — THE WALL OF THE FOREST")
        ok = run_probes(page, [],
            [("cinematic top letterbox bar",
              [["#05060a", 10, [100, 10, 1180, 60], 5000]]),
             ("cinematic bottom letterbox bar",
              [["#05060a", 10, [100, 660, 1180, 710], 5000]]),
             ("cinematic title text (gold)",
              [["#d8b96a", 45, [400, 285, 880, 308], 40]])]) and ok
        page.screenshot(path=str(OUT / f"phase11-cinematic-{int(time.time())}.png"))
        page.close()
        all_ok = all_ok and ok

        # ---- 6. §67 switch quip ----------------------------------------------
        print("shot 6: switch quip")
        page = gameplay_page(ctx)
        page.evaluate("() => window.__SOM_TEST_API__.forceUnlock('raha')")
        page.keyboard.press("Digit2")        # sara -> raha
        page.wait_for_function(
            "() => window.__SOM_METRICS__.player.character === 'raha'", timeout=5000)
        page.wait_for_timeout(250)           # quip fade-in (0.2 s)
        m = page.evaluate("() => window.__SOM_METRICS__")
        ok = dom_check("authored quip line (deterministic first Raha quip)",
                       m["story"]["quip"] == 'Raha: "Make room."')
        ok = run_probes(page, [],
            [("quip text above the character",
              [["#e8e2d2", 55, [312, 500, 712, 640], 25]])]) and ok
        page.screenshot(path=str(OUT / f"phase11-quip-{int(time.time())}.png"))
        page.close()
        all_ok = all_ok and ok

        # ---- 7. §45 checkpoint respawn ---------------------------------------
        print("shot 7: checkpoint respawn")
        page = gameplay_page(ctx)
        sw0 = page.evaluate("() => window.__SOM_METRICS__.saveWrites")
        page.evaluate("() => window.__SOM_TEST_API__.teleport(2550, 1200, 0)")
        page.wait_for_function(
            "() => window.__SOM_METRICS__.respawnCount === 1", timeout=6000)
        page.wait_for_timeout(400)           # camera snap + settle
        m = page.evaluate("() => window.__SOM_METRICS__")
        p = m["player"]
        ok = dom_check("respawned at the 1-1 checkpoint",
                       abs(p["x"] - 300) <= 1 and abs(p["y"] - 594) <= 1)
        ok = dom_check("HP restored / screen playing / streak 1",
                       p["hp"] == 5 and m["screen"] == "playing"
                       and m["actDeathStreak"] == 1) and ok
        ok = dom_check("no localStorage write on respawn",
                       m["saveWrites"] == sw0) and ok
        ok = dom_check("live 1-1 enemies reset (defeated filter intact)",
                       any(e["id"] == "c1_1_enemy_002" for e in m["enemies"])) and ok
        page.screenshot(path=str(OUT / f"phase11-respawn-{int(time.time())}.png"))
        page.close()
        all_ok = all_ok and ok

        browser.close()

    print()
    if all_ok:
        print("PHASE 11 SCREENSHOT AUDIT: ALL PASS")
        return 0
    print("PHASE 11 SCREENSHOT AUDIT: FAILURES PRESENT")
    return 1


if __name__ == "__main__":
    sys_exit = main()
    raise SystemExit(sys_exit)
