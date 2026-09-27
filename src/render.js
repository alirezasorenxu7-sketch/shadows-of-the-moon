// Shadows of the Moon — procedural renderer (SPEC §7, §55, §57, §78).
// Canvas 2D only. Logical 1280x720, strict 16:9 contain scaling — X and Y
// are NEVER stretched independently; letterboxing is allowed. Touch
// coordinates map through the SAME transform as rendering (§7):
// logical = (client - renderOffset) / scale. effectiveDPR = min(dpr, 2);
// imageSmoothingEnabled = false, re-asserted after every backing-store
// resize. shadowBlur is reserved for enemy eyes only (§30, §78) — this
// module never uses it. NO gameplay logic in rendering (§70).
// Scene so far: sky, deterministic twinkling stars, placeholder level
// geometry. Phase 3 adds the procedural Sara character (§18.1): authored
// rect-based body with idle / run / rise / fall poses plus the §18.1 attack
// and special poses (dormant until Phase 7 wires the ability triggers) and
// §57 squash/stretch. Raha and Aram keep the character-colored placeholder
// marker until Phase 7. Parallax layers, moon and castle arrive in Phase 4;
// camera in Phase 4 — world coordinates render directly until then.
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

  function drawStars(gameTime) {
    ctx.fillStyle = STAR_TONE;
    for (let i = 0; i < STARS.length; i += 1) {
      const s = STARS[i];
      const alpha = 0.3 + 0.6 * Math.abs(Math.sin(gameTime * 0.9 + s.tw));
      ctx.globalAlpha = alpha;
      ctx.fillRect(s.x, s.y, s.s, s.s);
    }
    ctx.globalAlpha = 1;
  }

  function drawPlatforms(platforms) {
    // Placeholder geometry rendering (§55 platform tones). The pit between
    // ground A and ground B is simply void — sky shows through.
    for (let i = 0; i < platforms.length; i += 1) {
      const p = platforms[i];
      ctx.fillStyle = GROUND_FILL;
      ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.fillStyle = GROUND_EDGE;
      ctx.fillRect(p.x, p.y, p.w, 3);            // lit top edge
    }
  }

  function drawPlayer(game, player) {
    // Render-only culling (§78): never draw what the fixed camera cannot
    // see; gameplay entities are NOT removed, merely skipped in presentation.
    if (player.x + player.w < 0 || player.x > LOGICAL_W) return;
    if (player.character === 'sara') drawSara(ctx, player, game);
    else drawPlayerPlaceholder(ctx, player);
  }

  function render(game, level, player) {
    drawSky();
    drawStars(game.gameTime);
    drawPlatforms(level.platforms);
    drawPlayer(game, player);
  }

  resize();
  return { resize, render, toLogical, view };
}
