// Shadows of the Moon — entry point (SPEC §69, §8, §73, §74).
// Creates the single authoritative `game` object (§71), wires the loop,
// input, renderer, pause semantics (portrait / visibility / manual — one
// shared resume rule, NEVER automatic), and the DOM overlays. Phase 2 adds
// the player controller: physics, jumping, collision, and the death
// foundation (§36–§39, §43). Phase 4 adds the camera (§53): exponential
// follow with look-ahead and horizontal clamping, updated inside the fixed
// sim step at the player-domain rate — “Camera gameplay update: 1.0” (§10),
// so the view never slows during Slow-motion. Phase 5 switches the world
// model from zones to the 15-chapter / 3-act structure (amended §50, §46):
// game.currentChapter / currentAct derive from the player's X each step.
// Phase 6 adds the enemy system (§27–§35): the Patroller roster, base AI,
// player-enemy collision with stomp priority, and the run-state authorities
// (defeatedEnemyIds §28, damageTaken §61, combo streak §60); the camera and
// renderer run at the amended global ZOOM 1.25 (§7/§53).
// Phase 7 owns the ROSTER + ABILITY runtime (§15–§26, §50, §54, §57, §63):
// per-character cooldowns and abilities (knife/dash, shockwave/slam,
// magic/slow-motion/shield), character switching with the §20 HP-ratio
// formula and §20.1 switch combos, the progressive unlock chain
// (Sara → Raha at 1-3 → Aram at 1-5) with §20.2 non-blocking tutorials,
// projectiles, particles, §50 gate transitions (barrier dispel, time-door
// latch) through the active-solids rebuild, and the §54 screen-shake state.
// Phase 9 owns COLLECTIBLES + HUD + SCREENS + SAVE V2 (§48, §58, §62, §63,
// §65, §17): the coin/rare-coin/moon-crystal pickup system with collected-id
// authorities, the canvas HUD (§65), the title/death/victory DOM screens,
// the §47 new-run reset, the §63 auto-save triggers (chapter entry, run
// start, game-over, victory) with unlockedCharacters persistence, the §15
// locked-selector UI, and the §17 first-gesture fullscreen attempt.
import './constants.js';
import {
  ZOOM,
  VIEW_W,
  CAMERA_FACTOR_X,
  CAMERA_FACTOR_Y,
  CAMERA_LOOKAHEAD,
  CAMERA_LOOKAHEAD_FAST,
  CAMERA_LOOKAHEAD_SPEED,
  CAMERA_BAND_TOP,
  CAMERA_BAND_BOTTOM,
  CAMERA_REST_GROUND_SCREEN_Y,
  CHARACTER_COLORS,
  UNLOCK_CHAPTERS,
  TUTORIAL_DURATION,
  GATE_OPEN_RANGE,
  LEVEL_COMPLETION_SCORE,
  SHAKE_MODES,
  ADAPTIVE_DEATH_THRESHOLD,
} from './constants.js';
import { createInput } from './input.js';
import './physics.js';
import './ai.js';
import { LEVEL_DATA, buildLevel } from './level.js';
import { createRenderer } from './render.js';
import { createLoop } from './loop.js';
import { createPlayer, updatePlayer, switchCharacter, playerSnapshot, resetPlayer, respawnPlayer } from './entities/player.js';
import { createEnemies, updateEnemies, damageEnemy, enemiesSnapshot, resetChapterEnemies } from './entities/enemy.js';
import { updateProjectiles, projectilesSnapshot } from './entities/projectile.js';
import { updateParticles, spawnBurst, particlesSnapshot } from './entities/particle.js';
import { updateAmbient, resetAmbient } from './ambient.js';
import { createCollectibles, updateCollectibles, collectiblesSnapshot } from './entities/coin.js';
import { readSave, writeSave, computeRank, seedUnlockedCharacters } from './save.js';
import {
  createStoryState, updateStory, showSwitchQuip, showUnlockCinematic,
} from './story.js';

const canvas = document.getElementById('game');

// Single global runtime state object (SPEC §69, §71).
const game = {
  gameTime: 0,
  score: 0,
  kills: 0,
  currentRunCoins: 0,
  currentChapter: '1-1',   // chapter id "A-C" derived from player X (§46)
  currentAct: 1,           // act 1..3 (zones renamed acts, amended §50)
  slowMoActive: false,     // §25.1: enemy systems run at 0.35 while active
  slowMoT: 0,              // §25.1 remaining slow-motion seconds (player domain)
  paused: false,
  pauseReasons: new Set(),
  activeCheckpoint: null,   // §44/§45 (Phase 11): {id, chapterId, x, y}
  lastDeath: null,          // set on the first death of the run (§43)
  // ---- §49 adaptive difficulty (Phase 11) ----
  // actDeathStreak counts CONSECUTIVE deaths in the CURRENT act (reset on
  // act change); adaptiveActs is the per-act LATCH — once an act hits the
  // threshold its enemies move at 0.8x for the remainder of the run.
  actDeathStreak: 0,
  adaptiveActs: new Set(),
  respawnCount: 0,          // §74 instrumentation: §45 respawns this run
  // ---- §67/§68 environmental storytelling (Phase 11) ----
  story: createStoryState(),
  camera: { x: 0, y: 0 },   // view center-top anchor, world px (§53, Phase 4)
  // ---- Phase 6 run-state authorities ----
  defeatedEnemyIds: new Set(),  // §28: kill score uniqueness; reset only on new run
  damageTaken: 0,               // §61: actual HP points lost (rank input, §62)
  killStreak: 0,                // §60: consecutive kills (combo activation)
  comboTimer: 0,                // §60: combo window countdown, seconds
  // ---- Phase 7 roster/ability run state (§71 global state rule) ----
  // §20 progressive unlock — SEEDED from save v2 at boot (§63) and NEVER
  // reset by a new run (§20/§47): Sara starts unlocked; Raha joins at
  // chapter 1-3, Aram at chapter 1-5.
  unlockedCharacters: ['sara'],
  heartCount: 0,                // §19 global heart containers (assembled)
  heartFragments: 0,            // §19/§50 mini-boss fragments (3 = 1 container)
  projectiles: [],              // §21 knives + magic shots (player domain)
  particles: [],                // §57/§78 capped feedback particles
  rings: [],                    // §24 shockwave/slam impact rings (presentation)
  brokenPlatformIds: new Set(), // §24/§50 broken breakables
  solidsDirty: false,           // rebuild the active collision view when set
  shake: null,                  // §54 {mag, t, T} while a shake is live
  shakeMode: 'full',            // §54 session setting: full|reduced|off
  damageFlashT: 0,              // §57 red full-screen flash remaining, s
  lastAbilityUse: null,         // §20.1 switch-combo pairing stamp
  comboBoost: null,             // §20.1 armed incoming-ability modifier
  lastCombo: null,              // §20.1 consumed combo record (metrics)
  tutorial: null,               // §20.2 {key, text, until} non-blocking hint
  // ---- Phase 9 collectible/save/screen run state ----
  screen: 'title',              // §65: title → playing → dead | victory
  collectedCoinIds: new Set(),  // §48 run collections (common + rare coins)
  collectedCrystalIds: new Set(), // §48 run collections (moon crystals)
  collectedHealthIds: new Set(),  // §19/§48 (health pickups land Phase 13)
  collectedHeartIds: new Set(),   // §19/§48 (heart containers land Phase 13)
  runCompletedChapters: [],     // §63: chapters completed in order this run
  runFurthestChapterId: '1-1',  // §63: furthest chapter reached this run
  runChapterCheckpoints: {},    // §63/§44: chapter-start records per reached chapter
  saveWrites: 0,                // §74 test instrumentation: §63 write count
  lastRank: null,               // §62: game-over / victory rank of the run
  fullscreenAttempted: false,   // §17/§74: first-gesture attempt flag
};

