// Shadows of the Moon — player entity + ability authority (SPEC §18–§26, §36–
// §38, §43, §20/§20.1). Sara (wind, #4a9eff, 5 HP, double jump + dash +
// knife), Raha (mountain, #e63946, 8 HP, slam + shockwave), Aram (shadow,
// #9d4edd, 6 HP, magic + slow-motion + shield). Entity-local state stays on
// the entity; global run state lives on the single `game` object (SPEC §71).
//
// Phase 7 owns the ability architecture:
//   - PER-CHARACTER independent cooldowns (§11.1/§20) on global gameTime,
//     ticked in the PLAYER domain — never slowed by Aram's Slow-motion.
//   - Sara: knife (J) + dash (K tap) with §23 dash-through damage and
//     pass-through intangibility.
//   - Raha: shockwave (J, radial) + slam/ground pound (K, 90px impact,
//     fast-fall while airborne) with breakable-breaking (§24).
//   - Aram: magic (J) + K tap/hold split at 300 ms (§25): tap = slow-motion
//     (global time-domain effect on `game`), hold = shield.
//   - Character switching with the §20 HP-ratio formula, i-frame floor,
//     blocked-while rules, and progressive unlock gating.
//   - §20.1 switch combos: timed modifiers on the INCOMING ability.
// Presentation facts (§57) are recorded for the renderer and never feed back
// into gameplay.
import {
  GRAVITY,
  MAX_FALL,
  JUMP_SARA,
  JUMP_RAHA,
  JUMP_ARAM,
  VAR_JUMP_EXTRA,
  VAR_JUMP_MIN_VY,
  COYOTE_TIME,
  JUMP_BUFFER,
  MOVE_SPEED,
  FALL_DEATH_OFFSET,
  KNIFE_COOLDOWN,
  KNIFE_SPEED,
  KNIFE_RANGE,
  DASH_DURATION,
  DASH_COOLDOWN,
  DASH_SPEED,
  DASH_DAMAGE,
  SHOCKWAVE_COOLDOWN,
  SHOCKWAVE_RADIUS,
  SHOCKWAVE_DAMAGE,
  SLAM_COOLDOWN,
  SLAM_RADIUS,
  SLAM_DAMAGE,
  SLAM_FALL_KICK,
  SLAM_GRAVITY_MULT,
  MAGIC_COOLDOWN,
  SLOWMO_DURATION,
  SLOWMO_COOLDOWN,
  SHIELD_DURATION,
  SHIELD_COOLDOWN,
  SPECIAL_THRESHOLD,
  ATTACK_ANIM_T,
  SPECIAL_ANIM_T,
  SWITCH_INVULN_FLOOR,
  SWITCH_COMBO_WINDOW,
  COMBO_SLAM_MULT,
  COMBO_SLOWMO_MULT,
} from '../constants.js';
import { moveAndCollide } from '../physics.js';
import { damageEnemy } from './enemy.js';
import { spawnProjectile } from './projectile.js';
import { spawnBurst, addRing } from './particle.js';

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

