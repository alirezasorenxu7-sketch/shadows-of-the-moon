# TASKS — Shadows of the Moon

Authoritative phase plan derived from SPEC §103. Update statuses as work completes.

2026-09-28 SCOPE AMENDMENT (user-approved): the game is restructured from
3 zones to 15 chapters (5 per act; zones renamed acts internally). World
width ~50000px. Each chapter ~3000–4000px, ~8–10 min, ends with a mini-boss
(brute/armored template, HP 6-10, heart-fragment reward) or special
challenge. Final boss: Queen of Light (Aram's mother) at the end of 3-5.
Save schema v2. Runtime budget 400KB. See amended SPEC §43–§53, §63, §67, §77.

2026-09-28 MASTER AMENDMENT (user-approved, pre-Phase 6 — applied to
SPEC before Phase 6 begins):
- STORY CANON: the moon is GONE (stolen; NO moon render anywhere);
  "Light Behind the Castle" replaces it with per-act progression
  (Act 1 pitch black; Act 2 faint glow; Act 3 clear glow + lightened
  horizon; 3-5 flicker; victory = moon rise). Sara's brother
  (Pouria, per the villain-track clarification below) canon +
  track (scarf 1-4, glimpse 2-3, escape fight 2-5, fear beat
  3-1, non-lethal fight 3-4, choice 3-5). Queen of Light =
  Aram's mother, emotional climax. All three warriors female
  (re-confirmed).
- PROGRESSIVE UNLOCK: Sara only (1-1/1-2); +Raha (1-3); +Aram (1-5);
  all three from 2-1. Locked slots greyed + lock icon, non-interactive;
  unlock particle burst; 3-5s non-blocking tutorials; persists via
  save v2 unlockedCharacters.
- VISIBILITY: character scale ×1.3 (38×62 / 44×62 / 40×62); global
  ZOOM 1.25 (~1024×576 window); enemy dims ×1.3; collectibles ×1.3;
  physics UNCHANGED; character detail (faces, outfits, orb); drop
  shadow + 1px outline; arms outside cloak, ±10px swings, body bob.
- ENVIRONMENT: background/midground/foreground density bands, set
  dressing, per-chapter themes, procedural platform textures,
  lighting/depth (fog, radial glows, rim light, atmospheric
  perspective); hit particles; particle cap 200→400.
- COMBAT DEPTH: per-character weaknesses; distinct kill methods;
  Sara dash damage 0→1 (pass-through, once per enemy per dash);
  enemy weakness/resistance matrix (Armored absorbs Aram magic);
  environmental gates; character-switch combos (1.5s window);
  strategic matrix. §38 note: dash damage does not affect the
  double-jump test.
- SAVE V2: + unlockedCharacters; triggers unchanged otherwise.
- ENDINGS: three unlockable (Sacrifice S/damage≤2 · Battle A/B ·
  Hidden Truth = 3 crystals + NPCs); victory screen shows 3 cards.
See amended SPEC §4, §7, §9, §15–§25, §27–§33, §38, §50, §52–§57,
§62, §63, §65, §67, §77, §78, §83, §103.

2026-09-28 VILLAIN TRACK CLARIFICATION (user-approved, pre-Phase 6 —
applied on top of the master amendment):
- Sara's brother is named POURIA (renamed from Kian). He is a
  PARALLEL PERSONAL ANTAGONIST for Sara only — NOT a general,
  NOT a mini-boss, NOT in the standard enemy roster (new SPEC
  §52.2).
- VILLAIN HIERARCHY canonized (SPEC §4): MAIN — Shadow King
  (behind the scenes); GENERALS one per Act — Act 1 Shadow
  Demon (دیوسایه), Act 2 Silent Lady (بانوی خاموش), Act 3
  King's Right Hand (دست راست شاه) — none of them is Pouria;
  PARALLEL — Pouria; FINAL BOSS — Queen of Light (Aram's
  mother), three-phase fight at 3-5.
- POURIA BEATS: scarf 1-4 (hint only); glimpse through bars 2-3
  (half-transformed, unreachable); FIRST FIGHT 2-5 (he attacks,
  doesn't recognize Sara; she must flee — cannot kill him);
  fear beat 3-1; FINAL FIGHT 3-4 (full corruption, NON-LETHAL:
  corruption HP + real HP; Sara dash strikes shadow chains,
  Raha slam breaks corruption armor, Aram slow-motion exposes
  his human side; lethal-only play floors real HP at 1 + he
  turns invulnerable until a non-lethal mechanic is used);
  resolution 3-5.
- THE CHOICE (3-5): three simultaneous beats — Queen freed,
  Shadow King exposed, Pouria on the brink; options: free
  Pouria (moon prison weakens; involves sacrifice) / leave him
  (moon stays imprisoned) / true-ending-only third option —
  Aram's mother offers her life force to replace Pouria's.
- ENDING TIES: E1 Sara sacrifices herself (Pouria survives);
  E2 Pouria survives, loses memories of Sara; E3 Aram's mother
  sacrifices herself (Pouria + moon both saved).
- Phase mapping: Pouria texts → Phase 11; escape fight (2-5),
  non-lethal fight (3-4), the choice (3-5) → Phase 12; ending
  ties → Phase 13.
See amended SPEC §4, §52, §52.2, §67, §103.

Status legend: `[ ]` pending · `[~]` in progress · `[x]` done · `[!]` blocked

## Phase overview

| # | Title | Branch | Depends on | Acceptance tests (§79/§80) | Status |
|---|-------|--------|------------|------------------------------|--------|
| 0 | Bootstrap: scaffold, docs, tooling, CI, Pages workflow, git init (NO push, NO branch/PR — §85/§110) | main | — | static checks only (5/5 passed) | [x] |
| 1 | Game loop; input; fixed timestep; time domains; pause/resume fundamentals | phase/01-game-loop | 0 | 79.7 visibility pause · 79.8 multi-touch · 79.13 portrait | [x] |
| 2 | Physics; jumping; collision; fall death foundation | phase/02-physics | 1 | 79.1 Sara double jump · 79.6 horizontal collision · 79.12 fall death | [x] |
| 3 | Sara rendering; animation; squash/stretch | phase/03-sara-rendering | 2 | — (screenshot verification) | [x] |
| 4 | Camera; parallax; moon; castle environment | phase/04-camera-parallax | 3 | — (screenshot verification) | [x] |
| 5 | Level data system for 15 chapters (schema, chapter intervals, chapter-scoped ID schemes); author chapters 1-1 through 1-3 as examples | phase/05-chapter-level-system | 4 | — (level integrity covered by later tests) | [x] |
| 6 | Canon visual fix: remove the moon → Light Behind the Castle (§55); ZOOM 1.25 + ×1.3 scale pass (§7/§18/§29/§48/§53); Patroller; player-enemy collision; base AI; defeatedEnemyIds integration | phase/06-patroller-ai | 5 | 79.17 enemy score uniqueness | [x] |
| 7 | Raha; Aram; switching; abilities; cooldown architecture; progressive unlock + tutorials (§20); character detail/shadow/outline/limb animation; weaknesses + kill methods + dash-through damage; switch combos (§20.1); environmental gate mechanics (§50) | phase/07-roster-abilities | 6 | 79.3 Aram slow-motion · 79.4 switching · 79.5 midair double jump | [x] |
| 8 | Chaser; Armored; Brute; mini-boss variant of Brute; enemy animation states; group behavior; Brute radial attack; enemy weakness/resistance enforcement (Armored absorbs Aram magic, §29.1) | phase/08-enemy-roster | 7 | 79.2 Raha slam | [ ] |
| 9 | Coins; crystals; HUD; screens; save schema v2 incl. unlockedCharacters persistence (§63); locked-selector UI (§15/§65) | phase/09-collect-hud-saves | 8 | 79.14 fullscreen · 79.15 persistence | [ ] |
| 10 | Hit-stop; shake; dust; dash trail; cooldown ring; damage flash; hit particles; environment density + set dressing + per-chapter themes + procedural platform textures + lighting/depth (§55–§57); particle cap 400 | phase/10-game-feel | 9 | — (regression only) | [ ] |
| 11 | A: inscriptions (45)/flashback (15)/NPC (15) incl. Pouria-track texts (scarf/glimpse/fear beat) + unlock cinematics · B: 15 chapter checkpoints/respawn · C: adaptive difficulty (per act) | phase/11-storytelling-checkpoints | 10 | 79.9 checkpoint duplicate score | [ ] |
| 12 | A: chapters 1-4 .. 2-5 (Pouria escape fight in 2-5, §52.2) · B: chapters 3-1 .. 3-4 (Pouria non-lethal final fight in 3-4, §52.2) · C: chapter 3-5 + Queen of Light three-phase final battle + the choice + moon rise + moon gate | phase/12-world-chapters-final | 11 | 79.18 final battle gate | [ ] |
| 13 | Rewards; rank; pause menu; heart containers; health pickups; clear-record flow; three ending triggers + victory ending cards (§52/§62/§65) | phase/13-rewards-rank-menu | 12 | 79.10 restart duplicate score | [ ] |
| 14 | Final acceptance; regression; manual checklist; Pages deploy; multi-touch verification; README verification | phase/14-final-acceptance | 13 | 79.11 performance · 79.16 safe-area · ALL (strict) | [ ] |

## Acceptance test → phase map (§80)

| Test | min_phase | Implemented in phase |
|------|-----------|----------------------|
| 79.7 visibility pause | 1 | 1 |
| 79.8 multi-touch | 1 | 1 |
| 79.13 portrait behavior | 1 | 1 |
| 79.1 Sara double jump ≥ 260 px | 2 | 2 |
| 79.6 horizontal collision | 2 | 2 |
| 79.12 fall death | 2 | 2 |
| 79.17 enemy score uniqueness | 6 | 6 |
| 79.3 Aram slow-motion | 7 | 7 |
| 79.4 character switching | 7 | 7 |
| 79.5 midair double jump | 7 | 7 |
| 79.2 Raha slam | 8 | 8 |
| 79.14 fullscreen | 9 | 9 |
| 79.15 persistence | 9 | 9 |
| 79.9 checkpoint duplicate score | 11 | 11 |
| 79.18 final battle gate (Queen of Light) | 12 | 12 |
| 79.10 restart duplicate score | 13 | 13 |
| 79.11 performance | 14 | 14 |
| 79.16 safe-area | 14 | 14 |

Runner rule: `tools/acceptance.py --phase N` executes tests with `min_phase <= N`;
not-yet-eligible tests are reported as skipped; phase ≥ 14 runs in strict mode
(all eligible tests must be implemented and passing). Exit code 1 on any
executed failure (SPEC §80).

## Milestones (§103)

Phases 11 and 12 each contain three milestones completed IN ORDER.
Each milestone is an internal commit point on the phase branch:

- Phase 11: **A** inscriptions (45) + flashback (15) + NPC (15),
  including Pouria-track texts (scarf 1-4, glimpse 2-3, fear
  beat 3-1) and the three unlock-event cinematics → **B** 15
  chapter checkpoints + respawn rules → **C** adaptive
  difficulty (per act)
- Phase 12: **A** chapters 1-4 .. 2-5 (Pouria escape fight in
  2-5) → **B** chapters 3-1 .. 3-4 (Pouria's non-lethal final
  fight in 3-4, §52.2) → **C** chapter 3-5 + final battle
  (Queen of Light, three-phase) + the choice (§52) + the moon
  rise + moon gate

## Per-phase Definition of Done (§102)

A feature phase is DONE only when:

1. [ ] all required files exist
2. [ ] game loads without uncaught errors
3. [ ] current-phase tests pass
4. [ ] prior-phase regression tests pass
5. [ ] screenshot verification where applicable
6. [ ] runtime size < 400 KB (index.html + style.css + src/**) — raised
      from 200 KB by the act/chapter scope amendment (SPEC §77)
7. [ ] forbidden runtime deps absent
8. [ ] working tree clean except ignored artifacts
9. [ ] changes committed (`<type>(<scope>): <description>`)
10. [ ] phase branch pushed (`phase/NN-kebab-name`)
11. [ ] PR created or updated (title `[Phase N] <title>`)
12. [ ] completion notification sent (when Telegram available)
13. [ ] agent stops and waits for approval

Phase 0 is the ONLY branch/PR exception (§85, §102).

## Phase 0 checklist

- [x] Environment preflight: 4/4 env vars present; GitHub identity + push
      permission verified read-only; Telegram send capability verified (§84)
- [x] `.env` provisioned (owner-only, NEVER committed) + `.envignore` rules in
      `.gitignore` (§76)
- [x] §75 folder structure scaffolded (runtime stubs import cleanly)
- [x] SPEC.md — full mirror of the 110-section specification
- [x] TASKS.md — this file
- [x] ORCHESTRATOR.md — state machine, Git/Telegram lifecycles, tooling usage
- [x] tools/notify.py — secret-safe Telegram notifications
- [x] tools/telegram-listener.py — long-poll listener with queue + lock
- [x] tools/acceptance.py — phase-aware harness: required files, runtime size,
      forbidden-dep scan, load smoke check, gameplay test registry
- [x] tools/screenshot.sh — server + capture orchestration
- [x] tools/phase-runner.sh — phase state machine harness
- [x] .env.example — variable names only
- [x] .github/workflows/test.yml — branch→phase CI (§88)
- [x] .github/workflows/deploy-pages.yml — Pages via Actions (§89)
- [x] README.md — run instructions + controls (manual device checklist lands
      in Phase 14 per §83)
- [x] Git initialized locally on `main`, clean remote URL (no token), bootstrap
      commit — NO push (§110)
- [x] Local validation: server + `acceptance.py --phase 0` passes
- [x] Telegram listener running; completion notification sent
- [x] Worklog updated; agent stopped awaiting approval

## Discipline reminders (§101, §109)

- Before modifying files: reread relevant SPEC sections, `git status`,
  `git log -5`, inspect TASKS.md + ORCHESTRATOR.md, run applicable tests.
- Implement ONLY the current phase; never refactor unrelated systems.
- Poll Telegram before/after every major step; honor `/pause` at safe boundaries.
- Never weaken requirements; never duplicate enemy scoring; never expose tokens;
  never auto-resume after a pause condition.
