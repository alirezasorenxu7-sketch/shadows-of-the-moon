// Shadows of the Moon — environmental storytelling (SPEC §67/§68 — Phase 11).
//
// AUTHORitative narrative corpus + the run-scoped story presentation state
// machine. All texts are fixed authored literals (§72 — never randomized);
// the corpus covers all 15 chapters so the count authorities of §67 hold
// from day one (45 inscriptions, 15 flashbacks, 15 NPC dialogues, 30
// character-switch quips, 15 chapter-complete texts, 3 unlock story events,
// and the Pouria-track beats of §4/§52.2).
//
// PLACEMENT: world positions for the stones / flashback triggers / NPC
// statues live in level.js with the authored chapters (the §51 pattern —
// chapters 1-4..3-5 get their placement with Phase 12); this module owns
// the TEXTS and the presentation state machine.
//
// PRESENTATION RULES (§67): events do NOT pause gameplay. Stones show
// ~5 s when the player is near; a flashback is a 2 s black-bg / white-text
// window; an NPC dialogue lasts 5 s and never repeats within a run (§68);
// unlock cinematics are short letterboxed plates; switch quips are brief
// lines above the character.
//
// §68 NPC INTERACTION: only while Aram is the ACTIVE character and the
// player stands within 60 px of the statue. While the prompt is up, the
// J/Attack input is consumed as the NPC interaction INSTEAD of an attack —
// updateStory() runs BEFORE the player step and claims the attack edge.

// ---- inscription texts (§67: 45 = 3 per chapter) ---------------------------
// [intro stone at chapter start, mid stone 1, mid stone 2]
export const INSCRIPTIONS = Object.freeze({
  // Act 1 — Three Strangers (dark forest)
  '1-1': [
    'This is the forest of Midnight. The moon was stolen...',
    'Old marks on the bark: travelers counted their days here.',
    'The canopy drinks what little light remains. Walk quietly.',
  ],
  '1-2': [
    'The trees grow older toward the heart. Few who enter return.',
    'Someone carved a warning: "the shadows remember footsteps."',
    'A fallen ranger\'s shield. The shadows took the rest of him.',
  ],
  '1-3': [
    'Beyond these trees the road runs dark. Walk it together.',
    'Carved in haste: "she wore the moon\'s tears in her hair."',
    'The last tree bears three names, worn beyond reading.',
  ],
  '1-4': [
    'Ruins of the first watch. The forest keeps its dead politely.',
    'Here the patrols of Midnight once lit their beacons.',
    'A torn cloth snagged on thorn. It was red once.',
  ],
  '1-5': [
    'The shadow lair. Even the stones here whisper her brother\'s name.',
    'Do not trust the warm corners. Nothing here is warm.',
    'Beyond this hollow the road climbs out of the forest.',
  ],
  // Act 2 — The Dark Road
  '2-1': [
    'Sara found a trace of her brother, Pouria.',
    'The road remembers armies. Armies do not remember the road.',
    'Mile-marker: the count ends where the moonlight ended.',
  ],
  '2-2': [
    'The road forks around a drowned chapel. Both forks are dark.',
    'Pilgrims nailed their prayers to this post. The nails remain.',
    'Wheel-ruts filled with rain. Something drank them dry.',
  ],
  '2-3': [
    'Halfway to the castle. The bars ahead hold more than rain out.',
    'Scratched into the stone: "he walks the corridor at night."',
    'The wind here carries voices that never learned words.',
  ],
  '2-4': [
    'The road rises toward the castle\'s smoke. No fires warm it.',
    'A cartwright\'s last ledger: deliveries stopped mid-word.',
    'Ash on the milestone. Fresh ash. Old road.',
  ],
  '2-5': [
    'The gate road. Beyond it, no road at all — only shadow.',
    'Carved low, where a kneeling hand could reach: "forgive me."',
    'The last milestone reads: MIDNIGHT. Someone crossed it out.',
  ],
  // Act 3 — Heart of Darkness
  '3-1': [
    'The castle of shadows. Where the moon is imprisoned.',
    'The portcullis teeth are carved from quieter nights.',
    'A hymn scratched into the wall — unfinished, mid-verse.',
  ],
  '3-2': [
    'The courtyard of tattered banners. None of them surrender.',
    'The well here answers questions with colder questions.',
    'Boot prints in stone, going up. None coming down.',
  ],
  '3-3': [
    'The armory of things that were never forged.',
    'A mirror hall. The reflections arrived before their owners.',
    'The stairs count themselves differently each climb.',
  ],
  '3-4': [
    'The high corridor. The shadows here wear familiar shapes.',
    'Someone scrawled: "he is still inside it. Both of them are."',
    'The wall is warm here, as if something sleeps behind it.',
  ],
  '3-5': [
    'The throne approach. The moon\'s prison is close enough to hear.',
    'All roads in the castle end here. All roads out begin here.',
    'Three names carved at the threshold. Yours is the fourth.',
  ],
});

