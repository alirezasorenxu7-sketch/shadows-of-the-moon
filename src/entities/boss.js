// Shadows of the Moon — authored finale entities (SPEC §50/§52/§52.2 — Phase 12).
// Pouria (2-5 escape, 3-4 non-lethal duel) + the Queen of Light (3-5):
// enemy-shaped bosses in the shared `enemies` list (every combat path
// resolves on them); enemy.js routes their damage to bossDamage() and their
// AI to bossStep(). Pouria is NOT in the §29 roster (§52.2).
import {
  POURIA_W, POURIA_H, POURIA_ESCAPE_SPEED, POURIA_LUNGE_SPEED,
  POURIA_LUNGE_WINDUP, POURIA_LUNGE_T, POURIA_LUNGE_CD, POURIA_ESCAPE_TRIGGER,
  POURIA_CHAIN_COUNT, POURIA_CHAIN_W, POURIA_CHAIN_H, POURIA_CHAIN_ORBIT,
  POURIA_CHAIN_DAMAGE, POURIA_SLAM_DAMAGE, POURIA_EXPOSED_DAMAGE,
  POURIA_EXPOSE_RANGE, QUEEN_W, QUEEN_H, QUEEN_PHASE_INVULN, QUEEN_SCORE,
  QUEEN_P1_SPEED, QUEEN_P3_SPEED, QUEEN_LUNGE_SPEED, QUEEN_LUNGE_WINDUP,
  QUEEN_LUNGE_T, QUEEN_LUNGE_CD, QUEEN_RADIAL_TRIGGER, QUEEN_RADIAL_WINDUP,
  QUEEN_RADIAL_RADIUS, QUEEN_RADIAL_DAMAGE, QUEEN_RADIAL_CD,
  QUEEN_HOVER_BASE, QUEEN_HOVER_AMP, QUEEN_TP_PERIOD,
} from '../constants.js';
import { spawnBurst, addRing, triggerShake } from './particle.js';
import { showBossCinematic } from '../story.js';

// Enemy-shape base: every field the combat/anim/snapshot systems read.
function bossBase(id, kind, x, y, w, h, chapter, extra) {
  return {
    id, type: kind, boss: true, bossKind: kind, act: chapter.act,
    chases: false, radial: false, miniBoss: false, pattern: null, scale: 1,
    x, y, w, h, speed: 0, speedMul: 1, hp: 1, maxHp: 1,
    contactDamage: 1, score: 0, patrol: null, post: x + w / 2,
    facing: 'right', vx: 0, vy: 0, state: 'idle', walkTime: 0,
    hurtT: 0, staggerT: 0, edgePauseT: 0, recentHits: [],
    alertT: 0, returnT: 0, chaseState: 'idle', flank: 0,
    attackCd: 0, attackWindup: 0, attackPoseT: 0,
    radialCd: 0, radialWindup: 0, chargeState: 'ready',
    chargeT: 0, chargeDir: 1, chargeCd: 0, dead: false,
    ...extra,
  };
}

// ---- entity factories (enemy.js calls per authored chapter) ----

export function makePouriaEscape(spec, chapter) {
  return bossBase(spec.id, 'pouria', spec.spawnX, chapter.groundY - POURIA_H,
    POURIA_W, POURIA_H, chapter, {
      hp: 9999, maxHp: 9999,          // she cannot kill him (§52.2)
      contactDamage: 2, speed: POURIA_ESCAPE_SPEED, mode: 'dormant',
      bounds: { minX: chapter.startX + 40, maxX: chapter.startX + chapter.length - 40 },
    });
}

export function makePouriaFight(spec, chapter) {
  const out = [];
  const y = chapter.groundY - POURIA_H;
  const pouria = bossBase(spec.id, 'pouria',
    Math.round(spec.arenaX + spec.arenaW / 2 - POURIA_W / 2),
    y, POURIA_W, POURIA_H, chapter, {
      hp: spec.corruptionHp, maxHp: spec.corruptionHp,   // hp pool = corruption
      corruptionHp: spec.corruptionHp, realHp: spec.realHp, maxRealHp: spec.realHp,
      contactDamage: 2, speed: 120, mode: 'dormant',
      subdued: false, invulnerable: false, exposed: false, exposeT: 0,
      bounds: { minX: spec.arenaX + 30, maxX: spec.arenaX + spec.arenaW - POURIA_W - 30 },
    });
  out.push(pouria);
  for (let i = 0; i < POURIA_CHAIN_COUNT; i += 1) {
    out.push(bossBase(`${spec.id}_chain_00${i + 1}`, 'chain',
      spec.arenaX + spec.arenaW / 2 - POURIA_CHAIN_W / 2, y - 40,
      POURIA_CHAIN_W, POURIA_CHAIN_H, chapter, {
        hp: 1, maxHp: 1, contactDamage: 0,   // harmless links — dash targets
        hostId: spec.id, host: pouria, chainIndex: i,
      }));
  }
  return out;
}