// §63: seed the unlock chain from the persisted save (validated + canonical
// order; a fresh/corrupt save keeps ["sara"]). NEVER reset afterwards.
const savedGame = readSave();
if (savedGame) game.unlockedCharacters = seedUnlockedCharacters(savedGame);

// §53 camera follow — runs once per fixed sim step (dt = FIXED_DT, player
// domain): framerate-independent exponential smoothing toward the target,
// look-ahead in the facing direction (+20px above 300px/s), horizontal clamp
// so the view never leaves the level. Phase 6: the camera runs at the
// amended global ZOOM 1.25 (§7/§53) — the visible gameplay window is
// VIEW_W x VIEW_H world units, screen-space bands convert through /ZOOM.
// Vertical policy: comfort deadzone [BAND_TOP, BAND_BOTTOM] in screen space
// while airborne; grounded play re-anchors the chapter ground at
// CAMERA_REST_GROUND_SCREEN_Y — normal jumps keep the view still, deep
// falls (pits) and tall climbs move it.
function updateCamera(dt) {
  const c = game.camera;
  const dir = player.facing === 'left' ? -1 : 1;
  let look = CAMERA_LOOKAHEAD;
  if (Math.abs(player.vx) > CAMERA_LOOKAHEAD_SPEED) look += CAMERA_LOOKAHEAD_FAST;
  const targetX = player.x + player.w / 2 + look * dir - VIEW_W / 2;

  let targetY;
  if (player.onGround) {
    const chapter = level.chapterAt(player.x);
    targetY = chapter.groundY - CAMERA_REST_GROUND_SCREEN_Y / ZOOM;
  } else {
    const screenY = (player.y + player.h / 2 - c.y) * ZOOM;   // §7 zoom space
    if (screenY < CAMERA_BAND_TOP) targetY = player.y + player.h / 2 - CAMERA_BAND_TOP / ZOOM;
    else if (screenY > CAMERA_BAND_BOTTOM) targetY = player.y + player.h / 2 - CAMERA_BAND_BOTTOM / ZOOM;
    else targetY = c.y;                               // inside the comfort band: hold
  }

  c.x += (targetX - c.x) * (1 - Math.exp(-CAMERA_FACTOR_X * dt));
  c.y += (targetY - c.y) * (1 - Math.exp(-CAMERA_FACTOR_Y * dt));

  const maxX = level.worldWidth - VIEW_W;             // §53 amended: 0..LEVEL_W-1024
  if (c.x < 0) c.x = 0;
  else if (c.x > maxX) c.x = maxX;
}

// §53 companion: place the camera DIRECTLY at its grounded target (no
// easing across the world) — frames the title backdrop at boot and every
// new-run reset (§47). Phase 11's checkpoint respawn reuses this snap.
function snapCamera() {
  const c = game.camera;
  let targetX = player.x + player.w / 2 + CAMERA_LOOKAHEAD - VIEW_W / 2;
  const chapter = level.chapterAt(player.x);
  const targetY = chapter.groundY - CAMERA_REST_GROUND_SCREEN_Y / ZOOM;
  const maxX = level.worldWidth - VIEW_W;
  if (targetX < 0) targetX = 0;
  else if (targetX > maxX) targetX = maxX;
  c.x = targetX;
  c.y = targetY;
}

const level = buildLevel(LEVEL_DATA);
const player = createPlayer(level);   // a new run starts with Sara (§47)
const enemies = createEnemies(level, game.defeatedEnemyIds);   // §28/§6
const collectibles = createCollectibles(level, game);          // §48/§58 (Phase 9)
const renderer = createRenderer(canvas);
const input = createInput({
  game,
  onManualPause: () => {
    // §8.1 manual pause exists only during gameplay — the title/death/
    // victory screens own their own pause reason and resume buttons.
    if (game.screen === 'playing') loop.enterPause('manual');
  },
});

