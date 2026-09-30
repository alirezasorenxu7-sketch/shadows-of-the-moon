// Shadows of the Moon — enemy navigation AI (SPEC §34).
// Phase 8: the full roster's NAVIGATION layer — patrol (Patroller/Armored/
// Brute + mini-boss arena bounds), the Chaser chain (idle at post ->
// alert 0.4 s "!" -> chase -> 1.5 s lost grace -> return to post), line of
// sight (horizontal raycast; solid walls block), group flanking (advisory),
// and the Armored mini-boss 'telegraph-charge' pattern. COMBAT resolution
// (contact damage, Brute radial §33, hurt/stagger) lives in enemy.js.
//
// ALL AI timers decrement with enemySimDt (SPEC §11.2 — the enemy domain
// slows to 0.35 during Aram's Slow-motion) and freeze during Pause. No
// unseeded random gameplay AI (SPEC §72) — every decision below is
// deterministic. Flanking NEVER overrides collision safety, edge detection,
// patrol bounds, walls, or authored geometry (§34); a blocked flank path
// falls back to standard chase.
import {
  ENEMY_EDGE_PAUSE_T,
  CHASE_TRIGGER_X,
  CHASE_TRIGGER_Y,
  ALERT_T,
  RETURN_T,
  CHARGE_TRIGGER_X,
  CHARGE_TRIGGER_Y,
  CHARGE_SPEED,
  CHARGE_DURATION_T,
  CHARGE_RECOVERY_T,
  CHARGE_COOLDOWN,
  ATTACK_WINDUP_T,
  FLANK_RANGE,
  FLANK_OFFSET,
} from './constants.js';

// True when a walkable platform surface sits under footX at the enemy's
// feet line (within a small authored tolerance). Solid AABB scan only.
function groundUnder(platforms, footX, feetY) {
  for (let i = 0; i < platforms.length; i += 1) {
    const p = platforms[i];
    if (footX >= p.x && footX <= p.x + p.w && feetY >= p.y - 2 && feetY <= p.y + 6) {
      return true;
    }
  }
  return false;
}

// §34 line of sight: a horizontal raycast between the enemy and the player —
// any ACTIVE solid whose AABB crosses the segment blocks sight. Walls and
// (dynamically) slam-broken geometry therefore open and close sight lines.
export function lineOfSight(enemy, player, platforms) {
  const ex = enemy.x + enemy.w / 2;
  const px = player.x + player.w / 2;
  const ey = enemy.y + enemy.h / 2;
  const py = player.y + player.h / 2;
  const x0 = Math.min(ex, px);
  const x1 = Math.max(ex, px);
  const rayY = (ey + py) / 2;                  // horizontal ray at the mid line
  for (let i = 0; i < platforms.length; i += 1) {
    const p = platforms[i];
    if (p.x < x1 && p.x + p.w > x0 && rayY > p.y && rayY < p.y + p.h) {
      return false;                            // a solid crosses the ray
    }
  }
  return true;
}

// True when the next footfall toward `dir` has ground under it (edge safety).
function stepHasGround(enemy, next, dir, platforms) {
  const feetY = enemy.y + enemy.h;
  const footX = dir > 0 ? next + enemy.w + 3 : next - 3;
  return groundUnder(platforms, footX, feetY);
}

// True when a solid would embed the enemy's leading torso edge at `next`
// (wall safety — enemies never walk INTO walls).
function stepHitsWall(enemy, next, dir, platforms) {
  const edgeX = dir > 0 ? next + enemy.w : next;
  const y0 = enemy.y + enemy.h * 0.3;
  const y1 = enemy.y + enemy.h - 2;
  for (let i = 0; i < platforms.length; i += 1) {
    const p = platforms[i];
    if (edgeX >= p.x && edgeX <= p.x + p.w && y1 > p.y && y0 < p.y + p.h) {
      return true;
    }
  }
  return false;
}