// ---- flashback texts (§67: 15 = 1 per chapter, 2 s black-bg window) --------
// The Pouria-track beats (§4/§52.2) ride their chapters' flashback slots:
// 1-4 = torn scarf (hint only), 2-3 = glimpse through the bars,
// 3-1 = fear of the next encounter. The 2-5 escape fight and 3-4
// non-lethal final fight are AUTHORED CHAPTER CONTENT (Phase 12) — not
// flashbacks; nothing here prototypes those encounters.
export const FLASHBACKS = Object.freeze({
  '1-1': 'Before the theft — moonlight on the river, three sisters braiding crowns of silver water.',
  '1-2': 'A village festival. Lanterns. A boy laughing on his father\'s shoulders.',
  '1-3': 'The night the sky went out: every lantern in Midnight dying at once, politely.',
  '1-4': 'A torn red scarf, knotted twice — Pouria\'s knot. Sara pockets it without a word.',
  '1-5': 'The lair\'s mouth breathing cold. Sara, small, refusing to step back.',
  '2-1': 'Pouria at the forge, hammer keeping time with a song only he knew.',
  '2-2': 'Rain on the chapel roof. Two children counting thunderbolts as blessings.',
  '2-3': 'Through the bars: her brother, half-transformed. He does not see her. She cannot reach him.',
  '2-4': 'The Queen, younger, braiding her daughter\'s hair by moonlight — before the coronation of grief.',
  '2-5': 'A doorway of light. A hand reaching back through it, and the choice not yet made.',
  '3-1': 'Sara\'s hands will not stop shaking. The next encounter is coming, and it will wear his face.',
  '3-2': 'Banners raised for a homecoming that never came. The drums never stopped.',
  '3-3': 'Arag\'s forge-fire reflected in black armor. The armor was empty.',
  '3-4': 'Pouria\'s voice, distant: "Sara, is that you? Don\'t look at me. Don\'t look."',
  '3-5': 'The moon, whole, low over the castle — the way it hung the night before everything.',
});

