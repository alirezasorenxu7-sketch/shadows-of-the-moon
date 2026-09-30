// Shadows of the Moon — procedural renderer (SPEC §7, §53, §55, §57, §78).
// Canvas 2D only. Logical 1280x720, strict 16:9 contain scaling — X and Y
// are NEVER stretched independently; letterboxing is allowed. Touch
// coordinates map through the SAME transform as rendering (§7):
// logical = (client - renderOffset) / scale. effectiveDPR = min(dpr, 2);
// imageSmoothingEnabled = false, re-asserted after every backing-store
// resize. shadowBlur is reserved for enemy eyes only (§30, §78) — this
// module never uses it directly. NO gameplay logic in rendering (§70).
//
// Phase 6 canon visual fix (amended §4/§55): THE MOON IS GONE. No moon
// disc, no halo, no rays anywhere — the stolen moon's light shows instead
// as the "Light Behind the Castle": an act-driven horizon glow (Act 1
// pitch black with stars only; Act 2 faint distant glow + tiny castle
// silhouette on the horizon band; Act 3 clear glow + lightened horizon;
// 3-5 flicker; the victory moon-rise is owned by the Phase 13 victory
// screen).
//
// Scene: sky gradient, deterministic twinkling stars + dark clouds (§55
// layer 1), the Light Behind the Castle (near-sky glow + distant
// silhouette), gothic castle silhouette with sharp spires and flickering
// orange windows (layer 3) with the glow behind its spires, silhouetted
// trees + ruined pillars (layer 4), the world itself at global ZOOM 1.25
// (§7/§53 — platforms with edge shadows, the full roster §18.1–§18.3 with
// §57 squash/stretch, drop shadow and the 1px silhouette outline, Patroller
// §30, §21 projectiles, §50 gates, §57 particle/ring FX), foreground grass
// (layer 5), then bottom fog + dark vignette atmosphere. The camera state
// (§53) lives on the game object and is only READ here — rendering never
// moves it. All layer art is authored rects, built once at module init
// (deterministic formulas, no Math.random §72, zero per-frame allocation
// §78).
//
// Phase 7 roster art (§18.2/§18.3): Raha — broad armored warrior (pauldrons,
// chest plate, gauntlets over a red tunic, helm + warrior braid, long scarf,
// cheek scar); Aram — slim shadow sorceress (purple robe with trim + sleeve
// runes, silver-white hair, floating pulsing orb, glowing pupils). Every
// character renders through the same two-pass §57 silhouette outline and
// the soft ellipse drop shadow.
import {
  LOGICAL_W,
  LOGICAL_H,
  MAX_DPR,
  ZOOM,
  VIEW_W,
  SKY_TOP,
  SKY_MID,
  SKY_LOW,
  GROUND_FILL,
  GROUND_EDGE,
  PLATFORM_SHADOW,
  CHARACTER_COLORS,
  STAR_TONE,
  GLOW_LIGHT,
  CLOUD_TONE,
  CASTLE_TONE,
  CASTLE_WINDOW,
  CASTLE_WINDOW_BRIGHT,
  TREE_TONE,
  PILLAR_TONE,
  GRASS_TONE,
  PARALLAX_STARS,
  PARALLAX_GLOW,
  PARALLAX_CASTLE,
  PARALLAX_TREES,
  PARALLAX_GRASS,
  SARA_PALETTE,
  RAHA_PALETTE,
  ARAM_PALETTE,
  CHAR_ART_SCALE,
  ENEMY_ARMOR,
  ENEMY_CLOTH,
  ENEMY_EYE,
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
  ANIM_ENEMY_WALK,
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
// ~50000px world in Phase 5; Phase 6 canon visual fix: the moon is REMOVED,
// replaced by the act-driven "Light Behind the Castle"). Everything below
// is authored once at module init: deterministic formulas only, rect-only
// art, no per-frame allocation. The parallax SYSTEM is unchanged (§55
// locked factors); the landmark layer-space anchors:
//   castle (factor 0.30) at layer x 15016 — enters ~camX 45,800 (chapter
//   3-4's final stretch, the castle approach) and at the journey's end
//   (camX 48,976) sits at screen ~323.
//   tower  (factor 0.30) at layer x 700 — the broken distant tower stays a
//   spawn-area foreshadow (visible camX 0..~2333).
//   light (factor 0.05) — the imprisoned moon's glow rides at the horizon
//   anchor below from Act 2 onward, then hands over to the main castle
//   mass as it enters during the 3-4 approach.
// ---------------------------------------------------------------------------
function mod(a, n) { return a - n * Math.floor(a / n); }

// ---------------------------------------------------------------------------
// "Light Behind the Castle" (amended §4/§55 canon). Act-driven progression
// reads AUTHORITATIVE game state (game.currentAct / game.currentChapter):
//   Act 1 (1-1..1-5) : pitch-black sky — NOT rendered (stars only)
//   Act 2 (2-1..2-5) : faint glow + tiny distant castle silhouette on the
//                      horizon band
//   Act 3 (3-1..3-4) : clear glow, the horizon lightens
//   3-5              : the glow flickers (final battle, authored Phase 12)
//   Victory          : the moon rises — owned by the Phase 13 victory screen
// ---------------------------------------------------------------------------
const GLOW_ANCHOR_LAYER_X = 1200;        // layer-space anchor (factor 0.05)
const GLOW_HOLD_X = 980;                 // horizon anchor the light rides at
const GLOW_HORIZON_Y = 560;              // base line shared with the castle
// Glow dome shells: authored stacked wide rects (soft light over the dark
// sky — alpha stacks toward the dome's center). {w, h, a} relative to the
// horizon base line.
const GLOW_SHELLS = [
  { w: 640, h: 200, a: 0.030 },
  { w: 520, h: 160, a: 0.050 },
  { w: 400, h: 120, a: 0.075 },
  { w: 280, h: 80, a: 0.105 },
];
// Tiny distant castle silhouette (Act 2+): three dark towers with spire
// tips on the horizon band — the far promise of the Act 3 approach. As the
// REAL castle mass enters during chapter 3-4, this stand-in fades out.
const DISTANT_TOWERS = [
  { x: -64, w: 30, h: 52 },
  { x: -14, w: 40, h: 76 },
  { x: 34, w: 26, h: 44 },
];

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
// §57 amended presentation primitives: silhouette outline + drop shadow.
// ---------------------------------------------------------------------------
// 1px dark outline around the character silhouette, implemented as a
// TWO-PASS draw: pass 1 re-renders every part rect EXPANDED by 1px in the
// outline tone (OUTLINE_PASS), pass 2 renders the normal art on top. All
// character part drawing routes through part() so the outline always wraps
// the FULL silhouette, whatever the pose.
const SILHOUETTE = '#060810';
let OUTLINE_PASS = false;

function part(ctx, x, y, w, h) {
  if (OUTLINE_PASS) {
    ctx.fillStyle = SILHOUETTE;
    ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  } else {
    ctx.fillRect(x, y, w, h);
  }
}

// §57 amended: soft ellipse drop shadow under the ACTIVE character
// (alpha 0.3, +2px below the surface). Cast down from the feet-center to
// the topmost solid below (deterministic scan of the ACTIVE collision
// view — a dispelled gate or broken platform no longer receives shadow);
// the ellipse contracts as the character rises. Presentation only.
function drawDropShadow(ctx, player, level) {
  const cx = player.x + player.w / 2;
  const feet = player.y + player.h;
  let surface = -1;
  const solids = level.platforms;
  for (let i = 0; i < solids.length; i += 1) {
    const p = solids[i];
    if (cx >= p.x && cx <= p.x + p.w && p.y >= feet - 1
        && (surface === -1 || p.y < surface)) surface = p.y;
  }
  if (surface === -1 || surface - feet > 220) return;   // no ground nearby
  const k = 1 - Math.min(1, (surface - feet) / 220) * 0.6;
  ctx.fillStyle = 'rgba(3,5,10,0.3)';                    // §57 alpha 0.3
  ctx.beginPath();
  ctx.ellipse(cx, surface + 2, player.w * 0.42 * k, 4.5 * k, 0, 0, Math.PI * 2);
  ctx.fill();
}

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
  part(ctx, x - 1, -16, 5, 10 - lift);         // leg shaft (hip → boot)
  ctx.fillStyle = SARA_PALETTE.boots;
  part(ctx, x - 2, -6 - lift, 7, 6);           // boot
  part(ctx, x - 2, -3 - lift, 8, 3);           // toe cap (forward)
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
  part(ctx, -11 + P.lean * 0.5, y0 + 2, 7, y1 - y0 - 2);    // short cloak
  ctx.fillStyle = SARA_PALETTE.tunic;
  part(ctx, -4 + P.lean, y0, 11, y1 - y0);                  // tunic body
  part(ctx, -6 + P.lean, y1 - 4, 15, 4);                    // skirt flare
  ctx.fillStyle = SARA_PALETTE.cloak;
  part(ctx, -1 + P.lean, y0 + 2, 4, 6);                     // chest accent
}

