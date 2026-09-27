// Shadows of the Moon — particle entity (SPEC §56–§57).
// Ambient particles per zone (leaves, dust, sparks), Aram motes, moon
// rays, landing dust, dash afterimages, death shatter cubes. Max ~200
// particles, pooled. Cosmetic randomness uses a DETERMINISTIC seeded
// generator; gameplay-critical randomness is forbidden (SPEC §72).
// Implementation lands in Phase 10 (game feel) with earlier ambient use.
export const particle = { /* Phase 10 */ };
