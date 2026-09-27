// Shadows of the Moon — procedural renderer (SPEC §53–§57, §78).
// Canvas 2D only. Logical 1280x720, strict 16:9 contain scaling,
// effectiveDPR = min(dpr, 2), imageSmoothingEnabled = false, touch
// coordinates mapped through the SAME transform as rendering (SPEC §7).
// Five parallax layers. shadowBlur is allowed ONLY for enemy eyes.
// Render-only culling; <= 200 pooled particles. NO gameplay logic in
// rendering (SPEC §70). Implementation lands in Phase 3+.
export const render = { /* Phase 3 */ };