// Face, eye on the facing side, hair cap, and three long swaying segments
// flowing down the back (§18.1: long blonde hair; idle hair sway).
function drawSaraHead(ctx, player) {
  const P = POSE;
  const hx = 1 + P.lean;                         // head center x
  const hy = -38 + P.bob + P.crouch;             // head center y
  ctx.fillStyle = SARA_PALETTE.skin;
  part(ctx, hx - 4, hy - 5, 9, 10);              // face
  ctx.fillStyle = SARA_PALETTE.eye;
  part(ctx, hx + 2, hy - 2, 2, 3);               // eye (facing side)
  ctx.fillStyle = SARA_PALETTE.hair;
  part(ctx, hx - 5, hy - 7, 10, 4);              // top fringe
  part(ctx, hx - 6, hy - 5, 4, 8);               // back of the head
  for (let i = 0; i < 3; i += 1) {               // flowing back hair
    const sway = Math.sin(player.animTime * ANIM_HAIR_SWAY + i * 0.9) * 1.4;
    const trail = P.hairTrail * (i + 1) / 3;
    const rise = P.hairRise * (i + 1) / 3;
    part(ctx, hx - 7 + trail + sway, hy - 3 + i * 6 - rise, 5, 8);
  }
}

// Two-segment sleeve + skin hand. The attack pose (§18.1 quick arm
// extension) draws one long horizontal sleeve with a small knife blade —
// the blade tone is render-authored steel, not a SPEC-locked color.
function drawSaraArm(ctx, rootX, fwd, lift) {
  const sy = -30 + POSE.bob + POSE.crouch;       // shoulder height
  ctx.fillStyle = SARA_PALETTE.tunic;
  if (POSE.attack && rootX > 0) {                // front arm: knife thrust
    part(ctx, rootX, sy + 1, fwd, 4);            // extended sleeve
    ctx.fillStyle = SARA_PALETTE.skin;
    part(ctx, rootX + fwd, sy, 4, 4);            // hand
    ctx.fillStyle = STAR_TONE;
    part(ctx, rootX + fwd + 4, sy + 1, 6, 2);    // knife blade
    return;
  }
  part(ctx, rootX, sy, 4, 6);                   // upper arm
  const kx = rootX + fwd * 0.5;                  // elbow kink
  part(ctx, kx, sy + 5, 4, 5);                   // forearm
  ctx.fillStyle = SARA_PALETTE.skin;
  part(ctx, kx, sy + 10 - Math.max(0, lift), 4, 3);       // hand
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
  // CHAR_ART_SCALE (amended §18): the Phase-3 art was authored for the old
  // 48px-tall body; x1.3 matches it to the amended 62px hitbox silhouette.
  ctx.scale(sx * flip * CHAR_ART_SCALE, sy * CHAR_ART_SCALE);   // mirror + scale
  // §57 amended silhouette outline: dark expanded pass UNDER the art.
  OUTLINE_PASS = true;
  drawSaraArm(ctx, -4, POSE.armBFwd, POSE.armBLift);   // back arm (behind)
  drawSaraLegs(ctx);
  drawSaraTorso(ctx);
  drawSaraHead(ctx, player);
  drawSaraArm(ctx, 4, POSE.armAFwd, POSE.armALift);    // front arm (over)
  OUTLINE_PASS = false;
  drawSaraArm(ctx, -4, POSE.armBFwd, POSE.armBLift);   // back arm (behind)
  drawSaraLegs(ctx);
  drawSaraTorso(ctx);
  drawSaraHead(ctx, player);
  drawSaraArm(ctx, 4, POSE.armAFwd, POSE.armALift);    // front arm (over)
  ctx.restore();
}

// Placeholder marker for characters whose procedural art arrives in a later
// phase: kept for dormant/unknown roster keys (never hit by the authored
// trio — drawPlayer dispatches sara/raha/aram to their full §18 art).
function drawPlayerPlaceholder(ctx, player) {
  const color = CHARACTER_COLORS[player.character] || CHARACTER_COLORS.sara;
  ctx.fillStyle = color;
  ctx.fillRect(player.x, player.y, player.w, player.h);
  ctx.fillStyle = 'rgba(232, 236, 255, 0.25)';
  ctx.fillRect(player.x, player.y, player.w, 3);
}

// ---------------------------------------------------------------------------
// Raha procedural character (SPEC §18.2, §57) — Phase 7
// ---------------------------------------------------------------------------
// Broad and imposing female warrior: dark armor (pauldrons, chest plate,
// gauntlets) worn over a red tunic, long red scarf, dark helm with the
// warrior braid visible beneath, cheek scar, stern mouth. The silhouette
// reads broad through horizontal pauldron span while the waist taper keeps
// the feminine cue (§18.2). Poses: idle = chest rise/fall, attack = wide
// arm swing (shockwave), special = airborne tuck (slam descent) or the
// grounded pound crouch. Same local space + outline/scale contract as Sara.
const RAHA_POSE = {
  bob: 0, chest: 0, lean: 0, crouch: 0, tuck: 0, attack: false, pound: false,
  legAFwd: 0, legALift: 0, legBFwd: 0, legBLift: 0,
  armAFwd: 0, armALift: 0, armBFwd: 0, armBLift: 0,
  scarfTrail: 0,
};