// §20/§20.2 progressive unlock chain, resolved by chapter ORDER (entering
// the unlock chapter or any later one unlocks the character — idempotent,
// and re-entering an earlier chapter can never re-lock). The unlock burst
// (§15) + non-blocking tutorial (§20.2) fire exactly once per character.
const CHAPTER_INDEX = new Map();
for (let i = 0; i < level.chapters.length; i += 1) CHAPTER_INDEX.set(level.chapters[i].id, i);
const UNLOCK_ORDER = [['raha', UNLOCK_CHAPTERS.raha], ['aram', UNLOCK_CHAPTERS.aram]];
const TUTORIAL_TEXT = {
  sara: 'A / D move · Space jump (twice for double jump) · K dash',
  raha: 'RAHA — J shockwave · hold K airborne to slam',
  aram: 'ARAM — J magic · tap K slow-motion · hold K shield',
};
function showTutorial(key) {
  game.tutorial = { key, text: TUTORIAL_TEXT[key], until: game.gameTime + TUTORIAL_DURATION };
}
function unlockCharacter(key) {
  if (game.unlockedCharacters.indexOf(key) !== -1) return;
  game.unlockedCharacters.push(key);
  spawnBurst(game, player.x + player.w / 2, player.y + player.h / 2,
             CHARACTER_COLORS[key], 16);          // §15 unlock burst
  showTutorial(key);                             // §20.2 non-blocking hint
  showUnlockCinematic(game, key);                // §67 unlock story event
}
function checkUnlocks() {
  const here = CHAPTER_INDEX.get(game.currentChapter);
  if (here == null) return;
  for (let i = 0; i < UNLOCK_ORDER.length; i += 1) {
    const key = UNLOCK_ORDER[i][0];
    const at = CHAPTER_INDEX.get(UNLOCK_ORDER[i][1]);
    if (at != null && here >= at) unlockCharacter(key);
  }
}

// §44 CHECKPOINT ACTIVATION (Phase 11). "Newest checkpoint is active
// respawn": every activation — chapter start (auto, on ANY chapter entry)
// or a crossed mid-chapter rectangle — replaces the active respawn. The
// record carries its chapter so §45's reset scope is exact.
function activateCheckpoint(chapter, cp) {
  game.activeCheckpoint = {
    id: cp.id,
    chapterId: chapter.id,
    x: cp.respawn.x,
    y: cp.respawn.y,
  };
}

// §44 mid-chapter checkpoints: crossing the authored trigger rectangle
// activates (any direction; run-local, never persisted — §63 no-write).
function checkMidCheckpoints(chapter) {
  const mids = chapter.midCheckpoints;
  if (!mids || !mids.length) return;
  for (let i = 0; i < mids.length; i += 1) {
    const t = mids[i].trigger;
    const overlap = player.x < t.x + t.w && player.x + player.w > t.x
      && player.y < t.y + t.h && player.y + player.h > t.y;
    if (overlap) {
      if (!game.activeCheckpoint || game.activeCheckpoint.id !== mids[i].id) {
        activateCheckpoint(chapter, mids[i]);
        spawnBurst(game, t.x + t.w / 2, 240, '#cfd8ff', 12);   // soft beacon
      }
    }
  }
}

// §45 CHECKPOINT RESPAWN — the world/system half (player half: player.js
// respawnPlayer). Reset scope = the RESPAWN chapter ONLY: its live enemies
// re-create from authored data (defeated stay omitted, §28), its broken
// breakables restore, its gates re-form (chapter-local transient state),
// while every other chapter's world state is untouched. Projectiles,
// particles, and rings clear (transient). Run progress (score, kills,
// coins, collections, fragments, combo, completed chapters) is PRESERVED.
// No localStorage write, no screen change (§45 Do-NOT list).
function respawnAtCheckpoint() {
  const cp = game.activeCheckpoint;
  const chapter = level.chapters[CHAPTER_INDEX.get(cp.chapterId)] || level.chapters[0];

  // §49: this death counts toward the CURRENT act's consecutive streak,
  // and the latch activates adaptive movement for that act at the threshold.
  game.actDeathStreak += 1;
  if (game.actDeathStreak >= ADAPTIVE_DEATH_THRESHOLD) {
    game.adaptiveActs.add(game.currentAct);
  }

  game.respawnCount += 1;
  respawnPlayer(game, player, cp.x, cp.y);

  // §45 reset list: the respawn chapter's transient combat/world state.
  resetChapterEnemies(enemies, level, chapter, game.defeatedEnemyIds);
  game.projectiles.length = 0;
  game.particles.length = 0;
  game.rings.length = 0;
  let worldDirty = false;
  // Breakables in the respawn chapter restore (§45 Reset: breakables).
  for (let i = 0; i < chapter.platforms.length; i += 1) {
    const p = chapter.platforms[i];
    if (p.breakable && p.id && game.brokenPlatformIds.delete(p.id)) worldDirty = true;
  }
  // Gates in the respawn chapter re-form (chapter-local transient state:
  // dispelled barriers re-activate, opened time doors re-close — both are
  // optional-loot routes, never required, so no soft-lock is possible).
  for (let i = 0; i < level.gates.length; i += 1) {
    const g = level.gates[i];
    if (level.chapterAt(g.x + g.w / 2) === chapter
        && g.state !== (g.kind === 'magicBarrier' ? 'active' : 'closed')) {
      g.state = g.kind === 'magicBarrier' ? 'active' : 'closed';
      worldDirty = true;
    }
  }
  if (worldDirty) level.rebuildSolids(game.brokenPlatformIds);

  // §45: temporary effects end with the fresh standing state (slow-motion
  // is a global time-domain effect — it never survives a respawn).
  game.slowMoActive = false;
  game.slowMoT = 0;
  game.damageFlashT = 0;

  snapCamera();                        // §53: no easing across the world
  updateSelectorUI(true);
}

