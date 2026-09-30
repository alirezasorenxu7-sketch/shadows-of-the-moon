// Shadows of the Moon — ambient loop + weather system (SPEC §56 — Phase 10).
//
// Act-driven ambient particle loops emit into the SINGLE shared §78-capped
// list (game.particles) alongside the feedback bursts:
//   Act 1: floating dry leaves, fireflies, light-shaft motes
//   Act 2: subtle road dust, patchy fog wisps, drifting feathers,
//          light rain (§56 "Act 2 mostly" — Act 3 keeps a reduced cadence)
//   Act 3: orange castle sparks, dust clouds, wind-driven debris
//   Always: Aram purple motes while he is the ACTIVE character; the active
//          character's subtle self-glow is render-side (render.js, §56).
//
// DETERMINISM (§72): cosmetic randomness uses a deterministic generator —
// positions/velocities derive from a stable integer hash of a monotonically
// increasing spawn counter (never Math.random). Given the same camera
// trajectory the ambience is bit-stable, so acceptance runs stay exact.
//
// §78 CAP: ambient emission keeps AMBIENT_AMBIENT_MAX live ambient particles
// as a ceiling, reserving the rest of the 400 budget for feedback bursts;
// particles that drift out of the camera window are culled in
// updateParticles (§42 render-only discipline).
//
// Presentation only (§57): nothing here reads or writes gameplay rules.
import { AMBIENT_INTERVALS, AMBIENT_AMBIENT_MAX, AMBIENT_PALETTE } from './constants.js';

// Stable integer hash (Knuth multiplicative, 32-bit) — deterministic
// pseudo-random source for cosmetic placement (§72).
function h32(n) {
  let x = (n * 2654435761) % 4294967296;
  x ^= Math.floor(x / 65536);
  return x % 4294967296;
}

// Module-local emission state (presentation singleton, §70 precedent —
// render.js POSE). Reset on every new run via resetAmbient().
const timers = {
  leaf: 0, firefly: 0, shaftMote: 0,
  roadDust: 0, fogWisp: 0, feather: 0, rain: 0,
  spark: 0, dustCloud: 0, debris: 0,
  aramMote: 0,
};
let spawnIndex = 0;

function countAmbient(list) {
  let n = 0;
  for (let i = 0; i < list.length; i += 1) {
    const k = list[i].kind;
    if (k != null && k !== 'dust') n += 1;
  }
  return n;
}

function push(list, p) {
  if (list.length >= 398) list.shift();          // §78 hard cap safety
  list.push(p);
}

// One deterministic spawn using the next counter value. `range` picks the
// hashed coordinate inside [0, range).
function nextSpawn() {
  spawnIndex += 1;
  return h32(spawnIndex * 7 + 3);
}

const AMBIENT_KINDS = {
  // ---- Act 1 ------------------------------------------------------------
  leaf(cam) {
    const r = nextSpawn();
    const fromTop = r % 2 === 0;
    return {
      x: cam.x + (r % 1120) - 60,
      y: fromTop ? cam.y - 30 + (r % 90) : cam.y + 120 + (r % 380),
      vx: -(30 + (r % 5) * 14),
      vy: 42 + (r % 4) * 12,
      life: 4.2 + (r % 5) * 0.6,
      size: 4 + (r % 3),
    };
  },
  firefly(cam) {
    const r = nextSpawn();
    return {
      x: cam.x + (r % 1080) - 40,
      y: cam.y + 320 + (r % 300),
      vx: (r % 2 === 0 ? 1 : -1) * (10 + (r % 4) * 8),
      vy: -(4 + (r % 3) * 4),
      life: 3.4 + (r % 6) * 0.5,
      size: 2,
    };
  },
  shaftMote(cam) {
    const r = nextSpawn();
    return {
      x: cam.x + (r % 1080) - 40,
      y: cam.y + 60 + (r % 420),
      vx: (r % 2 === 0 ? 1 : -1) * (6 + (r % 3) * 5),
      vy: 5 + (r % 3) * 4,
      life: 4.0 + (r % 5) * 0.6,
      size: 2,
    };
  },
  // ---- Act 2 ------------------------------------------------------------
  roadDust(cam) {
    const r = nextSpawn();
    return {
      x: cam.x + (r % 1100) - 50,
      y: cam.y + 470 + (r % 180),
      vx: -(20 + (r % 5) * 16),
      vy: -(6 + (r % 3) * 5),
      life: 2.2 + (r % 4) * 0.5,
      size: 2 + (r % 2),
    };
  },
  fogWisp(cam) {
    const r = nextSpawn();
    return {
      x: cam.x + (r % 1000) - 30,
      y: cam.y + 380 + (r % 220),
      vx: -(14 + (r % 4) * 8),
      vy: 2,
      life: 6.0 + (r % 5) * 0.8,
      size: 30 + (r % 4) * 12,
    };
  },
  feather(cam) {
    const r = nextSpawn();
    return {
      x: cam.x + (r % 1080) - 40,
      y: cam.y - 20 + (r % 140),
      vx: -(16 + (r % 4) * 10),
      vy: 34 + (r % 3) * 10,
      life: 4.6 + (r % 4) * 0.6,
      size: 3,
    };
  },
  rain(cam) {
    const r = nextSpawn();
    return {
      x: cam.x + (r % 1180) - 80,
      y: cam.y - 60,
      vx: -70,
      vy: 880,
      life: 1.3,
      size: 5 + (r % 2),
    };
  },
  // ---- Act 3 ------------------------------------------------------------
  spark(cam) {
    const r = nextSpawn();
    return {
      x: cam.x + (r % 1080) - 40,
      y: cam.y + 480 + (r % 160),
      vx: -(12 + (r % 4) * 10),
      vy: -(60 + (r % 5) * 22),
      life: 1.4 + (r % 4) * 0.3,
      size: 2,
    };
  },
  dustCloud(cam) {
    const r = nextSpawn();
    return {
      x: cam.x + (r % 1040) - 20,
      y: cam.y + 500 + (r % 120),
      vx: -(26 + (r % 4) * 14),
      vy: -(4 + (r % 3) * 3),
      life: 3.2 + (r % 4) * 0.6,
      size: 8 + (r % 3) * 5,
    };
  },
  debris(cam) {
    const r = nextSpawn();
    return {
      x: cam.x - 40,
      y: cam.y + 180 + (r % 400),
      vx: 250 + (r % 5) * 60,
      vy: (r % 2 === 0 ? -18 : 18),
      life: 1.4 + (r % 3) * 0.3,
      size: 2 + (r % 2),
    };
  },
  // ---- always (while Aram is active) -------------------------------------
  aramMote(cam, player) {
    const r = nextSpawn();
    const cx = player.x + player.w / 2;
    const cy = player.y + player.h / 2;
    return {
      x: cx + ((r % 96) - 48),
      y: cy + ((r % 120) - 60),
      vx: (r % 2 === 0 ? 1 : -1) * (8 + (r % 3) * 6),
      vy: -(14 + (r % 4) * 8),
      life: 1.6 + (r % 4) * 0.4,
      size: 2,
    };
  },
};

