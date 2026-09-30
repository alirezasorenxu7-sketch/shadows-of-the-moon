// Shadows of the Moon — entry point (SPEC §69, §8, §73, §74).
// Creates the single authoritative `game` object (§71), wires the loop,
// input, renderer, pause semantics (portrait / visibility / manual — one
// shared resume rule, NEVER automatic), and the DOM overlays. Phase 2 adds
// the player controller: physics, jumping, collision, and the death
// foundation (§36–§39, §43). Phase 4 adds the camera (§53): exponential
// follow with look-ahead and horizontal clamping, updated inside the fixed
// sim step at the player-domain rate — “Camera gameplay update: 1.0” (§10),
// so the view never slows during Slow-motion. Phase 5 switches the world
// model from zones to the 15-chapter / 3-act structure (amended §50, §46):
// game.currentChapter / currentAct derive from the player's X each step.
// Phase 6 adds the enemy system (§27–§35): the Patroller roster, base AI,
// player-enemy collision with stomp priority, and the run-state authorities
// (defeatedEnemyIds §28, damageTaken §61, combo streak §60); the camera and
// renderer run at the amended global ZOOM 1.25 (§7/§53).
// Phase 7 owns the ROSTER + ABILITY runtime (§15–§26, §50, §54, §57, §63):
// per-character cooldowns and abilities (knife/dash, shockwave/slam,
// magic/slow-motion/shield), character switching with the §20 HP-ratio
// formula and §20.1 switch combos, the progressive unlock chain
// (Sara → Raha at 1-3 → Aram at 1-5) with §20.2 non-blocking tutorials,
// projectiles, particles, §50 gate transitions (barrier dispel, time-door
// latch) through the active-solids rebuild, and the §54 screen-shake state.
import './constants.js';
import {
  ZOOM,
  VIEW_W,
  CAMERA_FACTOR_X,
  CAMERA_FACTOR_Y,
  CAMERA_LOOKAHEAD,
  CAMERA_LOOKAHEAD_FAST,
  CAMERA_LOOKAHEAD_SPEED,
  CAMERA_BAND_TOP,
  CAMERA_BAND_BOTTOM,
  CAMERA_REST_GROUND_SCREEN_Y,
  CHARACTER_COLORS,
  UNLOCK_CHAPTERS,
  TUTORIAL_DURATION,
  GATE_OPEN_RANGE,
} from './constants.js';
import { createInput } from './input.js';
import './physics.js';
import './ai.js';
import { LEVEL_DATA, buildLevel } from './level.js';
import { createRenderer } from './render.js';
import { createLoop } from './loop.js';
import { createPlayer, updatePlayer, switchCharacter, playerSnapshot } from './entities/player.js';
import { createEnemies, updateEnemies, damageEnemy, enemiesSnapshot } from './entities/enemy.js';
import { updateProjectiles, projectilesSnapshot } from './entities/projectile.js';
import { updateParticles, spawnBurst, particlesSnapshot } from './entities/particle.js';
import './entities/coin.js';

const canvas = document.getElementById('game');

// Single global runtime state object (SPEC §69, §71).
const game = {
  gameTime: 0,
  score: 0,
  kills: 0,
  currentRunCoins: 0,
  currentChapter: '1-1',   // chapter id "A-C" derived from player X (§46)
  currentAct: 1,           // act 1..3 (zones renamed acts, amended §50)
  slowMoActive: false,     // §25.1: enemy systems run at 0.35 while active
  slowMoT: 0,              // §25.1 remaining slow-motion seconds (player domain)
  paused: false,
  pauseReasons: new Set(),
  activeCheckpoint: null,   // no checkpoint until Phase 11 (§44 data authored now)
  lastDeath: null,          // set on the first death of the run (§43)
  camera: { x: 0, y: 0 },   // view center-top anchor, world px (§53, Phase 4)
  // ---- Phase 6 run-state authorities ----
  defeatedEnemyIds: new Set(),  // §28: kill score uniqueness; reset only on new run
  damageTaken: 0,               // §61: actual HP points lost (rank input, Phase 13)
  killStreak: 0,                // §60: consecutive kills (combo activation)
  comboTimer: 0,                // §60: combo window countdown, seconds
  // ---- Phase 7 roster/ability run state (§71 global state rule) ----
  // §20 progressive unlock (session view; §63 save-v2 persistence is Phase 9):
  // Sara starts unlocked; Raha joins at chapter 1-3, Aram at chapter 1-5.
  unlockedCharacters: ['sara'],
  heartCount: 0,                // §19 global heart containers (assembled)
  heartFragments: 0,            // §19/§50 mini-boss fragments (3 = 1 container)
  projectiles: [],              // §21 knives + magic shots (player domain)
  particles: [],                // §57/§78 capped feedback particles
  rings: [],                    // §24 shockwave/slam impact rings (presentation)
  brokenPlatformIds: new Set(), // §24/§50 broken breakables
  solidsDirty: false,           // rebuild the active collision view when set
  shake: null,                  // §54 {mag, t, T} while a shake is live
  lastAbilityUse: null,         // §20.1 switch-combo pairing stamp
  comboBoost: null,             // §20.1 armed incoming-ability modifier
  lastCombo: null,              // §20.1 consumed combo record (metrics)
  tutorial: null,               // §20.2 {key, text, until} non-blocking hint
};

