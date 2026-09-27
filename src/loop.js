// Shadows of the Moon — main game loop (SPEC §9, §12, §13).
// requestAnimationFrame + fixed timestep (FIXED_DT = 1/60) + accumulator.
// Wall-clock delta clamped to MAX_WALL_DELTA; at most 5 simulation steps
// per render callback; unbounded catch-up forbidden. 60 FPS render gate:
// gate actual renders to ~1000/60 ms; lastRenderTime is NOT updated when
// a render is skipped; physics accumulation continues independently of the
// gate. Pause (portrait / hidden / manual) zeroes the accumulator, freezes
// gameTime, and can only be cleared by an explicit resume (never automatic).
// Hit-stop freezes simulation while rendering and input continue (§9).
// Slow-motion time domains (§10): the player domain keeps FIXED_DT; the
// enemy domain receives FIXED_DT * factor — the slowdown is applied EXACTLY
// ONCE, through the simulation delta, never also to enemy velocity.
import {
  FIXED_DT,
  MAX_SIM_STEPS_PER_RENDER,
  MAX_WALL_DELTA,
  RENDER_GATE_MS,
  SLOWMO_FACTOR,
  HIT_STOP,
} from './constants.js';

export function createLoop({ game, update, render, onStateChange, onFrame }) {
  let accumulator = 0;
  let lastFrameTime = null;
  let lastRenderTime = 0;
  let rafId = 0;
  let running = false;
  let hitStopRemaining = 0;
  let simStepsTotal = 0;
  let renderCount = 0;
  let lastFrameSteps = 0;
  let maxFrameSteps = 0;

  function enemyFactor() {
    return game.slowMoActive ? SLOWMO_FACTOR : 1.0;
  }

  function step() {
    game.gameTime += FIXED_DT;            // ONE global gameplay clock (§9)
    update(FIXED_DT, FIXED_DT * enemyFactor());
  }

  function enterPause(reason) {
    game.pauseReasons.add(reason);
    game.paused = true;
    accumulator = 0;                      // §12: pause resets accumulator
    onStateChange?.();
  }

  // A pause condition disappearing NEVER auto-resumes (§8.2–§8.4).
  function leavePauseCondition(reason) {
    game.pauseReasons.delete(reason);
    onStateChange?.();
  }

  function resetAccumulator() {
    accumulator = 0;
  }

  // Explicit resume only (§8.4): permitted when document is visible AND
  // the viewport is landscape. Sources: Resume UI button, desktop key R.
  function requestResume() {
    if (!game.paused) return true;
    if (document.visibilityState !== 'visible') return false;
    if (window.matchMedia('(orientation: portrait)').matches) return false;
    game.paused = false;
    game.pauseReasons.clear();
    accumulator = 0;
    onStateChange?.();
    return true;
  }

  function startHitStop() {
    hitStopRemaining = HIT_STOP;          // gameplay freeze (§9); Phase 10 uses it
  }

  function frame(now) {
    if (!running) return;
    if (lastFrameTime === null) lastFrameTime = now;
    let wallDelta = (now - lastFrameTime) / 1000;
    lastFrameTime = now;
    if (!(wallDelta > 0)) wallDelta = 0;
    if (wallDelta > MAX_WALL_DELTA) wallDelta = MAX_WALL_DELTA;

    if (game.paused) {
      accumulator = 0;                    // frozen: no physics advancement (§8)
      lastFrameSteps = 0;
    } else if (hitStopRemaining > 0) {
      hitStopRemaining -= wallDelta;      // presentation clock only (§9)
      if (hitStopRemaining < 0) hitStopRemaining = 0;
      accumulator = 0;                    // gameTime must not advance (§9)
      lastFrameSteps = 0;
    } else {
      accumulator += wallDelta;
      let steps = 0;
      while (accumulator >= FIXED_DT && steps < MAX_SIM_STEPS_PER_RENDER) {
        step();
        accumulator -= FIXED_DT;
        steps += 1;
      }
      if (steps === MAX_SIM_STEPS_PER_RENDER && accumulator > 0) {
        accumulator = 0;                  // drop backlog: no unbounded catch-up
      }
      lastFrameSteps = steps;
      if (steps > maxFrameSteps) maxFrameSteps = steps;
      simStepsTotal += steps;
    }

    if (now - lastRenderTime >= RENDER_GATE_MS - 0.75) {
      render(now);                        // render gate (§13)
      renderCount += 1;
      lastRenderTime = now;               // updated ONLY on actual render (§13)
      onFrame?.({ now, accumulator, lastFrameSteps, simStepsTotal, renderCount });
    }
    rafId = requestAnimationFrame(frame);
  }

  function start() {
    if (running) return;
    running = true;
    rafId = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(rafId);
  }

  return {
    start,
    stop,
    enterPause,
    leavePauseCondition,
    resetAccumulator,
    requestResume,
    startHitStop,
    metrics: () => ({
      accumulator,
      simStepsTotal,
      renderCount,
      lastFrameSteps,
      maxFrameSteps,
      hitStopRemaining,
    }),
  };
}
