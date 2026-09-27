// Shadows of the Moon — enemy AI (SPEC §34).
// Line of sight (horizontal raycast, solid walls block), alert 0.4 s,
// return 1.5 s, edge detection 0.2 s, stagger rules, group flanking
// advisory. ALL AI timers decrement with enemySimDt (SPEC §11.2) and
// freeze during Pause. No unseeded random gameplay AI (SPEC §72).
// Implementation lands in Phase 6 (base) and Phase 8 (roster).
export const ai = { /* Phase 6 */ };
