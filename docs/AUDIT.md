# Quality Audit — Build State Report

> Game: "The Monk & The Dragon Sister"
> Audit Date: June 2026
> Auditor: Research & Strategy Department
> Build: Post-v2 patch (timer leaks fixed, substep timing corrected, IK functional, HUD repositioned)

---

## Already Fixed in v2 Patch (Do Not Re-Audit)

| Item | Status |
|---|---|
| Timer accumulator leaks causing frame rate degradation over time | Fixed |
| Physics substep timing producing jitter on low-end hardware | Fixed |
| IK system — foot/hand IK not updating on all animation states | Fixed |
| HUD elements positioned off-screen on 16:9 viewports | Fixed |

These are closed. They do not appear in the findings below.

---

## Severity Key

| Level | Meaning |
|---|---|
| CRITICAL | Breaks core gameplay loop; must fix before v1.1 ships |
| HIGH | Significantly degrades experience; fix in v1.1 |
| MEDIUM | Noticeable quality gap; target v1.5 |
| LOW | Polish item; target v1.5 or v2.0 |

---

## Graphics

| # | Finding | Severity | Detail | Recommended Fix |
|---|---|---|---|---|
| G1 | Characters are primitive geometry blobs | HIGH | Each character is composed of 5–10 simple geometric parts with no face, no hair, no painted surface detail. Breaks visual identity entirely. | Rebuild to 80–150 part hierarchy: head (sculpted mesh with painted face diffuse + normal), hair (card or strand), body (segmented clothing), hands (with finger joints). See ROADMAP v1.5. |
| G2 | No post-processing pipeline | HIGH | Linear tone mapping, no bloom, no anti-aliasing. This is the single highest-impact visual lever available at zero art-asset cost. The scene looks washed out and aliased compared to any commercial release. | Add Three.js EffectComposer: `UnrealBloomPass` (threshold 0.8, strength 0.4), `ACESFilmicToneMapping`, `SMAAPass`. Estimated: 1 day engineering work, dramatic visual improvement. |
| G3 | Empty horizon / skybox | MEDIUM | The background is a flat color. No depth cue, no environmental context. The world feels like a floating void. | Add 3–5 layered mountain silhouette meshes with fog falloff gradient + scrolling cloud billboard layer. |
| G4 | VFX are untextured spheres | MEDIUM | All attack and impact effects use raw sphere geometry. No sprite-sheet animation, no emissive glow, no particle dispersion. | Replace with sprite-sheet `TextureAnimator` particles. Add emissive maps to impact meshes. Dragon Sister attacks need a persistent smoke/fire trail. |
| G5 | No emissive highlights or eye detail | LOW | Characters have no readable facial expression or eye glow. Anime style requires strong eye emissive + painted face. | Add eye emissive material; painted face texture with at least two expression maps (idle, battle). |
| G6 | Flat lighting — no ambient occlusion | LOW | Geometry sits on the ground with no shadow contact darkening. Characters look like they are floating. | Add `SSAOPass` to EffectComposer stack or bake ambient occlusion into geometry UV2 channel. |

---

## Gameplay

| # | Finding | Severity | Detail | Recommended Fix |
|---|---|---|---|---|
| P1 | CRITICAL — Enemy pursuit gap makes players unkillable | CRITICAL | Enemy AI stops pursuit at distance **2.5 units**. Contact damage is only applied when distance is **< 1.6 units**. The enemy stops 0.9 units outside the damage zone. Players cannot take damage under normal gameplay unless they walk into an enemy. The entire health and lives system is effectively disabled. | **Fix A (preferred):** Reduce enemy pursuit stop distance to `<= 1.4` (inside contact threshold). Enemy presses home. **Fix B:** Expand contact damage radius to `>= 2.6` (enemy damages at stop distance). Pick one — do not do both or enemies will damage through walls. **This is a pre-v1.1 blocker.** |
| P2 | No fail state | CRITICAL | Players can never lose. There is no game over, no lives system, no consequence for taking damage (which itself is broken per P1 above). The game loop has no closure. | Implement 3 shared team lives. On player death: respawn at spawn point, decrement shared life counter. At 0: Game Over screen with wave reached + restart button. |
| P3 | Animations lack anticipation and follow-through | MEDIUM | Attacks snap between idle and strike with no wind-up or recovery frames. Feels mechanical and unresponsive. | Add 3–5 frame anticipation (weight shift / lean back / wind-up) before all heavy attacks. Add 4–6 frame follow-through (weapon arc continues, pose settles) after strike lands. |
| P4 | No dodge or defensive mechanic | MEDIUM | Players can only attack or move. No evasion option exists. This makes combat purely about standing in range and hitting. | Add dodge roll: double-tap direction + dodge key. Brief iframe window (8 frames). Adds read-and-react depth. |
| P5 | Enemy variety is minimal | LOW | All enemies behave identically (approach, contact damage). No ranged attackers, no heavy/slow variants, no pack vs. elite distinction. | Design 2–3 enemy archetypes for v2.0. For v1.1: vary speed and HP values at minimum to create differentiation. |

