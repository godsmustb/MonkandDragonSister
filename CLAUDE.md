# CLAUDE.md — The Monk & The Dragon Sister

> Context file for resuming work on this project in any new session. Read this first.

## What this is

A **2-player local split-screen co-op 3D action game**, anime/cel-shaded, built in **Three.js** as a self-contained browser game. Setting: a Japanese Zen garden invaded by demons. P1 is **The Monk** (support/control — staff combos, chi shield, healing, meditation). P2 is **The Dragon Sister** (a human girl who transforms into 4 elemental dragons — Fire/Ice/Poison/Water). Quest 1 ("The Initial Compassion") is a 5-wave story arc ending in a 2-phase boss.

Status: **V2.0 — tagged & pushed to GitHub (`godsmustb/MonkandDragonSister`, branch `main`) + deployed to Hostinger.** (Owner lifted the V1.0 GitHub freeze to ship V2.0.) **V2.0 adds** (over V1.0): a full **AAA 2D art pack via the ContentGenAI/Flux pipeline** (moonlit zen-garden menu key-art, Monk/Sister character portraits, per-world backgrounds glacial/venom, boss concept art), an **ACE-Step adaptive soundtrack** (MIT) + **Kokoro voice narration** (Apache) wired into the game, a **rich character-select** (portraits + powers + level-unlock panels), **direct Level 1/2 stage selection** (Campaign + selector), a **3-panel intro cinematic + 3-slide interactive tutorial** (controls/powers/element-ring) + **animated L1→L2 travel transition**, a **`.htaccess` cache fix** (no more stale builds on Hostinger), and the **content pipeline matured**: Flux 2D + **Hunyuan3D** image→mesh + **UniRig** auto-rig (the `Flux→Hunyuan→UniRig→rigged-FBX` loop is closed — no manual Mixamo; flash_attn solved via a pure-torch SDPA shim). **V2.1 (in progress — 3D mesh swap landing):** heroes now load as PCA-uprighted textured Hunyuan meshes with **UniRig skeletal walk/attack/death clips** (auto-authored by `ContentGenAI/scripts/3d/rig_animate.py` — rig → re-texture → auto-identify limbs from bone positions → keyframe world-axis bone swings → export GLB with named clips). **Demons + bosses are also SKELETAL now** (not just procedural bob): `src/combat/enemyGlb.js` hands out per-instance `GltfChar` animators (independent skeletons via vendored `SkeletonUtils` skinned-clone), and `spirits.js` drives clips from the melee-AI state (pursue→walk, telegraph→`cast` wind-up, strike→`attack1`) + a hit-flinch on damage. 6 chars are rigged+animated (monk, sister, shadowling, frostimp, **venomoni, infernolord**); the **boss telegraph is the skeletal `cast` arm-raise + emissive flash** (replaced the old generic rear-back). `tidewraith` (flowing water spirit, no legs) + the **4 serpentine dragons** stay clip-less → richer procedural **hover/sway** (a single rigid mesh can't bone-undulate, and the humanoid auto-rig yields a near-static dragon). `anim.js` triggers `idle/walk/run/attack1-3/hit/dodge/cast/death`, edge-triggered (one-shots fire once on their rising edge). Robust orientation: `texture_project.py` PCA-auto-uprights only meshes that are lying down (bbox guard) + disambiguates head/feet + strips loose junk geometry. Flags: `ctx.useGltfHeroes`/`useGltfEnemies`/`useGltfBosses` (default ON; `?glb=0`/`?glbenemy=0`/`?glbboss=0` or localStorage to disable). Debug: `__game.glb` (swap status), `__game.testBoss()` (spawn a real boss for 3D checks). Pipeline scripts: `ContentGenAI/scripts/3d/rig_animate.py` (rig→texture→limb-ID→keyframe clips), `gen_skeletal.ps1` (batch rig+animate). **Remaining v2.1 polish:** mocap-grade clips (current are auto-authored); true serpentine dragon rig; boss ranged-attack anim hookup (only the melee telegraph is animated). Earlier V1.0 base: Big additions since v3: fixed-angle camera + world-locked movement, full renderer/art polish (rim light, normal-mapped floor, Bob-Ross sky), **1P/2P + character select + full-screen solo / AI-partner**, **remappable controls (localStorage)** + jump/evade, **deep combat** (light/heavy, block/parry, guard + resonance meters), **multi-phase bosses + Bleach-style ultimate**, **campaign/DDA framework**, **XP power labels + score + arcade leaderboard**, **Endless collapsing-arena sudden death**, **full mobile/touch support (iOS Safari + Android Chrome)**, **per-level themed worlds**, the **5-item polish plan** (camera/juice/grade/UI-cohesion/adaptive-audio), and **live-ops** (cross-device leaderboard + anonymous analytics + FTP auto-deploy). Gate: **desktop E2E 60/60 + verify suites + mobile verify (Android+iOS) all green, 0 console errors.** Two open research docs in `docs/`: `CONTENT_PIPELINE_2026.md` (open-source AI asset pipeline — Owner is revamping this) and `PROGRESSION_DESIGN_2026.md` (4-land campaign / difficulty / boss / power design).

---

## V1.0 — Features

**Modes & front-end**
- Main menu → **1-Player** (Solo or AI-Partner, choose Monk/Sister, full-screen single camera) or **2-Player** (split-screen, two EffectComposers).
- **Endless mode** (post-quest) with escalating waves + **90s collapsing-arena sudden death**; arcade high-score board.
- **Campaign preview**, **Quality** (high/low) and **Audio** toggles, in-menu + in-pause **Controls** (remap + touch-layout editor).
- **Full mobile/touch** (iOS Safari + Android Chrome): on-screen joystick + buttons, tap nav, 1P-only, low-quality default.

**Combat & characters**
- Two playable heroes — **Monk** (staff combos, chi shield, heal, meditation; support/control) and **Dragon Sister** (transforms between 4 elemental dragons — Fire/Ice/Poison/Water).
- **Light + heavy attacks** (combos, finisher, knockback, hitstop), **block + parry** (Guard meter), **dodge + jump** (i-frames), **lock-on** aim-assist.
- **Resonance meter → Ultimate** (Bleach-style ~10s super: i-frames + 2.5× dmg + named banner), unlocked via a mid-quest Shikai awakening.
- **Elemental ring** Water→Fire→Ice→Poison→Water (2× / 0.5× / 1×).

**Content**
- **Quest I "The Initial Compassion"** — 5 waves, 5 demon types, progressive dragon unlocks, **2 multi-phase bosses** (Venom Oni mini-boss + Inferno Demon Lord final w/ phase-3 element shift + AoE hazards).
- **3 themed worlds** — Zen Garden, Glacial Peaks (ice), Venom Abyss (poison) — re-paletted per level.
- **Relics** (auto-equip), shared-party **XP/levels**, **score**, **3 team lives**.

**Presentation**
- Cel-shaded toon + outline characters, Fresnel rim light, normal-mapped ground, Bob-Ross sky; **dual-composer bloom + ACES + SMAA + painterly color grade**.
- **Juice:** hitstop, enemy hit-flash, boss-death slow-mo, movement/dodge dust (via a `ctx.timeScale` hooked into the fixed-substep loop).
- **Procedural WebAudio** — synth SFX + generative music that's **adaptive** (intensity/boss/low-HP/per-level mood, crossfaded).

**Live-ops & tooling**
- **Cross-device per-stage leaderboard** + **anonymous analytics** (PHP flat-file APIs, fail-silent client, `API_ENABLED` gate).
- **FTP auto-deploy** (`deploy.mjs`) to Hostinger after every change.
- **QA gate:** Playwright E2E (~60 assertions) + 11 targeted `verify-*` suites (incl. mobile WebKit+Chromium); `window.__game` debug API.

## V1.0 — Folder Structure & System Architecture

```
FirstGame/
├─ index.html              # shell: CSS + :root design tokens, HUD/menu DOM, importmap, boot splash/self-heal
├─ play.bat                # Windows launcher (python http.server 8321)
├─ deploy.mjs              # basic-ftp auto-deploy to Hostinger (reads deploy.config.json — GITIGNORED)
├─ deploy.config.example.json   # scrubbed template (real secrets live in gitignored deploy.config.json)
├─ package.json / -lock    # deps (basic-ftp)
├─ CLAUDE.md / README.md   # dev context (this file) / player how-to-play guide
├─ src/                    # ~35 ES modules (~440kb) — the game
│  ├─ main.js              # boot, renderer/cameras, fixed-substep animate()/updateGame(), resize, juice+dust hook
│  ├─ state.js             # ctx — the ONE shared mutable object (scene, cameras, gameState, keys, themeRefs, timeScale…)
│  ├─ config.js            # LEVEL/DEMON tables, element ring, IS_TOUCH, API_ENABLED, PREVENT_KEYS
│  ├─ debug.js             # window.__game (the E2E contract — ADD-only)
│  ├─ world/               # garden.js (terrain/flora/pond/props) · sky.js (mountains/clouds/sun/lighting) · theme.js (per-level re-palette)
│  ├─ chars/               # common.js (toon/outline helpers) · monk.js · sister.js · dragon.js · anim.js · ik.js · builders.js
│  ├─ combat/              # spirits.js (Spirit/BossSpirit+waves) · demons.js · ai.js · abilities.js (Player+abilities) · projectiles.js (pooled VFX)
│  ├─ game/                # quest.js (wave machine+Endless) · campaign.js (4-land/DDA) · lives.js · progression.js (relics)
│  │                       #   camera.js (fixed-angle+lock-on) · bindings.js (remap) · suddendeath.js · juice.js (timeScale) · leaderboard.js · analytics.js
│  ├─ ui/                  # hud.js (plates/meters/boss bar/banners/toasts/score) · menu.js · touch.js · powerlabel.js
│  ├─ fx/                  # postfx.js (dual-composer bloom+ACES+SMAA+grade; SSAO vendored, gated off)
│  └─ audio/               # audio.js (procedural SFX + adaptive generative music — only allowed setInterval)
├─ vendor/three/           # Three.js r160 VENDORED (core + postprocessing/shaders/utils addons) — no CDN, offline
├─ api/                    # leaderboard.php · analytics.php (flat-file, flock, never-500) · data/ (gitignored runtime files)
├─ test/                   # e2e.mjs + 11 verify-*.mjs (Playwright) + screenshot scripts; shots/ output
└─ docs/                   # design bible, company, research docs (CONTENT_PIPELINE_2026, PROGRESSION_DESIGN_2026, ROADMAP, ENGINE_RESEARCH)
```

**System architecture / conventions** (detail in the `## Architecture` section below):
- **`ctx` singleton** (`state.js`) is the only shared state — no `window` globals, no prop-threading. Circular deps broken via **setter injection** in `main.js` at boot.
- **Fixed-substep sim** in `main.js`: real frame dt × `ctx.timeScale` feeds a 1/60 accumulator (juice scales sim, not render); cosmetic anims + camera use raw dt.
- **Render:** 1 composer (1P) / 2 composers (2P split) for correct per-viewport bloom; mobile/low skips the composer.
- **FX are dt-driven & pooled** in `projectiles.js` (`_fxEffects`/`_particles`, `clearAllFx()` on wave transitions) — **no setTimeout/setInterval** for game FX (audio's music scheduler is the sole exception).
- **`window.__game`** (`debug.js`) is the E2E contract — **only ever ADD** to it.
- **Data flow:** menu/input → `bindings.js` → `abilities.js`/`quest.js` mutate `ctx.gameState` → `main.js` loop updates spirits/AI/FX/camera → `hud.js`/`postfx.js` render; `leaderboard.js`/`analytics.js` POST to `api/*.php` (gated by `API_ENABLED`).

## How can we improve this? (v1.1+ candidates)

- **Asset quality (the #1 lever):** the in-code procedural art has a stylized-chibi ceiling. The open-source AI **content pipeline** (Blender-CLI / GLB models + textures; `docs/CONTENT_PIPELINE_2026.md`) — *Owner is revamping this now* — is what unlocks a real visual jump. The zen-garden **floor** remains the weakest element.
- **SSAO:** implemented (SAOPass + vendored addons) but **gated off** — its `DstColor×AO` multiply blacks the scene under headless SwiftShader and was never validated on real GPU. Revisit: verify on real hardware, or switch to a gentler AO/contact-shadow approach.
- **Gamepad support** (controller mapping alongside keyboard/touch) — natural next input mode; pairs with the existing `bindings.js`.
- **More content:** Quests 2–5 + Lands 2–4 (campaign framework + DDA already exist in `campaign.js`); more demon/boss archetypes; more relics/abilities.
- **Performance:** pool the remaining per-frame allocations in boss-hazard spawns (`spirits.js` ember/flame/venom — not yet pooled like `projectiles.js`); profile mobile.
- **Online co-op** (vs local split-screen) — large; flagged for the v2.0 engine evaluation.
- **Accessibility:** colorblind-safe element cues (beyond color), text scaling, remappable everything, difficulty options surfaced.
- **Robustness:** `location.reload()` for return-to-menu is heavy — consider a soft teardown; re-audit lock-on through obstacles and single-source pause.
- **Engine path:** stay Three.js for browser reach now; evaluate **Godot 4** port for the full release (`docs/ENGINE_RESEARCH.md`, `docs/ROADMAP_2026.md`).

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

## Updates since v3 (Passes 19+) — live-ops, polish plan, per-level worlds

- **Vendored Three.js + boot self-heal:** r160 vendored under `vendor/three/` (no CDN; fixed a deployed "stuck on LOADING" hang). Boot script in `index.html` shows on-screen errors + detects `file://` (ES modules need http — use `play.bat`, not double-click).
- **Live-ops backend (PHP flat-file, never-500):** `api/leaderboard.php` (cross-device per-stage leaderboard, stage = level 1/2/3, endless = 9) + `api/analytics.php` (anonymous funnel/deaths/device; summary GET gated by `SUMMARY_KEY`). Client: `src/game/leaderboard.js` + `src/game/analytics.js`, both **fail-silent** (AbortController + try/catch, fall back to localStorage). **`API_ENABLED`** in `config.js` (`!file:` && not localhost/127) gates the network so localhost never logs a 501. Leaderboard shows "🏆 CONGRATULATIONS — YOU'RE #1!" when you top a stage. Read analytics: `node test/analytics-summary.mjs <liveURL>`.
- **FTP auto-deploy:** `deploy.mjs` (basic-ftp) uploads `index.html`+`src/`+`api/`+`vendor/` to Hostinger; `--only=src` for src-only. Secrets in **`deploy.config.json` (GITIGNORED — never commit)**; `deploy.config.example.json` is scrubbed. **I run `node deploy.mjs` after every commit.** Live: https://slategray-marten-643793.hostingersite.com
- **Per-level environments** (`src/world/theme.js`, `applyLevelTheme(level)` called from `startLevel`/`startWave`): re-palettes the SHARED world per campaign level (no geometry rebuild) via captured `ctx.themeRefs` (sky gradient, mountains, hemi/sun/rim lights, ground/cherry/grass/flower mats) + petal drift mode. **L1 Zen** (multiply by white = byte-identical), **L2 Glacial Peaks** (ice — flora LERPED toward icy white so blossoms frost over, snow petals), **L3 Venom Abyss** (poison — dark multiply, toxic-green spores). `_tintMaterials(mats,hex,mix)`: `mix` falsy = multiply, number = lerp.
- **5-item polish plan (all DONE):** ① **Camera** ¾ fixed angle (`camera.js`: dist 11/height 9.5, look-ahead, `addFovKick`). ② **Juice** (`src/game/juice.js`): `ctx.timeScale` hooks the fixed-substep accumulator (sim scaled, render real-time); hitstop ≤90ms+cooldown on heavy/boss hits, enemy hit-flash (pooled `_fxEffects`, per-instance cloned body mat), boss-death slow-mo (0.35×→1 ramp), pooled movement/dodge dust. `clearAllFx`→`resetJuice`. ③ **Color grade** rewrite in `postfx.js` (vibrance/contrast/lifted cool shadows/per-theme tint). **SSAO** (SAOPass + vendored addons) is implemented but **`SAO_ENABLED=false`** — its `DstColor×AO` multiply blacks the scene under headless SwiftShader and was never validated on a real GPU (Owner chose to drop it; flip the flag to revisit). ④ **UI cohesion**: `:root` design-system tokens in `index.html` (font/palette/panel/spacing) + shared `.mds-scrim/.mds-btn/.mds-heading`, applied across menu/HUD/pause/controls/leaderboard/toasts/arcade. No DOM ids/classes renamed (test selectors intact). ⑤ **Adaptive audio** (`audio.js`): per-tick `_updateAdaptiveState` → 0..1 intensity (enemy density + boss phase/enrage) + low-HP tension; combat-gain scales continuously, cursor-based scheduler flexes tempo, boss layer keyed off live `_bossActive`, tension drone, per-level `THEME_MUSIC` mood, ultimate swell — all null-safe when AudioContext is suspended. Debug: `__game.musicIntensity`/`__game.music`.
- **In-game pause → CONTROLS** button (view/edit keyboard binds mid-game) + **touch-control layout editor** (drag to move, tap to resize on-screen controls; saved per device in `mds_touch_layout`). New debug: `score`, `highScores`, `recordScore`, plus the audio/theme getters above.
- **Gotcha:** an unrelated sibling project **`white-feather-finance/`** lives under this repo and is now **gitignored** — never `git add` it; a `git add -A` once swept its `.env.production` into a commit (caught + removed; it was never deployed since `deploy.mjs` only uploads game dirs).

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
