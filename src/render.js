// Shadows of the Moon — procedural renderer (SPEC §7, §53, §55, §57, §78).
// Canvas 2D only. Logical 1280x720, strict 16:9 contain scaling — X and Y
// are NEVER stretched independently; letterboxing is allowed. Touch
// coordinates map through the SAME transform as rendering (§7):
// logical = (client - renderOffset) / scale. effectiveDPR = min(dpr, 2);
// imageSmoothingEnabled = false, re-asserted after every backing-store
// resize. shadowBlur is reserved for enemy eyes only (§30, §78) — this
// module never uses it. NO gameplay logic in rendering (§70).
// Scene: sky gradient, deterministic twinkling stars + dark clouds (§55
// layer 1), moon with blue-white halo (layer 2), gothic castle silhouette
// with sharp spires and flickering orange windows (layer 3), silhouetted
// trees + ruined pillars (layer 4), the world itself (platforms, procedural
// Sara §18.1 with §57 squash/stretch; Raha/Aram placeholder until Phase 7),
// foreground grass (layer 5), then bottom fog + dark vignette + moon rays
// atmosphere. The camera state (§53) lives on the game object and is only
// READ here — rendering never moves it. All layer art is authored rects,
// built once at module init (deterministic formulas, no Math.random §72,
// zero per-frame allocation §78).
import {
  LOGICAL_W,
  LOGICAL_H,
  MAX_DPR,
  SKY_TOP,
  SKY_MID,
  SKY_LOW,
  GROUND_FILL,
  GROUND_EDGE,
  CHARACTER_COLORS,
  STAR_TONE,
  MOON_COLOR,
  CLOUD_TONE,
  CASTLE_TONE,
  CASTLE_WINDOW,
  CASTLE_WINDOW_BRIGHT,
  TREE_TONE,
  PILLAR_TONE,
  GRASS_TONE,
  PARALLAX_STARS,
  PARALLAX_MOON,
  PARALLAX_CASTLE,
  PARALLAX_TREES,
  PARALLAX_GRASS,
  SARA_PALETTE,
  SQUASH_DURATION,
  SQUASH_JUMP_Y,
  SQUASH_JUMP_X,
  SQUASH_LAND_Y,
  SQUASH_LAND_X,
  ANIM_IDLE_SPEED,
  ANIM_IDLE_BOB,
  ANIM_HAIR_SWAY,
  ANIM_RUN_CYCLE,
  ANIM_HAIR_RISE,
  ANIM_HAIR_TRAIL,
} from './constants.js';

// Deterministic starfield: pure authored formula, no randomness (§72).
const STARS = [];
for (let i = 0; i < 90; i += 1) {
  STARS.push({
    x: (i * 173 + 59) % LOGICAL_W,
    y: ((i * 97 + 29) % 430) + 16,
    s: i % 5 === 0 ? 2.4 : 1.4,
    tw: i * 1.7,
  });
}

// ---------------------------------------------------------------------------
// Environment layer data (SPEC §55 — Phase 4, recomposed for the 15-chapter
// ~50000px world in Phase 5). Everything below is authored once at module
// init: deterministic formulas only, rect-only art, no per-frame allocation.
// The parallax SYSTEM is unchanged (§55 locked factors); the landmark
// layer-space anchors are recomposed for the amended world (camX 0..48720):
//   moon   (factor 0.15) drifts from screen 1000 down to MOON_HOLD_X 400
//          during the opening chapters (rate exactly 1000 − 0.15·camX,
//          pixel-verified in Phase 4), then rides at 400 — ALWAYS visible
//          for the whole journey (never culled).
//   castle (factor 0.30) at layer x 15016 — enters ~camX 45,800 (chapter
//          3-4's final stretch, the castle approach) and at the journey's
//          end (camX 48720) sits at screen 400 — exactly under the moon.
//   tower  (factor 0.30) at layer x 700 — the broken distant tower stays a
//          spawn-area foreshadow (visible camX 0..~2333).
// ---------------------------------------------------------------------------
function mod(a, n) { return a - n * Math.floor(a / n); }

