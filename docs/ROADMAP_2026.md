# Development Roadmap — 2026

> "The Monk & The Dragon Sister" — Studio Release Plan
> Owner-approved phased strategy from weekend launch through monetization

---

## Phase Overview

```
v1.0  (This Weekend)     →  v1.1  (2-4 weeks)     →  v1.5  (Q2-Q3 2026)
                                                            ↓
v2.0 Godot Port (Q3-Q4 2026)     ←──────────────────────────
                                                            ↓
                                                     Monetization Layer
```

---

## v1.0 — Weekend Release (Current Scope)

**Goal:** Ship a playable, shareable local co-op experience. Zero-install browser link. Prove the concept.

**Scope (locked — no additions before launch):**
- Two-player split-screen local co-op (Monk + Dragon Sister)
- Three-wave combat loop with enemy AI
- HUD: HP bars, wave counter, timer
- Functional IK, substep physics, no timer leaks (fixed in v2 patch)
- Hosted as static site — share-by-URL

**Distribution:**
- Hosted URL (current method) — link-and-play, no account required
- Do NOT submit to itch.io yet (reserve for a polished build)

**Success metric:** At least 10 people play to wave 3 without soft-locking.

---

## v1.1 — Polish Patch (2–4 weeks post-launch)

**Goal:** Eliminate the friction points that prevent a second play session.

### Input & Controls
- [ ] **Gamepad support** via the browser [Gamepad API](https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API/Using_the_Gamepad_API)
  - Map left stick → movement, right stick → camera orbit, triggers → attack/dodge
  - Detect gamepad connect/disconnect events; show button prompts dynamically
- [ ] **Key remapping UI** — in-game keybind screen that persists to localStorage
- [ ] **Camera: auto-follow + orbit keys**
  - Auto-follow: camera lerps behind player when no input for 1.5s
  - Orbit: hold Right Mouse (or gamepad right stick) to free-orbit
  - Lock-on targeting: Tab key / L3 to cycle through nearest enemies; camera snaps to locked target

### Accessibility
- [ ] Colorblind-safe HP bar palette (avoid red/green as sole distinguishing channel)
- [ ] Text size scaling option in settings menu
- [ ] Pause menu (Escape / Start) with resume, controls, and quit-to-menu options

### Critical Bug Fixes
- [ ] **CRITICAL — Enemy pursuit/contact gap:** Enemies halt pursuit at distance 2.5 but contact damage requires distance < 1.6. Players can never take damage. Fix: align pursuit stop distance to <= 1.4 (just inside contact threshold) OR expand contact damage radius to >= 2.6.
- [ ] **Fail state — 3 team lives:** Shared lives pool displayed in HUD. On player death: respawn at spawn point, deduct 1 life. At 0 lives: trigger Game Over screen with wave reached, play time, restart option.

### UX / Flow
- [ ] **Main menu** — title card, "Press Start / Click to Play," settings entry, credits stub
- [ ] **Wave clear screen** — brief hold between waves showing score delta before next wave spawns

---

## v1.5 — Asset Pipeline Upgrade (Q2–Q3 2026)

**Goal:** Replace placeholder geometry with visually convincing characters and environments. This is the biggest single quality jump available.

### 5.1 Character Model Upgrade

**Option A — Blender Build (Recommended for full control):**
- Characters require 80–150 distinct mesh parts: face (sculpted with painted expression maps), hair (strand-simulation or card-based), clothing with cloth simulation bake, hands with finger joints
- Rig using Rigify (Blender); export via headless CLI:
  ```
  blender --background character.blend --python export_glb.py -- output.glb
  ```
- CI pipeline: push `.blend` → GitHub Action runs headless Blender → outputs `.glb` to `/public/assets/models/`
- Face maps: painted diffuse + normal map minimum; add roughness/metallic for shine variation

**Option B — Licensed Stock Assets:**

| Source | License Type | Notes |
|---|---|---|
| VRoid Studio | CC0 / per-model terms | Create custom anime characters; VRM format needs converter to GLB (use `vrm-convert`) |
| VRoid Hub | Per-model (check each) | Community models; corporate commercial use requires explicit "allow" flag on model page |
| Sketchfab | Per-model (check each) | Download only models marked CC-By or CC0; never assume commercial use |
| Mixamo | Adobe Standard License | Animations are licensable for commercial use; characters require separate Fuse/Adobe license check |

> **IMPORTANT — Manual License Verification Required:** Do not bulk-download. Each Sketchfab and VRoid Hub model must be individually checked for: (a) commercial use allowed, (b) modification allowed, (c) redistribution in compiled form allowed. Keep a license log at `/docs/asset_licenses.csv`.

**Option C — Hybrid (Practical for Q2 deadline):**
- Use VRoid Studio to generate base body + face (our license to control)
- Import to Blender; add custom clothing, weapon, and hair on top
- Export as GLB; retain VRM-origin license compliance

### 5.2 Environment Upgrade

**Skybox and Horizon:**
- Add 3–5 layered distant mountain silhouettes using large low-poly meshes with fog density gradient
- Layer 1 (farthest): flat silhouette, nearly monochrome
- Layer 2: midtone, slight parallax on camera movement
- Layer 3: near hills, full texture
- Cloud layer: scrolling billboard planes or instanced cards with alpha transparency

