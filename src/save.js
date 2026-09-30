// Shadows of the Moon — persistence, save schema v2 (SPEC §63, §62, §20).
// Phase 9: the single localStorage authority. Every write is ONE complete
// setItem of the full schema (§63: no partial writes, no per-frame writes).
//
// KNOWN-GOOD INTERPRETATIONS (SPEC ambiguity, documented):
//  - totalCoins banks currentRunCoins ONLY at run-final triggers
//    (game-over / victory). Applying the §63 merge formula literally at
//    every mid-run trigger would double-count coins (e.g. a chapter-entry
//    write followed by a game-over write). "total" means coins collected
//    across COMPLETED runs; an abandoned run banks nothing.
//  - bestRank merges only at run-final triggers: §62 says rank is
//    "computed after run score finalized" — a mid-run score is not
//    finalized, so mid-run writes carry the previous bestRank forward
//    (a fresh save keeps bestRank null until a run actually ends).
//  - the run START counts as entering chapter 1-1 (trigger 1): the run
//    begins there (§47), so the first write records currentChapter 1-1 +
//    unlockedCharacters early. A new run REPLACES the progress fields
//    (they are run-scoped per §63); bestScore/bestRank/totalCoins/
//    unlockedCharacters persist.
//  - chapterCheckpoints records the authored chapter-start checkpoint of
//    each REACHED chapter as save DATA (§63 schema). Gameplay checkpoint
//    ACTIVATION and death→respawn arrive with Phase 11 (§44/§45) — this
//    phase never sets game.activeCheckpoint.
//
// Malformed or version-1 saves are treated as empty (§63): no crash, no
// migration. All localStorage access is guarded (quota/security errors are
// swallowed — the game never depends on persistence to run).
import { RANK_TABLE } from './constants.js';

const SAVE_KEY = 'shadows_of_the_moon_save_v2';
const CANONICAL_CHARS = ['sara', 'raha', 'aram'];

function emptySave() {
  return {
    version: 2,
    bestScore: 0,
    bestRank: null,
    totalCoins: 0,
    currentChapter: '1-1',
    completedChapters: [],
    chapterCheckpoints: {},
    unlockedCharacters: ['sara'],
  };
}

// §63: read + validate. Anything unreadable/malformed/v1 → null (empty).
export function readSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    if (data.version !== 2) return null;               // v1 or unknown → empty
    return data;
  } catch (err) {
    return null;                                       // §63: do NOT crash
  }
}

// §20/§63: normalize an unlockedCharacters array to the canonical roster
// order, dropping unknown keys, always including sara (fresh save starts
// as ["sara"]). A new run NEVER resets this list (§20).
export function seedUnlockedCharacters(save) {
  const saved = save && Array.isArray(save.unlockedCharacters)
    ? save.unlockedCharacters : [];
  const out = [];
  for (let i = 0; i < CANONICAL_CHARS.length; i += 1) {
    const key = CANONICAL_CHARS[i];
    if (saved.indexOf(key) !== -1 || key === 'sara') out.push(key);
  }
  return out;
}

// §62 rank thresholds (RANK_TABLE, constants.js): S needs score AND
// damage caps; B is score-only; everything below is C.
export function computeRank(score, damageTaken) {
  if (score >= RANK_TABLE.S.score && damageTaken <= RANK_TABLE.S.damage) return 'S';
  if (score >= RANK_TABLE.A.score && damageTaken <= RANK_TABLE.A.damage) return 'A';
  if (score >= RANK_TABLE.B.score) return 'B';
  return 'C';
}

// §62 persistent ordering: S > A > B > C > null.
export function highestRank(a, b) {
  const order = { S: 4, A: 3, B: 2, C: 1 };
  const ra = a && order[a] ? order[a] : 0;
  const rb = b && order[b] ? order[b] : 0;
  return ra >= rb ? (ra > 0 ? a : (rb > 0 ? b : null)) : b;
}

// §63 auto-save — each call is a single complete write. Triggers:
// 'chapter' (entering a new chapter / run start), 'gameover', 'victory'.
// NO writes on pickups, Restart Chapter, or Pause (§63 no-write list).
export function writeSave(game, trigger) {
  const bank = trigger === 'gameover' || trigger === 'victory';
  const prev = readSave() || emptySave();
  const next = {
    version: 2,
    // bestScore is a live max (score only grows inside a run; abandoning
    // a run loses nothing already recorded).
    bestScore: Math.max(prev.bestScore || 0, game.score),
    // bestRank merges ONLY on run-final triggers (§62 finalization).
    bestRank: bank
      ? highestRank(prev.bestRank || null, computeRank(game.score, game.damageTaken))
      : (prev.bestRank || null),
    // totalCoins banks run coins ONLY when the run ends (see header).
    totalCoins: (prev.totalCoins || 0) + (bank ? game.currentRunCoins : 0),
    // Progress fields are run-scoped (§63): the current run's state.
    currentChapter: game.runFurthestChapterId,
    completedChapters: game.runCompletedChapters.slice(),
    chapterCheckpoints: Object.assign({}, prev.chapterCheckpoints, game.runChapterCheckpoints),
    unlockedCharacters: seedUnlockedCharacters({ unlockedCharacters: game.unlockedCharacters }),
  };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(next));
    game.saveWrites += 1;                              // §74 test instrumentation
  } catch (err) {
    /* §63: quota/security failure never crashes the game */
  }
  return next;
}
