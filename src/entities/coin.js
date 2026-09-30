// Shadows of the Moon — collectible entity system (SPEC §48, §51, §58, §19).
// Phase 9: coins (common 10 / rare 50), moon crystals (200) — authored as
// CENTER points with fixed chapter-scoped IDs (c<act>_<chapter>_<kind>_<nnn>).
// Run collections live in game.collectedCoinIds / collectedCrystalIds and
// are NEVER restored by checkpoint respawn or Restart Chapter (§48); a new
// run clears them (§47). Health pickups + heart containers (§19) are
// authored in LEVEL_DATA but stay DORMANT here — they land with Phase 13
// per the phase mapping (TASKS.md row 13), so this module only activates
// the coin/rareCoin/crystal kinds.
//
// Pickup resolution (§58): coin and crystal scores are awarded on successful
// pickup; common AND rare coins each count as exactly 1 currentRunCoins
// (§63). The collected-id sets are the award-exactly-once authority (§48):
// once collected, the entity never re-activates within the run (create
// filters it, mirroring the §28 defeatedEnemyIds guard). NO save write
// happens on pickup (§63 no-write list).
import {
  COLLECTIBLE_TYPES,
  COLLECTIBLE_SCALE,
  COLLECTIBLE_PICKUP_MARGIN,
} from '../constants.js';
import { circleHitsAABB } from './player.js';
import { spawnBurst, addRing } from './particle.js';

// Kinds active in Phase 9 (health/heart arrive with Phase 13, §19).
const ACTIVE_KINDS = ['coin', 'rareCoin', 'crystal'];

// Deterministic per-collectible animation phase from the stable ID (§72 —
// the same coin always bobs/spins the same way).
function idPhase(id) {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) % 997;
  return (h / 997) * Math.PI * 2;
}

// Build the active collectible list from AUTHORED chapters only. IDs already
// in the run's collected sets are omitted (§48 — collected collectibles
// remain absent for the entire current run).
export function createCollectibles(level, game) {
  const list = [];
  for (let i = 0; i < level.chapters.length; i += 1) {
    const chapter = level.chapters[i];
    if (!chapter.authored) continue;                 // Phase 12 authors the rest
    for (let j = 0; j < chapter.collectibles.length; j += 1) {
      const spec = chapter.collectibles[j];
      const type = COLLECTIBLE_TYPES[spec.kind];
      if (!type || ACTIVE_KINDS.indexOf(spec.kind) === -1) continue;   // dormant kind
      const collected = spec.kind === 'crystal'
        ? game.collectedCrystalIds : game.collectedCoinIds;
      if (collected.has(spec.id)) continue;          // §48: never re-activate
      const r = type.radius * COLLECTIBLE_SCALE;     // amended §48 x1.3 pass
      list.push({
        id: spec.id,
        kind: spec.kind,
        x: spec.x,                                   // authored CENTER point
        y: spec.y,
        r,                                           // drawn radius (scaled)
        pickupR: r + COLLECTIBLE_PICKUP_MARGIN,      // pickup radius (scaled + margin)
        phase: idPhase(spec.id),                     // deterministic bob/spin phase
      });
    }
  }
  return list;
}

// One player-domain step: pickup resolution only (the art bobs in the
// renderer from gameTime — entities have no per-step animation state).
export function updateCollectibles(game, player, list) {
  if (player.dead) return;
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const c = list[i];
    // §48: pickup radii scale with the x1.3 pass; the check is the same
    // deterministic circle-vs-AABB the combat system uses (§24).
    if (!circleHitsAABB(c.x, c.y, c.pickupR, player)) continue;
    if (c.kind === 'crystal') {
      if (!game.collectedCrystalIds.has(c.id)) {
        game.collectedCrystalIds.add(c.id);          // §48 authority first
        game.score += COLLECTIBLE_TYPES.crystal.score;       // §58: on pickup
        spawnBurst(game, c.x, c.y, '#c77dff', 14);
        spawnBurst(game, c.x, c.y, '#eee8ff', 6);
        addRing(game, c.x, c.y, 26, '#c77dff');
      }
    } else {
      if (!game.collectedCoinIds.has(c.id)) {
        game.collectedCoinIds.add(c.id);             // §48 authority first
        game.score += COLLECTIBLE_TYPES[c.kind].score;       // §58: on pickup
        game.currentRunCoins += 1;                   // §63: common + rare each count 1
        const tone = c.kind === 'rareCoin' ? '#aebfdd' : '#f2d55c';
        spawnBurst(game, c.x, c.y, tone, 10);
      }
    }
    list.splice(i, 1);                               // collected: absent for the run
  }
}

// Plain-data snapshot for test instrumentation (§74).
export function collectiblesSnapshot(list) {
  const out = [];
  for (let i = 0; i < list.length; i += 1) {
    const c = list[i];
    out.push({ id: c.id, kind: c.kind, x: c.x, y: c.y, r: c.r });
  }
  return out;
}