export function makeQueen(spec, chapter) {
  const x = Math.round(spec.arenaX + spec.arenaW / 2 - QUEEN_W / 2);
  return bossBase(spec.id, 'queen', x, chapter.groundY - QUEEN_H,
    QUEEN_W, QUEEN_H, chapter, {
      hp: spec.phases[0], maxHp: spec.phases[spec.phases.length - 1],
      phasePools: spec.phases.slice(), phase: 1,
      contactDamage: 2, score: QUEEN_SCORE, speed: QUEEN_P1_SPEED,
      mode: 'dormant', invulnT: 0, tpT: 0, anchorI: 1, groundY: chapter.groundY,
      bounds: { minX: spec.arenaX + 30, maxX: spec.arenaX + spec.arenaW - QUEEN_W - 30 },
      anchors: [spec.arenaX + 200, spec.arenaX + spec.arenaW / 2, spec.arenaX + spec.arenaW - 260],
    });
}

export function createBossEntities(chapter, defeatedEnemyIds) {
  const out = [];
  const sc = chapter.specialChallenge;
  if (sc && !defeatedEnemyIds.has(sc.id)) {
    if (sc.kind === 'pouria-escape') out.push(makePouriaEscape(sc, chapter));
    else if (sc.kind === 'pouria-fight') out.push(...makePouriaFight(sc, chapter));
  }
  const fb = chapter.finalBattle;
  if (fb && !defeatedEnemyIds.has(fb.id)) out.push(makeQueen(fb, chapter));
  return out;
}

// ---- damage routing (called from enemy.js damageEnemy) ----------------------

function bossHint(game, text) {
  const s = game.story;
  if (!s || s.quip) return;
  s.quip = { text, until: game.gameTime + 2.4 };
}

function pouriaFightLanded(game, e) {
  e.invulnerable = false;
  if (e.corruptionHp <= 0 && !e.subdued) {
    e.subdued = true;
    e.hp = 0;
    e.vx = 0;
    e.contactDamage = 0;
    game.pouriaSpared = true;
    spawnBurst(game, e.x + e.w / 2, e.y + e.h / 2, '#e8f0ff', 18);
    addRing(game, e.x + e.w / 2, e.y + e.h / 2, 120, 'rgba(232,240,255,0.6)');
    showBossCinematic(game, 'pouriaWon');
  }
}