// Crisp rect-strip disc raster (matches the rect-authored art language; no
// arcs, no shadowBlur — §78). Strips are 4px tall, symmetric about center.
function buildDiscStrips(r) {
  const strips = [];
  for (let y = -r; y < r; y += 4) {
    const cy = y + 2;
    const half = Math.sqrt(Math.max(0, r * r - cy * cy));
    strips.push({ y, w: Math.floor(half) * 2 });
  }
  return strips;
}

const MOON_LAYER_X = 1000;              // layer-space x (see header note)
const MOON_HOLD_X = 400;                // screen x the moon rides after the opening drift
const MOON_Y = 120;                     // screen-space center at rest
const MOON_STRIPS = buildDiscStrips(38); // 76px moon disc
const HALO_INNER = buildDiscStrips(54);  // blue-white halo shells
const HALO_OUTER = buildDiscStrips(72);
const MOON_CRATERS = [
  { x: -18, y: -14, w: 9, h: 7 }, { x: 6, y: -22, w: 7, h: 6 },
  { x: 12, y: 4, w: 10, h: 8 }, { x: -8, y: 12, w: 6, h: 5 },
];
const MOON_CRATER_TONE = '#c9d5ec';     // authored: a step darker than the disc

// Dark cloud silhouettes, 1600px-periodic, occluding stars (layer 1).
const CLOUD_PERIOD = 1600;
const CLOUDS = [
  { x: 120, y: 54, w: 300, h: 18 },
  { x: 520, y: 130, w: 240, h: 14 },
  { x: 860, y: 82, w: 380, h: 22 },
  { x: 1240, y: 176, w: 210, h: 12 },
];

// Gothic castle (layer 3). Geometry is relative to the castle origin;
// heights rise from the base line CASTLE_BASE_Y. Windows measure their y up
// from the base. The spires are stepped shrinking rects ending in a narrow
// tall tip — “sharp spires” in the rect art language.
const CASTLE_LAYER_X = 15016;           // main mass (aligns under the moon at the journey's end)
const CASTLE_TOWER_LAYER_X = 700;       // distant broken tower (early foreshadow)
const CASTLE_BASE_Y = 560;              // screen-space base at rest
const CASTLE_BODIES = [
  { x: 0, w: 300, h: 160 },             // curtain wall
  { x: 10, w: 64, h: 230 },             // left tower
  { x: 118, w: 72, h: 280 },            // central keep (tallest)
  { x: 220, w: 64, h: 210 },            // right tower
];
const CASTLE_SPIRES = [
  { x: 26, w: 56, base: 230 },          // left tower spire
  { x: 134, w: 64, base: 280 },         // keep spire
  { x: 236, w: 56, base: 210 },         // right tower spire
];
const CASTLE_WINDOWS = [
  { x: 30, y: 120 }, { x: 44, y: 168 }, { x: 26, y: 196 },
  { x: 140, y: 90 }, { x: 152, y: 138 }, { x: 136, y: 186 }, { x: 160, y: 210 },
  { x: 240, y: 110 }, { x: 252, y: 158 }, { x: 236, y: 190 },
  { x: 90, y: 128 }, { x: 200, y: 132 },
];

// Tree + ruined-pillar silhouettes (layer 4), 420px-periodic. Per-tile
// variants come from a deterministic arithmetic hash of the tile index —
// forest with clearings, no two-adjacent-tree repetition patterns.
const TREE_PERIOD = 420;
const TREE_BASE_Y = 640;                // trunks grounded behind the platforms

// Foreground grass (layer 5), 360px-periodic, anchored to the screen bottom
// (x parallax only — near-lens foliage does not track vertical camera pans;
// see the camera policy in constants.js).
const GRASS_PERIOD = 360;


// ---------------------------------------------------------------------------
// Sara procedural character (SPEC §18.1, §57) — Phase 3
// ---------------------------------------------------------------------------
// Local space: origin at the feet-center anchor, +x = facing direction,
// -y = up. Every shape is an authored rect — crisp, gradient-free, and free
// of shadowBlur (§78). Poses are DERIVED presentation state: they read the
// entity's facts (onGround / vx / vy / animTime / runTime) and never write
// anything back (§57 presentation must not mutate gameplay rules; §70 no
// gameplay logic in rendering). The POSE scratch below is a module
// singleton, mutated in place — zero per-frame allocation (§70, §78).
const POSE = {
  bob: 0, lean: 0, crouch: 0, ph: 0, attack: false,
  legAFwd: 0, legALift: 0, legBFwd: 0, legBLift: 0,
  armAFwd: 0, armALift: 0, armBFwd: 0, armBLift: 0,
  hairTrail: 0, hairRise: 0,
};

