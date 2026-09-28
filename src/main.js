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
import './constants.js';
import {
  LOGICAL_W,
  CAMERA_FACTOR_X,
  CAMERA_FACTOR_Y,
  CAMERA_LOOKAHEAD,
  CAMERA_LOOKAHEAD_FAST,
  CAMERA_LOOKAHEAD_SPEED,
  CAMERA_BAND_TOP,
  CAMERA_BAND_BOTTOM,
  CAMERA_REST_GROUND_SCREEN_Y,
} from './constants.js';
import { createInput } from './input.js';
import './physics.js';
import './ai.js';
import { LEVEL_DATA, buildLevel } from './level.js';
import { createRenderer } from './render.js';
import { createLoop } from './loop.js';
import { createPlayer, updatePlayer, playerSnapshot } from './entities/player.js';
import './entities/enemy.js';
import './entities/projectile.js';
import './entities/particle.js';
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
  slowMoActive: false,
  paused: false,
  pauseReasons: new Set(),
  activeCheckpoint: null,   // no checkpoint until Phase 11 (§44 data authored now)
  lastDeath: null,          // set on the first death of the run (§43)
  camera: { x: 0, y: 0 },   // view center-top anchor, world px (§53, Phase 4)
};

// §53 camera follow — runs once per fixed sim step (dt = FIXED_DT, player
// domain): framerate-independent exponential smoothing toward the target,
// look-ahead in the facing direction (+20px above 300px/s), horizontal clamp
// so the view never leaves the level. Vertical policy: comfort deadzone
// [BAND_TOP, BAND_BOTTOM] in screen space while airborne; grounded play
// re-anchors the chapter ground at CAMERA_REST_GROUND_SCREEN_Y — normal jumps
// keep the view still, deep falls (pits) and tall climbs move it.
// NOTE Phase 11: respawn/checkpoint flow should snap the camera to its target
// instead of easing across the world.
function updateCamera(dt) {
  const c = game.camera;
  const dir = player.facing === 'left' ? -1 : 1;
  let look = CAMERA_LOOKAHEAD;
  if (Math.abs(player.vx) > CAMERA_LOOKAHEAD_SPEED) look += CAMERA_LOOKAHEAD_FAST;
  const targetX = player.x + player.w / 2 + look * dir - LOGICAL_W / 2;

  let targetY;
  if (player.onGround) {
    const chapter = level.chapterAt(player.x);
    targetY = chapter.groundY - CAMERA_REST_GROUND_SCREEN_Y;
  } else {
    const screenY = player.y + player.h / 2 - c.y;   // player's screen-space y
    if (screenY < CAMERA_BAND_TOP) targetY = player.y + player.h / 2 - CAMERA_BAND_TOP;
    else if (screenY > CAMERA_BAND_BOTTOM) targetY = player.y + player.h / 2 - CAMERA_BAND_BOTTOM;
    else targetY = c.y;                               // inside the comfort band: hold
  }

  c.x += (targetX - c.x) * (1 - Math.exp(-CAMERA_FACTOR_X * dt));
  c.y += (targetY - c.y) * (1 - Math.exp(-CAMERA_FACTOR_Y * dt));

  const maxX = level.worldWidth - LOGICAL_W;          // §53: never show beyond level
  if (c.x < 0) c.x = 0;
  else if (c.x > maxX) c.x = maxX;
}

const level = buildLevel(LEVEL_DATA);
const player = createPlayer(level);   // a new run starts with Sara (§47)
const renderer = createRenderer(canvas);
const input = createInput({
  game,
  onManualPause: () => loop.enterPause('manual'),      // §8.1 manual pause
});
const loop = createLoop({
  game,
  update: (dt) => {
    // Player domain keeps FIXED_DT even during slow-motion (§10); the
    // enemy domain (dt * factor) is consumed from Phase 6 onward.
    const events = input.drainEvents();
    updatePlayer(game, player, input.heldState(), events, dt, level);
    updateCamera(dt);   // §10 “Camera gameplay update: 1.0” — never slowed

    // Chapter/act tracking (amended §46): currentChapter derives from the
    // player's X within the authored chapter bounds. Chapter-entry side
    // effects (inscription, completion flow, checkpoint auto-activation,
    // save v2 write) arrive with Phases 9/11 — Phase 5 only tracks.
    const chapter = level.chapterAt(player.x);
    game.currentChapter = chapter.id;
    game.currentAct = chapter.act;
  },
  render: () => renderer.render(game, level, player),
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
    chapter: null,
    currentChapter: null,
    currentAct: null,
    activeCheckpoint: null,
    lastDeath: null,
    renderTimestamps: [],
  };
}

// ---- boot -----------------------------------------------------------------
onOrientationChange();   // honor an initially-portrait viewport (§8.2)
updateOverlays();
loop.start();
window.__SOM_BOOTED__ = true;   // load smoke hook (production-independent)
