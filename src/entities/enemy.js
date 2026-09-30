// Shadows of the Moon — enemy entity system (SPEC §27–§35, §40–§41, §50,
// §58–§60). Phase 8: the FULL ROSTER — Chaser (§29 chase chain), Armored
// (§29.1 magic absorption, HP bar), Brute (§33 radial attack), and the §50
// mini-boss variants (Brute/Armored templates at authored size/HP scale,
// telegraphed patterns, heart-fragment reward). Combat resolution — stomp
// priority (§35/§40), contact damage (§21/§22), dash-through (§23), shield
// block (§25.2), the §33 radial, and the §31 animation-state machine — all
// live here; navigation lives in ai.js.
//
// Every enemy carries a stable authored chapter-scoped string ID (§28).
// Dead enemies are immediately non-collidable, non-damaging, and AI-inactive
// (§31); they never return as active entities during the same run (§28) —
// createEnemies omits any ID already recorded in defeatedEnemyIds, which is
// also the guard the Phase 11 checkpoint respawn and Phase 13 Restart
// Chapter flows reuse.
import {
  ENEMY_TYPES,
  ENEMY_HURT_T,
  ENEMY_STAGGER_T,
  ENEMY_STAGGER_WINDOW,
  STOMP_MIN_VY,
  STOMP_DAMAGE,
  STOMP_BOUNCE,
  INVULN_T,
  COMBO_WINDOW,
  COMBO_MIN_STREAK,
  SLOWMO_FACTOR,
  DASH_DAMAGE,
  ENEMY_RUN_MIN,
  ENEMY_WALK_MAX,
  ATTACK_WINDUP_T,
  ATTACK_COOLDOWN,
  ATTACK_TELEGRAPH_RANGE,
  BRUTE_RADIAL_TRIGGER,
  BRUTE_RADIAL_WINDUP,
  BRUTE_RADIAL_RADIUS,
  BRUTE_RADIAL_DAMAGE,
  BRUTE_RADIAL_COOLDOWN,
  CHASE_TRIGGER_Y,
  SHAKE_LARGE_PX,
  SHAKE_LARGE_T,
  DAMAGE_FLASH_T,
  CHARACTER_COLORS,
} from '../constants.js';
import { aiStep, computeFlanks } from '../ai.js';
import { spawnBurst, spawnHit, spawnDustCloud, addRing, triggerShake } from './particle.js';

// §57 hit particles fire "in the target's color" — the roster's visible
// signature tones (steel armor greys for the cube-bodied soldiers, the
// Brute's crimson cloth). The player target uses the active character's
// signature color (player.js / damagePlayer).
const ENEMY_HIT_COLORS = {
  patroller: '#b8c2d4',
  chaser: '#b8c2d4',
  armored: '#d0d6e0',
  brute: '#c02020',
};

// Deterministic 8–10 cube shatter count from the stable ID (§31/§72 — no
// unseeded randomness; the same enemy always shatters the same way).
function shatterCount(id) {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) % 997;
  return 8 + (h % 3);
}

// Build the active enemy list from AUTHORED chapters only. Regular enemies
// come from chapter.enemies; the §50 mini-boss spawns from chapter.miniBoss
// (template × authored scale, HP 6–10, arena patrol bounds, pattern). IDs
// already in defeatedEnemyIds are omitted (§28 — no duplicate activation
// can ever occur within one run).
export function createEnemies(level, defeatedEnemyIds) {
  const enemies = [];
  for (let i = 0; i < level.chapters.length; i += 1) {
    const chapter = level.chapters[i];
    if (!chapter.authored) continue;                 // Phase 12 authors the rest

    for (let j = 0; j < chapter.enemies.length; j += 1) {
      const spec = chapter.enemies[j];
      const type = ENEMY_TYPES[spec.type];
      if (!type) continue;                           // unknown type: dormant
      if (defeatedEnemyIds.has(spec.id)) continue;   // §28: never re-activate
      enemies.push(makeEnemy(spec.id, type, spec.x, spec.y, spec, chapter));
    }

    // §50 mini-boss: reuses the Brute/Armored template at the authored size
    // scale and HP (6–10); the arena bounds become its patrol; the authored
    // pattern names its telegraphed behavior. Reward: 1 heart fragment (§19).
    const mb = chapter.miniBoss;
    if (mb && !defeatedEnemyIds.has(mb.id)) {
      const type = ENEMY_TYPES[mb.template];
      if (type) {
        const w = Math.round(type.w * mb.scale);
        const h = Math.round(type.h * mb.scale);
        const x = Math.round(mb.arena.x + mb.arena.w / 2 - w / 2);
        enemies.push(makeEnemy(mb.id, type, x, chapter.groundY - h, {
          miniBoss: true,
          pattern: mb.pattern,
          hp: mb.hp,
          scale: mb.scale,
          patrol: { minX: mb.arena.x + 20, maxX: mb.arena.x + mb.arena.w - w - 20 },
        }, chapter));
      }
    }
  }
  return enemies;
}

