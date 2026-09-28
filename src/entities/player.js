// Shadows of the Moon — player entity (SPEC §18–§26, §36–§38, §43).
// Sara (wind, #4a9eff, 5 HP, double jump + dash + knife),
// Raha (mountain, #e63946, 8 HP, slam + shockwave),
// Aram (shadow, #9d4edd, 6 HP, magic + slow-motion + shield).
// Entity-local state stays on the entity; global run state lives on the
// single `game` object (SPEC §71).
//
// Phase 2 owns the movement foundation: horizontal intent, jump rules
// (§37 — Sara two jumps per airborne cycle with the second only after the
// first actually began; Raha/Aram one), coyote time, jump buffer, variable
// jump cut, two-pass collision, and the shared death system foundation
// (§43 — fall death past zone groundY + 400, HP death at hp <= 0).
// Abilities, switching, and i-frames arrive in Phase 7+.
//
// Phase 3 adds PRESENTATION-NEUTRAL animation facts on the entity (§71
// entity-local state): animTime / runTime clocks and lastJumpAt /
// lastLandAt gameTime stamps. They record WHAT happened (jump fired, landed
// at t) — the renderer derives poses and §57 squash/stretch from them. They
// never feed back into gameplay (§57: presentation must not mutate rules),
// so physics, jump availability, and death logic are untouched.
import {
  GRAVITY,
  JUMP_SARA,
  JUMP_RAHA,
  JUMP_ARAM,
  VAR_JUMP_EXTRA,
  VAR_JUMP_MIN_VY,
  COYOTE_TIME,
  JUMP_BUFFER,
  MOVE_SPEED,
  FALL_DEATH_OFFSET,
} from '../constants.js';
import { moveAndCollide } from '../physics.js';

// Authored roster content (SPEC §18; amended x1.3 scale pass): hitbox, HP,
// jumps per airborne cycle. Jump VELOCITIES are tunables in constants.js
// (§98 tweak allowlist). Physics constants are UNCHANGED (§36 locked).
export const ROSTER = Object.freeze({
  sara: Object.freeze({
    key: 'sara', w: 38, h: 62, maxHp: 5, maxJumps: 2, jumpV: JUMP_SARA,
  }),
  raha: Object.freeze({
    key: 'raha', w: 44, h: 62, maxHp: 8, maxJumps: 1, jumpV: JUMP_RAHA,
  }),
  aram: Object.freeze({
    key: 'aram', w: 40, h: 62, maxHp: 6, maxJumps: 1, jumpV: JUMP_ARAM,
  }),
});

// A new run starts with Sara active (locked default).
export function createPlayer(level, characterKey = 'sara') {
  const roster = ROSTER[characterKey] || ROSTER.sara;
  return {
    character: roster.key,
    x: level.spawn.x,
    y: level.spawn.y,
    w: roster.w,
    h: roster.h,
    vx: 0,
    vy: 0,
    onGround: false,
    facing: 'right',
    hp: roster.maxHp,
    maxHp: roster.maxHp,
    maxJumps: roster.maxJumps,
    jumpsUsed: 0,          // jumps consumed in the current airborne cycle
    coyote: 0,             // seconds of coyote time remaining (§36)
    jumpBuffer: 0,         // seconds a jump press stays buffered (§36)
    invuln: 0,             // damage i-frames (seconds; §22, driven from Phase 6)
    prevY: 0,              // top-left y before this step's vertical pass (§40 stomp)
    dead: false,
    deathReason: null,     // 'fall' | 'hp'
    // ---- presentation facts (Phase 3; read-only for rendering, §57) ------
    animTime: 0,           // entity animation clock, seconds (freezes when dead)
    runTime: 0,            // accumulates only while running on ground
    lastJumpAt: -1,        // gameTime of the most recent jump takeoff
    lastLandAt: -1,        // gameTime of the most recent landing
  };
}

function die(game, player, reason) {
  player.dead = true;
  player.deathReason = reason;
  player.vx = 0;
  player.vy = 0;
  player.jumpsUsed = 0;
  player.coyote = 0;
  player.jumpBuffer = 0;
  // Final-death flow (no active checkpoint) foundation: the run-ending
  // screen and save write arrive in Phase 9+; checkpoint respawn (with an
  // active checkpoint) arrives in Phase 11 (§44, §45). Phase 2 records the
  // death and freezes the entity — no auto-reset, ever.
  game.lastDeath = {
    reason,
    character: player.character,
    x: player.x,
    y: player.y,
    gameTime: game.gameTime,
  };
}

