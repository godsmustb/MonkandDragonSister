# CHARACTER — Parametric Eastern Dragon (Longshen)

> ONE procedural eastern dragon used by all 4 elements (Fire / Ice / Poison / Water). Built once, reskinned + re-fitted via element parameters. Summoned by the Dragon Sister (`dragon-sister.md`).
> Inherits shading from `ART_BIBLE.md`: `MeshToonMaterial` + shared ramp, inverted-hull outline 1.04, emissive belly/aura for bloom.

---

## 1. CONCEPT & PROPORTIONS

- **Form:** classic serpentine eastern dragon — long undulating body, no wings, 4 small clawed limbs, deer-antlers, whiskers, mane fins. Floats/swims through air.
- **Total length:** **~6.0 units** nose→tail (parametric; `LENGTH` param 4.5–7.0).
- **Body thickness:** mid-body Ø **0.42**, tapering to Ø0.12 at tail tip and Ø0.30 at neck.
- **Head:** length ~0.70, jaw Ø ~0.40. Bigger, expressive (chibi-dragon charm).
- **Build:** **16–20 tapered body segments** strung along a **spine chain** (array of nodes). Segments are slightly overlapping spheres/tapered cylinders so the body reads continuous and bends smoothly.

---

## 2. SPINE & BODY CONSTRUCTION

- **Spine chain:** `N_SEG` nodes (param, 16–20), evenly spaced along `LENGTH`. Each node holds position + orientation. Animate the chain (see §6); segments follow.
- **Per segment:** a tapered body piece (`CylinderGeometry` with top/bottom radii from a **radius curve**, or a squashed sphere). Radius curve along body t∈[0,1]:
  ```
  neck(0.30) → swell mid(0.42 @ t≈0.35) → taper → tail(0.12 @ t=1.0)
  ```
- Segments oriented to face the next spine node (look-at) so bends stay smooth.
- **Belly band:** each segment gets a lighter **glowing belly strip** on its underside (separate emissive mesh, see §3) — the iconic eastern-dragon underbelly.

---

## 3. PART LIST (parametric)