// Hair reacts to motion exactly (deterministic; no randomness, §72):
// running sweeps it back, rising presses it down, falling lifts it up.
function computeSaraPose(player) {
  const P = POSE;
  P.bob = 0; P.lean = 0; P.crouch = 0; P.attack = false;
  P.legAFwd = 0; P.legALift = 0; P.legBFwd = 0; P.legBLift = 0;
  P.armAFwd = 0; P.armALift = 0; P.armBFwd = 0; P.armBLift = 0;
  P.hairTrail = -Math.min(Math.abs(player.vx) * ANIM_HAIR_TRAIL, 8);
  P.hairRise = Math.max(-5, Math.min(8, player.vy * ANIM_HAIR_RISE));

  // Dormant §18.1 ability poses: Phase 7 populates attackAnimT (knife) and
  // specialAnimT (dash) on the entity; until then these stay cold paths.
  if ((player.attackAnimT || 0) > 0) {
    P.attack = true; P.lean = 3; P.armAFwd = 13; P.armBFwd = -4;
    return;
  }
  if ((player.specialAnimT || 0) > 0) {          // crouch (§18.1 special)
    P.crouch = 5; P.lean = 3; P.legALift = 2; P.legBLift = 2;
    P.armAFwd = 2; P.armBFwd = -2;
    return;
  }

  if (!player.onGround) {
    if (player.vy < -60) {                       // rising: tuck, arms back
      P.legAFwd = 4; P.legALift = 6; P.legBFwd = -3;
      P.armAFwd = -2; P.armALift = -4; P.armBFwd = -5;
    } else {                                     // falling: split, arms out
      P.legAFwd = 5; P.legALift = 2; P.legBFwd = -5; P.legBLift = 3;
      P.armAFwd = 3; P.armALift = -6; P.armBFwd = -6; P.armBLift = -3;
    }
    return;
  }

  if (player.vx !== 0) {                         // run cycle
    P.ph = player.runTime * ANIM_RUN_CYCLE;
    const s = Math.sin(P.ph);
    P.lean = 2;
    P.legAFwd = s * 5;  P.legALift = Math.max(0, s) * 3.5;
    P.legBFwd = -s * 5; P.legBLift = Math.max(0, -s) * 3.5;
    P.armAFwd = -s * 4; P.armALift = Math.max(0, -s) * 2;
    P.armBFwd = s * 4;  P.armBLift = Math.max(0, s) * 2;
  } else {                                       // idle: bob + hair sway
    P.bob = Math.sin(player.animTime * ANIM_IDLE_SPEED) * ANIM_IDLE_BOB;
  }
}

// One leg: dark-blue legging shaft from the hip (-16) plus a brown boot
// whose sole lands at -lift. `x` is the leg's ground-track position.
function drawSaraLeg(ctx, x, lift) {
  ctx.fillStyle = SARA_PALETTE.cloak;
  ctx.fillRect(x - 1, -16, 5, 10 - lift);        // leg shaft (hip → boot)
  ctx.fillStyle = SARA_PALETTE.boots;
  ctx.fillRect(x - 2, -6 - lift, 7, 6);          // boot
  ctx.fillRect(x - 2, -3 - lift, 8, 3);          // toe cap (forward)
}

function drawSaraLegs(ctx) {
  drawSaraLeg(ctx, -1 + POSE.legBFwd, POSE.legBLift);   // back leg
  drawSaraLeg(ctx, 3 + POSE.legAFwd, POSE.legALift);    // front leg
}

// Short cloak (behind, offset outward so it reads as a distinct garment
// beside the long hair), slender blue tunic, skirt flare at the hip, and a
// darker-blue chest accent (§18.1 appearance).
function drawSaraTorso(ctx) {
  const P = POSE;
  const y0 = -32 + P.bob + P.crouch;             // shoulder line
  const y1 = -16 + P.crouch;                     // hip line
  ctx.fillStyle = SARA_PALETTE.cloak;
  ctx.fillRect(-11 + P.lean * 0.5, y0 + 2, 7, y1 - y0 - 2);  // short cloak
  ctx.fillStyle = SARA_PALETTE.tunic;
  ctx.fillRect(-4 + P.lean, y0, 11, y1 - y0);                // tunic body
  ctx.fillRect(-6 + P.lean, y1 - 4, 15, 4);                  // skirt flare
  ctx.fillStyle = SARA_PALETTE.cloak;
  ctx.fillRect(-1 + P.lean, y0 + 2, 4, 6);                   // chest accent
}