// Shared enemy factory — regular + mini-boss fields in one place.
function makeEnemy(id, type, x, y, spec, chapter) {
  const hp = spec.hp != null ? spec.hp : type.hp;
  return {
    id,
    type: type.key,
    chases: !!type.chases,
    radial: !!type.radial,
    miniBoss: !!spec.miniBoss,
    pattern: spec.pattern || null,          // §50 telegraphed pattern name
    scale: spec.scale || 1,                 // §50 mini-boss size multiplier
    x,
    y,
    w: Math.round(type.w * (spec.scale || 1)),
    h: Math.round(type.h * (spec.scale || 1)),
    speed: type.speed,
    hp,
    maxHp: hp,
    contactDamage: type.contactDamage,
    score: type.score,                      // §58 base score by template
    patrol: spec.patrol ? { minX: spec.patrol.minX, maxX: spec.patrol.maxX } : null,
    post: x + Math.round(type.w * (spec.scale || 1)) / 2,   // §34 return post
    facing: 'right',
    vx: 0,
    vy: 0,
    state: 'idle',          // §31 animation state
    walkTime: 0,            // walk-cycle clock (presentation fact)
    hurtT: 0,               // §31 hurt window remaining
    staggerT: 0,            // §31/§34 stagger remaining
    edgePauseT: 0,          // §34 edge-detection pause remaining
    recentHits: [],         // timestamps of the last hits (stagger window)
    // ---- Phase 8 AI state (§29/§33/§34/§50) --------------------------------
    alertT: 0,              // §34 alert pause remaining ("!")
    returnT: 0,             // §34 lost-grace before returning to post
    chaseState: 'idle',     // chaser chain: idle|alert|chase|lost|return
    flank: 0,               // §34 advisory flank side this step (-1|0|+1)
    attackCd: ATTACK_COOLDOWN * 0.5,        // §34 attack-timer (staggered start)
    attackWindup: 0,        // §34 non-Brute telegraph wind-up remaining
    attackPoseT: 0,         // §31 attack pose window after the wind-up
    radialCd: 0,            // §33 radial cooldown remaining
    radialWindup: 0,        // §33 radial wind-up remaining (red pulse)
    chargeState: 'ready',   // §50 charge pattern: ready|windup|charging|recovery
    chargeT: 0,             // charge-phase timer
    chargeDir: 1,           // locked charge direction
    chargeCd: 0,            // charge cooldown remaining
    dead: false,
  };
}

// §28/§59 AUTHORITATIVE anti-duplicate-score DEAD transition. Award order
// (§59): guard -> record -> base score -> Perfect Landing x3 -> Combo x2 ->
// add once -> kills once. Mini-bosses additionally award their §50 heart
// fragment (§19: 3 fragments assemble 1 container — the heartCount hook).
// §31 death presentation: shatter into 8–10 armor cubes (deterministic).
function deadTransition(game, enemy, viaStomp) {
  // 1. Already defeated this run: award NOTHING (duplicate DEAD transition).
  if (game.defeatedEnemyIds.has(enemy.id)) {
    enemy.dead = true;
    return;
  }
  // 2. Record the ID immediately.
  game.defeatedEnemyIds.add(enemy.id);
  enemy.dead = true;               // immediately non-collidable, non-damaging
  enemy.vx = 0;
  enemy.radialWindup = 0;
  enemy.attackWindup = 0;
  enemy.state = 'death';
  // 3. Base score (§58).
  let score = enemy.score;
  // 4. Perfect Landing (§41): stomp damage directly reduced HP to zero.
  if (viaStomp) score *= 3;
  // 5. Combo active (§60): the 3rd kill ACTIVATES it, x2 begins with the
  //    FOURTH kill — killStreak still holds the PREVIOUS consecutive count.
  if (game.killStreak >= COMBO_MIN_STREAK) score *= 2;
  // 6. Add final score once. 7. Increment kills once.
  game.score += score;
  game.kills += 1;
  game.killStreak += 1;
  game.comboTimer = COMBO_WINDOW;  // §60: timer resets on kill
  // §50/§19: the mini-boss's heart-fragment reward (data-level; HUD/heart
  // UI presentation is Phase 9/13). 3 fragments assemble 1 container.
  if (enemy.miniBoss && game.heartFragments != null) {
    game.heartFragments += 1;
    game.heartCount = Math.floor(game.heartFragments / 3);
    spawnBurst(game, enemy.x + enemy.w / 2, enemy.y + enemy.h / 2,
               '#e8f0ff', 14);
  }
  // §31 death: shatter into 8–10 cubes (deterministic count per ID).
  spawnBurst(game, enemy.x + enemy.w / 2, enemy.y + enemy.h / 2,
             '#1e1e1e', shatterCount(enemy.id));
  // §57 hit-stop on kill: the deterministic 70 ms freeze (§9). Bridged to
  // the loop by main.js; optional-call keeps this module loop-agnostic.
  if (typeof game.requestHitStop === 'function') game.requestHitStop();
}