// A new run starts with Sara active (locked default). `unlocked` gates
// switching (§20); the run starts with Sara only — Raha joins at chapter 1-3
// and Aram at chapter 1-5 (story unlocks, §4/§67/§63).
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
    invuln: 0,             // damage i-frames (seconds; §22)
    prevY: 0,              // top-left y before this step's vertical pass (§40)
    dead: false,
    deathReason: null,     // 'fall' | 'hp'
    // ---- ability state (§11.1/§21/§23–§25; entity-local) --------------------
    cooldowns: {           // per-character, independent, authoritative (§11.1)
      sara: { attack: 0, special: 0 },
      raha: { attack: 0, special: 0 },
      aram: { attack: 0, special: 0, shield: 0 },
    },
    dashT: 0,              // remaining dash time (§23), 0 = inactive
    dashDir: 1,            // locked horizontal direction of the dash
    dashFlight: false,     // §20.1 combo: gravity-ignoring flight dash
    dashHits: [],          // enemy ids already damaged by THIS dash (§23)
    slamActive: false,     // §24 airborne fast-fall descent in progress
    shieldT: 0,            // §25.2 remaining shield time
    // Aram K tap/hold decision (§25): press stamp + resolution flag. The
    // decision is DEFERRED — released before 300 ms = slow-motion, held to
    // 300 ms = shield; once triggered the same press cannot do the other.
    specialPressAt: null,
    specialResolved: true,
    // ---- presentation facts (Phase 3; read-only for rendering, §57) --------
    animTime: 0,           // entity animation clock, seconds (freezes when dead)
    runTime: 0,            // accumulates only while running on ground
    lastJumpAt: -1,        // gameTime of the most recent jump takeoff
    lastLandAt: -1,        // gameTime of the most recent landing
    attackAnimT: 0,        // §18.1 attack pose window remaining
    specialAnimT: 0,       // §18.1 special pose window remaining
    trail: [],             // dash afterimage positions (§18.1, presentation)
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
  player.dashT = 0;               // abilities end with the entity (§23/§24)
  player.dashFlight = false;
  player.dashHits.length = 0;
  player.slamActive = false;
  player.shieldT = 0;
  player.specialPressAt = null;
  player.specialResolved = true;
  game.lastDeath = {
    reason,
    character: player.character,
    x: player.x,
    y: player.y,
    gameTime: game.gameTime,
  };
}

// Effective max HP = base + global heart containers (§19). heartCount is a
// run-state upgrade authored from Phase 13; the hook exists so the §20
// switching formula is already exact when it lands.
function effectiveMaxHp(game, key) {
  return ROSTER[key].maxHp + (game.heartCount || 0);
}

// §20 CHARACTER SWITCHING. Returns true when the switch actually happened.
// Blocked while: Sara Dash active, Raha Slam active, player dead, death
// screen, victory screen. Locked characters are never selectable (§16/§20).
// Cooldowns remain independent — they are per-character and untouched.
export function switchCharacter(game, player, key) {
  if (!ROSTER[key]) return false;
  if (key === player.character) return false;
  if (player.dead) return false;                        // §20 blocked-while
  if (game.unlockedCharacters.indexOf(key) === -1) return false;
  if (player.dashT > 0) return false;                   // §20: Sara Dash active
  if (player.slamActive) return false;                  // §20: Raha Slam active

  const roster = ROSTER[key];
  const oldEff = effectiveMaxHp(game, player.character);
  const newEff = effectiveMaxHp(game, key);
  // §20: newHp = round(newEffectiveMaxHp * (currentHp / oldEffectiveMaxHp)),
  // clamped to 0..newEffectiveMaxHp.
  let newHp = Math.round(newEff * (player.hp / oldEff));
  if (newHp < 0) newHp = 0;
  if (newHp > newEff) newHp = newEff;

  // §20: invulnerabilityRemaining = max(existing, 0.35) — never stacked.
  player.invuln = Math.max(player.invuln, SWITCH_INVULN_FLOOR);

  // Center-preserving hitbox swap: feet stay planted (all roster heights are
  // 62 px after the §18 x1.3 scale pass).
  player.x += (player.w - roster.w) / 2;
  player.w = roster.w;
  player.h = roster.h;
  player.character = roster.key;
  player.maxHp = roster.maxHp;
  player.maxJumps = roster.maxJumps;
  player.hp = newHp;
  // jumpsUsed is preserved: §37 semantics stay per-cycle and per-character
  // (Raha/Aram have no midair jump regardless of the incoming count; Sara
  // still needs her first jump to have actually begun).
  // A stale K press never carries across a switch (§25 decision is per
  // press, per character).
  player.specialPressAt = null;
  player.specialResolved = true;
  // Aram's shield is her aura — it ends when she leaves the field. The
  // slow-motion time-domain effect is global and PERSISTS (§25.1).
  if (key !== 'aram') player.shieldT = 0;

  // §20.1 switch combos: a switch within 1.5 s of an ability use arms a timed
  // modifier on the INCOMING character's matching ability.
  const last = game.lastAbilityUse;
  if (last && game.gameTime - last.at <= SWITCH_COMBO_WINDOW) {
    const pair = `${last.character}:${last.ability}->${key}`;
    let ability = null;
    if (last.character === 'sara' && last.ability === 'dash' && key === 'raha') ability = 'slam';
    else if (last.character === 'raha' && last.ability === 'slam' && key === 'aram') ability = 'slowmo';
    else if (last.character === 'aram' && last.ability === 'slowmo' && key === 'sara') ability = 'dash';
    if (ability) {
      game.comboBoost = {
        ability,
        from: last.character,
        to: key,
        until: game.gameTime + SWITCH_COMBO_WINDOW,
        label: pair,
      };
    }
  }
  return true;
}

