// Shadows of the Moon — procedural renderer (SPEC §7, §55, §78).
// Canvas 2D only. Logical 1280x720, strict 16:9 contain scaling — X and Y
// are NEVER stretched independently; letterboxing is allowed. Touch
// coordinates map through the SAME transform as rendering (§7):
// logical = (client - renderOffset) / scale. effectiveDPR = min(dpr, 2);
// imageSmoothingEnabled = false, re-asserted after every backing-store
// resize. shadowBlur is reserved for enemy eyes only (§30, §78) — this
// module never uses it. NO gameplay logic in rendering (§70). The Phase 1
// scene is an intentional placeholder: sky, deterministic twinkling stars,
// ground strip, and title. Parallax layers, moon and castle arrive in
// Phase 4; the active character in Phase 3.
import {
  LOGICAL_W,
  LOGICAL_H,
  MAX_DPR,
  SKY_TOP,
  SKY_MID,
  SKY_LOW,
  GROUND_FILL,
  GROUND_EDGE,
  TEXT_MAIN,
  TEXT_DIM,
  STAR_TONE,
} from './constants.js';

// Deterministic starfield: pure authored formula, no randomness (§72).
const STARS = [];
for (let i = 0; i < 90; i += 1) {
  STARS.push({
    x: (i * 173 + 59) % LOGICAL_W,
    y: ((i * 97 + 29) % 430) + 16,
    s: i % 5 === 0 ? 2.4 : 1.4,
    tw: i * 1.7,
  });
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d', { alpha: false });
  const view = { scale: 1, dpr: 1, offsetX: 0, offsetY: 0 };
  let skyGradient = null;

  function resize() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const contain = Math.min(vw / LOGICAL_W, vh / LOGICAL_H); // §7 contain
    view.dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    canvas.style.width = Math.floor(LOGICAL_W * contain) + 'px';
    canvas.style.height = Math.floor(LOGICAL_H * contain) + 'px';
    canvas.width = Math.round(LOGICAL_W * view.dpr);
    canvas.height = Math.round(LOGICAL_H * view.dpr);
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;    // §7 — resets on backing-store change
    const rect = canvas.getBoundingClientRect();
    view.scale = rect.width / LOGICAL_W; // effective scale incl. rounding
    view.offsetX = rect.left;
    view.offsetY = rect.top;
    skyGradient = null;                   // rebuild lazily next render
  }

  // §7: touch coordinates mapped with the SAME transform as rendering.
  function toLogical(clientX, clientY) {
    return {
      x: (clientX - view.offsetX) / view.scale,
      y: (clientY - view.offsetY) / view.scale,
    };
  }

  function drawSky() {
    if (!skyGradient) {
      skyGradient = ctx.createLinearGradient(0, 0, 0, LOGICAL_H);
      skyGradient.addColorStop(0, SKY_TOP);
      skyGradient.addColorStop(0.62, SKY_MID);
      skyGradient.addColorStop(1, SKY_LOW);
    }
    ctx.fillStyle = skyGradient;
    ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
  }

  function drawStars(gameTime) {
    ctx.fillStyle = STAR_TONE;
    for (let i = 0; i < STARS.length; i += 1) {
      const s = STARS[i];
      const alpha = 0.3 + 0.6 * Math.abs(Math.sin(gameTime * 0.9 + s.tw));
      ctx.globalAlpha = alpha;
      ctx.fillRect(s.x, s.y, s.s, s.s);
    }
    ctx.globalAlpha = 1;
  }

  function drawGround() {
    ctx.fillStyle = GROUND_FILL;
    ctx.fillRect(0, LOGICAL_H - 64, LOGICAL_W, 64);
    ctx.fillStyle = GROUND_EDGE;
    ctx.fillRect(0, LOGICAL_H - 64, LOGICAL_W, 3);
  }

  function drawTitle() {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = TEXT_MAIN;
    ctx.font = '700 46px system-ui, sans-serif';
    ctx.fillText('SHADOWS OF THE MOON', LOGICAL_W / 2, 296);
    ctx.fillStyle = TEXT_DIM;
    ctx.font = '400 16px system-ui, sans-serif';
    ctx.fillText('The moon is stolen. Three warriors walk the night.', LOGICAL_W / 2, 334);
  }

  function render(game) {
    drawSky();
    drawStars(game.gameTime);
    drawGround();
    drawTitle();
  }

  resize();
  return { resize, render, toLogical, view };
}
