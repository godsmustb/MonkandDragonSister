# CHARACTER — The Dragon Sister, Human Form (Player 2)

> Gentle-but-fierce dragon spirit in human shape. Teal/white hanfu dress, wide sleeves, gold trim, long dark twin-tails, dragon-horn hairpins, jade pendant. Transforms into the parametric dragon.
> Inherits **shared character kit** + shading from `ART_BIBLE.md`. Accent rim = teal `#46D6E0`. See `dragon-parametric.md` for her dragon form.

---

## 1. PROPORTIONS (world units)

- **Total height:** **1.66** (slightly under monk).
- **Head:** Ø **0.50**, ~30% of height. Center y≈1.38.
- **Torso:** height 0.46, shoulder width 0.40 (slimmer than monk).
- **Arms:** upper 0.21, fore 0.19, hand 0.09. **Sleeves are WIDE** (flare past hands).
- **Twin-tails:** each hangs to ~y=0.55 (long, ~0.85 length), sway physics.
- **Dress skirt:** flowing to ankles.
- **Pivot:** feet y=0, faces +Z.

---

## 2. PALETTE

| Role | Hex |
|---|---|
| Teal dress (primary) | `#2FA8B5` |
| Teal shadow | `#1E7480` |
| White underlayer / inner sleeve | `#F4F7F5` |
| White shadow | `#CDD6D2` |
| Cyan sash accent | `#46D6E0` |
| Gold trim | `#E8B84B` |
| Gold deep | `#B8862E` |
| Dark hair | `#2B2438` (cool near-black, violet tint) |
| Hair highlight | `#4A4060` |
| Skin | `#F3D2B0` |
| Skin shadow | `#D0A57E` |
| Eye color | `#2FB5C4` teal-cyan |
| Jade pendant | `#5FA86B` |
| Lip / blush | `#D98A8A` |
| Rim emissive accent | `#46D6E0` |
| Outline ink | `#241A28` |

---

## 3. PART LIST (~115 parts)

### HEAD & FACE (10)
1. **Head** — UV-sphere Ø0.50, scale Y0.97. Skin.
2. **Face decal** — canvas-painted (512²), curved plane hugging front:
   - Big gentle anime eyes, teal-cyan iris, 2 highlights, soft long lashes. **Brows slightly angled** (gentle-but-fierce = calm eyes, subtly determined brow). Small soft mouth, faint smile. Blush dots. No outline on this plane.
   - Alt face textures: blink, fierce (narrowed, brow down) for combat/transform, gentle (for idle/heal).
3–4. **Ears** ×2 — small spheres, partly hidden by hair.
5. **Neck** — cylinder Ø0.14 h0.10.
6–10. Cheek blush / nose dot / eyelash accents baked.

### HAIR — layered curved meshes (~26)
11. **Hair cap (back skull)** — sphere-cap over scalp, dark hair, slightly larger than head (1.05).
12. **Crown volume** — second sphere-cap, raised, gives anime hair height.
13–18. **Bang clusters (front)** — 5–6 **teardrop/cone** bang shapes pointing down over forehead, varied length, center part. Tips slightly curved.
19–22. **Side fringe** ×2 per side — longer tapered locks framing face to chin.
23. **Ahoge** (single cute cowlick) — thin curved cone springing up from crown. Subtle bounce anim.
24–25. **Twin-tail anchors** ×2 — sphere bases high on sides of head where tails attach.
26–27. **Hair-tie rings** ×2 — gold tori at each twin-tail base.

### TWIN-TAILS — chains of tapered spheres (physics-sway) (~22)
28–29. **Twin-tails** ×2: each = a **chain of 8–10 tapered spheres** (radius shrinks tip-ward, Ø0.10→0.03) along a hanging spine. Implement as a node chain with **damped spring sway** (verlet or simple lag) — reacts to movement, wind, attacks.
30–31. **Tail end tufts** — small teardrop cones at each tip.
- Sway params: stiffness ~0.25, damping ~0.85, gravity bias downward, max swing ±35°.

### DRAGON-HORN HAIRPINS — small cones (4)
32–33. **Horn hairpins** ×2 — small gold **cones** angled back-up from above each ear (dragon-horn motif), Ø base 0.04, length 0.14, gold `#E8B84B`, faint emissive (foreshadows dragon).
34–35. **Pin bead caps** — tiny spheres at horn base.

### TORSO / DRESS UPPER (14)
36. **Torso core** — tapered cylinder, white underlayer.
37. **Teal bodice** — fitted curved panels front/back over torso.
38. **Cross-collar (hanfu)** — two overlapping diagonal lapels, white edge + gold trim line, crossing right-over-left at chest.
39–40. **Gold collar trim** ×2 — thin strips along lapel edges.
41. **Waist sash (obi-like)** — wide band at waist, cyan `#46D6E0`.
42–43. **Sash bow / knot** at back — 2 loops (flattened tori) + 2 trailing tail ribbons (tapered planes, sway).
44–47. **Sash trim lines** — gold edging.
48–49. Side bodice fill panels.

### WIDE SLEEVES — LatheGeometry flares (12)
50–51. **Outer sleeves** ×2 — `LatheGeometry` **wide bell** flaring well past the hands. Profile (radius, y along arm from shoulder→cuff):
    ```
    (0.10,0) (0.12,0.20) (0.16,0.40) (0.22,0.60) (0.28,0.72)  // big flare at cuff
    ```
    Teal outer. The drama of the silhouette lives here.
52–53. **Inner sleeve lining** ×2 — white, visible inside the flare.
54–55. **Cuff gold band** ×2 — lathe ring at sleeve mouth.
56–61. **Sleeve sway segments** — lower sleeve verts as soft-body sway (follow-through, lag 3 frames) — trails beautifully on palm strikes.