// Apply damage to an enemy. `viaStomp` marks the §40 stomp path (the only
// path that can qualify for Perfect Landing, §41). Exposed for the test-mode
// harness (§73) — production callers pass the combat-path flag.
export function damageEnemy(game, enemy, dmg, viaStomp = false) {
  if (enemy.dead || dmg <= 0) return;               // §31: dead = no damage
  enemy.hp -= dmg;
  enemy.hurtT = ENEMY_HURT_T;                       // §31: hurt, 0.15 s
  // §57 hit particles: 10–15 in the target's color on EVERY damage impact
  // (deterministic count; kill-time adds the cube shatter separately).
  spawnHit(game, enemy.x + enemy.w / 2, enemy.y + enemy.h / 2,
           ENEMY_HIT_COLORS[enemy.type] || '#b8c2d4');
  // §31/§34: two hits within 1.0 s -> 0.5 s stagger (enemy-domain timers).
  enemy.recentHits.push(game.gameTime);
  if (enemy.recentHits.length > 2) enemy.recentHits.shift();
  if (enemy.recentHits.length === 2
      && enemy.recentHits[1] - enemy.recentHits[0] <= ENEMY_STAGGER_WINDOW) {
    enemy.staggerT = ENEMY_STAGGER_T;
    enemy.recentHits.length = 0;
  }
  if (enemy.hp <= 0) deadTransition(game, enemy, viaStomp);
}

// Player takes contact damage (§21/§61): actual HP lost only — blocked hits
// (i-frames §22) never reach here. The death state itself is finalized by
// updatePlayer's shared death system (§43).
function damagePlayer(game, player, dmg) {
  const lost = Math.min(player.hp, dmg);
  player.hp -= lost;
  game.damageTaken += lost;                         // §61: actual HP points lost
  player.invuln = INVULN_T;                         // §22: 1.0 s after real HP loss
  game.killStreak = 0;                              // §60: combo resets on HP loss
  game.comboTimer = 0;
  // §57 damage flash: red full-screen, 0.15 s (presentation state decayed
  // in main.js's player domain; rendered above the world, under the HUD).
  game.damageFlashT = DAMAGE_FLASH_T;
  // §57 hit particles in the target's (player's) signature color.
  spawnHit(game, player.x + player.w / 2, player.y + player.h / 2,
           CHARACTER_COLORS[player.character] || CHARACTER_COLORS.sara);
}

// §35 player-enemy collision for one enemy. Stomp takes priority over side
// contact when its geometric conditions are valid; otherwise side contact
// can damage. Player damage is subject to i-frames (§22) and Aram's Shield
// (§25.2 — a blocked hit never reduces HP, never counts damageTaken, never
// resets the Combo). Sara's dash (§23) passes THROUGH enemies: contact
// damage is ignored for its duration and each enemy intersected takes
// DASH_DAMAGE exactly once per dash (player.dashHits is the once-guard).
function resolvePlayerContact(game, enemy, player) {
  if (player.dead) return;
  const overlapX = player.x < enemy.x + enemy.w && player.x + player.w > enemy.x;
  const overlapY = player.y < enemy.y + enemy.h && player.y + player.h > enemy.y;
  if (!overlapX || !overlapY) return;

  // §23 dash pass-through: the ONLY defensive dash property is this short
  // intangibility window — no contact damage, no stomp resolution; the
  // dash-through strike replaces contact handling entirely.
  if (player.dashT > 0) {
    if (player.dashHits.indexOf(enemy.id) === -1) {
      player.dashHits.push(enemy.id);
      damageEnemy(game, enemy, DASH_DAMAGE, false);
    }
    return;
  }

  // §40 stomp: player.vy > 200 AND the feet crossed the enemy top surface
  // during this step (previous bottom above the top, current bottom below).
  const prevBottom = player.prevY + player.h;
  const crossedTop = prevBottom <= enemy.y + 2 && player.y + player.h >= enemy.y;
  if (player.vy > STOMP_MIN_VY && crossedTop) {
    damageEnemy(game, enemy, STOMP_DAMAGE, true);
    player.vy = STOMP_BOUNCE;                       // §40 locked bounce
    player.onGround = false;
    // The bounce counts as the first jump of a fresh airborne cycle, arming
    // exactly one midair jump — the stomp -> bounce -> double jump -> stomp
    // rhythm (§23) works, but never two midair jumps from one bounce (§37).
    player.jumpsUsed = 1;
    return;
  }

  // Side contact damage (§21) — blocked by i-frames (§22) and Shield (§25.2).
  if (player.invuln > 0 || player.shieldT > 0) return;
  damagePlayer(game, player, enemy.contactDamage);
}

