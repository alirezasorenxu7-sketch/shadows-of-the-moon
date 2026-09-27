// Shadows of the Moon — deterministic physics (SPEC §36–§40).
// Fixed 60 Hz, gravity 2400, max fall 1500, variable jump, coyote time
// 0.10 s, jump buffer 0.12 s. Two-pass AABB resolution: Pass 1
// horizontal, Pass 2 vertical. Physics must NOT touch DOM, render,
// network, localStorage, or audio, and may mutate only state explicitly
// passed in (SPEC §39). Implementation lands in Phase 2.
export const physics = { /* Phase 2 */ };
