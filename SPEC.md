# SPEC — Shadows of the Moon

> Mirror of the authoritative specification supplied by the project owner
> (Parts 1–3, sections 1–110). This document is the SINGLE SOURCE OF TRUTH.
>
> When two statements conflict, use this priority order:
> 1. Locked technical decisions
> 2. Explicit gameplay rules
> 3. Acceptance tests
> 4. Performance and security constraints
> 5. Visual requirements
> 6. Optional polish
>
> If genuine ambiguity remains, ask the user. Do not ask questions already
> answered by the SPEC.

==================================================
1. PROJECT
==================================================

Project title: Shadows of the Moon

Genre: 2D side-scrolling platformer.

Core experience: A cinematic, atmospheric, responsive platformer built entirely with procedural Canvas 2D graphics.

==================================================
2. FINAL DELIVERABLE
==================================================

A complete playable browser game.

Required technology:
- HTML
- CSS
- JavaScript
- ES Modules
- Canvas 2D API
- Browser APIs only

Must run directly in a browser.
Must not require a build step.
Must not require npm at runtime.
Must be deployable as a static GitHub Pages site.

Local dev/test server: python -m http.server 8000 --bind 127.0.0.1

The Python server is for development/testing only. NOT backend logic.
All gameplay executes client-side.

Runtime must work WITHOUT: backend services, database, API server, server-side logic, runtime network requests, CDN assets, external game services.

All visuals are procedural.
No external image, sprite, video, audio, or font assets.

==================================================
3. ENGINE DECISION — IMMUTABLE
==================================================

REQUIRED:
- Pure HTML
- Pure CSS
- Pure JavaScript
- ES Modules
- Canvas 2D

FORBIDDEN:
- WebGL, Three.js, Babylon.js, PixiJS
- Phaser, Kaplay, Melon.js, Impact.js, any game framework
- TypeScript, CoffeeScript, any compile-to-JS language
- React, Vue, Svelte, Solid, UI frameworks
- Vite, Webpack, Rollup, Parcel, esbuild, SWC, any bundler
- npm/yarn/pnpm runtime dependencies
- Godot, Unity, Unreal, Pygame, Love2D, Bevy
- CDN runtime dependencies
- backend, database

Never substitute another engine.
Python is allowed only for dev/test/orchestration scripts.
Playwright is allowed only as a test dependency.

==================================================
4. STORY
==================================================

The land is Midnight. The sun disappeared long ago. The Shadows
STOLE the moon and imprisoned it beyond a dark castle. There is
NO moon in the sky (amended canon — remove every moon render).
The sky is lit only by: ambient dim glow, starlight, fireflies,
the active character's subtle glow, and (from Act 2 onward) the
distant glow behind the castle — the "Light Behind the Castle"
(§55). On victory the moon RISES from behind the castle: the
payoff of the whole journey. Three warriors unite to recover it.

VILLAIN HIERARCHY (amended canon):
- MAIN VILLAIN — THE SHADOW KING: behind the scenes; the
  intelligence behind the Shadows; never a standard enemy.
- GENERALS (one per Act; each a distinct character; NONE of
  them is Pouria):
  - Act 1: SHADOW DEMON (دیوسایه) — a mindless beast
  - Act 2: SILENT LADY (بانوی خاموش) — a corrupted mother
  - Act 3: KING'S RIGHT HAND (دست راست شاه) — an elite
    warrior, intelligent, taunts the party
- PARALLEL TRACK — POURIA (پوریا), Sara's brother: personal
  antagonist for Sara only; NOT a general, NOT a mini-boss
  (§52.2)
