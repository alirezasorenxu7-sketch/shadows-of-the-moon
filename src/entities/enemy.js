// Shadows of the Moon — enemy entity system (SPEC §27–§35, §40–§41, §58–§60).
// Phase 6: the Patroller — authored type table, base AI (ai.js), player-
// enemy collision with stomp priority (§35/§40), contact damage (§21/§22),
// hurt/stagger/death states (§31), and the AUTHORITATIVE anti-duplicate-
// score DEAD transition (§28/§59) driven by game.defeatedEnemyIds.
//
// Every enemy carries a stable authored chapter-scoped string ID (§28).
// Dead enemies are immediately non-collidable, non-damaging, and AI-inactive
// (§31); they never return as active entities during the same run (§28) —
// createEnemies omits any ID already recorded in defeatedEnemyIds, which is
// also the guard the Phase 11 checkpoint respawn and Phase 13 Restart
// Chapter flows reuse. Chaser/Armored/Brute join the roster in Phase 8;
// authored data for those types stays dormant until then.
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
} from '../constants.js';
import { patrolStep } from '../ai.js';

// Build the active enemy list from AUTHORED chapters only. Enemies whose ID
// is already in defeatedEnemyIds are omitted (§28 — the respawn/rebuild
// filter; no duplicate activation can ever occur within one run).
export function createEnemies(level, defeatedEnemyIds) {
  const enemies = [];
  for (let i = 0; i < level.chapters.length; i += 1) {
    const chapter = level.chapters[i];
    if (!chapter.authored) continue;                 // Phase 12 authors the rest
    for (let j = 0; j < chapter.enemies.length; j += 1) {
      const spec = chapter.enemies[j];
      const type = ENEMY_TYPES[spec.type];
      if (!type) continue;                           // Phase 8 roster types stay dormant
      if (defeatedEnemyIds.has(spec.id)) continue;   // §28: never re-activate
      enemies.push({
        id: spec.id,
        type: type.key,
        x: spec.x,
        y: spec.y,
        w: type.w,
        h: type.h,
        speed: type.speed,
        hp: type.hp,
        maxHp: type.hp,
        contactDamage: type.contactDamage,
        score: type.score,
        patrol: spec.patrol ? { minX: spec.patrol.minX, maxX: spec.patrol.maxX } : null,
        facing: 'right',
        vx: 0,
        vy: 0,
        state: 'idle',          // §31 animation state (Phase 8 extends the set)
        walkTime: 0,            // walk-cycle clock (presentation fact)
        hurtT: 0,               // §31 hurt window remaining
        staggerT: 0,            // §31/§34 stagger remaining
        edgePauseT: 0,          // §34 edge-detection pause remaining
        recentHits: [],         // timestamps of the last hits (stagger window)
        dead: false,
      });
    }
  }
  return enemies;
}

// §28/§59 AUTHORITATIVE anti-duplicate-score DEAD transition. Award order
// (§59): guard -> record -> base score -> Perfect Landing x3 -> Combo x2 ->
// add once -> kills once. Synchronous; no async between operations; no
// other code path may award an enemy's kill score.
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
}

// Apply damage to an enemy. `viaStomp` marks the §40 stomp path (the only
// path that can qualify for Perfect Landing, §41). Exposed for the test-mode
// harness (§73) — production callers pass the combat-path flag.
export function damageEnemy(game, enemy, dmg, viaStomp = false) {
  if (enemy.dead || dmg <= 0) return;               // §31: dead = no damage
  enemy.hp -= dmg;
  enemy.hurtT = ENEMY_HURT_T;                       // §31: hurt, 0.15 s
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

// One fixed step for the whole enemy system. `dt` is the player-domain
// FIXED_DT; the enemy domain consumes dt * slowMotionFactor EXACTLY ONCE
// (§10/§11) — never both a slowed dt and a slowed velocity.
export function updateEnemies(game, enemies, player, dt, level) {
  const simDt = dt * (game.slowMoActive ? SLOWMO_FACTOR : 1);
  for (let i = 0; i < enemies.length; i += 1) {
    const e = enemies[i];
    if (e.dead) continue;                           // §31: AI inactive
    if (e.hurtT > 0) e.hurtT = Math.max(0, e.hurtT - simDt);
    if (e.staggerT > 0) e.staggerT = Math.max(0, e.staggerT - simDt);
    e.walkTime += simDt;
    if (e.type === 'patroller') patrolStep(e, simDt, level);
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
      hp: e.hp, facing: e.facing, state: e.state, dead: e.dead,
      // §74 enemy-domain timers — the §79.3 slow-motion instrumentation
      // samples these to prove the enemy domain consumes dt * 0.35.
      hurtT: e.hurtT, staggerT: e.staggerT, walkTime: e.walkTime,
      vx: e.vx,
    };
  }
  return out;
}