function computeRahaPose(player) {
  const P = RAHA_POSE;
  P.bob = 0; P.chest = 0; P.lean = 0; P.crouch = 0; P.tuck = 0;
  P.attack = false; P.pound = false;
  P.legAFwd = 0; P.legALift = 0; P.legBFwd = 0; P.legBLift = 0;
  P.armAFwd = 0; P.armALift = 0; P.armBFwd = 0; P.armBLift = 0;
  P.scarfTrail = -Math.min(Math.abs(player.vx) * 0.02, 7);

  if ((player.attackAnimT || 0) > 0) {             // §18.2 wide arm swing
    P.attack = true; P.lean = 4;
    P.armAFwd = 13; P.armALift = -3; P.armBFwd = -10; P.armBLift = -2;
    P.legAFwd = 5; P.legBFwd = -5;
    return;
  }
  if ((player.specialAnimT || 0) > 0) {
    if (player.slamActive) {                       // §18.2 airborne tuck
      P.tuck = 1; P.lean = 2;
      P.legALift = 9; P.legBLift = 7; P.legAFwd = 3; P.legBFwd = -2;
      P.armAFwd = 3; P.armALift = 5; P.armBFwd = -3; P.armBLift = 4;
    } else {                                        // grounded pound crouch
      P.pound = true; P.crouch = 7; P.lean = 3;
      P.armAFwd = 6; P.armALift = 6; P.armBFwd = -4; P.armBLift = 5;
      P.legALift = 2; P.legBLift = 2;
    }
    return;
  }

  if (!player.onGround) {
    if (player.vy < -60) {                         // rising: power lift
      P.legAFwd = 5; P.legALift = 5; P.legBFwd = -4;
      P.armAFwd = 5; P.armALift = -7; P.armBFwd = -5; P.armBLift = -5;
    } else {                                       // heavy fall: wide, braced
      P.legAFwd = 6; P.legALift = 2; P.legBFwd = -6; P.legBLift = 3;
      P.armAFwd = 8; P.armALift = -5; P.armBFwd = -8; P.armBLift = -4;
    }
    return;
  }

  if (player.vx !== 0) {                           // pronounced run cycle
    const s = Math.sin(player.runTime * ANIM_RUN_CYCLE);
    P.lean = 3;
    P.legAFwd = s * 10;  P.legALift = Math.max(0, s) * 6;
    P.legBFwd = -s * 10; P.legBLift = Math.max(0, -s) * 6;
    P.armAFwd = -s * 10; P.armALift = Math.max(0, -s) * 4;
    P.armBFwd = s * 10;  P.armBLift = Math.max(0, s) * 4;
    P.bob = Math.abs(s) * 1.2;
  } else {                                         // idle: chest rise/fall
    const br = Math.sin(player.animTime * ANIM_IDLE_SPEED * 0.8);
    P.chest = br * 1.2;                            // torso breathes
    P.bob = br * 0.6;
  }
}

// One armored leg: greave shaft + heavy dark boot (broader than Sara's).
function drawRahaLeg(ctx, x, lift) {
  ctx.fillStyle = RAHA_PALETTE.armor;
  part(ctx, x - 2, -17, 7, 10 - lift);           // greave shaft
  ctx.fillStyle = RAHA_PALETTE.boots;
  part(ctx, x - 3, -7 - lift, 9, 7);             // boot
  part(ctx, x - 3, -3 - lift, 10, 3);            // toe cap
}

function drawRahaLegs(ctx) {
  const P = RAHA_POSE;
  drawRahaLeg(ctx, -3 + P.legBFwd, P.legBLift);        // back leg
  drawRahaLeg(ctx, 3 + P.legAFwd, P.legALift);         // front leg
}

// Armored torso with the §18.2 waist taper: pauldrons span the shoulders,
// the chest plate narrows to the waist, the hip flare widens again. The red
// tunic shows at the midriff band and under the arms; the scarf roots at
// the neck and flows behind (drawn as its own layer beneath the arms).
function drawRahaTorso(ctx) {
  const P = RAHA_POSE;
  const y0 = -33 + P.bob + P.crouch - P.tuck * 2;      // shoulder line
  const ym = -25 + P.bob * 0.5 + P.crouch;             // waist line
  const y1 = -17 + P.crouch + P.tuck * 2;              // hip line
  ctx.fillStyle = RAHA_PALETTE.tunic;
  part(ctx, -8 + P.lean * 0.4, y0, 15, y1 - y0);       // tunic under-armor
  ctx.fillStyle = RAHA_PALETTE.armor;
  part(ctx, -13 + P.lean * 0.4, y0 - 1, 8, 6);         // back pauldron
  part(ctx, 5 + P.lean * 0.4, y0 - 1, 8, 6);           // front pauldron
  part(ctx, -9 + P.lean * 0.5, y0 + 3, 17, ym - y0 - 3);   // chest plate
  part(ctx, -7 + P.lean * 0.5, ym, 14, y1 - ym);           // waist taper
  part(ctx, -9 + P.lean * 0.3, y1, 17, 4);             // hip flare fauld
  ctx.fillStyle = RAHA_PALETTE.tunic;
  part(ctx, -6 + P.lean * 0.3, y1 + 4, 12, 3);         // tunic skirt below fauld
}

// Head under the dark helm: stern face, two dark eyes, cheek scar, the
// warrior braid escaping beneath the helm's back rim + a loose front strand.
function drawRahaHead(ctx, player) {
  const P = RAHA_POSE;
  const hx = 1 + P.lean;
  const hy = -40 + P.bob + P.crouch - P.tuck * 2;
  ctx.fillStyle = RAHA_PALETTE.hair;
  part(ctx, hx - 6, hy + 1, 4, 5);                     // hair under helm rim
  const sway = Math.sin(player.animTime * ANIM_HAIR_SWAY) * 1.2;
  part(ctx, hx - 4, hy + 2, 3, 3);                     // loose front strand
  ctx.fillStyle = RAHA_PALETTE.skin;
  part(ctx, hx - 4, hy - 4, 10, 10);                   // face
  ctx.fillStyle = RAHA_PALETTE.eye;
  part(ctx, hx - 2, hy - 1, 2, 2);                     // far eye
  part(ctx, hx + 3, hy - 1, 2, 2);                     // near eye
  ctx.fillStyle = RAHA_PALETTE.scar;
  part(ctx, hx + 5, hy + 1, 1, 4);                     // cheek scar
  ctx.fillStyle = RAHA_PALETTE.hair;
  part(ctx, hx, hy + 6, 5, 1);                         // stern mouth
  ctx.fillStyle = RAHA_PALETTE.armor;
  part(ctx, hx - 6, hy - 8, 13, 5);                    // helm cap
  part(ctx, hx - 6, hy - 3, 3, 6);                     // helm back rim
  part(ctx, hx + 5, hy - 3, 2, 4);                     // nose guard
  part(ctx, hx - 1, hy - 8, 3, 2);                     // helm crest ridge
  // the warrior braid: two segments flowing down the back
  ctx.fillStyle = RAHA_PALETTE.hair;
  part(ctx, hx - 7 + P.scarfTrail * 0.5 + sway, hy + 4, 4, 7);
  part(ctx, hx - 6 + P.scarfTrail + sway, hy + 11, 4, 6);
}

