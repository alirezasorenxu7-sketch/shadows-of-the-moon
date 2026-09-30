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
// 3-5 flicker). Phase 12 authors the §52/§55 payoff: after the choice the
// moon RISES from behind the castle (drawMoonRise), and the open moon gate
// glows at the world's end.
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
  COLLECTIBLE_SCALE,
  COIN_PALETTE,
  RARE_COIN_PALETTE,
  CRYSTAL_PALETTE,
  HUD_HP_GRADS,
  TEXT_MAIN,
  TEXT_DIM,
  DAMAGE_FLASH_T,
  DAMAGE_FLASH_ALPHA,
  DASH_TRAIL_FADE,
  DASH_COOLDOWN,
  SLAM_COOLDOWN,
  SLOWMO_COOLDOWN,
  LIGHTNING_PERIOD,
  LIGHTNING_FLASH_T,
  WIND_SWAY_PX,
  WIND_SWAY_RATE,
  TORCH_LIGHT_RANGE,
  TORCH_GLOW_ALPHA,
  MOON_RISE_DURATION,
} from './constants.js';
import { STORY_DURATIONS } from './story.js';

// §67/§68 story presentation helpers: stable per-id phase (§72 — never
// Math.random) for stone engraving offsets and statue shimmer.
function storyHash(id) {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) % 2147483647;
  return h;
}

// Word-wrap for the fixed-width plates (authoritative text, §67 corpus).
function wrapLines(ctx, text, maxWidth, maxLines) {
  const words = String(text).split(' ');
  const lines = [];
  let line = '';
  for (let i = 0; i < words.length; i += 1) {
    const probe = line ? line + ' ' + words[i] : words[i];
    if (ctx.measureText(probe).width > maxWidth && line) {
      lines.push(line);
      line = words[i];
      if (lines.length === maxLines) break;
    } else {
      line = probe;
    }
  }
  if (lines.length < maxLines && line) lines.push(line);
  return lines;
}

// Presentation fade: ramp in over `fin`, out over `fout` before expiry.
function storyAlpha(now, until, total, fin, fout) {
  const remain = until - now;
  if (remain <= 0) return 0;
  const age = total - remain;
  const aIn = Math.min(1, age / fin);
  const aOut = Math.min(1, remain / fout);
  return Math.max(0, Math.min(aIn, aOut));
}

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
  // §34 telegraph backward step: rendered as a 4px backward lean offset.
  ctx.translate(e.x + e.w / 2 + shake - (e.attackWindup > 0 ? flip * 4 : 0), e.y + e.h);
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

// §29 CHASER — the lean runner (42x62). Narrower cube stack, forward torso
// lean (stronger while chasing), and a long scarf that streams back with
// speed. Same §30 construction language as the Patroller.
function drawChaser(ctx, e) {
  const flip = e.facing === 'left' ? -1 : 1;
  const s = e.scale || 1;
  const running = e.state === 'run';
  const walking = e.state === 'walk' || running;
  const cycle = e.state === 'run' ? 16 : 13;          // faster cycle band
  const walk = walking ? Math.sin(e.walkTime * cycle) : 0;
  const stride = running ? 4 : 3;
  const bob = walking ? Math.abs(walk) * 1.8 : 0;
  const shake = e.hurtT > 0 ? Math.sin(e.hurtT * 80) * 2 : 0;
  const chasing = e.chaseState === 'chase';
  const lean = chasing ? 6 : 3;                       // forward torso lean
  ctx.save();
  // §34 telegraph backward step: rendered as a 4px backward lean offset.
  ctx.translate(e.x + e.w / 2 + shake - (e.attackWindup > 0 ? flip * 4 : 0), e.y + e.h);
  ctx.scale(flip * s, s);
  const dark = e.staggerT > 0 ? 1 : 0;

  // legs: long strides
  ctx.fillStyle = ENEMY_ARMOR[0];
  ctx.fillRect(-12 + walk * stride, -13, 9, 13);
  ctx.fillRect(3 - walk * stride, -13, 9, 13);

  // torso: 4 rows x 3 lean cubes, leaning forward with height
  for (let row = 0; row < 4; row += 1) {
    const y = -24 - row * 9 + bob;
    const lx = (row / 3) * lean;
    for (let col = 0; col < 3; col += 1) {
      ctx.fillStyle = ENEMY_ARMOR[(row * 3 + col + dark) % ENEMY_ARMOR.length];
      const cw = 10 + ((row * 5 + col * 3) % 3);
      const jx = ((row * 7 + col * 2) % 5) - 2;
      ctx.fillRect(-15 + col * 10 + jx + lx, y, cw, 9);
    }
  }
  // small pauldrons + close helm
  ctx.fillStyle = ENEMY_ARMOR[(3 + dark) % ENEMY_ARMOR.length];
  ctx.fillRect(-19, -51 + bob, 8, 8);
  ctx.fillRect(11, -51 + bob, 8, 8);
  ctx.fillStyle = ENEMY_ARMOR[(2 + dark) % ENEMY_ARMOR.length];
  ctx.fillRect(-7, -62 + bob, 14, 12);
  ctx.fillRect(-4, -65 + bob, 8, 3);

  // long scarf STREAMING back (§30) — longer + straighter at chase speed
  const stream = chasing || running ? 26 : 14;
  const sway = Math.sin(e.walkTime * cycle * 0.5) * 2;
  ctx.fillStyle = ENEMY_CLOTH[0];
  ctx.fillRect(-24 - stream * 0.4, -46 + bob, 10, 26);
  ctx.fillStyle = ENEMY_CLOTH[1];
  ctx.fillRect(-30 - stream + Math.abs(walk) * 2, -40 + bob + sway, stream, 9);
  ctx.fillStyle = ENEMY_CLOTH[2];
  ctx.fillRect(-34 - stream + Math.abs(walk) * 3, -33 + bob + sway, stream * 0.6, 6);

  // short dark blade (§30)
  ctx.fillStyle = ENEMY_ARMOR[0];
  ctx.fillRect(13, -26 + bob, 3, 13);

  // two glowing white eyes — the ONLY shadowBlur use (§30, §78)
  ctx.save();
  ctx.shadowColor = ENEMY_EYE;
  ctx.shadowBlur = 6;
  ctx.fillStyle = ENEMY_EYE;
  ctx.fillRect(-3 + lean * 0.4, -58 + bob, 3, 3);
  ctx.fillRect(3 + lean * 0.4, -58 + bob, 3, 3);
  ctx.restore();

  if (e.hurtT > 0) {
    ctx.fillStyle = 'rgba(240, 240, 240, 0.30)';
    ctx.fillRect(-20, -66 + bob, 40, 66);
  }
  ctx.restore();
}

// §29 ARMORED — the heavy tank (44x65). Thicker plating (5 rows x 4 wide),
// a faint red chest arrow (the §29 tell), extra chest plate, big pauldrons.
function drawArmored(ctx, e) {
  const flip = e.facing === 'left' ? -1 : 1;
  const s = e.scale || 1;
  const walking = e.state === 'walk' || e.state === 'run';
  const walk = walking ? Math.sin(e.walkTime * 9) : 0;
  const bob = walking ? Math.abs(walk) * 1.2 : 0;
  const shake = e.hurtT > 0 ? Math.sin(e.hurtT * 80) * 2 : 0;
  ctx.save();
  // §34 telegraph backward step: rendered as a 4px backward lean offset.
  ctx.translate(e.x + e.w / 2 + shake - (e.attackWindup > 0 ? flip * 4 : 0), e.y + e.h);
  ctx.scale(flip * s, s);
  const dark = e.staggerT > 0 ? 1 : 0;

  // thick legs
  ctx.fillStyle = ENEMY_ARMOR[0];
  ctx.fillRect(-15 + walk * 2, -14, 12, 14);
  ctx.fillRect(3 - walk * 2, -14, 12, 14);

  // torso: 5 rows x 4 stacked armor cubes (20 — §30's cap)
  for (let row = 0; row < 5; row += 1) {
    const y = -26 - row * 9 + bob;
    for (let col = 0; col < 4; col += 1) {
      ctx.fillStyle = ENEMY_ARMOR[(row * 4 + col + dark) % ENEMY_ARMOR.length];
      const cw = 11 + ((row * 5 + col * 3) % 3);
      const jx = ((row * 7 + col * 2) % 5) - 2;
      ctx.fillRect(-20 + col * 10 + jx, y, cw, 9);
    }
  }
  // extra chest plate + the faint red chest arrow (§29 tell)
  ctx.fillStyle = ENEMY_ARMOR[(3 + dark) % ENEMY_ARMOR.length];
  ctx.fillRect(-16, -44 + bob, 32, 6);
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = ENEMY_CLOTH[2];
  ctx.fillRect(-7, -42 + bob, 5, 3);                 // chevron: left stroke
  ctx.fillRect(2, -42 + bob, 5, 3);                  // chevron: right stroke
  ctx.fillRect(-3, -39 + bob, 6, 3);                 // chevron: point
  ctx.globalAlpha = 1;

  // big pauldrons + visored helm
  ctx.fillStyle = ENEMY_ARMOR[(3 + dark) % ENEMY_ARMOR.length];
  ctx.fillRect(-25, -58 + bob, 11, 10);
  ctx.fillRect(14, -58 + bob, 11, 10);
  ctx.fillStyle = ENEMY_ARMOR[(2 + dark) % ENEMY_ARMOR.length];
  ctx.fillRect(-8, -69 + bob, 17, 13);
  ctx.fillRect(-5, -72 + bob, 11, 3);
  ctx.fillStyle = ENEMY_ARMOR[0];
  ctx.fillRect(-6, -63 + bob, 13, 2);                // visor slit

  // short cloak (§30)
  const sway = Math.sin(e.walkTime * 9 * 0.5) * 2;
  ctx.fillStyle = ENEMY_CLOTH[0];
  ctx.fillRect(-28 - Math.abs(walk) * 2 + sway, -56 + bob, 11, 24);

  // short dark blade (§30)
  ctx.fillStyle = ENEMY_ARMOR[0];
  ctx.fillRect(17, -30 + bob, 3, 15);

  // two glowing white eyes — the ONLY shadowBlur use (§30, §78)
  ctx.save();
  ctx.shadowColor = ENEMY_EYE;
  ctx.shadowBlur = 6;
  ctx.fillStyle = ENEMY_EYE;
  ctx.fillRect(-4, -65 + bob, 3, 3);
  ctx.fillRect(3, -65 + bob, 3, 3);
  ctx.restore();

  if (e.hurtT > 0) {
    ctx.fillStyle = 'rgba(240, 240, 240, 0.30)';
    ctx.fillRect(-24, -74 + bob, 48, 74);
  }
  ctx.restore();
}