// §53 camera follow — runs once per fixed sim step (dt = FIXED_DT, player
// domain): framerate-independent exponential smoothing toward the target,
// look-ahead in the facing direction (+20px above 300px/s), horizontal clamp
// so the view never leaves the level. Phase 6: the camera runs at the
// amended global ZOOM 1.25 (§7/§53) — the visible gameplay window is
// VIEW_W x VIEW_H world units, screen-space bands convert through /ZOOM.
// Vertical policy: comfort deadzone [BAND_TOP, BAND_BOTTOM] in screen space
// while airborne; grounded play re-anchors the chapter ground at
// CAMERA_REST_GROUND_SCREEN_Y — normal jumps keep the view still, deep
// falls (pits) and tall climbs move it.
// NOTE Phase 11: respawn/checkpoint flow should snap the camera to its target
// instead of easing across the world.
function updateCamera(dt) {
  const c = game.camera;
  const dir = player.facing === 'left' ? -1 : 1;
  let look = CAMERA_LOOKAHEAD;
  if (Math.abs(player.vx) > CAMERA_LOOKAHEAD_SPEED) look += CAMERA_LOOKAHEAD_FAST;
  const targetX = player.x + player.w / 2 + look * dir - VIEW_W / 2;

  let targetY;
  if (player.onGround) {
    const chapter = level.chapterAt(player.x);
    targetY = chapter.groundY - CAMERA_REST_GROUND_SCREEN_Y / ZOOM;
  } else {
    const screenY = (player.y + player.h / 2 - c.y) * ZOOM;   // §7 zoom space
    if (screenY < CAMERA_BAND_TOP) targetY = player.y + player.h / 2 - CAMERA_BAND_TOP / ZOOM;
    else if (screenY > CAMERA_BAND_BOTTOM) targetY = player.y + player.h / 2 - CAMERA_BAND_BOTTOM / ZOOM;
    else targetY = c.y;                               // inside the comfort band: hold
  }

  c.x += (targetX - c.x) * (1 - Math.exp(-CAMERA_FACTOR_X * dt));
  c.y += (targetY - c.y) * (1 - Math.exp(-CAMERA_FACTOR_Y * dt));

  const maxX = level.worldWidth - VIEW_W;             // §53 amended: 0..LEVEL_W-1024
  if (c.x < 0) c.x = 0;
  else if (c.x > maxX) c.x = maxX;
}

const level = buildLevel(LEVEL_DATA);
const player = createPlayer(level);   // a new run starts with Sara (§47)
const enemies = createEnemies(level, game.defeatedEnemyIds);   // §28/§6
const renderer = createRenderer(canvas);
const input = createInput({
  game,
  onManualPause: () => loop.enterPause('manual'),      // §8.1 manual pause
});