// ---- NPC dialogue lines (§68: 15 = 1 per chapter, Aram-only) ---------------
export const NPC_DIALOGUES = Object.freeze({
  '1-1': 'Statue of a weeping warden: "They took her like a lamp from a table."',
  '1-2': 'Statue of a forest nun: "Even the fog prays now, child of the purple star."',
  '1-3': 'Statue of a boundary knight: "I marked the road\'s end. The road disagreed."',
  '1-4': 'Statue of a hearth-keeper: "Warmth remembers its own. Tell her brother that."',
  '1-5': 'Statue of a nameless herald: "I announced the theft before it happened. Nobody bowed."',
  '2-1': 'Statue of a road-mender: "I filled its cracks with silver coins. It never thanked me."',
  '2-2': 'Statue of a chapel caretaker: "The bell fears its own voice now. Be gentler than bells."',
  '2-3': 'Statue of a jailer: "The boy behind the bars still shares his bread with the rats."',
  '2-4': 'Statue of a ledger-keeper: "Every entry ends mid-word. Even the ink was afraid."',
  '2-5': 'Statue of a gate-warden: "The gate asks riddles of those who leave. It asks nothing of shadows."',
  '3-1': 'Statue of a court composer: "My last hymn had no ending. Finish it for me, singer."',
  '3-2': 'Statue of a banner-mistress: "I sewed their names into the silk. The silk outlived the names."',
  '3-3': 'Statue of a master smith: "I forged the prison\'s key, then melted it out of shame."',
  '3-4': 'Statue of a royal physician: "Corruption is grief that found no other way out."',
  '3-5': 'Statue of the moon\'s handmaiden: "She hums, still. Under the stone. Listen with your third ear."',
});

// ---- chapter-complete texts (§67: 15 = 1 per chapter) ----------------------
// Authored for all chapters; shown on the chapter completion flow (the
// inter-chapter completion screen arrives with the Phase 12 chapter endings).
export const COMPLETE_TEXTS = Object.freeze({
  '1-1': 'The first steps are taken. Midnight remembers your footprints.',
  '1-2': 'The wood deepens, but you walk it together.',
  '1-3': 'The forest ends. The dark road begins.',
  '1-4': 'The ruins keep their silence. Something red was left behind.',
  '1-5': 'The lair is crossed. The dark road waits beyond the hollow.',
  '2-1': 'A trace of Pouria, and a road that swallows footsteps.',
  '2-2': 'The chapel drowns behind you. Your lanterns do not.',
  '2-3': 'You saw his face behind the bars. You could not reach.',
  '2-4': 'Ash-road climbed. The castle\'s smoke leans toward you.',
  '2-5': 'You escaped what you could not fight. It remembers you.',
  '3-1': 'The castle takes you in like a held breath.',
  '3-2': 'The banners do not surrender. Neither do you.',
  '3-3': 'The armory of impossible things is behind you.',
  '3-4': 'You fought him without killing him. The moon saw how.',
  '3-5': 'The choice is made. The moon rises the way it always meant to.',
});

// ---- character-switch quips (§67: 30, authored selection — NEVER random) --
// 10 lines per incoming character; selected by that character's monotonic
// switch counter modulo 10 (deterministic authored order, §72).
export const SWITCH_QUIPS = Object.freeze({
  sara: [
    'Sara: "Stay behind me."',
    'Sara: "One path. One blade. Go."',
    'Sara: "I didn\'t come this far to slow down."',
    'Sara: "The moon is waiting."',
    'Sara: "Eyes forward."',
    'Sara: "Whoever stole the sky will answer."',
    'Sara: "My brother is somewhere in that dark."',
    'Sara: "Quiet now. Listen to the road."',
    'Sara: "We move until the shadows stop moving."',
    'Sara: "Still here. Still standing."',
  ],
  raha: [
    'Raha: "Make room."',
    'Raha: "The ground is about to change sides."',
    'Raha: "Step aside — this is wall work."',
    'Raha: "Point me at what won\'t move."',
    'Raha: "A warrior and a door walk into a chapter..."',
    'Raha: "I\'ll carry the loud half of this fight."',
    'Raha: "Locked? That\'s just a wall with opinions."',
    'Raha: "My grandmother hit harder. Almost."',
    'Raha: "Nothing in Midnight out-weighs me."',
    'Raha: "Breathe later. Break now."',
  ],
  aram: [
    'Aram: "Let me think for a moment."',
    'Aram: "Time bends for those who ask politely."',
    'Aram: "The night is readable, if you squint."',
    'Aram: "Magic is only patience with a flair."',
    'Aram: "I know these shadows. They flinch."',
    'Aram: "Mother always said the light would come back."',
    'Aram: "Watch the seams. Everything true leaks."',
    'Aram: "A shield, a whisper, and time enough."',
    'Aram: "The moon hums from inside the stone."',
    'Aram: "I remember when this sky loved us."',
  ],
});