function emit(game, player, kind, maker) {
  const p = maker(game.camera, player);
  if (!p) return;
  push(game.particles, {
    x: p.x, y: p.y, vx: p.vx, vy: p.vy,
    life: p.life, maxLife: p.life,
    color: AMBIENT_PALETTE[kind],
    size: p.size,
    kind,
    ph: (spawnIndex % 97) * 0.064,           // stable sway phase (§72)
  });
}

function tick(game, player, kind, interval, dt, maker) {
  timers[kind] -= dt;
  if (timers[kind] > 0) return;
  timers[kind] += interval;
  if (countAmbient(game.particles) < AMBIENT_AMBIENT_MAX) emit(game, player, kind, maker);
}

// One fixed player-domain step. Called by main.js only while
// screen === 'playing' (ambience belongs to the living world; the title/
// death/ victory screens keep the world but not the weather).
export function updateAmbient(game, player, dt) {
  const act = game.currentAct;
  if (act === 1) {
    tick(game, player, 'leaf', AMBIENT_INTERVALS.leaf, dt, AMBIENT_KINDS.leaf);
    tick(game, player, 'firefly', AMBIENT_INTERVALS.firefly, dt, AMBIENT_KINDS.firefly);
    tick(game, player, 'shaftMote', AMBIENT_INTERVALS.shaftMote, dt, AMBIENT_KINDS.shaftMote);
  } else if (act === 2) {
    tick(game, player, 'roadDust', AMBIENT_INTERVALS.roadDust, dt, AMBIENT_KINDS.roadDust);
    tick(game, player, 'fogWisp', AMBIENT_INTERVALS.fogWisp, dt, AMBIENT_KINDS.fogWisp);
    tick(game, player, 'feather', AMBIENT_INTERVALS.feather, dt, AMBIENT_KINDS.feather);
    tick(game, player, 'rain', AMBIENT_INTERVALS.rain, dt, AMBIENT_KINDS.rain);
  } else {
    tick(game, player, 'spark', AMBIENT_INTERVALS.spark, dt, AMBIENT_KINDS.spark);
    tick(game, player, 'dustCloud', AMBIENT_INTERVALS.dustCloud, dt, AMBIENT_KINDS.dustCloud);
    tick(game, player, 'debris', AMBIENT_INTERVALS.debris, dt, AMBIENT_KINDS.debris);
    // §56 "light rain (Act 2 mostly)": Act 3 keeps the rain at half cadence.
    tick(game, player, 'rain', AMBIENT_INTERVALS.rain * 2, dt, AMBIENT_KINDS.rain);
  }
  // Aram's purple motes drift around him while he is the active character.
  if (player && player.character === 'aram' && !player.dead) {
    tick(game, player, 'aramMote', AMBIENT_INTERVALS.aramMote, dt, AMBIENT_KINDS.aramMote);
  }
}

// New-run reset (§47): ambience restarts clean; the emission timers and the
// deterministic spawn sequence re-arm from zero.
export function resetAmbient() {
  const keys = Object.keys(timers);
  for (let i = 0; i < keys.length; i += 1) timers[keys[i]] = 0;
  spawnIndex = 0;
}
