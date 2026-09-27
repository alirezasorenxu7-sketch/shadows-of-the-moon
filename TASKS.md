# TASKS — Shadows of the Moon

Authoritative phase plan derived from SPEC §103. Update statuses as work completes.

Status legend: `[ ]` pending · `[~]` in progress · `[x]` done · `[!]` blocked

## Phase overview

| # | Title | Branch | Depends on | Acceptance tests (§79/§80) | Status |
|---|-------|--------|------------|------------------------------|--------|
| 0 | Bootstrap: scaffold, docs, tooling, CI, Pages workflow, git init (NO push, NO branch/PR — §85/§110) | main | — | static checks only (5/5 passed) | [x] |
| 1 | Game loop; input; fixed timestep; time domains; pause/resume fundamentals | phase/01-game-loop | 0 | 79.7 visibility pause · 79.8 multi-touch · 79.13 portrait | [ ] |
| 2 | Physics; jumping; collision; fall death foundation | phase/02-physics | 1 | 79.1 Sara double jump · 79.6 horizontal collision · 79.12 fall death | [ ] |
| 3 | Sara rendering; animation; squash/stretch | phase/03-sara-rendering | 2 | — (screenshot verification) | [ ] |
| 4 | Camera; parallax; moon; castle environment | phase/04-camera-parallax | 3 | — (screenshot verification) | [ ] |
| 5 | Platform system; Zone 1 level data; enemy ID scheme; collectible ID scheme | phase/05-level-zone1 | 4 | — (level integrity covered by later tests) | [ ] |
| 6 | Patroller; player-enemy collision; base AI; defeatedEnemyIds integration | phase/06-patroller-ai | 5 | 79.17 enemy score uniqueness | [ ] |
| 7 | Raha; Aram; switching; abilities; cooldown architecture | phase/07-roster-abilities | 6 | 79.3 Aram slow-motion · 79.4 switching · 79.5 midair double jump | [ ] |
| 8 | Chaser; Armored; Brute; enemy animation states; group behavior; Brute radial attack | phase/08-enemy-roster | 7 | 79.2 Raha slam | [ ] |
| 9 | Coins; crystals; HUD; screens; localStorage | phase/09-collect-hud-saves | 8 | 79.14 fullscreen · 79.15 persistence | [ ] |
| 10 | Hit-stop; shake; dust; dash trail; cooldown ring; damage flash | phase/10-game-feel | 9 | — (regression only) | [ ] |
| 11 | A: inscriptions/flashback/NPC · B: checkpoints/respawn · C: adaptive difficulty | phase/11-storytelling-checkpoints | 10 | 79.9 checkpoint duplicate score | [ ] |
| 12 | A: Zone 2 · B: Zone 3 · C: final battle + moon gate | phase/12-world-zones-final | 11 | 79.18 final battle gate | [ ] |
| 13 | Rewards; rank; pause menu; heart containers; health pickups; clear-record flow | phase/13-rewards-rank-menu | 12 | 79.10 restart duplicate score | [ ] |
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
| 79.18 final battle gate | 12 | 12 |
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

- Phase 11: **A** inscriptions + flashback + NPC → **B** checkpoints + respawn
  rules → **C** adaptive difficulty
- Phase 12: **A** Zone 2 → **B** Zone 3 → **C** final battle + moon gate

## Per-phase Definition of Done (§102)

A feature phase is DONE only when:

1. [ ] all required files exist
2. [ ] game loads without uncaught errors
3. [ ] current-phase tests pass
4. [ ] prior-phase regression tests pass
5. [ ] screenshot verification where applicable
6. [ ] runtime size < 200 KB (index.html + style.css + src/**)
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