// Pauldron-capped arm: tunic sleeve, armored forearm gauntlet, gloved hand.
function drawRahaArm(ctx, rootX, fwd, lift) {
  const P = RAHA_POSE;
  const sy = -32 + P.bob + P.crouch - P.tuck * 2;      // shoulder height
  ctx.fillStyle = RAHA_PALETTE.armor;
  part(ctx, rootX - 2, sy - 2, 8, 5);                  // pauldron cap
  ctx.fillStyle = RAHA_PALETTE.tunic;
  part(ctx, rootX, sy + 3, 5, 6);                      // upper sleeve
  ctx.fillStyle = RAHA_PALETTE.armor;
  const kx = rootX + fwd * 0.55;
  part(ctx, kx, sy + 8, 6, 7);                         // gauntlet forearm
  ctx.fillStyle = RAHA_PALETTE.skin;
  part(ctx, kx + 1, sy + 15 - Math.max(0, lift), 4, 3); // hand
}

// The long red scarf (§18.2): three flowing segments behind the shoulders.
function drawRahaScarf(ctx, player) {
  const P = RAHA_POSE;
  const sy = -33 + P.bob + P.crouch - P.tuck * 2;
  ctx.fillStyle = RAHA_PALETTE.scarf;
  for (let i = 0; i < 3; i += 1) {
    const sway = Math.sin(player.animTime * ANIM_HAIR_SWAY + i * 1.1) * 1.8;
    const trail = P.scarfTrail * (i + 1) / 3;
    part(ctx, -10 + trail + sway + P.lean * 0.3, sy + 3 + i * 7, 5, 8);
  }
}

