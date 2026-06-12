# ART BIBLE — *The Monk & The Dragon Sister*

**Format:** 2-player split-screen co-op action. **Engine:** Three.js. **Models:** 100% procedural (code-built geometry + canvas-painted textures). No imported meshes, no imported image files.

---

## 1. QUALITY BAR (read this first)

- **Reference:** Genshin Impact's *readability* and *color charm*.
- **Honest achievable target with code-built geometry:** high-quality **stylized chibi-anime toon**. Think **Zelda: Link's Awakening** toy-world charm × **Genshin** color language.
- We are NOT chasing realism or fine sculpt detail. We chase: clean silhouettes, **3-band cel shading**, **bloom**, **painted anime faces**, confident color blocking.
- Every character ships with the **shared character kit** (non-negotiable):
  1. Canvas-painted **face texture** (big anime eyes w/ 2 highlights, brows, small mouth) UV-mapped onto a UV-sphere head.
  2. **Hair** from layered curved meshes (sphere caps + cone/teardrop bang clusters), never a single primitive.
  3. **`MeshToonMaterial`** + the **shared 3-band `gradientMap`**.
  4. **Inverted-hull outline** (back-face, scaled 1.03–1.05).
  5. Subtle **emissive rim accent color** (per-character).
- If a choice trades fidelity for **silhouette clarity at small viewport size**, always pick clarity.

---

## 2. SHARED SHADING SETUP

### 3-band toon gradient map
- Build a 1×4 (or 1×3) `DataTexture`, `magFilter=NearestFilter`, `minFilter=NearestFilter`.
- Bands (luminance steps): **shadow 0.45 → mid 0.72 → light 1.0**. Optional 4th deep-shadow 0.30 for bosses.
- One shared instance reused by ALL `MeshToonMaterial`s (`material.gradientMap = SHARED_TOON_RAMP`).

### Materials
- Base character/prop material: `MeshToonMaterial`.
- Glows/cores/emissive veins: `MeshBasicMaterial` or `MeshStandardMaterial` w/ `emissive` + `emissiveIntensity` (1.5–3.0) so **bloom** catches them.
- Translucent VFX (smoke, mist, petals): `MeshBasicMaterial`, `transparent:true`, `depthWrite:false`, additive or normal blend per cue.

### Inverted-hull outline (per character/prop)
- Clone the mesh, `material = MeshBasicMaterial({color: OUTLINE, side: BackSide})`.
- Scale **1.03** (faces/props), **1.04** (bodies), **1.05** (chunky bosses).
- Outline color = a **darkened, desaturated** version of the part's base hue (NOT pure black). Default ink `#241a22`.
- Skip outline on tiny VFX particles and on the painted face plane (face stays crisp).

### Post FX (global)
- **UnrealBloom**: threshold ~0.85, strength ~0.5, radius ~0.4. Drives all emissive/elemental glow.
- Tone mapping: `ACESFilmic`, exposure ~1.0. Slight color-grade toward warm.
- Optional cheap vignette per viewport to frame split-screen.

---

## 3. PROPORTION STANDARDS (chibi-anime)

- **Total height:** characters 1.6–1.8 world units. Bosses 2.2–3.6.
- **Head:** **28–33%** of total height (chibi ratio). Big head = charm + readable face.
- **Eyes:** occupy ~40% of face height, set low (lower-middle of face) — anime baseline.
- **Body:** ~3–3.5 heads tall total. Stubby, rounded limbs; no skinny realistic proportions.
- **Hands/feet:** simplified, slightly oversized (readable gestures). Mitten-or-rounded forms OK.
- **Origin/pivot:** feet at y=0, character grows +Y. Face faces +Z.
- **Scale discipline:** 1 unit = ~1 meter. Keep all docs in these units.

---

## 4. MASTER COLOR SCRIPT

World mood = **zen garden, warm & serene**, punctuated by saturated elemental pops.

### Environment / neutral base
| Role | Hex |
|---|---|
| Warm sand / stone | `#E8D7B0` |
| Deep sand shadow | `#B89B6E` |
| Jade / foliage | `#5FA86B` |
| Jade shadow | `#3C7850` |
| Vermillion (shrine accent) | `#E0533D` |
| Gold trim | `#E8B84B` |
| Gold deep | `#B8862E` |
| Ink / outline default | `#241A22` |
| Sky warm top | `#F4E3C1` |

