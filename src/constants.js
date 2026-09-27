// Shadows of the Moon — tunable constants (SPEC §69, §70).
// ALL gameplay/physics/combat/timing/rendering tunables live here and
// NOWHERE else (no duplicate timing constants in other modules).
// Authored from Phase 1 onward; later phases extend this module.

// ---- time model (SPEC §9, §12) -------------------------------------------
export const FIXED_DT = 1 / 60;            // fixed simulation step, seconds
export const MAX_SIM_STEPS_PER_RENDER = 5; // per render callback cap (§12)
export const MAX_WALL_DELTA = 0.1;         // wall-clock delta clamp, seconds (§12)
export const RENDER_GATE_MS = 1000 / 60;   // presentation-only render cap (§13)

// ---- time domains (SPEC §10, §11) ----------------------------------------
export const SLOWMO_FACTOR = 0.35;         // enemy sim factor during Slow-motion

// ---- hit-stop (SPEC §9: 0.06–0.08 s authorized; one deterministic value) --
export const HIT_STOP = 0.07;              // seconds

// ---- view / responsive canvas (SPEC §7) ----------------------------------
export const LOGICAL_W = 1280;
export const LOGICAL_H = 720;
export const MAX_DPR = 2;                  // effectiveDPR = min(devicePixelRatio, 2)

// ---- touch layout (SPEC §15) ---------------------------------------------
// Visual faces: Left/Right 70, Jump 80, Attack 60, Special 60,
// selectors 56, Pause 56. Each button's hit target expands by
// TOUCH_HIT_EXPAND on all sides; spacing keeps expanded regions disjoint.
export const TOUCH_HIT_EXPAND = 10;        // px on all sides
export const SPECIAL_HOLD_MS = 300;        // tap/hold threshold (SPEC §25)

// ---- keyboard mapping (SPEC §16) -----------------------------------------
export const KEYS = Object.freeze({
  LEFT: ['KeyA', 'ArrowLeft'],
  RIGHT: ['KeyD', 'ArrowRight'],
  JUMP: ['Space', 'ArrowUp'],
  ATTACK: ['KeyJ'],
  SPECIAL: ['KeyK'],
  SELECT_SARA: ['Digit1'],
  SELECT_RAHA: ['Digit2'],
  SELECT_ARAM: ['Digit3'],
  PAUSE: ['Escape'],
  RESUME: ['KeyR'],
});

// ---- palette (SPEC §55 — locked sky/platform tones) ----------------------
export const SKY_TOP = '#05070f';
export const SKY_MID = '#0d1420';
export const SKY_LOW = '#1a2230';
export const GROUND_FILL = '#0a0d14';
export const GROUND_EDGE = '#181c24';
export const TEXT_MAIN = '#e8ecff';
export const TEXT_DIM = '#8b93c9';
export const STAR_TONE = '#cfd8ff';