// Center-to-center distance between an enemy and the player (§33 geometry).
function centerDist(e, player) {
  const dx = (player.x + player.w / 2) - (e.x + e.w / 2);
  const dy = (player.y + player.h / 2) - (e.y + e.h / 2);
  return Math.sqrt(dx * dx + dy * dy);
}

// §33 BRUTE RADIAL — trigger, wind-up (red pulse), resolution. The cooldown
// is an enemy AI timer: it consumes enemySimDt, so Slow-motion slows it.
// Damage during the wind-up interrupts the attack; the player leaving the
// impact radius before resolution makes it miss. Shield and i-frames block
// normally (§33).
function bruteRadialStep(game, e, player, simDt) {
  if (e.radialCd > 0) e.radialCd = Math.max(0, e.radialCd - simDt);

  if (e.radialWindup > 0) {
    e.vx = 0;                                   // planted during the wind-up
    e.radialWindup = Math.max(0, e.radialWindup - simDt);
    if (e.hurtT > 0) {                          // §33: damage interrupts
      e.radialWindup = 0;
      e.radialCd = BRUTE_RADIAL_COOLDOWN;       // no instant re-trigger loop
    } else if (e.radialWindup === 0) {
      // Resolve: ring + shake + bounded damage check.
      const cx = e.x + e.w / 2;
      const cy = e.y + e.h / 2;
      addRing(game, cx, cy, BRUTE_RADIAL_RADIUS, 'rgba(192,32,32,0.5)');
      spawnBurst(game, cx, cy, '#c02020', 12);
      spawnDustCloud(game, cx, cy);                // §56 dust cloud on heavy impact
      triggerShake(game, SHAKE_LARGE_PX, SHAKE_LARGE_T);   // §54/§57 heavy hit
      e.radialCd = BRUTE_RADIAL_COOLDOWN;
      if (centerDist(e, player) <= BRUTE_RADIAL_RADIUS
          && !player.dead && player.invuln <= 0 && player.shieldT <= 0) {
        damagePlayer(game, player, BRUTE_RADIAL_DAMAGE);
      }
    }
    return true;                                 // wind-up owns this step
  }

  if (e.radial && e.radialCd <= 0 && !player.dead
      && centerDist(e, player) <= BRUTE_RADIAL_TRIGGER) {
    e.radialWindup = BRUTE_RADIAL_WINDUP;
    e.vx = 0;
    e.facing = (player.x + player.w / 2) < (e.x + e.w / 2) ? 'left' : 'right';
    return true;
  }
  return false;
}

// §34/§31 NON-BRUTE TELEGRAPH — Patroller/Chaser/Armored attack animation is
// a VISUAL TELEGRAPH ONLY (§32): no separate damage hitbox, contact damage
// only, and CRITICALLY no gameplay effect — navigation continues while the
// wind-up runs (the "tint + backward step" is rendered: red tint + a
// backward lean offset). This keeps every movement/path/patrol behavior
// bit-identical to the pre-telegraph AI (regression-safe by construction).
function telegraphStep(e, player, simDt) {
  if (e.radial) return;                     // the Brute's attack IS the §33 radial
  if (e.attackCd > 0) e.attackCd = Math.max(0, e.attackCd - simDt);
  if (e.attackPoseT > 0) e.attackPoseT = Math.max(0, e.attackPoseT - simDt);

  if (e.attackWindup > 0) {
    e.attackWindup = Math.max(0, e.attackWindup - simDt);
    if (e.attackWindup === 0) e.attackPoseT = 0.2;   // brief attack pose
    return;
  }
  const dx = Math.abs((player.x + player.w / 2) - (e.x + e.w / 2));
  const dy = Math.abs((player.y + player.h / 2) - (e.y + e.h / 2));
  if (!player.dead && e.attackCd <= 0 && e.staggerT <= 0
      && dx <= ATTACK_TELEGRAPH_RANGE && dy <= CHASE_TRIGGER_Y) {
    e.attackCd = ATTACK_COOLDOWN;
    e.attackWindup = ATTACK_WINDUP_T;      // §34: 0.3 s visual telegraph
  }
}

