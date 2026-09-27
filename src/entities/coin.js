// Shadows of the Moon — collectible entity (SPEC §48, §51, §58).
// Coins (common 10 / rare 50, ~15% rare authored by design), moon
// crystals (200), health pickups, heart containers. Every collectible
// has a fixed authored ID; run collections live in collectedCoinIds /
// collectedCrystalIds / collectedHealthIds / collectedHeartIds and are
// NEVER restored by checkpoint respawn or Restart Zone (SPEC §48).
// Implementation lands in Phase 9.
export const coin = { /* Phase 9 */ };
