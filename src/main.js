// Shadows of the Moon — entry point (SPEC §69).
// Phase 0 scaffold: imports the full module graph so any syntax error
// fails fast. Gameplay wiring (game object, loop, input, rendering)
// arrives with Phase 1+.
import './constants.js';
import './input.js';
import './physics.js';
import './ai.js';
import './level.js';
import './render.js';
import './loop.js';
import './entities/player.js';
import './entities/enemy.js';
import './entities/projectile.js';
import './entities/particle.js';
import './entities/coin.js';

// Test hook only (SPEC §74): production behavior never depends on it.
window.__SOM_BOOTED__ = true;