// Records an ability ACTIVATION for §20.1 combo pairing + §26 authoritative
// cooldown start. Every real activation goes through here exactly once.
function noteAbilityUse(game, player, ability) {
  game.lastAbilityUse = { character: player.character, ability, at: game.gameTime };
}

// Consumes an armed §20.1 combo modifier for the incoming ability key.
// Returns the multiplier context for that ability (or null).
function consumeCombo(game, ability) {
  const boost = game.comboBoost;
  if (!boost || boost.ability !== ability || game.gameTime > boost.until) return null;
  game.comboBoost = null;
  game.lastCombo = { from: boost.from, to: boost.to, ability, at: game.gameTime };
  return boost;
}

// §24 deterministic circle-vs-AABB intersection (slam/shockwave area tests).
export function circleHitsAABB(cx, cy, r, b) {
  const nx = Math.max(b.x, Math.min(cx, b.x + b.w));
  const ny = Math.max(b.y, Math.min(cy, b.y + b.h));
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy <= r * r;
}

// §24 the 90px radial impact shared by Airborne Slam landing and Grounded
// Ground Pound: 2 damage to enemies intersecting, breakables intersecting
// break, large camera shake. `dmg` carries the §20.1 combo x3 multiplier.
export function radialImpact(game, player, enemies, level, dmg) {
  const cx = player.x + player.w / 2;
  const cy = player.y + player.h;                       // feet center
  for (let i = 0; i < enemies.length; i += 1) {
    const e = enemies[i];
    if (e.dead) continue;
    if (circleHitsAABB(cx, cy, SLAM_RADIUS, e)) damageEnemy(game, e, dmg, false);
  }
  // Breakables intersecting the impact break (§24): stone is Raha's to open.
  let broke = false;
  for (let i = 0; i < level.platforms.length; i += 1) {
    const p = level.platforms[i];
    if (!p.breakable || p.devEndWall) continue;
    if (game.brokenPlatformIds.has(p.id)) continue;
    if (circleHitsAABB(cx, cy, SLAM_RADIUS, p)) {
      game.brokenPlatformIds.add(p.id);
      broke = true;
      spawnBurst(game, p.x + p.w / 2, p.y + p.h / 2, '#3a3a4a', 12);
    }
  }
  if (broke) game.solidsDirty = true;                   // rebuild collision view
  // §54 large shake + §57 impact feedback (presentation state only).
  game.shake = { mag: 12, t: 0.25, T: 0.25 };
  addRing(game, cx, cy, SLAM_RADIUS, 'rgba(230,57,70,0.55)');
  spawnBurst(game, cx, cy, '#6b6b7a', 16);
}