// §49 ADAPTIVE DIFFICULTY — effective enemy MOVEMENT speed:
//   effectiveEnemySpeed = authoredSpeed * adaptiveSpeedMultiplier
// (§10's own formula). The multiplier is maintained per enemy per step by
// updateEnemies from game.adaptiveActs (latched per act at 3 consecutive
// same-act deaths); ONLY movement speed is scaled — every timer, wind-up,
// cooldown, damage, and score stays authored (§49).
function spd(enemy) {
  return enemy.speed * (enemy.speedMul || 1);
}

// One Patroller decision + movement step. Mutates only the enemy passed in.
// patrol bounds (authored minX..maxX) constrain the enemy's left edge;
// reaching a bound flips the facing. §34 edge detection: when the next
// footfall has no ground under it, the enemy pauses ENEMY_EDGE_PAUSE_T then
// turns — patrol bounds, walls, and authored geometry always win (§34).
export function patrolStep(enemy, simDt, level) {
  // Stagger (§31/§34): stunned enemies hold position; timers run on simDt.
  if (enemy.staggerT > 0) {
    enemy.vx = 0;
    enemy.state = 'idle';
    return;
  }
  // Edge-detection pause: hold, then turn when the pause expires.
  if (enemy.edgePauseT > 0) {
    enemy.edgePauseT = Math.max(0, enemy.edgePauseT - simDt);
    enemy.vx = 0;
    enemy.state = 'idle';
    if (enemy.edgePauseT === 0) {
      enemy.facing = enemy.facing === 'left' ? 'right' : 'left';
    }
    return;
  }

  const dir = enemy.facing === 'left' ? -1 : 1;
  let next = enemy.x + dir * spd(enemy) * simDt;
  let turned = false;
  if (enemy.patrol) {
    if (next <= enemy.patrol.minX) {
      next = enemy.patrol.minX;
      enemy.facing = 'right';
      turned = true;
    } else if (next >= enemy.patrol.maxX) {
      next = enemy.patrol.maxX;
      enemy.facing = 'left';
      turned = true;
    }
  }

  // §34 edge detection: probe the next footfall; no ground -> pause, turn.
  if (!turned) {
    if (!stepHasGround(enemy, next, dir, level.platforms)) {
      enemy.edgePauseT = ENEMY_EDGE_PAUSE_T;
      enemy.vx = 0;
      enemy.state = 'idle';
      return;
    }
    if (stepHitsWall(enemy, next, dir, level.platforms)) {
      enemy.facing = enemy.facing === 'left' ? 'right' : 'left';   // wall: turn
      enemy.vx = 0;
      enemy.state = 'idle';
      return;
    }
  }

  enemy.x = next;
  enemy.vx = dir * spd(enemy);
  enemy.state = 'walk';
}

// Move horizontally toward targetX at the enemy's speed, with §34 safety:
// edge detection (no ground ahead -> hold), wall safety (solid ahead ->
// hold), and patrol bounds hard-clamp (bounds ALWAYS win, §34). Used by the
// Chaser chase/return paths and by charge recovery.
function moveToward(enemy, targetX, simDt, level) {
  const center = enemy.x + enemy.w / 2;
  const dir = targetX < center ? -1 : 1;
  const step = spd(enemy) * simDt;
  let next = enemy.x + dir * step;
  if (Math.abs(targetX - center) <= step) next = targetX - enemy.w / 2;   // arrive

  if (enemy.patrol) {                       // authored bounds always win (§34)
    if (next < enemy.patrol.minX) next = enemy.patrol.minX;
    else if (next > enemy.patrol.maxX) next = enemy.patrol.maxX;
  }
  if (!stepHasGround(enemy, next, dir, level.platforms)) {   // cliff ahead
    enemy.vx = 0;
    enemy.state = 'idle';
    return;
  }
  if (stepHitsWall(enemy, next, dir, level.platforms)) {     // wall ahead
    enemy.vx = 0;
    enemy.state = 'idle';
    return;
  }
  enemy.x = next;
  enemy.vx = dir * spd(enemy);
  enemy.facing = dir < 0 ? 'left' : 'right';
  enemy.state = 'walk';
}