---

## UX / Interface

| # | Finding | Severity | Detail | Recommended Fix |
|---|---|---|---|---|
| U1 | No main menu | HIGH | Game starts directly into gameplay. No title screen, no option to configure controls or audio, no credits. | Add main menu: title card, "Start Game" prompt, Settings stub, Credits stub. Minimum viable version: 4 hours engineering. |
| U2 | Camera is hard to control on keyboard | HIGH | Camera requires constant manual input to stay behind the player. Inexperienced players lose orientation within seconds. | Implement: (a) auto-follow — camera lerps to behind-player position after 1.5s of no camera input; (b) orbit keys (Q/E or hold RMB); (c) lock-on (Tab) snaps camera to nearest enemy and tracks. |
| U3 | No audio — zero sound | HIGH | No background music, no SFX for attacks, no hit confirmation sound, no ambient environment audio. The experience is silent. This is among the highest disorientation factors for new players. | v1.1 minimum: add 3–5 royalty-free SFX (attack swing, hit impact, death) via Web Audio API. Add one looping ambient track. Use freesound.org CC0 assets. Full audio pass in v1.5. |
| U4 | No wave transition screen | MEDIUM | Wave 3 ends and the next wave begins without ceremony. No score, no progression sense, no breathing room. | Show 2–3 second "Wave X Complete" overlay with score delta before next wave spawns. |
| U5 | No pause menu | MEDIUM | Pressing Escape does nothing. Players cannot exit the game without closing the browser tab. | Implement Escape / Start opens pause overlay with: Resume, Controls reference, Quit to Menu. |
| U6 | Controls are not communicated | MEDIUM | No tutorial prompt, no control overlay, no button legend. First-time players do not know how to attack, dodge, or switch targets. | Add a brief "controls" prompt on game start (3 seconds, then fade). Show button prompts contextually (near first enemy: "Press X to Attack"). |
| U7 | Split-screen divider is unmarked | LOW | The screen is divided but there is no indicator of which side belongs to which player. Especially confusing on first play. | Add small player identifier (P1 / P2 icon, or character portrait) to each viewport corner. |

---

## Summary Table

| Category | Critical | High | Medium | Low |
|---|---|---|---|---|
| Graphics | 0 | 2 | 2 | 2 |
| Gameplay | 2 | 0 | 2 | 1 |
| UX / Interface | 0 | 3 | 3 | 1 |
| **Total** | **2** | **5** | **7** | **4** |

---

## Pre-v1.1 Non-Negotiable Fixes

The following CRITICAL and HIGH items must be resolved before v1.1 is considered shippable:

1. **P1** — Fix enemy pursuit/contact distance gap (game is effectively unbeatable without this)
2. **P2** — Add 3-life fail state and Game Over screen
3. **U1** — Add main menu
4. **U3** — Add minimum viable audio (3–5 SFX + 1 ambient track)
5. **G2** — Enable EffectComposer with bloom + tone mapping (1 day, biggest visual ROI)

Items G1, G3, G4 (character models, environment, VFX) are correctly scoped to v1.5 and do not block the v1.1 release.

---

## v1.5 Art Priority Order

Based on visual impact per effort:

1. Post-processing pipeline (G2) — 1 day, transforms the look of existing assets
2. Character face + expression texture maps (G1 partial) — biggest character readability gain
3. Layered horizon + clouds (G3) — eliminates the "void" feeling
4. VFX sprite-sheet particles (G4) — attack feedback and juice
5. Character full 80–150 part rebuild (G1 full) — largest effort, highest quality ceiling
