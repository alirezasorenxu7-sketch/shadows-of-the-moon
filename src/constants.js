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

// ---- physics (SPEC §36 — locked values) ----------------------------------
export const GRAVITY = 2400;               // px/s^2
export const MAX_FALL = 1500;             // terminal fall speed, px/s
export const JUMP_SARA = -800;            // Sara jump velocity, px/s
export const JUMP_RAHA = -690;            // Raha jump velocity, px/s
export const JUMP_ARAM = -730;            // Aram jump velocity, px/s
export const VAR_JUMP_EXTRA = 1800;       // extra gravity while jump released and vy < -180
export const VAR_JUMP_MIN_VY = -180;      // variable-jump cut threshold (SPEC §36)
export const COYOTE_TIME = 0.10;          // seconds after leaving ground
export const JUMP_BUFFER = 0.12;          // seconds a jump press stays buffered

// Horizontal movement: SPEC pins no numeric value (tweakable, §98 range
// 50–1000). Deterministic authored default, applied with instant response —
// no acceleration curve — so traversal is exactly predictable at 60 Hz.
export const MOVE_SPEED = 360;            // px/s

// ---- death (SPEC §43) -----------------------------------------------------
export const FALL_DEATH_OFFSET = 400;     // player.y > zoneGroundY + this => fall death

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

// ---- character signature colors (SPEC §18) --------------------------------
export const CHARACTER_COLORS = Object.freeze({
  sara: '#4a9eff',
  raha: '#e63946',
  aram: '#9d4edd',
});

// ---- Sara rendering (SPEC §18.1 — locked appearance colors) ----------------
// Hair #e8d174, tunic #4a9eff, cloak/accents #1e5aa8, boots #6a4a30 are
// authored in the SPEC. Skin and eye tones are render-authored detail shades
// consistent with the moonlit palette (not SPEC-locked).
export const SARA_PALETTE = Object.freeze({
  hair: '#e8d174',      // long blonde hair
  tunic: '#4a9eff',     // blue tunic
  cloak: '#1e5aa8',     // short cloak, darker blue
  boots: '#6a4a30',     // brown boots
  skin: '#e8cfae',      // pale moonlit skin (render-authored)
  eye: '#0a0d14',       // dark eyes (render-authored)
});

// ---- squash & stretch (SPEC §57 — locked factors, Phase 3) -----------------
export const SQUASH_DURATION = 0.1;   // seconds to ease back to neutral ("~0.1s")
export const SQUASH_JUMP_Y = 1.15;    // jump takeoff: Y * 1.15
export const SQUASH_JUMP_X = 0.85;    // jump takeoff: X * 0.85
export const SQUASH_LAND_Y = 0.85;    // landing: Y * 0.85
export const SQUASH_LAND_X = 1.15;    // landing: X * 1.15

// ---- character animation (rendering tunables, SPEC §70) --------------------
export const ANIM_IDLE_SPEED = 2.4;   // idle bob + breathing rate, rad/s
export const ANIM_IDLE_BOB = 1.6;     // idle vertical bob amplitude, px
export const ANIM_HAIR_SWAY = 2.2;    // idle hair sway rate, rad/s
export const ANIM_RUN_CYCLE = 13.0;   // run leg-cycle rate, rad/s
export const ANIM_HAIR_RISE = 0.010;  // hair rise per px/s of fall speed
export const ANIM_HAIR_TRAIL = 0.020; // hair back-sweep per px/s of run speed
