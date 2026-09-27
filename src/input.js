// Shadows of the Moon — input (SPEC §14, §15, §16, §8).
// Two SEPARATE layers: desktop keyboard and fixed-position DOM touch
// buttons. Every gameplay touch button uses position:fixed, respects
// safe-area insets, sets touch-action:none, owns its touchstart /
// touchend / touchcancel handlers (passive:false where preventDefault is
// called), never depends on click, never uses event delegation. Each
// active touch is tracked separately by identifier; at least 3
// simultaneous touches are supported (e.g., Left + Jump + Attack).
// While the game is paused, gameplay input is DISABLED (§8.1) — key and
// touch releases are still processed so no state gets stuck across a
// pause. The 300 ms special tap/hold threshold is authored in constants
// (SPEC §25) and only OBSERVED here; ability semantics arrive in Phase 7.
import { KEYS, SPECIAL_HOLD_MS } from './constants.js';

const TOUCH_BUTTONS = [
  { id: 'btn-left', hold: 'left' },
  { id: 'btn-right', hold: 'right' },
  { id: 'btn-jump', hold: 'jump', edge: 'jump' },
  { id: 'btn-attack', hold: 'attack', edge: 'attack' },
  { id: 'btn-special', hold: 'special', edge: 'special', timed: true },
  { id: 'btn-select-sara', edge: 'select', select: 'sara' },
  { id: 'btn-select-raha', edge: 'select', select: 'raha' },
  { id: 'btn-select-aram', edge: 'select', select: 'aram' },
  { id: 'btn-pause', edge: 'pause' },
];

function matchesAny(codes, code) {
  return codes.indexOf(code) !== -1;
}

function preventKeyDefault(code) {
  // Stop page scrolling / browser shortcuts for gameplay keys (§16).
  return (
    matchesAny(KEYS.JUMP, code) ||
    matchesAny(KEYS.LEFT, code) ||
    matchesAny(KEYS.RIGHT, code) ||
    code === 'Space'
  );
}