// Face, eye on the facing side, hair cap, and three long swaying segments
// flowing down the back (§18.1: long blonde hair; idle hair sway).
function drawSaraHead(ctx, player) {
  const P = POSE;
  const hx = 1 + P.lean;                         // head center x
  const hy = -38 + P.bob + P.crouch;             // head center y
  ctx.fillStyle = SARA_PALETTE.skin;
  ctx.fillRect(hx - 4, hy - 5, 9, 10);           // face
  ctx.fillStyle = SARA_PALETTE.eye;
  ctx.fillRect(hx + 2, hy - 2, 2, 3);            // eye (facing side)
  ctx.fillStyle = SARA_PALETTE.hair;
  ctx.fillRect(hx - 5, hy - 7, 10, 4);           // top fringe
  ctx.fillRect(hx - 6, hy - 5, 4, 8);            // back of the head
  for (let i = 0; i < 3; i += 1) {               // flowing back hair
    const sway = Math.sin(player.animTime * ANIM_HAIR_SWAY + i * 0.9) * 1.4;
    const trail = P.hairTrail * (i + 1) / 3;
    const rise = P.hairRise * (i + 1) / 3;
    ctx.fillRect(hx - 7 + trail + sway, hy - 3 + i * 6 - rise, 5, 8);
  }
}

// Two-segment sleeve + skin hand. The attack pose (§18.1 quick arm
// extension) draws one long horizontal sleeve with a small knife blade —
// the blade tone is render-authored steel, not a SPEC-locked color.
function drawSaraArm(ctx, rootX, fwd, lift) {
  const sy = -30 + POSE.bob + POSE.crouch;       // shoulder height
  ctx.fillStyle = SARA_PALETTE.tunic;
  if (POSE.attack && rootX > 0) {                // front arm: knife thrust
    ctx.fillRect(rootX, sy + 1, fwd, 4);         // extended sleeve
    ctx.fillStyle = SARA_PALETTE.skin;
    ctx.fillRect(rootX + fwd, sy, 4, 4);         // hand
    ctx.fillStyle = STAR_TONE;
    ctx.fillRect(rootX + fwd + 4, sy + 1, 6, 2); // knife blade
    return;
  }
  ctx.fillRect(rootX, sy, 4, 6);                 // upper arm
  const kx = rootX + fwd * 0.5;                  // elbow kink
  ctx.fillRect(kx, sy + 5, 4, 5);                // forearm
  ctx.fillStyle = SARA_PALETTE.skin;
  ctx.fillRect(kx, sy + 10 - Math.max(0, lift), 4, 3);   // hand
}

function drawSara(ctx, player, game) {
  computeSaraPose(player);
  // §57 squash/stretch — pure presentation around the feet anchor; the
  // hitbox is never touched. The most recent event wins: a landing right
  // after a takeoff overrides the stretch and vice versa. Deformation
  // starts at the §57 factor and eases out to neutral over ~0.1 s.
  let sx = 1;
  let sy = 1;
  const useJump = player.lastJumpAt > player.lastLandAt;
  const stamp = useJump ? player.lastJumpAt : player.lastLandAt;
  const t = game.gameTime - stamp;
  if (stamp >= 0 && t >= 0 && t < SQUASH_DURATION) {
    const f = (1 - t / SQUASH_DURATION) ** 2;    // ease-out back to neutral
    sy = 1 + ((useJump ? SQUASH_JUMP_Y : SQUASH_LAND_Y) - 1) * f;
    sx = 1 + ((useJump ? SQUASH_JUMP_X : SQUASH_LAND_X) - 1) * f;
  }
  const flip = player.facing === 'left' ? -1 : 1;
  ctx.save();
  ctx.translate(player.x + player.w / 2, player.y + player.h);  // feet anchor
  ctx.scale(sx * flip, sy);                      // mirror for facing left
  drawSaraArm(ctx, -4, POSE.armBFwd, POSE.armBLift);   // back arm (behind)
  drawSaraLegs(ctx);
  drawSaraTorso(ctx);
  drawSaraHead(ctx, player);
  drawSaraArm(ctx, 4, POSE.armAFwd, POSE.armALift);    // front arm (over)
  ctx.restore();
}