// §20/§20.2 progressive unlock chain, resolved by chapter ORDER (entering
// the unlock chapter or any later one unlocks the character — idempotent,
// and re-entering an earlier chapter can never re-lock). The unlock burst
// (§15) + non-blocking tutorial (§20.2) fire exactly once per character.
const CHAPTER_INDEX = new Map();
for (let i = 0; i < level.chapters.length; i += 1) CHAPTER_INDEX.set(level.chapters[i].id, i);
const UNLOCK_ORDER = [['raha', UNLOCK_CHAPTERS.raha], ['aram', UNLOCK_CHAPTERS.aram]];
const TUTORIAL_TEXT = {
  sara: 'A / D move · Space jump (twice for double jump) · K dash',
  raha: 'RAHA — J shockwave · hold K airborne to slam',
  aram: 'ARAM — J magic · tap K slow-motion · hold K shield',
};
function showTutorial(key) {
  game.tutorial = { key, text: TUTORIAL_TEXT[key], until: game.gameTime + TUTORIAL_DURATION };
}
function unlockCharacter(key) {
  if (game.unlockedCharacters.indexOf(key) !== -1) return;
  game.unlockedCharacters.push(key);
  spawnBurst(game, player.x + player.w / 2, player.y + player.h / 2,
             CHARACTER_COLORS[key], 16);          // §15 unlock burst
  showTutorial(key);                             // §20.2 non-blocking hint
}
function checkUnlocks() {
  const here = CHAPTER_INDEX.get(game.currentChapter);
  if (here == null) return;
  for (let i = 0; i < UNLOCK_ORDER.length; i += 1) {
    const key = UNLOCK_ORDER[i][0];
    const at = CHAPTER_INDEX.get(UNLOCK_ORDER[i][1]);
    if (at != null && here >= at) unlockCharacter(key);
  }
}

// §50 time-locked doors: open ONLY while Aram's slow-motion is active and
// the player is within GATE_OPEN_RANGE of the door (then latched open — a
// re-closing door could clip the player, so an opened door never re-locks).
function checkTimeDoors() {
  if (!game.slowMoActive) return;
  for (let i = 0; i < level.gates.length; i += 1) {
    const g = level.gates[i];
    if (g.kind !== 'timeDoor' || g.state !== 'closed') continue;
    const dx = (player.x + player.w / 2) - (g.x + g.w / 2);
    const dy = (player.y + player.h / 2) - (g.y + g.h / 2);
    if (Math.abs(dx) <= GATE_OPEN_RANGE && Math.abs(dy) <= GATE_OPEN_RANGE) {
      g.state = 'open';
      game.solidsDirty = true;
      spawnBurst(game, g.x + g.w / 2, g.y + g.h / 2, '#c77dff', 12);
    }
  }
}

const loop = createLoop({
  game,
  update: (dt) => {
    // Player domain keeps FIXED_DT even during slow-motion (§10); the
    // enemy domain consumes dt * slowMotionFactor inside updateEnemies
    // (§10/§11 — applied exactly once there).
    const events = input.drainEvents();
    // §20 character switching resolves BEFORE the step: keys 1/2/3 and the
    // touch selectors emit `select` edges; switchCharacter enforces the
    // unlock gate, blocked-while rules, and the HP-ratio formula.
    for (let i = 0; i < events.length; i += 1) {
      if (events[i].type === 'select') switchCharacter(game, player, events[i].select);
    }
    updatePlayer(game, player, input.heldState(), events, dt, level, enemies);
    updateEnemies(game, enemies, player, dt, level);   // §27–§35 (Phase 6)
    updateProjectiles(game, game.projectiles, enemies, level, dt);   // §21 (Phase 7)
    updateParticles(game, dt);                        // §57 FX (player domain)

    // Chapter/act tracking (amended §46): currentChapter derives from the
    // player's X within the authored chapter bounds. Chapter-entry side
    // effects (inscription, completion flow, checkpoint auto-activation,
    // save v2 write) arrive with Phases 9/11 — Phase 7 adds only the §20
    // unlock chain and the §50 time-door proximity rule.
    const chapter = level.chapterAt(player.x);
    game.currentChapter = chapter.id;
    game.currentAct = chapter.act;
    checkUnlocks();
    checkTimeDoors();

    // §25.1 slow-motion expiry — the time-domain effect is GLOBAL and runs
    // on the player-domain clock (it outlives switching away from Aram).
    if (game.slowMoActive) {
      game.slowMoT -= dt;
      if (game.slowMoT <= 0) { game.slowMoActive = false; game.slowMoT = 0; }
    }
    // §54 screen shake: time-bounded decay on the player-domain clock.
    if (game.shake) {
      game.shake.t -= dt;
      if (game.shake.t <= 0) game.shake = null;
    }
    // §20.2 tutorial expiry (non-blocking: presentation state only).
    if (game.tutorial && game.gameTime > game.tutorial.until) game.tutorial = null;
    // §24/§50 active-solids rebuild (broken breakables, dispelled/opened gates).
    if (game.solidsDirty) {
      level.rebuildSolids(game.brokenPlatformIds);
      game.solidsDirty = false;
    }

    updateCamera(dt);   // §10 “Camera gameplay update: 1.0” — never slowed
  },
  render: () => renderer.render(game, level, player, enemies),
  onStateChange: updateOverlays,
  onFrame: pushMetrics,
});

