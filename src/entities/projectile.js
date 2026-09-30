// Shadows of the Moon — projectile entity (SPEC §21, §23, §25.3, §29.1, §50).
// Phase 7: Sara's thrown knife (J) and Aram's magic shot (J). Both are
// authored-literal projectiles — fixed speed, fixed range, deterministic
// straight-line flight, single-target impact, platform stop.
//
// §29.1 mechanical rule: Armored enemies ABSORB Aram magic shots (0 damage).
// The check lives at impact time — Phase 8's Armored roster entry activates
// it with no change here.
//
// §50 environmental gates: an active magic barrier is dispelled by an Aram
// magic shot intersecting it (the barrier blocks the shot — both expire).
// Time-locked doors open only while Slow-motion is active near them; that
// rule lives in main.js (proximity check), not here. Gates live on the
// LEVEL view (level.gates — runtime state copies built by buildLevel).
import {
  KNIFE_SPEED,
  KNIFE_RANGE,
  MAGIC_SPEED,
  MAGIC_RANGE,
} from '../constants.js';
import { damageEnemy } from './enemy.js';
import { spawnBurst } from './particle.js';

// Spawn a projectile at (x, y) flying in `dir` (+1/-1). Authoritative state
// lives on game.projectiles (run state, §71) — bounded by range, never by
// unbounded flight.
export function spawnProjectile(game, kind, x, y, dir) {
  game.projectiles.push({
    kind,                                               // 'knife' | 'magic'
    x, y,
    vx: dir * (kind === 'knife' ? KNIFE_SPEED : MAGIC_SPEED),
    w: kind === 'knife' ? 10 : 8,
    h: kind === 'knife' ? 3 : 8,
    dir,
    traveled: 0,
    range: kind === 'knife' ? KNIFE_RANGE : MAGIC_RANGE,
    dmg: 1,                                             // §21 both deal 1
  });
}

// One player-domain step. Projectiles fly in the PLAYER domain (§10): they
// are player attacks, so they are NOT slowed during Slow-motion.
export function updateProjectiles(game, projectiles, enemies, level, dt) {
  for (let i = projectiles.length - 1; i >= 0; i -= 1) {
    const p = projectiles[i];
    const step = p.vx * dt;
    p.x += step;
    p.traveled += Math.abs(step);

    // Range expiry (authored literal — deterministic despawn).
    if (p.traveled >= p.range) {
      projectiles.splice(i, 1);
      continue;
    }

    // §50: an ACTIVE magic barrier dispels to an intersecting magic shot —
    // the barrier drops and the shot is consumed together.
    if (p.kind === 'magic' && level.gates) {
      let dispelled = false;
      for (let g = 0; g < level.gates.length; g += 1) {
        const gate = level.gates[g];
        if (gate.kind !== 'magicBarrier' || gate.state !== 'active') continue;
        if (p.x < gate.x + gate.w && p.x + p.w > gate.x
            && p.y < gate.y + gate.h && p.y + p.h > gate.y) {
          gate.state = 'dispelled';
          dispelled = true;
          game.solidsDirty = true;                     // rebuild collision view
          spawnBurst(game, gate.x + gate.w / 2, gate.y + gate.h / 2,
                     '#c77dff', 14);
          break;
        }
      }
      if (dispelled) {
        projectiles.splice(i, 1);
        continue;
      }
    }

    // Solid platform stop (the knife sticks, the magic fizzles).
    let hitWall = false;
    for (let s = 0; s < level.platforms.length; s += 1) {
      const plat = level.platforms[s];
      if (p.x < plat.x + plat.w && p.x + p.w > plat.x
          && p.y < plat.y + plat.h && p.y + p.h > plat.y) {
        hitWall = true;
        break;
      }
    }
    if (hitWall) {
      projectiles.splice(i, 1);
      continue;
    }

    // Single-target enemy impact (§21): first intersecting live enemy.
    let hitEnemy = null;
    for (let e = 0; e < enemies.length; e += 1) {
      const en = enemies[e];
      if (en.dead) continue;
      if (p.x < en.x + en.w && p.x + p.w > en.x
          && p.y < en.y + en.h && p.y + p.h > en.y) {
        hitEnemy = en;
        break;
      }
    }
    if (hitEnemy) {
      // §29.1: Armored absorbs Aram magic (0 damage); every other impact
      // applies the projectile's authored damage through the organic path.
      if (!(p.kind === 'magic' && hitEnemy.type === 'armored')) {
        damageEnemy(game, hitEnemy, p.dmg, false);
      }
      spawnBurst(game, p.x, p.y, p.kind === 'magic' ? '#c77dff' : '#cfd8ff', 6);
      projectiles.splice(i, 1);
    }
  }
}

// Plain-data snapshot for test instrumentation (§74).
export function projectilesSnapshot(projectiles) {
  const out = new Array(projectiles.length);
  for (let i = 0; i < projectiles.length; i += 1) {
    const p = projectiles[i];
    out[i] = { kind: p.kind, x: p.x, y: p.y, dir: p.dir, traveled: p.traveled };
  }
  return out;
}
