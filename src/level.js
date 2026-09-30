// Shadows of the Moon — authored level data (amended SPEC §50, §51).
// LEVEL_DATA holds fixed literals ONLY. No random runtime placement (§72).
//
// ACT/CHAPTER STRUCTURE (2026-09-28 scope amendment):
//   3 acts × 5 chapters = 15 chapters, contiguous, ~50000px world.
//   Each chapter: { id, name, platforms, enemies, collectibles, checkpoint,
//   miniBoss | specialChallenge | finalBattle, dressing, inscription,
//   completeText } (§51). Chapters 1-1 .. 1-3 are authored as explicit
//   object literals; 1-4 .. 3-5 (Phase 12) author through the deterministic
//   `ch()` factory below — identical frozen output, compact tables.
//
// PHASE 12 FINAL CONTENT: every remaining chapter is authored — 2-5 carries
//   the §52.2 Pouria ESCAPE special challenge, 3-4 the non-lethal FINAL
//   FIGHT, 3-5 the Queen of Light final battle + the choice + moon gate.
//
// PHASE 11 STORYTELLING PLACEMENT (§67/§68): authored chapters carry
//   stones     [{id, x, y, text}]  — 3 per chapter (intro + two mid)
//   flashback  {id, x, text}        — 1 per chapter, once per run
//   npc        {id, x, y, dialogue} — 1 per chapter (§68 Aram-only)
//   storyBeat  {key, x}             — positioned cinematic beats (1-2)
//   The TEXTS all live in src/story.js (the §67 corpus covers all 15
//   chapters); Phase 12 places every chapter's props on enemy-safe
//   dead zones (chaser trigger bands avoided; castle chapters keep ≥50px
//   from patrol bounds where geometry is tight).
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
// The 12 Phase-12 chapters author through the DETERMINISTIC factory (ch)
// below — static literals in spirit (§70/§72), zero randomness.

// §67 corpus (Phase 11): every chapter's inscription + completeText come
// from story.js; Phase 12 places the world-side story props.
import { INSCRIPTIONS, FLASHBACKS, NPC_DIALOGUES, COMPLETE_TEXTS } from './story.js';
// Ground baseline for all Phase-5-authored chapters (camera rest anchor
// CAMERA_REST_GROUND_SCREEN_Y matches this line — see constants.js).
const GROUND_Y = 656;
const GROUND_H = 64;
// Amended §18 scale pass: characters and enemies are 62px tall (x1.3), so
// authored spawn tops sit at GROUND_Y - 62 (feet exactly on the ground line).
const SPAWN_Y = GROUND_Y - 62;           // 594 — respawn/enemy authored top