export function bossDamage(game, enemy, dmg, viaStomp, source) {
  if (enemy.bossKind === 'chain') {
    enemy.hp -= dmg;
    if (enemy.hp <= 0 && !enemy.dead) {
      enemy.dead = true;
      spawnBurst(game, enemy.x + enemy.w / 2, enemy.y + enemy.h / 2, '#5a2a7a', 12);
      const host = enemy.host || game.__pouriaHost;   // same-batch ref, else step ref
      if (host && !host.subdued) {
        host.corruptionHp = Math.max(0, host.corruptionHp - POURIA_CHAIN_DAMAGE);
        host.hp = host.corruptionHp;
        host.staggerT = 0.5;                 // the chain tearing staggers him
        pouriaFightLanded(game, host);
      }
    }
    return 'consumed';
  }

  if (enemy.bossKind === 'pouria') {
    if (enemy.mode === 'dormant') wakePouria(game, enemy);   // damage wakes him
    if (enemy.subdued) return 'consumed';
    if (enemy.realHp != null) {
      // ---- 3-4 non-lethal routing (§52.2) ----
      const nonLethal = source === 'slam' || enemy.exposed;
      if (enemy.invulnerable && !nonLethal) return 'consumed';   // fail-safe
      if (nonLethal) {
        enemy.corruptionHp = Math.max(0, enemy.corruptionHp
          - (source === 'slam' ? POURIA_SLAM_DAMAGE : POURIA_EXPOSED_DAMAGE));
        enemy.hp = enemy.corruptionHp;
        spawnBurst(game, enemy.x + enemy.w / 2, enemy.y + 20, '#7a3aa8', 10);
        pouriaFightLanded(game, enemy);
      } else {
        enemy.realHp = Math.max(1, enemy.realHp - dmg);
        if (enemy.realHp <= 1) {
          enemy.invulnerable = true;
          bossHint(game, 'Sara: "His humanity flickers — there has to be another way."');
        }
      }
      return 'consumed';
    }
    bossHint(game, 'Sara: "I can\'t— I won\'t hurt him. RUN."');
    return 'consumed';
  }

  if (enemy.bossKind === 'queen') {
    if (enemy.invulnT > 0) return 'consumed';
    if (enemy.mode === 'dormant') enemy.mode = 'active';
    enemy.hp -= dmg;
    if (enemy.hp <= 0) {
      if (enemy.phase < enemy.phasePools.length) {
        enemy.phase += 1;
        enemy.hp = enemy.phasePools[enemy.phase - 1];
        enemy.invulnT = QUEEN_PHASE_INVULN;
        enemy.speed = enemy.phase === 3 ? QUEEN_P3_SPEED : QUEEN_P1_SPEED;
        enemy.chargeState = 'ready';
        enemy.radialWindup = 0;
        const cx = enemy.x + enemy.w / 2;
        const cy = enemy.y + enemy.h / 2;
        spawnBurst(game, cx, cy, '#e8f0ff', 22);
        addRing(game, cx, cy, 170, 'rgba(232,240,255,0.7)');
        triggerShake(game, 10, 0.3);
        return 'phase';
      }
      game.queenDefeated = true;
      game.choiceDelay = 1.2;               // §52 beat before the choice
      spawnBurst(game, enemy.x + enemy.w / 2, enemy.y + enemy.h / 2, '#e8f0ff', 26);
      return 'dead';                        // enemy.js: §59 award, once
    }
    return 'consumed';
  }
  return 'consumed';
}

// ---- AI steps (called from enemy.js updateEnemies, enemy sim domain) --------

function wakePouria(game, e) {
  e.mode = 'hunting';
  showBossCinematic(game, e.realHp != null ? 'pouriaFight' : 'pouriaEscape');
}

function lungeMachine(e, player, simDt, windup, speed, dur, cd) {
  if (e.chargeCd > 0) e.chargeCd = Math.max(0, e.chargeCd - simDt);
  if (e.chargeState === 'windup') {
    e.chargeT = Math.max(0, e.chargeT - simDt);
    e.vx = 0;
    if (e.chargeT === 0) { e.chargeState = 'charging'; e.chargeT = dur; }
    return;
  }
  if (e.chargeState === 'charging') {
    e.chargeT = Math.max(0, e.chargeT - simDt);
    const next = e.x + e.chargeDir * speed * (e.speedMul || 1) * simDt;
    e.x = Math.min(e.bounds.maxX, Math.max(e.bounds.minX, next));
    e.vx = e.chargeDir * speed * (e.speedMul || 1);
    if (e.chargeT === 0 || e.x === e.bounds.minX || e.x === e.bounds.maxX) {
      e.chargeState = 'recovery'; e.chargeT = 0.5; e.vx = 0;
    }
    return true;                            // charging owns the step
  }
  if (e.chargeState === 'recovery') {
    e.chargeT = Math.max(0, e.chargeT - simDt);
    e.vx = 0;
    if (e.chargeT === 0) { e.chargeState = 'ready'; e.chargeCd = cd; }
    return;
  }
  const dx = (player.x + player.w / 2) - (e.x + e.w / 2);
  if (e.chargeCd <= 0 && Math.abs(dx) < 230 && !player.dead) {
    e.chargeState = 'windup';
    e.chargeT = windup;
    e.chargeDir = dx < 0 ? -1 : 1;
    e.facing = e.chargeDir < 0 ? 'left' : 'right';
  }
}