// ---- unlock story events (amended §20/§67) --------------------------------
// 1-2 is a story BEAT (positioned trigger in level.js — Raha is not yet
// unlocked there); the 1-3 / 1-5 events fire from the unlock authority as
// short letterboxed cinematic plates.
export const UNLOCK_CINEMATICS = Object.freeze({
  raha: {
    title: 'RAHA — THE WALL OF THE FOREST',
    text: 'The misunderstanding ends where the road begins. "Same hunt," says Raha. "Same enemy." She joins her shoulders to yours.',
  },
  aram: {
    title: 'ARAM — THE QUIET STAR',
    text: 'He steps from the shadows without explaining himself, purple light already in his palm. "Later," he says. "First, your brother."',
  },
  beat12: {
    title: 'A MISUNDERSTANDING',
    text: 'Steel answers steel in the deepening wood — until both fighters see the same shadow moving behind the other\'s shoulder.',
  },
});

// ---- Phase 12 finale cinematics (§52/§52.2 — authored final content) ------
export const BOSS_CINEMATICS = Object.freeze({
  pouriaEscape: {
    title: 'POURIA — THE LOST BROTHER',
    text: 'He steps out of the dark wearing a stranger\'s eyes. Blade up. No recognition. You cannot fight him. Run.',
  },
  pouriaEscaped: {
    title: 'ESCAPED',
    text: 'The shadow stops at the chapter\'s edge, screaming a name it cannot finish. You escaped what you could not fight — it remembers you.',
  },
  pouriaFight: {
    title: 'POURIA — FULL CORRUPTION',
    text: 'Shadow pours off him like smoke off a drowned fire. The chains ARE the corruption — break them, not the brother inside.',
  },
  pouriaWon: {
    title: 'THE BROTHER REMEMBERED',
    text: 'The last chain tears away and he drops to his knees — smaller, human, breathing. "Sara?" He knows your name again.',
  },
  queenStart: {
    title: 'THE QUEEN OF LIGHT',
    text: 'The glow behind the castle stands up: robes of captured dawn, a crown of grief. "LITTLE SINGER," she says, kindly — and raises her hand.',
  },
});

// ---- §52 THE CHOICE — three simultaneous beats, the player must choose -----
export const CHOICE_OPTIONS = Object.freeze([
  Object.freeze({
    key: 'free',
    cinematic: {
      title: 'THE PRISON OPENS',
      text: 'The gate-light bends toward the bars that hold your brother. Something must fill the space he leaves behind. You already know what.',
    },
  }),
  Object.freeze({
    key: 'leave',
    cinematic: {
      title: 'THE BARS HOLD',
      text: 'You turn away and the light dims behind you like a closing eye. The gate is open. The prison is not.',
    },
  }),
  Object.freeze({
    key: 'sacrifice',
    label: "ACCEPT THE QUEEN'S GIFT",
    hint: 'Aram\'s mother offers her own life force to replace Pouria\'s — brother and moon both saved.',
    cinematic: {
      title: 'THE MOTHER\'S CHOICE',
      text: 'The Queen lays her crown at her son\'s feet. "I have kept the light long enough. Let it keep them instead."',
    },
  }),
]);

// ---- Pouria-track story beats (§4/§52.2) ---------------------------------

// ---- presentation tuning (authored constants) -----------------------------
export const STORY_RANGES = Object.freeze({
  stone: 150,        // px — inscription readability range
  flashback: 90,     // px — flashback trigger range
  npc: 60,           // px — §68 interaction range (SPEC-locked)
});
export const STORY_DURATIONS = Object.freeze({
  inscription: 5.0,  // §67 "~5s on-screen"
  flashback: 2.0,    // §67 "2s presentation"
  npcDialogue: 5.0,  // §68 "Duration: 5s"
  cinematic: 3.0,    // unlock cinematic plate
  quip: 2.0,         // switch quip line
  chapterComplete: 4.0,  // §50 completion screen (non-blocking plate)
});

