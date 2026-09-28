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
// Global camera ZOOM (amended §7/§53): the world transform renders at 1.25x
// over the UNCHANGED 1280x720 logical canvas (coordinate + contain-scaling
// space). Visible gameplay window: ~1024 x 576 world units. A 62px-tall
// character renders ~77px on screen (~13% of viewport height). Touch mapping
// stays in the 1280x720 logical canvas space.
export const ZOOM = 1.25;
export const VIEW_W = LOGICAL_W / ZOOM;    // 1024 — §53 clamp width
export const VIEW_H = LOGICAL_H / ZOOM;    // 576 — visible world height

// ---- world scale pass (amended §18) ---------------------------------------
// Character dimensions are x1.3 (Sara 30x48 -> 38x62; Raha 34x48 -> 44x62;
// Aram 32x48 -> 40x62) — authored as literals in ROSTER/enemy tables.
// CHAR_ART_SCALE scales the Phase-3 procedural Sara art (authored for the
// 48px-tall body) up to the amended 62px silhouette.
export const CHAR_ART_SCALE = 1.3;
// Collectible dimensions scale x1.3 (amended §48) — applied to pickup radii
// when collectible entities land in Phase 9; authored here as the locked hook.
export const COLLECTIBLE_SCALE = 1.3;

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

// ---- camera (SPEC §53 — locked factors) ------------------------------------
// Framerate-independent exponential follow: camera += (target - camera) *
// (1 - exp(-factor * dt)). Look-ahead: 40px in facing direction, +20px more
// while |vx| > 300px/s. Horizontal clamp keeps the view inside the level.
export const CAMERA_FACTOR_X = 7;            // horizontal smoothing factor
export const CAMERA_FACTOR_Y = 5;            // vertical smoothing factor
export const CAMERA_LOOKAHEAD = 40;          // px ahead of the facing direction
export const CAMERA_LOOKAHEAD_FAST = 20;     // additional px at high speed
export const CAMERA_LOOKAHEAD_SPEED = 300;   // px/s threshold for the extra px
// Vertical policy (render-authored within §53's freedom, which pins only the
// smoothing factor): a comfort deadzone in screen space plus a rest anchor.
// While airborne the view holds inside the band [BAND_TOP, BAND_BOTTOM]
// (measured as playerCenterY - camera.y); leaving the band eases the camera
// with factor 5. While grounded the camera re-anchors so the zone's groundY
// rests at CAMERA_REST_GROUND_SCREEN_Y — normal jumps never move the view.
export const CAMERA_BAND_TOP = 200;          // px; above this the camera rises
export const CAMERA_BAND_BOTTOM = 660;       // px; below this the camera drops
export const CAMERA_REST_GROUND_SCREEN_Y = 656; // ground top rest line on screen

// ---- parallax layers (SPEC §55 — locked factors; amended: NO moon layer) ---
export const PARALLAX_STARS = 0.1;           // 1. stars / dark clouds
// (the moon layer is REMOVED — amended canon §4/§55: the Shadows stole the
// moon; there is no moon disc, halo, or rays anywhere)
export const PARALLAX_CASTLE = 0.3;          // 2. gothic castle + spires + windows
export const PARALLAX_TREES = 0.5;           // 3. silhouetted trees + ruined pillars
export const PARALLAX_GRASS = 1.2;           // 4. foreground grass
// "Light Behind the Castle" (amended §55): near-sky drift for the horizon
// glow — the imprisoned light sits beyond every layer, so it barely moves.
export const PARALLAX_GLOW = 0.05;

// ---- environment palette (SPEC §55 — locked tones + authored detail shades) -
export const GLOW_LIGHT = '#e8f0ff';        // glow / moonrise light (former moon palette, re-purposed §55)
export const CLOUD_TONE = '#0a0f1c';         // dark cloud silhouettes (authored)
export const CASTLE_TONE = '#080b14';        // gothic castle silhouette (authored)
export const CASTLE_WINDOW = '#e07b2a';      // orange windows (authored)
export const CASTLE_WINDOW_BRIGHT = '#f2a04c'; // brighter window variance (authored)
export const TREE_TONE = '#070a12';          // tree silhouettes (authored)
export const PILLAR_TONE = '#0a0d16';       // ruined pillars (authored)
export const GRASS_TONE = '#04060c';         // foreground grass (authored)
export const FOG_TONE = '#05070f';           // bottom fog band (authored)
export const PLATFORM_SHADOW = '#05070d';    // under-edge shadow tone (amended §55)

// ---- enemies (SPEC §27–§33, §58 — Phase 6: Patroller) ----------------------
// Dimensions amended x1.3 to match the character scale pass (§18/§29);
// speeds and HP unchanged. Phase 8 extends the roster (Chaser/Armored/Brute).
export const ENEMY_TYPES = Object.freeze({
  patroller: Object.freeze({
    key: 'patroller', w: 42, h: 62, speed: 45, hp: 1,
    contactDamage: 1, score: 100,
  }),
});
// §31 animation: hurt 0.15 s with ~2px shake; 2 hits within 1.0 s -> 0.5 s
// stagger; walk/run hysteresis thresholds (Patroller speed 45 -> always walk).
export const ENEMY_HURT_T = 0.15;
export const ENEMY_STAGGER_T = 0.5;
export const ENEMY_STAGGER_WINDOW = 1.0;
export const ENEMY_EDGE_PAUSE_T = 0.2;      // §34 edge detection: pause then turn
// §30 visual style: stacked armor cubes, long red scarf, glowing white eyes.
export const ENEMY_ARMOR = Object.freeze(['#0a0a0a', '#141414', '#1e1e1e', '#2a2a2a']);
export const ENEMY_CLOTH = Object.freeze(['#8a1010', '#a01818', '#c02020']);
export const ENEMY_EYE = '#f0f0f0';        // the ONLY tone allowed shadowBlur (§30)

// ---- stomp (SPEC §40 — locked) ----------------------------------------------
export const STOMP_MIN_VY = 200;            // player.vy must exceed this
export const STOMP_DAMAGE = 1;
export const STOMP_BOUNCE = -480;           // bounce velocity (locked §40)

// ---- player damage invulnerability (SPEC §22) ------------------------------
export const INVULN_T = 1.0;                // seconds after real HP loss

// ---- combo (SPEC §60) -------------------------------------------------------
export const COMBO_WINDOW = 5.0;            // kill streak duration, seconds
export const COMBO_MIN_STREAK = 3;          // 3rd kill ACTIVATES; x2 from 4th

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
export const ANIM_ENEMY_WALK = 7.0;   // enemy walk-cycle rate, rad/s (§31 walk state)