// §63 auto-save triggers 1 + 3 (entering a new chapter / completing the
// previous one — ONE complete write serves both halves of the event). Only
// FORWARD transitions count: re-entering an earlier chapter never re-writes
// progress. Each chapter passed completes in order (§63); the reached
// chapter's authored START checkpoint is recorded as save data (§44/§63 —
// gameplay activation/respawn arrive with Phase 11).
function handleChapterTransition(prevId, next) {
  const prevIdx = CHAPTER_INDEX.get(prevId);
  const nextIdx = CHAPTER_INDEX.get(next.id);
  if (prevIdx == null || nextIdx == null || nextIdx <= prevIdx) return;
  for (let i = prevIdx; i < nextIdx; i += 1) {
    const doneId = level.chapters[i].id;
    if (game.runCompletedChapters.indexOf(doneId) === -1) {
      game.runCompletedChapters.push(doneId);
    }
  }
  game.runFurthestChapterId = next.id;
  game.runChapterCheckpoints[next.id] = {
    checkpointId: next.checkpoint.id,
    respawnX: next.checkpoint.respawn.x,
    respawnY: next.checkpoint.respawn.y,
  };
  writeSave(game, 'chapter');
}

// §50 time-locked doors: open ONLY while Aram's slow-motion is active and
// the player is within GATE_OPEN_RANGE of the door (then latched open — a
// re-closing door could clip the player, so an opened door never re-locks).
function checkTimeDoors() {
  if (!game.slowMoActive) return;
  for (let i = 0; i < level.gates.length; i += 1) {
    const g = level.gates[i];
    if (g.kind !== 'timeDoor' || g.state !== 'closed') continue;
    const dx = (player.x + player.w / 2) - (g.x + g.w / 2);
    const dy = (player.y + player.h / 2) - (g.y + g.h / 2);
    if (Math.abs(dx) <= GATE_OPEN_RANGE && Math.abs(dy) <= GATE_OPEN_RANGE) {
      g.state = 'open';
      game.solidsDirty = true;
      spawnBurst(game, g.x + g.w / 2, g.y + g.h / 2, '#c77dff', 12);
    }
  }
}

// §47 NEW RUN: run-scoped state resets to a clean baseline. localStorage
// persists (§63) and unlockedCharacters are NEVER reset (§20). Called by
// Start Journey, Try Again, and Travel Alike.
function startRun() {
  game.score = 0;
  game.kills = 0;
  game.currentRunCoins = 0;
  game.heartCount = 0;                 // §19: containers reset on a new run
  game.heartFragments = 0;
  game.collectedCoinIds = new Set();   // §48: new run clears collections
  game.collectedCrystalIds = new Set();
  game.collectedHealthIds = new Set();
  game.collectedHeartIds = new Set();
  game.defeatedEnemyIds = new Set();   // §28
  game.killStreak = 0;                 // §60
  game.comboTimer = 0;
  game.activeCheckpoint = null;
  game.lastDeath = null;
  game.actDeathStreak = 0;             // §49: adaptive resets on a new run
  game.adaptiveActs = new Set();
  game.respawnCount = 0;
  game.story = createStoryState();     // §67: flashbacks/NPCs re-arm per run
  game.lastRank = null;
  game.runCompletedChapters = [];      // §63: progress is run-scoped
  game.runFurthestChapterId = '1-1';
  game.runChapterCheckpoints = {};
  game.slowMoActive = false;           // §25.1 temporary effects end
  game.slowMoT = 0;
  game.shake = null;                   // §54
  game.damageFlashT = 0;               // §57 Phase 10
  resetAmbient();                      // §56 Phase 10: fresh ambience
  game.tutorial = null;                // §20.2 (re-shown below)
  game.comboBoost = null;              // §20.1
  game.lastCombo = null;
  game.projectiles.length = 0;
  game.particles.length = 0;
  game.rings.length = 0;
  game.brokenPlatformIds = new Set();  // §24/§50 breakables restore
  level.rebuildSolids(game.brokenPlatformIds);
  game.solidsDirty = false;
  resetPlayer(game, player, level);    // §47: Sara, spawn, full HP
  enemies.length = 0;                  // §28: defeated filter (empty set)
  const freshEnemies = createEnemies(level, game.defeatedEnemyIds);
  for (let i = 0; i < freshEnemies.length; i += 1) enemies.push(freshEnemies[i]);
  collectibles.length = 0;             // §48: collected filter (empty set)
  const freshCollectibles = createCollectibles(level, game);
  for (let i = 0; i < freshCollectibles.length; i += 1) collectibles.push(freshCollectibles[i]);
  game.currentChapter = '1-1';
  game.currentAct = 1;
  // §63: the run's first reached chapter records its chapter-start
  // checkpoint (the run START counts as entering 1-1).
  const startChapter = level.chapters[CHAPTER_INDEX.get(game.runFurthestChapterId) || 0];
  game.runChapterCheckpoints[startChapter.id] = {
    checkpointId: startChapter.checkpoint.id,
    respawnX: startChapter.checkpoint.respawn.x,
    respawnY: startChapter.checkpoint.respawn.y,
  };
  // §44: entering 1-1 auto-activates its chapter-start checkpoint — a
  // checkpoint is live from the first step of every run.
  activateCheckpoint(startChapter, startChapter.checkpoint);
  snapCamera();                        // §53: no easing across the world
  showTutorial('sara');                // §20.2: game-start hints
  writeSave(game, 'chapter');          // §63 trigger 1: the run enters 1-1
  updateSelectorUI(true);
}

// §65 death screen + §63 trigger 4. Final death flow (§43/§79.12): the
// checkpoint respawn half of the death system arrives with Phase 11 — in
// Phase 9 every death is final and shows the screen.
function gameOver() {
  if (game.screen !== 'playing') return;
  game.screen = 'dead';
  game.damageFlashT = 0;               // §57: no flash over the death screen
  game.lastRank = computeRank(game.score, game.damageTaken);   // §62 game-over rank
  writeSave(game, 'gameover');         // §63 trigger 4: banks run coins + rank
  loop.enterPause('screen');
  populateStats('death-stats');
  updateOverlays();
  updateSelectorUI(true);
}