**Post-Processing (Biggest Single Visual Lever):**
- Enable Three.js `EffectComposer` with:
  - `UnrealBloomPass` — threshold 0.8, strength 0.4, radius 0.5 (start subtle)
  - `ACESFilmicToneMapping` — replaces flat linear tone curve
  - `SMAAPass` — subpixel morphological anti-aliasing (better than FXAA for our geometry density)
- Add per-material emissive maps on attack VFX and eye highlights

### 5.3 Animation Quality

**Principles to implement:**
- **Anticipation:** 3–5 frame wind-up before heavy attacks (crouch/lean back)
- **Follow-through:** 4–6 frame decel after attack lands (weapon swing arc continues, then settles)
- **Squash and stretch:** subtle scale pulse on jump apex and landing impact
- In Blender: use Graph Editor to add ease-in/ease-out curves; avoid linear interpolation between keyframes

### 5.4 VFX Upgrade

- Replace untextured sphere VFX with sprite-sheet particle systems (TextureAnimator in Three.js or custom shader)
- Attack impacts: radial sprite sheet (8×8 frame sheet, 15fps playback)
- Hit sparks: instanced mesh particles with velocity + gravity
- Dragon Sister: persistent smoke trail on movement using ribbon/trail geometry

---

## v2.0 — Godot 4 Port (Q3–Q4 2026)

**Goal:** Full engine migration enabling quest systems, polished PC distribution, and online co-op evaluation.

### Migration Approach
- Begin Godot 4 prototype in parallel with v1.5 Three.js work (do not block)
- Port systems in order: input → character controller → combat → camera → UI → enemies → world
- Use Godot's CharacterBody3D + AnimationTree as equivalents to our current custom systems
- All Three.js game logic documents become the spec; port behavior, not code

### Quest System (v2.0 Core Feature)
- Quest 1: The Temple Trial (tutorial — current wave combat as quest)
- Quest 2: The Valley of Shadows (new environment, 2 new enemy types)
- Quest 3: The Dragon's Past (story beat — Dragon Sister lore, cutscene stub)
- Quest 4: The Corrupted Monk (boss fight variant — Monk as enemy)
- Quest 5: The Ascension (final boss, combined abilities mechanic)

Each quest: design doc → Art Department pass → Engineering implementation → QA gate

### Online Co-op Evaluation
- Assess: Godot High-Level Multiplayer API (ENet/WebRTC) vs GodotSteam (Steam Networking Sockets)
- Decision criteria: target platform (Steam vs web), latency budget, team capacity to build rollback netcode
- If Steam launch is confirmed before v2.0: GodotSteam is the correct path
- If web remains primary: Godot's WebRTC multiplayer + a lightweight relay server (Supabase Realtime or Cloudflare Durable Objects)
- Defer online co-op to v2.1 if evaluation shows > 8 weeks engineering cost

---

## Monetization Strategy

### Stage 1 — Free Release + Donations (v1.0–v1.5)
- Host on itch.io as "free / pay what you want"
- itch.io revenue share: 0–100% (set to 0% to itch — keep 100%, or donate 10% as goodwill)
- Goal: build audience, collect email list via "join our mailing list" post-game CTA
- Success metric: 500 downloads, $500 in voluntary donations before Stage 2

### Stage 2 — Premium Quest Packs (v2.0+)
- Base game free (Quests 1–2); Quests 3–5 as a premium pack ($3–$5)
- Cosmetic Dragon Skins: 3–5 alternate color/outfit sets for Dragon Sister ($1–$2 each)
- All gameplay content remains earnable or free-equivalent — cosmetics only are paid
- itch.io DLC support or separate itch.io "expansion" listing

### Stage 3 — Steam Release
**Criteria before submitting Steam Direct ($130 fee):**
- [ ] Minimum 10,000 itch.io plays or equivalent reach
- [ ] Quest 1–5 complete with < 5 open critical bugs
- [ ] Controller support verified on Windows + Steam Deck (SteamOS)
- [ ] Godot 4 port complete and stable (not Three.js)
- [ ] A trailer (minimum: 60 seconds, captured at 1080p60)
- [ ] Steam store page assets: capsule images, screenshots, short description

**Revenue target:** $5,000 in first 90 days on Steam = signal to continue. Below this: reassess scope.

---

## Timeline Summary

| Milestone | Target Date | Owner |
|---|---|---|
| v1.0 Launch | This weekend | Engineering |
| v1.1 Critical bug fix (enemy gap) | Week 1 | Engineering |
| v1.1 Full polish patch | Week 2–4 | Engineering + QA |
| v1.5 Post-processing pass | April 2026 | Engineering + Art |
| v1.5 Character model upgrade | May 2026 | Art Department |
| v1.5 Environment/VFX | May–June 2026 | Art + Engineering |
| v2.0 Godot prototype begin | July 2026 | Engineering |
| v2.0 Full port + Quest 1–3 | October 2026 | All departments |
| v2.0 Quest 4–5 + co-op eval | December 2026 | All departments |
| Steam submission | Q1 2027 | Direction |