const portraitMq = window.matchMedia('(orientation: portrait)');
const pauseOverlay = document.getElementById('pause-overlay');
const rotationOverlay = document.getElementById('rotation-overlay');
const touchControls = document.getElementById('touch-controls');

// ---- overlays (§8): DOM classes only change when visibility changes (§70)
let lastPauseShown = null;
let lastRotationShown = null;
let lastControlsShown = null;

function updateOverlays() {
  const portrait = portraitMq.matches;
  const showPause = game.paused && !portrait;   // portrait shows rotation UI
  const showControls = !game.paused;            // hidden during Pause+Portrait (§15)
  if (showPause !== lastPauseShown) {
    pauseOverlay.classList.toggle('hidden', !showPause);
    lastPauseShown = showPause;
  }
  if (portrait !== lastRotationShown) {
    rotationOverlay.classList.toggle('hidden', !portrait);
    lastRotationShown = portrait;
  }
  if (showControls !== lastControlsShown) {
    touchControls.classList.toggle('hidden', !showControls);
    lastControlsShown = showControls;
  }
}

// ---- pause conditions (§8.2, §8.3) ---------------------------------------
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    loop.enterPause('visibility');
  } else {
    loop.leavePauseCondition('visibility');      // remains paused (§8.3)
    loop.resetAccumulator();                     // accumulator reset AGAIN
  }
});

function onOrientationChange() {
  if (portraitMq.matches) loop.enterPause('portrait');
  else loop.leavePauseCondition('portrait');     // remains paused (§8.2)
}

if (portraitMq.addEventListener) {
  portraitMq.addEventListener('change', onOrientationChange);
} else if (portraitMq.addListener) {
  portraitMq.addListener(onOrientationChange);   // older mobile browsers
}

// ---- explicit resume sources (§8.4): Resume button + desktop R -----------
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.code === 'Escape') loop.enterPause('manual');
  else if (e.code === 'KeyR') loop.requestResume();
});

const resumeButton = document.getElementById('btn-resume');
function on_resume() {
  loop.requestResume();
}
resumeButton.addEventListener('click', on_resume);
resumeButton.addEventListener('touchstart', (e) => {
  e.preventDefault();
  loop.requestResume();
}, { passive: false });

// ---- responsive canvas (§7) ----------------------------------------------
window.addEventListener('resize', () => {
  renderer.resize();
}, { passive: true });