// §58/§62/§65 victory flow: completion bonus FIRST, then rank, then the
// §63 trigger-4 save. The ORGANIC trigger is the §52 moon gate after the
// Queen of Light fight (Phase 12, §79.18); Phase 9 exposes the same path
// to the test harness (§73 forceVictory).
function completeLevel() {
  if (game.screen !== 'playing' || player.dead) return false;
  game.score += LEVEL_COMPLETION_SCORE;        // §58: level completion, once
  game.screen = 'victory';
  game.damageFlashT = 0;               // §57: clean victory frame
  game.lastRank = computeRank(game.score, game.damageTaken);   // §62 bonus first
  writeSave(game, 'victory');          // §63 trigger 4: banks run coins + rank
  loop.enterPause('screen');
  populateStats('victory-stats');
  updateOverlays();
  updateSelectorUI(true);
  return true;
}

// §65 death/victory stat block: score, kills, coins, damage taken, rank.
// Values come only from internal numeric state — no external input.
function populateStats(elId) {
  const el = document.getElementById(elId);
  if (!el) return;
  const rows = [
    ['Score', String(game.score)],
    ['Kills', String(game.kills)],
    ['Coins', String(game.currentRunCoins)],
    ['Damage Taken', String(game.damageTaken)],
    ['Rank', game.lastRank || 'C'],
  ];
  let html = '';
  for (let i = 0; i < rows.length; i += 1) {
    const isRank = rows[i][0] === 'Rank';
    html += '<div class="stat"><span>' + rows[i][0] + '</span><b'
      + (isRank ? ' class="rank-' + rows[i][1] + '"' : '')
      + '>' + rows[i][1] + '</b></div>';
  }
  el.innerHTML = html;
}

// §17 FIRST-GESTURE FULLSCREEN: the first trusted gesture that starts a
// run (Start Journey) attempts fullscreen exactly ONCE per page load —
// never retried per frame, and rejection never blocks or crashes.
function attemptFullscreenOnce() {
  if (game.fullscreenAttempted) return;
  game.fullscreenAttempted = true;
  try {
    const request = document.documentElement.requestFullscreen();
    if (request && typeof request.catch === 'function') request.catch(() => {});
  } catch (err) {
    /* legacy synchronous rejection — best-effort only (§17) */
  }
}

// §65 Start Journey / Try Again / Travel Again: start (or restart) the run.
// The gesture IS the explicit resume (§8.4) — requestResume clears the
// title/screen pause reason; if the document is hidden or the viewport is
// portrait the game stays paused under the standard rules until resumed.
function startFromScreen(attemptFullscreen) {
  if (attemptFullscreen) attemptFullscreenOnce();   // §17: first gesture only
  startRun();
  game.screen = 'playing';
  loop.requestResume();
  updateOverlays();
}

// ---- §15/§65 locked-selector UI (DOM classes change only on change) -------
const SELECTOR_IDS = {
  sara: 'btn-select-sara',
  raha: 'btn-select-raha',
  aram: 'btn-select-aram',
};
let lastSelectorSig = null;
function updateSelectorUI(force) {
  const sig = game.screen + '|' + player.character + '|' + game.unlockedCharacters.join(',');
  if (!force && sig === lastSelectorSig) return;
  lastSelectorSig = sig;
  const keys = ['sara', 'raha', 'aram'];
  for (let i = 0; i < keys.length; i += 1) {
    const el = document.getElementById(SELECTOR_IDS[keys[i]]);
    if (!el) continue;
    const locked = game.unlockedCharacters.indexOf(keys[i]) === -1;
    el.classList.toggle('locked', locked);            // §15 greyed + lock icon
    el.classList.toggle('current', !locked && player.character === keys[i]);
  }
}

const loop = createLoop({
  game,
  update: (dt) => {
    // Player domain keeps FIXED_DT even during slow-motion (§10); the
    // enemy domain consumes dt * slowMotionFactor inside updateEnemies
    // (§10/§11 — applied exactly once there).
    const events = input.drainEvents();
    // §67/§68 STORY STEP runs BEFORE the player step: while an NPC prompt
    // is up (Aram within 60 px), the attack edge is consumed as the NPC
    // interaction INSTEAD of an attack — the player never sees that edge.
    if (game.screen === 'playing') updateStory(game, player, level, events, dt);
    // §20 character switching resolves BEFORE the step: keys 1/2/3 and the
    // touch selectors emit `select` edges; switchCharacter enforces the
    // unlock gate, blocked-while rules, and the HP-ratio formula. Every
    // successful switch shows its authored quip (§67 — deterministic
    // selection, never randomized).
    for (let i = 0; i < events.length; i += 1) {
      if (events[i].type === 'select'
          && switchCharacter(game, player, events[i].select)) {
        showSwitchQuip(game, player);
      }
    }
    updatePlayer(game, player, input.heldState(), events, dt, level, enemies);
    // §43 death → §45 checkpoint respawn when a checkpoint is active (the
    // NORM — chapter entry auto-activates one, §44); the FINAL death flow
    // (§65 screen + §63 bank) is the no-active-checkpoint branch (§79.12).
    if (player.dead) {
      if (game.activeCheckpoint) respawnAtCheckpoint();
      else if (game.screen === 'playing') gameOver();
      return;
    }
    updateEnemies(game, enemies, player, dt, level);   // §27–§35 (Phase 6/8)
    updateProjectiles(game, game.projectiles, enemies, level, dt);   // §21 (Phase 7)
    updateCollectibles(game, player, collectibles);    // §48/§58 (Phase 9)
    updateParticles(game, dt);                        // §57 FX (player domain)
    // §56 Phase 10: act-driven ambient loops + weather (playing screens
    // only — the world behind the title/death/victory overlays keeps its
    // last state and simply fades out).
    if (game.screen === 'playing') updateAmbient(game, player, dt);

    // Chapter/act tracking (amended §46): currentChapter derives from the
    // player's X within the authored chapter bounds. ANY chapter change
    // (forward or backward) auto-activates the new chapter's START
    // checkpoint (§44); forward transitions additionally complete the
    // passed chapters and fire the §63 chapter-entry save (trigger 1+3 —
    // one complete write). §49: a different act entered resets the
    // consecutive-death streak.
    const chapter = level.chapterAt(player.x);
    if (chapter.id !== game.currentChapter) {
      handleChapterTransition(game.currentChapter, chapter);
      activateCheckpoint(chapter, chapter.checkpoint);   // §44 auto, any direction
      if (chapter.act !== game.currentAct) game.actDeathStreak = 0;   // §49
      game.currentChapter = chapter.id;
      game.currentAct = chapter.act;
    }
    checkMidCheckpoints(chapter);      // §44: crossed mid-chapter rects
    checkUnlocks();
    checkTimeDoors();

    // §25.1 slow-motion expiry — the time-domain effect is GLOBAL and runs
    // on the player-domain clock (it outlives switching away from Aram).
    if (game.slowMoActive) {
      game.slowMoT -= dt;
      if (game.slowMoT <= 0) { game.slowMoActive = false; game.slowMoT = 0; }
    }
    // §54 screen shake: time-bounded decay on the player-domain clock.
    if (game.shake) {
      game.shake.t -= dt;
      if (game.shake.t <= 0) game.shake = null;
    }
    // §57 Phase 10 damage flash: decays on the player-domain clock; the
    // flash renders above the world while it lasts.
    if (game.damageFlashT > 0) {
      game.damageFlashT = Math.max(0, game.damageFlashT - dt);
    }
    // §20.2 tutorial expiry (non-blocking: presentation state only).
    if (game.tutorial && game.gameTime > game.tutorial.until) game.tutorial = null;
    // §24/§50 active-solids rebuild (broken breakables, dispelled/opened gates).
    if (game.solidsDirty) {
      level.rebuildSolids(game.brokenPlatformIds);
      game.solidsDirty = false;
    }

    updateSelectorUI();               // §15/§65: locked/current slots (cached)
    updateCamera(dt);   // §10 “Camera gameplay update: 1.0” — never slowed
  },
  render: () => renderer.render(game, level, player, enemies, collectibles),
  onStateChange: updateOverlays,
  onFrame: pushMetrics,
});