// §31 ANIMATION STATE machine — computed after movement each step:
// hurt > attack (telegraph/wind-up) > brute crouch > alert pause > jump >
// walk/run with hysteresis (speed > 200 run, < 180 walk) > idle. Stagger
// presents as idle + dark tint; falling uses jump presentation (§31).
function computeAnimState(e) {
  if (e.dead) { e.state = 'death'; return; }
  if (e.hurtT > 0) { e.state = 'hurt'; return; }
  if (e.attackPoseT > 0 || e.chargeState === 'windup') { e.state = 'attack'; return; }
  if (e.radialWindup > 0) { e.state = 'crouch'; return; }   // planted + crouch
  if (e.alertT > 0) { e.state = 'idle'; return; }           // "!" renders above
  if (e.vy < 0) { e.state = 'jump'; return; }
  const sp = Math.abs(e.vx);
  if (sp === 0) { e.state = 'idle'; return; }
  if (e.state === 'run') {
    if (sp < ENEMY_WALK_MAX) e.state = 'walk';              // hysteresis drop
  } else if (sp > ENEMY_RUN_MIN) {
    e.state = 'run';
  } else {
    e.state = 'walk';
  }
}

// One fixed step for the whole enemy system. `dt` is the player-domain
// FIXED_DT; the enemy domain consumes dt * slowMotionFactor EXACTLY ONCE
// (§10/§11) — never both a slowed dt and a slowed velocity.
export function updateEnemies(game, enemies, player, dt, level) {
  const simDt = dt * (game.slowMoActive ? SLOWMO_FACTOR : 1);
  // §34 group flanking (advisory): assign this step's flank sides BEFORE the
  // per-enemy AI runs (deterministic by stable authored IDs).
  computeFlanks(enemies, player);
  for (let i = 0; i < enemies.length; i += 1) {
    const e = enemies[i];
    if (e.dead) continue;                           // §31: AI inactive
    if (e.hurtT > 0) e.hurtT = Math.max(0, e.hurtT - simDt);
    if (e.staggerT > 0) e.staggerT = Math.max(0, e.staggerT - simDt);
    e.walkTime += simDt;
    if (e.staggerT <= 0) {
      // Combat layers first: the Brute radial owns the step during its
      // wind-up; the non-Brute telegraph is VISUAL-ONLY (§32) and never
      // suppresses navigation — the enemy keeps patrolling/chasing while
      // the tint + backward-lean telegraph renders.
      const radialOwns = bruteRadialStep(game, e, player, simDt);
      if (!radialOwns) {
        telegraphStep(e, player, simDt);
        aiStep(e, player, simDt, level, e.flank);
      }
    } else {
      e.vx = 0;                                     // stagger hold
    }
    computeAnimState(e);
    resolvePlayerContact(game, e, player);
  }
  // §60 combo window (run state — player domain clock): expiry clears the
  // streak so the next kill starts a fresh count.
  if (game.comboTimer > 0) {
    game.comboTimer = Math.max(0, game.comboTimer - dt);
    if (game.comboTimer === 0) game.killStreak = 0;
  }
}

// Plain-data snapshot for test instrumentation (§73/§74).
export function enemiesSnapshot(enemies) {
  const out = new Array(enemies.length);
  for (let i = 0; i < enemies.length; i += 1) {
    const e = enemies[i];
    out[i] = {
      id: e.id, type: e.type, x: e.x, y: e.y, w: e.w, h: e.h,
      hp: e.hp, maxHp: e.maxHp, facing: e.facing, state: e.state, dead: e.dead,
      miniBoss: !!e.miniBoss, pattern: e.pattern,
      // §74 enemy-domain timers — the §79.3 slow-motion instrumentation
      // samples these to prove the enemy domain consumes dt * 0.35.
      hurtT: e.hurtT, staggerT: e.staggerT, walkTime: e.walkTime,
      vx: e.vx,
      // Phase 8 AI instrumentation (§29/§33/§34/§50).
      chaseState: e.chaseState, alertT: e.alertT, flank: e.flank,
      attackWindup: e.attackWindup, radialCd: e.radialCd,
      radialWindup: e.radialWindup, chargeState: e.chargeState,
    };
  }
  return out;
}
