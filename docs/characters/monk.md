# CHARACTER — The Monk (Player 1)

> Young shaven warrior-monk. Saffron/burgundy layered robes, one shoulder bare, prayer beads, ringed khakkhara staff. Determined.
> Inherits the **shared character kit** + shading from `ART_BIBLE.md`. Accent rim = warm gold `#E8B84B`.

---

## 1. PROPORTIONS (world units)

- **Total height:** **1.70**.
- **Head:** Ø **0.52**, ~31% of height (chibi). Head center y≈1.40.
- **Torso:** height 0.50, shoulder width 0.46.
- **Arms:** upper 0.22, fore 0.20, hand 0.10.
- **Legs:** mostly hidden by robe skirt; visible feet only. Stubby.
- **Staff:** length **1.95** (taller than monk — held in right hand).
- **Pivot:** feet y=0, faces +Z.

---

## 2. PALETTE

| Role | Hex |
|---|---|
| Saffron robe (primary) | `#E08A2B` |
| Saffron shadow | `#A85E18` |
| Burgundy underlayer / sash | `#7A2230` |
| Burgundy shadow | `#561522` |
| Bare skin (shoulder/arms/head) | `#F0C79A` |
| Skin shadow | `#C99A6A` |
| Gold trim / staff metal | `#E8B84B` |
| Gold deep | `#B8862E` |
| Prayer beads (wood) | `#6B3A26` |
| Bead accent (one jade bead) | `#5FA86B` |
| Staff wood shaft | `#8A5A34` |
| Eye color | `#5A3A2A` amber-brown |
| Rim emissive accent | `#E8B84B` |
| Outline ink | `#2A1A14` |

---

## 3. PART LIST (~110 parts)

> Each gets `MeshToonMaterial` + shared ramp unless noted. Outline = inverted hull 1.04 (body), 1.03 (props), skip on face plane.

### HEAD & FACE (12)
1. **Head** — UV-sphere Ø0.52, slightly squashed (scale Y 0.96). Skin material.
2. **Face texture plane / UV** — canvas-painted face mapped to front of head sphere:
   - Big anime eyes (amber-brown iris, 2 white highlights), determined low brows (angled in), small mouth (set neutral-firm), faint nose dot. Subtle blush.
   - Painted onto a 512² canvas, applied as `map` on head OR as a curved face-decal plane (CylinderGeometry segment hugging the sphere). Prefer decal plane so face stays sharp, no outline on it.
3. Shaved scalp sheen — slightly lighter skin patch baked in texture (no geo).
4–6. **Three ritual head dots** (tiny spheres Ø0.02) on forehead, vertical line — gold `#E8B84B`, emissive low.
7. **Ears** ×2 — small flattened spheres.
8. **Eyebrow ridge** — baked in texture.
9. **Neck** — cylinder Ø0.16 h0.10.
10–12. Optional **stubble shadow** band + chin shading baked.

### TORSO / ROBE UPPER (14)
13. **Torso core** — capsule/tapered cylinder, burgundy underlayer.
14. **Right shoulder + arm: BARE** (asymmetry!) — skin material, robe does NOT cover.
15. **Left shoulder robe drape** — saffron, sphere-cap pauldron form over left shoulder.
16. **Chest wrap (burgundy)** — diagonal sash crossing chest left-high to right-low (thin box / extruded ribbon).
17. **Saffron robe front panel** — flat curved plane over chest.
18. **Gold collar trim** — thin torus / ring at neckline, gold.
19–20. **Sash knot** at right hip — 2 small spheres + 2 cone tails.
21–24. **Sash trim lines** — 4 thin gold strips edging the saffron panels.
25–26. Underarm/side fill panels (burgundy).

### ROBE SKIRT — LatheGeometry (10)
27. **Main robe skirt** — `LatheGeometry` profile, **flaring bell**. Profile points (x=radius, y=height) from waist y=0.95 down to y=0.30:
    ```
    (0.20,0.95) (0.24,0.80) (0.27,0.62) (0.30,0.45) (0.36,0.34) (0.40,0.30)
    ```
    Saffron outer. Segments 24 for smooth sway.
28. **Inner skirt lining** — second lathe, slightly smaller radius, burgundy, visible at hem.
29. **Hem gold band** — thin lathe ring at bottom edge, gold trim.
30–33. **4 skirt panel splits** — front/back/side slits as separate lathe wedges OR vertex-animated so the skirt can sway in segments (drive follow-through here).
34–36. Hanging **front apron flap** — flat tapered plane over skirt front, gold-trimmed.

### ARMS & HANDS (16)
37–40. Right arm: shoulder ball, upper, fore, elbow joint — **bare skin**.
41–44. Left arm same — but with **saffron sleeve** (LatheGeometry mini-flare cuff at wrist) over upper/fore.
45–46. **Hands** ×2 — rounded mitten forms, skin. Right hand grips staff.
47–48. **Wrist beaded bracelet** on left — instanced small spheres (see beads).
49–52. Finger suggestion — baked or 2 small box knuckle hints per hand for the gripping pose.

### PRAYER-BEAD NECKLACE — instanced spheres (variable, ~24)
53. **Bead loop** — `InstancedMesh` of **~22 wood beads** (Ø0.035) arranged on a torus path around neck/chest. Wood `#6B3A26`.
54. **One jade bead** (guru bead) at center-front — Ø0.05, jade `#5FA86B`, slight emissive.
55. **Tassel** below guru bead — small cone + 3 thin cylinder strands, burgundy.