// ---- J attack per character (§21/§23/§24/§25.3) --------------------------------
export function useAttack(game, player, enemies, level) {
  if (player.dead) return;
  const cd = player.cooldowns[player.character].attack;
  if (cd > 0) return;                                   // authoritative gate (§11.1)
  const dir = player.facing === 'left' ? -1 : 1;
  if (player.character === 'sara') {
    player.cooldowns.sara.attack = KNIFE_COOLDOWN;
    spawnProjectile(game, 'knife', player.x + player.w / 2 + dir * 14,
                    player.y + 22, dir);
    noteAbilityUse(game, player, 'knife');
  } else if (player.character === 'raha') {
    player.cooldowns.raha.attack = SHOCKWAVE_COOLDOWN;
    // §24 RADIAL: damages every target in range around Raha.
    const cx = player.x + player.w / 2;
    const cy = player.y + player.h / 2;
    for (let i = 0; i < enemies.length; i += 1) {
      const e = enemies[i];
      if (e.dead) continue;
      if (circleHitsAABB(cx, cy, SHOCKWAVE_RADIUS, e)) damageEnemy(game, e, SHOCKWAVE_DAMAGE, false);
    }
    addRing(game, cx, cy, SHOCKWAVE_RADIUS, 'rgba(230,57,70,0.4)');
    noteAbilityUse(game, player, 'shockwave');
  } else {                                              // aram — magic shot
    player.cooldowns.aram.attack = MAGIC_COOLDOWN;
    spawnProjectile(game, 'magic', player.x + player.w / 2 + dir * 12,
                    player.y + 24, dir);
    noteAbilityUse(game, player, 'magic');
  }
  player.attackAnimT = ATTACK_ANIM_T;                   // §18.1 pose fact
}

// ---- K press (§23/§24/§25) ------------------------------------------------------
// Sara: dash. Raha: airborne slam (fast-fall) or grounded ground pound.
// Aram: record the press — the tap/hold decision is deferred (§25).
export function specialPress(game, player, enemies, level) {
  if (player.dead) return;
  if (player.character === 'sara') {
    if (player.cooldowns.sara.special > 0 || player.dashT > 0) return;
    const boost = consumeCombo(game, 'dash');
    player.cooldowns.sara.special = DASH_COOLDOWN;
    player.dashT = DASH_DURATION;
    player.dashDir = player.facing === 'left' ? -1 : 1;
    player.dashFlight = !!boost;                        // §20.1: gravity ignored
    player.dashHits.length = 0;
    player.specialAnimT = SPECIAL_ANIM_T;
    noteAbilityUse(game, player, 'dash');
  } else if (player.character === 'raha') {
    if (player.cooldowns.raha.special > 0 || player.slamActive) return;
    player.cooldowns.raha.special = SLAM_COOLDOWN;
    if (player.onGround) {
      // §24 Ground Pound: same 90px impact, no fast-fall.
      const boost = consumeCombo(game, 'slam');
      radialImpact(game, player, enemies, level, SLAM_DAMAGE * (boost ? COMBO_SLAM_MULT : 1));
    } else {
      // §24 Airborne Slam: enter fast-fall; the impact fires on landing.
      player.slamActive = true;
      if (player.vy < SLAM_FALL_KICK) player.vy = SLAM_FALL_KICK;
    }
    noteAbilityUse(game, player, 'slam');
    player.specialAnimT = SPECIAL_ANIM_T;
  } else {                                              // aram — deferred (§25)
    player.specialPressAt = game.gameTime;
    player.specialResolved = false;
  }
}

// Aram slow-motion activation (§25.1) — K released before the 300 ms
// threshold. On cooldown, or while the other Aram K ability is active: do
// nothing, never silently convert (§25).
function activateSlowMotion(game, player) {
  if (player.cooldowns.aram.special > 0) return;
  if (game.slowMoActive || player.shieldT > 0) return;  // §25 mutual exclusion
  const boost = consumeCombo(game, 'slowmo');
  const duration = SLOWMO_DURATION * (boost ? COMBO_SLOWMO_MULT : 1);
  player.cooldowns.aram.special = SLOWMO_COOLDOWN;
  game.slowMoActive = true;
  game.slowMoT = duration;
  player.specialAnimT = SPECIAL_ANIM_T;
  noteAbilityUse(game, player, 'slowmo');
}

// Aram shield activation (§25.2) — K held to the 300 ms threshold.
function activateShield(game, player) {
  if (player.cooldowns.aram.shield > 0) return;
  if (player.shieldT > 0 || game.slowMoActive) return;  // §25 mutual exclusion
  player.cooldowns.aram.shield = SHIELD_COOLDOWN;
  player.shieldT = SHIELD_DURATION;
  player.specialAnimT = SPECIAL_ANIM_T;
  noteAbilityUse(game, player, 'shield');
}

