// Shadows of the Moon — authored level data (amended SPEC §50, §51).
// LEVEL_DATA holds fixed literals ONLY. No random runtime placement (§72).
//
// ACT/CHAPTER STRUCTURE (2026-09-28 scope amendment):
//   3 acts × 5 chapters = 15 chapters, contiguous, ~50000px world.
//   Each chapter: { id, name, platforms, enemies, collectibles, checkpoint,
//   miniBoss, dressing, inscription, completeText } (§51). Chapters 1-1 ..
//   1-3 are authored here as the reference examples; 1-4 .. 3-5 carry
//   system placeholders (authored: false — length + chapter-start checkpoint
//   only) and are fully authored in Phase 12.
//
// PHASE 11 STORYTELLING PLACEMENT (§67/§68): authored chapters carry
//   stones     [{id, x, y, text}]  — 3 per chapter (intro + two mid)
//   flashback  {id, x, text}        — 1 per chapter, once per run
//   npc        {id, x, y, dialogue} — 1 per chapter (§68 Aram-only)
//   storyBeat  {key, x}             — positioned cinematic beats (1-2)
//   The TEXTS all live in src/story.js (the §67 corpus covers all 15
//   chapters day one); unauthored chapters get their placement with the
//   Phase 12 chapter authoring.
//
// COORDINATE CONVENTIONS (world pixels, absolute):
//   platforms  {x, y, w, h}            — top-left, solid AABB (breakable:
//                                         breakable:true + id, §51)
//   enemies    {id, type, x, y, patrol}— top-left of hitbox; patrol bounds
//                                         optional (chaser has none, §29)
//   collectibles {id, kind, x, y}      — CENTER point; kind: coin |
//                                         rareCoin | crystal | health |
//                                         heart | fragment
//   checkpoint {id, trigger, respawn}  — trigger rect + respawn point
//                                         (top-left for the 62px-tall roster,
//                                         amended §18 scale pass)
//   miniBoss   {id, template, hp, scale, pattern, reward, arena}
//
// The 12 placeholder chapters are produced by a DETERMINISTIC factory
// (unauthoredChapter below) — static literals in spirit (§70), zero
// randomness: lengths, names, and checkpoints are fixed literals in the
// table passed to it.

// §67 narrative corpus (Phase 11): the intro inscription + completeText of
// EVERY chapter (all 15) come from the story module — the §51 fields are
// filled day one; the world PLACEMENT for unauthored chapters arrives with
// Phase 12.
import { INSCRIPTIONS, FLASHBACKS, NPC_DIALOGUES, COMPLETE_TEXTS } from './story.js';

// Ground baseline for all Phase-5-authored chapters (camera rest anchor
// CAMERA_REST_GROUND_SCREEN_Y matches this line — see constants.js).
const GROUND_Y = 656;
const GROUND_H = 64;
// Amended §18 scale pass: characters and enemies are 62px tall (x1.3), so
// authored spawn tops sit at GROUND_Y - 62 (feet exactly on the ground line).
const SPAWN_Y = GROUND_Y - 62;           // 594 — respawn/enemy authored top

// Deterministic factory for not-yet-authored chapters (Phase 12 re-authors).
// Keeps the 15-chapter system complete: length, bounds, and the auto
// chapter-start checkpoint (§44) exist for every chapter from day one.
function unauthoredChapter(id, act, name, length, startX) {
  return Object.freeze({
    id, act, name, length, startX,
    authored: false,
    groundY: GROUND_Y,
    platforms: Object.freeze([]),
    enemies: Object.freeze([]),
    collectibles: Object.freeze([]),
    checkpoint: Object.freeze({
      id: `c${id.replace('-', '_')}_cp_start`,
      trigger: Object.freeze({ x: startX, y: 0, w: 48, h: 720 }),
      respawn: Object.freeze({ x: startX + 80, y: SPAWN_Y }),
    }),
    midCheckpoints: Object.freeze([]),
    miniBoss: null,
    dressing: Object.freeze([]),   // §55 Phase 10: authored with the chapter
    // §67/§51: texts are authored for ALL chapters (story.js corpus); the
    // intro stone / flashback / NPC PLACEMENT for unauthored chapters
    // arrives with the Phase 12 chapter authoring.
    inscription: INSCRIPTIONS[id][0],
    completeText: COMPLETE_TEXTS[id],
    stones: Object.freeze([]),
    flashback: null,
    npc: null,
    storyBeat: null,
  });
}