// Deterministic factory for the Phase-12 authored chapters (1-4 .. 3-5). The
// compact tuple tables below convert through it into the SAME frozen literal
// objects 1-1..1-3 carry — static literals in spirit (§70/§72, the Phase-5
// placeholder precedent): zero randomness, every value a fixed literal here.
//   p : [x, y, w, h] platforms ([x,y,w,h,'brkId'] = breakable)
//   e : [suffix, type, x, y, minX?, maxX?] enemies (patrol optional)
//   c : [suffix, kind, x, y] collectibles (CENTER points)
//   dr: [kind, x, s?] dressing (torch/cobweb carry their own geometry)
//   st: [x] or [x, y] inscription stones — texts from the §67 corpus
//   mb: [template, hp, scale, pattern, arenaX, arenaW]  §50 mini-boss
//   mid: [[triggerX, respawnX]] mid-chapter checkpoints (§44)
//   sc / fb: §52.2 special challenges + the §52 final battle (below)
function ch(id, act, name, d) {
  const prefix = `c${id.replace('-', '_')}`;
  const platforms = d.p.map((t) => (t[4]
    ? Object.freeze({ x: t[0], y: t[1], w: t[2], h: t[3], breakable: true, id: `${prefix}_${t[4]}` })
    : Object.freeze({ x: t[0], y: t[1], w: t[2], h: t[3] })));
  const enemies = d.e.map((t) => Object.freeze({
    id: `${prefix}_${t[0]}`, type: t[1], x: t[2], y: t[3],
    patrol: t[4] != null ? Object.freeze({ minX: t[4], maxX: t[5] }) : undefined,
  }));
  const collectibles = d.c.map((t) => Object.freeze({
    id: `${prefix}_${t[0]}`, kind: t[1], x: t[2], y: t[3],
  }));
  const dressing = d.dr.map((t) => Object.freeze(
    t[0] === 'cobweb' ? { kind: t[0], x: t[1], y: t[2] } : { kind: t[0], x: t[1], y: GROUND_Y, s: t[2] || 0 }));
  const stones = d.st.map((t, i) => Object.freeze({
    id: `${prefix}_stone_00${i + 1}`, x: t[0], y: t[1] != null ? t[1] : GROUND_Y,
    text: INSCRIPTIONS[id][i],
  }));
  const midCheckpoints = (d.mid || []).map((t) => Object.freeze({
    id: `${prefix}_cp_mid`,
    trigger: Object.freeze({ x: t[0], y: 0, w: 40, h: 720 }),
    respawn: Object.freeze({ x: t[1], y: SPAWN_Y }),
  }));
  const mb = d.mb ? Object.freeze({
    id: `${prefix}_miniboss`, template: d.mb[0], hp: d.mb[1], scale: d.mb[2],
    pattern: d.mb[3], reward: 'heart-fragment',
    arena: Object.freeze({ x: d.mb[4], w: d.mb[5] }),
  }) : null;
  let specialChallenge = null;
  if (d.sc) {
    if (d.sc[0] === 'pouria-escape') {
      specialChallenge = Object.freeze({
        kind: 'pouria-escape', id: `${prefix}_pouria`, spawnX: d.sc[1],
      });
    } else {
      specialChallenge = Object.freeze({
        kind: 'pouria-fight', id: `${prefix}_pouria`,
        arenaX: d.sc[1], arenaW: d.sc[2], corruptionHp: d.sc[3], realHp: d.sc[4],
      });
    }
  }
  const finalBattle = d.fb ? Object.freeze({
    id: `${prefix}_queen`, arenaX: d.fb[0], arenaW: d.fb[1],
    gateX: d.fb[2], gateY: d.fb[3], phases: Object.freeze(d.fb[4]),
  }) : null;
  return Object.freeze({
    id, act, name, length: 3300, startX: d.s, authored: true, groundY: GROUND_Y,
    platforms: Object.freeze(platforms),
    enemies: Object.freeze(enemies),
    collectibles: Object.freeze(collectibles),
    checkpoint: Object.freeze({
      id: `${prefix}_cp_start`,
      trigger: Object.freeze({ x: d.s, y: 0, w: 48, h: 720 }),
      respawn: Object.freeze({ x: d.s + 80, y: SPAWN_Y }),
    }),
    midCheckpoints: Object.freeze(midCheckpoints),
    miniBoss: mb,
    specialChallenge,
    finalBattle,
    dressing: Object.freeze(dressing),
    inscription: INSCRIPTIONS[id][0],
    completeText: COMPLETE_TEXTS[id],
    stones: Object.freeze(stones),
    flashback: Object.freeze({ id: `${prefix}_fb_001`, x: d.fbx, text: FLASHBACKS[id] }),
    npc: Object.freeze({ id: `${prefix}_npc_001`, x: d.npc, y: GROUND_Y, dialogue: NPC_DIALOGUES[id] }),
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

  // Furthest chapter with authored content. Phase 12 authored 1-4 .. 3-5 —
  // the whole world is live and the interim dev end wall is gone.
  authoredThrough: '3-5',

  chapters: Object.freeze([
    // 1-1 "First
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

    // 1-2 "The
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

    // 1-3 "The
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

    // 1-4 "The
    ch('1-4', 1, 'The Crossing', {
      s: 10400,
      p: [
        [10400, 656, 1150, 64], [11850, 656, 1000, 64], [13030, 656, 670, 64],
        [10800, 540, 120, 24], [11050, 440, 120, 24],
        [12100, 520, 140, 24], [12350, 400, 120, 24], [12900, 560, 70, 24],
      ],
      e: [
        ['enemy_001', 'patroller', 10700, 594, 10600, 11000],
        ['enemy_002', 'patroller', 12150, 458, 12110, 12220],
        ['enemy_003', 'patroller', 12400, 594, 12250, 12650],
      ],
      c: [
        ['coin_001', 'coin', 10500, 610], ['coin_002', 'coin', 10900, 610],
        ['coin_003', 'coin', 11700, 540], ['coin_004', 'coin', 12200, 610],
        ['coin_005', 'coin', 12700, 610], ['coin_006', 'rareCoin', 12410, 360],
        ['health_001', 'health', 13150, 610],
      ],
      mid: [[11850, 11910]],
      mb: ['armored', 7, 1.4, 'telegraph-charge', 13050, 600],
      dr: [
        ['statue', 10520, 2], ['torch', 11150], ['bones', 11300, 1],
        ['fence', 11900, 2], ['statue', 12200, 4], ['torch', 12750],
        ['banner', 13060, 0],       ],
      st: [[10550], [11950], [12700]], fbx: 11150, npc: 11350,
    }),

    // 1-5 "Three
    ch('1-5', 1, 'Three Strangers', {
      s: 13700,
      p: [
        [13700, 656, 900, 64], [14800, 656, 1100, 64], [16120, 656, 880, 64],
        [14000, 520, 110, 24], [14300, 410, 100, 24],
        [15000, 540, 120, 24], [15250, 430, 110, 24], [15550, 320, 100, 24],
        [15960, 560, 70, 24], [16040, 480, 70, 24],
      ],
      e: [
        ['enemy_001', 'patroller', 14100, 594, 13950, 14400], ['enemy_002', 'chaser', 15250, 594],
        ['enemy_003', 'chaser', 15650, 594],
      ],
      c: [
        ['coin_001', 'coin', 13900, 610], ['coin_002', 'coin', 14450, 610],
        ['coin_003', 'coin', 14700, 540], ['coin_004', 'coin', 15100, 610],
        ['coin_005', 'coin', 15850, 610], ['coin_006', 'rareCoin', 15600, 280],
        ['health_001', 'health', 16500, 610],
      ],
      mid: [[16120, 16180]],
      mb: ['brute', 9, 1.7, 'telegraph-radial-burst', 16400, 560],
      dr: [
        ['bones', 13800, 2], ['statue', 14050, 5], ['torch', 14450],
        ['cobweb', 14310, 434], ['bones', 14950, 0], ['statue', 15300, 6],
        ['torch', 15850], ['banner', 16150, 2], ['torch', 16450],       ],
      st: [[13800], [14830], [16350]], fbx: 14500, npc: 16200,
    }),

    // 2-1 "The
    ch('2-1', 2, 'The Dark Road', {
      s: 17000,
      p: [
        [17000, 656, 1200, 64], [18390, 656, 1200, 64], [19760, 656, 540, 64],
        [17400, 540, 130, 24], [17650, 440, 120, 24], [18600, 530, 140, 24], [18850, 420, 120, 24],
        [19460, 476, 26, 180, 'brk_001'],
      ],
      e: [
        ['enemy_001', 'armored', 17500, 591, 17300, 17800], ['enemy_002', 'chaser', 18850, 594],
        ['enemy_003', 'armored', 19250, 591, 19100, 19420],
      ],
      c: [
        ['coin_001', 'coin', 17150, 610], ['coin_002', 'coin', 17900, 610],
        ['coin_003', 'coin', 18300, 560], ['coin_004', 'coin', 18700, 610],
        ['coin_005', 'rareCoin', 18910, 380], ['coin_006', 'coin', 19350, 610],
        ['coin_007', 'rareCoin', 19500, 610], ['health_001', 'health', 19555, 610],
      ],
      mb: ['armored', 8, 1.5, 'telegraph-charge', 19820, 440],
      dr: [
        ['fence', 17100, 3], ['torch', 17600], ['bones', 18000, 1],
        ['banner', 18300, 3], ['fence', 18650, 1], ['torch', 19150],
        ['statue', 19570, 2], ['torch', 19850],       ],
      st: [[17150], [18470], [18040]], fbx: 17860, npc: 18140,
    }),

    // 2-2 "Wolves'
    ch('2-2', 2, "Wolves' Rest", {
      s: 20300,
      p: [
        [20300, 656, 1000, 64], [21490, 656, 1100, 64], [22760, 656, 540, 64],
        [20600, 540, 120, 24], [20850, 430, 110, 24], [21050, 330, 100, 24],
        [21700, 520, 130, 24], [21950, 410, 120, 24],
      ],
      e: [
        ['enemy_001', 'armored', 20700, 591, 20550, 20800],
        ['enemy_002', 'brute', 20950, 578, 20850, 21050], ['enemy_003', 'chaser', 21800, 594],
        ['enemy_004', 'armored', 22300, 591, 22150, 22450],
      ],
      c: [
        ['coin_001', 'coin', 20400, 610], ['coin_002', 'coin', 20950, 610],
        ['coin_003', 'coin', 21400, 560], ['coin_004', 'coin', 21850, 610],
        ['coin_005', 'coin', 22400, 610], ['coin_006', 'rareCoin', 21100, 290],
        ['coin_007', 'rareCoin', 22010, 370], ['health_001', 'health', 22850, 610],
      ],
      mb: ['brute', 8, 1.6, 'telegraph-radial-burst', 22800, 460],
      dr: [
        ['bones', 20400, 2], ['fence', 20600, 0], ['torch', 21000],
        ['cobweb', 20870, 454], ['bones', 21550, 1], ['statue', 22050, 3],
        ['torch', 22500], ['fence', 22800, 2], ['torch', 22950], ['banner', 23150, 5],
      ],
      st: [[20400], [21520], [21250]], fbx: 22520, npc: 21150,
    }),

    // 2-3 "The
    ch('2-3', 2, 'The Old Bridge', {
      s: 23600,
      p: [
        [23600, 656, 700, 64], [24300, 560, 280, 24], [24690, 560, 280, 24], [25080, 560, 220, 24],
        [25300, 656, 1000, 64], [26470, 656, 430, 64], [24380, 460, 100, 24], [24700, 370, 100, 24],
      ],
      e: [
        ['enemy_001', 'armored', 23900, 591, 23750, 24150], ['enemy_002', 'chaser', 24800, 498],
        ['enemy_003', 'chaser', 26200, 594],
      ],
      c: [
        ['coin_001', 'coin', 23700, 610], ['coin_002', 'coin', 24450, 520],
        ['coin_003', 'coin', 24850, 520], ['coin_004', 'rareCoin', 24750, 330],
        ['coin_005', 'coin', 25500, 610], ['coin_006', 'coin', 25900, 610],
        ['coin_007', 'rareCoin', 26200, 560], ['health_001', 'health', 26550, 610],
      ],
      mid: [[25300, 25360]],
      mb: ['armored', 8, 1.5, 'telegraph-charge', 26510, 370],
      dr: [
        ['torch', 23700], ['fence', 23950, 1], ['bones', 24250, 0],
        ['cobweb', 24740, 390], ['torch', 25450], ['bars', 25680],
        ['statue', 25850, 6], ['bones', 25950, 2], ['torch', 26200],
        ['banner', 26520, 6],       ],
      st: [[23700], [25380], [25130]], fbx: 25680, npc: 25520,
    }),

    // 2-4 "Ruined
    ch('2-4', 2, 'Ruined Waystation', {
      s: 26900,
      p: [
        [26900, 656, 1100, 64], [28190, 656, 1000, 64], [29360, 656, 840, 64],
        [27200, 540, 140, 24], [27450, 440, 130, 24], [27150, 340, 120, 24],
        [28400, 520, 130, 24], [28650, 410, 120, 24], [27600, 476, 28, 180, 'brk_001'],
      ],
      e: [
        ['enemy_001', 'armored', 27300, 591, 27150, 27500], ['enemy_002', 'chaser', 28400, 594],
        ['enemy_003', 'armored', 28800, 591, 28650, 28950],
      ],
      c: [
        ['coin_001', 'coin', 27000, 610], ['coin_002', 'coin', 27650, 610],
        ['coin_003', 'rareCoin', 27750, 610], ['coin_004', 'rareCoin', 28710, 370],
        ['coin_005', 'coin', 28250, 610], ['coin_006', 'coin', 28750, 610],
        ['health_001', 'health', 27860, 610], ['coin_007', 'coin', 29500, 610],
      ],
      mid: [[28190, 28250]],
      mb: ['brute', 9, 1.6, 'telegraph-radial-burst', 29400, 760],
      dr: [
        ['fence', 27000, 2], ['torch', 27400], ['bones', 27700, 1],
        ['statue', 27900, 7], ['cobweb', 27470, 454], ['banner', 28250, 0],
        ['fence', 28500, 3], ['torch', 28950],         ['torch', 29450], ['statue', 30050, 5],
      ],
      st: [[27000], [29070], [27850]], fbx: 27830, npc: 27960,
    }),

    // 2-5 "Crossroads
    ch('2-5', 2, 'Crossroads of the Lost', {
      s: 30200,
      p: [
        [30200, 656, 800, 64], [31180, 656, 620, 64], [31990, 656, 560, 64], [32720, 656, 780, 64],
        [31040, 560, 70, 24], [31830, 560, 70, 24], [32580, 560, 70, 24],
        [31300, 540, 110, 24], [32100, 520, 120, 24], [32850, 540, 110, 24],
      ],
      e: [
        ['enemy_001', 'armored', 31550, 591, 31450, 31750], ['enemy_002', 'chaser', 32300, 594],
        ['enemy_003', 'armored', 33050, 591, 32900, 33200],
      ],
      c: [
        ['coin_001', 'coin', 30400, 610], ['coin_002', 'coin', 30900, 560],
        ['coin_003', 'coin', 31400, 610], ['coin_004', 'coin', 32050, 610],
        ['coin_005', 'coin', 32650, 560], ['coin_006', 'rareCoin', 32160, 480],
        ['health_001', 'health', 32800, 610], ['coin_007', 'coin', 33250, 610],
      ],
      mid: [[31990, 32050]],
      sc: ['pouria-escape', 31300],
      dr: [
        ['banner', 30450, 7], ['bones', 30700, 2], ['torch', 30950],
        ['statue', 30990, 8], ['torch', 31700], ['bones', 32000, 1],
        ['fence', 32400, 0], ['torch', 32650], ['statue', 33000, 9], ['banner', 33300, 8],
      ],
      st: [[30250], [30450], [33400]], fbx: 30650, npc: 30850,
    }),

    // 3-1 "Heart
    ch('3-1', 3, 'Heart of Darkness', {
      s: 33500,
      p: [
        [33500, 656, 1100, 64], [34790, 656, 1100, 64], [36060, 656, 740, 64],
        [33800, 540, 130, 24], [34050, 430, 120, 24], [33850, 330, 110, 24],
        [35000, 520, 140, 24], [35250, 400, 130, 24],
      ],
      e: [
        ['enemy_001', 'armored', 33850, 591, 33700, 34000],
        ['enemy_002', 'brute', 34350, 578, 34250, 34500], ['enemy_003', 'chaser', 35050, 594],
        ['enemy_004', 'armored', 35550, 591, 35400, 35700],
      ],
      c: [
        ['coin_001', 'coin', 33600, 610], ['coin_002', 'coin', 34250, 610],
        ['coin_003', 'coin', 34850, 560], ['coin_004', 'coin', 35300, 610],
        ['coin_005', 'coin', 35800, 610], ['coin_006', 'rareCoin', 35310, 360],
        ['coin_007', 'rareCoin', 33910, 290], ['health_001', 'health', 36200, 610],
      ],
      mb: ['brute', 9, 1.7, 'telegraph-radial-burst', 36120, 640],
      dr: [
        ['torch', 33650], ['statue', 33950, 10], ['banner', 34350, 9],
        ['bones', 34550, 2], ['torch', 34800], ['fence', 35100, 4],
        ['statue', 35450, 11], ['cobweb', 35310, 424], ['torch', 35850],
        ['banner', 36150, 10], ['torch', 36450],       ],
      st: [[33600], [34050], [35790]], fbx: 34550, npc: 34150,
    }),

    // 3-2 "The
    ch('3-2', 3, 'The Outer Walls', {
      s: 36800,
      p: [
        [36800, 656, 900, 64], [37890, 656, 900, 64], [39400, 656, 700, 64],
        [37100, 540, 120, 24], [37350, 440, 110, 24], [38100, 520, 130, 24], [38350, 410, 120, 24],
        [38820, 560, 130, 24], [39070, 470, 130, 24], [39320, 380, 130, 24],
      ],
      e: [
        ['enemy_001', 'armored', 37200, 591, 37000, 37400], ['enemy_002', 'chaser', 38150, 594],
        ['enemy_003', 'brute', 38500, 578, 38400, 38650],
        ['enemy_004', 'patroller', 39120, 408, 39070, 39200],
      ],
      c: [
        ['coin_001', 'coin', 36900, 610], ['coin_002', 'coin', 37500, 610],
        ['coin_003', 'coin', 37950, 560], ['coin_004', 'coin', 38200, 610],
        ['coin_005', 'rareCoin', 38410, 370], ['coin_006', 'coin', 38900, 520],
        ['coin_007', 'rareCoin', 39380, 340], ['coin_008', 'coin', 39650, 610],
        ['health_001', 'health', 39750, 610],
      ],
      mid: [[39400, 39440]],
      mb: ['armored', 9, 1.6, 'telegraph-charge', 39500, 560],
      dr: [
        ['torch', 36900], ['banner', 37200, 11], ['statue', 37650, 12],
        ['bones', 37650, 1], ['torch', 37900], ['fence', 38300, 5],
        ['cobweb', 38420, 434], ['torch', 38800], ['banner', 38650, 12],
        ['torch', 39500],       ],
      st: [[36900], [37480], [39380, 380]], fbx: 37480, npc: 37580,
    }),

    // 3-3 "The
    ch('3-3', 3, 'The Courtyard of Echoes', {
      s: 40100,
      p: [
        [40100, 656, 1000, 64], [41290, 656, 1000, 64], [42460, 656, 940, 64],
        [40400, 540, 130, 24], [40650, 440, 120, 24], [40900, 340, 110, 24],
        [41500, 520, 140, 24], [41750, 410, 130, 24], [42000, 310, 120, 24],
      ],
      e: [
        ['enemy_001', 'armored', 40550, 591, 40350, 40750],
        ['enemy_002', 'patroller', 40950, 594, 40850, 41050], ['enemy_003', 'chaser', 41550, 594],
        ['enemy_004', 'brute', 41950, 578, 41800, 42100],
      ],
      c: [
        ['coin_001', 'coin', 40200, 610], ['coin_002', 'coin', 40800, 610],
        ['coin_003', 'coin', 41350, 560], ['coin_004', 'coin', 41850, 610],
        ['coin_005', 'coin', 42300, 610], ['coin_006', 'rareCoin', 42060, 270],
        ['coin_007', 'rareCoin', 41010, 300], ['health_001', 'health', 42600, 610],
      ],
      mid: [[42460, 42520]],
      mb: ['brute', 10, 1.7, 'telegraph-radial-burst', 42700, 640],
      dr: [
        ['torch', 40200], ['statue', 40550, 14], ['banner', 40850, 13],
        ['cobweb', 40670, 464], ['bones', 41080, 2], ['torch', 41300],
        ['fence', 41650, 6], ['statue', 41950, 15], ['cobweb', 41770, 434],
        ['torch', 42300], ['banner', 42600, 14], ['torch', 42900],       ],
      st: [[40200], [42560], [42060, 310]], fbx: 40800, npc: 42200,
    }),

    // 3-4 "The
    ch('3-4', 3, 'The Long Hall', {
      s: 43400,
      p: [
        [43400, 656, 900, 64], [44490, 656, 700, 64], [45360, 656, 1040, 64],
        [43600, 540, 120, 24], [43850, 440, 110, 24], [44600, 520, 120, 24],
        [45500, 520, 110, 24], [45800, 430, 110, 24], [46100, 520, 110, 24],
      ],
      e: [
        ['enemy_001', 'armored', 43750, 591, 43600, 43950], ['enemy_002', 'chaser', 44750, 594],
        ['enemy_003', 'armored', 45050, 591, 44900, 45150],
      ],
      c: [
        ['coin_001', 'coin', 43500, 610], ['coin_002', 'coin', 44200, 610],
        ['coin_003', 'coin', 44550, 560], ['coin_004', 'rareCoin', 43910, 400],
        ['coin_005', 'coin', 45250, 560], ['health_001', 'health', 45450, 610],
        ['health_002', 'health', 46300, 610],
      ],
      mid: [[45360, 45420]],
      sc: ['pouria-fight', 45360, 1040, 12, 6],
      dr: [
        ['torch', 43500], ['banner', 43900, 15], ['statue', 44280, 17],
        ['bones', 44280, 2], ['torch', 44650], ['cobweb', 43870, 464],
        ['fence', 45000, 7], ['torch', 45400], ['banner', 45600, 16],
        ['torch', 45900], ['statue', 46200, 18], ['torch', 46350],
      ],
      st: [[43450], [44000], [44200]], fbx: 45300, npc: 45400,
    }),

    // 3-5 "The
    ch('3-5', 3, 'The Queen of Light', {
      s: 46700,
      p: [
        [46700, 656, 900, 64], [47790, 656, 600, 64], [48560, 656, 1440, 64],
        [46950, 540, 120, 24], [47200, 440, 110, 24], [47900, 520, 120, 24], [48150, 410, 110, 24],
        [48700, 520, 110, 24], [49000, 430, 110, 24], [49300, 520, 110, 24], [49940, 300, 60, 356],
      ],
      e: [
        ['enemy_001', 'armored', 47100, 591, 46950, 47300],
        ['enemy_002', 'brute', 48100, 578, 47950, 48250],
      ],
      c: [
        ['coin_001', 'coin', 46800, 610], ['coin_002', 'coin', 47350, 610],
        ['coin_003', 'coin', 47700, 560], ['coin_004', 'coin', 48000, 610],
        ['coin_005', 'rareCoin', 48210, 370], ['coin_006', 'coin', 48450, 560],
        ['coin_007', 'coin', 48800, 610], ['health_001', 'health', 48650, 610],
        ['health_002', 'health', 49450, 610],
      ],
      mid: [[48560, 48620]],
      fb: [48560, 1380, 49860, 590, [10, 12, 14]],
      dr: [
        ['torch', 46800], ['banner', 47100, 17], ['statue', 47450, 19],
        ['torch', 47750], ['bones', 48000, 2], ['fence', 48300, 8],
        ['torch', 48600], ['banner', 48800, 18], ['torch', 49100],
        ['statue', 49500, 20], ['torch', 49700],
      ],
      st: [[46780], [47400], [47850]], fbx: 47550, npc: 48650,
    }),
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

  // Flatten the collision world from AUTHORED chapters (all 15 as of
  // Phase 12).
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

  // INTERIM end-of-authored-content wall: retired in Phase 12 — every
  // chapter is authored, and 3-5's own end-stone wall closes the world.
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
