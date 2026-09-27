// Shadows of the Moon — main game loop (SPEC §12, §13).
// requestAnimationFrame + fixed timestep (fixedDt = 1/60) + accumulator.
// Wall-clock delta cap 0.1 s; at most 5 simulation steps per render
// callback; unbounded catch-up forbidden. 60 FPS render gate: gate
// rendering to ~1000/60 ms between ACTUAL renders; lastRenderTime is
// NOT updated when a render is skipped; physics accumulation continues
// independently of the render gate. On pause: accumulator = 0.
// Implementation lands in Phase 1.
export const loop = { /* Phase 1 */ };