### Per-element accent palettes (used by dragon + demons + VFX)
| Element | Core | Hot/Light | Glow emissive | Counter (beats) |
|---|---|---|---|---|
| **Fire** | `#C42A1C` crimson | `#FFC24B` gold | `#FF6A2A` | beaten by Water |
| **Ice** | `#7FB8E6` pale blue | `#F2FAFF` white | `#A9E4FF` | beaten by Fire |
| **Poison** | `#7A3FB0` violet | `#7FE05A` toxic green | `#A45CFF` | beaten by Ice |
| **Water** | `#1E5F9E` deep blue | `#46D6E0` cyan | `#4FE3FF` | beaten by Poison |

**Element ring (counter chain):** Water ▸ Fire ▸ Ice ▸ Poison ▸ Water.

### Character accent rims
- Monk: warm gold `#E8B84B`.
- Dragon Sister (human): teal `#46D6E0`.

---

## 5. ANIMATION PRINCIPLES

All anim is procedural (bone-less node transforms / morph via group rotation+position+scale). Keep it **snappy and pose-driven**.

- **Anticipation:** every attack winds back 4–8 frames (~0.1–0.15s) opposite the strike direction before committing.
- **Follow-through & overlap:** robes, sleeves, hair, staff rings, whiskers, tails lag the body by 2–4 frames and settle with 1 overshoot. Drive via simple spring/damped-sine on child nodes.
- **Squash & stretch limits:** max **±12%** on characters (e.g., jump-up stretch 1.08 Y / 0.94 XZ; land squash 0.90 Y / 1.08 XZ). Never grotesque. VFX may exceed.
- **Ease:** use ease-out on strikes (fast→slow), ease-in on wind-ups. Avoid linear except idle drifts.
- **Idle:** gentle breathing (chest scale ±2%, ~0.4 Hz), subtle weight shift, accessory sway. Never fully static.
- **Settle:** end every action on a clear silhouette pose held ~3 frames before returning to idle.
- **Pose clarity:** key poses must read as silhouettes (limbs off the body axis).

---

## 6. VFX LANGUAGE — shape + color per element

VFX = **shape language carries the element, color confirms it.** Always pair both so it reads at small size.

| Element | Shape vocabulary | Particle motion | Color |
|---|---|---|---|
| **Fire** | sharp upward flame tongues, embers, jagged | rise + flicker, fast | crimson→gold `#C42A1C`/`#FFC24B`, additive |
| **Ice** | hard hexagonal shards, crystals, snowflakes | drift down, brittle pops | pale blue/white `#7FB8E6`/`#F2FAFF` |
| **Poison** | rounded bubbles, drippy blobs, vapor wisps | bubble up + dissipate, oily | violet/green `#7A3FB0`/`#7FE05A` |
| **Water** | smooth crescents, droplets, ribbons | flowing arcs, splashes | blue/cyan `#1E5F9E`/`#46D6E0` |

### Reusable VFX primitives
- **Slash trail:** ribbon mesh (extruded plane) along weapon arc, additive, fades over ~0.2s, tinted to element/character accent.
- **Impact ring:** flat expanding ring (`RingGeometry`) on hit, scale 0→2, fade.
- **Burst flash:** single quick `MeshBasicMaterial` sphere/sprite, scale up + alpha down over 0.15s.
- **Particle bursts:** instanced quads/sprites; element shape decides the sprite painted on canvas.
- **Hit-stop:** 60–90 ms freeze on heavy connects (combo finisher, boss hits).

---

## 7. READABILITY RULES (split-screen small viewports)

Each player sees roughly a half-screen. Plan for it:

- **Silhouette test:** every character/enemy must be identifiable as a black silhouette. Distinct head shape, accessory, stance.
- **Color-code factions:** Monk = warm saffron/gold; Sister = teal/white; demons = element accent + dark body. No two on-screen actors share a dominant hue.
- **Strong rim/outline:** rely on emissive rim + inverted hull so actors pop off busy backgrounds.
- **Telegraphs are BIG:** enemy wind-up poses exaggerate (oversize, color flash on emissive parts) so a player reads them in a tiny viewport.
- **Avoid fine detail:** detail under ~0.04 units won't read; bake it into the painted texture instead of geometry.
- **Limit simultaneous VFX density:** cap particle counts; favor a few big readable shapes over clouds of small ones.
- **Contrast floor vs actors:** keep ground value mid/light so dark demons and saturated heroes separate.
- **Camera:** slightly high 3/4 angle per player; keep actor centered with lead-room toward movement.
```
```
*End ART_BIBLE.*