function pouriaEscapeStep(game, e, player, simDt, level) {
  if (e.mode === 'gone') return;
  // Escape resolution applies ONLY while the encounter is live (hunting):
  // the player leaving chapter 2-5 with Pouria on the hunt. A dormant Pouria
  // ignores players elsewhere in the world (boot, other chapters, backtracking).
  if (e.mode === 'hunting' && level.chapterAt(player.x).id !== e.chapterId) {
    e.mode = 'gone';
    e.dead = true;                          // no §59 award — he was fled, not slain
    spawnBurst(game, e.x + e.w / 2, e.y + e.h / 2, '#3a1f4a', 14);
    game.pouriaEscaped = true;
    showBossCinematic(game, 'pouriaEscaped');
    return;
  }
  if (e.mode === 'dormant') {
    e.vx = 0;
    const dx = (player.x + player.w / 2) - (e.x + e.w / 2);
    if (Math.abs(dx) <= POURIA_ESCAPE_TRIGGER || player.x > e.x) wakePouria(game, e);
    return;
  }
  if (e.staggerT > 0) { e.vx = 0; return; }
  const owns = lungeMachine(e, player, simDt, POURIA_LUNGE_WINDUP,
    POURIA_LUNGE_SPEED, POURIA_LUNGE_T, POURIA_LUNGE_CD);
  if (!owns) {
    const dx = (player.x + player.w / 2) - (e.x + e.w / 2);
    const dir = dx < 0 ? -1 : 1;
    const next = e.x + dir * POURIA_ESCAPE_SPEED * (e.speedMul || 1) * simDt;
    e.x = Math.min(e.bounds.maxX, Math.max(e.bounds.minX, next));
    e.vx = dir * POURIA_ESCAPE_SPEED * (e.speedMul || 1);
    e.facing = dir < 0 ? 'left' : 'right';
  }
  e.walkTime += simDt;
}

function pouriaFightStep(game, e, player, simDt, level, enemies) {
  const dx = Math.abs((player.x + player.w / 2) - (e.x + e.w / 2));
  e.exposed = !e.subdued && game.slowMoActive && dx <= POURIA_EXPOSE_RANGE;
  if (e.subdued) { e.vx = 0; return; }      // kneeling — the fight is over
  if (e.mode === 'dormant') {
    e.vx = 0;
    if (player.x + player.w / 2 > e.bounds.minX + 200) wakePouria(game, e);
    return;
  }
  if (e.staggerT > 0) { e.vx = 0; return; }
  const owns = e.exposed
    ? false                                 // human side: he stops fighting
    : lungeMachine(e, player, simDt, POURIA_LUNGE_WINDUP, 300, 0.45, 2.4);
  if (!owns && !e.exposed) {
    const pdx = (player.x + player.w / 2) - (e.x + e.w / 2);
    const dir = pdx < 0 ? -1 : 1;
    const next = e.x + dir * e.speed * (e.speedMul || 1) * simDt;
    e.x = Math.min(e.bounds.maxX, Math.max(e.bounds.minX, next));
    e.vx = dir * e.speed * (e.speedMul || 1);
    e.facing = dir < 0 ? 'left' : 'right';
  } else if (e.exposed) {
    e.vx = 0;                                // stands still, reachable
  }
  e.walkTime += simDt;
}

function chainStep(e, enemies, gameTime) {
  let host = null;
  for (let i = 0; i < enemies.length; i += 1) {
    if (enemies[i].id === e.hostId) { host = enemies[i]; break; }
  }
  if (!host || host.dead || host.subdued) { e.dead = true; return; }
  const a = gameTime * 0.9 + e.chainIndex * (Math.PI * 2 / POURIA_CHAIN_COUNT);
  const cx = host.x + host.w / 2 + Math.cos(a) * POURIA_CHAIN_ORBIT;
  const cy = host.y + host.h / 2 - 30 + Math.sin(a) * 34;
  e.x = cx - e.w / 2;
  e.y = cy - e.h / 2;
  e.vx = 0;
}

function queenRadialStep(game, e, player, simDt) {
  if (e.radialCd > 0) e.radialCd = Math.max(0, e.radialCd - simDt);
  if (e.radialWindup > 0) {
    e.vx = 0;
    e.radialWindup = Math.max(0, e.radialWindup - simDt);
    if (e.hurtT > 0) { e.radialWindup = 0; e.radialCd = QUEEN_RADIAL_CD; }
    else if (e.radialWindup === 0) {
      const cx = e.x + e.w / 2;
      const cy = e.y + e.h / 2;
      addRing(game, cx, cy, QUEEN_RADIAL_RADIUS, 'rgba(232,240,255,0.65)');
      spawnBurst(game, cx, cy, '#e8f0ff', 14);
      triggerShake(game, 10, 0.25);
      e.radialCd = QUEEN_RADIAL_CD;
      const dx = (player.x + player.w / 2) - cx;
      const dy = (player.y + player.h / 2) - cy;
      if (Math.sqrt(dx * dx + dy * dy) <= QUEEN_RADIAL_RADIUS
          && !player.dead && player.invuln <= 0 && player.shieldT <= 0) {
        player.hp -= QUEEN_RADIAL_DAMAGE;   // routed like damagePlayer (§61)
        game.damageTaken += QUEEN_RADIAL_DAMAGE;
        player.invuln = 1.0;
        game.killStreak = 0;
        game.comboTimer = 0;
        game.damageFlashT = 0.15;
      }
    }
    return true;
  }
  if (e.radialCd <= 0 && !player.dead) {
    const dx = (player.x + player.w / 2) - (e.x + e.w / 2);
    const dy = (player.y + player.h / 2) - (e.y + e.h / 2);
    if (Math.sqrt(dx * dx + dy * dy) <= QUEEN_RADIAL_TRIGGER) {
      e.radialWindup = QUEEN_RADIAL_WINDUP;
      e.vx = 0;
      e.facing = dx < 0 ? 'left' : 'right';
      return true;
    }
  }
  return false;
}