// §57 Phase 10 hit-stop bridge: the DEAD transition (enemy.js) requests the
// deterministic 70 ms simulation freeze through the loop's §9 API. The
// optional-call on `game` keeps the entity modules loop-agnostic.
game.requestHitStop = () => loop.startHitStop();

const portraitMq = window.matchMedia('(orientation: portrait)');
const pauseOverlay = document.getElementById('pause-overlay');
const rotationOverlay = document.getElementById('rotation-overlay');
const touchControls = document.getElementById('touch-controls');
const startScreen = document.getElementById('start-screen');
const deathScreen = document.getElementById('death-screen');
const victoryScreen = document.getElementById('victory-screen');

// ---- overlays (§8, §65): DOM classes only change when visibility changes (§70)
let lastPauseShown = null;
let lastRotationShown = null;
let lastControlsShown = null;
let lastStartShown = null;
let lastDeathShown = null;
let lastVictoryShown = null;

function updateOverlays() {
  const portrait = portraitMq.matches;
  const playing = game.screen === 'playing';
  const showPause = game.paused && !portrait && playing;   // pause menu: gameplay only
  const showControls = !game.paused && playing;            // §15 hidden during Pause+Portrait
  const showStart = game.screen === 'title';               // §65 start screen
  const showDeath = game.screen === 'dead';                // §65 death screen
  const showVictory = game.screen === 'victory';           // §65 victory screen
  if (showPause !== lastPauseShown) {
    pauseOverlay.classList.toggle('hidden', !showPause);
    lastPauseShown = showPause;
  }
  if (portrait !== lastRotationShown) {
    rotationOverlay.classList.toggle('hidden', !portrait);
    lastRotationShown = portrait;
  }
  if (showControls !== lastControlsShown) {
    touchControls.classList.toggle('hidden', !showControls);
    lastControlsShown = showControls;
  }
  if (showStart !== lastStartShown) {
    startScreen.classList.toggle('hidden', !showStart);
    lastStartShown = showStart;
  }
  if (showDeath !== lastDeathShown) {
    deathScreen.classList.toggle('hidden', !showDeath);
    lastDeathShown = showDeath;
  }
  if (showVictory !== lastVictoryShown) {
    victoryScreen.classList.toggle('hidden', !showVictory);
    lastVictoryShown = showVictory;
  }
}

// ---- pause conditions (§8.2, §8.3) ---------------------------------------
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    loop.enterPause('visibility');
  } else {
    loop.leavePauseCondition('visibility');      // remains paused (§8.3)
    loop.resetAccumulator();                     // accumulator reset AGAIN
  }
});

function onOrientationChange() {
  if (portraitMq.matches) loop.enterPause('portrait');
  else loop.leavePauseCondition('portrait');     // remains paused (§8.2)
}

if (portraitMq.addEventListener) {
  portraitMq.addEventListener('change', onOrientationChange);
} else if (portraitMq.addListener) {
  portraitMq.addListener(onOrientationChange);   // older mobile browsers
}

// ---- explicit resume sources (§8.4): Resume button + desktop R -----------
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  // Manual pause/resume exist only during gameplay — the title/death/
  // victory screens resume through their own buttons (§65).
  if (e.code === 'Escape') {
    if (game.screen === 'playing') loop.enterPause('manual');
  } else if (e.code === 'KeyR') {
    if (game.screen === 'playing') loop.requestResume();
  }
});

const resumeButton = document.getElementById('btn-resume');
function on_resume() {
  loop.requestResume();
}
resumeButton.addEventListener('click', on_resume);
resumeButton.addEventListener('touchstart', (e) => {
  e.preventDefault();
  loop.requestResume();
}, { passive: false });