// §34 GROUP FLANKING (advisory only). Eligible = live enemies currently in
// the chase state. If >= 2 eligible enemies stand within FLANK_RANGE of the
// player, the two with the smallest stable authored IDs take the left and
// right flank offsets; everyone else targets the player directly. Computed
// fresh each step — deterministic (stable-ID sort, no randomness).
export function computeFlanks(enemies, player) {
  const pcx = player.x + player.w / 2;
  const eligible = [];
  for (let i = 0; i < enemies.length; i += 1) {
    const e = enemies[i];
    e.flank = 0;                                        // reset every step
    if (e.dead || e.chaseState !== 'chase') continue;
    if (Math.abs(e.x + e.w / 2 - pcx) <= FLANK_RANGE) eligible.push(e);
  }
  if (eligible.length < 2) return;
  eligible.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  eligible[0].flank = -1;                               // left-side flanker
  eligible[1].flank = 1;                                // right-side flanker
}

// §29 Chaser chain: idle-at-post -> alert (0.4 s, "!") -> chase -> lost
// (1.5 s grace) -> return to post -> idle. The chase trigger needs the §29
// proximity band AND clear §34 line of sight; losing either drops the chase.
// `flank` is the §34 advisory offset (-1/0/+1) for this step.
function chaserStep(enemy, player, simDt, level, flank) {
  const ecx = enemy.x + enemy.w / 2;
  const pcx = player.x + player.w / 2;
  const dx = pcx - ecx;
  const dy = Math.abs((player.y + player.h / 2) - (enemy.y + enemy.h / 2));
  const inTrigger = Math.abs(dx) <= CHASE_TRIGGER_X
    && dy <= CHASE_TRIGGER_Y
    && lineOfSight(enemy, player, level.platforms);

  if (enemy.chaseState === 'idle') {
    enemy.vx = 0;
    if (inTrigger) {
      enemy.alertT = ALERT_T;
      enemy.chaseState = 'alert';
      enemy.facing = dx < 0 ? 'left' : 'right';        // face the threat
    }
  } else if (enemy.chaseState === 'alert') {
    enemy.vx = 0;                                       // §34 alert pause
    enemy.alertT = Math.max(0, enemy.alertT - simDt);
    if (enemy.alertT === 0) enemy.chaseState = inTrigger ? 'chase' : 'idle';
  } else if (enemy.chaseState === 'chase') {
    if (!inTrigger) {
      enemy.returnT = RETURN_T;
      enemy.chaseState = 'lost';
      enemy.vx = 0;
    } else {
      // §34 flanking: a blocked flank path falls back to standard chase.
      let target = pcx;
      if (flank !== 0) {
        const fTarget = pcx + flank * FLANK_OFFSET;
        const fDir = fTarget < ecx ? -1 : 1;
        if (stepHasGround(enemy, enemy.x + fDir * spd(enemy) * simDt,
                          fDir, level.platforms)) {
          target = fTarget;
        }
      }
      moveToward(enemy, target, simDt, level);
    }
  } else if (enemy.chaseState === 'lost') {
    enemy.vx = 0;                                       // grace: hold + scan
    enemy.returnT = Math.max(0, enemy.returnT - simDt);
    if (inTrigger) enemy.chaseState = 'chase';          // re-acquired
    else if (enemy.returnT === 0) enemy.chaseState = 'return';
  } else {                                              // 'return'
    const post = enemy.post;
    if (Math.abs(post - (enemy.x + enemy.w / 2)) <= spd(enemy) * simDt + 1) {
      enemy.x = post - enemy.w / 2;                     // arrived at post
      enemy.vx = 0;
      enemy.chaseState = 'idle';
    } else {
      moveToward(enemy, post, simDt, level);
    }
  }
}