export const LEVEL_DATA = Object.freeze({
  // Act titles (amended SPEC §50). Zones are renamed acts internally.
  acts: Object.freeze([
    Object.freeze({ act: 1, title: 'Three Strangers', theme: 'dark forest' }),
    Object.freeze({ act: 2, title: 'The Dark Road', theme: 'dark road' }),
    Object.freeze({ act: 3, title: 'Heart of Darkness', theme: 'castle' }),
  ]),

  // Furthest chapter with authored content. Phase 12 authors 1-4 .. 3-5.
  authoredThrough: '1-3',

  chapters: Object.freeze([
    // ---- Chapter 1-1 "First Steps in Midnight" (tutorial) ----------------
    // Gap-free spawn stretch; the first guarded gap sits late in the chapter
    // (x 2600..2820) as the final tutorial lesson before the mini-boss
    // plateau. The spawn area (x 260..360) is deliberately platform-free
    // above ground so the §79.1 double-jump ceiling is unobstructed.
    Object.freeze({
      id: '1-1', act: 1, name: 'First Steps in Midnight',
      length: 3400, startX: 0, authored: true, groundY: GROUND_Y,
      platforms: Object.freeze([
        Object.freeze({ x: 0, y: 656, w: 2600, h: GROUND_H }),      // main tutorial ground
        Object.freeze({ x: 0, y: 456, w: 60, h: 200 }),             // world-edge wall (§79.6)
        Object.freeze({ x: 700, y: 560, w: 140, h: 24 }),           // stair 1
        Object.freeze({ x: 940, y: 460, w: 140, h: 24 }),           // stair 2
        Object.freeze({ x: 1200, y: 360, w: 160, h: 24 }),          // stair 3
        Object.freeze({ x: 1560, y: 470, w: 120, h: 24 }),          // descent shelf
        Object.freeze({ x: 1750, y: 330, w: 100, h: 24 }),          // high bonus ledge
        Object.freeze({ x: 2820, y: 656, w: 580, h: GROUND_H }),    // mini-boss plateau
      ]),
      enemies: Object.freeze([
        Object.freeze({ id: 'c1_1_enemy_001', type: 'patroller', x: 1500, y: 594,
                        patrol: Object.freeze({ minX: 1450, maxX: 1850 }) }),
        Object.freeze({ id: 'c1_1_enemy_002', type: 'patroller', x: 2200, y: 594,
                        patrol: Object.freeze({ minX: 2150, maxX: 2520 }) }),
      ]),
      collectibles: Object.freeze([
        Object.freeze({ id: 'c1_1_coin_001', kind: 'coin', x: 460, y: 610 }),
        Object.freeze({ id: 'c1_1_coin_002', kind: 'coin', x: 620, y: 610 }),
        Object.freeze({ id: 'c1_1_coin_003', kind: 'coin', x: 770, y: 520 }),
        Object.freeze({ id: 'c1_1_coin_004', kind: 'coin', x: 1010, y: 420 }),
        Object.freeze({ id: 'c1_1_coin_005', kind: 'coin', x: 1280, y: 320 }),
        Object.freeze({ id: 'c1_1_coin_006', kind: 'rareCoin', x: 1800, y: 290 }),
        Object.freeze({ id: 'c1_1_crystal_001', kind: 'crystal', x: 1620, y: 430 }),
        Object.freeze({ id: 'c1_1_health_001', kind: 'health', x: 2950, y: 610 }),
      ]),
      checkpoint: Object.freeze({
        id: 'c1_1_cp_start',
        trigger: Object.freeze({ x: 0, y: 0, w: 48, h: 720 }),
        respawn: Object.freeze({ x: 300, y: 594 }),
      }),
      midCheckpoints: Object.freeze([]),
      miniBoss: Object.freeze({
        id: 'c1_1_miniboss', template: 'brute', hp: 6, scale: 1.5,
        pattern: 'telegraph-ground-slam', reward: 'heart-fragment',
        arena: Object.freeze({ x: 2820, w: 580 }),
      }),
      // §55 Phase 10 set dressing (authored per chapter): broken stone
      // statues, wooden fences, torn banners, skeletons, cobwebs, and the
      // torch poles that act as ambient light sources (rim light + glow).
      dressing: Object.freeze([
        Object.freeze({ kind: 'statue', x: 210, y: GROUND_Y, s: 0 }),
        Object.freeze({ kind: 'torch', x: 560, y: GROUND_Y }),
        Object.freeze({ kind: 'fence', x: 850, y: GROUND_Y, s: 3 }),
        Object.freeze({ kind: 'cobweb', x: 1005, y: 484 }),
        Object.freeze({ kind: 'bones', x: 1360, y: GROUND_Y, s: 1 }),
        Object.freeze({ kind: 'banner', x: 2520, y: GROUND_Y, s: 0 }),
        Object.freeze({ kind: 'torch', x: 2880, y: GROUND_Y }),
        Object.freeze({ kind: 'statue', x: 3150, y: GROUND_Y, s: 1 }),
      ]),
      inscription: 'This is the forest of Midnight. The moon was stolen...',
      completeText: 'The first steps are taken. Midnight remembers your footprints.',
      // §67 Phase 11 story placement — three stones (intro at the chapter
      // mouth + two mid), one flashback trigger, one §68 NPC statue; all on
      // safe flat ground stretches of the tutorial chapter.
      stones: Object.freeze([
        Object.freeze({ id: 'c1_1_stone_001', x: 450, y: GROUND_Y, text: INSCRIPTIONS['1-1'][0] }),
        Object.freeze({ id: 'c1_1_stone_002', x: 950, y: GROUND_Y, text: INSCRIPTIONS['1-1'][1] }),
        Object.freeze({ id: 'c1_1_stone_003', x: 2300, y: GROUND_Y, text: INSCRIPTIONS['1-1'][2] }),
      ]),
      flashback: Object.freeze({ id: 'c1_1_fb_001', x: 1880, text: FLASHBACKS['1-1'] }),
      npc: Object.freeze({ id: 'c1_1_npc_001', x: 2000, y: GROUND_Y, dialogue: NPC_DIALOGUES['1-1'] }),
      storyBeat: null,
    }),

    // ---- Chapter 1-2 "The Deepening Wood" ---------------------------------
    // Two guarded gaps (180px, 220px with a mid-gap stepping stone), an
    // elevated route over the third stretch, and a mid-chapter checkpoint
    // (§44 designer discretion) after the second gap. Phase 7 adds the
    // first §50 environmental gate: a MAGIC BARRIER vault pocket on the
    // elevated route (optional loot — only Aram's magic shot dispels it;
    // the ground route below stays open, so no route ever soft-locks).
    Object.freeze({
      id: '1-2', act: 1, name: 'The Deepening Wood',
      length: 3600, startX: 3400, authored: true, groundY: GROUND_Y,
      platforms: Object.freeze([
        Object.freeze({ x: 3400, y: 656, w: 1200, h: GROUND_H }),   // stretch 1
        Object.freeze({ x: 4780, y: 656, w: 1120, h: GROUND_H }),   // stretch 2 (past gap 1)
        Object.freeze({ x: 6120, y: 656, w: 880, h: GROUND_H }),    // stretch 3 (past gap 2)
        Object.freeze({ x: 4000, y: 540, w: 120, h: 24 }),
        Object.freeze({ x: 4250, y: 430, w: 120, h: 24 }),
        Object.freeze({ x: 5960, y: 560, w: 80, h: 24 }),           // mid-gap stepping stone
        Object.freeze({ x: 6400, y: 520, w: 140, h: 24 }),          // elevated route
        Object.freeze({ x: 6700, y: 420, w: 140, h: 24 }),
        Object.freeze({ x: 6840, y: 420, w: 120, h: 24 }),          // magic vault floor
      ]),
      // §50 environmental gates (optional authored features).
      gates: Object.freeze([
        Object.freeze({ id: 'c1_2_gate_magic_001', kind: 'magicBarrier',
                        x: 6810, y: 320, w: 20, h: 100 }),
      ]),
      enemies: Object.freeze([
        Object.freeze({ id: 'c1_2_enemy_001', type: 'patroller', x: 4000, y: 594,
                        patrol: Object.freeze({ minX: 3950, maxX: 4500 }) }),
        Object.freeze({ id: 'c1_2_enemy_002', type: 'chaser', x: 5300, y: 594 }),
        Object.freeze({ id: 'c1_2_enemy_003', type: 'patroller', x: 6250, y: 594,
                        patrol: Object.freeze({ minX: 6170, maxX: 6400 }) }),
      ]),
      collectibles: Object.freeze([
        Object.freeze({ id: 'c1_2_coin_001', kind: 'coin', x: 3700, y: 610 }),
        Object.freeze({ id: 'c1_2_coin_002', kind: 'coin', x: 4300, y: 610 }),
        Object.freeze({ id: 'c1_2_coin_003', kind: 'coin', x: 4950, y: 610 }),
        Object.freeze({ id: 'c1_2_coin_004', kind: 'coin', x: 5550, y: 610 }),
        Object.freeze({ id: 'c1_2_coin_005', kind: 'coin', x: 6350, y: 610 }),
        Object.freeze({ id: 'c1_2_coin_006', kind: 'rareCoin', x: 6000, y: 520 }),
        Object.freeze({ id: 'c1_2_coin_007', kind: 'rareCoin', x: 6900, y: 380 }),   // magic vault
        Object.freeze({ id: 'c1_2_crystal_001', kind: 'crystal', x: 4060, y: 500 }),
        Object.freeze({ id: 'c1_2_health_001', kind: 'health', x: 6850, y: 610 }),
      ]),
      checkpoint: Object.freeze({
        id: 'c1_2_cp_start',
        trigger: Object.freeze({ x: 3400, y: 0, w: 48, h: 720 }),
        respawn: Object.freeze({ x: 3480, y: 594 }),
      }),
      midCheckpoints: Object.freeze([
        Object.freeze({
          id: 'c1_2_cp_mid',
          trigger: Object.freeze({ x: 6120, y: 0, w: 40, h: 720 }),
          respawn: Object.freeze({ x: 6180, y: 594 }),
        }),
      ]),
      miniBoss: Object.freeze({
        id: 'c1_2_miniboss', template: 'armored', hp: 7, scale: 1.4,
        pattern: 'telegraph-charge', reward: 'heart-fragment',
        arena: Object.freeze({ x: 6440, w: 560 }),
      }),
      // §55 Phase 10 set dressing — the deepening wood: denser ruins.
      dressing: Object.freeze([
        Object.freeze({ kind: 'fence', x: 3620, y: GROUND_Y, s: 2 }),
        Object.freeze({ kind: 'cobweb', x: 4290, y: 454 }),
        Object.freeze({ kind: 'bones', x: 4900, y: GROUND_Y, s: 0 }),
        Object.freeze({ kind: 'statue', x: 5420, y: GROUND_Y, s: 2 }),
        Object.freeze({ kind: 'torch', x: 6160, y: GROUND_Y }),
        Object.freeze({ kind: 'banner', x: 6470, y: GROUND_Y, s: 1 }),
        Object.freeze({ kind: 'torch', x: 6810, y: GROUND_Y }),
        Object.freeze({ kind: 'fence', x: 6940, y: GROUND_Y, s: 1 }),
      ]),
      inscription: 'The trees grow older toward the heart. Few who enter return.',
      completeText: 'The wood deepens, but you walk it together.',
      // §67 Phase 11 story placement — the 1-2 UNLOCK STORY BEAT (amended
      // §20/§67: Sara and Raha fight first — a misunderstanding — then
      // realize they share a goal; Raha is not yet unlocked here, so the
      // beat is a positioned cinematic, not an unlock event).
      stones: Object.freeze([
        Object.freeze({ id: 'c1_2_stone_001', x: 3550, y: GROUND_Y, text: INSCRIPTIONS['1-2'][0] }),
        Object.freeze({ id: 'c1_2_stone_002', x: 5100, y: GROUND_Y, text: INSCRIPTIONS['1-2'][1] }),
        Object.freeze({ id: 'c1_2_stone_003', x: 6550, y: GROUND_Y, text: INSCRIPTIONS['1-2'][2] }),
      ]),
      flashback: Object.freeze({ id: 'c1_2_fb_001', x: 5800, text: FLASHBACKS['1-2'] }),
      npc: Object.freeze({ id: 'c1_2_npc_001', x: 4950, y: GROUND_Y, dialogue: NPC_DIALOGUES['1-2'] }),
      storyBeat: Object.freeze({ key: 'beat12', x: 3700 }),
    }),

    // ---- Chapter 1-3 "The Edge of the Forest" ------------------------------
    // A guarded gap, the first breakable platform (the §50 stone-wall gate
    // — only Raha's slam breaks it; optional route piece), a three-step
    // climb tower, and the act's last mini-boss plateau before the road.
    // Phase 7 adds the §50 TIME-LOCKED DOOR: the tower-top pocket holding
    // the crystal opens only while Aram's slow-motion is active nearby
    // (optional loot — the ground route stays open; no soft-lock).
    Object.freeze({
      id: '1-3', act: 1, name: 'The Edge of the Forest',
      length: 3400, startX: 7000, authored: true, groundY: GROUND_Y,
      platforms: Object.freeze([
        Object.freeze({ x: 7000, y: 656, w: 1200, h: GROUND_H }),   // stretch 1
        Object.freeze({ x: 8420, y: 656, w: 780, h: GROUND_H }),    // stretch 2 (past gap)
        Object.freeze({ x: 9200, y: 656, w: 1200, h: GROUND_H }),   // arena plateau
        Object.freeze({ x: 8600, y: 540, w: 110, h: 24 }),          // climb 1
        Object.freeze({ x: 8820, y: 440, w: 110, h: 24 }),          // climb 2
        Object.freeze({ x: 9040, y: 340, w: 110, h: 24 }),          // climb 3 (tower top)
        Object.freeze({ x: 9150, y: 340, w: 110, h: 24 }),          // time-lock pocket floor
        Object.freeze({ x: 8460, y: 500, w: 100, h: 20, breakable: true,
                        id: 'c1_3_brk_001' }),                       // first breakable
      ]),
      // §50 environmental gates (optional authored features).
      gates: Object.freeze([
        Object.freeze({ id: 'c1_3_gate_time_001', kind: 'timeDoor',
                        x: 9155, y: 240, w: 24, h: 100 }),
      ]),
      enemies: Object.freeze([
        Object.freeze({ id: 'c1_3_enemy_001', type: 'patroller', x: 7500, y: 594,
                        patrol: Object.freeze({ minX: 7450, maxX: 8050 }) }),
        Object.freeze({ id: 'c1_3_enemy_002', type: 'chaser', x: 8800, y: 594 }),
        Object.freeze({ id: 'c1_3_enemy_003', type: 'patroller', x: 9300, y: 594,
                        patrol: Object.freeze({ minX: 9250, maxX: 9550 }) }),
      ]),
      collectibles: Object.freeze([
        Object.freeze({ id: 'c1_3_coin_001', kind: 'coin', x: 7300, y: 610 }),
        Object.freeze({ id: 'c1_3_coin_002', kind: 'coin', x: 7900, y: 610 }),
        Object.freeze({ id: 'c1_3_coin_003', kind: 'coin', x: 9050, y: 610 }),
        Object.freeze({ id: 'c1_3_coin_004', kind: 'coin', x: 9550, y: 610 }),
        Object.freeze({ id: 'c1_3_coin_005', kind: 'rareCoin', x: 8900, y: 470 }),
        Object.freeze({ id: 'c1_3_crystal_001', kind: 'crystal', x: 9180, y: 300 }),
        Object.freeze({ id: 'c1_3_health_001', kind: 'health', x: 9900, y: 610 }),
      ]),
      checkpoint: Object.freeze({
        id: 'c1_3_cp_start',
        trigger: Object.freeze({ x: 7000, y: 0, w: 48, h: 720 }),
        respawn: Object.freeze({ x: 7080, y: 594 }),
      }),
      midCheckpoints: Object.freeze([]),
      miniBoss: Object.freeze({
        id: 'c1_3_miniboss', template: 'brute', hp: 8, scale: 1.6,
        pattern: 'telegraph-radial-burst', reward: 'heart-fragment',
        arena: Object.freeze({ x: 9760, w: 640 }),
      }),
      // §55 Phase 10 set dressing — the forest edge: the road's first bones.
      dressing: Object.freeze([
        Object.freeze({ kind: 'statue', x: 7220, y: GROUND_Y, s: 3 }),
        Object.freeze({ kind: 'torch', x: 7560, y: GROUND_Y }),
        Object.freeze({ kind: 'banner', x: 8020, y: GROUND_Y, s: 2 }),
        Object.freeze({ kind: 'cobweb', x: 8470, y: 524 }),
        Object.freeze({ kind: 'bones', x: 9150, y: GROUND_Y, s: 2 }),
        Object.freeze({ kind: 'fence', x: 9500, y: GROUND_Y, s: 0 }),
        Object.freeze({ kind: 'torch', x: 9840, y: GROUND_Y }),
        Object.freeze({ kind: 'statue', x: 10240, y: GROUND_Y, s: 4 }),
      ]),
      inscription: 'Beyond these trees the road runs dark. Walk it together.',
      completeText: 'The forest ends. The dark road begins.',
      // §67 Phase 11 story placement — Raha's formal-join chapter (the
      // unlock cinematic itself fires from the §20 unlock authority).
      stones: Object.freeze([
        Object.freeze({ id: 'c1_3_stone_001', x: 7150, y: GROUND_Y, text: INSCRIPTIONS['1-3'][0] }),
        Object.freeze({ id: 'c1_3_stone_002', x: 7700, y: GROUND_Y, text: INSCRIPTIONS['1-3'][1] }),
        Object.freeze({ id: 'c1_3_stone_003', x: 9350, y: GROUND_Y, text: INSCRIPTIONS['1-3'][2] }),
      ]),
      flashback: Object.freeze({ id: 'c1_3_fb_001', x: 8460, text: FLASHBACKS['1-3'] }),
      npc: Object.freeze({ id: 'c1_3_npc_001', x: 9100, y: GROUND_Y, dialogue: NPC_DIALOGUES['1-3'] }),
      storyBeat: null,
    }),

    // ---- Chapters 1-4 .. 3-5 — system placeholders (authored in Phase 12) --
    // Lengths are fixed literals: 12 x 3300 = 39600; with 1-1..1-3
    // (3400 + 3600 + 3400 = 10400) the world is EXACTLY 50000px.
    unauthoredChapter('1-4', 1, 'The Crossing', 3300, 10400),
    unauthoredChapter('1-5', 1, 'Three Strangers', 3300, 13700),
    unauthoredChapter('2-1', 2, 'The Dark Road', 3300, 17000),
    unauthoredChapter('2-2', 2, "Wolves' Rest", 3300, 20300),
    unauthoredChapter('2-3', 2, 'The Old Bridge', 3300, 23600),
    unauthoredChapter('2-4', 2, 'Ruined Waystation', 3300, 26900),
    unauthoredChapter('2-5', 2, 'Crossroads of the Lost', 3300, 30200),
    unauthoredChapter('3-1', 3, 'Heart of Darkness', 3300, 33500),
    unauthoredChapter('3-2', 3, 'The Outer Walls', 3300, 36800),
    unauthoredChapter('3-3', 3, 'The Courtyard of Echoes', 3300, 40100),
    unauthoredChapter('3-4', 3, 'The Long Hall', 3300, 43400),
    unauthoredChapter('3-5', 3, 'The Queen of Light', 3300, 46700),
  ]),
});

