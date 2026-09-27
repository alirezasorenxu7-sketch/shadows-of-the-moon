// Shadows of the Moon — entry point (SPEC §69, §8, §73, §74).
// Creates the single authoritative `game` object (§71), wires the loop,
// input, renderer, pause semantics (portrait / visibility / manual — one
// shared resume rule, NEVER automatic), and the DOM overlays. Gameplay
// systems (player, enemies, level) arrive with Phase 2+; this phase owns
// the loop, input, time domains, and pause/resume fundamentals.
import './constants.js';
import { createInput } from './input.js';
import './physics.js';
import './ai.js';
import './level.js';
import { createRenderer } from './render.js';
import { createLoop } from './loop.js';
import './entities/player.js';
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
  currentZone: 1,
  slowMoActive: false,
  paused: false,
  pauseReasons: new Set(),
};

const renderer = createRenderer(canvas);
const input = createInput({
  game,
  onManualPause: () => loop.enterPause('manual'),      // §8.1 manual pause
});
const loop = createLoop({
  game,
  update: () => {
    input.drainEvents();   // Phase 2+ consumes jump/attack/... edges
  },
  render: () => renderer.render(game),
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
    renderTimestamps: [],
  };
}

// ---- boot -----------------------------------------------------------------
onOrientationChange();   // honor an initially-portrait viewport (§8.2)
updateOverlays();
loop.start();
window.__SOM_BOOTED__ = true;   // load smoke hook (production-independent)
