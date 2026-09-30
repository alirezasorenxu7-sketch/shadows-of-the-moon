// Shadows of the Moon — particle + ring FX system (SPEC §56–§57, §78).
// Phase 7 ships the minimal deterministic feedback system the SPEC requires
// THIS phase: §20.1 switch-combo bursts, §15 unlock bursts, §24 slam impact
// chips, and gate-break/dispel bursts. Phase 10 extends it into the full
// game-feel set (landing dust, dash trail styling, hit particles, ambient
// loops, weather) and enforces the §78 cap across all emitters.
//
// DETERMINISM (§72): no Math.random anywhere — burst angles are the fixed
// roots-of-unity pattern angle = (i / count) * 2π, phase-shifted by a stable
// per-particle offset. The visible result is an even radial burst.
//
// CAP (§78): game.particles is hard-capped at PARTICLE_CAP (400, amended);
// overflowing bursts drop the OLDEST particles first (shift), so the array
// is always bounded. No per-frame allocation beyond the pushed records.
import { PARTICLE_CAP } from '../constants.js';

// Radial burst at (x, y) in `color` — unlock/combo/impact feedback.
export function spawnBurst(game, x, y, color, count) {
  const list = game.particles;
  for (let i = 0; i < count; i += 1) {
    if (list.length >= PARTICLE_CAP) list.shift();      // §78 hard cap
    const ang = (i / count) * Math.PI * 2 + (i % 3) * 0.35;
    const spd = 90 + (i % 5) * 28;
    list.push({
      x, y,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd - 40,
      life: 0.35 + (i % 3) * 0.08,
      maxLife: 0.35 + (i % 3) * 0.08,
      color,
      size: 2 + (i % 3),
    });
  }
}

// Expanding ring (shockwave / slam impact / combo flare) — presentation only.
// Rings live on game.rings, bounded to 8; the oldest is dropped.
export function addRing(game, x, y, radius, color) {
  const rings = game.rings;
  if (rings.length >= 8) rings.shift();
  rings.push({ x, y, r: radius, t: 0, T: 0.28, color });
}

// One player-domain step for both FX lists. Linear motion, no gravity —
// the §57 feel pass (Phase 10) adds per-emitter physics.
export function updateParticles(game, dt) {
  const list = game.particles;
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const p = list[i];
    p.life -= dt;
    if (p.life <= 0) { list.splice(i, 1); continue; }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 260 * dt;                                   // gentle settling
  }
  const rings = game.rings;
  for (let i = rings.length - 1; i >= 0; i -= 1) {
    rings[i].t += dt;
    if (rings[i].t >= rings[i].T) rings.splice(i, 1);
  }
}

// Plain-data snapshot for test instrumentation (§74).
export function particlesSnapshot(game) {
  return {
    count: game.particles.length,
    rings: game.rings.length,
  };
}
