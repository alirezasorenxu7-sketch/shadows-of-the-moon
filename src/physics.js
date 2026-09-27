// Shadows of the Moon — deterministic physics (SPEC §36, §39).
// Fixed 60 Hz stepping is owned by the loop; this module only INTEGRATES and
// RESOLVES one step for an AABB entity against solid AABB platforms:
//
//   Pass 1 Horizontal: integrate X, resolve overlaps, correct X, set vx = 0
//                      when blocked.
//   Pass 2 Vertical:   integrate Y, resolve overlaps, correct Y, set vy = 0,
//                      set onGround on landing.
//
//   Landing rule (§39):  vy > 0 AND prevY + h <= platform.y + 2
//   Ceiling rule (§39):  vy < 0 AND prevY >= platform.y + platform.h - 2
//
// Purity (§39): this module never touches the DOM, never renders, never
// accesses the network or localStorage, never triggers audio, and never
// mutates anything except the entity and the platform list explicitly
// passed in.
//
// Vertical integration is EXACT constant-acceleration kinematics: vy is
// advanced by `ay` first, then y += (vyPrev + vy) / 2 * dt — which equals
// the analytic y(t) = y + v·dt + ½·a·dt² at every step boundary. The
// authored jump velocities therefore produce the SPEC's ideal single-jump
// heights (exactly v²/2g: Sara 133 1/3 px, Raha 99 1/6 px, Aram 111 1/24
// px) and Sara's double-jump ceiling of 266 2/3 px clears the 260 px
// acceptance floor (§38) with the intended margin. Plain vy-then-y or
// y-then-vy Euler orders lose or gain v·dt/2 = 6 2/3 px per jump and break
// that floor.
import { MAX_FALL } from './constants.js';

export function overlapsX(a, p) {
  return a.x < p.x + p.w && a.x + a.w > p.x;
}

export function overlapsY(a, p) {
  return a.y < p.y + p.h && a.y + a.h > p.y;
}

// One deterministic step. Mutates entity {x, y, w, h, vx, vy, onGround}.
// `ay` is this step's total vertical acceleration (gravity + any active
// variable-jump cut); MAX_FALL clamps the post-acceleration velocity.
export function moveAndCollide(entity, platforms, dt, ay) {
  // ---- Pass 1: horizontal -------------------------------------------------
  entity.x += entity.vx * dt;
  let blockedX = false;
  for (let i = 0; i < platforms.length; i += 1) {
    const p = platforms[i];
    if (!overlapsX(entity, p) || !overlapsY(entity, p)) continue;
    if (entity.vx > 0) {
      entity.x = p.x - entity.w;         // blocked from the left face
      entity.vx = 0;
      blockedX = true;
    } else if (entity.vx < 0) {
      entity.x = p.x + p.w;              // blocked from the right face
      entity.vx = 0;
      blockedX = true;
    }
    // vx === 0 with overlap cannot arise from normal two-pass motion;
    // the vertical pass owns that correction.
  }
  const horizontalBlocked = blockedX;

  // ---- Pass 2: vertical (exact kinematics, see header) ---------------------
  const prevY = entity.y;
  const vyPrev = entity.vy;
  entity.vy += ay * dt;
  if (entity.vy > MAX_FALL) entity.vy = MAX_FALL;
  entity.y += ((vyPrev + entity.vy) / 2) * dt;
  entity.onGround = false;
  for (let i = 0; i < platforms.length; i += 1) {
    const p = platforms[i];
    if (!overlapsX(entity, p) || !overlapsY(entity, p)) continue;
    const cameFromAbove = prevY + entity.h <= p.y + 2;          // §39 landing
    const cameFromBelow = prevY >= p.y + p.h - 2;               // §39 ceiling
    if (entity.vy > 0 && cameFromAbove) {
      entity.y = p.y - entity.h;
      entity.vy = 0;
      entity.onGround = true;
    } else if (entity.vy < 0 && cameFromBelow) {
      entity.y = p.y + p.h;
      entity.vy = 0;
    } else if (entity.vy > 0) {
      // Safety fallback (unreachable in normal two-pass motion): resolve
      // downward movement upward so the entity can never sink into a floor.
      entity.y = p.y - entity.h;
      entity.vy = 0;
      entity.onGround = true;
    } else if (entity.vy < 0) {
      // Safety fallback: resolve upward movement downward.
      entity.y = p.y + p.h;
      entity.vy = 0;
    }
  }
  return { horizontalBlocked, landed: entity.onGround };
}