// §50 mini-boss 'telegraph-charge' (Armored template): a distinct telegraphed
// MOVEMENT pattern — §34 wind-up pause (tint + backward lean, rendered),
// then a boosted run at CHARGE_SPEED toward the player's position, locked in
// direction, inside the authored arena bounds; wall/edge/bound ends the
// charge into a recovery pause. Damage stays the §21 contact value only.
function chargeStep(enemy, player, simDt, level) {
  if (enemy.chargeCd > 0) enemy.chargeCd = Math.max(0, enemy.chargeCd - simDt);

  if (enemy.chargeState === 'windup') {
    enemy.chargeT = Math.max(0, enemy.chargeT - simDt);
    enemy.vx = 0;
    if (enemy.chargeT === 0) {
      enemy.chargeState = 'charging';
      enemy.chargeT = CHARGE_DURATION_T;
    }
    return;
  }
  if (enemy.chargeState === 'charging') {
    enemy.chargeT = Math.max(0, enemy.chargeT - simDt);
    const dir = enemy.chargeDir;
    let next = enemy.x + dir * CHARGE_SPEED * (enemy.speedMul || 1) * simDt;
    if (enemy.patrol) {                                 // arena bounds win (§34)
      if (next < enemy.patrol.minX) { next = enemy.patrol.minX; }
      else if (next > enemy.patrol.maxX) { next = enemy.patrol.maxX; }
    }
    const atBound = enemy.patrol
      && (next === enemy.patrol.minX || next === enemy.patrol.maxX);
    const blocked = !stepHasGround(enemy, next, dir, level.platforms)
      || stepHitsWall(enemy, next, dir, level.platforms);
    enemy.x = next;
    enemy.vx = dir * CHARGE_SPEED * (enemy.speedMul || 1);   // §49: charge is movement
    if (enemy.chargeT === 0 || atBound || blocked) {
      enemy.chargeState = 'recovery';
      enemy.chargeT = CHARGE_RECOVERY_T;
      enemy.vx = 0;
    }
    return;
  }
  if (enemy.chargeState === 'recovery') {
    enemy.chargeT = Math.max(0, enemy.chargeT - simDt);
    enemy.vx = 0;
    if (enemy.chargeT === 0) {
      enemy.chargeState = 'ready';
      enemy.chargeCd = CHARGE_COOLDOWN;
    }
    return;
  }

  // 'ready': patrol while waiting for the trigger (proximity + LOS).
  const dx = (player.x + player.w / 2) - (enemy.x + enemy.w / 2);
  const dy = Math.abs((player.y + player.h / 2) - (enemy.y + enemy.h / 2));
  if (enemy.chargeCd <= 0
      && Math.abs(dx) <= CHARGE_TRIGGER_X && dy <= CHARGE_TRIGGER_Y
      && lineOfSight(enemy, player, level.platforms)) {
    enemy.chargeState = 'windup';
    enemy.chargeT = ATTACK_WINDUP_T;                    // §34 0.3 s telegraph
    enemy.chargeDir = dx < 0 ? -1 : 1;
    enemy.facing = enemy.chargeDir < 0 ? 'left' : 'right';
    return;
  }
  patrolStep(enemy, simDt, level);
}

// One navigation step for ANY enemy. `flank` is the §34 advisory side for
// chasers this step. Combat (contact, radial, telegraph poses) is resolved
// by the caller (enemy.js) around this.
export function aiStep(enemy, player, simDt, level, flank) {
  if (enemy.staggerT > 0) {                             // §34 stagger hold
    enemy.vx = 0;
    return;
  }
  if (enemy.pattern === 'telegraph-charge') {
    chargeStep(enemy, player, simDt, level);
    return;
  }
  if (enemy.chases) {
    chaserStep(enemy, player, simDt, level, flank);
    return;
  }
  patrolStep(enemy, simDt, level);                      // patroller/armored/brute
}