// ---- §54/§65 shake intensity control (Phase 10, session-only setting) ----
// Full / Reduced / Off — presentation-only magnitude scale applied at every
// shake trigger (particle.js triggerShake). aria-pressed flips ONLY when
// the selection changes (§70 DOM discipline); never persisted (§63 locked).
const SHAKE_BUTTONS = Array.prototype.slice.call(
  document.querySelectorAll('.shake-opt'));
function setShakeMode(mode) {
  if (SHAKE_MODES.indexOf(mode) === -1) return;
  game.shakeMode = mode;
  for (let i = 0; i < SHAKE_BUTTONS.length; i += 1) {
    const b = SHAKE_BUTTONS[i];
    b.setAttribute('aria-pressed', b.dataset.mode === mode ? 'true' : 'false');
  }
}
for (let i = 0; i < SHAKE_BUTTONS.length; i += 1) {
  const b = SHAKE_BUTTONS[i];
  b.addEventListener('click', () => setShakeMode(b.dataset.mode));
  b.addEventListener('touchstart', (e) => {
    e.preventDefault();
    setShakeMode(b.dataset.mode);
  }, { passive: false });
}

// ---- §65 screens: Start Journey / Try Again / Travel Again ---------------
const startButton = document.getElementById('btn-start');
const tryAgainButton = document.getElementById('btn-try-again');
const travelAgainButton = document.getElementById('btn-travel-again');
function onStartJourney() {
  startFromScreen(true);              // §17: first-gesture fullscreen attempt
}
function onRetry() {
  startFromScreen(false);             // §47 new run, no re-attempt (§17)
}
startButton.addEventListener('click', onStartJourney);
startButton.addEventListener('touchstart', (e) => {
  e.preventDefault();
  onStartJourney();
}, { passive: false });
tryAgainButton.addEventListener('click', onRetry);
tryAgainButton.addEventListener('touchstart', (e) => {
  e.preventDefault();
  onRetry();
}, { passive: false });
travelAgainButton.addEventListener('click', onRetry);
travelAgainButton.addEventListener('touchstart', (e) => {
  e.preventDefault();
  onRetry();
}, { passive: false });

// ---- responsive canvas (§7) ----------------------------------------------
window.addEventListener('resize', () => {
  renderer.resize();
}, { passive: true });

// ---- test instrumentation (§73, §74): test mode only, production clean ---
function pushMetrics(frameInfo) {
  if (window.__SOM_TEST__ !== true) return;
  const M = window.__SOM_METRICS__;
  const L = loop.metrics();
  M.gameTime = game.gameTime;
  M.paused = game.paused;
  M.pauseReasons = Array.from(game.pauseReasons);
  M.accumulator = L.accumulator;
  M.simStepsTotal = L.simStepsTotal;
  M.renderCount = L.renderCount;
  M.lastFrameSteps = L.lastFrameSteps;
  M.maxFrameSteps = L.maxFrameSteps;
  M.lastRenderTime = frameInfo.now;
  M.input = input.snapshot();
  M.player = playerSnapshot(player);
  M.camera = { x: game.camera.x, y: game.camera.y };
  M.score = game.score;                       // §58 run score
  M.kills = game.kills;                       // §59 kill count
  M.damageTaken = game.damageTaken;           // §61
  M.killStreak = game.killStreak;             // §60
  M.defeatedEnemyIds = Array.from(game.defeatedEnemyIds);   // §28 authority
  M.enemies = enemiesSnapshot(enemies);       // §74 entity instrumentation
  // ---- Phase 7 instrumentation (§74) ----
  M.unlockedCharacters = game.unlockedCharacters.slice();      // §20 chain
  M.slowMoActive = game.slowMoActive;          // §25.1 time domain state
  M.slowMoT = game.slowMoT;
  M.projectiles = projectilesSnapshot(game.projectiles);      // §21
  M.particles = particlesSnapshot(game);        // §57/§78 FX bounds
  M.gates = level.gates.map((g) => ({ id: g.id, kind: g.kind, state: g.state }));
  M.brokenPlatformIds = Array.from(game.brokenPlatformIds);   // §24/§50 breaks
  M.heartFragments = game.heartFragments;          // §19/§50 fragment count
  M.heartCount = game.heartCount;                  // §19 assembled containers
  M.comboBoost = game.comboBoost
    ? { ability: game.comboBoost.ability, from: game.comboBoost.from,
        to: game.comboBoost.to, until: game.comboBoost.until }
    : null;                                     // §20.1 armed modifier
  M.lastCombo = game.lastCombo
    ? { ability: game.lastCombo.ability, from: game.lastCombo.from,
        to: game.lastCombo.to, at: game.lastCombo.at }
    : null;                                     // §20.1 consumed record
  M.tutorial = game.tutorial ? { key: game.tutorial.key } : null;
  M.shake = game.shake ? { mag: game.shake.mag, t: game.shake.t } : null;
  // ---- Phase 10 instrumentation (§74) ----
  M.hitStopRemaining = L.hitStopRemaining;      // §9/§57 kill freeze state
  M.damageFlashT = game.damageFlashT;           // §57 red flash remaining
  M.shakeMode = game.shakeMode;                 // §54 session setting
  // ---- Phase 9 instrumentation (§74) ----
  M.screen = game.screen;                       // §65 screen state
  M.currentRunCoins = game.currentRunCoins;     // §63 run coins
  M.collectedCoinIds = Array.from(game.collectedCoinIds);         // §48
  M.collectedCrystalIds = Array.from(game.collectedCrystalIds);   // §48
  M.collectibles = collectiblesSnapshot(collectibles);            // §74
  M.saveWrites = game.saveWrites;               // §63 write counter
  M.lastRank = game.lastRank;                   // §62
  M.fullscreenAttempted = game.fullscreenAttempted;               // §17/§79.14
  M.runCompletedChapters = game.runCompletedChapters.slice();     // §63
  M.runFurthestChapterId = game.runFurthestChapterId;             // §63
  const chapter = level.chapterAt(player.x);
  M.chapter = { id: chapter.id, act: chapter.act, groundY: chapter.groundY };
  M.currentChapter = game.currentChapter;
  M.currentAct = game.currentAct;
  M.activeCheckpoint = game.activeCheckpoint;
  M.lastDeath = game.lastDeath;
  M.respawnCount = game.respawnCount;                       // §45
  M.actDeathStreak = game.actDeathStreak;                   // §49
  M.adaptiveActs = Array.from(game.adaptiveActs);           // §49 latch
  // §67/§68 story instrumentation (§74): active presentation facts only.
  const st = game.story;
  M.story = {
    inscription: st.inscription ? st.inscription.text : null,
    flashback: st.flashback ? st.flashback.text : null,
    npcPrompt: st.npcPrompt ? st.npcPrompt.id : null,
    npcDialogue: st.npcDialogue ? st.npcDialogue.text : null,
    cinematic: st.cinematic ? st.cinematic.title : null,
    quip: st.quip ? st.quip.text : null,
    npcInteracted: Object.keys(st.npcDone),
    beatsSeen: Object.keys(st.pouriaBeats),
  };
  M.renderTimestamps.push(frameInfo.now);
  if (M.renderTimestamps.length > 240) M.renderTimestamps.shift();
}

