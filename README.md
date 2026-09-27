# Shadows of the Moon

A cinematic, atmospheric 2D side-scrolling platformer built entirely with
procedural Canvas 2D graphics — pure HTML, CSS, and JavaScript ES Modules.
No frameworks, no build step, no runtime dependencies, no external assets.

> The land is Midnight. The sun disappeared long ago. The moon is the only
> remaining source of light — and the Shadows have stolen it. Three warriors
> unite to recover it: **Sara** (Wind), **Raha** (Mountain), and
> **Aram** (Shadow).

## Play locally

```
python -m http.server 8000 --bind 127.0.0.1
```

Open http://127.0.0.1:8000 — that's it. (The Python server is dev/test
infrastructure only; all gameplay executes client-side.)

## Controls

### Keyboard (desktop)

| Key | Action |
|-----|--------|
| A / ← | Move left |
| D / → | Move right |
| Space / ↑ | Jump |
| J | Attack |
| K | Special |
| 1 / 2 / 3 | Select Sara / Raha / Aram |
| Escape | Pause |
| R | Explicit resume |

### Touch (mobile)

Fixed on-screen buttons: Left/Right (bottom-left), Jump (bottom-right),
Attack (upper-right), Special (right-middle), character selectors
(bottom-center), Pause (top-right). At least 3 simultaneous touches are
supported (e.g., move + jump + attack at once). Landscape orientation only.

## Characters

| Warrior | Element | HP | Abilities |
|---------|---------|----|-----------|
| Sara | Wind 🌙 blue | 5 | double jump, dash, knife |
| Raha | Mountain red | 8 | slam, shockwave |
| Aram | Shadow purple | 6 | magic, slow-motion, shield |

All three are available from the start; switching preserves HP ratio.

## Technical constraints (enforced by CI)

- Pure HTML + CSS + JavaScript ES Modules + Canvas 2D; browser APIs only
- No WebGL, no game frameworks, no UI frameworks, no bundlers, no TypeScript
- No runtime network requests, no CDN assets, no backend, no database
- All visuals procedural — zero external image/sprite/audio/font files
- Logical resolution 1280×720 (16:9), contain scaling, 60 FPS render cap
- Runtime size (index.html + style.css + src/**) strictly below 200 KB

## Repository layout

```
index.html, style.css      entry point + scaffold styles
src/                       game modules (loop, physics, input, ai, level, render, entities)
tools/                     orchestration: acceptance tests, phase runner, Telegram tooling
.github/workflows/         CI (phase-aware tests) + GitHub Pages deployment
SPEC.md                    the authoritative specification
TASKS.md                   phase plan, statuses, acceptance-test mapping
ORCHESTRATOR.md            workflow manual (state machine, Git/Telegram lifecycles)
```

## Development workflow

This project is built phase-by-phase (0–14) with Telegram-driven approvals.
See `TASKS.md` for the phase plan and `ORCHESTRATOR.md` for the full
operational manual. CI runs phase-aware acceptance tests on every branch;
GitHub Pages deploys from `main`.

## Manual device test checklist

> This section is completed in Phase 14 (SPEC §83). Planned coverage:
> Android (touch, multi-touch, fullscreen, orientation, actual FPS,
> safe-area, UI scaling), iPhone/iOS (touch, multi-touch, notch, safe-area,
> orientation transition, fullscreen behavior), weak Android (2-minute
> sustained run), physical device vibration behavior.