// ---- run-scoped story state (§71: lives on `game.story`) ------------------
export function createStoryState() {
  return {
    inscription: null,      // {text, x, until} active plate
    inscriptionShown: {},   // per stone id: last-shown stamp (re-showable)
    flashback: null,        // {id, text, until} active window
    flashbackSeen: {},      // per chapter id: latched (once per run)
    npcPrompt: null,        // {id, x} while Aram stands within range
    npcDialogue: null,      // {id, text, until}
    npcDone: {},            // per NPC id: latched (§68 never repeats per run)
    cinematic: null,        // {title, text, until} unlock plate
    chapterComplete: null,  // {id, title, text, until} §50 completion plate
    quip: null,             // {text, until, x} above the character
    quipCounts: { sara: 0, raha: 0, aram: 0 },   // authored selection (§72)
    pouriaBeats: {},        // beat keys latched this run
  };
}

// ---- the story step (runs BEFORE the player step in the fixed loop) -------
// Returns the number of `attack` events consumed as NPC interactions (§68:
// while the prompt is up, this J input is the interaction, not an attack).
// `events` is the drained edge list; consumed entries have type 'none'd out.
export function updateStory(game, player, level, events, dt) {
  const s = game.story;
  if (!s) return 0;
  let consumed = 0;
  const chapter = level.chapterAt(player.x);

  // --- NPC: §68 proximity (Aram active + <= 60px), prompt, J interact ----
  const npc = chapter.npc || null;
  s.npcPrompt = null;
  if (npc && !s.npcDone[npc.id] && player.character === 'aram' && !player.dead) {
    const dx = (player.x + player.w / 2) - npc.x;
    const dy = player.y + player.h / 2 - npc.y;   // statue plinth center
    if (Math.abs(dx) <= STORY_RANGES.npc && Math.abs(dy) <= 110) {
      s.npcPrompt = { id: npc.id, x: npc.x, y: npc.y };
      if (events) {
        for (let i = 0; i < events.length; i += 1) {
          if (events[i].type === 'attack') {
            // §68: this specific J input = interaction instead of attack.
            events[i].type = 'none';
            consumed += 1;
            s.npcDialogue = {
              id: npc.id,
              text: npc.dialogue,
              until: game.gameTime + STORY_DURATIONS.npcDialogue,
            };
            s.npcDone[npc.id] = true;
            s.npcPrompt = null;
            break;
          }
        }
      }
    }
  }
  if (s.npcDialogue && game.gameTime > s.npcDialogue.until) s.npcDialogue = null;

  // --- inscriptions: proximity-gated ~5s plates (re-showable) -------------
  if (s.inscription && game.gameTime > s.inscription.until) s.inscription = null;
  const stones = chapter.stones || [];
  for (let i = 0; i < stones.length; i += 1) {
    const st = stones[i];
    const dx = Math.abs((player.x + player.w / 2) - st.x);
    const dy = Math.abs((player.y + player.h / 2) - st.y);
    if (dx <= STORY_RANGES.stone && dy <= 150) {
      const last = s.inscriptionShown[st.id] == null ? -Infinity : s.inscriptionShown[st.id];
      if (game.gameTime - last >= STORY_DURATIONS.inscription
          && !(s.inscription && s.inscription.id === st.id)) {
        s.inscription = {
          id: st.id, text: st.text, x: st.x,
          until: game.gameTime + STORY_DURATIONS.inscription,
        };
        s.inscriptionShown[st.id] = game.gameTime;
      }
    }
  }

  // --- flashbacks: authored trigger range, once per run (latched) ---------
  if (s.flashback && game.gameTime > s.flashback.until) s.flashback = null;
  const fb = chapter.flashback || null;
  if (fb && !s.flashbackSeen[fb.id] && !player.dead) {
    const dx = Math.abs((player.x + player.w / 2) - fb.x);
    if (dx <= STORY_RANGES.flashback) {
      s.flashbackSeen[fb.id] = true;
      s.flashback = {
        id: fb.id, text: fb.text,
        until: game.gameTime + STORY_DURATIONS.flashback,
      };
    }
  }

  // --- positioned story beats (e.g. the 1-2 misunderstanding, §67): once
  // per run, proximity trigger, cinematic-plate presentation. -------------
  const beat = chapter.storyBeat || null;
  if (beat && !s.pouriaBeats[beat.key] && !player.dead) {
    if (Math.abs((player.x + player.w / 2) - beat.x) <= STORY_RANGES.flashback) {
      showStoryBeat(game, beat.key);
    }
  }

  // --- cinematic / quip / chapter-plate expiry (player-domain clocks) ---
  if (s.cinematic && game.gameTime > s.cinematic.until) s.cinematic = null;
  if (s.quip && game.gameTime > s.quip.until) s.quip = null;
  if (s.chapterComplete && game.gameTime > s.chapterComplete.until) s.chapterComplete = null;

  return consumed;
}

