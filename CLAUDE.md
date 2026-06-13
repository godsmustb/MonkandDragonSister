# CLAUDE.md — The Monk & The Dragon Sister

> Context file for resuming work on this project in any new session. Read this first.

## What this is

A **2-player local split-screen co-op 3D action game**, anime/cel-shaded, built in **Three.js** as a self-contained browser game. Setting: a Japanese Zen garden invaded by demons. P1 is **The Monk** (support/control — staff combos, chi shield, healing, meditation). P2 is **The Dragon Sister** (a human girl who transforms into 4 elemental dragons — Fire/Ice/Poison/Water). Quest 1 ("The Initial Compassion") is a 5-wave story arc ending in a 2-phase boss.

Status as of last session: **v3 Release Candidate**, all 8 engineering passes committed, **E2E 59–60/60 green** (one soft warning = a test-side relic-pickup timing flake, not a game bug). Targeted as the studio's first weekend release.

## How to run

- **Double-click `play.bat`** → finds `py`/`python`, starts `python -m http.server 8321` (minimized window), opens `http://localhost:8321/index.html`.
- Manual: `py -m http.server 8321` in the project root, then browse to `http://localhost:8321/index.html`.
- **Must be served over http** — ES modules + CDN won't run from `file://`. First load fetches Three.js r160 from jsdelivr CDN (needs internet once).
- Keep the minimized server window open while playing.

## How to test (the QA gate)

```
cd test
node e2e.mjs          # Playwright headless Chromium, ~60 assertions, full quest playthrough
```
- Server must be running on 8321 first (`python -m http.server 8321` from project root).
- Playwright + cached Chromium already installed in `test/`. Headless runs SwiftShader at ~5fps — the game uses **fixed-substep timing** so it stays real-time; tests use slow key cadence (~300ms) and 4-side teleport attack attempts.
- Screenshots land in `test/shots/` (subdirs: `chars/`, `demons/`, `env/`, `hud/`, `vfx/`). Always review screenshots after art changes.
- The gate: **0 console errors, 0 page errors, all hard checks pass.** Every engineering pass must leave it green.

## Architecture

Single `index.html` shell (CSS + HUD/menu DOM + importmap) loads `src/main.js` (ES modules). **~26 modules, ~440kb of src.**