### DRESS SKIRT — LatheGeometry (8)
62. **Main skirt** — `LatheGeometry` flowing A-line to ankle. Profile waist y0.92 → hem y0.10:
    ```
    (0.18,0.92) (0.22,0.70) (0.26,0.48) (0.30,0.26) (0.34,0.10)
    ```
    Teal outer, 24 segs.
63. **Inner skirt** — white lining, visible at front slit + hem.
64. **Hem gold band** — lathe ring.
65. **Front slit panels** ×2 — split skirt showing white lining + slight leg.
66–69. **Skirt sway segments** — lower verts spring-sway (follow-through).

### ARMS & HANDS (10)
70–73. Arms ×2: upper/fore, skin (mostly inside wide sleeves; hands emerge from flare).
74–75. **Hands** ×2 — slender rounded forms, skin. Open-palm capable (for palm strikes).
76–79. Finger hints for open-palm pose (2 box knuckle suggestions per hand).

### JADE PENDANT (4)
80. **Cord** — thin torus around neck, dark.
81. **Jade disc (bi)** — flattened torus/ring pendant at chest, jade `#5FA86B`, slight emissive (glows during transform).
82–83. **Cord beads** ×2 — small gold spheres flanking jade.

### LEGS / FEET (6)
84–85. **Lower legs** ×2 — cylinders (glimpsed at slit), skin.
86–87. **Shoes** ×2 — small curved-toe slippers, white + gold.
88–89. **Ankle ribbons** — thin tori, cyan.

### OUTLINE / FX NODES (~22)
90–110. Inverted-hull outlines for head, hair masses, torso, sleeves, skirt, twin-tails. Scale 1.03–1.04, ink `#241A28`.
111–115. Rim emissive shells for gold trim, horn pins, jade pendant.

---

## 4. ANIMATION SPECS

> Twin-tails + sleeves + skirt + sash ribbons ALWAYS spring-sway with follow-through. Martial style = **flowing tai-chi / open-palm**, graceful then sharp.

### IDLE (loop ~2.6s)
- Soft breathing ±2% @ 0.4 Hz. Gentle weight float (almost hovering grace), body bob ±0.01 Y.
- Sleeves drift, twin-tails settle/sway, ahoge bobs occasionally. Slow blink. Gentle face.

### WALK (loop ~0.95s)
- Light graceful steps, slight glide feel. Skirt + sleeves sway opposite lead leg.
- Twin-tails swing with head/torso. Arms relaxed, sleeve flares trail.

### RUN (loop ~0.6s)
- Lean 10°, sleeves and twin-tails stream back dramatically. Bob ±0.04 Y. Squash/stretch ±8% on steps.

### PALM-STRIKE COMBO (martial arts)
Open-palm flowing strikes. Each: **coil (anticipation) → release palm (ease-out) → flow into next**. Cyan **crescent trail** off the palm/sleeve each strike.

- **Strike 1 — PUSH PALM** (~0.35s)
  - Anticipation 0.08s: palm draws to opposite hip, torso coils, sleeve gathers.
  - Strike: thrust open palm forward (+Z), hips rotate in. Cyan palm-flash + short crescent sleeve trail. Small **chi ripple** ring at palm.
  - Recover into stance.
- **Strike 2 — RISING PALM / UPPERCUT PALM** (~0.4s)
  - Anticipation: drop low, palm down at side.
  - Strike: sweep palm upward in arc, body rises. Upward crescent trail, sleeve whips up.
- **Strike 3 — DOUBLE-PALM BLAST** (finisher, ~0.7s)
  - Anticipation 0.12s: both palms draw back to chest/sides, gather pose, crouch slightly (squash 0.92 Y), jade pendant flashes.
  - Release: **both palms thrust forward**, step in. Big cyan **shockwave ring** + crescent burst, **hit-stop 80ms**, both wide sleeves snap forward then trail. Settle pose held 3 frames.

### TRANSFORMATION BURST → Dragon (choreography, ~1.4s)
The signature beat. Crowd-pleaser. Hands the scene to `dragon-parametric.md` (her dragon = Water by default, or current element).

1. **Wind-up (0–0.3s):** she pulls into a still centered pose, arms cross over chest, head bows, eyes shift to **fierce** face. Jade pendant + horn pins flare emissive bright. Light gathers (warm→element color), wind lifts her hair/sleeves/skirt upward.
2. **Silhouette flash (0.3–0.5s):** quick crouch then she throws arms open — **full-screen-ish white silhouette flash** (additive billboard flash, scale up + fade). Human model hidden at flash peak. **Hit-stop 90ms.**
3. **Petals / element swirl (0.5–0.9s):** ring of **petals + element particles** (color = current element accent) spiral outward and upward around her position — Water: cyan droplet ribbons; Fire: ember petals; etc. (per ART_BIBLE element shapes). A vertical **energy column** rises.
4. **Dragon emerges (0.9–1.4s):** the parametric **eastern dragon** uncoils upward out of the swirl — head/first segments burst up first, body unspools from the column, whiskers and fins snap out, aura ignites, roar. Particles settle into the dragon's continuous aura trail. Camera punch-in + slight shake.
5. **Settle:** dragon idle-flight hover, swirl petals fade. (Reverse sequence for transform-back: dragon coils into column → flash → human lands in soft graceful pose.)

### HEAL / SUPPORT (channel ~1.5s)
- Pose: gentle face, hands cupped forward, sleeves drape. Jade glows.
- VFX: cyan/teal **water-leaf motes** swirl to ally, soft expanding teal ring at feet, calming bloom pulse.
- End: outward teal pulse ring, return to idle.
```
```
*End dragon-sister.md*