// Placeholder marker for characters whose procedural art arrives in a later
// phase (Raha/Aram, Phase 7): the character-colored hitbox.
function drawPlayerPlaceholder(ctx, player) {
  const color = CHARACTER_COLORS[player.character] || CHARACTER_COLORS.sara;
  ctx.fillStyle = color;
  ctx.fillRect(player.x, player.y, player.w, player.h);
  ctx.fillStyle = 'rgba(232, 236, 255, 0.25)';
  ctx.fillRect(player.x, player.y, player.w, 3);
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d', { alpha: false });
  const view = { scale: 1, dpr: 1, offsetX: 0, offsetY: 0 };
  let skyGradient = null;
  let fogGradient = null;
  let vignette = null;

  function resize() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const contain = Math.min(vw / LOGICAL_W, vh / LOGICAL_H); // §7 contain
    view.dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    canvas.style.width = Math.floor(LOGICAL_W * contain) + 'px';
    canvas.style.height = Math.floor(LOGICAL_H * contain) + 'px';
    canvas.width = Math.round(LOGICAL_W * view.dpr);
    canvas.height = Math.round(LOGICAL_H * view.dpr);
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;    // §7 — resets on backing-store change
    const rect = canvas.getBoundingClientRect();
    view.scale = rect.width / LOGICAL_W; // effective scale incl. rounding
    view.offsetX = rect.left;
    view.offsetY = rect.top;
    skyGradient = null;                   // rebuild lazily next render
  }

  // §7: touch coordinates mapped with the SAME transform as rendering.
  function toLogical(clientX, clientY) {
    return {
      x: (clientX - view.offsetX) / view.scale,
      y: (clientY - view.offsetY) / view.scale,
    };
  }

  function drawSky() {
    if (!skyGradient) {
      skyGradient = ctx.createLinearGradient(0, 0, 0, LOGICAL_H);
      skyGradient.addColorStop(0, SKY_TOP);
      skyGradient.addColorStop(0.62, SKY_MID);
      skyGradient.addColorStop(1, SKY_LOW);
    }
    ctx.fillStyle = skyGradient;
    ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
  }

  // ---- §55 layer 1: twinkling stars (1280-periodic) + dark clouds -------
  function drawStars(cam, gameTime) {
    const offX = cam.x * PARALLAX_STARS;
    const offY = cam.y * PARALLAX_STARS;
    ctx.fillStyle = STAR_TONE;
    for (let i = 0; i < STARS.length; i += 1) {
      const s = STARS[i];
      const sx = mod(s.x - offX, LOGICAL_W);    // field wraps with the view
      const alpha = 0.3 + 0.6 * Math.abs(Math.sin(gameTime * 0.9 + s.tw));
      ctx.globalAlpha = alpha;
      ctx.fillRect(sx, s.y - offY, s.s, s.s);
    }
    ctx.globalAlpha = 1;
  }

  function drawClouds(cam) {
    const offX = cam.x * PARALLAX_STARS;
    const offY = cam.y * PARALLAX_STARS;
    ctx.fillStyle = CLOUD_TONE;
    const k0 = Math.floor((offX - CLOUD_PERIOD) / CLOUD_PERIOD);
    const k1 = Math.floor((offX + LOGICAL_W) / CLOUD_PERIOD);
    for (let k = k0; k <= k1; k += 1) {
      for (let i = 0; i < CLOUDS.length; i += 1) {
        const c = CLOUDS[i];
        const sx = k * CLOUD_PERIOD + c.x - offX;
        if (sx + c.w < 0 || sx > LOGICAL_W) continue;
        const sy = c.y - offY;
        ctx.fillRect(sx, sy, c.w, c.h);                          // body
        ctx.fillRect(sx + c.w * 0.18, sy - c.h * 0.55, c.w * 0.5, c.h * 0.6); // cap
      }
    }
  }

  // ---- §55 layer 2: moon + blue-white halo (on screen the whole run) -----
  function drawStrips(strips, cx, cy) {
    for (let i = 0; i < strips.length; i += 1) {
      const s = strips[i];
      ctx.fillRect(cx - s.w / 2, cy + s.y, s.w, 4);
    }
  }

  // Moon screen position (Phase 5 recomposition): drifts at the locked
  // §55 rate during the opening chapters, then rides at MOON_HOLD_X — the
  // distant moon visibly waits at the horizon for the whole journey.
  function moonScreenX(cam) {
    const x = MOON_LAYER_X - cam.x * PARALLAX_MOON;
    return x < MOON_HOLD_X ? MOON_HOLD_X : x;
  }

  function drawMoon(cam) {
    const mx = moonScreenX(cam);
    const my = MOON_Y - cam.y * PARALLAX_MOON;
    if (mx < -90 || mx > LOGICAL_W + 90) return;  // cull with halo margin
    ctx.fillStyle = STAR_TONE;                    // blue-white halo shells
    ctx.globalAlpha = 0.05;
    drawStrips(HALO_OUTER, mx, my);
    ctx.globalAlpha = 0.10;
    drawStrips(HALO_INNER, mx, my);
    ctx.globalAlpha = 1;
    ctx.fillStyle = MOON_COLOR;
    drawStrips(MOON_STRIPS, mx, my);
    ctx.fillStyle = MOON_CRATER_TONE;             // surface craters
    for (let i = 0; i < MOON_CRATERS.length; i += 1) {
      const cr = MOON_CRATERS[i];
      ctx.fillRect(mx + cr.x, my + cr.y, cr.w, cr.h);
    }
  }

  // ---- §55 layer 3: gothic castle + sharp spires + orange windows --------
  function drawCastle(cam, gameTime) {
    const offX = cam.x * PARALLAX_CASTLE;
    const offY = cam.y * PARALLAX_CASTLE;
    // distant broken tower — an early foreshadow of what waits at the end
    const tx = CASTLE_TOWER_LAYER_X - offX;
    if (tx > -80 && tx < LOGICAL_W + 80) {
      const top = CASTLE_BASE_Y - 130 - offY;
      ctx.fillStyle = CASTLE_TONE;
      ctx.fillRect(tx, top, 46, 150);
      ctx.fillRect(tx + 2, top - 8, 20, 8);       // chipped crown
      ctx.fillRect(tx + 30, top - 5, 12, 5);
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = CASTLE_WINDOW;
      ctx.fillRect(tx + 19, CASTLE_BASE_Y - 90 - offY, 5, 8);   // one dim window
      ctx.globalAlpha = 1;
    }
    // main gothic mass — enters during the castle approach (chapter 3-4's
    // final stretch) and frames the moon by the journey's end (see the
    // layer-space note at module top)
    const sx = CASTLE_LAYER_X - offX;
    if (sx + 360 < 0 || sx > LOGICAL_W) return;
    ctx.fillStyle = CASTLE_TONE;
    for (let i = 0; i < CASTLE_BODIES.length; i += 1) {
      const b = CASTLE_BODIES[i];
      ctx.fillRect(sx + b.x, CASTLE_BASE_Y - b.h - offY, b.w, b.h + 20);
    }
    for (let i = 0; i < CASTLE_SPIRES.length; i += 1) {   // stepped sharp spires
      const sp = CASTLE_SPIRES[i];
      const cx = sx + sp.x + sp.w / 2;
      let ty = CASTLE_BASE_Y - sp.base - offY;
      const widths = [sp.w, sp.w - 18, sp.w - 34, sp.w - 44];
      for (let j = 0; j < widths.length; j += 1) {
        ctx.fillRect(cx - widths[j] / 2, ty - 16, widths[j], 16);
        ty -= 16;
      }
      ctx.fillRect(cx - 3, ty - 22, 6, 22);       // narrow sharp tip
    }
    for (let i = 0; i < CASTLE_WINDOWS.length; i += 1) {  // flickering windows
      const w = CASTLE_WINDOWS[i];
      const flick = 0.65 + 0.35 * (0.5 + 0.5 * Math.sin(gameTime * 2.4 + i * 1.7));
      ctx.globalAlpha = flick;
      ctx.fillStyle = i % 4 === 0 ? CASTLE_WINDOW_BRIGHT : CASTLE_WINDOW;
      ctx.fillRect(sx + w.x, CASTLE_BASE_Y - w.y - offY, 5, 8);
    }
    ctx.globalAlpha = 1;
  }

  // ---- §55 layer 4: silhouetted trees + ruined pillars (420px tiles) -----
  function drawTree(tx, baseY, h) {
    ctx.fillRect(tx, baseY - h, 10, h);            // trunk
    ctx.fillRect(tx - 30, baseY - h - 26, 70, 24); // canopy blobs
    ctx.fillRect(tx - 22, baseY - h - 44, 54, 20);
    ctx.fillRect(tx - 12, baseY - h - 58, 34, 16);
    ctx.fillRect(tx - 38, baseY - h - 18, 14, 10); // jagged canopy edges
    ctx.fillRect(tx + 28, baseY - h - 14, 12, 8);
  }

  function drawTrees(cam) {
    const offX = cam.x * PARALLAX_TREES;
    const offY = cam.y * PARALLAX_TREES;
    const baseY = TREE_BASE_Y - offY;
    const k0 = Math.floor((offX - TREE_PERIOD) / TREE_PERIOD);
    const k1 = Math.floor((offX + LOGICAL_W) / TREE_PERIOD) + 1;
    for (let k = k0; k <= k1; k += 1) {
      const v = mod(k * 73 + 11, 97);              // deterministic tile variant
      const bx = k * TREE_PERIOD - offX;
      if (v < 56) {
        ctx.fillStyle = TREE_TONE;
        drawTree(bx + 40 + (v % 5) * 14, baseY, 132 + (v % 7) * 16);
      } else if (v < 68) {
        const ch = 84 + (v % 4) * 18;              // ruined pillar
        ctx.fillStyle = PILLAR_TONE;
        ctx.fillRect(bx + 60, baseY - 10, 40, 10);          // plinth
        ctx.fillRect(bx + 72, baseY - 10 - ch, 16, ch);     // column
        ctx.fillRect(bx + 70, baseY - 10 - ch - 6, 12, 6);  // broken top chips
        ctx.fillRect(bx + 78, baseY - 10 - ch - 3, 8, 3);
      } else if (v < 80) {
        ctx.fillStyle = TREE_TONE;                 // small tree pair
        drawTree(bx + 50, baseY, 88 + (v % 3) * 14);
        drawTree(bx + 240, baseY, 76 + (v % 5) * 10);
      }
      // else: clearing — deliberate negative space in the forest line
    }
  }

  // ---- atmosphere: moon rays, over the forest, under the world ----------
  function drawMoonRays(cam, gameTime) {
    const mx = moonScreenX(cam);
    const my = MOON_Y - cam.y * PARALLAX_MOON;
    ctx.fillStyle = MOON_COLOR;
    for (let i = 0; i < 3; i += 1) {
      const ang = 1.62 + i * 0.19;                 // fan: down → down-left
      const w = 20 + i * 7;
      const a = 0.030 + 0.018 * (0.5 + 0.5 * Math.sin(gameTime * 0.8 + i * 2.1));
      ctx.save();
      ctx.translate(mx, my);
      ctx.rotate(ang);
      ctx.globalAlpha = a;
      ctx.fillRect(-w / 2, 20, w, 560);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  function drawPlatforms(platforms, cam) {
    // Placeholder geometry rendering (§55 platform tones). The pit between
    // ground A and ground B is simply void — sky shows through. Render-only
    // culling against the camera view (§78).
    const left = cam.x - 8;
    const right = cam.x + LOGICAL_W + 8;
    for (let i = 0; i < platforms.length; i += 1) {
      const p = platforms[i];
      if (p.x + p.w < left || p.x > right) continue;
      ctx.fillStyle = GROUND_FILL;
      ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.fillStyle = GROUND_EDGE;
      ctx.fillRect(p.x, p.y, p.w, 3);            // lit top edge
    }
  }

  function drawPlayer(game, player, cam) {
    // Render-only culling (§78): never draw what the camera cannot see;
    // gameplay entities are NOT removed, merely skipped in presentation.
    if (player.x + player.w < cam.x - 20 || player.x > cam.x + LOGICAL_W + 20) return;
    if (player.character === 'sara') drawSara(ctx, player, game);
    else drawPlayerPlaceholder(ctx, player);
  }

  // ---- §55 layer 5: foreground grass (fastest layer, screen-bottom anchor)
  function drawGrass(cam) {
    const offX = cam.x * PARALLAX_GRASS;
    ctx.fillStyle = GRASS_TONE;
    ctx.fillRect(0, 714, LOGICAL_W, 6);          // continuous root strip
    const k0 = Math.floor((offX - GRASS_PERIOD) / GRASS_PERIOD);
    const k1 = Math.floor((offX + LOGICAL_W) / GRASS_PERIOD) + 1;
    for (let k = k0; k <= k1; k += 1) {
      const v = mod(k * 53 + 7, 89);
      const bx = k * GRASS_PERIOD - offX;
      const tx = bx + 40 + (v % 7) * 24;
      ctx.fillRect(tx, 702, 3, 12 + (v % 5) * 3);        // tuft blades
      ctx.fillRect(tx + 5, 696, 3, 18 + (v % 3) * 4);
      ctx.fillRect(tx + 10, 700, 3, 14 + (v % 4) * 3);
      ctx.fillRect(tx + 15, 694, 3, 20 + (v % 5) * 2);
      if (v % 19 === 3) ctx.fillRect(bx + 190, 662, 4, 52);  // sparse tall blade
    }
  }

  // ---- atmosphere: bottom fog + dark vignette (screen space, cached) -----
  function drawFog() {
    if (!fogGradient) {
      fogGradient = ctx.createLinearGradient(0, 540, 0, LOGICAL_H);
      fogGradient.addColorStop(0, 'rgba(5,7,15,0)');
      fogGradient.addColorStop(1, 'rgba(5,7,15,0.28)');
    }
    ctx.fillStyle = fogGradient;
    ctx.fillRect(0, 540, LOGICAL_W, 180);
  }

  function drawVignette() {
    if (!vignette) {
      vignette = {
        top: ctx.createLinearGradient(0, 0, 0, 90),
        bottom: ctx.createLinearGradient(0, LOGICAL_H, 0, LOGICAL_H - 110),
        left: ctx.createLinearGradient(0, 0, 70, 0),
        right: ctx.createLinearGradient(LOGICAL_W, 0, LOGICAL_W - 70, 0),
      };
      vignette.top.addColorStop(0, 'rgba(2,3,10,0.35)');
      vignette.top.addColorStop(1, 'rgba(2,3,10,0)');
      vignette.bottom.addColorStop(0, 'rgba(2,3,10,0.45)');
      vignette.bottom.addColorStop(1, 'rgba(2,3,10,0)');
      vignette.left.addColorStop(0, 'rgba(2,3,10,0.30)');
      vignette.left.addColorStop(1, 'rgba(2,3,10,0)');
      vignette.right.addColorStop(0, 'rgba(2,3,10,0.30)');
      vignette.right.addColorStop(1, 'rgba(2,3,10,0)');
    }
    ctx.fillStyle = vignette.top;
    ctx.fillRect(0, 0, LOGICAL_W, 90);
    ctx.fillStyle = vignette.bottom;
    ctx.fillRect(0, LOGICAL_H - 110, LOGICAL_W, 110);
    ctx.fillStyle = vignette.left;
    ctx.fillRect(0, 0, 70, LOGICAL_H);
    ctx.fillStyle = vignette.right;
    ctx.fillRect(LOGICAL_W - 70, 0, 70, LOGICAL_H);
  }

  // Full §55 layer stack, back to front. The camera (§53) is only READ
  // here (§70): the world layer translates by the camera position, each
  // parallax layer by cam * its factor.
  function render(game, level, player) {
    const cam = game.camera;
    drawSky();
    drawStars(cam, game.gameTime);
    drawClouds(cam);
    drawMoon(cam);
    drawCastle(cam, game.gameTime);
    drawTrees(cam);
    drawMoonRays(cam, game.gameTime);
    ctx.save();
    ctx.translate(-cam.x, -cam.y);                 // world space (§53)
    drawPlatforms(level.platforms, cam);
    drawPlayer(game, player, cam);
    ctx.restore();
    drawGrass(cam);
    drawFog();
    drawVignette();
  }

  resize();
  return { resize, render, toLogical, view };
}