// K released before 300 ms (§25) — Aram resolves to slow-motion; Sara/Raha
// resolved their special on press, so a late tap event is inert for them.
export function specialTap(game, player) {
  if (player.dead) return;
  if (player.character !== 'aram') {
    player.specialPressAt = null;
    player.specialResolved = true;
    return;
  }
  if (player.specialResolved) return;                   // already fired at threshold
  player.specialResolved = true;
  player.specialPressAt = null;
  activateSlowMotion(game, player);
}

// K released at/after 300 ms (§25) — Aram resolves to shield. The threshold
// check inside updatePlayer normally fires FIRST (while still held); this is
// the safety net for edge cases (e.g. a press that began mid-pause).
export function specialHold(game, player) {
  if (player.dead) return;
  if (player.character !== 'aram') {
    player.specialPressAt = null;
    player.specialResolved = true;
    return;
  }
  if (player.specialResolved) return;
  player.specialResolved = true;
  player.specialPressAt = null;
  activateShield(game, player);
}

// One fixed step. `held` is a plain {left, right, jump, ...} state object,
// `events` the drained input edges for this step, `dt` the player-domain
// sim delta (FIXED_DT; §10 — the player domain never slows). `enemies` and
// `level` (platforms view + chapterAt) are the explicit world context the
// ability system may touch (§39 purity: only state explicitly passed in).
export function updatePlayer(game, player, held, events, dt, level, enemies) {
  if (player.dead) return;                       // frozen after death

  const roster = ROSTER[player.character];
  const wasOnGround = player.onGround;           // for the landing stamp

  // ---- animation clocks (presentation facts; no gameplay effect) ----------
  player.animTime += dt;
  if (player.onGround && player.vx !== 0) player.runTime += dt;
  if (player.attackAnimT > 0) player.attackAnimT = Math.max(0, player.attackAnimT - dt);
  if (player.specialAnimT > 0) player.specialAnimT = Math.max(0, player.specialAnimT - dt);
  if (player.slamActive) player.specialAnimT = Math.max(player.specialAnimT, 0.05);

  // ---- timers ---------------------------------------------------------------
  if (!player.onGround) player.coyote = Math.max(0, player.coyote - dt);
  if (player.jumpBuffer > 0) player.jumpBuffer = Math.max(0, player.jumpBuffer - dt);
  if (player.invuln > 0) player.invuln = Math.max(0, player.invuln - dt);   // §22
  if (player.shieldT > 0) player.shieldT = Math.max(0, player.shieldT - dt);
  // §11.1: ALL characters' cooldowns tick in the player domain on global
  // gameTime — never slowed by Slow-motion, frozen during Pause (no steps).
  const cds = player.cooldowns;
  const charKeys = ['sara', 'raha', 'aram'];
  for (let ci = 0; ci < charKeys.length; ci += 1) {
    const c = cds[charKeys[ci]];
    if (c.attack > 0) c.attack = Math.max(0, c.attack - dt);
    if (c.special > 0) c.special = Math.max(0, c.special - dt);
    if (c.shield > 0) c.shield = Math.max(0, c.shield - dt);   // aram only
  }
  player.prevY = player.y;                       // §40 stomp crossing reference

  // ---- input edges ------------------------------------------------------------
  for (let i = 0; i < events.length; i += 1) {
    const ev = events[i];
    if (ev.type === 'jump') player.jumpBuffer = JUMP_BUFFER;
    if (ev.type === 'attack') useAttack(game, player, enemies, level);
    else if (ev.type === 'special') specialPress(game, player, enemies, level);
    else if (ev.type === 'special-tap') specialTap(game, player);
    else if (ev.type === 'special-hold') specialHold(game, player);
  }

  // ---- Aram K threshold (§25): held to 300 ms while still held -> shield ----
  if (player.character === 'aram' && !player.specialResolved
      && player.specialPressAt != null
      && game.gameTime - player.specialPressAt >= SPECIAL_THRESHOLD) {
    player.specialResolved = true;
    player.specialPressAt = null;
    activateShield(game, player);
  }

  // ---- dash (§23): locked trajectory; contact resolution lives in enemy.js -
  if (player.dashT > 0) {
    player.dashT = Math.max(0, player.dashT - dt);
    player.vx = player.dashDir * DASH_SPEED;
    // §18.1 afterimage trail: presentation facts only (alpha fades in render).
    player.trail.push({ x: player.x, y: player.y, t: game.gameTime });
    if (player.trail.length > 5) player.trail.shift();
    if (player.dashT === 0) {
      player.dashFlight = false;
      player.trail.length = 0;
    }
  }

  // ---- horizontal intent (the dash overrides input for its duration) -------
  if (player.dashT === 0) {
    let dir = 0;
    if (held.left && !held.right) dir = -1;
    else if (held.right && !held.left) dir = 1;
    player.vx = dir * MOVE_SPEED;
    if (dir !== 0) player.facing = dir < 0 ? 'left' : 'right';
  }

  // ---- jump attempt (buffered; §36, §37) — never during slam descent -------
  if (player.jumpBuffer > 0 && !player.slamActive) {
    const groundOrCoyote = player.onGround || player.coyote > 0;
    if (groundOrCoyote && player.jumpsUsed === 0) {
      player.vy = roster.jumpV;
      player.jumpsUsed = 1;
      player.coyote = 0;
      player.jumpBuffer = 0;
      player.onGround = false;
      player.lastJumpAt = game.gameTime;
    } else if (!player.onGround && !player.coyote && player.jumpsUsed === 1
               && player.maxJumps >= 2) {
      player.vy = roster.jumpV;
      player.jumpsUsed = 2;
      player.jumpBuffer = 0;
      player.lastJumpAt = game.gameTime;
    }
  }

  // ---- vertical acceleration ---------------------------------------------------
  // §24 fast-fall: no terminal clamp, boosted gravity. §20.1 combo flight:
  // gravity fully ignored and vy locked to 0 for the dash's duration.
  // Otherwise the §36 variable jump cut applies exactly.
  let ay;
  let maxFall = MAX_FALL;
  if (player.dashFlight && player.dashT > 0) {
    ay = 0;
    player.vy = 0;
  } else if (player.slamActive) {
    ay = GRAVITY * SLAM_GRAVITY_MULT;
    maxFall = Infinity;
  } else {
    const cutActive = !held.jump && player.vy < VAR_JUMP_MIN_VY;
    ay = GRAVITY + (cutActive ? VAR_JUMP_EXTRA : 0);
  }

  // ---- integrate + resolve (two-pass, §39; exact kinematics) ---------------
  moveAndCollide(player, level.platforms, dt, ay, maxFall);
  if (player.onGround) {
    player.jumpsUsed = 0;
    player.coyote = COYOTE_TIME;
    if (!wasOnGround) {
      player.lastLandAt = game.gameTime;
      // §24: the airborne slam's 90px impact fires on landing, then ends.
      if (player.slamActive) {
        player.slamActive = false;
        const boost = consumeCombo(game, 'slam');
        radialImpact(game, player, enemies, level,
                     SLAM_DAMAGE * (boost ? COMBO_SLAM_MULT : 1));
      }
    }
  }

  // ---- death system (§43): fall death and HP death share one path ---------
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
    // ability state (§74 cooldown state instrumentation)
    cooldowns: {
      sara: { attack: player.cooldowns.sara.attack, special: player.cooldowns.sara.special },
      raha: { attack: player.cooldowns.raha.attack, special: player.cooldowns.raha.special },
      aram: { attack: player.cooldowns.aram.attack, special: player.cooldowns.aram.special,
              shield: player.cooldowns.aram.shield },
    },
    dashT: player.dashT,
    dashDir: player.dashDir,
    dashFlight: player.dashFlight,
    slamActive: player.slamActive,
    shieldT: player.shieldT,
    // presentation facts (§74 player state instrumentation)
    animTime: player.animTime,
    runTime: player.runTime,
    lastJumpAt: player.lastJumpAt,
    lastLandAt: player.lastLandAt,
    attackAnimT: player.attackAnimT,
    specialAnimT: player.specialAnimT,
  };
}