**Critical conventions (follow these or you'll break things):**
- **`ctx` pattern** — `src/state.js` exports one mutable object `ctx`. All shared state (`ctx.scene`, `ctx.gameState`, `ctx.cameras`, `ctx.keys`, `ctx.koi/bamboo/clouds/grassTufts/pondRipple`, etc.) lives there. Never use `window` globals; never thread these as params.
- **Circular deps** broken via setter injection in `main.js` at boot (e.g. `setDealDamageToPlayer`, `setShowDamageNumber`) — before `init()`.
- **`window.__game` debug API** (`src/debug.js`) — the E2E contract. DO NOT break it. Members: `state` ('MENU'|'INTRO'|'WAVE1'..'WAVE5'|'COMPLETE'|'GAMEOVER'), `wave`, `lives`, `spirits[]` ({pos,hp,maxHp,element,alive}), `p1`/`p2` ({pos,hp,maxHp,level,xp,isKO,hasLockTarget; p2 also form,unlocked}), `lastDamage`, `lastPlayerDamage`, `relics[]`, `audioReady`; methods `skipIntro()`, `startGame()`, `teleport(n,x,z)`, `setLevel(n,L)`, `unlockAll()`, `consumeLife()`, `forceKO(n)`, `lockOn(n)`, `pause()`/`resume()`, `pinDemon(element,x,z)`.
- **FX must be dt-driven** via `_fxEffects`/`_particles` in `src/combat/projectiles.js` (cleared by `clearAllFx()` on wave transitions). NO `setTimeout`/`setInterval` for game-state FX (the music scheduler in `audio.js` is the only allowed interval).
- **Bloom threshold 0.85** (`src/fx/postfx.js`) — VFX cores need `emissiveIntensity ≥ ~1.8` or additive `MeshBasicMaterial` to glow. Split-screen uses **two EffectComposers** (one per half) so bloom is correct per-viewport.

**Module map:**
- `src/state.js` ctx · `src/config.js` LEVEL_TABLE, element ring `getElementMult`, ELEMENT_COLORS, DEMON_TABLE/WAVE_DEMON, PREVENT_KEYS · `src/main.js` boot, renderer/cameras, fixed-substep `animate()`/`updateGame()`, resize · `src/debug.js` `window.__game`
- `src/world/` `garden.js` (terrain, flora, pond, props), `sky.js` (karst silhouettes, clouds, sun, lighting)
- `src/chars/` `common.js` (toonMat/emissiveMat/outline/face-paint helpers), `monk.js`, `sister.js`, `dragon.js` (parametric, 4 element skins), `anim.js`, `ik.js` (`solveTwoBoneIK`), `builders.js` (facade)
- `src/combat/` `spirits.js` (Spirit/BossSpirit + wave spawns), `demons.js` (5 demon builders), `ai.js` (pursue→telegraph→strike→recover), `abilities.js` (Player class + all abilities + `dealDamageToPlayer`), `projectiles.js` (all VFX + `_fxEffects`)
- `src/game/` `quest.js` (gameState + wave state machine), `progression.js` (relics), `lives.js` (3 team lives + game over), `camera.js` (follow/orbit/lock-on)
- `src/ui/` `hud.js` (player plates, ability clusters, boss bar, banners, damage numbers), `menu.js` (main menu + pause + Quality/Audio toggles)
- `src/audio/audio.js` procedural WebAudio (synth SFX + generative zen/combat/boss music)
- `src/fx/postfx.js` dual-composer bloom + ACES + SMAA

## Game design reference

- **Elemental ring:** Water > Fire > Ice > Poison > Water (each strong vs next). Strong = **2.0×**, reverse = **0.5×**, else **1.0×**, neutral always 1.0×.
- **5 waves / 5 demons** (each punishes a dragon, rewards its counter): W1 Shadowlings (neutral, ×3) → unlock **Fire**; W2 Frost Imps (ice, ×4, Fire counters) → unlock **Poison** + Prayer Beads; W3 Tide Wraiths (water, ×4, Poison counters) → unlock **Ice** + Dragon Pearl; W4 **Venom Oni** mini-boss (poison, Ice counters) + 2 adds → unlock **Water** + Saffron Robe; W5 **Inferno Demon Lord** 2-phase final boss (fire, ~400HP, **Water counters** — final unlock matters) → Quest Complete.
- **Progression:** levels 1–10 framework, `stat(L)=base×(1+0.18×(L-1))`; shared party XP; Quest 1 reaches ~L5-6. Relics auto-equip on pickup.
- **Controls** — P1: WASD move, Space/I attack (3-hit combo), J chi shield, K dodge, L heal, Q/E camera orbit, F lock-on. P2: Arrows move, Enter/Numpad8 attack, Numpad4 transform, Numpad5 dodge, Numpad6 special, Numpad7/9 orbit, Numpad0 lock-on. Global: M mute, Esc pause.

## The studio pipeline (how work gets done here)

The Owner (user) runs this like a game studio; I'm "Company Director." Work happens via agent passes with E2E gates between them:
- **Fable** plans/directs/orchestrates/QA-gates.
- **Sonnet agents** = Engineering (refactors, systems, mechanical fixes).
- **Opus 4.8 agents** = Art Department (characters, demons, environment, VFX) + final integration reviews.
- **Design docs in `docs/` are the handoff artifact** from Art Direction to Engineering. See `docs/COMPANY.md`, `ART_BIBLE.md`, `characters/*.md`, `demons/demon-line.md`.
- Commit per pass; message ends with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`. Currently on `master`, 11 commits (Pass 0–8 + play.bat fix).

## Locked decisions

Procedural in-code art now (Blender-CLI / stock GLB pipeline is post-release roadmap); multi-file project + play.bat; **3 shared team lives → Game Over**; procedural WebAudio. Honest quality bar: **stylized chibi-anime toon** (clean cel shading + bloom + painted faces), NOT Genshin-photoreal — that needs the real asset pipeline.

## Known deferred items (from final Opus review — non-blocking, for next patch)

- **Art:** the zen-garden floor is the weakest visual element (improved in Pass 8 but still the immersion-breaker vs the strong sky/characters).
- Lock-on can hold a target through obstacles; pause is single-source now but worth a re-audit.
- Per-frame allocations remain in some boss-hazard spawns (`spirits.js` ember/flame/venom) — not pooled like `projectiles.js`.
- `location.reload()` is used for return-to-menu (re-fetches CDN; fine online).

## Roadmap (see `docs/ROADMAP_2026.md`)

v1.0 weekend release (current) → v1.1 gamepad + key remap + accessibility → v1.5 Blender/GLB asset pipeline or licensed anime models (per-asset license log required) → v2.0 **Godot 4 port** (MIT, strong 3D + web export) with Quests 2-5 + online co-op evaluation. Monetization: free itch.io + donations → premium quest packs / dragon skins → Steam. Engine research recommends staying Three.js for browser distribution now, Godot 4 for the full release. (`docs/ENGINE_RESEARCH.md`)

## Gotchas

- Headless SwiftShader emits a benign `texSubImage2D` warning from SMAA — it's a warning, not an error, doesn't fail E2E.
- `play.bat` was broken by a `http.server --version` probe (no such flag, exits 2) — fixed; if it ever "does nothing," check Python is on PATH and you're opening the http URL not the file.
- Numpad keys need NumLock ON.