function queenStep(game, e, player, simDt, level) {
  if (e.invulnT > 0) {                      // phase-transition beat
    e.invulnT = Math.max(0, e.invulnT - simDt);
    e.vx = 0;
    return;
  }
  if (e.mode === 'dormant') {
    e.vx = 0;
    if (player.x + player.w / 2 > e.bounds.minX + 200) {
      e.mode = 'active';
      showBossCinematic(game, 'queenStart');
    }
    return;
  }
  if (e.staggerT > 0) { e.vx = 0; return; }
  if (e.phase === 2) {
    const radialOwns = queenRadialStep(game, e, player, simDt);
    e.y = Math.round(QUEEN_HOVER_BASE - QUEEN_H / 2
      + Math.sin(e.walkTime * 1.3) * QUEEN_HOVER_AMP);
    if (radialOwns) { e.walkTime += simDt; return; }
    e.tpT += simDt;
    if (e.tpT >= QUEEN_TP_PERIOD) {
      e.tpT = 0;
      let best = e.anchors[e.anchorI];
      let bestD = -1;
      let bestI = e.anchorI;
      for (let i = 0; i < e.anchors.length; i += 1) {
        const d = Math.abs((player.x + player.w / 2) - (e.anchors[i] + QUEEN_W / 2));
        if (d > bestD) { bestD = d; best = e.anchors[i]; bestI = i; }
      }
      spawnBurst(game, e.x + e.w / 2, e.y + e.h / 2, '#cfd8ff', 12);
      e.anchorI = bestI;
      e.x = best;
      spawnBurst(game, e.x + e.w / 2, e.y + e.h / 2, '#e8f0ff', 12);
      addRing(game, e.x + e.w / 2, e.y + e.h / 2, 90, 'rgba(199,125,255,0.4)');
    }
    e.vx = 0;
    e.walkTime += simDt;
    return;
  }
  const groundTarget = e.groundY - QUEEN_H;
  if (e.y < groundTarget - 1) {
    e.y = Math.min(groundTarget, e.y + 260 * simDt);
  }
  const radialOwns = e.phase === 3 ? queenRadialStep(game, e, player, simDt) : false;
  if (!radialOwns) {
    lungeMachine(e, player, simDt, QUEEN_LUNGE_WINDUP, QUEEN_LUNGE_SPEED,
      QUEEN_LUNGE_T, QUEEN_LUNGE_CD);
    if (e.chargeState === 'ready' || e.chargeState === 'recovery') {
      const dx = (player.x + player.w / 2) - (e.x + e.w / 2);
      const dir = dx < 0 ? -1 : 1;
      const next = e.x + dir * e.speed * (e.speedMul || 1) * simDt;
      e.x = Math.min(e.bounds.maxX, Math.max(e.bounds.minX, next));
      e.vx = dir * e.speed * (e.speedMul || 1);
      e.facing = dir < 0 ? 'left' : 'right';
    }
  }
  e.walkTime += simDt;
}

export function bossStep(game, e, player, simDt, level, enemies) {
  if (e.bossKind === 'pouria') {
    if (e.chapterId == null) e.chapterId = level.chapterAt(e.x + e.w / 2).id;
    if (e.realHp != null) {
      pouriaFightStep(game, e, player, simDt, level, enemies);
      game.__pouriaHost = e.subdued ? null : e;   // chain lookups (§71 note:
    } else {                                       // transient module-free ref)
      pouriaEscapeStep(game, e, player, simDt, level);
      game.__pouriaHost = null;
    }
  } else if (e.bossKind === 'chain') {
    chainStep(e, enemies, game.gameTime);
  } else if (e.bossKind === 'queen') {
    queenStep(game, e, player, simDt, level);
  }
}
