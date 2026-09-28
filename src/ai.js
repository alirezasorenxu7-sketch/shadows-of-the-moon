// Shadows of the Moon — enemy AI (SPEC §34).
// Phase 6: the Patroller base — patrol bounds, edge detection (0.2 s pause
// then turn), stagger hold. ALL AI timers decrement with enemySimDt (SPEC
// §11.2 — the enemy domain slows to 0.35 during Aram's Slow-motion from
// Phase 7) and freeze during Pause. Line of sight, alert, return, and group
// flanking arrive with the Phase 8 roster. No unseeded random gameplay AI
// (SPEC §72) — every decision below is deterministic.
import { ENEMY_EDGE_PAUSE_T } from './constants.js';

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
  let next = enemy.x + dir * enemy.speed * simDt;
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
    const feetY = enemy.y + enemy.h;
    const footX = dir > 0 ? next + enemy.w + 3 : next - 3;
    if (!groundUnder(level.platforms, footX, feetY)) {
      enemy.edgePauseT = ENEMY_EDGE_PAUSE_T;
      enemy.vx = 0;
      enemy.state = 'idle';
      return;
    }
  }

  enemy.x = next;
  enemy.vx = dir * enemy.speed;
  enemy.state = 'walk';
}