### HEAD (≈18 parts)
1. **Cranium** — sphere Ø0.40.
2. **Snout / upper jaw** — tapered box/half-cylinder forward, with nostril bumps (2 small spheres).
3. **Lower jaw** — hinged piece (pivot at jaw joint) for **open/close mouth**. Open angle 0–35°.
4–5. **Eyes** ×2 — spheres Ø0.10, painted iris (element-tinted), 2 highlights, big + expressive. Slight emissive.
6–7. **Brow ridges** ×2 — angled wedges over eyes (fierce).
8–9. **Antler crests** ×2 — branching **deer-antler** forms (cones + smaller cone branches), 2–3 tines each. **Geometry variant by element (§5).**
10–11. **Side jaw horns / cheek fins** ×2 — swept-back cones.
12. **Teeth / fangs** — small white cones along jaw (4–6, baked or instanced).
13. **Tongue** — flat tapered plane inside mouth (red), visible when open.
14–17. **Whisker barbels** ×2–4 — long **curved thin tubes** (`TubeGeometry` along a curve) sweeping back from snout. **Sway physics** (lag, springy). Element-tinted tips, faint emissive.
18. **Forehead jewel / pearl** — small emissive sphere, element color (the dragon's "chasing pearl" motif).

### MANE & FINS (≈12)
19. **Neck mane** — row of swept-back flame-like fin shapes (tapered planes/teardrops) along back of head/neck. Element variant.
20. **Dorsal fin spine row** — `N_FIN` (param ~14) **fin spines** along the entire back, one per/every-other segment. Each = a tapered triangular plane standing up, scaling down tail-ward. **Ice/Water variants in §5.**
21–30. Individual dorsal fins (instanced or per-segment children, sway slightly).

### LIMBS — 4 small clawed (≈20)
31–34. **Upper-arm/leg** ×4 — short tapered cylinders off body (front pair near t≈0.20, rear pair near t≈0.55).
35–38. **Forearm/shin** ×4.
39–42. **Paws** ×4 — small spheres.
43–46. **Claws** — 3 tiny cones per paw (instanced), gold/bone colored. (12 claws total.)
47–50. **Limb flame-fin tufts** ×4 — small fin at each elbow/heel (eastern-dragon "wind fins").

### BODY (≈parametric, N_SEG×2 + bands)
51..(50+N_SEG). **Body segments** — tapered pieces along spine (see §2).
- **Belly band segments** — per segment underside, emissive strip, element glow color, `emissiveIntensity` 1.5–2.5 (bloom).
- Segment outlines via inverted hull on the merged body.

### TAIL (≈6)
- **Tail tip taper** — final thin segments.
- **Tail fin** — a spreading fan/flame fin at the very end (tapered planes radiating), element-tinted. **Water variant = flowing ribbon fin (§5).**

### AURA / FX NODES
- Aura particle emitter anchored to spine (whole-body trailing aura). See §5 per element.
- Mouth charge emitter (for breath attacks).

---

## 4. PARAMETRIZATION (the reskin system)

Single `buildDragon(element, opts)`. **Palette slots** + geometry variant flags + aura spec switch on `element`.

### Palette slots (fill per element)
| Slot | Used on |
|---|---|
| `BODY_PRIMARY` | body segments, head, limbs |
| `BODY_SHADOW` | (ramp handles, but set base) |
| `BELLY_GLOW` (emissive) | belly bands, forehead pearl, eyes |
| `FIN_COLOR` | dorsal fins, mane, tail fin, antlers tint |
| `AURA_COLOR` | particle aura, breath |
| `OUTLINE` | inverted hull (dark element-tint) |

### Per-element fill

| Slot | **Fire** | **Ice** | **Poison** | **Water** |
|---|---|---|---|---|
| BODY_PRIMARY | `#C42A1C` crimson | `#9FCFEF` pale blue | `#6E4FA0` violet | `#1E5F9E` deep blue |
| BELLY_GLOW (emissive) | `#FFC24B` gold | `#A9E4FF` ice-white | `#7FE05A` toxic green | `#46D6E0` cyan |
| FIN_COLOR | `#FF6A2A` ember orange | `#F2FAFF` frost white | `#A45CFF` magenta-violet | `#46D6E0` cyan |
| AURA_COLOR | `#FF6A2A` | `#A9E4FF` | `#A45CFF` | `#4FE3FF` |
| OUTLINE | `#3A0E0A` | `#1E3A52` | `#2E1742` | `#0E2C4A` |

### Crest / geometry variants (flag per element)
- **antlerVariant:**
  - Fire = jagged flame-shaped antler tines (sharp, upswept cones).
  - Ice = **crystalline antlers** — faceted angular shards (low-poly cones, sharp).
  - Poison = curved/drippy organic antlers (slightly bulbous tips).
  - Water = smooth flowing antler fronds (rounded, fin-like).
- **dorsalVariant:**
  - Fire = flame fins (pointed teardrops).
  - **Ice = crystal spine variant** — hard hexagonal crystal shards instead of soft fins (sharp prisms along back).
  - Poison = soft membranous fins (rounded, slightly translucent).
  - **Water = flowing fin variant** — long wavy ribbon fins, animated undulation.
- **tailFinVariant:** Fire=flame fan, Ice=crystal fan, Poison=ragged membrane, **Water=flowing ribbon** (sine animated).

### Aura particle spec (per element)
> Instanced sprites/quads, additive, `depthWrite:false`. Emitted along spine + concentrated at head.

- **Fire — ember trail:** rising flickering ember sprites (`#FF6A2A`/`#FFC24B`), sharp flame-tongue shapes, fast upward + flicker, short life. Heat-haze shimmer optional. Density medium.
- **Ice — frost mist:** slow-falling snowflake/shard sprites (`#A9E4FF`/`#F2FAFF`), drifting cold mist (soft translucent spheres trailing body), brittle sparkle pops. Slow, floaty.
- **Poison — vapor wisps:** rising bubbly **vapor wisps** (`#7FE05A`/`#A45CFF`), rounded blobs + oily wisp ribbons that dissipate, occasional drip globule falling off body. Wobbly motion.
- **Water — droplet sparkle:** flowing **droplet sparkles** (`#4FE3FF`/`#46D6E0`), smooth crescent ribbons trailing the body undulation, droplets shed off fins, soft splash sparkles. Graceful arcs.

---

## 5. SUMMARY: variant matrix

| | Fire | Ice | Poison | Water |
|---|---|---|---|---|
| Antlers | jagged flame | crystal shards | drippy organic | flowing fronds |
| Dorsal | flame fins | **crystal spines** | membrane fins | **flowing ribbon fins** |
| Tail | flame fan | crystal fan | ragged membrane | **ribbon (animated)** |
| Aura | ember trail | frost mist | vapor wisps | droplet sparkle |
| Counters | (beaten by Water) | (beaten by Fire) | (beaten by Ice) | (beaten by Poison) |

---

## 6. FLIGHT / ANIMATION SPECS

> All body motion = drive the **spine chain**; segments + fins + whiskers + belly follow. Whiskers, mane, tail fin, dorsal fins get **follow-through** sway.

### IDLE-FLIGHT / HOVER (loop)
- **Sinusoidal undulation** travels head→tail along the spine (a sine wave moving down the body):
  - Vertical amplitude **0.15 units**, frequency **~0.5 Hz**, wavelength ~half body length, phase shifts per segment so the wave propagates.
  - Slight horizontal serpentine too (amplitude 0.08).
- Whiskers + mane trail and drift. Belly glow pulses ±15% @ 0.6 Hz. Mouth occasionally parts. Wing-less hover bob ±0.05 Y on the whole body.

### SWIM / MOVE (travel)
- Stronger undulation: amplitude **0.25**, frequency **0.8–1.0 Hz**. Body "swims" forward through air, head leads.
- **Banking into turns:** when turning, **roll the spine into the turn** (bank angle up to ~30° toward turn center), head leads the curve, body follows the arc; outer fins flare. Tail whips to counter.

### LUNGE ATTACK (whip strike)
- **Anticipation (~0.15s):** body coils back — rear spine nodes pull back, head draws back + up, **mouth opens**, charge particles gather at mouth, belly glow brightens.
- **Strike (~0.2s, ease-out):** **whip the spine forward** — a fast traveling impulse runs head→tail, head lunges at target along +Z, snapping the body straight then S-curving. Fast aura trail, slash/breath VFX from mouth.
- **Hit:** hit-stop 80ms, element impact ring, screen shake.
- **Recover (~0.3s):** body recoils, settles back into undulating hover, one overshoot S-wave ripples down to tail.

### BREATH ATTACK (ranged, per element)
- Charge: mouth opens, pearl/eyes flare, particles converge at mouth (1.0s telegraph).
- Release: cone/stream of element VFX projected forward (Fire=flame cone, Ice=frost shards spray, Poison=vapor cloud, Water=pressure jet). Recoil ripple down spine.

### SUMMON-IN / SUMMON-OUT
- Handled with the Sister's transform (`dragon-sister.md` §Transformation): emerges by **unspooling the spine upward** out of the energy column (head first, segments stream up after), whiskers/fins snap out, aura ignites. Reverse to dismiss.
```
```
*End dragon-parametric.md*
