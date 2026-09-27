// Shadows of the Moon — authored level data (SPEC §50, §51).
// LEVEL_DATA holds fixed literals ONLY. No random runtime placement (§72).
//
// PHASE 2 PLACEHOLDER GEOMETRY: the real authored world (platforms, enemies,
// collectibles, checkpoints, NPC, final arena, moon gate) lands in Phase 5+;
// this phase ships only the minimal deterministic geometry the physics,
// jumping, collision, and fall-death foundations need:
//   - ground strip A with a wall at the left edge (horizontal collision §79.6)
//   - a pit (fall death §79.12)
//   - ground strip B beyond the pit
// The zone table already follows the locked §50 structure (5200px world,
// three zones) so later phases extend rather than reshape it.
export const LEVEL_DATA = Object.freeze({
  worldWidth: 5200,
  zones: Object.freeze([
    Object.freeze({ id: 'z1', x: 0, width: 1800, groundY: 656 }),
    Object.freeze({ id: 'z2', x: 1800, width: 1600, groundY: 656 }),
    Object.freeze({ id: 'z3', x: 3400, width: 1800, groundY: 656 }),
  ]),
  // Solid AABB platforms: {x, y, w, h} in world pixels.
  platforms: Object.freeze([
    Object.freeze({ x: 0, y: 656, w: 900, h: 64 }),     // ground A (spawn area)
    Object.freeze({ x: 0, y: 456, w: 60, h: 200 }),     // left wall on ground A
    Object.freeze({ x: 1120, y: 656, w: 160, h: 64 }),  // ground B (past the pit)
  ]),
  // Pit: x in [900, 1120) has no floor — falling there triggers §43.
  spawn: Object.freeze({ x: 300, y: 608 }),
  // enemies / breakables / coins / crystals / health / hearts / checkpoints /
  // npc / finalBattle / moonGate: authored in Phase 5+ (§51).
});

// Runtime level view. Static in Phase 2; Phase 5+ adds mutable world state
// (breakable platforms, enemy/collectible registration) beside this.
export function buildLevel(data) {
  const zones = data.zones;
  return {
    worldWidth: data.worldWidth,
    zones,
    platforms: data.platforms,
    spawn: data.spawn,
    // Active zone by player x (SPEC §50 intervals; clamped at both ends).
    zoneAt(x) {
      if (x < 0) return zones[0];
      for (let i = 0; i < zones.length; i += 1) {
        if (x < zones[i].x + zones[i].width) return zones[i];
      }
      return zones[zones.length - 1];
    },
  };
}