// §29 BRUTE — the siege mass (52x78). 5 rows x 4 wide of big cubes, huge
// pauldrons, horned helm, side fists, wide short cloak. The §33 radial
// wind-up plants the brute (crouch state) with a red pulse.
function drawBrute(ctx, e, gameTime) {
  const flip = e.facing === 'left' ? -1 : 1;
  const s = e.scale || 1;
  const walking = e.state === 'walk';
  const walk = walking ? Math.sin(e.walkTime * 6) : 0;
  const bob = walking ? Math.abs(walk) * 1.2 : 0;
  const crouch = e.state === 'crouch' ? 6 : 0;       // planted wind-up crouch
  const shake = e.hurtT > 0 ? Math.sin(e.hurtT * 80) * 2 : 0;
  ctx.save();
  // §34 telegraph backward step: rendered as a 4px backward lean offset.
  ctx.translate(e.x + e.w / 2 + shake - (e.attackWindup > 0 ? flip * 4 : 0), e.y + e.h);
  ctx.scale(flip * s, s);
  const dark = e.staggerT > 0 ? 1 : 0;

  // massive legs
  ctx.fillStyle = ENEMY_ARMOR[0];
  ctx.fillRect(-18 + walk * 2, -16, 14, 16);
  ctx.fillRect(4 - walk * 2, -16, 14, 16);

  // torso: 5 rows x 4 big cubes
  for (let row = 0; row < 5; row += 1) {
    const y = -30 - row * 10 + bob + crouch * 0.4;
    for (let col = 0; col < 4; col += 1) {
      ctx.fillStyle = ENEMY_ARMOR[(row * 4 + col + dark) % ENEMY_ARMOR.length];
      const cw = 13 + ((row * 5 + col * 3) % 3);
      const jx = ((row * 7 + col * 2) % 5) - 2;
      ctx.fillRect(-23 + col * 12 + jx, y, cw, 10);
    }
  }
  // huge pauldrons + horned helm
  ctx.fillStyle = ENEMY_ARMOR[(3 + dark) % ENEMY_ARMOR.length];
  ctx.fillRect(-30, -62 + bob + crouch * 0.5, 14, 12);
  ctx.fillRect(16, -62 + bob + crouch * 0.5, 14, 12);
  ctx.fillStyle = ENEMY_ARMOR[(2 + dark) % ENEMY_ARMOR.length];
  ctx.fillRect(-10, -74 + bob + crouch * 0.6, 20, 14);
  ctx.fillRect(-6, -78 + bob + crouch * 0.6, 12, 4);
  ctx.fillRect(-11, -82 + bob + crouch * 0.6, 5, 9);  // left horn
  ctx.fillRect(6, -82 + bob + crouch * 0.6, 5, 9);    // right horn

  // side fists (planted heavy arms)
  ctx.fillStyle = ENEMY_ARMOR[(1 + dark) % ENEMY_ARMOR.length];
  ctx.fillRect(-28, -34 + bob + crouch, 9, 11);
  ctx.fillRect(19, -34 + bob + crouch, 9, 11);

  // wide short cloak (§30)
  const sway = Math.sin(e.walkTime * 6 * 0.5) * 2;
  ctx.fillStyle = ENEMY_CLOTH[0];
  ctx.fillRect(-33 - Math.abs(walk) * 2 + sway, -60 + bob, 12, 26);
  ctx.fillStyle = ENEMY_CLOTH[1];
  ctx.fillRect(-36 - Math.abs(walk) * 3 + sway, -50 + bob, 9, 18);

  // two big glowing eyes — the ONLY shadowBlur use (§30, §78)
  ctx.save();
  ctx.shadowColor = ENEMY_EYE;
  ctx.shadowBlur = 8;
  ctx.fillStyle = ENEMY_EYE;
  ctx.fillRect(-6, -69 + bob + crouch * 0.6, 4, 4);
  ctx.fillRect(3, -69 + bob + crouch * 0.6, 4, 4);
  ctx.restore();

  // §33 wind-up RED PULSE — the body glows in an oscillating red wash.
  if (e.radialWindup > 0) {
    const k = 0.18 + 0.16 * (0.5 + 0.5 * Math.sin(gameTime * 26));
    ctx.fillStyle = 'rgba(192,32,32,' + k.toFixed(3) + ')';
    ctx.fillRect(-30, -80 + bob + crouch * 0.6, 60, 80);
  }
  if (e.hurtT > 0) {
    ctx.fillStyle = 'rgba(240, 240, 240, 0.30)';
    ctx.fillRect(-28, -84 + bob, 56, 84);
  }
  ctx.restore();
}

// Shared enemy overlays: §29 HP bar (Armored + every mini-boss), the §34
// alert "!", the §33 wind-up danger ring, and the §34 telegraph tint for
// non-Brute types. Drawn in WORLD space after the body.
function drawEnemyOverlays(ctx, e, gameTime) {
  const cx = e.x + e.w / 2;
  // §29 HP bar (Armored) — and every mini-boss shows its boss bar.
  if (e.type === 'armored' || e.miniBoss) {
    const bw = e.miniBoss ? Math.max(56, e.w) : 30;
    const bh = e.miniBoss ? 6 : 4;
    const bx = cx - bw / 2;
    const by = e.y - (e.miniBoss ? 16 : 10);
    ctx.fillStyle = '#0a0d14';
    ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
    ctx.fillStyle = '#2a2f3a';
    ctx.fillRect(bx, by, bw, bh);
    const frac = Math.max(0, e.hp / e.maxHp);
    ctx.fillStyle = frac > 0.5 ? '#c02020' : '#e63946';
    ctx.fillRect(bx, by, bw * frac, bh);
  }
  // §34 alert "!" — pops with a small deterministic bounce.
  if (e.alertT > 0 || e.chargeState === 'windup') {
    const bounce = Math.abs(Math.sin(gameTime * 10)) * 3;
    const ay = e.y - (e.miniBoss ? 26 : 16) - bounce;
    ctx.fillStyle = '#0a0d14';
    ctx.fillRect(cx - 6, ay - 14, 12, 18);
    ctx.fillStyle = ENEMY_EYE;
    ctx.font = 'bold 17px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('!', cx, ay);
  }
  // §33 wind-up danger ring at the impact scale around the brute.
  if (e.radialWindup > 0) {
    const k = e.radialWindup / 0.5;                  // 1 -> 0 countdown
    ctx.strokeStyle = 'rgba(192,32,32,' + (0.25 + 0.45 * (1 - k)).toFixed(3) + ')';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, e.y + e.h / 2, 100 * (0.55 + 0.45 * (1 - k)), 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 1;
  }
  // §34 non-Brute telegraph tint (visual telegraph ONLY, §32).
  if (e.type !== 'brute' && (e.attackWindup > 0)) {
    ctx.fillStyle = 'rgba(160,24,24,0.22)';
    ctx.fillRect(e.x, e.y, e.w, e.h);
  }
}

// ---- Phase 12 finale entities (§52/§52.2) ----
function drawPouria(ctx, e, t) {
  const lean = e.chargeState === 'windup' ? -6 : (e.chargeState === 'charging' ? 8 : 0);
  const run = e.state === 'run' || e.state === 'walk';
  const step = run ? Math.sin(e.walkTime * 11) * 7 : 0;
  const kneel = e.subdued ? 14 : 0;
  const x = e.x;
  const y = e.y + kneel;
  ctx.globalAlpha = e.exposed ? 0.10 : 0.22;
  ctx.fillStyle = '#3a1f4a';
  ctx.fillRect(x - 5, y - 6, e.w + 10, e.h + 8);
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#1c1424';
  ctx.fillRect(x + 8 + step * 0.4, y + 44 - kneel, 10, 30 - kneel * 0.5);
  ctx.fillRect(x + 26 - step * 0.4, y + 44 - kneel, 10, 30 - kneel * 0.5);
  ctx.fillStyle = e.exposed ? '#4a3a58' : '#2a1e38';
  ctx.fillRect(x + 6 + lean * 0.4, y + 16, e.w - 12, 32);
  ctx.fillStyle = e.exposed ? '#6a5478' : '#3a2a4a';
  ctx.fillRect(x + 8 + lean * 0.4, y + 18, e.w - 16, 6);
  ctx.fillStyle = e.exposed ? '#d9c8e8' : '#1a1226';
  ctx.fillRect(x + 12 + lean, y + 2, 20, 15);
  ctx.fillStyle = '#0a0812';
  ctx.fillRect(x + 14 + lean, y + 5, 16, 9);
  ctx.fillStyle = e.exposed ? '#c77dff' : ENEMY_EYE;
  ctx.fillRect(x + 16 + lean, y + 8, 4, 3);
  ctx.fillRect(x + 24 + lean, y + 8, 4, 3);
  const flut = Math.sin(t * 7 + e.x * 0.01) * 4;
  ctx.fillStyle = '#8a1010';
  ctx.fillRect(x + 10 + lean, y + 26, 10, 8);
  ctx.fillRect(x + 2 + lean - Math.abs(flut) * 0.5, y + 28, 10 + flut, 6);
  ctx.fillStyle = '#c02020';
  ctx.fillRect(x + 3 + lean - Math.abs(flut) * 0.5, y + 30, 6 + flut * 0.6, 3);
  const bx = e.facing === 'left' ? x - 4 : x + e.w - 4;
  const bladeY = e.chargeState === 'windup' || e.chargeState === 'charging' ? y - 6 : y + 10;
  ctx.fillStyle = '#3a3a4a';
  ctx.fillRect(bx, bladeY, 6, 34);
  ctx.fillStyle = '#8a93a8';
  ctx.fillRect(bx + (e.facing === 'left' ? 0 : 4), bladeY, 2, 34);
  if (e.invulnerable) {
    ctx.globalAlpha = 0.35 + 0.2 * Math.sin(t * 8);
    ctx.strokeStyle = '#c77dff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x + e.w / 2, y + e.h / 2, e.w * 0.9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.globalAlpha = 1;
  }
}

function drawChain(ctx, e, t) {
  const sway = Math.sin(t * 5 + e.chainIndex * 2.1) * 3;
  const cx = e.x + e.w / 2;
  for (let i = 0; i < 4; i += 1) {
    const segY = e.y + i * (e.h / 4);
    ctx.fillStyle = i % 2 === 0 ? '#241a30' : '#1c1424';
    ctx.fillRect(cx - 8 + sway * (i / 3), segY, 16, e.h / 4 - 2);
  }
  ctx.fillStyle = '#7a3aa8';
  ctx.fillRect(cx - 2 + sway, e.y + 4, 4, 4);
  ctx.fillRect(cx - 2 + sway * 0.6, e.y + e.h / 2, 4, 4);
  ctx.globalAlpha = 0.30 + 0.12 * Math.sin(t * 6 + e.chainIndex);
  ctx.strokeStyle = '#c77dff';                  // weak-point halo
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, e.y + e.h / 2, e.w * 0.9, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.globalAlpha = 1;
}