// Deterministic quip selection (§67 "authored selection... never randomized"):
// the incoming character's monotonic switch counter cycles their 10 lines.
export function showSwitchQuip(game, player) {
  const s = game.story;
  if (!s) return;
  const list = SWITCH_QUIPS[player.character];
  if (!list) return;
  const n = s.quipCounts[player.character] % list.length;
  s.quipCounts[player.character] += 1;
  s.quip = {
    text: list[n],
    until: game.gameTime + STORY_DURATIONS.quip,
  };
}

// Unlock cinematic plate (amended §20/§67): fired by the unlock authority.
export function showUnlockCinematic(game, key) {
  const s = game.story;
  const c = UNLOCK_CINEMATICS[key];
  if (!s || !c) return;
  s.cinematic = { title: c.title, text: c.text, until: game.gameTime + STORY_DURATIONS.cinematic };
}

// The 1-2 story beat (positioned trigger in level.js; Raha not yet unlocked).
export function showStoryBeat(game, beatKey) {
  const s = game.story;
  const b = UNLOCK_CINEMATICS[beatKey];
  if (!s || !b || s.pouriaBeats[beatKey]) return;
  s.pouriaBeats[beatKey] = true;
  s.cinematic = { title: b.title, text: b.text, until: game.gameTime + STORY_DURATIONS.cinematic };
}

// Phase 12 finale cinematics (§52/§52.2) — once per run per key.
export function showBossCinematic(game, key) {
  const s = game.story;
  const b = BOSS_CINEMATICS[key];
  if (!s || !b || s.pouriaBeats[key]) return;
  s.pouriaBeats[key] = true;
  s.cinematic = { title: b.title, text: b.text, until: game.gameTime + STORY_DURATIONS.cinematic };
}

// §50/§67 chapter completion plate — non-blocking letterbox showing the
// chapter's completeText as the player crosses into the next chapter.
export function showChapterComplete(game, chapter) {
  const s = game.story;
  if (!s) return;
  s.chapterComplete = {
    id: chapter.id,
    title: 'CHAPTER ' + chapter.id + ' — ' + chapter.name.toUpperCase(),
    text: chapter.completeText,
    until: game.gameTime + STORY_DURATIONS.chapterComplete,
  };
}

// §52 choice aftermath — the chosen option's cinematic rides the moon rise.
export function showChoiceCinematic(game, option) {
  const s = game.story;
  if (!s || !option || !option.cinematic) return;
  s.cinematic = {
    title: option.cinematic.title,
    text: option.cinematic.text,
    until: game.gameTime + 4.2,
  };
}