if (window.__SOM_TEST__ === true) {
  window.__SOM_METRICS__ = {
    gameTime: 0,
    paused: false,
    pauseReasons: [],
    accumulator: 0,
    simStepsTotal: 0,
    renderCount: 0,
    lastFrameSteps: 0,
    maxFrameSteps: 0,
    lastRenderTime: 0,
    input: null,
    player: null,
    camera: null,
    score: 0,
    kills: 0,
    damageTaken: 0,
    killStreak: 0,
    defeatedEnemyIds: [],
    enemies: [],
    unlockedCharacters: [],
    slowMoActive: false,
    slowMoT: 0,
    projectiles: [],
    particles: null,
    gates: [],
    brokenPlatformIds: [],
    heartFragments: 0,
    heartCount: 0,
    comboBoost: null,
    lastCombo: null,
    tutorial: null,
    shake: null,
    hitStopRemaining: 0,
    damageFlashT: 0,
    shakeMode: 'full',
    screen: null,
    currentRunCoins: 0,
    collectedCoinIds: [],
    collectedCrystalIds: [],
    collectibles: [],
    saveWrites: 0,
    lastRank: null,
    fullscreenAttempted: false,
    runCompletedChapters: [],
    runFurthestChapterId: null,
    chapter: null,
    currentChapter: null,
    currentAct: null,
    activeCheckpoint: null,
    lastDeath: null,
    respawnCount: 0,
    actDeathStreak: 0,
    adaptiveActs: [],
    story: null,
    renderTimestamps: [],
  };
  // §73 test-mode-only harness facilities: deterministic position control
  // and a forced lethal damage event through the ORGANIC award path
  // (§59). Production never sees this object — it is created exclusively
  // under __SOM_TEST__.
  window.__SOM_TEST_API__ = {
    teleport(x, y, vy) {
      if (player.dead) return;
      player.x = x;
      player.y = y;
      player.prevY = y;
      if (vy !== undefined) player.vy = vy;
    },
    forceKill(id) {
      for (let i = 0; i < enemies.length; i += 1) {
        if (enemies[i].id === id) {
          damageEnemy(game, enemies[i], 999);
          return true;
        }
      }
      return false;
    },
    // §73 harness facility for §79.3/§79.4/§79.5: force a story unlock
    // (§20). Chapter 1-5 lies beyond the interim dev end wall until Phase
    // 12 authors it, so the organic Aram unlock is unreachable in the
    // authored world — tests force it through the SAME unlock path the
    // chapter-entry rule uses (burst + tutorial included). Test mode only.
    forceUnlock(key) {
      if (!TUTORIAL_TEXT[key]) return false;
      unlockCharacter(key);
      return game.unlockedCharacters.indexOf(key) !== -1;
    },
    // §73 harness facility for §79.15: drive the victory flow through the
    // SAME completion path the game uses (bonus → rank → §63 save → §65
    // screen). The organic trigger is the §52 moon gate after the Queen
    // of Light fight (Phase 12, §79.18) — unreachable in the interim
    // world, exactly like forceUnlock's Aram. Test mode only.
    forceVictory() {
      return completeLevel();
    },
    // §73 harness facility for §79.12/§79.15: clear the active checkpoint so
    // the FINAL death flow (game-over screen + §63 bank) is reachable — the
    // tests' own "without an active checkpoint" precondition. In the live
    // game a checkpoint is always active (chapter entry auto-activates one,
    // §44). Test mode only.
    clearCheckpoint() {
      game.activeCheckpoint = null;
      return true;
    },
  };
}

// ---- boot -----------------------------------------------------------------
onOrientationChange();   // honor an initially-portrait viewport (§8.2)
snapCamera();            // frame the title backdrop on the spawn view (§53)
updateOverlays();
updateSelectorUI(true);  // §15: locked slots render greyed from the start
// §73 test-mode convenience: gameplay tests boot straight into a RUNNING
// run (no title gate) so every mechanics test exercises the simulation
// directly. ?somTitle=1 opts OUT — the §79.14/§79.15 tests use it to walk
// the REAL title flow (Start Journey gesture included). Production ALWAYS
// shows the title screen (§65).
if (window.__SOM_TEST__ === true
    && new URLSearchParams(window.location.search).get('somTitle') !== '1') {
  startRun();
  game.screen = 'playing';
  loop.requestResume();
  // The boot-time updateOverlays() call saw the TITLE screen; the run is
  // now playing (and was never paused in this path — requestResume
  // early-returns), so refresh the DOM control visibility explicitly.
  updateOverlays();
} else {
  loop.enterPause('title');   // the world renders behind the title plate
}
loop.start();
window.__SOM_BOOTED__ = true;   // load smoke hook (production-independent)