### LEGS / FEET (8)
56–57. **Lower legs** ×2 — cylinders, mostly inside skirt, burgundy wrap.
58–59. **Feet** ×2 — rounded sandal forms (flattened box + thong strap), skin + dark sandal.
60–61. **Sandal straps** — thin torus segments.
62–63. **Ankle wraps** — short cylinders, burgundy cloth.

### KHAKKHARA STAFF — held right hand (~30 parts)
64. **Shaft** — cylinder Ø0.04, length 1.55, wood `#8A5A34`, gold-banded.
65–67. **3 gold bands** along shaft — thin tori, gold.
68. **Staff head ring (main)** — large torus Ø0.22 tube0.02, gold `#E8B84B`, slight emissive.
69. **Finial spike** — small cone atop head ring, gold.
70. **Lotus base** below ring — sphere-cap / lathe bud, gold.
71–74. **4 small jingling rings** — tori Ø0.07 hung on the main head ring, gold. **Animate independently** (jingle sway).
75. **Pommel cap** at bottom — small gold sphere.
76–93. Detail tori/bevels on rings + head (bake where possible).

### OUTLINE / FX NODES
94–105. Inverted-hull outline clones for major masses (head, torso, skirt, arms, staff head). Scale 1.03–1.04, ink `#2A1A14`.
106–110. **Rim emissive shells** (optional thin additive halo) for the gold accents + staff ring.

---

## 4. ANIMATION SPECS

> Procedural. Drive via node rotation/position/scale. Skirt panels, sleeve cuff, beads, and the 4 jingle rings always get **follow-through** (lag 2–3 frames, 1 overshoot).

### IDLE (loop ~2.4s)
- Breathing: chest scale ±2% @ ~0.45 Hz.
- Weight shift hips ±0.01 X, slow.
- Staff planted; head ring + 4 jingle rings micro-sway.
- Beads sway ±2°. Occasional slow blink (texture swap or eyelid plane).

### WALK (loop ~0.9s)
- Stride: legs alternate, contact→passing→contact. Stubby steps.
- Skirt bell sways opposite to lead leg (lathe lower verts), lag 3 frames.
- Arm counter-swing (left arm; right holds staff angled, taps ground each step → small jingle).
- Subtle up-down body bob ±0.03 Y.

### RUN (loop ~0.6s)
- Forward lean ~12°. Bigger stride, more bob (±0.05 Y).
- Staff held back/up dynamically. Skirt + sash trail strongly. Beads bounce.
- Squash on contact (0.95 Y), stretch on push-off (1.06 Y).

### 3-HIT COMBO (staff)
Each hit: **anticipation → strike (ease-out) → recover**. Gold **slash trail ribbon** on the staff arc each swing.

- **Hit 1 — JAB** (~0.35s)
  - Anticipation 0.08s: staff draws back to right hip, torso coils right.
  - Strike: thrust staff forward straight (+Z), step in. Hit-spark at tip. Short straight trail.
  - Recover 0.1s to guard.
- **Hit 2 — SWEEP** (~0.45s)
  - Anticipation: staff lifts up-left, torso winds left.
  - Strike: horizontal sweep right→left at knee height, hips rotate ~90°. Wide arc gold trail, jingle rings flare out (centrifugal).
  - Recover.
- **Hit 3 — LEAPING SPIN-SLAM** (~0.8s, finisher)
  - Anticipation 0.12s: crouch (squash 0.90 Y), staff raised overhead, gather pose.
  - Action: **leap** (stretch 1.08 Y up), **full 360° spin** in air — staff sweeps a complete circular gold trail (full ribbon loop).
  - **Slam:** drop, plant staff head into ground (+Z forward). **Land squash 0.88 Y / 1.10 XZ**, **hit-stop 80ms**, impact ring VFX (gold, RingGeometry expand), dust puff, all 4 jingle rings clang outward then settle.
  - Recover 0.2s, big settle pose held 3 frames.

### SHIELD / GUARD (hold)
- Enter (0.2s): staff swung horizontal across body, planted vertical in front, off-hand braces. Slight crouch.
- Hold: gold **barrier disc** VFX — translucent hexagonal disc (`MeshBasicMaterial`, additive, gold `#E8B84B`, slow rotate) in front of monk, soft pulse @ 1 Hz.
- On block-hit: disc flashes brighter + small ripple ring, monk slides back 0.05u.
- Exit: disc fades 0.2s.

### HEAL (channel ~1.5s)
- Pose: staff raised vertical, free hand to chest, head bows slightly, eyes soften (texture swap to closed/gentle).
- VFX: warm **gold motes** rise around monk (instanced sprites drifting up), gentle expanding gold ring at feet, soft bloom pulse. Beads glow brighter.
- End: gentle outward gold pulse ring, return to idle.

### MEDITATE (idle-special / rest, loop)
- Sits cross-legged (lower body folds; skirt pools — lathe flattens/spreads), staff laid across lap or planted beside.
- Hands in mudra (rest on knees). Eyes closed (texture). Very slow breathing (±3%, 0.25 Hz).
- VFX: faint gold aura halo behind head (thin additive ring), occasional rising mote. Jingle rings still. Calm.
```
```
*End monk.md*
