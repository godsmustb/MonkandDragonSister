# CLAUDE.md — The Monk & The Dragon Sister

> Context file for resuming work on this project in any new session. Read this first.

## What this is

A **2-player local split-screen co-op 3D action game**, anime/cel-shaded, built in **Three.js** as a self-contained browser game. Setting: a Japanese Zen garden invaded by demons. P1 is **The Monk** (support/control — staff combos, chi shield, healing, meditation). P2 is **The Dragon Sister** (a human girl who transforms into 4 elemental dragons — Fire/Ice/Poison/Water). Quest 1 ("The Initial Compassion") is a 5-wave story arc ending in a 2-phase boss.

Status: **post-v3, ~20+ passes committed on `master`.** Big additions since v3 (see "Updates since v3" below): fixed-angle camera + world-locked movement, full renderer/art polish (rim light, normal-mapped floor, Bob-Ross sky), **1P/2P + character select + full-screen solo / AI-partner**, **remappable controls (localStorage)** + jump/evade, **deep combat** (light/heavy, block/parry, guard + resonance meters), **multi-phase bosses + Bleach-style ultimate**, **campaign/DDA framework**, **XP power labels + score + arcade leaderboard**, **Endless collapsing-arena sudden death**, and **full mobile/touch support (iOS Safari + Android Chrome)**. Gate: **desktop E2E 60/60 + 7 verify suites + mobile verify (Android+iOS) all green, 0 console errors.** Two open research docs in `docs/`: `CONTENT_PIPELINE_2026.md` (open-source AI asset pipeline) and `PROGRESSION_DESIGN_2026.md` (4-land campaign / difficulty / boss / power design).

## How to run

- **Double-click `play.bat`** → finds `py`/`python`, starts `python -m http.server 8321` (minimized window), opens `http://localhost:8321/index.html`.
- Manual: `py -m http.server 8321` in the project root, then browse to `http://localhost:8321/index.html`.
- **Must be served over http** — ES modules won't run from `file://`. **Three.js r160 is VENDORED locally** in `vendor/three/` (core + the postprocessing/shaders/utils addons used) and the importmap points there — **no CDN, works fully offline.** (Was jsDelivr; vendored to fix a deployed "stuck on LOADING" hang.)
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
- **Targeted verify suites** (also in `test/`, run like `node verify-X.mjs` with the server up): `verify-1p` (1P/AI flow), `verify-controls` (jump/rebind/persist), `verify-combat` (heavy/block/resonance), `verify-ultimate`, `verify-campaign` (lands/DDA), `verify-score` (boundary clamp / selection / score / leaderboard), `verify-suddendeath` (collapsing arena), **`verify-mobile`** (Android-Chromium + **iOS-WebKit** emulation — touch detection, tap nav, on-screen controls). WebKit browser is installed (`npx playwright install webkit`).
- **Note:** headless runs the sim at ~0.5× realtime (0.2s frame cap), so time-based things (sudden-death collapse) need long polls; and running many suites back-to-back can flake timing-sensitive checks (jump) — re-run in isolation to confirm.

## Architecture

Single `index.html` shell (CSS + HUD/menu DOM + importmap) loads `src/main.js` (ES modules). **~26 modules, ~440kb of src.**