// Runtime level view. Chapter bounds are DERIVED here (contiguous,
// non-overlapping — §46); worldWidth is the exact sum of authored lengths.
// buildLevel stays a pure function of `data` EXCEPT for the active solids
// view: `level.platforms` is the MUTABLE collision view (static platforms
// minus broken breakables, plus solid §50 gates), rebuilt on demand via
// level.rebuildSolids(brokenIds) whenever world state marks it dirty;
// `level.allPlatforms` is the immutable static list. Ch.1-2 and 1-3 author
// the example §50 gates — a magic-barrier vault and a time-locked door
// pocket (§50: optional features; routes never soft-lock).
export function buildLevel(data) {
  const chapters = data.chapters;
  let worldWidth = 0;
  const records = new Array(chapters.length);
  for (let i = 0; i < chapters.length; i += 1) {
    const ch = chapters[i];
    const startX = ch.startX;                    // authored literal (validated below)
    worldWidth = startX + ch.length;
    records[i] = ch;
    // Chapter-bound integrity (§46 no ambiguous boundaries): the table is
    // authored contiguous; a mismatch would be an authoring bug, so fail
    // loudly at build rather than silently mis-slicing the world.
    if (startX !== (i === 0 ? 0 : chapters[i - 1].startX + chapters[i - 1].length)) {
      throw new Error(`level data: chapter ${ch.id} startX ${startX} breaks contiguity`);
    }
  }

  // Flatten the collision world from AUTHORED chapters only. Unauthored
  // chapters contribute no geometry until Phase 12 authors them.
  const allPlatforms = [];
  for (let i = 0; i < records.length; i += 1) {
    const ch = records[i];
    if (!ch.authored) continue;
    for (let j = 0; j < ch.platforms.length; j += 1) allPlatforms.push(ch.platforms[j]);
  }

  // §50 environmental gates from authored chapters: mutable runtime copies
  // (state transitions active→dispelled / closed→open), each with a stable
  // chapter-scoped id. Initial state: magic barriers ACTIVE (solid until
  // dispelled by an Aram magic shot), time doors CLOSED (solid until opened
  // by Aram's slow-motion within GATE_OPEN_RANGE — then latched open, so a
  // closing door can never clip or trap the player).
  const gates = [];
  for (let i = 0; i < records.length; i += 1) {
    const ch = records[i];
    if (!ch.authored || !ch.gates) continue;
    for (let j = 0; j < ch.gates.length; j += 1) {
      const g = ch.gates[j];
      gates.push({
        id: g.id, kind: g.kind, x: g.x, y: g.y, w: g.w, h: g.h,
        state: g.kind === 'magicBarrier' ? 'active' : 'closed',
      });
    }
  }

  // INTERIM end-of-authored-content wall (Phases 5-11 only): a cliff-face
  // slab after the last authored chapter so the player cannot walk into
  // unauthored void. Removed automatically once the final chapter (3-5) is
  // authored — the world is then complete.
  const last = records[records.length - 1];
  if (!last.authored) {
    let boundary = 0;                            // end of the authored prefix
    for (let i = 0; i < records.length; i += 1) {
      if (records[i].authored) boundary = records[i].startX + records[i].length;
    }
    allPlatforms.push(Object.freeze({
      x: boundary, y: 300, w: 60, h: 356, devEndWall: true,
    }));
  }

  // The ACTIVE collision solids (§39 world view): static platforms minus
  // broken breakables, plus gates that currently block (active barriers,
  // closed time doors). Mutated IN PLACE by rebuildSolids — physics, AI,
  // and projectiles all read `level.platforms` per step and stay correct
  // across break/dispel/open transitions.
  const platforms = [];
  function rebuildSolids(brokenIds) {
    platforms.length = 0;
    for (let i = 0; i < allPlatforms.length; i += 1) {
      const p = allPlatforms[i];
      if (p.breakable && p.id && brokenIds.has(p.id)) continue;
      platforms.push(p);
    }
    for (let i = 0; i < gates.length; i += 1) {
      const g = gates[i];
      if (g.state === 'active' || g.state === 'closed') platforms.push(g);
    }
  }
  rebuildSolids(new Set());                      // initial view: nothing broken

  return {
    worldWidth,
    chapters: records,
    allPlatforms,                               // static geometry (render source)
    platforms,                                  // ACTIVE collision solids view
    gates,
    rebuildSolids,
    spawn: records[0].checkpoint.respawn,        // new run: chapter 1-1 start (§47)
    // Active chapter by player x (§46: within authored chapter bounds,
    // clamped at both ends). endX is derived (startX + length) — chapter
    // literals are frozen and never mutated.
    chapterAt(x) {
      if (x < 0) return records[0];
      for (let i = 0; i < records.length; i += 1) {
        if (x < records[i].startX + records[i].length) return records[i];
      }
      return records[records.length - 1];
    },
    // Active act (1..3) by player x — §49 adaptive difficulty is per-act.
    actAt(x) {
      return this.chapterAt(x).act;
    },
  };
}
