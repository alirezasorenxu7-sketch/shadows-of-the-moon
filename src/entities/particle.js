// Shadows of the Moon — particle + ring FX system (SPEC §56–§57, §78).
// Phase 7 shipped the minimal deterministic feedback system (§20.1 combo
// bursts, §15 unlock bursts, §24 slam chips, gate-break/dispel bursts).
// Phase 10 completes the game-feel set: §57 hit particles (target color,
// every damage impact), §57 landing dust + §56 dust clouds on heavy
// impacts, the §56 ambient loops + weather (ambient.js emits here), and
// per-kind motion in the single shared §78-capped list.
//
// DETERMINISM (§72): no Math.random anywhere — burst angles are the fixed
// roots-of-unity pattern angle = (i / count) * 2π, phase-shifted by a stable
// per-particle offset. The visible result is an even radial burst.
//
// CAP (§78): game.particles is hard-capped at PARTICLE_CAP (400, amended);
// overflowing bursts drop the OLDEST particles first (shift), so the array
// is always bounded. Ambient emission additionally reserves headroom for
// feedback bursts (AMBIENT_AMBIENT_MAX). No per-frame allocation beyond the
// pushed records.
import {
  PARTICLE_CAP,
  HIT_PARTICLE_COUNT,
  LANDING_DUST_COUNT,
  DUST_HEAVY_COUNT,
  SHAKE_MODE_SCALE,
  SHAKE_SMALL_PX,
  SHAKE_SMALL_T,
  SHAKE_LARGE_PX,
  SHAKE_LARGE_T,
} from '../constants.js';

// §54 session-setting-aware shake trigger: scales the authored magnitude
// (Full / Reduced / Off) while the decay law and durations stay untouched.
// All trigger sites route through here so the setting is honored uniformly.
export function triggerShake(game, mag, t) {
  const scale = SHAKE_MODE_SCALE[game.shakeMode] != null
    ? SHAKE_MODE_SCALE[game.shakeMode] : 1;
  const m = mag * scale;
  if (m <= 0) { game.shake = null; return; }       // Off: no shake at all
  game.shake = { mag: m, t, T: t };
}

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

// §57 HIT PARTICLES — 10–15 particles in the TARGET's color on every
// damage impact (deterministic count). Slightly upward-biased spray with
// roots-of-unity angles — reads as an impact splash, distinct from the
// kill-time cube shatter (spawnBurst) and the soft dust puffs below.
export function spawnHit(game, x, y, color) {
  const list = game.particles;
  const count = HIT_PARTICLE_COUNT;
  for (let i = 0; i < count; i += 1) {
    if (list.length >= PARTICLE_CAP) list.shift();      // §78 hard cap
    const ang = (i / count) * Math.PI * 2 + (i % 4) * 0.31;
    const spd = 130 + (i % 5) * 34;
    list.push({
      x, y,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd * 0.6 - 90,               // upward bias
      life: 0.30 + (i % 3) * 0.07,
      maxLife: 0.30 + (i % 3) * 0.07,
      color,
      size: 2 + (i % 3),
    });
  }
}

// §57 LANDING DUST (fall > 100px → 8–12 particles) + §56 dust clouds on
// heavy impacts. Soft, wide, slow puffs that spread along the ground and
// settle — two-tone grey-brown, never a hard cube. `heavy` selects the
// §56 dust-cloud profile (more, larger, slower).
export function spawnDust(game, x, y, count, heavy) {
  const list = game.particles;
  const n = count != null ? count : LANDING_DUST_COUNT;
  for (let i = 0; i < n; i += 1) {
    if (list.length >= PARTICLE_CAP) list.shift();      // §78 hard cap
    const dir = i % 2 === 0 ? 1 : -1;                    // alternate sides
    const spread = (i / n) * (heavy ? 52 : 34);
    list.push({
      x: x + dir * spread,
      y: y - (i % 3) * 2,
      vx: dir * (18 + (i % 4) * 12) * (heavy ? 0.7 : 1),
      vy: -(heavy ? 14 : 26) - (i % 3) * 8,
      life: (heavy ? 0.55 : 0.42) + (i % 4) * 0.06,
      maxLife: (heavy ? 0.55 : 0.42) + (i % 4) * 0.06,
      color: i % 3 === 0 ? '#45454f' : '#5a5a68',
      size: (heavy ? 5 : 4) + (i % 3) * 2 + (i % 2),
      kind: 'dust',
    });
  }
}

// §56 heavy-impact dust cloud convenience wrapper (Raha slam, Brute radial,
// mini-boss impacts) — the same dust look, cloud-sized.
export function spawnDustCloud(game, x, y) {
  spawnDust(game, x, y, DUST_HEAVY_COUNT, true);
}

// Expanding ring (shockwave / slam impact / combo flare) — presentation only.
// Rings live on game.rings, bounded to 8; the oldest is dropped.
export function addRing(game, x, y, radius, color) {
  const rings = game.rings;
  if (rings.length >= 8) rings.shift();
  rings.push({ x, y, r: radius, t: 0, T: 0.28, color });
}

// One player-domain step for both FX lists. Per-kind physics:
//   default (chips/shatter) — linear + gentle settling gravity
//   dust   — drag + slight rise, then settle
//   rain   — constant fall, no gravity add (authored streak speed)
//   firefly/leaf/feather/ember(mote)/debris/fogWisp — ambient.js kinds with
//     drift + deterministic sway; gravity is never applied to them.
export function updateParticles(game, dt) {
  const list = game.particles;
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const p = list[i];
    p.life -= dt;
    if (p.life <= 0) { list.splice(i, 1); continue; }
    const k = p.kind;
    if (k === 'dust') {
      p.vx *= (1 - 3.2 * dt);                            // ground drag
      p.vy += 46 * dt;                                   // settle after the rise
      if (p.vy > 30) p.vy = 30;
    } else if (k === 'rain') {
      // constant streak velocity — gravity already authored in
    } else if (k != null) {
      // ambient kinds: deterministic sway via the stable per-particle
      // phase (ph); vertical motion is authored per kind at spawn.
      p.vx += Math.sin(p.ph + (p.maxLife - p.life) * 3.1) * 14 * dt;
    } else {
      p.vy += 260 * dt;                                   // gentle settling
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    // Off-view cull (render-only discipline extended to lifetime: ambient
    // kinds that drift out of the camera window die immediately — §42/§78).
    if (k != null && k !== 'dust') {
      if (p.x < game.camera.x - 260 || p.x > game.camera.x + 1300
          || p.y > game.camera.y + 900 || p.y < game.camera.y - 420) {
        list.splice(i, 1);
      }
    }
  }
  const rings = game.rings;
  for (let i = rings.length - 1; i >= 0; i -= 1) {
    rings[i].t += dt;
    if (rings[i].t >= rings[i].T) rings.splice(i, 1);
  }
}

// Plain-data snapshot for test instrumentation (§74).
export function particlesSnapshot(game) {
  const list = game.particles;
  const kinds = {};
  let ambient = 0;
  for (let i = 0; i < list.length; i += 1) {
    const k = list[i].kind || 'chip';
    kinds[k] = (kinds[k] || 0) + 1;
    if (k !== 'chip' && k !== 'dust') ambient += 1;
  }
  return {
    count: list.length,
    rings: game.rings.length,
    kinds,
    ambient,
  };
}