// ---- test instrumentation (§73, §74): test mode only, production clean ---
function pushMetrics(frameInfo) {
  if (window.__SOM_TEST__ !== true) return;
  const M = window.__SOM_METRICS__;
  const L = loop.metrics();
  M.gameTime = game.gameTime;
  M.paused = game.paused;
  M.pauseReasons = Array.from(game.pauseReasons);
  M.accumulator = L.accumulator;
  M.simStepsTotal = L.simStepsTotal;
  M.renderCount = L.renderCount;
  M.lastFrameSteps = L.lastFrameSteps;
  M.maxFrameSteps = L.maxFrameSteps;
  M.lastRenderTime = frameInfo.now;
  M.input = input.snapshot();
  M.player = playerSnapshot(player);
  M.camera = { x: game.camera.x, y: game.camera.y };
  M.score = game.score;                       // §58 run score
  M.kills = game.kills;                       // §59 kill count
  M.damageTaken = game.damageTaken;           // §61
  M.killStreak = game.killStreak;             // §60
  M.defeatedEnemyIds = Array.from(game.defeatedEnemyIds);   // §28 authority
  M.enemies = enemiesSnapshot(enemies);       // §74 entity instrumentation
  // ---- Phase 7 instrumentation (§74) ----
  M.unlockedCharacters = game.unlockedCharacters.slice();      // §20 chain
  M.slowMoActive = game.slowMoActive;          // §25.1 time domain state
  M.slowMoT = game.slowMoT;
  M.projectiles = projectilesSnapshot(game.projectiles);      // §21
  M.particles = particlesSnapshot(game);        // §57/§78 FX bounds
  M.gates = level.gates.map((g) => ({ id: g.id, kind: g.kind, state: g.state }));
  M.brokenPlatformIds = Array.from(game.brokenPlatformIds);   // §24/§50 breaks
  M.heartFragments = game.heartFragments;          // §19/§50 fragment count
  M.heartCount = game.heartCount;                  // §19 assembled containers
  M.comboBoost = game.comboBoost
    ? { ability: game.comboBoost.ability, from: game.comboBoost.from,
        to: game.comboBoost.to, until: game.comboBoost.until }
    : null;                                     // §20.1 armed modifier
  M.lastCombo = game.lastCombo
    ? { ability: game.lastCombo.ability, from: game.lastCombo.from,
        to: game.lastCombo.to, at: game.lastCombo.at }
    : null;                                     // §20.1 consumed record
  M.tutorial = game.tutorial ? { key: game.tutorial.key } : null;
  M.shake = game.shake ? { mag: game.shake.mag, t: game.shake.t } : null;
  const chapter = level.chapterAt(player.x);
  M.chapter = { id: chapter.id, act: chapter.act, groundY: chapter.groundY };
  M.currentChapter = game.currentChapter;
  M.currentAct = game.currentAct;
  M.activeCheckpoint = game.activeCheckpoint;
  M.lastDeath = game.lastDeath;
  M.renderTimestamps.push(frameInfo.now);
  if (M.renderTimestamps.length > 240) M.renderTimestamps.shift();
}

if (window.__SOM_TEST__ === true) {
  window.__SOM_METRICS__ = {
    gameTime: 0,
    paused: false,
    pauseReasons: [],
    accumulator: 0,
    simStepsTotal: 0,
    renderCount: 0,
    lastFrameSteps: 0,
    maxFrameSteps: 0,
    lastRenderTime: 0,
    input: null,
    player: null,
    camera: null,
    score: 0,
    kills: 0,
    damageTaken: 0,
    killStreak: 0,
    defeatedEnemyIds: [],
    enemies: [],
    unlockedCharacters: [],
    slowMoActive: false,
    slowMoT: 0,
    projectiles: [],
    particles: null,
    gates: [],
    brokenPlatformIds: [],
    heartFragments: 0,
    heartCount: 0,
    comboBoost: null,
    lastCombo: null,
    tutorial: null,
    shake: null,
    chapter: null,
    currentChapter: null,
    currentAct: null,
    activeCheckpoint: null,
    lastDeath: null,
    renderTimestamps: [],
  };
  // §73 test-mode-only harness facilities: deterministic position control
  // and a forced lethal damage event through the ORGANIC award path
  // (§59). Production never sees this object — it is created exclusively
  // under __SOM_TEST__.
  window.__SOM_TEST_API__ = {
    teleport(x, y, vy) {
      if (player.dead) return;
      player.x = x;
      player.y = y;
      player.prevY = y;
      if (vy !== undefined) player.vy = vy;
    },
    forceKill(id) {
      for (let i = 0; i < enemies.length; i += 1) {
        if (enemies[i].id === id) {
          damageEnemy(game, enemies[i], 999);
          return true;
        }
      }
      return false;
    },
    // §73 harness facility for §79.3/§79.4/§79.5: force a story unlock
    // (§20). Chapter 1-5 lies beyond the interim dev end wall until Phase
    // 12 authors it, so the organic Aram unlock is unreachable in the
    // authored world — tests force it through the SAME unlock path the
    // chapter-entry rule uses (burst + tutorial included). Test mode only.
    forceUnlock(key) {
      if (!TUTORIAL_TEXT[key]) return false;
      unlockCharacter(key);
      return game.unlockedCharacters.indexOf(key) !== -1;
    },
  };
}

// ---- boot -----------------------------------------------------------------
onOrientationChange();   // honor an initially-portrait viewport (§8.2)
updateOverlays();
showTutorial('sara');    // §20.2: game-start hints (non-blocking, 3-5 s)
loop.start();
window.__SOM_BOOTED__ = true;   // load smoke hook (production-independent)