- FINAL BOSS — THE QUEEN OF LIGHT (Aram's mother): three-phase
  fight at the end of chapter 3-5 (§52)

POURIA (amended canon — Sara's brother, parallel track):
- Pouria was captured by the Shadows.
- His life force powers the prison that holds the moon.
- He is partially corrupted — slowly transforming into a Shadow.
- Appearances (§67): torn scarf in 1-4 (hint only); glimpse
  through the bars in 2-3 (half-transformed, Sara recognizes
  him but cannot reach him); FIRST FIGHT in 2-5 (he attacks,
  does not recognize Sara; she must flee — she cannot kill
  him); 3-1 (Sara fears the next encounter); FINAL FIGHT in
  3-4 (full corruption; non-lethal mechanics, §52.2);
  resolution with the Queen of Light in 3-5.
- Killed or freed only via the ending (§52).

THE QUEEN OF LIGHT (final boss, end of chapter 3-5): revealed to
be Aram's mother. Three-phase battle, distinct from
mini-bosses. The emotional climax of the game (§52).

ENDINGS (amended — three, unlockable, §52/§62/§65):
- Ending 1 (Sacrifice): Sara sacrifices herself; Pouria
  survives.
- Ending 2 (Battle): Pouria survives but loses his memories of
  Sara.
- Ending 3 (Hidden Truth — true ending): Aram's mother
  sacrifices herself; Pouria and the moon are both saved.

CANON: all three warriors are FEMALE. She/her pronouns for Sara, Raha, and Aram in all dialogue, narration, and visual design. Raha: strong female warrior — broad imposing build, dark armor over red tunic, long red scarf, fierce female look (§18.2).

Sara:
- Element: Wind
- Color: Blue #4a9eff
- Traits: fast movement, double jump, dash

Raha:
- Element: Mountain
- Color: Red #e63946
- Traits: high HP, slam, shockwave

Aram:
- Element: Shadow
- Color: Purple #9d4edd
- Traits: magic, slow-motion, shield

Progressive character unlock (amended — replaces "all three from
the start"; see §20 for full rules):
- Chapter 1-1 / 1-2: Sara only (Raha appears as a rival in 1-2)
- Chapter 1-3 / 1-4: Sara + Raha (Raha formally joins in 1-3)
- Chapter 1-5: Sara + Raha + Aram (Aram joins mid-chapter)
- Chapter 2-1 onward: all three

NO XP, NO level-up, NO skill tree, NO equipment progression, NO
persistent power progression. Story-driven character availability
(§20) is the ONLY progression, and it is never XP-based.

==================================================
5. PLATFORM TARGETS
==================================================

Build/test: Cloud Linux, Python 3, Python Playwright, Headless Chromium.

Runtime: Windows desktop, Android, iPhone/iOS.

Keyboard intended only for desktop/testing.

Required env vars:
GITHUB_TOKEN
GITHUB_REPO
TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID

GITHUB_REPO format: owner/repository

Never print any secret value.

==================================================
6. LOCKED PLATFORM DECISIONS
==================================================

- Landscape gameplay only
- Portrait rotation overlay
- Fixed touch controls
- No swipe controls
- Logical resolution 1280x720
- 16:9 aspect ratio
- contain scaling
- letterboxing allowed
- render cap 60 FPS
- fullscreen attempt on first trusted gameplay gesture
- fullscreen failure never blocks gameplay
- touch-action:none on canvas and buttons
- minimum 3 simultaneous touches
- safe-area-inset support
- automatic visibility pause
- keyboard controls desktop-only

==================================================
7. RESPONSIVE CANVAS
==================================================

Logical resolution: 1280 x 720
Strict 16:9.

Contain scaling:
scale = min(viewportWidth / 1280, viewportHeight / 720)

Never stretch X and Y independently.
Letterbox/pillarbox allowed.

Touch coordinates mapped with the SAME transform as rendering:
logicalX = (clientX - renderOffsetX) / scale
logicalY = (clientY - renderOffsetY) / scale

DPR: effectiveDPR = min(window.devicePixelRatio || 1, 2)

canvasContext.imageSmoothingEnabled = false

Global camera ZOOM (amended): ZOOM = 1.25 applied to the world
transform. The 1280x720 logical canvas REMAINS the coordinate and
contain-scaling space (§6 unchanged); the visible gameplay window
becomes ~1024 x 576 world units (§53). A 62px-tall character
renders ~77px on screen (~13% of viewport height). Touch
coordinate mapping stays in the 1280x720 logical canvas space.

==================================================
8. ORIENTATION AND PAUSE SEMANTICS
==================================================

Portrait and visibility pause share one resume rule.
The game NEVER auto-resumes after a pause condition.

8.1 Entering a pause condition
When entering: portrait mode OR hidden document OR manual pause:

- pause gameplay simulation
- stop gameTime
- reset fixed-step accumulator to 0
- disable gameplay input
- hide gameplay touch controls
- keep physics frozen

Manual pause shows pause overlay.
Portrait shows rotation overlay.
Visibility pause uses pause overlay after document becomes visible.

8.2 Portrait
Viewport becomes portrait:
- pause, disable gameplay input, hide controls, show rotation overlay, do not advance physics

Returns to landscape:
- hide rotation overlay
- REMAIN PAUSED
- require explicit Resume

8.3 Visibility
Document hidden:
- pause, reset accumulator to 0, disable gameplay input, hide controls

Document visible again:
- remain paused
- reset accumulator again
- require explicit Resume

8.4 Explicit Resume
Permitted only when: document visible AND viewport landscape.

Resume sources: Resume UI button, desktop keyboard R.

A condition disappearing NEVER auto-resumes gameplay.

==================================================
9. TIME MODEL
==================================================

ONE global gameplay clock: gameTime
Do not create a second global gameplay clock.

fixedDt = 1 / 60

Pause: gameTime does not advance.

Hit-stop:
- gameplay simulation freezes
- gameTime does not advance
- input continues, UI continues, rendering continues
- presentation-only effects may continue
- duration: 0.06 to 0.08 seconds (deterministic value chosen: 0.07 s / 70 ms)

==================================================
10. SLOW-MOTION TIME DOMAINS
==================================================

During Aram's Slow-motion:

Player simulation: 1.0
Projectile simulation: 1.0
Camera gameplay update: 1.0
Particles: 1.0
Enemy movement: 0.35
Enemy AI timers: 0.35
Enemy attack wind-up: 0.35
Enemy attack cooldown: 0.35
Enemy stagger duration: 0.35
Enemy return timer: 0.35
Enemy alert timer: 0.35
Enemy edge-detection pause: 0.35

enemySimDt = fixedDt * slowMotionFactor
where slowMotionFactor = 0.35 during Slow-motion, 1.0 otherwise.

Do NOT multiply enemy velocity by 0.35 AND use enemySimDt=0.35.
Apply the slowdown EXACTLY ONCE through the simulation delta.

Adaptive difficulty is separate:
effectiveEnemySpeed = authoredSpeed * adaptiveSpeedMultiplier
Then integrate using enemySimDt.

==================================================
11. COOLDOWNS
==================================================

TWO categories only.

11.1 Player ability cooldowns:
- use global gameTime
- NOT slowed by Aram Slow-motion
- freeze during Pause
- per-character, independent
- authoritative
- sole source of truth for cooldown availability
- UI derives from same state
- UI animation timing NEVER makes an ability available early

11.2 Enemy AI timers:
- remaining-duration values
- decrement using enemySimDt
- slowed by Slow-motion
- freeze during Pause

Enemy AI timers include: alert delay, attack wind-up, attack cooldown, stagger duration, return timer, edge-detection pause, Brute radial cooldown.

Presentation-only timers are outside these categories and NEVER affect gameplay availability.

==================================================
12. MAIN GAME LOOP
==================================================

- requestAnimationFrame
- fixed timestep
- accumulator
- 60 Hz physics
- max 5 simulation steps per render callback
- wall-clock delta cap 0.1 s

Structure:
1. obtain wall-clock delta
2. clamp to 0.1 s
3. accumulate
4. execute up to 5 fixed steps
5. subtract processed time
6. render only if 60 FPS gate allows

Never use unbounded catch-up.
On visibility/orientation pause: accumulator = 0

==================================================
13. 60 FPS RENDER GATE
==================================================

Never intentionally render above 60 FPS.
requestAnimationFrame may fire at 60/90/120/144 Hz.

Gate rendering to approximately 1000/60 ms between actual renders.

Maintain lastRenderTime.
Do NOT update lastRenderTime when render skipped.
Physics accumulation continues independently.
Do NOT skip physics because render was skipped.
Render cap is presentation-only.

==================================================
14. TOUCH INPUT
==================================================

Fixed-position DOM buttons. No swipe.

Every gameplay touch button MUST:
- use position:fixed
- respect safe-area-inset
- use touch-action:none
- have own touchstart, touchend, touchcancel handlers
- use passive:false where preventDefault() called
- not depend on click
- not use event delegation

Track each active touch separately.
At least 3 simultaneous touches required.

Required simultaneous example: movement + jump + attack.

Desktop keyboard handling SEPARATE.

Optional navigator.vibrate(...) must fail gracefully.

==================================================
15. TOUCH BUTTON LAYOUT
==================================================

Minimum visual dimensions: 56 x 56
Ideal: 70–80 px

Buttons:
Left: bottom-left, 70x70, hold
Right: beside Left, 70x70, hold
Jump: bottom-right, 80x80, tap
Attack: upper-right, 60x60, tap
Special: right-middle, 60x60, tap/hold
Sara selector: bottom-center, 56x56, tap
Raha selector: bottom-center, 56x56, tap
Aram selector: bottom-center, 56x56, tap
Pause: top-right, 56x56, tap

Character selectors (amended): all three slots are ALWAYS visible.
A locked slot renders greyed out + lock icon and is NOT
interactive (no tap, no key). On unlock: burst of character-color
particles. Selection happens only among unlocked characters (§20).

Default opacity 0.5, active 0.9.

Hit targets expand 10px on all sides.
Expanded regions must NOT overlap adjacent controls.
If overlap would occur, split at midpoint between adjacent button centers.

Gameplay touch controls HIDDEN during Pause and Portrait.

==================================================
16. KEYBOARD MAPPING
==================================================

A / Left Arrow      move left
D / Right Arrow     move right
Space / Up Arrow    jump
J                   attack
K                   special
1                   select Sara (only if unlocked, §20)
2                   select Raha (only if unlocked, §20)
3                   select Aram (only if unlocked, §20)
Escape              pause
R                   explicit resume

==================================================
17. FIRST-GESTURE FULLSCREEN
==================================================

First trusted user gesture that starts a new run MUST attempt fullscreen.
Typical trigger: Start Journey button.

If rejected:
- continue normally
- do not block gameplay
- do not crash
- do not retry every frame

Best-effort.

==================================================
18. CHARACTER ROSTER
==================================================

CANON: Sara, Raha, and Aram are all FEMALE. She/her pronouns for all three, everywhere: dialogue, narration, visual design.

Base max HP:
Sara: 5
Raha: 8
Aram: 6

Availability (amended — progressive unlock, §20):
- Chapter 1-1 / 1-2: Sara only (Raha appears as a rival in 1-2)
- Chapter 1-3 / 1-4: Sara + Raha (Raha formally joins in 1-3)
- Chapter 1-5: Sara + Raha + Aram (Aram joins mid-chapter)
- Chapter 2-1 onward: all three

Character scale (amended): every character dimension is x1.3
(Sara 30x48 -> 38x62; Raha 34x48 -> 44x62; Aram 32x48 -> 40x62).
Enemy dimensions scale x1.3 to match (§29); collectibles x1.3
(§48); platform visual treatment matches (§55). Physics
constants are UNCHANGED (§36). Global camera ZOOM = 1.25 (§7/§53).

18.1 Sara
Female. Wind. #4a9eff. Visual 36 px. Hitbox 38x62 (amended x1.3).
Appearance: slender; long blonde hair #e8d174 with visible strands
(2-3 px sway); blue tunic #4a9eff with collar and belt buckle;
darker blue #1e5aa8; short cloak #1e5aa8 with cloak clasp; brown
boots #6a4a30 with boot straps. Face: 2 blue eyes, small mouth,
light blush.
Animations: idle (bob + hair sway), attack (quick arm extension), special (crouch + blue afterimage).
Abilities: double jump, dash, knife.
WEAKNESSES (amended — "fragile and weak"): lowest HP (5);
single-target only, no AoE; cannot break armor or stone; no crowd
control; dash's only defense is its short pass-through window (§23).

18.2 Raha
Female. Mountain. #e63946. Visual 42 px. Hitbox 44x62 (amended x1.3).
Appearance: broad and imposing female warrior; dark hair #241812 swept into a fierce high warrior braid with loose front strands, the braid visible under her dark helm; dark armor #2a2a2a with pauldrons, chest plate, and gauntlets, worn over red tunic #e63946; long red scarf #8a1f2a; dark boots #1a0d0d. Face: 1 scar on her cheek, 2 dark eyes, stern mouth. Subtle feminine cues (braid, waist taper, scarf flow) while keeping her broad, powerful silhouette.
Animations: idle (chest rise/fall), attack (wide arm swing), special (airborne tuck).
Abilities: slam, shockwave.
WEAKNESSES (amended — "slow and blind"): slowest movement; single
weak jump (~99px); no ranged attack; no dash (no escape); heavy —
fast fall, low air control.

18.3 Aram
Female. Shadow. #9d4edd. Visual 38 px. Hitbox 40x62 (amended x1.3).
Appearance: slim; silver-white hair #eee8ff; outer robe #9d4edd with robe trim and magic runes on the sleeves; inner robe #1a1030; floating orb #c77dff with pulsing glow. Face: 2 eyes with glowing purple pupils, subtle smile.
Animations: idle (subtle float), attack (point forward + purple glow), special (outline pulse).
Abilities: magic, slow-motion, shield.
WEAKNESSES (amended — "cooldown-dependent"): weak direct damage
(magic 1, slow fire rate); dependent on cooldowns; medium HP (6);
no mobility (no dash).

18.4 Strategic situation matrix (amended — advisory design intent)
Group of enemies: Sara weak / Raha strong / Aram medium
Single strong enemy: Sara medium / Raha strong / Aram strong
Tight space: Sara strong / Raha weak / Aram medium
Wide gap: Sara strong / Raha weak / Aram weak
Stone wall: Sara weak / Raha strong / Aram weak
Fast enemy: Sara strong / Raha weak / Aram strong with slow
Armored enemy: Sara weak / Raha strong / Aram weak
Ranged enemy: Sara medium / Raha weak / Aram strong
Boss: Sara medium / Raha strong / Aram strong
Result: the player is pushed to switch characters (§20, §29.1).

==================================================
19. HEALTH AND HEART CONTAINERS
==================================================

Base max HP per character.
Heart containers are GLOBAL RUN-STATE upgrades, not character-specific.

Heart containers are assembled from heart fragments:
3 fragments = 1 heart container.
Fragments are awarded by chapter mini-bosses (§50); chapters
substituting a special challenge award no fragment.
Container total = authored fragment count / 3 (up to 5 when
every chapter's mini-boss awards a fragment).

heartCount
effectiveMaxHp = baseMaxHp + heartCount
Maximum: baseMaxHp + authored container total

Heart containers:
- reset at start of new run
- NOT persisted to localStorage
- remain collected after checkpoint respawn
- remain collected after Restart Chapter

Health pickups: authored per chapter in LEVEL_DATA
(target ~1 per chapter).

Each restores exactly 1 HP.
HP cannot exceed effective max HP.
Each has fixed authored ID.
Collected health pickups remain collected for entire current run.

==================================================
20. CHARACTER SWITCHING
==================================================

Progressive unlock (amended): only UNLOCKED characters are
selectable. Sara starts unlocked; Raha unlocks at chapter 1-3;
Aram unlocks at chapter 1-5 (story events, §4/§67). Unlocks
persist via save v2 unlockedCharacters (§63) and are NEVER reset
by a new run. Selectors for locked characters render greyed +
lock icon and are NOT interactive (§15); keys 1/2/3 select only
unlocked characters (§16).

newHp = round(newEffectiveMaxHp * (currentHp / oldEffectiveMaxHp))
Clamp: 0 .. newEffectiveMaxHp

invulnerabilityRemaining = max(existingInvulnerabilityRemaining, 0.35)
Do NOT add durations.

Blocked while: Sara Dash active, Raha Slam active, player dead, death screen, victory screen.

Cooldowns remain independent.

20.1 Character-Switch Combos (amended — NEW)
If the player switches character within 1.5 s of an ability use:
- Sara dash -> Raha slam: the slam deals 3x damage
- Raha slam -> Aram slow-motion: slow duration x2
- Aram slow-motion -> Sara dash: the dash ignores gravity (flight)
Feedback: brief particle burst + distinct sound cue. The combo is
a timed modifier on the incoming ability; base ability rules
(§23-§25) are otherwise unchanged.

20.2 Unlock tutorials (amended — NEW)
Brief 3-5 second NON-BLOCKING hints when each character unlocks.
Gameplay NEVER pauses for a tutorial.
- Sara (game start): move + jump + dash hints
- Raha (chapter 1-3): slam + shockwave hints
- Aram (chapter 1-5): magic + slow-motion + shield hints

==================================================
21. COMBAT DAMAGE
==================================================

Player damage:
Sara knife: 1
Raha shockwave: 1
Raha slam impact: 2
Aram magic shot: 1
Sara dash-through: 1 (once per enemy per dash, §23)
Stomp: 1

Enemy resistance (amended, §29.1): Armored ABSORBS Aram magic
shots (0 damage). Every other weakness/resistance entry in §29.1
is strategic efficiency of these same damage numbers — not damage
immunity.

Enemy contact damage:
Patroller: 1
Chaser: 1
Armored: 1
Brute: 2

==================================================
22. PLAYER DAMAGE INVULNERABILITY
==================================================

After damage that actually decreases HP:
1.0 second invulnerability.

No contact damage, no Brute radial, no projectile, no stacking.

Visual: sprite flashes ~20 Hz.

A hit blocked by Shield or existing invuln:
- no HP reduction
- no damageTaken increase
- no Combo reset

==================================================
23. SARA ABILITIES
==================================================

Knife: J, 0.30 s cooldown, 1 damage, instant, ranged throw.
Dash: tap K, 0.22 s duration, 1.4 s cooldown.
Dash passes THROUGH enemies (amended — was mobility-only, 0 damage):
each enemy intersected during the dash takes 1 damage, once per
enemy per dash. During the dash the player ignores enemy contact
damage; the short pass-through window is Sara's ONLY defensive
dash property.
Kill rhythm ("dance of death"): stomp -> bounce -> double jump ->
stomp again; knife while moving. Sara must stay in motion.

==================================================
24. RAHA ABILITIES
==================================================

Shockwave: tap J, 0.55 s cooldown, 1 damage, instant, RADIAL —
damages multiple targets in range.
Slam: hold K airborne, 1.8 s cooldown.

Airborne Slam: enters fast-fall, removes fall-speed cap during descent, on landing generates 90px radial impact.

The 90px impact:
- deals 2 damage to enemies intersecting
- breaks breakables intersecting
- large camera shake

Grounded K (Ground Pound): same 90px impact, no fast-fall.

Kill rhythm ("one hit, one kill"): jump -> slam -> shockwave.
Raha is the tank: walk into groups and explode them.

Deterministic circle-vs-AABB intersection.

==================================================
25. ARAM K TAP/HOLD
==================================================

Threshold: 300 ms

On K touch/start: record press time, do not immediately choose.

Released before 300ms → Slow-motion
Held to 300ms → Shield

Once triggered, same K press cannot trigger the other.

If requested ability on cooldown: do nothing. Do NOT silently convert.

If one Aram K ability currently active: other K ability cannot activate.

25.1 Slow-motion
Duration: 3.0 s. Cooldown: 3.5 s.
Player at 1.0 sim. Enemy systems at 0.35.

25.2 Shield
Duration: 1.4 s. Cooldown: 2.5 s.
Fully prevents damage while active.

25.3 Magic
J, 0.36 s cooldown, 1 damage, ranged shot, slow fire rate.

25.4 Kill rhythm ("before they know it")
slow-motion -> magic -> shield -> magic. Aram is the chess
player: control, weaken, counter. Shield absorbs a hit and opens
the counter.

==================================================
26. COOLDOWN UI
==================================================

Primary special:
Sara: Dash
Raha: Slam
Aram: Slow-motion

Display primary as half-circle ring.
Shield shown as smaller secondary availability indicator.
UI derives from same authoritative state.
Never maintain independent UI cooldown timer.

==================================================
27. ENEMY HP
==================================================

Patroller: 1
Chaser: 1
Armored: 2
Brute: 3

==================================================
28. ENEMY IDENTITY
==================================================

Every enemy in LEVEL_DATA has a fixed stable string ID.
Chapter-scoped format: c<act>_<chapter>_enemy_<nnn>
Examples: c1_1_enemy_001, c1_1_enemy_002, c2_3_enemy_001, c3_5_enemy_005

IDs: authored, stable, deterministic, never runtime-generated.

Run state: defeatedEnemyIds (Set or equivalent).

On DEAD transition:
1. if ID already in defeatedEnemyIds, award nothing
2. else add ID
3. mark dead/non-collidable
4. award score once
5. increment kills once

Previously defeated enemies NEVER return as active entities during same run.

After checkpoint respawn / Restart Chapter: omitted from active enemy list.
Optional cosmetic memorial only.

They may NOT: move, attack, damage, collide, receive damage, award score, award kills, drop rewards.

Authoritative anti-duplicate-score rule.
defeatedEnemyIds reset only on new run.

==================================================
29. ENEMY TYPES
==================================================

Patroller: 42x62, speed 45, patrols [minX, maxX]

Chaser: 42x62, speed 120, chase trigger: horizontal distance <= 240px, vertical center diff <= 64px, line of sight clear

Armored: 44x65, speed 60, HP 2, thicker armor, faint red chest arrow, HP bar

Brute: 52x78, speed 35, HP 3, has separate radial attack

(Dimensions amended x1.3 to match the character scale pass, §18;
speeds and HP unchanged.)

29.1 Enemy weaknesses and resistances (amended — strategic depth)
Enemy     | Weak to                | Resistant to
Patroller | Sara knife (fast kill) | Raha slam (overkill)
Chaser    | Aram slow (stops it)   | Sara knife (escapes)
Armored   | Raha slam (breaks)     | Aram magic (absorbed)
Brute     | Aram shield (block)    | all (high HP)

Mechanical rule: Armored takes 0 damage from Aram magic shots
(absorbed by the armor). Every other entry is strategic
efficiency of the §21 damage numbers — by design the player is
forced to switch characters (§18.4, §20).

==================================================
30. ENEMY VISUAL STYLE
==================================================

Dark blocky body of 15–20 stacked armor cubes, long red scarf/cloak, two glowing white eyes, short dark blade.

Armor palette: #0a0a0a through #2a2a2a
Cloth palette: #8a1010 through #c02020
Eye color: #f0f0f0

Only enemy eyes may use shadowBlur.

==================================================
31. ENEMY ANIMATION STATES
==================================================

States: idle, walk, run, jump, crouch, attack, hurt, death

Walk → Run: speed > 200
Run → Walk: speed < 180
(Hysteresis prevents oscillation.)

Any → Jump: vy < 0
Falling uses jump presentation.

Grounded AI may crouch per AI decision.
Eligible enemies may Attack per AI decision + attack timer ready.
Patroller/Chaser/Armored attack state is visual telegraph only.

On damage: hurt, 0.15 s, ~2px shake.
After 2 consecutive hits within 1.0 s: staggered, 0.5 s, uses enemySimDt.

On HP <= 0: death.
Immediately non-collidable, non-damaging, AI inactive.
May shatter into 8–10 cubes.

==================================================
32. NON-BRUTE ENEMY ATTACKS
==================================================

Patroller/Chaser/Armored: attack animation is a TELEGRAPH ONLY.
No separate player-damage hitbox.
Actual player damage is contact damage only.
Do not invent additional attack damage.

==================================================
33. BRUTE RADIAL ATTACK
==================================================

Trigger: player within ~90px.
Wind-up: 0.5 s.
Visual: red pulse.
Impact radius: 100px.
Damage: 2.
Cooldown: 2.5 s (enemy AI timer, slowed by Slow-motion).

During wind-up:
- if Brute takes damage, attack interrupted
- if player leaves radius before resolution, attack misses

Shield and i-frames block normally.

==================================================
34. ENEMY AI
==================================================

Line of sight: horizontal raycast; solid walls block.

Alert: 0.4 s pause, "!" displayed, timer uses enemySimDt.
Return: 1.5 s back to post if player outside chase range, uses enemySimDt.

Attack wind-up for non-Brute: 0.3 s visual telegraph (tint + backward step).

Edge detection: 0.2 s pause then turn.

Stagger: 2 hits within 1.0 s → 0.5 s stun, uses enemySimDt.

Group flanking advisory only. If ≥2 eligible enemies within 150px:
- select two deterministically by stable authored IDs
- one left-side flank, one right-side flank

Flanking NEVER overrides: collision safety, edge detection, patrol bounds, walls, authored geometry.
If flank path blocked: standard chase.

No unseeded random gameplay AI.

==================================================
35. PLAYER-ENEMY COLLISION
==================================================

Stomp takes priority over side contact if geometric conditions valid.
Otherwise side contact can damage.
Player damage subject to: Shield, i-frames, death state.

==================================================
36. PHYSICS
==================================================

Deterministic fixed 60Hz.

Gravity: 2400
Maximum fall: 1500

Sara jump velocity: -800
Raha jump velocity: -690
Aram jump velocity: -730

Ideal single-jump heights: Sara ~133px, Raha ~99px, Aram ~111px.

Variable jump: if released and vy < -180: vy += 1800 * fixedDt

Coyote time: 0.10 s
Jump buffer: 0.12 s

==================================================
37. JUMP RULES
==================================================

Sara: max two jumps per airborne cycle, second in midair.
Raha: one jump.
Aram: one jump.

Landing resets airborne jump availability.

Second Sara jump only after first jump actually began.
Calling jump twice in consecutive frames is NOT valid implementation.

==================================================
38. SARA DOUBLE-JUMP ACCEPTANCE
==================================================

Minimum: 260px

Measurement: from feet at first takeoff to highest feet position during full double-jump maneuver.

Test MUST:
1. hold Jump during first jump
2. not release early
3. trigger second jump at apex or max-height timing under normal rules
4. second jump while airborne
5. avoid ceiling collision
6. measure actual simulation state
7. NOT use consecutive-frame jump calls

Configured physics intended to provide margin.
If implementation falls below 260px, fix implementation, do NOT weaken the test.

Amended note: dash-through-enemy damage (§23) applies only to
enemies intersecting the dash path. It does NOT alter jump
physics, jump availability, or the height measurement — the
double-jump test procedure above is unaffected.

==================================================
39. COLLISION RESOLUTION
==================================================

Two passes.

Pass 1 Horizontal: integrate X, resolve overlaps, correct X, set vx = 0 when blocked.

Pass 2 Vertical: integrate Y, resolve overlaps, correct Y, set vy = 0, set onGround.

Landing: vy > 0 AND prevY + h <= platform.y + 2
Ceiling: vy < 0 AND prevY >= platform.y + platform.h - 2

Physics MUST NOT: touch DOM, render, access network, access localStorage, trigger audio, modify unrelated entities.
Physics may mutate ONLY state explicitly passed in.

==================================================
40. STOMP
==================================================

Stomp: player.vy > 200 AND crosses enemy top surface.
Damage: 1. Bounce velocity: -480.

If stomp reduces enemy HP to 0: qualifies for Perfect Landing.
If enemy survives: normal stomp, no Perfect Landing.

==================================================
41. PERFECT LANDING
==================================================

Valid only if:
- stomp geometrically valid
- stomp damage directly reduces enemy HP to zero

Does NOT apply to: side attacks, Raha Slam, other attacks, stomp where enemy survives.

==================================================
42. OFF-SCREEN ENTITIES
==================================================

May reduce expensive rendering work.
May reduce AI decision frequency ONLY if essential deterministic state stays correct.
Never remove gameplay state merely for being off-screen.
Never permanently delete an entity for leaving camera.

==================================================
43. DEATH
==================================================

Fall death: player.y > activeChapterGroundY + 400
HP death: player.hp <= 0

Both use same checkpoint/death system.

==================================================
44. CHECKPOINTS
==================================================

Exactly one at the start of each chapter: 15 total.
Auto-activated on chapter entry.

Additional mid-chapter checkpoints may be authored at designer
discretion.

Each: authored trigger rectangle, respawn position, checkpoint ID.
Crossing rectangle activates.
Remains active for current run.
Newest checkpoint is active respawn.
Chapter-start checkpoints persist to localStorage via save v2
chapterCheckpoints (§63). Mid-chapter checkpoints are
run-local, never persisted.

==================================================
45. CHECKPOINT RESPAWN
==================================================

On death with active checkpoint:
- respawn at active checkpoint
- restore HP to effective max HP
- restore valid standing state
- reset current respawn-chapter transient combat/world state
- preserve run progress

Reset:
- active enemies NOT in defeatedEnemyIds
- projectiles
- particles
- breakable platforms
- chapter-local transient state

Preserve:
- score
- kills
- currentRunCoins
- collectedCoinIds
- collectedCrystalIds
- collectedHealthIds
- collectedHeartIds
- heartCount
- defeatedEnemyIds
- Combo state
- active checkpoint
- adaptive-difficulty state

Do NOT:
- write localStorage
- show final death screen
- restore collected collectibles
- restore defeated enemies

Previously completed earlier chapters remain completed.
Reset scope is the respawn checkpoint's chapter only.

==================================================
46. RESTART CHAPTER
==================================================

Pause menu contains Restart Chapter.

Restart Chapter:
- move to beginning of current chapter
- restore HP to effective max HP
- reset non-defeated enemies in that chapter
- reset projectiles
- reset particles
- reset breakable platforms
- reset chapter-local transient state

Preserve:
- score, kills, currentRunCoins
- collected collectibles
- heartCount
- defeatedEnemyIds
- active checkpoint
- adaptive-difficulty state
- character availability

Do NOT restore:
- collected coins/crystals/health/hearts
- defeated enemies

Chapter intervals:
Chapters are contiguous and non-overlapping; each chapter's
[startX, endX) derives from its authored length (~3000–4000px,
§50). currentChapter is computed from the player's X position
within the authored chapter bounds.
No ambiguous boundaries.
Restart Chapter is NOT a death.

==================================================
47. NEW RUN
==================================================

Starts from chapter 1-1.
Resets: score, kills, currentRunCoins, heartCount, collectedCoinIds, collectedCrystalIds, collectedHealthIds, collectedHeartIds, defeatedEnemyIds, Combo, active checkpoint, adaptive difficulty, chapter completion (completedChapters), temporary effects, current character state.

Persistent localStorage remains.

==================================================
48. COLLECTIBLE IDS
==================================================

Every collectible has fixed authored ID.
Collectible IDs are chapter-scoped, mirroring enemy IDs (§28):
c<act>_<chapter>_<kind>_<nnn>
Examples: c1_1_coin_001, c1_1_crystal_001, c2_3_health_001, c3_5_heart_001

Run collections:
collectedCoinIds
collectedCrystalIds
collectedHealthIds
collectedHeartIds

Collected collectibles remain absent for entire current run.
Checkpoint/Restart NEVER restore collected.
New run clears collections.
NOT persisted to localStorage.

Collectible dimensions scale x1.3 with the character scale pass
(§18); pickup radii scale to match.

==================================================
49. ADAPTIVE DIFFICULTY
==================================================

Per-act (5 chapters per act).
Track consecutive deaths within same act.
Death includes death → checkpoint respawn.
Restart Chapter is NOT a death.

Different act entered: actDeathStreak = 0 (reset on act change)
Death in current act: actDeathStreak += 1

actDeathStreak >= 3: adaptive activates for that act for remainder of current run.

Effect: enemy movement speed multiplier = 0.8
ONLY movement speed modified.

Do NOT change: enemy HP, player damage, enemy damage, attack damage, score, player speed, player cooldowns.

Persists until run ends.
Different act → its own counter.

==================================================
50. LEVEL STRUCTURE
==================================================

Total world width: ~50000px. Exactly three acts of five chapters
each: 15 chapters total. Zones are renamed ACTS internally.

Act 1 — Three Strangers: chapters 1-1 .. 1-5, dark forest,
  Patroller focus; chapter 1-1 is the tutorial chapter — a gap-free
  spawn stretch, with the first guarded gap near the chapter's end
Act 2 — The Dark Road: chapters 2-1 .. 2-5, dark road,
  Chaser + Armored, first gaps/breakables
Act 3 — Heart of Darkness: chapters 3-1 .. 3-5, castle
  approach, all enemy types, final battle

Each chapter:
- authored length ~3000–4000px (contiguous, non-overlapping)
- ~8–10 minutes of play
- structure: intro inscription → platforming/combat → mini-boss
  or special challenge → completion screen
- auto-activated checkpoint at chapter start (§44)
- chapter-scoped enemy IDs (§28) and collectible IDs (§48)

PER-CHAPTER THEMES (amended)
Act 1: 1-1 forest (leaves, light rays) · 1-2 swamp (fog,
fireflies) · 1-3 cave (dripping water, bats) · 1-4 ruins (dust,
broken statues) · 1-5 shadow lair (dark mist, floating debris).
Act 2 and Act 3 follow the same per-chapter variation pattern
(authored with the chapters, Phase 12).

ENVIRONMENTAL GATES (amended — strategic routing)
Optional authored chapter features (LEVEL_DATA):
- wide gaps: only Sara (dash) can cross
- stone walls: only Raha (slam) can break
- magic barriers: only Aram (magic shot) can dispel
- time-locked doors: only Aram (slow-motion) can open
Gates never block a chapter-start checkpoint and never soft-lock
a route: a path using only UNLOCKED characters (§20) always
exists.

MINI-BOSS SYSTEM
Every chapter ends with a mini-boss OR a special challenge
(timed run, gauntlet) at designer's discretion.
Mini-bosses reuse the Brute/Armored templates with size and HP
multipliers:
- HP: 6-10
- distinct telegraphed attack pattern
- reward: 1 heart fragment; 3 fragments assemble into 1 heart
  container (§19)
Special-challenge chapters award no heart fragment.

==================================================
51. LEVEL DATA
==================================================

All gameplay placement authored in: src/level.js
No random runtime placement.

LEVEL_DATA contains exactly 15 chapter objects, one per chapter
"1-1" .. "3-5". Each chapter object:
{ id, name, platforms, enemies, collectibles, checkpoint,
  miniBoss, inscription, completeText }

- id: "1-1" .. "3-5"
- name: authored chapter name
- platforms: solid + breakable platforms
- enemies: enemy placement, enemy ID, enemy type, patrol bounds
- collectibles: coins (ID, rarity), crystals, health pickups,
  hearts, heart fragments
- checkpoint: chapter-start checkpoint trigger + respawn
- miniBoss: mini-boss spec or special challenge
- inscription: intro inscription text
- completeText: chapter completion screen text

Also authored:
- mid-chapter checkpoints (designer discretion)
- NPC placement
- final arena (chapter 3-5): Queen of Light + moon gate

Rare coin placement authored.
Target proportion ~15%. Design target only.
Never a runtime random-roll rule.

==================================================
52. FINAL BATTLE
==================================================

Final arena at the end of chapter 3-5.
Final boss: the Queen of Light — Aram's mother.
Three-phase battle (amended villain-track canon), distinct from
chapter mini-bosses. This is the emotional climax of the game.
Authored with the final content (Phase 12).

During the battle the light behind the castle FLICKERS (§55).
On victory the moon RISES from behind the castle — the payoff of
the whole journey.

Moon gate CLOSED while the Queen of Light remains undefeated.
Gate opens only when the Queen is defeated.
Open gate: white glowing circular portal.

THE CHOICE (amended, §4/§52.2/§67): at the climax of chapter
3-5 three things happen simultaneously —
1. the Queen of Light is freed
2. the Shadow King is exposed
3. Pouria is on the brink
The player must choose:
- Free Pouria — weakens the moon prison (another source of
  power must be found); involves sacrifice
- Leave Pouria — the moon stays imprisoned (bad outcome)
- Third option, true-ending path ONLY (§52.2): Aram's mother
  offers her own life force to replace Pouria's
The choice feeds the ending determination.

THREE ENDINGS (amended — unlockable):
- Ending 1 (Sacrifice): Sara sacrifices herself; Pouria
  survives. Trigger: Rank S OR damageTaken <= 2 (§62).
- Ending 2 (Battle): Pouria survives but loses his memories of
  Sara. Trigger: Rank A or B (Rank C defaults here).
- Ending 3 (Hidden Truth — true ending): Aram's mother
  sacrifices herself; Pouria and the moon are both saved.
  Trigger: all 3 moon crystals collected + NPCs interacted
  (authored final-content condition).
Priority when multiple triggers hold: Ending 3 > Ending 1 > Ending 2.

Level completes when currently active character touches open gate.

Completion order:
1. award completion score
2. finalize final score
3. compute rank
4. update persistence
5. switch to Victory state
6. stop gameplay simulation

"Travel Again" starts new run.

==================================================
52.2 POURIA — PARALLEL TRACK
==================================================

Pouria (پوریا), Sara's brother, is a PARALLEL PERSONAL
ANTAGONIST tied to Sara's arc. He is NOT one of the Shadow
King's generals, NOT a mini-boss, and NOT part of the standard
enemy roster (§29). His arc runs parallel to the main plot
(villain hierarchy, §4).

APPEARANCES:
- Chapter 1-4: Sara finds his torn scarf — hint only
- Chapter 2-3: glimpse through the bars — half-transformed;
  Sara recognizes him but cannot reach him
- Chapter 2-5: FIRST FIGHT — he attacks and does not recognize
  Sara; she must flee (she cannot kill him); authored as the
  chapter's special challenge (§50)
- Chapter 3-1: Sara fears the next encounter (story beat)
- Chapter 3-4: FINAL FIGHT — full corruption; Sara must fight
  him non-lethally (mechanics below); authored as the chapter's
  special challenge (§50)
- Chapter 3-5: resolution with the Queen of Light (§52)

Killed or freed only via the ending (§52).

3-4 FIGHT MECHANICS — NON-LETHAL:
Pouria cannot be killed. He tracks TWO pools:
- corruption HP — the only pool the player may deplete
- real HP — must remain untouched
Player tools:
- Sara's dash: dodge and strike the shadow chains (special
  weak points) without hitting Pouria himself
- Raha's slam: break the corruption armor around him
- Aram's slow-motion: exposes his human side briefly
Victory condition: reduce corruption HP to 0 without depleting
his real HP.
Fail-safe teaching rule: if the player uses lethal damage only,
Pouria's real HP drops to 1 and he becomes INVULNERABLE until a
non-lethal mechanic is used — teaching the mechanic without
punishing.

==================================================
53. CAMERA
==================================================

Framerate-independent:
camera += (target - camera) * (1 - exp(-factor * dt))

Factors: x = 7, y = 5

Look-ahead: 40px in facing direction
Add 20px when player speed > 300px/s

Global ZOOM = 1.25 (amended): the camera renders the world at
1.25x. Visible gameplay window: ~1024 x 576 world units (§7).

Horizontal clamp: 0 .. LEVEL_W - 1024
Never show beyond level.

==================================================
54. SCREEN SHAKE
==================================================

Small: 4px, 0.1s
Large: 12px, 0.25s
Decay: dt * 30

Session setting: Full / Reduced / Off.
Presentation only.

==================================================
55. ENVIRONMENT AND PARALLAX
==================================================

THE MOON IS GONE (amended canon, §4). The Shadows stole it;
there is NO moon in the sky. Remove the moon disc, the moon
halo, and ALL moon rays. In their place: the "Light Behind the
Castle".

Light Behind the Castle progression:
- Chapters 1-1 .. 1-5 (Act 1): pitch-black sky, stars only
- Chapters 2-1 .. 2-5 (Act 2): faint glow behind the castle
  silhouette (the castle silhouette becomes visible on the
  horizon band)
- Chapters 3-1 .. 3-4 (Act 3): glow clearly visible, the horizon
  lightens
- Chapter 3-5 (final battle): the glow flickers during the fight
- Victory: the moon RISES from behind the castle — the payoff

The sky is lit ONLY by: ambient dim glow, starlight, fireflies,
the active character's subtle glow, and (from Act 2 onward) the
distant glow behind the castle.

Parallax layers (amended; authored factor per layer, grouped by
depth band):
1. sky — 0.1: stars, slowly drifting clouds, faint distant
   shadow shapes
2. background band — 0.2-0.4: gothic castle silhouette with
   sharp spires and orange windows (0.3), dead twisted trees,
   distant ruins (broken columns, arches), dim distant fires
3. midground band — 0.5-0.7: silhouetted trees and ruined
   pillars (0.5), floating feathers, dust motes, patchy drifting
   fog, dry leaves on the wind, small insects that scatter when
   the player approaches, light-shaft particles
4. gameplay layer — 1.0
5. foreground band — 0.9-1.3: tall swaying grass (1.2), pebbles
   and small rocks, scattered bones, broken swords and shields,
   old lanterns on poles

Set dressing (authored per chapter): broken stone statues,
wooden fences, torn banners, skeletons, cobwebs.

Atmosphere and lighting (amended): dark vignette (stays), bottom
fog, a fog sheet between the background and midground bands,
ambient light sources (torches, crystals) with radial glow, rim
light on the active character from the nearest source, distant
objects darker (atmospheric perspective), character cast shadow
on the ground.

Sky palette:
#05070f, #0d1420, #1a2230, #060810

Glow / moonrise light: #e8f0ff (the former moon palette,
re-purposed)

Platform:
#2a2f3a, #181c24, #0a0d14

Breakable:
#5a4030, #2a1e14

Breakables may have vertical cracks + subtle red highlights.

Procedural platform textures (amended — deterministic seeded
noise, NO shimmer):
- stone: cracks, moss, edge highlights
- wood (breakables): grain, nail heads
- metal: scratches, rivets
- dirt: speckles, grass tufts
Subtle 1-2px dark shadow under each platform edge. Platform
visual treatment matches the x1.3 world scale (§18/§29).

==================================================
56. AMBIENT PARTICLES
==================================================

Ambient particle loops (amended):
Act 1: floating dry leaves, fireflies, light-shaft motes
Act 2: subtle dust/road particles, patchy fog wisps, drifting
       feathers, light rain (Act 2 mostly)
Act 3: orange castle sparks, dust clouds, wind-driven debris
Aram: purple motes (always)
Active character: subtle self-glow

Weather and ambient effects (amended): light rain (Act 2 mostly),
distant lightning (VISUAL ONLY — never a gameplay effect), wind
moving foliage, dust clouds on heavy impacts.

NO moon light rays (the moon is removed, §55).

Max ~400 particles (amended from 200). Use pooling.
Gameplay-critical randomness forbidden.
Cosmetic randomness uses deterministic seeded randomness.

==================================================
57. GAME FEEL
==================================================

Required: hit-stop, screen shake, squash/stretch, landing dust, dash trail, damage flash, cooldown ring, hit particles, character drop shadow, silhouette outline.

Squash on jump: Y * 1.15, X * 0.85
Landing: Y * 0.85, X * 1.15
Ease over ~0.1s.

Landing dust: fall distance > 100px → 8–12 particles

Dash trail: 5 afterimages, alpha 0.4 → 0

Damage flash: red full-screen, 0.15s

Hit-stop on kill: 0.07 s (70 ms — the deterministic §9 value)

Hit particles (amended): 10–15 particles in the target's color
on every damage impact

Screen shake on heavy hits (Raha slam, Brute radial, mini-boss
impacts): §54 magnitudes

Character ground presence (amended): soft ellipse drop shadow
under the active character (alpha 0.3, y+2); 1px dark outline
around the silhouette.

Run-cycle visibility (amended): arms rendered OUTSIDE the cloak
silhouette; arm swing ±10px; leg swing ±10px; body bob during
the run cycle; the run cycle is pronounced — at its peak one arm
is forward, one arm back.

Brief visual camera tilt may be used.

Presentation effects must NOT mutate gameplay rules.

==================================================
58. SCORING
==================================================

Enemy base scores:
Patroller: 100
Chaser: 100
Armored: 150
Brute: 250

Other:
Common coin: 10
Rare coin: 50
Moon crystal: 200
Level completion: 500

Enemy kill score: exactly once per enemy per run, at authoritative DEAD transition.
Coin score: on successful pickup.
Crystal score: on successful pickup.
Completion score: on level completion.

==================================================
59. KILL SCORE ORDER
==================================================

On first DEAD transition:

1. If ID already in defeatedEnemyIds, award nothing.
2. Else add ID immediately.
3. Determine base score.
4. If Perfect Landing applies, replace base with base × 3.
5. If Combo active, multiply result by ×2.
6. Add final score once.
7. Increment kills once.

No async work between these operations.
No other code path may award that enemy's kill score.

==================================================
60. COMBO
==================================================

Third consecutive kill activates Combo.
Third kill itself does NOT receive multiplier.
×2 begins with FOURTH kill.

Duration: 5s. Timer resets on kill.

Resets on: 5s without kill OR player actually loses HP.

Does NOT reset on: character switch, camera movement, chapter transition, checkpoint respawn, Restart Chapter.

Checkpoint/Restart preserve current Combo exactly.

==================================================
61. DAMAGE TAKEN
==================================================

For rank: damageTaken = actual HP points lost.

1-damage contact: +1
2-damage Brute contact: +2
2-damage Brute radial: +2
Shield-blocked: +0
i-frame-blocked: +0

Blocked hits NOT counted.

==================================================
62. RANK
==================================================

Computed after run score finalized.

Victory: add completion bonus first, then rank.
Final game-over: no completion bonus; rank from current score + damageTaken; display as game-over rank.

Thresholds:
S: score >= 3000 AND damageTaken <= 2
A: score >= 2000 AND damageTaken <= 5
B: score >= 1000
C: otherwise

Persistent ordering: S > A > B > C > null

Ending tie-in (amended): rank — with damageTaken and the
crystal/NPC condition — selects the victory ending (§52):
- Ending 1 (Sacrifice): Rank S OR damageTaken <= 2
- Ending 2 (Battle): Rank A or B (Rank C defaults here)
- Ending 3 (Hidden Truth): all 3 moon crystals + NPCs interacted

==================================================
63. PERSISTENCE
==================================================

Key: shadows_of_the_moon_save_v2

Schema:
{
  "version": 2,
  "bestScore": 0,
  "bestRank": null,
  "totalCoins": 0,
  "currentChapter": "1-3",
  "completedChapters": ["1-1", "1-2"],
  "chapterCheckpoints": {
    "1-3": { "checkpointId": "c1_3_cp_start", "respawnX": 0, "respawnY": 0 }
  },
  "unlockedCharacters": ["sara", "raha"]
}

unlockedCharacters (amended): characters unlocked by story events
(§4/§20). A fresh save starts as ["sara"]; grows to ["sara",
"raha"] when chapter 1-3 is reached and ["sara", "raha", "aram"]
at chapter 1-5. Persists across sessions; a new run NEVER resets
it.

currentChapter: furthest chapter reached by the running run.
completedChapters: chapters completed in order during that run.
chapterCheckpoints: latest activated chapter-start checkpoint
record per reached chapter (§44).

Auto-save triggers — each a single complete write:
1. entering a new chapter
2. checkpoint death (death → checkpoint respawn)
3. chapter completion
4. final game-over or victory

At each trigger:
1. finalize affected values
2. read existing save
3. merge
4. write complete object once

const prev = readSave();
const next = {
  version: 2,
  bestScore: Math.max(prev?.bestScore ?? 0, currentRunScore),
  bestRank: highestRank(prev?.bestRank ?? null, currentRunRank),
  totalCoins: (prev?.totalCoins ?? 0) + currentRunCoins,
  currentChapter, completedChapters, chapterCheckpoints,
  unlockedCharacters
};
writeSave(next);

currentRunCoins = coin pickups this run. Common and rare each count as 1.

Malformed/unsupported save (including version 1) → treat as empty.
Do NOT crash. Do NOT migrate old formats.

Single complete localStorage.setItem call. No partial writes.
NOT per-frame. Same single-setItem rule.

No save writes:
- per frame, per second
- on coin/crystal/health/heart pickup
- at Restart Chapter
- during Pause

Run-scoped state (score, kills, collections, defeatedEnemyIds,
Combo) is NEVER persisted. Resuming continues from the saved
chapter checkpoint with fresh run state.
Settings session-only.

==================================================
64. CLEAR RECORD
==================================================

Two explicit steps.
First: arm confirmation.
Second: clear persistent record.
Single accidental activation must never erase.

==================================================
65. UI
==================================================

HUD:
Top-left: character name + HP bar (character-color gradient)
Top-center: chapter id + chapter name
Top-right: coins + kills
Bottom-center: three character selectors — locked slots greyed
out + lock icon, non-interactive (§15/§20)

Start screen: title + three-line story + Start Journey + control guide

Death screen: "Darkness prevailed..."
Show: score, kills, coins, damage taken, rank
Button: Try Again

Victory screen: "The Moon Has Returned"
Show stats. THREE ending cards (amended, §52):
- the achieved ending: unlocked card
- the other two: locked cards, each with a hint how to unlock it
Button: Travel Again

Pause overlay: Resume, Restart Chapter, Sound toggle, Shake intensity control

NO user-controllable FPS cap setting.

Optional developer FPS overlay: 60 FPS target + current measured FPS. Cannot alter cap.

==================================================
66. SOUND
==================================================

Optional. Web Audio API only. No external files.

Possible: oscillator jump, coin, hit, enemy attack noise, optional loop music.

If audio init fails: game continues, no uncaught error.

Sound toggle session-only.

==================================================
67. ENVIRONMENTAL STORYTELLING
==================================================

Stone inscriptions: 45 authored total — 3 per chapter
(intro stone at chapter start + two mid-chapter stones),
~5s on-screen each.

Act-opening inscriptions (chapters 1-1, 2-1, 3-1) anchor the
act themes:
1-1: "This is the forest of Midnight. The moon was stolen..."
2-1: "Sara found a trace of her brother, Pouria."
3-1: "The castle of shadows. Where the moon is imprisoned."

Flashbacks: 15 authored total — 1 per chapter.
2s presentation (black bg, white text), authored trigger.

NPC dialogues: 15 authored total — 1 per chapter (§68).

Character-switch quips: 30 authored total.
Authored selection on switch. Never randomized.

Chapter-complete texts: 15 authored total — 1 per chapter
(chapter.completeText on the completion screen).

POURIA TRACK (amended canon, §4/§52.2):
- Act 1, chapter 1-4: Sara finds Pouria's torn scarf — hint only
- Act 2, chapter 2-3: glimpse through the bars —
  half-transformed; Sara recognizes him but cannot reach him
- Act 2, chapter 2-5: FIRST FIGHT — he attacks, does not
  recognize Sara; she must flee (cannot kill him)
- Act 3, chapter 3-1: Sara fears the next encounter
- Act 3, chapter 3-4: FINAL FIGHT — full corruption;
  non-lethal mechanics (§52.2)
- Chapter 3-5: the choice (§52) and the resolution with the
  Queen of Light

UNLOCK STORY EVENTS (amended, §4/§20):
- 1-2: Sara and Raha fight first (a misunderstanding), then
  realize they share a goal
- 1-3: Raha formally joins — cinematic moment
- 1-5: Aram appears from the shadows to help during the mini-boss
  fight; joins without explaining why (foreshadows the Queen of
  Light revelation in Act 3)

Endings: 3 (Sacrifice / Battle / Hidden Truth — §52; triggers per
§62; authored with final content).

Presentation events.
Do NOT pause gameplay unless explicitly required.

==================================================
68. NPC
==================================================

One inert NPC per chapter: 15 total.
World position authored in each chapter's data.
Visual: stone statue silhouette.

Only Aram can interact.
Condition: Aram active + distance <= 60px.
Show interaction prompt.
Button: J / Attack.

When prompt active, this specific J input = NPC interaction instead of attack.

One fixed authored dialogue line.
Duration: 5s.
Does NOT repeat during same run.

Other characters: no prompt, no interaction.
Dialogue text authored. NOT randomized.

==================================================
69. ARCHITECTURE
==================================================

Core modules:
1. constants.js
2. input.js
3. entities/
4. physics.js
5. ai.js
6. level.js
7. render.js
8. loop.js

main.js = entry point.

Entity files: player.js, enemy.js, projectile.js, particle.js, coin.js

Global runtime state in one "game" object.
Entity-local state on entities.

game.score, game.gameTime, game.currentChapter
player.hp, player.vx, player.vy
enemy.hp, enemy.vx
projectile.life

Do NOT duplicate global authoritative state.

==================================================
70. CODE QUALITY
==================================================

JS functions <= 60 lines.
Single responsibility.

Tunable physics/gameplay/combat/timing/rendering → constants.js.
Static authored level data → literals in level.js.

No duplicate timing constants.
No gameplay logic in rendering.
No rendering logic in physics.
No localStorage from physics.
No network from gameplay.
No mutation of unrelated entities from physics.
No unnecessary per-frame allocation.

Pooling for: projectiles, particles, combat popups.

DOM updates only when displayed values actually change.

==================================================
71. GLOBAL STATE RULE
==================================================

"All game state in one game object" means:
- Global runtime state centralized in game.
- Entity-local state remains on entity objects.
Do NOT put every entity's internal variables on game.
Do NOT create competing global singleton state.

==================================================
72. LEVEL DETERMINISM
==================================================

All gameplay-critical placement deterministic.
No unseeded Math.random for: enemy placement, enemy decisions, collectible placement, damage, score, cooldown timing, physics, acceptance tests.

Cosmetic randomness may use deterministic seeded generator.

==================================================
73. TEST MODE
==================================================

Harness may inject: window.__SOM_TEST__ = true;
before navigation.

Production must NOT activate test-only features.

?testSafeArea=1 recognized ONLY when window.__SOM_TEST__ === true.
URL parameter inspected ONLY inside that branch.

In normal production:
- do NOT parse testSafeArea
- do NOT read it
- do NOT apply synthetic insets
- do NOT branch on it

Playwright: inject flag with page.addInitScript() before navigation.

Test hooks may expose window.__SOM_METRICS__.
Production behavior must NOT depend on hooks.

==================================================
74. TEST METRICS
==================================================

When SOM_TEST true, optionally expose:
- render timestamps
- simulation step count
- current gameTime
- player state, enemy state, cooldown state
- safe-area test status

Test instrumentation only.
Never alter normal gameplay.

==================================================
75. REQUIRED FOLDER STRUCTURE
==================================================

/
├── index.html
├── style.css
├── README.md
├── SPEC.md
├── TASKS.md
├── ORCHESTRATOR.md
├── .env.example
├── .gitignore
├── src/
│   ├── main.js
│   ├── constants.js
│   ├── input.js
│   ├── physics.js
│   ├── ai.js
│   ├── level.js
│   ├── render.js
│   ├── loop.js
│   └── entities/
│       ├── player.js
│       ├── enemy.js
│       ├── projectile.js
│       ├── particle.js
│       └── coin.js
├── tools/
│   ├── notify.py
│   ├── telegram-listener.py
│   ├── screenshot.sh
│   ├── acceptance.py
│   └── phase-runner.sh
├── state/
│   └── telegram_commands.json
├── screenshots/
│   └── .gitkeep
└── .github/
    └── workflows/
        ├── test.yml
        └── deploy-pages.yml

==================================================
76. GITIGNORE
==================================================

.env
/state/
__pycache__/
*.pyc
node_modules/
/screenshots/*.png

Keep: screenshots/.gitkeep

==================================================
77. RUNTIME SIZE BUDGET
==================================================

Combined raw uncompressed byte size of:
index.html + style.css + src/**
must be strictly below: 400 KB

Raised from 200 KB by the act/chapter scope amendment to
accommodate 15 chapters of authored level data.

Excluded: tools, tests, docs, screenshots, .git, GitHub workflows.

CI hard-fails if exceeded.

==================================================
78. PERFORMANCE
==================================================

- Canvas 2D only
- imageSmoothingEnabled=false
- DPR <= 2
- render-only culling (mandatory)
- max ~400 particles (amended from 200)
- pooling
- shadowBlur only for enemy eyes
- intentional render cap 60 FPS
- stable 30 FPS on mid-range mobile (amended target — §83 manual
  device test)
- runtime budget 400 KB (§77)
- all textures procedural (§105)

Do NOT remove gameplay entities for being off-screen.
Do NOT create unbounded transient objects per frame.

==================================================
79. REQUIRED AUTOMATED ACCEPTANCE TESTS
==================================================

Python Playwright + headless Chromium.

79.1 Sara double jump: >= 260px under defined procedure.

79.2 Raha Slam:
- airborne K enters fast-fall
- landing impact radius = 90px
- enemies in radius take 2 damage
- breakables in radius break
- large shake triggers

79.3 Aram Slow-motion:
- enemy movement 0.35 factor
- enemy AI timers 0.35
- player 1.0
- duration 3.0s
- player ability cooldowns NOT slowed

79.4 Character switching: HP ratio with specified round formula.

79.5 Midair double jump: Sara yes, Raha no, Aram no.

79.6 Horizontal collision: no wall clipping, X corrected, vx = 0 on blocked.

79.7 Visibility pause:
1. start game
2. hide tab
3. 30s hidden
4. return
5. accumulator reset
6. no physics explosion
7. remains paused
8. explicit Resume required

79.8 Multi-touch: simultaneously Left + Jump + Attack for >= 500ms; all register independently.

79.9 Checkpoint duplicate-score protection:
1. defeat specific authored enemy
2. record score
3. activate checkpoint
4. die
5. respawn
6. defeated enemy NOT active
7. no second kill score possible

79.10 Restart Chapter duplicate-score protection:
1. defeat specific authored enemy
2. record score
3. Pause → Restart Chapter
4. defeated enemy NOT active
5. no duplicate score possible

79.11 Performance regression:
10-second wall-clock test, CPU throttle ×4, 15 enemies on screen.
Record every actual rendered frame timestamp.
Calculate: frame count, median interval, 95th percentile, max interval.

Pass:
median <= 16.7ms
p95 <= 33.3ms
max gap <= 250ms

Expected ~600 frames in 10s.
Do NOT require exactly 600.
Minimum: 540 frames. Fewer → fail with actual count.

79.12 Fall death: without active checkpoint, y > groundY + 400 → final death flow.

79.13 Portrait behavior:
- rotation overlay
- gameplay paused
- input disabled
- no physics advancement
- controls hidden

Return landscape:
- overlay hides
- game REMAINS paused
- Resume required

79.14 Fullscreen: first Start Journey gesture attempts; rejection does not block; no uncaught error.

79.15 Persistence:
- final game-over writes save
- victory writes save
- reload preserves bestScore, bestRank, totalCoins
- checkpoint does NOT write save
- pickup does NOT independently write save

79.16 Safe-area test:
With __SOM_TEST__ = true and ?testSafeArea=1:
- synthetic insets apply
- buttons visible + hittable

Without SOM_TEST: testSafeArea has no effect.

79.17 Enemy score uniqueness:
- awards kill score once
- increments kill count once
- no re-award through duplicate DEAD transitions
- no re-award after checkpoint
- no re-award after Restart Chapter

79.18 Final battle gate:
- final boss is the Queen of Light (multi-phase)
- closed while the Queen remains undefeated
- opens after all Queen phases complete
- active player touching open gate completes level

==================================================
80. PHASE-AWARE ACCEPTANCE
==================================================

tools/acceptance.py --phase N

Every test has min_phase:
Sara double-jump             2
Raha Slam                    8
Aram Slow-motion             7
Character switching          7
Midair double jump           7
Horizontal collision         2
Visibility pause             1
Multi-touch                  1
Checkpoint duplicate score   11
Restart duplicate score      13
Performance                  14
Fall death                   2
Portrait                     1
Fullscreen                   9
Persistence                  9
Safe-area                    14
Enemy score uniqueness       6
Final battle gate            12

Runner:
- run tests where test.min_phase <= current_phase
- report not-yet-eligible as skipped
- retain previous-phase regression coverage
- exit code 1 if any executed test fails

==================================================
81. STATIC CI CHECKS
==================================================

Validate:
- required runtime files exist
- runtime size < 400KB
- no WebGL usage
- no forbidden engine/framework import
- no CDN runtime dependency
- no runtime npm package
- no backend dependency

Check applies to runtime source files.
SPEC/doc mentions of forbidden names do NOT fail runtime scan.

==================================================
82. TEST SERVER
==================================================

CI/local: python -m http.server 8000 --bind 127.0.0.1
Wait until port 8000 reachable. No tests before readiness.
Terminate after tests.

==================================================
83. MANUAL DEVICE TESTS
==================================================

Document in README.

Android: touch, multi-touch, fullscreen, orientation, actual FPS, safe-area, UI scaling. Stable 30 FPS target on mid-range mobile (amended §78).
iPhone/iOS: touch, multi-touch, notch, safe-area, orientation transition, fullscreen behavior.
Weak Android: min 2 minutes sustained; observe degradation.
Physical device: vibration where supported; graceful otherwise.

Actual device FPS = manual test.

==================================================
84. GITHUB PREFLIGHT
==================================================

Non-destructive.

If .git absent: initialize.
If .git present: preserve history, preserve config, never reinitialize.

Verify:
- repository identity matches GITHUB_REPO
- token authentication works via read-only API checks
- permissions appear sufficient for push/branch/PR
- Telegram send capability works

Do NOT create test branch/commit/PR during Phase 0.
First feature branch is Phase 1.
Never echo or log secrets.
Never embed tokens in remote URLs.
Never use https://TOKEN@github.com/...
Never pass secrets as shell arguments.

==================================================
85. PHASE 0 GIT EXCEPTION
==================================================

Phase 0 is the ONLY bootstrap exception.
No feature branch or PR for Phase 0.

Phase 0 prepares:
- repository scaffold
- SPEC.md, TASKS.md, ORCHESTRATOR.md
- test infrastructure
- Telegram tooling
- CI
- deployment workflow
- environment templates

From Phase 1: phase/NN-kebab-name required.

==================================================
86. GITHUB BRANCH WORKFLOW
==================================================

Each feature phase:
1. create/use phase branch
2. implement only that phase
3. run applicable tests
4. commit
5. push
6. create/update PR
7. send Telegram completion notification
8. wait for approval
9. merge only after approval
10. continue to next phase

Branch examples:
phase/01-game-loop
phase/02-physics
phase/03-sara-rendering
...
phase/14-final-acceptance

No duplicate PRs.

==================================================
87. COMMIT AND PR RULES
==================================================

Commit format: <type>(<scope>): <description>

Examples:
feat(loop): add fixed timestep
fix(ai): prevent duplicate enemy score
test(physics): add jump regression

PR title: [Phase N] Short title

PR body: summary, changed files, acceptance tests, regression status, performance notes, screenshot info if applicable.

Never bypass branch protection.
Never force-push main.
If merge blocked: report, stop, wait.

==================================================
88. CI WORKFLOW
==================================================

Create: .github/workflows/test.yml

Trigger:
- push to main
- push to phase branches
- PRs targeting main

Determine source branch:
For PR: GITHUB_HEAD_REF
For push: GITHUB_REF

BRANCH="${GITHUB_HEAD_REF:-${GITHUB_REF#refs/heads/}}"

Extract phase:
PHASE=$(echo "$BRANCH" | sed -nE 's|^phase/([0-9]+)(-.+)?$|\1|p')

If no match: PHASE=14

CI installs Playwright in test env only.

Then:
1. start local Python server
2. wait for readiness
3. static checks
4. python tools/acceptance.py --phase "$PHASE"
5. upload screenshots if present
6. stop server

Hard-fails on: failed executed test, runtime size over, forbidden runtime dep, missing required file.

==================================================
89. GITHUB PAGES
==================================================

Create: .github/workflows/deploy-pages.yml

Deploy on push to main (optional workflow_dispatch).
Use GitHub Pages through GitHub Actions.
Do NOT use branch-root Pages deployment.

Upload: index.html, style.css, src/**, permitted runtime assets.
Use official Pages Actions.
Configure Pages permissions.
Expected URL: https://<username>.github.io/<repo>/

==================================================
90. TELEGRAM LISTENER
==================================================

tools/telegram-listener.py (single process):

- long-poll getUpdates
- filter by TELEGRAM_CHAT_ID
- silently ignore other chats
- track update_id
- advance offset correctly
- process each update at most once
- queue supported commands
- persist queue state

Command record: update_id, received_at, command, phase_number, consumed
State file: state/telegram_commands.json

Lock mechanism prevents duplicate processing.

Approval/rejection apply ONLY to their recorded phase_number.
Stale approval cannot approve later phase.

==================================================
91. TELEGRAM FAILURE MODE
==================================================

Listener cannot start → notification-only mode. Do not crash workflow. Report unavailability.

Send capability fails during Phase 0 preflight → preflight fails, stop.

==================================================
92. TELEGRAM COMMANDS
==================================================

Supported:
/approve
/reject <reason>
/status
/pause
/resume
/retry
/screenshot
/rollback confirm
/tweak <key> <value>

Telegram input UNTRUSTED.
Never execute as shell commands.
Never pass without strict validation.
Never shell=True with Telegram-derived values.
Use allowlist.

==================================================
93. TELEGRAM PAUSE
==================================================

/pause sets pause_requested=true.
Agent stops at next safe boundary.
No new implementation step.
Waits for /resume.
Do not kill arbitrary processes.

==================================================
94. TELEGRAM STATUS
==================================================

/status reports: phase, state-machine state, branch, last test result, current error, last successful commit.
Never report secrets.

==================================================
95. TELEGRAM RETRY
==================================================

Automatic limit: 2 retries.
After 2 automatic failures: stop, notify.
/retry by user = explicit additional attempt.
Never silently bypass persistent failure.

==================================================
96. TELEGRAM SCREENSHOT
==================================================

/screenshot at safe point.
May invoke screenshot.sh, create under screenshots/, optionally send via Telegram.
Screenshots not runtime assets.
Ignored by Git unless explicitly required.

==================================================
97. TELEGRAM ROLLBACK
==================================================

Maintain state/phase_history.json:
phase, branch, last successful commit, timestamp.

/rollback requires /rollback confirm.
Plain /rollback reports confirmation required.

Rollback:
- applies only to current phase branch
- cannot go past last merged phase
- cannot rewrite main history
- prefer git revert over destructive rewrite
- refuse if unsafe uncommitted changes would be lost

==================================================
98. TELEGRAM TWEAK
==================================================

/tweak <key> <value>

Only explicitly allowlisted gameplay constants.

Examples: GRAVITY, MAX_FALL, jump velocities, movement speed, cooldown values, damage values, particle cap.

NEVER allow: tokens, env values, security settings, shell scripts, URLs, file paths, Git config, level geometry, enemy IDs, persistence key, test-security controls.

Procedure:
1. validate key
2. validate type
3. validate range
4. modify temp copy
5. run tests
6. commit only on pass
7. log to state/tweak_log.json

No arbitrary Telegram-based file editing.

==================================================
99. TELEGRAM NOTIFICATIONS
==================================================

Phase start: 🚀 Phase N starting: <title> | branch: <branch>
During long phases: screenshot every 5–10 min
Phase completion: ✅ Phase N done | tests: passed/total | PR: <link> | awaiting /approve
Error: ❌ Error in Phase N | <short> | <file:line> | reply /retry

Never send secrets.

==================================================
100. PHASE STATE MACHINE
==================================================

Phase 1+:

START → PREFLIGHT → IMPLEMENT → TEST

If PASS: COMMIT → PUSH → OPEN_PR_OR_UPDATE → NOTIFY → WAIT_APPROVAL → APPROVED → MERGE → NEXT_PHASE
If REJECTED: WAIT_APPROVAL → REJECTED → IMPLEMENT
If FAIL: RETRY_1 → TEST → RETRY_2 → TEST → STOP + NOTIFY_ERROR

Emergency stop:
- 3 consecutive failures in one phase
- token leak suspected
- explicit pause
- > 2 hours on one phase

Do not bypass.

==================================================
101. PHASE WORKFLOW DISCIPLINE
==================================================

Before modifying any files:
1. reread relevant SPEC sections
2. git status
3. git log -5
4. inspect TASKS.md
5. inspect ORCHESTRATOR.md
6. run existing applicable tests
7. implement only current phase
8. do not refactor unrelated systems

Poll Telegram:
- before every major implementation step
- after every major step
- at least every 5 seconds during long operations

Honor /pause at safe boundaries.

==================================================
102. DEFINITION OF DONE
==================================================

Feature phase DONE only when:
1. all required files exist
2. game loads without uncaught errors
3. current-phase tests pass
4. prior-phase regression tests pass
5. screenshot verification where applicable
6. runtime size < 400KB
7. forbidden runtime deps absent
8. working tree clean except ignored artifacts
9. changes committed
10. phase branch pushed
11. PR created or updated
12. completion notification sent when Telegram available
13. agent stops and waits for approval

Phase 0 is the only branch/PR exception.

==================================================
103. PHASES
==================================================

Phase 0: Bootstrap (SPEC scaffold, git init if needed, env preflight, documentation, helper tooling, CI, Pages workflow, configuration)

Phase 1: game loop; input; fixed timestep; time domains; pause/resume fundamentals
Phase 2: physics; jumping; collision; fall death foundation
Phase 3: Sara rendering; animation; squash/stretch
Phase 4: camera; parallax; moon; castle environment
Phase 5: level data system for 15 chapters (schema, chapter intervals, chapter-scoped ID schemes); author chapters 1-1 through 1-3 as examples
Phase 6: canon visual fix — remove the moon, implement Light
Behind the Castle (§55); global ZOOM 1.25 + x1.3 scale pass
(characters, enemies, collectibles, platform visuals — §7, §18,
§29, §48, §53); Patroller; player/enemy collision; base AI;
defeatedEnemyIds integration
Phase 7: Raha; Aram; switching; abilities; cooldown architecture;
progressive character unlock + non-blocking tutorials (§20);
character detail, drop shadow, outline, limb animation (§18/§57);
character weaknesses + kill methods + Sara dash-through damage
(§21, §23-§25); character-switch combos (§20.1); environmental
gate mechanics (§50)
Phase 8: Chaser; Armored; Brute; mini-boss variant of Brute; enemy animation states; group behavior; Brute radial attack; enemy weakness/resistance enforcement incl. Armored absorbs Aram magic (§29.1)
Phase 9: coins; crystals; HUD; screens; localStorage save schema version 2 (chapter progress, auto-save triggers, unlockedCharacters persistence — §63); locked-selector UI (§15/§65)
Phase 10: hit-stop; shake; dust; dash trail; cooldown ring; damage flash; hit particles; environment density + set dressing + per-chapter themes + procedural platform textures + lighting/depth (§55-§57); particle cap 400

Phase 11:
- Milestone A: inscriptions (45); flashback (15); NPC (15) —
  including Pouria-track texts (scarf 1-4, glimpse 2-3, fear
  beat 3-1) and the three unlock-event cinematics (§67)
- Milestone B: 15 chapter checkpoints; respawn rules
- Milestone C: adaptive difficulty (per act)

Phase 12:
- Milestone A: author chapters 1-4 .. 2-5 (Act 1 completion +
  Act 2; Pouria's first fight in 2-5 — escape, §52.2)
- Milestone B: author chapters 3-1 .. 3-4 (Act 3; Pouria's
  final non-lethal fight in 3-4, §52.2)
- Milestone C: author chapter 3-5; final battle (Queen of
  Light, three-phase); the choice (§52); the moon rise; moon
  gate

Phase 13: rewards; rank; pause menu; heart containers; health pickups; clear-record flow; three ending triggers + victory ending cards (§52, §62, §65)
Phase 14: final acceptance; regression; manual test checklist; GitHub Pages deployment; multi-touch verification; README verification

Each milestone in Phases 11 and 12 completed in order.
Each milestone = internal commit point.

==================================================
104. PHASE 0 REQUIRED FILES
==================================================

SPEC.md mirrors this specification.
TASKS.md: phase order, status, milestones, dependencies, acceptance test mapping, checklist.
ORCHESTRATOR.md: state machine, Git lifecycle, Telegram lifecycle, retry, approval, pause, rollback, emergency stop, CI, branch rules.

tools/notify.py: Telegram notifications, optional screenshots, safe errors, secret-safe output.
tools/telegram-listener.py: long polling, chat filtering, update dedup, command validation, persistence.
tools/screenshot.sh: launch/connect local test env, capture, store, no secret exposure.
tools/acceptance.py: phase-aware, Playwright, reporting, size check, forbidden-dep scan, required-file check, exit status.
tools/phase-runner.sh: orchestration, phase state, Telegram checks, safe pause, retry transitions, test invocation, notifications.

.env.example: variable names only. No real credentials.
.gitignore: required ignores.
.github/workflows/test.yml: branch detection, Playwright, server readiness, acceptance, static checks, artifacts.
.github/workflows/deploy-pages.yml: Pages config, artifacts, deploy.

==================================================
105. FILE AND ASSET POLICY
==================================================

No external runtime assets.
No third-party images/sprites/audio/fonts/videos.
No CDN script.
No external runtime library.
All visuals procedural.

==================================================
106. PRODUCTION SAFETY
==================================================

Browser client NEVER contains: GitHub token, Telegram bot token, credentials, API secrets.
These belong ONLY in orchestration env vars.
Game must never require those secrets at runtime.

==================================================
107. INITIAL PHASE-0 RESPONSE
==================================================

When SPEC first supplied:
DO NOT WRITE CODE.
DO NOT implement Phase 0 yet.

Respond with:
1. confirmation entire SPEC read
2. immutable engine confirmation
3. major locked systems confirmation
4. environment preflight status:
   - GITHUB_TOKEN present/missing
   - GITHUB_REPO present/missing
   - TELEGRAM_BOT_TOKEN present/missing
   - TELEGRAM_CHAT_ID present/missing
5. genuinely unresolved ambiguities only
6. Phase 0 implementation plan

Never print secret values.
Do not create feature code.
Do not begin Phase 1.
Then stop and wait.

==================================================
108. EXPLICIT START COMMAND
==================================================

Do not start Phase 0 implementation until user explicitly sends:

Start Phase 0

Only then may Phase 0 implementation begin.

==================================================
109. FINAL ENFORCEMENT
==================================================

Treat this document as authoritative.
Do not weaken requirements.
Do not replace the engine.
Do not add runtime dependencies.
Do not add backend logic.
Do not modify locked gameplay rules without user approval.
Do not code before explicit Phase 0 command.
Implement one phase at a time.
Run tests before and after changes.
Preserve previous-phase behavior.
Never allow duplicate enemy scoring.
Never allow persistent writes outside defined events.
Never expose tokens.
Never auto-resume gameplay after a pause condition.
First response = analysis/preflight/plan only.

==================================================
110. ENVIRONMENT CONTEXT
==================================================

Environment variables are now set. Preflight info:

GITHUB_TOKEN: present
- Classic PAT with "repo" scope
- Never print, commit, log
- Never embed in remote URL persistently
- Use ephemeral credential or one-shot auth per push

GITHUB_REPO: alirezasorenxu7-sketch/shadows-of-the-moon
- Brand new empty repository
- Public
- No initial commit yet
- No .git directory locally yet

TELEGRAM_BOT_TOKEN: present
- Bot username: @tefa123tris_bot
- Never print

TELEGRAM_CHAT_ID: 6575752704

Additional context:
- Repository has no commits. First push will be the initial commit on phase/01-game-loop.
- Phase 0 may initialize local Git, set remote, configure tooling, but must NOT push code to remote yet (Phase 0 is bootstrap-only per section 85).
- Proceed with Phase 0 analysis response exactly as section 107 requires.
- Do NOT start coding until I send exact command: "Start Phase 0"

==================================================
END OF SPEC
==================================================