// One fixed step. `held` is a plain {left, right, jump, ...} state object,
// `events` the drained input edges for this step, `dt` the player-domain
// sim delta (FIXED_DT; §10 — the player domain never slows).
export function updatePlayer(game, player, held, events, dt, level) {
  if (player.dead) return;                       // frozen after death

  const roster = ROSTER[player.character];
  const wasOnGround = player.onGround;           // for the landing stamp

  // ---- animation clocks (presentation facts; no gameplay effect) --------
  player.animTime += dt;
  if (player.onGround && player.vx !== 0) player.runTime += dt;

  // ---- timers ---------------------------------------------------------------
  if (!player.onGround) player.coyote = Math.max(0, player.coyote - dt);
  if (player.jumpBuffer > 0) player.jumpBuffer = Math.max(0, player.jumpBuffer - dt);
  if (player.invuln > 0) player.invuln = Math.max(0, player.invuln - dt);   // §22
  player.prevY = player.y;                       // §40 stomp crossing reference

  // ---- input edges: only the jump edge matters in Phase 2 ------------------
  // A new edge (re)arms the jump buffer; the buffer fires at most ONE jump
  // per step, so two edges in one frame can never chain into an instant
  // double jump (§37 forbids consecutive-frame jump calls).
  for (let i = 0; i < events.length; i += 1) {
    if (events[i].type === 'jump') player.jumpBuffer = JUMP_BUFFER;
  }

  // ---- horizontal intent ----------------------------------------------------
  let dir = 0;
  if (held.left && !held.right) dir = -1;
  else if (held.right && !held.left) dir = 1;
  player.vx = dir * MOVE_SPEED;
  if (dir !== 0) player.facing = dir < 0 ? 'left' : 'right';

  // ---- jump attempt (buffered; §36, §37) ------------------------------------
  if (player.jumpBuffer > 0) {
    const groundOrCoyote = player.onGround || player.coyote > 0;
    if (groundOrCoyote && player.jumpsUsed === 0) {
      // First jump of the cycle: from ground, or within coyote time.
      player.vy = roster.jumpV;
      player.jumpsUsed = 1;
      player.coyote = 0;
      player.jumpBuffer = 0;
      player.onGround = false;
      player.lastJumpAt = game.gameTime;         // §57 stretch trigger fact
    } else if (!player.onGround && !player.coyote && player.jumpsUsed === 1
               && player.maxJumps >= 2) {
      // Sara's second jump: midair only, and only after the first jump
      // actually began (§37). Walking off a ledge without jumping leaves
      // jumpsUsed at 0 — no midair jump in that case.
      player.vy = roster.jumpV;
      player.jumpsUsed = 2;
      player.jumpBuffer = 0;
      player.lastJumpAt = game.gameTime;         // §57 stretch trigger fact
    }
    // else: buffer stays armed — a landing within JUMP_BUFFER consumes it.
  }

  // ---- variable jump cut (§36): released while ascending fast -------------
  // Total vertical acceleration for this step: gravity plus the cut boost.
  // The cut condition is evaluated on the pre-step vy; physics integrates
  // the combined acceleration exactly (see physics.js header).
  const cutActive = !held.jump && player.vy < VAR_JUMP_MIN_VY;
  const ay = GRAVITY + (cutActive ? VAR_JUMP_EXTRA : 0);

  // ---- integrate + resolve (two-pass, §39; exact kinematics) ---------------
  moveAndCollide(player, level.platforms, dt, ay);
  if (player.onGround) {
    // Landing resets airborne jump availability (§37).
    player.jumpsUsed = 0;
    player.coyote = COYOTE_TIME;
    if (!wasOnGround) player.lastLandAt = game.gameTime;  // §57 squash fact
  }

  // ---- death system (§43): fall death and HP death share one path ---------
  // Fall death uses the ACTIVE CHAPTER's ground line (amended §43/
  // §46): player.y > activeChapterGroundY + 400.
  const chapter = level.chapterAt(player.x);
  if (player.y > chapter.groundY + FALL_DEATH_OFFSET) {
    die(game, player, 'fall');
  } else if (player.hp <= 0) {
    die(game, player, 'hp');
  }
}

// Snapshot for test instrumentation (§73) — plain data, no entity reference.
export function playerSnapshot(player) {
  return {
    character: player.character,
    x: player.x,
    y: player.y,
    w: player.w,
    h: player.h,
    vx: player.vx,
    vy: player.vy,
    onGround: player.onGround,
    facing: player.facing,
    hp: player.hp,
    maxHp: player.maxHp,
    maxJumps: player.maxJumps,
    jumpsUsed: player.jumpsUsed,
    coyote: player.coyote,
    jumpBuffer: player.jumpBuffer,
    invuln: player.invuln,
    dead: player.dead,
    deathReason: player.deathReason,
    // presentation facts (§74 player state instrumentation)
    animTime: player.animTime,
    runTime: player.runTime,
    lastJumpAt: player.lastJumpAt,
    lastLandAt: player.lastLandAt,
  };
}