function drawQueen(ctx, e, t) {
  const cx = e.x + e.w / 2;
  const hoverBob = e.phase === 2 ? Math.sin(t * 2.2) * 3 : 0;
  const y = e.y + hoverBob;
  for (let i = 0; i < 3; i += 1) {
    ctx.globalAlpha = 0.10 + 0.05 * i + 0.04 * Math.sin(t * 2 + i);
    ctx.fillStyle = '#e8f0ff';
    ctx.beginPath();
    ctx.arc(cx, y + e.h / 2, e.w * (0.75 + i * 0.35), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#dce8f8';
  ctx.fillRect(cx - 16, y + 26, 32, e.h - 26);
  ctx.fillStyle = '#c9d8ee';
  ctx.fillRect(cx - 11, y + 30, 22, e.h - 34);
  ctx.fillStyle = '#eef4ff';
  ctx.fillRect(cx - 12, y + 18, 24, 14);
  ctx.fillStyle = '#f2f6ff';
  ctx.fillRect(cx - 9, y + 2, 18, 16);
  ctx.fillStyle = '#0a1220';
  ctx.fillRect(cx - 6, y + 8, 3, 3);
  ctx.fillRect(cx + 3, y + 8, 3, 3);
  ctx.fillStyle = '#cfd8ea';
  ctx.fillRect(cx - 12, y + 4, 4, 34);
  ctx.fillRect(cx + 8, y + 4, 4, 34);
  ctx.fillStyle = '#d8b96a';
  ctx.fillRect(cx - 10, y - 4, 20, 5);
  ctx.fillRect(cx - 10, y - 9, 4, 5);
  ctx.fillRect(cx - 2, y - 9, 4, 5);
  ctx.fillRect(cx + 6, y - 9, 4, 5);
  if (e.chargeState === 'windup' || e.chargeState === 'charging') {
    const hx = e.facing === 'left' ? cx - 22 : cx + 16;
    ctx.fillStyle = '#f2f6ff';
    ctx.fillRect(hx, y + 14, 8, 12);
    ctx.globalAlpha = 0.55 + 0.25 * Math.sin(t * 9);
    ctx.fillStyle = '#e8f0ff';
    ctx.fillRect(hx - 4, y + 8, 16, 18);
    ctx.globalAlpha = 1;
  }
  if (e.invulnT > 0) {
    ctx.globalAlpha = 0.5 + 0.3 * Math.sin(t * 14);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(e.x - 4, y - 6, e.w + 8, e.h + 10);
    ctx.globalAlpha = 1;
  }
  if (e.radialWindup > 0) {
    const k = e.radialWindup / 0.55;                   // 1 -> 0 countdown
    ctx.strokeStyle = 'rgba(232,240,255,' + (0.25 + 0.5 * (1 - k)).toFixed(3) + ')';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, y + e.h / 2, 150 * (0.55 + 0.45 * (1 - k)), 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 1;
  }
}

function drawBossBars(ctx, e) {
  const cx = e.x + e.w / 2;
  if (e.bossKind === 'pouria' && e.corruptionHp != null && !e.subdued) {
    const bw = 52, by = e.y - 16;
    ctx.fillStyle = '#0a0d14'; ctx.fillRect(cx - bw / 2 - 1, by - 1, bw + 2, 10);
    ctx.fillStyle = '#2a2f3a'; ctx.fillRect(cx - bw / 2, by, bw, 8);
    ctx.fillStyle = '#7a3aa8';                        // corruption pool
    ctx.fillRect(cx - bw / 2, by, bw * Math.max(0, e.corruptionHp / e.maxHp), 5);
    const rf = Math.max(0, e.realHp / e.maxRealHp);
    ctx.fillStyle = rf > 0.5 ? '#8a93a8' : '#e63946';// real HP (must stay full)
    ctx.fillRect(cx - bw / 2, by + 6, bw * rf, 2);
  } else if (e.bossKind === 'queen') {
    const bw = 64, by = e.y - 20;
    ctx.fillStyle = '#0a0d14'; ctx.fillRect(cx - bw / 2 - 1, by - 1, bw + 2, 8);
    ctx.fillStyle = '#2a2f3a'; ctx.fillRect(cx - bw / 2, by, bw, 6);
    ctx.fillStyle = '#e8f0ff';                        // captured dawn
    ctx.fillRect(cx - bw / 2, by, bw * Math.max(0, e.hp / e.phasePools[e.phase - 1]), 6);
    for (let i = 0; i < e.phasePools.length; i += 1) {  // phase pips
      ctx.fillStyle = i < e.phase ? '#d8b96a' : '#3a4050';
      ctx.fillRect(cx - bw / 2 + i * 8, by + 8, 6, 3);
    }
  }
}

function drawBossEntity(ctx, e, t) {
  if (e.bossKind === 'pouria') drawPouria(ctx, e, t);
  else if (e.bossKind === 'chain') drawChain(ctx, e, t);
  else if (e.bossKind === 'queen') drawQueen(ctx, e, t);
  drawBossBars(ctx, e);
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

// §57/§56 particles: the single capped list carries feedback chips, soft
// dust puffs, and the ambient weather kinds. Per-kind presentation — all
// rect/arc art, layered alpha, NO shadowBlur (§78); culling against the
// zoomed view (§42). `t` is the render clock for deterministic pulses.
function drawParticles(ctx, particles, cam, t) {
  const left = cam.x - 20;
  const right = cam.x + VIEW_W + 20;
  for (let i = 0; i < particles.length; i += 1) {
    const p = particles[i];
    if (p.x < left || p.x > right) continue;
    const a = Math.max(0, p.life / p.maxLife);
    const k = p.kind;
    if (k === 'dust') {
      // §57 soft ground dust: wide translucent puffs, fading with life.
      ctx.globalAlpha = a * 0.72;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size, p.y - p.size * 0.5, p.size * 2, p.size);
      ctx.globalAlpha = a * 0.45;
      ctx.fillRect(p.x - p.size * 0.55, p.y - p.size * 0.28, p.size * 1.1, p.size * 0.6);
    } else if (k === 'rain') {
      // §56 light rain: thin slanted streaks.
      ctx.globalAlpha = a * 0.42;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y - p.size * 2.2, 1.2, p.size * 2.2);
    } else if (k === 'firefly') {
      // §56 fireflies: pulsing glow dots (layered alpha, no shadowBlur).
      const pulse = 0.5 + 0.5 * Math.sin(t * 3.1 + p.ph * 9);
      ctx.globalAlpha = a * (0.35 + pulse * 0.45);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size + pulse * 1.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = a * (0.12 + pulse * 0.14);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size + 4 + pulse * 2, 0, Math.PI * 2);
      ctx.fill();
    } else if (k === 'leaf') {
      // §56 dry leaves: tumbling flakes — width oscillates with the sway.
      const w = p.size * (0.55 + 0.45 * Math.abs(Math.sin(t * 2.3 + p.ph * 7)));
      ctx.globalAlpha = a * 0.85;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - w / 2, p.y - p.size / 2, w, p.size);
    } else if (k === 'feather') {
      // §56 drifting feathers: pale quill + barb.
      ctx.globalAlpha = a * 0.8;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - 1, p.y - p.size, 2, p.size * 2);
      ctx.fillRect(p.x - 3.5, p.y - p.size * 0.7, 7, p.size * 0.8);
    } else if (k === 'spark') {
      // §56 Act 3 castle sparks: flickering rising embers.
      const flick = 0.5 + 0.5 * Math.sin(t * 11 + p.ph * 13);
      ctx.globalAlpha = a * (0.5 + flick * 0.5);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    } else if (k === 'fogWisp') {
      // §56 patchy fog wisps: ultra-low-alpha drifting sheets.
      ctx.globalAlpha = a * 0.16;
      ctx.fillStyle = p.color;
      const grow = 1 + (1 - a) * 0.8;
      ctx.fillRect(p.x - p.size / 2, p.y - 9 * grow,
                   p.size * grow, 18 * grow);
    } else if (k === 'debris') {
      // §56 wind-driven debris: dark fast flecks with a motion streak.
      ctx.globalAlpha = a * 0.8;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size, p.y - 1, p.size * 2.4, p.size);
    } else if (k === 'aramMote') {
      // §56 Aram purple motes: soft glowing specks.
      ctx.globalAlpha = a * 0.6;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size + 0.6, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // default feedback chips (bursts, shatter, hit particles, motes)
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
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
      // §55 Phase 10 METAL frame: riveted posts flanking the wall.
      ctx.fillStyle = '#2e3238';
      ctx.fillRect(g.x - 6, g.y - 6, 5, g.h + 12);     // left post
      ctx.fillRect(g.x + g.w + 1, g.y - 6, 5, g.h + 12); // right post
      ctx.fillStyle = '#454a52';                       // rivet heads
      ctx.fillRect(g.x - 5, g.y - 2, 2, 2);
      ctx.fillRect(g.x - 5, g.y + g.h - 4, 2, 2);
      ctx.fillRect(g.x + g.w + 3, g.y - 2, 2, 2);
      ctx.fillRect(g.x + g.w + 3, g.y + g.h - 4, 2, 2);
      ctx.fillStyle = 'rgba(160,168,180,0.35)';        // scratch
      ctx.fillRect(g.x - 5, g.y + g.h * 0.3, 4, 1);
      ctx.fillRect(g.x + g.w + 2, g.y + g.h * 0.55, 4, 1);
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
      // §55 Phase 10 METAL recipe: riveted bands + scratches on the slab.
      ctx.fillStyle = '#454a52';                       // rivet heads
      ctx.fillRect(g.x + 4, g.y + 4, 2, 2);
      ctx.fillRect(g.x + g.w - 7, g.y + 4, 2, 2);
      ctx.fillRect(g.x + 4, g.y + g.h - 6, 2, 2);
      ctx.fillRect(g.x + g.w - 7, g.y + g.h - 6, 2, 2);
      ctx.fillStyle = 'rgba(160,168,180,0.3)';         // scratches
      ctx.fillRect(g.x + 6, g.y + g.h * 0.35, g.w - 14, 1);
      ctx.fillRect(g.x + 10, g.y + g.h * 0.62, g.w - 22, 1);
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
  // §57 Phase 10 styling: each afterimage is a translucent character
  // SILHOUETTE (head + torso + cloak wedge) fading 0.4 → 0 over
  // DASH_TRAIL_FADE — not a plain block. Rect-only art, no outline pass.
  for (let i = 0; i < trail.length; i += 1) {
    const age = game.gameTime - trail[i].t;
    const a = Math.max(0, 0.4 * (1 - age / DASH_TRAIL_FADE));   // 0.4 → 0
    if (a <= 0) continue;
    const t = trail[i];
    ctx.globalAlpha = a;
    ctx.fillStyle = color;
    // head
    ctx.fillRect(t.x + player.w * 0.30, t.y + 2, player.w * 0.40, player.h * 0.16);
    // torso
    ctx.fillRect(t.x + player.w * 0.18, t.y + player.h * 0.20,
                 player.w * 0.64, player.h * 0.42);
    // legs
    ctx.fillRect(t.x + player.w * 0.24, t.y + player.h * 0.62,
                 player.w * 0.52, player.h * 0.36);
    // trailing cloak wedge (behind the motion)
    ctx.fillRect(t.x + player.w * 0.06, t.y + player.h * 0.24,
                 player.w * 0.16, player.h * 0.34);
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

// §57 Phase 10 COOLDOWN RING: the active character's SPECIAL (K) cooldown
// recovery, drawn as an arc around the sprite that sweeps closed as the
// ability re-arms. Character-colored, subtle, presentation only. The ring
// vanishes the instant the cooldown ends (ready state = no clutter).
const SPECIAL_CD_MAX = { sara: DASH_COOLDOWN, raha: SLAM_COOLDOWN, aram: SLOWMO_COOLDOWN };
function drawCooldownRing(ctx, player) {
  const cd = player.cooldowns[player.character].special;
  if (cd <= 0) return;                                // ready: nothing drawn
  const max = SPECIAL_CD_MAX[player.character] || 1;
  const frac = Math.max(0, Math.min(1, cd / max));    // 1 → 0 as it recovers
  const cx = player.x + player.w / 2;
  const cy = player.y + player.h / 2;
  const r = Math.max(player.w, player.h) * 0.72;
  ctx.strokeStyle = CHARACTER_COLORS[player.character] || CHARACTER_COLORS.sara;
  ctx.globalAlpha = 0.28 + (1 - frac) * 0.34;         // brightens as it closes
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  // sweep starts at 12 o'clock, runs clockwise, remaining fraction drawn
  ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.lineWidth = 1;
}

// §57 Phase 10 DAMAGE FLASH: red full-screen, 0.15 s, decaying alpha —
// drawn above the world (and above the slow-mo tint), under the fog and
// vignette so the frame edges stay composed. Pure presentation state.
function drawDamageFlash(ctx, game) {
  if (!game.damageFlashT || game.damageFlashT <= 0) return;
  const a = Math.max(0, Math.min(1, game.damageFlashT / DAMAGE_FLASH_T));
  ctx.fillStyle = 'rgba(160,20,30,' + (DAMAGE_FLASH_ALPHA * a).toFixed(3) + ')';
  ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
}

// §56 Phase 10 ACTIVE-CHARACTER SELF-GLOW: a subtle character-colored aura
// behind the sprite — layered alpha circles, never shadowBlur (§78). Drawn
// BEFORE the sprite so the character reads as the scene's light source.
function drawSelfGlow(ctx, player, game) {
  const color = CHARACTER_COLORS[player.character] || CHARACTER_COLORS.sara;
  const cx = player.x + player.w / 2;
  const cy = player.y + player.h / 2;
  const breathe = 0.5 + 0.5 * Math.sin(game.gameTime * 2.2);
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.045 + breathe * 0.02;
  ctx.beginPath();
  ctx.arc(cx, cy, player.w * 1.05 + breathe * 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.028 + breathe * 0.014;
  ctx.beginPath();
  ctx.arc(cx, cy, player.w * 1.55 + breathe * 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

// §55 Phase 10 RIM LIGHT: the nearest torch (authored set dressing) paints
// a soft light edge on the character's torch-facing side. Proximity-faded;
// layered alpha strips, no gradients per fill (cheap + §78-safe).
function drawRimLight(ctx, player, level, game) {
  let best = null;
  let bestD = Infinity;
  const px = player.x + player.w / 2;
  const py = player.y + player.h / 2;
  for (let ci = 0; ci < level.chapters.length; ci += 1) {
    const ch = level.chapters[ci];
    const dr = ch.dressing;
    if (!dr) continue;
    for (let di = 0; di < dr.length; di += 1) {
      if (dr[di].kind !== 'torch') continue;
      const tx = dr[di].x + 4;                    // flame anchor (pole top)
      const ty = dr[di].y - 74;
      const dx = tx - px;
      const dy = ty - py;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < bestD) { bestD = d; best = { dx, dy }; }
    }
  }
  if (!best || bestD > TORCH_LIGHT_RANGE) return;
  const k = 1 - bestD / TORCH_LIGHT_RANGE;            // 0..1 proximity
  const flick = 0.82 + 0.18 * Math.sin(game.gameTime * 7.3 + 1.1);
  const a = 0.20 * k * flick;
  const side = best.dx >= 0 ? player.x + player.w : player.x;   // lit edge
  const grow = 1 + Math.abs(best.dx) / 320;
  ctx.fillStyle = 'rgba(232,150,70,' + a.toFixed(3) + ')';      // torch-warm
  ctx.fillRect(side - (best.dx >= 0 ? 2 : 0), player.y + 4,
               2 + 2 * grow * k, player.h - 8);
  ctx.globalAlpha = a * 0.5;
  ctx.fillRect(side - (best.dx >= 0 ? 5 : 0), player.y + 10,
               5 + 3 * grow * k, player.h - 20);
  ctx.globalAlpha = 1;
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

// ---------------------------------------------------------------------------
// Collectibles (SPEC §48/§58 — Phase 9): coins, rare coins, moon crystals.
// Deterministic bob/spin phases derive from the stable authored IDs (§72).
// All art is rects/ellipses/paths with layered alpha — NO shadowBlur (§30
// reserves it for enemy eyes; §78 performance).
// ---------------------------------------------------------------------------

// Common/rare coin: a spinning disc — horizontal squash |cos| sells the
// spin without any state; the bob rides a per-ID sine phase.
function drawCoinDisc(ctx, c, gameTime, palette, rare) {
  const bob = Math.sin(gameTime * 2.2 + c.phase) * 3;
  const spin = Math.abs(Math.cos(gameTime * 2.4 + c.phase));
  const R = c.r;
  const cx = c.x;
  const cy = c.y + bob;
  const wr = Math.max(R * 0.32, R * spin);
  ctx.beginPath();
  ctx.ellipse(cx, cy, wr, R, 0, 0, Math.PI * 2);
  ctx.fillStyle = palette.face;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = palette.edge;
  ctx.stroke();
  // inner detail ring — a crescent notch keeps the moon motif
  ctx.beginPath();
  ctx.ellipse(cx, cy, wr * 0.55, R * 0.55, 0, 0, Math.PI * 2);
  ctx.strokeStyle = palette.edge;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // upper-left highlight chip
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = palette.shine;
  ctx.fillRect(cx - wr * 0.5, cy - R * 0.7, 3, 3);
  ctx.globalAlpha = 1;
  if (rare) {
    // rare tell: four orbiting twinkle pixels (deterministic positions)
    for (let i = 0; i < 4; i += 1) {
      const ang = gameTime * 1.3 + c.phase + i * Math.PI / 2;
      const tx = cx + Math.cos(ang) * (R + 5);
      const ty = cy + Math.sin(ang) * (R + 5);
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(gameTime * 3 + i);
      ctx.fillStyle = palette.shine;
      ctx.fillRect(tx - 1, ty - 1, 2.5, 2.5);
    }
    ctx.globalAlpha = 1;
  }
}

// Moon crystal: a faceted diamond with layered alpha glow shells (no blur)
// and a slow pulse — the three-crystal hidden-truth keys (§62 ending tie).
function drawCrystal(ctx, c, gameTime) {
  const bob = Math.sin(gameTime * 1.6 + c.phase) * 4;
  const pulse = 0.75 + 0.25 * Math.sin(gameTime * 2.0 + c.phase);
  const cx = c.x;
  const cy = c.y + bob;
  const w = c.r * 0.62;
  const h = c.r * 1.35;
  // layered glow shells behind the body
  ctx.globalAlpha = 0.10 * pulse;
  ctx.fillStyle = CRYSTAL_PALETTE.glow;
  ctx.beginPath();
  ctx.ellipse(cx, cy, c.r * 1.7, c.r * 2.0, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.16 * pulse;
  ctx.beginPath();
  ctx.ellipse(cx, cy, c.r * 1.25, c.r * 1.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  // faceted diamond body
  ctx.beginPath();
  ctx.moveTo(cx, cy - h);
  ctx.lineTo(cx + w, cy);
  ctx.lineTo(cx, cy + h);
  ctx.lineTo(cx - w, cy);
  ctx.closePath();
  ctx.fillStyle = CRYSTAL_PALETTE.body;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = CRYSTAL_PALETTE.edge;
  ctx.stroke();
  // bright core facet (left half catch-light)
  ctx.beginPath();
  ctx.moveTo(cx, cy - h);
  ctx.lineTo(cx - w, cy);
  ctx.lineTo(cx, cy + h);
  ctx.closePath();
  ctx.globalAlpha = 0.55 * pulse;
  ctx.fillStyle = CRYSTAL_PALETTE.core;
  ctx.fill();
  ctx.globalAlpha = 1;
  // sparkle pixel at the tip
  ctx.globalAlpha = 0.6 + 0.4 * Math.sin(gameTime * 4 + c.phase);
  ctx.fillStyle = CRYSTAL_PALETTE.core;
  ctx.fillRect(cx - 1, cy - h - 4, 2.5, 2.5);
  ctx.globalAlpha = 1;
}

function drawCollectibles(ctx, collectibles, cam, gameTime) {
  if (!collectibles) return;
  // Render-only culling (§42/§78) against the zoomed camera view.
  const left = cam.x - 24;
  const right = cam.x + VIEW_W + 24;
  for (let i = 0; i < collectibles.length; i += 1) {
    const c = collectibles[i];
    if (c.x + c.r < left || c.x - c.r > right) continue;
    if (c.kind === 'crystal') drawCrystal(ctx, c, gameTime);
    else if (c.kind === 'rareCoin') drawCoinDisc(ctx, c, gameTime, RARE_COIN_PALETTE, true);
    else drawCoinDisc(ctx, c, gameTime, COIN_PALETTE, false);
  }
}

// ---------------------------------------------------------------------------
// HUD (SPEC §65 — Phase 9). Screen-space (1280x720 logical), drawn ABOVE
// the vignette so it stays crisp. §26's cooldown ring belongs to Phase 10
// per the phase table. Gradients are cached per character (§78: no
// per-frame allocation beyond trivial text).
// ---------------------------------------------------------------------------
const HP_GRADIENTS = new Map();
function hpGradient(ctx, key) {
  let grad = HP_GRADIENTS.get(key);
  if (!grad) {
    const ends = HUD_HP_GRADS[key] || HUD_HP_GRADS.sara;
    grad = ctx.createLinearGradient(18, 0, 168, 0);
    grad.addColorStop(0, ends[0]);
    grad.addColorStop(1, ends[1]);
    HP_GRADIENTS.set(key, grad);
  }
  return grad;
}

function drawHUD(ctx, game, player, level) {
  if (game.screen !== 'playing') return;      // gameplay HUD only (§65)
  // ---- top-left: character name + HP bar (character-color gradient) ----
  const key = player.character;
  const effMax = player.maxHp + (game.heartCount || 0);   // §19 hook
  ctx.textAlign = 'left';
  ctx.font = '700 15px system-ui, sans-serif';
  ctx.fillStyle = CHARACTER_COLORS[key];
  ctx.fillText(key.toUpperCase(), 18, 30);
  ctx.fillStyle = 'rgba(8,11,20,0.72)';
  ctx.fillRect(16, 36, 154, 14);             // bar backing
  const frac = effMax > 0 ? Math.max(0, Math.min(1, player.hp / effMax)) : 0;
  if (frac > 0) {
    ctx.fillStyle = hpGradient(ctx, key);
    ctx.fillRect(18, 38, 150 * frac, 10);
  }
  ctx.font = '600 11px system-ui, sans-serif';
  ctx.fillStyle = TEXT_DIM;
  ctx.fillText(player.hp + '/' + effMax, 176, 47);
  // ---- top-center: chapter id + chapter name (§46/§65) --------------------
  let chapter = null;
  for (let i = 0; i < level.chapters.length; i += 1) {
    if (level.chapters[i].id === game.currentChapter) { chapter = level.chapters[i]; break; }
  }
  if (chapter) {
    ctx.font = '600 13px system-ui, sans-serif';
    const idText = chapter.id;
    const nameText = ' · ' + chapter.name;
    const w1 = ctx.measureText(idText).width;
    const w2 = ctx.measureText(nameText).width;
    const x0 = (LOGICAL_W - (w1 + w2)) / 2;
    ctx.fillStyle = TEXT_MAIN;
    ctx.fillText(idText, x0, 30);
    ctx.fillStyle = TEXT_DIM;
    ctx.fillText(nameText, x0 + w1, 30);
  }
  // ---- top-right: coins + kills (clear of the DOM pause button) ----------
  ctx.font = '700 14px system-ui, sans-serif';
  ctx.fillStyle = TEXT_MAIN;
  // coin glyph: mini gold disc
  ctx.beginPath();
  ctx.arc(1082, 25, 7, 0, Math.PI * 2);
  ctx.fillStyle = COIN_PALETTE.face;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = COIN_PALETTE.edge;
  ctx.stroke();
  ctx.fillStyle = TEXT_MAIN;
  ctx.fillText('×' + game.currentRunCoins, 1094, 30);
  // kills glyph: small crimson diamond
  ctx.beginPath();
  ctx.moveTo(1162, 17);
  ctx.lineTo(1169, 25);
  ctx.lineTo(1162, 33);
  ctx.lineTo(1155, 25);
  ctx.closePath();
  ctx.fillStyle = '#e63946';
  ctx.fill();
  ctx.fillStyle = TEXT_MAIN;
  ctx.fillText('×' + game.kills, 1176, 30);
  ctx.textAlign = 'left';
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
  // Act 2, clear in Act 3; chapter 3-5 flickers during the final battle
  // (§52) — and burns STEADY once the choice is made and the moon rises.
  // Deterministic composite sines — no randomness (§72).
  function glowIntensity(game, gameTime) {
    if (game.moonRiseT > 0) return 1.25;             // §55 payoff: risen
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

  // ---- §52/§55 THE MOON RISES (Phase 12 payoff) ----------------------------
  function drawMoonRise(game, t) {
    if (!game.moonRiseT || game.moonRiseT <= 0) return;
    const k = Math.min(1, game.moonRiseT / MOON_RISE_DURATION);
    const ease = 1 - Math.pow(1 - k, 2);
    const cx = GLOW_HOLD_X + 140;
    const cy = GLOW_HORIZON_Y + 26 - ease * (GLOW_HORIZON_Y + 26 - 170);
    for (let i = 0; i < 3; i += 1) {
      ctx.globalAlpha = (0.06 + 0.05 * i) * ease;
      ctx.fillStyle = GLOW_LIGHT;
      ctx.beginPath();
      ctx.arc(cx, cy, 58 + i * 26, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = Math.min(1, 0.4 + 0.6 * ease);
    ctx.fillStyle = GLOW_LIGHT;
    ctx.beginPath();
    ctx.arc(cx, cy, 44, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(180,198,226,0.55)';
    ctx.beginPath();
    ctx.arc(cx - 14, cy - 8, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + 10, cy + 12, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(246,250,255,0.9)';
    ctx.beginPath();
    ctx.arc(cx - 6, cy - 14, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // ---- §52 THE MOON GATE (world space) -------------------------------------
  function drawMoonGate(game, cam, t) {
    const g = game.moonGate;
    if (!g) return;
    if (g.x + 80 < cam.x || g.x - 80 > cam.x + VIEW_W) return;
    if (g.state === 'closed') {
      ctx.strokeStyle = '#241a30';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(g.x - g.r, g.y - g.r * 0.5);
      ctx.lineTo(g.x + g.r, g.y + g.r * 0.4);
      ctx.moveTo(g.x - g.r, g.y + g.r * 0.5);
      ctx.lineTo(g.x + g.r, g.y - g.r * 0.4);
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.22 + 0.08 * Math.sin(t * 1.8);
      ctx.fillStyle = '#7a3aa8';
      ctx.beginPath();
      ctx.arc(g.x, g.y, g.r - 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#2a2f3a';
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.arc(g.x, g.y, g.r + 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 1;
      return;
    }
    for (let i = 0; i < 3; i += 1) {
      ctx.globalAlpha = 0.16 + 0.08 * i + 0.05 * Math.sin(t * 2.4 + i);
      ctx.fillStyle = GLOW_LIGHT;
      ctx.beginPath();
      ctx.arc(g.x, g.y, g.r + 10 + i * 16, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = '#f4f8ff';
    ctx.beginPath();
    ctx.arc(g.x, g.y, g.r - 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#d8e2f2';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(g.x, g.y, g.r + 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 5; i += 1) {
      const a = t * 0.7 + i * (Math.PI * 2 / 5);
      const rr = g.r + 14 + Math.sin(t * 1.6 + i * 1.9) * 8;
      ctx.globalAlpha = 0.5 + 0.3 * Math.sin(t * 2 + i);
      ctx.fillRect(g.x + Math.cos(a) * rr - 1.5, g.y + Math.sin(a) * rr - 1.5, 3, 3);
    }
    ctx.globalAlpha = 1;
    const grad = ctx.createLinearGradient(0, g.y - 170, 0, g.y);
    grad.addColorStop(0, 'rgba(232,240,255,0)');
    grad.addColorStop(1, 'rgba(232,240,255,0.14)');
    ctx.fillStyle = grad;
    ctx.fillRect(g.x - 22, g.y - 170, 44, 170);
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
  // §56 Phase 10 WIND: the canopy blobs drift ±2px on the render clock
  // (deterministic sine per tile — §72; trunks stay planted).
  function drawTree(tx, baseY, h, sway) {
    ctx.fillRect(tx, baseY - h, 10, h);            // trunk
    ctx.fillRect(tx - 30 + sway, baseY - h - 26, 70, 24); // canopy blobs
    ctx.fillRect(tx - 22 + sway * 0.7, baseY - h - 44, 54, 20);
    ctx.fillRect(tx - 12 + sway * 0.5, baseY - h - 58, 34, 16);
    ctx.fillRect(tx - 38 + sway * 1.2, baseY - h - 18, 14, 10); // jagged edges
    ctx.fillRect(tx + 28 + sway, baseY - h - 14, 12, 8);
  }

  function drawTrees(cam, t) {
    const offX = cam.x * PARALLAX_TREES;
    const offY = cam.y * PARALLAX_TREES;
    const baseY = TREE_BASE_Y - offY;
    const k0 = Math.floor((offX - TREE_PERIOD) / TREE_PERIOD);
    const k1 = Math.floor((offX + LOGICAL_W) / TREE_PERIOD) + 1;
    for (let k = k0; k <= k1; k += 1) {
      const v = mod(k * 73 + 11, 97);              // deterministic tile variant
      const bx = k * TREE_PERIOD - offX;
      const sway = Math.sin(t * WIND_SWAY_RATE * 0.8 + k * 0.9) * 2;
      if (v < 56) {
        ctx.fillStyle = TREE_TONE;
        drawTree(bx + 40 + (v % 5) * 14, baseY, 132 + (v % 7) * 16, sway);
      } else if (v < 68) {
        const ch = 84 + (v % 4) * 18;              // ruined pillar
        ctx.fillStyle = PILLAR_TONE;
        ctx.fillRect(bx + 60, baseY - 10, 40, 10);          // plinth
        ctx.fillRect(bx + 72, baseY - 10 - ch, 16, ch);     // column
        ctx.fillRect(bx + 70, baseY - 10 - ch - 6, 12, 6);  // broken top chips
        ctx.fillRect(bx + 78, baseY - 10 - ch - 3, 8, 3);
      } else if (v < 80) {
        ctx.fillStyle = TREE_TONE;                 // small tree pair
        drawTree(bx + 50, baseY, 88 + (v % 3) * 14, sway * 0.8);
        drawTree(bx + 240, baseY, 76 + (v % 5) * 10, -sway * 0.6);
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

  // ---- §55 Phase 10 PROCEDURAL PLATFORM TEXTURES --------------------------
  // Deterministic seeded noise per platform (stable geometry hash — the
  // SAME pattern every frame, NO shimmer, §72/§55) in three material
  // recipes: stone (cracks + moss + edge highlights), wood (breakables:
  // §55 palette + grain + nail heads + vertical cracks + red highlights),
  // dirt (ground strips: speckles + grass tufts). The metal recipe (§55
  // scratches + rivets) is applied to the §50 gate frames in drawGates.
  function texHash(p, salt) {
    let h = (p.x * 31 + p.y * 17 + p.w * 13 + salt * 101) % 2147483647;
    h = (h * 48271) % 2147483647;
    return h;
  }

  function drawPlatformTexture(p) {
    const h = texHash(p, 7);
    if (p.breakable) {
      // ---- wood (§55 breakable palette) ---------------------------------
      ctx.fillStyle = '#5a4030';
      ctx.fillRect(p.x, p.y, p.w, p.h);                    // aged plank body
      ctx.fillStyle = '#6a4a38';
      ctx.fillRect(p.x, p.y, p.w, 3);                      // lit top edge
      // vertical grain strokes (darker wood)
      ctx.fillStyle = '#2a1e14';
      const grainN = Math.max(2, Math.min(4, Math.floor(p.w / 36)));
      for (let i = 0; i < grainN; i += 1) {
        const gx = p.x + 6 + ((h >> (i * 3)) % Math.max(1, p.w - 12));
        ctx.fillRect(gx, p.y + 3, 2, p.h - 5);
      }
      // nail heads near the corners
      ctx.fillStyle = '#1a120c';
      ctx.fillRect(p.x + 4, p.y + 4, 3, 3);
      ctx.fillRect(p.x + p.w - 7, p.y + 4, 3, 3);
      ctx.fillRect(p.x + 4, p.y + p.h - 7, 3, 3);
      ctx.fillRect(p.x + p.w - 7, p.y + p.h - 7, 3, 3);
      // §55 vertical cracks + subtle red highlights
      ctx.fillStyle = '#241a12';
      ctx.fillRect(p.x + p.w * 0.42, p.y + 3, 2, p.h - 5);
      ctx.fillStyle = 'rgba(138,42,32,0.55)';
      ctx.fillRect(p.x + p.w * 0.42 + 2, p.y + 4, 1, p.h - 7);
      ctx.fillRect(p.x + p.w * 0.7, p.y + 5, 1, p.h - 10);
      return;
    }
    if (p.h >= 60) {
      // ---- dirt ground strip ---------------------------------------------
      ctx.fillStyle = GROUND_FILL;
      ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.fillStyle = GROUND_EDGE;
      ctx.fillRect(p.x, p.y, p.w, 3);
      // speckles: two hashed rows of dark grit
      ctx.fillStyle = '#0c1018';
      const speckN = Math.min(26, Math.floor(p.w / 42));
      for (let i = 0; i < speckN; i += 1) {
        const sx = p.x + ((h >> (i % 15)) % Math.max(1, p.w - 4));
        const sy = p.y + 10 + ((h >> ((i + 7) % 13)) % Math.max(1, p.h - 16));
        ctx.fillRect(sx, sy, 2, 2);
      }
      // grass tufts on the top edge
      ctx.fillStyle = '#1e3324';
      const tuftN = Math.min(14, Math.floor(p.w / 80));
      for (let i = 0; i < tuftN; i += 1) {
        const tx = p.x + 8 + ((h >> (i * 2 + 3)) % Math.max(1, p.w - 20));
        ctx.fillRect(tx, p.y - 4, 2, 5);
        ctx.fillRect(tx + 3, p.y - 7, 2, 8);
        ctx.fillRect(tx + 6, p.y - 3, 2, 4);
      }
    } else {
      // ---- stone (§55 platform palette: #181c24 body, #2a2f3a lit edge) ---
      ctx.fillStyle = '#181c24';
      ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.fillStyle = '#2a2f3a';
      ctx.fillRect(p.x, p.y, p.w, 3);
      // cracks: dark segments at hashed offsets — visible against the body
      ctx.fillStyle = '#0a0d14';
      const crackN = p.w > 90 ? 3 : 2;
      for (let i = 0; i < crackN; i += 1) {
        const cx = p.x + 10 + ((h >> (i * 4 + 1)) % Math.max(1, p.w - 24));
        const cy = p.y + 6 + ((h >> (i * 3 + 5)) % Math.max(1, p.h - 14));
        ctx.fillRect(cx, cy, 2, 8 + ((h >> (i + 2)) % 6));   // vertical
        ctx.fillRect(cx + 2, cy + 8, 7, 2);                  // step out
      }
      // moss patches near the lit top edge
      ctx.fillStyle = 'rgba(38,58,34,0.72)';
      const mossN = 2;
      for (let i = 0; i < mossN; i += 1) {
        const mx = p.x + 14 + ((h >> (i * 5 + 9)) % Math.max(1, p.w - 40));
        ctx.fillRect(mx, p.y + 2, 10 + ((h >> (i + 4)) % 8), 4);
      }
      // edge highlight chips (weathered stone catching light)
      ctx.fillStyle = '#3a4050';
      ctx.fillRect(p.x + 6, p.y + 3, 6, 2);
      ctx.fillRect(p.x + p.w - 18, p.y + 3, 8, 2);
    }
    // amended §55 shared treatment: subtle under-edge shadow + side shade.
    ctx.fillStyle = PLATFORM_SHADOW;
    ctx.fillRect(p.x, p.y + p.h - 2, p.w, 2);
    ctx.fillRect(p.x, p.y + 3, 2, p.h - 5);
    ctx.fillRect(p.x + p.w - 2, p.y + 3, 2, p.h - 5);
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
      drawPlatformTexture(p);
    }
  }

  // ---- §55 Phase 10 SET DRESSING (authored per chapter) --------------------
  // Broken stone statues, wooden fences, torn banners, skeletons, cobwebs,
  // and torch poles (the ambient light sources). World space, drawn ON the
  // ground over the platforms but BEHIND every gameplay entity; culled
  // against the zoomed view (§42/§78). Torch flames flicker on the render
  // clock with a stable per-torch phase (§72 — no randomness).
  function drawDressingTorch(ctx, d, t) {
    const px = d.x;
    const base = d.y;
    const flameX = px + 4;
    const flameY = base - 74;
    // pole + sconce
    ctx.fillStyle = '#241a10';
    ctx.fillRect(px - 2, base - 70, 4, 70);
    ctx.fillRect(px - 5, base - 4, 10, 4);                 // foot plate
    ctx.fillStyle = '#38251a';
    ctx.fillRect(px - 6, base - 76, 12, 7);                // sconce basket
    // flame: layered warm rects with deterministic flicker
    const fl = 0.72 + 0.28 * Math.sin(t * 6.3 + px * 0.07);
    ctx.fillStyle = '#e07b2a';
    ctx.fillRect(flameX - 4, flameY - 9 * fl, 8, 12 * fl);
    ctx.fillStyle = '#f2a04c';
    ctx.fillRect(flameX - 2, flameY - 6 * fl, 4, 8 * fl);
    ctx.fillStyle = '#ffe9c4';
    ctx.fillRect(flameX - 1, flameY - 3 * fl, 2, 4 * fl);
    // radial glow: layered alpha shells (§78 — never shadowBlur)
    ctx.fillStyle = '#e8a45c';
    ctx.globalAlpha = TORCH_GLOW_ALPHA;
    ctx.beginPath();
    ctx.arc(flameX, flameY - 2, 46, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = TORCH_GLOW_ALPHA * 0.66;
    ctx.beginPath();
    ctx.arc(flameX, flameY - 2, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = TORCH_GLOW_ALPHA * 0.4;
    ctx.beginPath();
    ctx.arc(flameX, flameY - 2, 66, 0, Math.PI * 2);
    ctx.fill();
    // warm ground pool
    ctx.globalAlpha = 0.10 + 0.05 * fl;
    ctx.beginPath();
    ctx.ellipse(px, base - 2, 42, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function drawDressing(ctx, level, cam, t) {
    const left = cam.x - 120;
    const right = cam.x + VIEW_W + 120;
    for (let ci = 0; ci < level.chapters.length; ci += 1) {
      const ch = level.chapters[ci];
      const dr = ch.dressing;
      if (!dr || dr.length === 0) continue;
      for (let di = 0; di < dr.length; di += 1) {
        const d = dr[di];
        if (d.x < left || d.x > right) continue;           // §42 culling
        const s = d.s || 0;
        if (d.kind === 'statue') {
          // broken stone statue: pedestal + torso stump + fallen head
          ctx.fillStyle = '#1a2133';
          ctx.fillRect(d.x - 16, d.y - 12, 32, 12);        // pedestal
          ctx.fillRect(d.x - 10, d.y - 46, 20, 34);        // torso stump
          ctx.fillRect(d.x - 13, d.y - 46, 5, 12);         // shoulder chip
          ctx.fillStyle = '#2a3348';                       // moonlit edge
          ctx.fillRect(d.x - 10, d.y - 46, 20, 2);
          ctx.fillRect(d.x - 16, d.y - 12, 32, 2);
          ctx.fillStyle = '#10141f';
          ctx.fillRect(d.x + (s % 2 === 0 ? 14 : -26), d.y - 14, 12, 10); // fallen head
          ctx.fillStyle = '#242c40';
          ctx.fillRect(d.x - 7, d.y - 40, 3, 18);          // weathered seam
          if (s >= 3) ctx.fillRect(d.x - 16, d.y - 52, 8, 8);  // crown remnant
        } else if (d.kind === 'fence') {
          // wooden fence: leaning posts + two rails (s = post count 2..5)
          const posts = 2 + (s % 4);
          ctx.fillStyle = '#3a2a1c';
          for (let i = 0; i <= posts; i += 1) {
            const fx = d.x + i * 26;
            const lean = i % 2 === 0 ? 0 : 2;
            ctx.fillRect(fx - 2 + lean, d.y - 34, 4, 34);
          }
          ctx.fillStyle = '#2a1e14';
          ctx.fillRect(d.x - 4, d.y - 28, posts * 26 + 8, 3);   // rail 1
          ctx.fillRect(d.x - 4, d.y - 16, posts * 26 + 8, 3);   // rail 2
        } else if (d.kind === 'banner') {
          // torn banner: pole + hanging cloth strips (s picks the tone)
          const cloth = s % 3 === 0 ? '#6a1016' : (s % 3 === 1 ? '#1e3a5a' : '#3a2a4a');
          ctx.fillStyle = '#241a10';
          ctx.fillRect(d.x - 2, d.y - 86, 4, 86);           // pole
          ctx.fillRect(d.x - 8, d.y - 88, 16, 4);          // crossarm
          ctx.fillStyle = cloth;
          ctx.fillRect(d.x - 6, d.y - 84, 9, 52);           // long strip
          ctx.fillRect(d.x + 5, d.y - 84, 6, 36);          // short strip
          ctx.fillRect(d.x - 4, d.y - 46, 5, 12);          // torn tail
          ctx.fillStyle = '#0a0d14';
          ctx.fillRect(d.x - 6, d.y - 70, 9, 2);           // faded band
        } else if (d.kind === 'bones') {
          // skeleton: ribcage arcs + skull (s scales the layout)
          const k = 1 + (s % 3) * 0.15;
          ctx.globalAlpha = 0.85;
          ctx.fillStyle = '#9aa0ae';
          ctx.fillRect(d.x - 10 * k, d.y - 4, 20 * k, 4);      // spine
          for (let i = 0; i < 4; i += 1) {
            ctx.fillRect(d.x - 12 * k, d.y - 4 - i * 6, 4, 5); // ribs L
            ctx.fillRect(d.x + 8 * k, d.y - 4 - i * 6, 4, 5);  // ribs R
          }
          ctx.fillRect(d.x - 14 * k, d.y - 30, 10, 9);         // skull
          ctx.fillRect(d.x - 11 * k, d.y - 27, 2, 2);          // eye socket
          ctx.fillStyle = '#7a7f8c';
          ctx.fillRect(d.x + 12 * k, d.y - 8, 8, 3);           // scattered bone
          ctx.globalAlpha = 1;
        } else if (d.kind === 'cobweb') {
          // corner web under a platform edge: radial spokes + dew
          ctx.strokeStyle = 'rgba(200,208,230,0.22)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          for (let i = 0; i < 4; i += 1) {
            ctx.moveTo(d.x, d.y);
            ctx.lineTo(d.x - 18 + i * 12, d.y + 22);
          }
          ctx.moveTo(d.x - 18, d.y + 10);
          ctx.lineTo(d.x + 18, d.y + 10);
          ctx.moveTo(d.x - 13, d.y + 18);
          ctx.lineTo(d.x + 13, d.y + 18);
          ctx.stroke();
          ctx.fillStyle = 'rgba(220,228,250,0.4)';
          ctx.fillRect(d.x - 6, d.y + 9, 1.5, 1.5);            // dew drop
        } else if (d.kind === 'bars') {
          // §52.2 the prison bars (2-3's glimpse): a dark wall segment with
          // heavy vertical bars + one bent bar — something almost got out.
          ctx.fillStyle = '#10141f';
          ctx.fillRect(d.x - 34, d.y - 96, 68, 96);           // wall recess
          ctx.fillStyle = '#05070f';
          ctx.fillRect(d.x - 28, d.y - 90, 56, 90);           // cell dark
          ctx.fillStyle = '#2e3852';
          for (let i = 0; i < 5; i += 1) {
            const bend = i === 2 ? 5 : 0;                     // the bent bar
            ctx.fillRect(d.x - 24 + i * 11 + bend, d.y - 90, 6, 90);
          }
          ctx.fillStyle = '#3a4462';                          // bar highlights
          ctx.fillRect(d.x - 24, d.y - 90, 2, 90);
          ctx.fillRect(d.x + 20, d.y - 90, 2, 90);
        } else if (d.kind === 'torch') {
          drawDressingTorch(ctx, d, t);
        }
      }
    }
  }

  // ---- §67/§68 story props (Phase 11): inscription stones + NPC statues ----
  // World-space, dressing-adjacent layer. Stones are readable slabs with a
  // moonlit engraving; the §68 NPC is a taller hooded statue silhouette
  // whose face carries a faint Aram-purple resonance. Culling per §42.
  function drawStoryProps(ctx, level, cam, t, game) {
    const left = cam.x - 120;
    const right = cam.x + VIEW_W + 120;
    const story = game.story;
    for (let ci = 0; ci < level.chapters.length; ci += 1) {
      const ch = level.chapters[ci];
      if (!ch.authored) continue;

      // -- inscription stones -----------------------------------------------
      const stones = ch.stones || [];
      for (let si = 0; si < stones.length; si += 1) {
        const st = stones[si];
        if (st.x < left || st.x > right) continue;
        const ph = storyHash(st.id);
        const active = story && story.inscription && story.inscription.id === st.id;
        // slab: 40x56 standing stone, slightly wider cap
        ctx.fillStyle = '#232b3d';
        ctx.fillRect(st.x - 20, st.y - 56, 40, 56);
        ctx.fillStyle = '#2c3548';
        ctx.fillRect(st.x - 23, st.y - 60, 46, 6);            // cap stone
        ctx.fillStyle = '#4a5878';
        ctx.fillRect(st.x - 23, st.y - 60, 46, 2);            // moonlit top edge
        ctx.fillRect(st.x - 20, st.y - 8, 40, 2);             // base seam
        // engraving: 3 line rows, per-stone deterministic offsets (§72)
        ctx.fillStyle = 'rgba(168,205,255,0.38)';
        for (let li = 0; li < 3; li += 1) {
          const w = 18 + ((ph >> (li * 3)) & 15);
          ctx.fillRect(st.x - 14 + ((ph >> (li * 2)) & 5), st.y - 46 + li * 12, w, 2);
        }
        // active stone breathes a soft cyan halo
        if (active) {
          ctx.globalAlpha = 0.10 + 0.05 * Math.sin(t * 2.4 + ph);
          ctx.fillStyle = '#a8cdff';
          ctx.fillRect(st.x - 26, st.y - 66, 52, 68);
          ctx.globalAlpha = 1;
        }
      }

      // -- §68 NPC statue ----------------------------------------------------
      const npc = ch.npc;
      if (npc && npc.x >= left && npc.x <= right) {
        const done = story && story.npcDone && story.npcDone[npc.id];
        const sh = storyHash(npc.id);
        const bob = Math.sin(t * 1.3 + sh) * 1.5;
        // pedestal + robed hooded silhouette (86 tall)
        ctx.fillStyle = '#1c2333';
        ctx.fillRect(npc.x - 19, npc.y - 10, 38, 10);          // pedestal
        ctx.fillStyle = '#262f45';
        ctx.fillRect(npc.x - 13, npc.y - 78 + bob * 0.4, 26, 68);   // robe
        ctx.fillRect(npc.x - 15, npc.y - 58 + bob * 0.4, 30, 8);    // sleeves
        ctx.fillStyle = '#2e3852';
        ctx.fillRect(npc.x - 10, npc.y - 86 + bob * 0.4, 20, 14);   // hood
        ctx.fillStyle = '#161c2b';
        ctx.fillRect(npc.x - 6, npc.y - 82 + bob * 0.4, 12, 8);     // hood shadow
        // faint purple face resonance (Aram's kinship, §68)
        const glow = story && story.npcPrompt && story.npcPrompt.id === npc.id;
        ctx.fillStyle = glow ? 'rgba(199,125,255,0.75)' : 'rgba(150,110,210,0.35)';
        ctx.fillRect(npc.x - 4, npc.y - 79 + bob * 0.4, 3, 3);
        ctx.fillRect(npc.x + 2, npc.y - 79 + bob * 0.4, 3, 3);
        // done statues dim to a resting grey-lavender
        if (done) {
          ctx.globalAlpha = 0.35;
          ctx.fillStyle = '#3a4054';
          ctx.fillRect(npc.x - 13, npc.y - 86 + bob * 0.4, 26, 78);
          ctx.globalAlpha = 1;
        }
        // interaction prompt: [J] glyph bobbing above the hood (§68)
        if (glow && !done) {
          const py = npc.y - 104 + Math.sin(t * 3.2) * 3;
          ctx.fillStyle = 'rgba(10,12,20,0.85)';
          ctx.fillRect(npc.x - 17, py - 12, 34, 24);
          ctx.fillStyle = 'rgba(199,125,255,0.6)';
          ctx.fillRect(npc.x - 17, py - 12, 34, 2);
          ctx.fillRect(npc.x - 17, py + 10, 34, 2);
          ctx.fillStyle = '#e6d4ef';
          ctx.font = 'bold 14px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('J', npc.x, py + 5);
          ctx.textAlign = 'left';
        }
      }
    }
  }

  // ---- §67/§68 story plates (Phase 11): screen-space presentation ---------
  // Flashback: 2 s black-bg / white-text window (a memory covers the world;
  // the HUD stays readable above it). Cinematic: letterboxed unlock plates.
  // Inscription / NPC dialogue / quip: bottom plates + a line over the
  // active character. All non-blocking (§67) — presentation state only.
  function drawStoryPlates(ctx, game, player, cam) {
    const story = game.story;
    if (!story) return;
    const now = game.gameTime;

    // -- unlock cinematic: letterbox bars + title + text ---------------------
    if (story.cinematic) {
      const a = storyAlpha(now, story.cinematic.until, STORY_DURATIONS.cinematic, 0.3, 0.5);
      if (a > 0) {
        const barH = Math.round(86 * Math.min(1, a * 1.4));
        ctx.fillStyle = '#05060a';
        ctx.fillRect(0, 0, LOGICAL_W, barH);
        ctx.fillRect(0, LOGICAL_H - barH, LOGICAL_W, barH);
        ctx.globalAlpha = Math.min(1, a);
        ctx.fillStyle = '#d8b96a';
        ctx.font = 'bold 21px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(story.cinematic.title, LOGICAL_W / 2, 296);
        ctx.fillStyle = '#cfd8e6';
        ctx.font = '16px sans-serif';
        const lines = wrapLines(ctx, story.cinematic.text, 720, 3);
        for (let i = 0; i < lines.length; i += 1) {
          ctx.fillText(lines[i], LOGICAL_W / 2, 328 + i * 22);
        }
        ctx.textAlign = 'left';
        ctx.globalAlpha = 1;
      }
    }

    if (story.chapterComplete) {
      const a = storyAlpha(now, story.chapterComplete.until,
                           STORY_DURATIONS.chapterComplete, 0.35, 0.6);
      if (a > 0) {
        ctx.globalAlpha = a;
        const barH = Math.round(64 * Math.min(1, a * 1.4));
        ctx.fillStyle = '#04050a';
        ctx.fillRect(0, 0, LOGICAL_W, barH);
        ctx.fillRect(0, LOGICAL_H - barH, LOGICAL_W, barH);
        ctx.font = 'bold 13px sans-serif';
        ctx.fillStyle = '#8fd8c8';
        ctx.textAlign = 'center';
        ctx.fillText('CHAPTER COMPLETE', LOGICAL_W / 2, 300);
        ctx.font = 'bold 19px sans-serif';
        ctx.fillStyle = '#cdd9f0';
        ctx.fillText(story.chapterComplete.title, LOGICAL_W / 2, 324);
        ctx.font = 'italic 15px sans-serif';
        ctx.fillStyle = '#a8b4cc';
        const lines = wrapLines(ctx, story.chapterComplete.text, 700, 2);
        for (let i = 0; i < lines.length; i += 1) {
          ctx.fillText(lines[i], LOGICAL_W / 2, 350 + i * 20);
        }
        ctx.textAlign = 'left';
        ctx.globalAlpha = 1;
      }
    }

    // -- inscription plate (~5 s, §67) ----------------------------------------
    if (story.inscription) {
      const a = storyAlpha(now, story.inscription.until, STORY_DURATIONS.inscription, 0.35, 0.5);
      if (a > 0) {
        ctx.globalAlpha = a;
        ctx.fillStyle = 'rgba(10,14,24,0.78)';
        ctx.fillRect((LOGICAL_W - 660) / 2, 540, 660, 56);
        ctx.fillStyle = 'rgba(168,205,255,0.45)';
        ctx.fillRect((LOGICAL_W - 660) / 2, 540, 660, 2);
        ctx.fillRect((LOGICAL_W - 660) / 2, 594, 660, 2);
        ctx.fillStyle = '#cdd9f0';
        ctx.font = '15px sans-serif';
        ctx.textAlign = 'center';
        const lines = wrapLines(ctx, story.inscription.text, 620, 2);
        const y0 = 568 - (lines.length - 1) * 9;
        for (let i = 0; i < lines.length; i += 1) {
          ctx.fillText(lines[i], LOGICAL_W / 2, y0 + i * 18);
        }
        ctx.textAlign = 'left';
        ctx.globalAlpha = 1;
      }
    }

    // -- §68 NPC dialogue plate (5 s, once per run) ---------------------------
    if (story.npcDialogue) {
      const a = storyAlpha(now, story.npcDialogue.until, STORY_DURATIONS.npcDialogue, 0.3, 0.5);
      if (a > 0) {
        ctx.globalAlpha = a;
        ctx.fillStyle = 'rgba(14,16,22,0.82)';
        ctx.fillRect((LOGICAL_W - 680) / 2, 596, 680, 46);
        ctx.fillStyle = 'rgba(150,110,210,0.5)';
        ctx.fillRect((LOGICAL_W - 680) / 2, 596, 680, 2);
        ctx.fillRect((LOGICAL_W - 680) / 2, 640, 680, 2);
        ctx.fillStyle = '#b9c2d4';
        ctx.font = 'italic 15px sans-serif';
        ctx.textAlign = 'center';
        const lines = wrapLines(ctx, story.npcDialogue.text, 640, 2);
        const y0 = 620 - (lines.length - 1) * 9;
        for (let i = 0; i < lines.length; i += 1) {
          ctx.fillText(lines[i], LOGICAL_W / 2, y0 + i * 18);
        }
        ctx.textAlign = 'left';
        ctx.globalAlpha = 1;
      }
    }

    // -- §67 switch quip: a brief line above the active character ------------
    if (story.quip) {
      const a = storyAlpha(now, story.quip.until, STORY_DURATIONS.quip, 0.2, 0.4);
      if (a > 0) {
        const sx = (player.x + player.w / 2 - cam.x) * ZOOM;
        const sy = (player.y - cam.y) * ZOOM - 16;
        ctx.globalAlpha = a;
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        const w = Math.min(400, ctx.measureText(story.quip.text).width + 24);
        ctx.fillStyle = 'rgba(8,10,18,0.6)';
        ctx.fillRect(sx - w / 2, sy - 15, w, 21);
        ctx.fillStyle = '#e8e2d2';
        ctx.fillText(story.quip.text, sx, sy);
        ctx.textAlign = 'left';
        ctx.globalAlpha = 1;
      }
    }

    // -- flashback: full-screen black + centered white text (TOPMOST — a
    //    memory covers every other plate; the HUD above stays readable) ----
    if (story.flashback) {
      const a = storyAlpha(now, story.flashback.until, STORY_DURATIONS.flashback, 0.22, 0.35);
      if (a > 0) {
        ctx.globalAlpha = Math.min(1, a * 1.05);
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
        ctx.globalAlpha = Math.min(1, a);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'italic 17px sans-serif';
        ctx.textAlign = 'center';
        const lines = wrapLines(ctx, story.flashback.text, 760, 3);
        const y0 = LOGICAL_H / 2 - (lines.length - 1) * 11;
        for (let i = 0; i < lines.length; i += 1) {
          ctx.fillText(lines[i], LOGICAL_W / 2, y0 + i * 23);
        }
        // memory ornament: thin rules above/below the block
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillRect(LOGICAL_W / 2 - 130, y0 - 34, 260, 1);
        ctx.fillRect(LOGICAL_W / 2 - 130, y0 + lines.length * 23 - 12, 260, 1);
        ctx.textAlign = 'left';
        ctx.globalAlpha = 1;
      }
    }
  }

  // ---- enemies (§30/§31/§42) -------------------------------------------------
  function drawEnemies(game, enemies, cam) {
    // §31: dead enemies leave presentation (a cosmetic memorial is optional,
    // §28 — not authored). Render-only culling (§42/§78) against the zoomed
    // view; gameplay entities are NOT removed, merely skipped. Mini-boss
    // art scales by the authored §50 multiplier (hitbox and art agree).
    // Phase 12 finale entities (§52/§52.2) carry their own art + bars +
    for (let i = 0; i < enemies.length; i += 1) {
      const e = enemies[i];
      if (e.dead) continue;
      if (e.x + e.w < cam.x - 120 || e.x > cam.x + VIEW_W + 120) continue;
      if (e.boss) {
        drawBossEntity(ctx, e, game.gameTime);
        continue;
      }
      if (e.type === 'patroller') drawPatroller(ctx, e);
      else if (e.type === 'chaser') drawChaser(ctx, e);
      else if (e.type === 'armored') drawArmored(ctx, e);
      else if (e.type === 'brute') drawBrute(ctx, e, game.gameTime);
      drawEnemyOverlays(ctx, e, game.gameTime);
    }
  }

  function drawPlayer(game, player, level) {
    if (player.x + player.w < game.camera.x - 20
        || player.x > game.camera.x + VIEW_W + 20) return;
    drawDropShadow(ctx, player, level);
    drawSelfGlow(ctx, player, game);
    drawDashTrail(ctx, player, game);
    const blink = player.invuln > 0 && Math.floor(game.gameTime * 20) % 2 === 0;
    if (blink) ctx.globalAlpha = 0.35;
    if (player.character === 'sara') drawSara(ctx, player, game);
    else if (player.character === 'raha') drawRaha(ctx, player, game);
    else if (player.character === 'aram') drawAram(ctx, player, game);
    else drawPlayerPlaceholder(ctx, player);
    if (blink) ctx.globalAlpha = 1;
    drawRimLight(ctx, player, level, game);
    drawShieldAura(ctx, player, game);
    drawCooldownRing(ctx, player);
  }

  // ---- §55 layer 5: foreground grass (fastest layer, screen-bottom anchor)
  function drawGrass(cam, t) {
    const offX = cam.x * PARALLAX_GRASS;
    ctx.fillStyle = GRASS_TONE;
    ctx.fillRect(0, 714, LOGICAL_W, 6);          // continuous root strip
    const k0 = Math.floor((offX - GRASS_PERIOD) / GRASS_PERIOD);
    const k1 = Math.floor((offX + LOGICAL_W) / GRASS_PERIOD) + 1;
    for (let k = k0; k <= k1; k += 1) {
      const v = mod(k * 53 + 7, 89);
      const bx = k * GRASS_PERIOD - offX;
      const tx = bx + 40 + (v % 7) * 24;
      const sway = Math.sin(t * WIND_SWAY_RATE + k * 1.3) * WIND_SWAY_PX;
      ctx.fillRect(tx + sway * 0.4, 702, 3, 12 + (v % 5) * 3);   // tuft blades
      ctx.fillRect(tx + 5 + sway, 696, 3, 18 + (v % 3) * 4);
      ctx.fillRect(tx + 10 + sway * 0.6, 700, 3, 14 + (v % 4) * 3);
      ctx.fillRect(tx + 15 + sway * 0.8, 694, 3, 20 + (v % 5) * 2);
      if (v % 19 === 3) {
        ctx.fillRect(bx + 190 + sway * 1.4, 662, 4, 52);   // sparse tall blade
      }
    }
  }

  // ---- atmosphere (amended §55 Phase 10): fog sheet between the background
  let fogSheetGradient = null;
  function drawFogSheet() {
    if (!fogSheetGradient) {
      fogSheetGradient = ctx.createLinearGradient(0, 470, 0, 660);
      fogSheetGradient.addColorStop(0, 'rgba(13,20,32,0)');
      fogSheetGradient.addColorStop(0.5, 'rgba(13,20,32,0.40)');
      fogSheetGradient.addColorStop(1, 'rgba(13,20,32,0)');
    }
    ctx.fillStyle = fogSheetGradient;
    ctx.fillRect(0, 470, LOGICAL_W, 190);
  }

  // ---- §56 Phase 10 DISTANT LIGHTNING: VISUAL ONLY — never a gameplay
  function drawLightning(game, t) {
    if (game.currentAct < 2) return;
    const phase = t % LIGHTNING_PERIOD;
    if (phase > LIGHTNING_FLASH_T) return;
    const fade = 1 - phase / LIGHTNING_FLASH_T;        // 1 → 0 within the flash
    ctx.fillStyle = 'rgba(220,232,255,' + (0.10 * fade).toFixed(3) + ')';
    ctx.fillRect(0, 0, LOGICAL_W, 300);
    ctx.fillStyle = 'rgba(232,240,255,' + (0.06 * fade).toFixed(3) + ')';
    ctx.fillRect(120, 210, LOGICAL_W - 240, 190);      // horizon-weighted
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

  function render(game, level, player, enemies, collectibles) {
    const cam = game.camera;
    const t = game.gameTime;
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
    drawLightning(game, t);                            // §56 visual-only flash
    drawStars(cam, t);
    drawClouds(cam);
    drawLightBehindCastle(cam, game, t);               // amended §55 canon
    drawMoonRise(game, t);                             // §52/§55 payoff
    drawCastle(cam, game, t);
    drawFogSheet();                                    // §55 Phase 10 band
    drawTrees(cam, t);                                 // §56 wind-swayed
    drawHorizonLight(game);                            // Act 3: horizon lightens
    ctx.save();
    ctx.scale(ZOOM, ZOOM);                             // §7/§53: global ZOOM 1.25
    ctx.translate(-cam.x, -cam.y);                     // world space (§53)
    drawPlatforms(level.allPlatforms, cam, game.brokenPlatformIds);
    drawDressing(ctx, level, cam, t);                  // §55 Phase 10 dressing
    drawStoryProps(ctx, level, cam, t, game);           // §67/§68 stones + NPC
    drawGates(ctx, level.gates, cam, t);               // §50 gates
    drawMoonGate(game, cam, t);                        // §52 moon gate
    drawRings(ctx, game.rings, cam);                   // §24 impact rings
    drawCollectibles(ctx, collectibles, cam, t);       // §48/§58 (Phase 9)
    drawEnemies(game, enemies || [], cam);
    drawPlayer(game, player, level);
    drawProjectiles(ctx, game.projectiles, cam);       // §21 knives + magic
    drawParticles(ctx, game.particles, cam, t);        // §56/§57 FX + ambience
    ctx.restore();
    drawGrass(cam, t);                                 // §56 wind-swayed blades
    if (game.slowMoActive) drawSlowMoTint(ctx);        // §25.1 time-sheen
    drawDamageFlash(ctx, game);                        // §57 Phase 10 red flash
    ctx.restore();                                     // end §54 shake frame
    drawFog();
    drawStoryPlates(ctx, game, player, cam);           // §67/§68 story presentation
    drawTutorial(ctx, game);                           // §20.2 non-blocking hint
    drawVignette();
    drawHUD(ctx, game, player, level);                 // §65 HUD (Phase 9)
  }

  resize();
  return { resize, render, toLogical, view };
}