function drawRaha(ctx, player, game) {
  computeRahaPose(player);
  let sx = 1;
  let sy = 1;
  const useJump = player.lastJumpAt > player.lastLandAt;
  const stamp = useJump ? player.lastJumpAt : player.lastLandAt;
  const t = game.gameTime - stamp;
  if (stamp >= 0 && t >= 0 && t < SQUASH_DURATION) {
    const f = (1 - t / SQUASH_DURATION) ** 2;
    sy = 1 + ((useJump ? SQUASH_JUMP_Y : SQUASH_LAND_Y) - 1) * f;
    sx = 1 + ((useJump ? SQUASH_JUMP_X : SQUASH_LAND_X) - 1) * f;
  }
  const flip = player.facing === 'left' ? -1 : 1;
  ctx.save();
  ctx.translate(player.x + player.w / 2, player.y + player.h);
  ctx.scale(sx * flip * CHAR_ART_SCALE, sy * CHAR_ART_SCALE);
  const drawArt = () => {
    drawRahaArm(ctx, -6, RAHA_POSE.armBFwd, RAHA_POSE.armBLift);   // back arm
    drawRahaScarf(ctx, player);                                    // scarf behind
    drawRahaLegs(ctx);
    drawRahaTorso(ctx);
    drawRahaHead(ctx, player);
    drawRahaArm(ctx, 6, RAHA_POSE.armAFwd, RAHA_POSE.armALift);    // front arm
  };
  OUTLINE_PASS = true;                             // §57 silhouette outline
  drawArt();
  OUTLINE_PASS = false;
  drawArt();
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Aram procedural character (SPEC §18.3, §57) — Phase 7
// ---------------------------------------------------------------------------
// Slim shadow sorceress: purple outer robe with trim and sleeve runes over
// a dark inner robe, silver-white hair, a floating orb with pulsing glow,
// glowing purple pupils, subtle smile. Poses: idle = subtle float, attack =
// point forward + purple glow, special = outline pulse (§18.3). The orb is
// drawn OUTSIDE the outline pass — it is light, not silhouette.
const ARAM_POSE = {
  float: 0, lean: 0, crouch: 0, attack: false, pulse: false,
  legAFwd: 0, legALift: 0, legBFwd: 0, legBLift: 0,
  armAFwd: 0, armALift: 0, armBFwd: 0, armBLift: 0,
  robeFlare: 0, hairRise: 0, hairTrail: 0,
};

function computeAramPose(player) {
  const P = ARAM_POSE;
  P.float = 0; P.lean = 0; P.crouch = 0; P.attack = false; P.pulse = false;
  P.legAFwd = 0; P.legALift = 0; P.legBFwd = 0; P.legBLift = 0;
  P.armAFwd = 0; P.armALift = 0; P.armBFwd = 0; P.armBLift = 0;
  P.robeFlare = 0;
  P.hairRise = Math.max(-4, Math.min(6, player.vy * 0.008));
  P.hairTrail = -Math.min(Math.abs(player.vx) * 0.015, 6);

  if ((player.attackAnimT || 0) > 0) {             // point forward + glow
    P.attack = true; P.lean = 3;
    P.armAFwd = 14; P.armALift = 1; P.armBFwd = -4;
    return;
  }
  if ((player.specialAnimT || 0) > 0) {            // outline pulse
    P.pulse = true; P.crouch = 3; P.lean = 2;
    P.armAFwd = 5; P.armALift = 3; P.armBFwd = -4; P.armBLift = 3;
    return;
  }

  if (!player.onGround) {
    if (player.vy < -60) {                         // rising: robe flares down
      P.robeFlare = 2; P.legALift = 4; P.legAFwd = 3;
      P.armAFwd = 4; P.armALift = -5; P.armBFwd = -5; P.armBLift = -3;
    } else {                                       // falling: robe rises
      P.robeFlare = -3; P.legAFwd = 4; P.legBFwd = -4; P.legBLift = 2;
      P.armAFwd = 5; P.armALift = -4; P.armBFwd = -6; P.armBLift = -2;
    }
    return;
  }

  if (player.vx !== 0) {                           // gliding run
    const s = Math.sin(player.runTime * ANIM_RUN_CYCLE);
    P.lean = 2;
    P.legAFwd = s * 7;  P.legALift = Math.max(0, s) * 4;
    P.legBFwd = -s * 7; P.legBLift = Math.max(0, -s) * 4;
    P.armAFwd = -s * 8; P.armALift = Math.max(0, -s) * 3;
    P.armBFwd = s * 8;  P.armBLift = Math.max(0, s) * 3;
  } else {                                         // idle: subtle float
    P.float = Math.sin(player.animTime * ANIM_IDLE_SPEED * 0.7) * 1.6;
  }
}

// The robe: slim shoulders widening to the hem, inner robe in the front
// opening, hem + front trim, belt line. `flare` lifts/lowers the hem edge.
function drawAramRobe(ctx) {
  const P = ARAM_POSE;
  const y0 = -33 + P.float + P.crouch;                 // shoulder line
  const y1 = -4 + P.float + P.crouch + P.robeFlare;    // hem line
  ctx.fillStyle = ARAM_PALETTE.inner;
  part(ctx, -6 + P.lean * 0.3, y0 + 3, 12, y1 - y0 - 3);   // inner robe front
  ctx.fillStyle = ARAM_PALETTE.robe;
  part(ctx, -8 + P.lean * 0.4, y0, 6, y1 - y0);            // outer back panel
  part(ctx, 2 + P.lean * 0.4, y0, 7, y1 - y0);             // outer front panel
  part(ctx, -9 + P.lean * 0.2, y1 - 5, 19, 5);             // hem band
  ctx.fillStyle = 'rgba(199,125,255,0.5)';                 // robe trim (light)
  ctx.fillRect(-4 + P.lean * 0.4, y0 + 2, 2, y1 - y0 - 6);  // front trim line
  ctx.fillRect(-9 + P.lean * 0.2, y1 - 2, 19, 2);           // hem trim
  ctx.fillStyle = ARAM_PALETTE.robe;
  part(ctx, -6 + P.lean * 0.3, -18 + P.crouch, 13, 3);      // belt line
}

// Feet peeking from the robe hem + the leg swing tracks.
function drawAramLegs(ctx) {
  const P = ARAM_POSE;
  ctx.fillStyle = ARAM_PALETTE.inner;
  part(ctx, -4 + P.legBFwd, -6 - P.legBLift, 5, 6);        // back foot
  part(ctx, 1 + P.legAFwd, -6 - P.legALift, 5, 6);         // front foot
}

// Silver-white hair: cap + long flowing side strands; glowing purple
// pupils; the subtle smile (§18.3 face).
function drawAramHead(ctx, player) {
  const P = ARAM_POSE;
  const hx = 1 + P.lean;
  const hy = -40 + P.float + P.crouch;
  ctx.fillStyle = ARAM_PALETTE.hair;
  part(ctx, hx - 6, hy - 7, 11, 4);                     // hair cap
  part(ctx, hx - 7, hy - 5, 4, 9);                      // back of the head
  for (let i = 0; i < 3; i += 1) {                      // flowing long hair
    const sway = Math.sin(player.animTime * ANIM_HAIR_SWAY + i * 0.8) * 1.5;
    const trail = P.hairTrail * (i + 1) / 3;
    const rise = P.hairRise * (i + 1) / 3;
    part(ctx, hx - 8 + trail + sway, hy - 2 + i * 7 - rise, 5, 9);
  }
  ctx.fillStyle = ARAM_PALETTE.skin;
  part(ctx, hx - 4, hy - 3, 9, 9);                      // face
  ctx.fillStyle = ARAM_PALETTE.inner;
  part(ctx, hx - 2, hy, 2, 2);                          // far eye
  part(ctx, hx + 3, hy, 2, 2);                          // near eye
  ctx.fillStyle = ARAM_PALETTE.pupil;
  ctx.fillRect(hx - 2, hy, 2, 2);                       // glowing pupils
  ctx.fillRect(hx + 3, hy, 2, 2);                       // (light: no outline)
  ctx.fillStyle = 'rgba(230,212,239,0.85)';
  ctx.fillRect(hx, hy + 5, 4, 1);                       // subtle smile
}

// Sleeve with rune marks (§18.3: magic runes on the sleeves) + hand. The
// attack pose glows at the fingertip.
function drawAramArm(ctx, rootX, fwd, lift) {
  const P = ARAM_POSE;
  const sy = -31 + P.float + P.crouch;
  ctx.fillStyle = ARAM_PALETTE.robe;
  if (P.attack && rootX > 0) {                        // point forward + glow
    part(ctx, rootX, sy + 1, fwd, 4);                 // extended sleeve
    ctx.fillStyle = ARAM_PALETTE.skin;
    part(ctx, rootX + fwd, sy, 3, 4);                 // hand
    ctx.fillStyle = ARAM_PALETTE.orb;
    ctx.fillRect(rootX + fwd + 3, sy, 4, 4);          // purple glow at fingertip
    return;
  }
  part(ctx, rootX, sy, 4, 7);                         // upper sleeve
  const kx = rootX + fwd * 0.5;
  part(ctx, kx, sy + 6, 5, 6);                        // forearm sleeve
  ctx.fillStyle = ARAM_PALETTE.pupil;                  // rune marks (light)
  ctx.fillRect(kx + 1, sy + 7, 1, 1);
  ctx.fillRect(kx + 3, sy + 9, 1, 1);
  ctx.fillStyle = ARAM_PALETTE.skin;
  part(ctx, kx, sy + 12 - Math.max(0, lift), 4, 3);   // hand
}

// The floating orb with its pulsing glow (§18.3) — drawn after the body,
// bobbing on its own phase; two translucent halos pulse via animTime.
function drawAramOrb(ctx, player) {
  const P = ARAM_POSE;
  const ox = 12 + P.lean;
  const oy = -26 + Math.sin(player.animTime * ANIM_IDLE_SPEED) * 2 + P.crouch;
  const pulse = 0.5 + Math.sin(player.animTime * 6) * 0.5;
  ctx.fillStyle = 'rgba(199,125,255,' + (0.10 + pulse * 0.10).toFixed(3) + ')';
  ctx.beginPath();
  ctx.arc(ox, oy, 8 + pulse * 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(199,125,255,' + (0.22 + pulse * 0.18).toFixed(3) + ')';
  ctx.beginPath();
  ctx.arc(ox, oy, 5.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = ARAM_PALETTE.orb;
  ctx.beginPath();
  ctx.arc(ox, oy, 3, 0, Math.PI * 2);
  ctx.fill();
}

function drawAram(ctx, player, game) {
  computeAramPose(player);
  let sx = 1;
  let sy = 1;
  const useJump = player.lastJumpAt > player.lastLandAt;
  const stamp = useJump ? player.lastJumpAt : player.lastLandAt;
  const t = game.gameTime - stamp;
  if (stamp >= 0 && t >= 0 && t < SQUASH_DURATION) {
    const f = (1 - t / SQUASH_DURATION) ** 2;
    sy = 1 + ((useJump ? SQUASH_JUMP_Y : SQUASH_LAND_Y) - 1) * f;
    sx = 1 + ((useJump ? SQUASH_JUMP_X : SQUASH_LAND_X) - 1) * f;
  }
  const flip = player.facing === 'left' ? -1 : 1;
  ctx.save();
  ctx.translate(player.x + player.w / 2, player.y + player.h);
  ctx.scale(sx * flip * CHAR_ART_SCALE, sy * CHAR_ART_SCALE);
  const drawArt = () => {
    drawAramArm(ctx, -4, ARAM_POSE.armBFwd, ARAM_POSE.armBLift);  // back arm
    drawAramRobe(ctx);
    drawAramLegs(ctx);
    drawAramHead(ctx, player);
    drawAramArm(ctx, 4, ARAM_POSE.armAFwd, ARAM_POSE.armALift);   // front arm
  };
  OUTLINE_PASS = true;               // §57 silhouette outline
  drawArt();
  OUTLINE_PASS = false;
  drawArt();
  if (ARAM_POSE.pulse) {                           // §18.3 outline pulse
    ctx.fillStyle = 'rgba(157,78,221,0.28)';
    ctx.fillRect(-10, -46, 21, 46);
  }
  drawAramOrb(ctx, player);                        // light, above the outline
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Patroller procedural enemy (SPEC §30, §31) — Phase 6
// ---------------------------------------------------------------------------
// Dark blocky body of stacked armor cubes (15 total: 4 rows x 3 torso
// cubes + 2 pauldrons + 1 helm — inside §30's 15-20 range), long red scarf,
// two glowing white eyes (the ONLY shadowBlur use, §30/§78), and a short
// dark blade. Local space: feet-center anchor, +x = facing direction.
// Poses are DERIVED presentation state read from entity facts (walkTime /
// hurtT / staggerT / state) — nothing is ever written back (§70).
function drawPatroller(ctx, e) {
  const flip = e.facing === 'left' ? -1 : 1;
  const walking = e.state === 'walk';
  const walk = walking ? Math.sin(e.walkTime * ANIM_ENEMY_WALK) : 0;
  const bob = walking ? Math.abs(walk) * 1.5 : 0;
  const shake = e.hurtT > 0 ? Math.sin(e.hurtT * 80) * 2 : 0;   // §31 ~2px shake
  ctx.save();
  ctx.translate(e.x + e.w / 2 + shake, e.y + e.h);
  ctx.scale(flip, 1);
  const dark = e.staggerT > 0 ? 1 : 0;   // staggered: one tone darker

  // legs: two dark stubs alternating with the walk cycle
  ctx.fillStyle = ENEMY_ARMOR[0];
  ctx.fillRect(-13 + walk * 2, -12, 10, 12);
  ctx.fillRect(3 - walk * 2, -12, 10, 12);

  // torso: 4 rows x 3 stacked armor cubes (12) with deterministic jitter
  for (let row = 0; row < 4; row += 1) {
    const y = -22 - row * 9 + bob;
    for (let col = 0; col < 3; col += 1) {
      ctx.fillStyle = ENEMY_ARMOR[(row * 3 + col + dark) % ENEMY_ARMOR.length];
      const cw = 11 + ((row * 5 + col * 3) % 3);
      const jx = ((row * 7 + col * 2) % 5) - 2;
      ctx.fillRect(-17 + col * 11 + jx, y, cw, 9);
    }
  }
  // pauldrons (2 cubes) + helm (1 cube with a crown ridge)
  ctx.fillStyle = ENEMY_ARMOR[(3 + dark) % ENEMY_ARMOR.length];
  ctx.fillRect(-21, -50 + bob, 9, 8);
  ctx.fillRect(12, -50 + bob, 9, 8);
  ctx.fillStyle = ENEMY_ARMOR[(2 + dark) % ENEMY_ARMOR.length];
  ctx.fillRect(-8, -62 + bob, 16, 12);
  ctx.fillRect(-5, -65 + bob, 10, 3);

  // long red scarf trailing behind (§30) — sways with the walk cycle
  const sway = Math.sin(e.walkTime * ANIM_ENEMY_WALK * 0.5) * 3;
  ctx.fillStyle = ENEMY_CLOTH[0];
  ctx.fillRect(-24 - Math.abs(walk) * 3, -48 + bob, 13, 30);
  ctx.fillStyle = ENEMY_CLOTH[1];
  ctx.fillRect(-28 - Math.abs(walk) * 4 + sway, -42 + bob, 10, 22);

  // short dark blade at the front hip (§30)
  ctx.fillStyle = ENEMY_ARMOR[0];
  ctx.fillRect(14, -28 + bob, 3, 14);

  // two glowing white eyes — the ONLY shadowBlur use (§30, §78)
  ctx.save();
  ctx.shadowColor = ENEMY_EYE;
  ctx.shadowBlur = 6;
  ctx.fillStyle = ENEMY_EYE;
  ctx.fillRect(-3, -58 + bob, 3, 3);
  ctx.fillRect(3, -58 + bob, 3, 3);
  ctx.restore();

  // §31 hurt flash overlay
  if (e.hurtT > 0) {
    ctx.fillStyle = 'rgba(240, 240, 240, 0.30)';
    ctx.fillRect(-22, -66 + bob, 44, 66);
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// World FX layers (SPEC §21, §50, §57) — Phase 7
// ---------------------------------------------------------------------------
// §21 projectiles. Sara's thrown knife: steel blade + bright edge streak.
// Aram's magic shot: purple orb with a pulsing halo (no shadowBlur — §78
// reserves it for enemy eyes). Both fly in world space, culled to the view.

function drawProjectiles(ctx, projectiles, cam) {
  for (let i = 0; i < projectiles.length; i += 1) {
    const p = projectiles[i];
    if (p.x + p.w < cam.x - 20 || p.x > cam.x + VIEW_W + 20) continue;
    if (p.kind === 'knife') {
      ctx.fillStyle = '#8fa3c8';
      ctx.fillRect(p.x, p.y, 9, 3);                     // blade shaft
      ctx.fillStyle = '#dfe8ff';
      ctx.fillRect(p.x + (p.dir > 0 ? 7 : 0), p.y, 2, 3);   // leading edge
      ctx.fillStyle = '#5a4030';
      ctx.fillRect(p.x + (p.dir > 0 ? 0 : 7), p.y - 1, 2, 5); // hilt cross
    } else {                                            // magic shot
      const pulse = 0.5 + Math.sin((p.x + p.y) * 0.05) * 0.5;
      ctx.fillStyle = 'rgba(199,125,255,' + (0.16 + pulse * 0.14).toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(p.x + 4, p.y + 4, 8 + pulse * 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#c77dff';
      ctx.beginPath();
      ctx.arc(p.x + 4, p.y + 4, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#eee8ff';
      ctx.fillRect(p.x + 3, p.y + 2, 2, 2);            // bright core
    }
  }
}

// §57 feedback particles: fading colored chips; §78-bounded on the game
// state (never more than PARTICLE_CAP). Pure presentation.
function drawParticles(ctx, particles, cam) {
  const left = cam.x - 20;
  const right = cam.x + VIEW_W + 20;
  for (let i = 0; i < particles.length; i += 1) {
    const p = particles[i];
    if (p.x < left || p.x > right) continue;
    const a = Math.max(0, p.life / p.maxLife);
    ctx.globalAlpha = a;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;
}

// §24 shockwave/slam impact rings: expanding + fading circle strokes.
function drawRings(ctx, rings, cam) {
  for (let i = 0; i < rings.length; i += 1) {
    const r = rings[i];
    if (r.x + r.r < cam.x - 20 || r.x - r.r > cam.x + VIEW_W + 20) continue;
    const k = r.t / r.T;                                // 0 → 1 expansion
    ctx.strokeStyle = r.color;
    ctx.globalAlpha = 1 - k;
    ctx.lineWidth = 3 - k * 2;
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.r * (0.35 + 0.65 * k), 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.lineWidth = 1;
}

// §50 environmental gates. Magic barrier (active): a translucent purple
// wall with deterministic shimmering vertical bands + stone posts; once
// dispelled it leaves nothing. Time-locked door (closed): a stone slab
// with a frozen rune clock face; open: the slab is drawn swung aside as a
// thin recessed edge, pocket passable.
function drawGates(ctx, gates, cam, gameTime) {
  for (let i = 0; i < gates.length; i += 1) {
    const g = gates[i];
    if (g.x + g.w < cam.x - 20 || g.x > cam.x + VIEW_W + 20) continue;
    if (g.kind === 'magicBarrier') {
      if (g.state !== 'active') continue;              // dispelled: gone
      ctx.fillStyle = 'rgba(120,60,190,0.34)';         // wall body
      ctx.fillRect(g.x, g.y, g.w, g.h);
      for (let b = 0; b < 4; b += 1) {                 // shimmer bands
        const off = Math.sin(gameTime * 2.2 + b * 1.7) * 2;
        ctx.fillStyle = 'rgba(199,125,255,' + (0.22 + b * 0.05).toFixed(3) + ')';
        ctx.fillRect(g.x + 1 + b * (g.w / 4) + off, g.y + 4, 3, g.h - 8);
      }
      ctx.fillStyle = '#c77dff';                       // top/bottom anchor runes
      ctx.fillRect(g.x - 1, g.y - 3, g.w + 2, 3);
      ctx.fillRect(g.x - 1, g.y + g.h, g.w + 2, 3);
    } else if (g.kind === 'timeDoor') {
      if (g.state === 'open') {                        // swung-aside slab
        ctx.fillStyle = '#2a2f3a';
        ctx.fillRect(g.x, g.y, 5, g.h);
        ctx.fillStyle = '#1a1e28';
        ctx.fillRect(g.x + g.w - 5, g.y, 5, g.h);
        continue;
      }
      ctx.fillStyle = '#2a2f3a';                       // stone slab
      ctx.fillRect(g.x, g.y, g.w, g.h);
      ctx.fillStyle = '#3a4050';
      ctx.fillRect(g.x + 2, g.y + 2, g.w - 4, 6);      // lintel band
      ctx.fillRect(g.x + 2, g.y + g.h - 8, g.w - 4, 6);
      // the frozen rune clock: ring + hands locked mid-tick (deterministic)
      const cx = g.x + g.w / 2;
      const cy = g.y + g.h / 2;
      ctx.strokeStyle = '#c77dff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();                                  // frozen hands
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + 5, cy - 3);
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx - 2, cy + 5);
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.fillStyle = '#c77dff';
      ctx.fillRect(cx - 1, cy - 1, 2, 2);              // heart of the lock
    }
  }
}

// §23/§18.1 dash afterimages: the trail records hold recent dash positions;
// each renders as a character-colored silhouette fading 0.4 → 0.
function drawDashTrail(ctx, player, game) {
  const trail = player.trail;
  if (!trail || trail.length === 0 || player.dashT <= 0) return;
  const color = CHARACTER_COLORS[player.character] || CHARACTER_COLORS.sara;
  for (let i = 0; i < trail.length; i += 1) {
    const age = game.gameTime - trail[i].t;
    const a = Math.max(0, 0.4 * (1 - age / 0.25));      // 0.4 → 0 over 0.25 s
    if (a <= 0) continue;
    ctx.globalAlpha = a;
    ctx.fillStyle = color;
    ctx.fillRect(trail[i].x, trail[i].y, player.w, player.h);
  }
  ctx.globalAlpha = 1;
}

// §25.2 Shield aura: two translucent circles around the active character
// while the shield holds (light — never outlined, never a gameplay body).
function drawShieldAura(ctx, player, game) {
  if (player.shieldT <= 0) return;
  const cx = player.x + player.w / 2;
  const cy = player.y + player.h / 2;
  const pulse = 0.5 + Math.sin(game.gameTime * 9) * 0.5;
  ctx.strokeStyle = 'rgba(199,125,255,' + (0.5 + pulse * 0.3).toFixed(3) + ')';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, player.w * 0.85, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(238,232,255,' + (0.18 + pulse * 0.14).toFixed(3) + ')';
  ctx.beginPath();
  ctx.arc(cx, cy, player.w * 0.85 + 4 + pulse, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 1;
}

// §25.1 slow-motion cue: a faint purple time-sheen over the screen while
// the time domain is shifted. Presentation only — no gameplay effect.
function drawSlowMoTint(ctx) {
  ctx.fillStyle = 'rgba(157,78,221,0.07)';
  ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
}

// §20.2 unlock tutorials: 3-5 s NON-BLOCKING hints — a translucent plate
// bottom-center that fades out over the final 0.5 s. Gameplay never pauses.
function drawTutorial(ctx, game) {
  const tut = game.tutorial;
  if (!tut) return;
  const remain = tut.until - game.gameTime;
  if (remain <= 0) return;
  const a = Math.min(1, remain / 0.5);                 // fade-out tail
  ctx.globalAlpha = a;
  ctx.fillStyle = 'rgba(6,8,16,0.72)';
  const tw = 560;
  ctx.fillRect((LOGICAL_W - tw) / 2, 632, tw, 40);
  ctx.fillStyle = 'rgba(199,125,255,0.55)';
  ctx.fillRect((LOGICAL_W - tw) / 2, 632, tw, 2);
  ctx.fillRect((LOGICAL_W - tw) / 2, 670, tw, 2);
  ctx.fillStyle = '#e6d4ef';
  ctx.font = 'bold 17px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(tut.text, LOGICAL_W / 2, 658);
  ctx.textAlign = 'left';
  ctx.globalAlpha = 1;
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

  // ---- §55 (amended): the Light Behind the Castle --------------------------
  // Act-driven intensity: 0 in Act 1 (pitch black, stars only), faint in
  // Act 2, clear in Act 3; chapter 3-5 flickers during the final battle.
  // Deterministic composite sines — no randomness (§72).
  function glowIntensity(game, gameTime) {
    if (game.currentAct < 2) return 0;
    let k = game.currentAct === 2 ? 0.45 : 1.0;
    if (game.currentChapter === '3-5') {
      k *= 0.7 + 0.3 * (0.5 + 0.5 * Math.sin(gameTime * 6.0))
                 * (0.6 + 0.4 * Math.sin(gameTime * 2.3));
    }
    return k;
  }

  // One glow dome: stacked translucent wide rects rising from the horizon
  // base line behind `cx`. Rect-only art; no shadowBlur (§78).
  function drawGlowDome(cx, k, baseY) {
    if (k <= 0) return;
    ctx.fillStyle = GLOW_LIGHT;
    for (let i = 0; i < GLOW_SHELLS.length; i += 1) {
      const s = GLOW_SHELLS[i];
      ctx.globalAlpha = s.a * k;
      ctx.fillRect(cx - s.w / 2, baseY - s.h, s.w, s.h);
    }
    ctx.globalAlpha = 1;
  }

  // The distant horizon band (Act 2+): the glow plus its tiny castle
  // silhouette stand-in. The stand-in fades out as the REAL castle mass
  // takes over during the chapter 3-4 approach (main-castle screen x below
  // ~2400 starts fading, fully gone by ~1200).
  function drawLightBehindCastle(cam, game, gameTime) {
    const k = glowIntensity(game, gameTime);
    if (k <= 0) return;                     // Act 1: pitch black (§55)
    let x = GLOW_ANCHOR_LAYER_X - cam.x * PARALLAX_GLOW;
    if (x < GLOW_HOLD_X) x = GLOW_HOLD_X;   // rides at the horizon anchor
    const offY = cam.y * PARALLAX_GLOW;
    drawGlowDome(x, k, GLOW_HORIZON_Y - offY);
    const mainX = CASTLE_LAYER_X - cam.x * PARALLAX_CASTLE;
    const fade = Math.max(0, Math.min(1, (mainX - 1200) / 1200));
    if (fade > 0) {
      ctx.globalAlpha = fade;
      ctx.fillStyle = CASTLE_TONE;
      for (let i = 0; i < DISTANT_TOWERS.length; i += 1) {
        const t = DISTANT_TOWERS[i];
        ctx.fillRect(x + t.x, GLOW_HORIZON_Y - t.h - offY, t.w, t.h + 20);
        ctx.fillRect(x + t.x + t.w / 2 - 3, GLOW_HORIZON_Y - t.h - 10 - offY, 6, 10);
      }
      ctx.globalAlpha = 1;
    }
  }

  // ---- §55 layer 3: gothic castle + sharp spires + orange windows --------
  function drawCastle(cam, game, gameTime) {
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
    // final stretch). The "Light Behind the Castle" renders BEHIND the
    // spires (amended §55): the distant stand-in has faded out by now.
    const sx = CASTLE_LAYER_X - offX;
    if (sx + 360 < 0 || sx > LOGICAL_W) return;
    drawGlowDome(sx + 170, glowIntensity(game, gameTime) * 0.9, CASTLE_BASE_Y - offY);
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

  // ---- atmosphere (amended §55): horizon light band -------------------------
  // Act 3: "the horizon lightens" — a soft light band along the horizon,
  // drawn over the background bands, under the world. Cached gradient.
  let horizonGradient = null;
  function drawHorizonLight(game) {
    if (game.currentAct < 3) return;
    if (!horizonGradient) {
      horizonGradient = ctx.createLinearGradient(0, 500, 0, 620);
      horizonGradient.addColorStop(0, 'rgba(232, 240, 255, 0)');
      horizonGradient.addColorStop(0.55, 'rgba(232, 240, 255, 0.05)');
      horizonGradient.addColorStop(1, 'rgba(232, 240, 255, 0)');
    }
    ctx.fillStyle = horizonGradient;
    ctx.fillRect(0, 500, LOGICAL_W, 120);
  }

  function drawPlatforms(platforms, cam, brokenIds) {
    // Geometry rendering (§55 platform tones + amended edge treatment).
    // Render-only culling against the ZOOMED camera view (§42/§78): the
    // visible world window is VIEW_W wide (§7/§53). Source is the STATIC
    // geometry list; breakables broken this run are skipped (their absence
    // from the active collision view IS the §24/§50 gate mechanic).
    const left = cam.x - 8;
    const right = cam.x + VIEW_W + 8;
    for (let i = 0; i < platforms.length; i += 1) {
      const p = platforms[i];
      if (p.x + p.w < left || p.x > right) continue;
      if (p.breakable && brokenIds && brokenIds.has(p.id)) continue;
      ctx.fillStyle = GROUND_FILL;
      ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.fillStyle = GROUND_EDGE;
      ctx.fillRect(p.x, p.y, p.w, 3);            // lit top edge
      // Amended §55: subtle 1-2px dark shadow under each platform edge +
      // side shading — the platform visual treatment matches the x1.3
      // world scale.
      ctx.fillStyle = PLATFORM_SHADOW;
      ctx.fillRect(p.x, p.y + p.h - 2, p.w, 2);            // under-edge shadow
      ctx.fillRect(p.x, p.y + 3, 2, p.h - 5);              // left side shade
      ctx.fillRect(p.x + p.w - 2, p.y + 3, 2, p.h - 5);    // right side shade
    }
  }

  // ---- enemies (§30/§31/§42) -------------------------------------------------
  function drawEnemies(enemies, cam) {
    // §31: dead enemies leave presentation (a cosmetic memorial is optional,
    // §28 — not authored). Render-only culling (§42/§78) against the zoomed
    // view; gameplay entities are NOT removed, merely skipped.
    for (let i = 0; i < enemies.length; i += 1) {
      const e = enemies[i];
      if (e.dead) continue;
      if (e.x + e.w < cam.x - 20 || e.x > cam.x + VIEW_W + 20) continue;
      if (e.type === 'patroller') drawPatroller(ctx, e);
    }
  }

  function drawPlayer(game, player, level) {
    // Render-only culling (§78): never draw what the camera cannot see;
    // gameplay entities are NOT removed, merely skipped in presentation.
    if (player.x + player.w < game.camera.x - 20
        || player.x > game.camera.x + VIEW_W + 20) return;
    // §57 amended: soft ellipse drop shadow under the active character
    // (before the sprite, so the character stands ON the shadow).
    drawDropShadow(ctx, player, level);
    // §23 dash afterimages trail behind the active sprite.
    drawDashTrail(ctx, player, game);
    // §22: the sprite flashes ~20 Hz while invulnerable.
    const blink = player.invuln > 0 && Math.floor(game.gameTime * 20) % 2 === 0;
    if (blink) ctx.globalAlpha = 0.35;
    if (player.character === 'sara') drawSara(ctx, player, game);
    else if (player.character === 'raha') drawRaha(ctx, player, game);
    else if (player.character === 'aram') drawAram(ctx, player, game);
    else drawPlayerPlaceholder(ctx, player);
    if (blink) ctx.globalAlpha = 1;
    // §25.2 Shield aura wraps the sprite while active.
    drawShieldAura(ctx, player, game);
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
  // here (§70): the world layer renders through the global ZOOM transform
  // (§7/§53) — ctx.scale(ZOOM) then translate by the camera position — so
  // the visible gameplay window is VIEW_W x VIEW_H world units; each
  // parallax layer offsets by cam * its factor in logical canvas space.
  // Phase 7 adds the §54 screen-shake offset (deterministic decaying
  // oscillation — presentation only, never fed back into gameplay) and the
  // world FX layers (gates under entities, projectiles/particles above).
  function render(game, level, player, enemies) {
    const cam = game.camera;
    // §54: offset = mag * exp(-30 * age) * oscillation — the 30/s decay
    // envelope bounds every shake well inside its authored duration.
    let shakeX = 0;
    let shakeY = 0;
    if (game.shake) {
      const s = game.shake;
      const age = s.T - s.t;
      const env = Math.exp(-30 * age);
      shakeX = Math.sin(age * 63) * s.mag * env;
      shakeY = Math.cos(age * 81) * s.mag * env * 0.7;
    }
    ctx.save();
    ctx.translate(shakeX, shakeY);
    drawSky();
    drawStars(cam, game.gameTime);
    drawClouds(cam);
    drawLightBehindCastle(cam, game, game.gameTime);   // amended §55 canon
    drawCastle(cam, game, game.gameTime);
    drawTrees(cam);
    drawHorizonLight(game);                            // Act 3: horizon lightens
    ctx.save();
    ctx.scale(ZOOM, ZOOM);                             // §7/§53: global ZOOM 1.25
    ctx.translate(-cam.x, -cam.y);                     // world space (§53)
    drawPlatforms(level.allPlatforms, cam, game.brokenPlatformIds);
    drawGates(ctx, level.gates, cam, game.gameTime);   // §50 gates
    drawRings(ctx, game.rings, cam);                   // §24 impact rings
    drawEnemies(enemies || [], cam);
    drawPlayer(game, player, level);
    drawProjectiles(ctx, game.projectiles, cam);       // §21 knives + magic
    drawParticles(ctx, game.particles, cam);           // §57 feedback chips
    ctx.restore();
    drawGrass(cam);
    if (game.slowMoActive) drawSlowMoTint(ctx);        // §25.1 time-sheen
    ctx.restore();                                     // end §54 shake frame
    drawFog();
    drawTutorial(ctx, game);                           // §20.2 non-blocking hint
    drawVignette();
  }

  resize();
  return { resize, render, toLogical, view };
}