export function createInput({ game, onManualPause }) {
  const held = { left: false, right: false, jump: false, attack: false, special: false };
  // Jump is edge-triggered PER PHYSICAL SOURCE (SPEC §37/§38): holding one
  // jump key (Space) while pressing another (ArrowUp) — or the touch Jump
  // button — is a genuine NEW press. This is what lets a player hold Jump
  // through the first jump and still trigger Sara's second jump at the apex;
  // a single source can never re-fire while already held.
  const jumpSources = new Set();
  const counts = {
    jump: 0,
    attack: 0,
    select: 0,
    pause: 0,
    specialTap: 0,
    specialHold: 0,
  };
  const events = [];
  const touches = new Map();      // touch identifier -> button id (§14)
  const pressStart = new Map();   // source key ('touch'/'KeyK') -> timestamp
  const elById = new Map();

  function enabled() {
    return !game.paused;          // gameplay input disabled during pause (§8.1)
  }

  function press(btn) {
    if (btn.hold && btn.hold !== 'jump') held[btn.hold] = true;
    if (btn.hold === 'jump') {
      jumpSources.add('touch');
      held.jump = true;
    }
    if (!btn.edge) return;
    if (btn.edge === 'jump') counts.jump += 1;
    if (btn.edge === 'attack') counts.attack += 1;
    if (btn.edge === 'select') counts.select += 1;
    if (btn.edge === 'pause') counts.pause += 1;
    if (btn.timed) pressStart.set('touch', performance.now());
    events.push({ type: btn.edge, select: btn.select });
  }

  function release(btn, source) {
    if (btn.hold && btn.hold !== 'jump') held[btn.hold] = false;
    if (btn.hold === 'jump') {
      jumpSources.delete(source === 'touch' ? 'touch' : source);
      held.jump = jumpSources.size > 0;
    }
    if (btn.timed) {
      const t0 = pressStart.get(source);
      pressStart.delete(source);
      if (t0 != null) {
        const heldMs = performance.now() - t0;
        if (heldMs >= SPECIAL_HOLD_MS) {
          counts.specialHold += 1;
          events.push({ type: 'special-hold', heldMs });
        } else {
          counts.specialTap += 1;
          events.push({ type: 'special-tap', heldMs });
        }
      }
    }
  }

  // ---- keyboard (desktop, §16) -------------------------------------------
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (preventKeyDefault(e.code)) e.preventDefault();
    if (!enabled()) return;                     // §8.1: gameplay input disabled
    if (matchesAny(KEYS.LEFT, e.code) && !held.left) held.left = true;
    else if (matchesAny(KEYS.RIGHT, e.code) && !held.right) held.right = true;
    else if (matchesAny(KEYS.JUMP, e.code)) {
      // New physical source => a real new jump press, even while another
      // jump key is held (§37/§38). e.repeat already filtered above.
      const isNewSource = !jumpSources.has(e.code);
      jumpSources.add(e.code);
      held.jump = true;
      if (isNewSource) {
        counts.jump += 1;
        events.push({ type: 'jump' });
      }
    } else if (matchesAny(KEYS.ATTACK, e.code) && !held.attack) {
      held.attack = true;
      counts.attack += 1;
      events.push({ type: 'attack' });
    } else if (matchesAny(KEYS.SPECIAL, e.code) && !held.special) {
      held.special = true;
      pressStart.set(e.code, performance.now());
      events.push({ type: 'special', key: e.code });
    } else if (matchesAny(KEYS.SELECT_SARA, e.code)) {
      counts.select += 1;
      events.push({ type: 'select', select: 'sara' });
    } else if (matchesAny(KEYS.SELECT_RAHA, e.code)) {
      counts.select += 1;
      events.push({ type: 'select', select: 'raha' });
    } else if (matchesAny(KEYS.SELECT_ARAM, e.code)) {
      counts.select += 1;
      events.push({ type: 'select', select: 'aram' });
    }
  });

  window.addEventListener('keyup', (e) => {
    // Releases ALWAYS process — a key held across a pause must not stick.
    if (matchesAny(KEYS.LEFT, e.code)) held.left = false;
    else if (matchesAny(KEYS.RIGHT, e.code)) held.right = false;
    else if (matchesAny(KEYS.JUMP, e.code)) {
      jumpSources.delete(e.code);
      held.jump = jumpSources.size > 0;
    }
    else if (matchesAny(KEYS.ATTACK, e.code)) held.attack = false;
    else if (matchesAny(KEYS.SPECIAL, e.code)) release(
      TOUCH_BUTTONS.find((b) => b.id === 'btn-special'),
      e.code
    );
  });

  // ---- touch buttons (§14, §15) ------------------------------------------
  function bindButton(btn) {
    const el = document.getElementById(btn.id);
    if (!el) return;
    elById.set(btn.id, el);

    const onTouchStart = (e) => {
      e.preventDefault();                       // passive:false required (§14)
      for (let i = 0; i < e.changedTouches.length; i += 1) {
        touches.set(e.changedTouches[i].identifier, btn.id);
      }
      if (enabled()) press(btn);
      if (btn.edge === 'pause') onManualPause();
      el.classList.add('active');
    };

    const onTouchEnd = (e) => {
      e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i += 1) {
        touches.delete(e.changedTouches[i].identifier);
      }
      let stillHeld = false;
      touches.forEach((id) => {
        if (id === btn.id) stillHeld = true;
      });
      if (!stillHeld) {
        release(btn, 'touch');
        el.classList.remove('active');
      }
    };

    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: false });
    el.addEventListener('touchcancel', onTouchEnd, { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  TOUCH_BUTTONS.forEach(bindButton);

  // ---- queries ------------------------------------------------------------
  function activeTouchCount() {
    return touches.size;
  }

  function snapshot() {
    return {
      enabled: enabled(),
      left: held.left,
      right: held.right,
      jump: held.jump,
      attack: held.attack,
      special: held.special,
      activeTouches: touches.size,
      jumpCount: counts.jump,
      attackCount: counts.attack,
      selectCount: counts.select,
      pauseCount: counts.pause,
      specialTapCount: counts.specialTap,
      specialHoldCount: counts.specialHold,
      pendingEvents: events.length,
    };
  }

  // Gameplay consumes edge events through drainEvents (kept bounded).
  function drainEvents() {
    const drained = events.slice();
    events.length = 0;
    return drained;
  }

  // Live held-state view for the player controller (read-only by contract).
  function heldState() {
    return held;
  }

  return { snapshot, drainEvents, heldState, activeTouchCount };
}