**Critical conventions (follow these or you'll break things):**
- **`ctx` pattern** — `src/state.js` exports one mutable object `ctx`. All shared state (`ctx.scene`, `ctx.gameState`, `ctx.cameras`, `ctx.keys`, `ctx.koi/bamboo/clouds/grassTufts/pondRipple`, etc.) lives there. Never use `window` globals; never thread these as params.
- **Circular deps** broken via setter injection in `main.js` at boot (e.g. `setDealDamageToPlayer`, `setShowDamageNumber`) — before `init()`.
- **`window.__game` debug API** (`src/debug.js`) — the E2E contract. DO NOT break it (ADD only). Core: `state`, `wave`, `lives`, `spirits[]` (now also `phase`/`enraged`), `p1`/`p2` (now also `resonance`,`guard`,`blocking`,`ultimateActive`,`ultimateReady`), `lastDamage`, `lastPlayerDamage`, `relics[]`, `audioReady`; methods `skipIntro/startGame/teleport/setLevel/unlockAll/consumeLife/forceKO/lockOn/pause/resume/pinDemon`. Added since v3: `score`, `highScores`, `recordScore(n)`, `bindings`, `rebind(who,action,code)`, `heavy(n)`, `setBlocking(n,b)`, `fillResonance(n)`, `grantShikai(n)`, `ultimate(n)`, `dda`, `lands`, `endlessCycle`, `startEndless()`, `arenaRadius`, `suddenDeathElapsed`, `isTouch`, `touchAction(n,action)`, `touchMove(n,dx,dz)`.
- **FX must be dt-driven** via `_fxEffects`/`_particles` in `src/combat/projectiles.js` (cleared by `clearAllFx()` on wave transitions). NO `setTimeout`/`setInterval` for game-state FX (the music scheduler in `audio.js` is the only allowed interval).
- **Bloom threshold 0.85** (`src/fx/postfx.js`) — VFX cores need `emissiveIntensity ≥ ~1.8` or additive `MeshBasicMaterial` to glow. Split-screen uses **two EffectComposers** (one per half) so bloom is correct per-viewport.

**Module map:**
- `src/state.js` ctx · `src/config.js` LEVEL_TABLE, element ring `getElementMult`, ELEMENT_COLORS, DEMON_TABLE/WAVE_DEMON, PREVENT_KEYS · `src/main.js` boot, renderer/cameras, fixed-substep `animate()`/`updateGame()`, resize · `src/debug.js` `window.__game`
- `src/world/` `garden.js` (terrain, flora, pond, props), `sky.js` (karst silhouettes, clouds, sun, lighting)
- `src/chars/` `common.js` (toonMat/emissiveMat/outline/face-paint helpers), `monk.js`, `sister.js`, `dragon.js` (parametric, 4 element skins), `anim.js`, `ik.js` (`solveTwoBoneIK`), `builders.js` (facade)
- `src/combat/` `spirits.js` (Spirit/BossSpirit + wave spawns), `demons.js` (5 demon builders), `ai.js` (pursue→telegraph→strike→recover), `abilities.js` (Player class + all abilities + `dealDamageToPlayer`), `projectiles.js` (all VFX + `_fxEffects`)
- `src/game/` `quest.js` (gameState + wave machine + Endless mode), `progression.js` (relics), `lives.js` (3 team lives, game over, **arcade leaderboard**), `camera.js` (fixed-angle + lock-on), **`bindings.js`** (action→keycode table, localStorage, `isDown`/`matchAction`), **`campaign.js`** (4-land data, `dIndex`/scaling formulas, element-weighted spawn picker, hidden DDA controller), **`suddendeath.js`** (Endless 90s collapsing arena)
- `src/ui/` `hud.js` (plates, ability clusters, boss bar, banners, damage numbers, score HUD, **showPlayerToast** = per-side notifications), `menu.js` (main menu + 1P/2P/character/partner select + remap UI + campaign preview + pause), **`touch.js`** (mobile on-screen controls, auto-rebuilds per mode), **`powerlabel.js`** (world-space Lv/XP label under each hero)
- `src/audio/audio.js` procedural WebAudio (synth SFX + generative zen/combat/boss music)
- `src/fx/postfx.js` dual-composer bloom + ACES + SMAA + cinematic grade/vignette (high quality only; mobile defaults to low)
- **Touch/mobile detection:** `IS_TOUCH` in `config.js` (single source of truth) — uses ONLY `matchMedia('(pointer:coarse)')`. Do NOT use `ontouchstart`/`maxTouchPoints` (false-positive on desktop Chrome; garbage in Playwright emulation).

## Game design reference

- **Elemental ring:** Water > Fire > Ice > Poison > Water (each strong vs next). Strong = **2.0×**, reverse = **0.5×**, else **1.0×**, neutral always 1.0×.
- **5 waves / 5 demons** (each punishes a dragon, rewards its counter): W1 Shadowlings (neutral, ×3) → unlock **Fire**; W2 Frost Imps (ice, ×4, Fire counters) → unlock **Poison** + Prayer Beads; W3 Tide Wraiths (water, ×4, Poison counters) → unlock **Ice** + Dragon Pearl; W4 **Venom Oni** mini-boss (poison, Ice counters) + 2 adds → unlock **Water** + Saffron Robe; W5 **Inferno Demon Lord** 2-phase final boss (fire, ~400HP, **Water counters** — final unlock matters) → Quest Complete.
- **Progression:** levels 1–10 framework, `stat(L)=base×(1+0.18×(L-1))`; shared party XP; Quest 1 reaches ~L5-6. Relics auto-equip on pickup.
- **Controls (defaults; all remappable in-menu, saved to localStorage `mds_bindings`)** — P1: WASD move, Space/I attack, **U heavy**, **G block/parry**, J chi shield, K dodge, L heal, **C jump**, **R ultimate**, Q/E orbit, F lock-on. P2: Arrows move, Enter/Numpad8 attack, **Numpad3 heavy**, **Numpad1 block**, Numpad4 transform, Numpad5 dodge, Numpad6 special, **Numpad2 jump**, **Numpad✱ ultimate**, Numpad7/9 orbit, Numpad0 lock-on. Global: M mute, Esc pause. **Mobile:** on-screen joystick + action buttons (auto-shown on touch devices); tap to dismiss intro / navigate menus.
- **Camera (changed since v3):** FIXED-ANGLE — no auto-rotate; always frames the player so world-locked movement maps consistently to the screen. Q/E orbit nudges decay back to centre. Lock-on aim-assists facing without moving the camera.

## Updates since v3 (Passes 9–18+) — what's been added

- **Pass 9 — Camera/movement:** fixed-angle camera (no auto-rotate); world-locked movement now reads consistently. Quest renamed "The Initial Compassion".
- **Pass 10–11 — Renderer/art polish:** custom Fresnel rim on `toonMat` (via `onBeforeCompile`) + cool rim light; **normal-mapped zen-garden floor** (Sobel height→normal, the old #1 weak spot); cinematic grade/vignette ShaderPass; Bob-Ross sky (snow-tipped gradient mountains, soft two-tone clouds, lusher trees).
- **Pass 12 — Front-end & flow:** main menu **1P/2P** select; 1P → **character select** (Monk/Sister) + **Solo / AI-Partner**; **full-screen single-camera** path (single composer) alongside 2P split; **Trial-Mode complete screen** (Continue→Endless / Restart / Main Menu); **Endless Wave mode**.
- **Pass 13 — Controls & feel:** **jump** (i-frames) + evade for both; **fully remappable controls** (interactive remap UI, localStorage). New `src/game/bindings.js` indirection — movement, action dispatch, camera orbit all go through it.
- **Pass 14 — Combat depth:** **light + heavy** attacks (heavy 2.2×, knockback/stagger/hitstop); **block + parry** (held block reduces to 30% + drains a GUARD meter; timed parry negates + staggers); a **RESONANCE** meter (fuels the ultimate); HUD shows both meters + Attack/Defend ability typing.
- **Pass 16 — Bosses & power arc:** multi-phase bosses (HP-gated, telegraphs, weighted attack bags, enrage, +1 new mechanic each — Venom Oni spawns adds, Inferno Lord **element-shifts to ice in phase 3** + ground-AOE hazards). **Bleach-style ultimate** (R / Numpad✱): fill resonance → ~10s super-state (i-frames + 2.5× dmg + named banner); a mid-quest "Shikai" awakening unlocks it.
- **Pass 15 — Difficulty/campaign framework:** `src/game/campaign.js` — 4-land data (Land 1 = playable trial; 2–4 coming soon), `dIndex`, Warframe-style enemy scaling, 70/20/10 element-weighted spawn picker, hidden ±15% **DDA** (HP+density only). Wired into Endless (theme rotation, mixed-element late cycles). CAMPAIGN preview in menu.
- **Score & leaderboard:** team `gameState.score` (kills × endless-cycle multiplier + level-ups), top-centre SCORE HUD, **world-space "Lv N + XP bar" under each hero** (`powerlabel.js`); Endless game-over → **arcade leaderboard** (localStorage `mds_highscores`, "CAN YOU BEAT #1?", Play Again / Main Menu).
- **Endless sudden death:** `src/game/suddendeath.js` — 90s collapsing arena (rings fall every 10s, radius 56→6), falling-ring VFX + danger ring, players fall off the void = death. In Endless a **single death = game over** (no respawn); regular play keeps 3 lives.
- **Bug fixes:** circular arena clamp (`clampToArena` reads `ctx.gameState.arenaRadius`) so characters can't walk off the disc into the air; menu selection highlight persists (hover no longer clobbers it); **per-player notifications** route to each hero's split-screen side (`showPlayerToast`).
- **Mobile/touch (iOS Safari + Android Chrome):** on-screen joystick + action buttons (`touch.js`, auto-rebuilds for the active mode), tap-to-dismiss intro, tap menus, viewport/no-zoom CSS; **mobile = 1-Player only** (no 2P / no AI-partner toggle); mobile defaults to **low quality** (skips the bloom/SMAA composer — also dodges an iOS/WebKit `texSubImage2D` error fixed by making the garden gradient `DataTexture` `RedFormat`); a **boot splash** (removed in `showMenu`) prevents the "static split screen" flash during CDN load.

## The studio pipeline (how work gets done here)

The Owner (user) runs this like a game studio; I'm "Company Director." Work happens via agent passes with E2E gates between them:
- **Fable** plans/directs/orchestrates/QA-gates.
- **Sonnet agents** = Engineering (refactors, systems, mechanical fixes).
- **Opus 4.8 agents** = Art Department (characters, demons, environment, VFX) + final integration reviews.
- **Design docs in `docs/` are the handoff artifact** from Art Direction to Engineering. See `docs/COMPANY.md`, `ART_BIBLE.md`, `characters/*.md`, `demons/demon-line.md`.
- Commit per pass; message ends with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`. On `master`, ~30 commits. **No git remote configured yet** — work is committed locally only; to sync, add a remote + push.

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
- **Touch detection:** use `IS_TOUCH` from `config.js` only — `'ontouchstart' in window` is true on desktop Chrome, and `navigator.maxTouchPoints` is 10 on desktop / 0 on emulated iPhone in Playwright (both useless). `matchMedia('(pointer:coarse)')` is the reliable signal.
- **Deploy (Hostinger / static host):** upload `index.html` + `src/` + **`vendor/`** (the local Three.js — required) only (NOT `test/`, `.git`, `play.bat`, `docs/`). Serve over HTTPS. No CDN needed (Three.js is vendored). The boot splash now **auto-removes when the menu mounts AND shows any load error on-screen** (no more silent eternal LOADING). Linux is case-sensitive: any import-path case mismatch 404s only on the server. Cache-Control no-cache meta added — if a user is on a stale build, a hard refresh (Ctrl+Shift+R) loads the new files. Mobile defaults to low quality + 1P.
