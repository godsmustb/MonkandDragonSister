# DEMON LINE — 5-Level Enemy Progression

> Each demon is themed to one element and **designed to punish the matching dragon and reward its counter**.
> **Element ring (counter chain): Water ▸ Fire ▸ Ice ▸ Poison ▸ Water.**
> So: a demon "of element X" resists X-dragon, takes bonus damage from the dragon that beats X.
> Inherits shading from `ART_BIBLE.md`: `MeshToonMaterial` + shared ramp, inverted-hull outline (1.04 grunts, 1.05 bosses, ink = dark element-tint), emissive cores/veins for bloom.
> Per-element VFX colors/shapes per ART_BIBLE §6 + dragon-parametric palette.

### Counter table (design intent)
| Lvl | Demon | Element | Resists (dragon) | Weak to (dragon) |
|---|---|---|---|---|
| L1 | Shadowling | Neutral | — | any |
| L2 | Frost Imp | Ice | Ice | **Fire** |
| L3 | Tide Wraith | Water | Water | **Poison** |
| L4 | Venom Oni | Poison | Poison | **Ice** |
| L5 | Inferno Demon Lord | Fire | Fire | **Water** |

---
---

## L1 — SHADOWLING (neutral fodder)

**Silhouette:** small hunched smoke-puff blob with a bright white oni half-mask floating on the front and two wispy claw-arms. Reads instantly as "weak shadow thing." Height **~0.9**.

**Palette**
| Role | Hex |
|---|---|
| Smoke body (dark, translucent) | `#2A2436` @ alpha 0.6–0.8 |
| Smoke shadow | `#171320` |
| Mask (white) | `#EDE9E0` |
| Mask eye-slit glow (emissive) | `#FF3B5C` red |
| Wisp claw | `#3A3350` |

**Part list (~22)**
- **Body:** 3–4 **layered translucent dark spheres** (Ø0.30–0.45), stacked/overlapping, `MeshBasicMaterial` transparent + `depthWrite:false`, slow scale-jitter (smoke churn). Soft bottom wisps (2 tapered cones trailing down, no feet — it hovers).
- **Oni half-mask:** white curved plane / half-sphere-cap on the front upper body. Painted: angry brow, two **glowing eye slits** (emissive red, bloom), jagged top edge. Single horn nub on one side (asymmetry).
- **Claw-arms ×2:** wispy tapered tubes (`TubeGeometry`) ending in 3 small claw cones each. Drift/sway.
- Outline only on the mask + claws (body is smoke, no hard outline).
- Floating mote particles rising off body (dark wisps).

**Attack — MELEE LUNGE (fodder)**
- **Telegraph (~0.3s):** body squashes back, mask eye-slits flash brighter, pulls into a coil. Low growl wisp.
- **Strike (~0.15s):** lunges straight at target, claws lead, stretches forward (1.1 Z). Small claw-swipe.
- **Recover (~0.3s):** drifts back, body re-puffs, overshoot wobble.

**Death dissolve (~0.4s):** body spheres expand + fade alpha to 0 (puff of smoke), mask drops, cracks, fades; a few dark motes scatter upward. Quick, cheap, satisfying.

---

## L2 — FROST IMP (ice) — *Fire counters*

**Silhouette:** small crouched gremlin made of jagged icicle shards, glowing blue core in the chest, spiky back. Pointy + brittle reads as "ice." Height **~1.0** (crouched).

**Palette**
| Role | Hex |
|---|---|
| Ice body (pale blue) | `#8FC5E8` |
| Ice shadow | `#5E91BE` |
| Ice highlight / tips | `#F2FAFF` |
| Core glow (emissive) | `#A9E4FF` cyan |
| Claw / spike tips | `#DCEFFF` |

**Part list (~30)**
- **Torso core:** faceted angular body (icosahedron-ish / low-poly sphere), pale blue.
- **Icicle-crystal shards:** ~8–10 sharp **cones/prisms** jutting from back, shoulders, forearms (the body is "growing" icicles). Instanced where possible.
- **Blue core:** emissive sphere Ø0.10 in chest, bloom, pulsing.
- **Head:** small faceted sphere, 2 angular horn shards, painted scowling icy face (narrow glowing eyes, sharp grin).
- **Arms ×2:** short, ending in 3-claw icicle hands.
- **Legs ×2:** short crouched, clawed feet (or hovers low).
- Frost-mist particles drifting off body (slow, falling).
- Outline 1.04, ink `#1E3A52`.

**Attack — ICICLE VOLLEY (ranged lobber)**
- **Telegraph (~0.5s):** crouches lower, core flares bright, raises both arms — **icicle shards form above** (2–3 crystal projectiles spawn + grow over the head). Clear tell.
- **Strike (~0.3s):** flings arms forward, **lobs the icicles** in arcs at target. Each = sharp ice shard projectile, frost trail, shatter-ring on impact.
- **Recover (~0.4s):** arms drop, core dims, small shiver. Vulnerable window.

**Death dissolve (~0.5s):** body **shatters** — shards fly outward + fall, scale down + fade; core flares then snuffs (cyan flash). Ice-tinkle. Leaves a brief frost decal.

---

## L3 — TIDE WRAITH (water) — *Poison counters*

**Silhouette:** tall hooded robed spirit, no legs (flowing wave-hem trailing into mist), holding a coral trident. Elegant, eerie, flowing. Height **~1.5**.

**Palette**
| Role | Hex |
|---|---|
| Robe (deep blue) | `#235C8C` |
| Robe shadow | `#16395A` |
| Robe inner / cyan trim | `#46D6E0` |
| Hood void (dark) | `#0E2030` |
| Eye glow (emissive) | `#4FE3FF` cyan |
| Coral trident | `#E07A5F` coral / `#1E5F9E` |

**Part list (~28)**
- **Robe body:** `LatheGeometry` flowing profile, hooded shoulders → widening to a **sine-wave hem** (lower hem vertices offset by a sine around the circumference → scalloped wave edge, animated to ripple). Deep blue, cyan trim band.
  - Profile (radius,y): `(0.10,1.4)(0.16,1.2)(0.22,0.9)(0.30,0.5)(0.40,0.15)` then wavy hem.
- **Hood:** sphere-cap / cone over head, dark void interior with **2 glowing cyan eyes** (emissive spheres) inside — no painted face, just glowing eyes in shadow.
- **Sleeves ×2:** wide trailing lathe sleeves, flow/sway. Inner hands faintly visible.
- **Coral trident:** shaft (cylinder) + 3-prong coral head (branching cones, coral color), held in one hand. Slight emissive cyan tips.
- **No legs:** robe trails into 3–4 translucent wave-wisp tendrils (additive, drift).
- Water-droplet sparkle particles shedding off hem.
- Outline 1.04, ink `#0E2C4A`.

**Attack — WATER-BOLT (ranged)**
- **Telegraph (~0.5s):** raises trident, **water orb charges** at the prongs (cyan sphere grows, droplets spiral in), hood eyes flare, hem ripples faster.
- **Strike (~0.25s):** thrusts trident forward, **fires a water-bolt** (fast cyan projectile, crescent/ribbon trail, splash-ring on impact). Can fire a 3-bolt spread at higher tier.
- **Recover (~0.4s):** trident lowers, hem settles, drifts back. Glide-strafes between casts.

**Death dissolve (~0.6s):** robe **collapses into water** — hem floods downward, body loses cohesion and pours into a spreading puddle (flat disc that fades), trident drops + dissolves, eyes wink out (cyan flash). Splash particles.

---

## L4 — VENOM ONI (poison, MINI-BOSS) — *Ice counters*

**Silhouette:** big, broad, hunched horned oni. Heavy underbite/fanged jaw, huge spiked club over one shoulder, glowing kanji on a fat belly, drippy. Brutish + toxic. Height **~2.3**, wide.

**Palette**
| Role | Hex |
|---|---|
| Skin (violet-grey) | `#6E5A86` |
| Skin shadow | `#473A5E` |
| Belly / lighter skin | `#8A77A2` |
| Toxic accent (horns, nails, drip) | `#7FE05A` green |
| Venom glow (emissive) | `#A45CFF` violet / `#7FE05A` |
| Mask/face mark | `#1E1430` |
| Loincloth | `#3A2A52` |
| Kanji mark (emissive) | `#7FE05A` |

**Part list (~45)**
- **Torso:** big barrel sphere/capsule, broad shoulders (2 large sphere deltoids).
- **Belly:** fat lower sphere, with a painted/emissive **kanji mark** (e.g. 毒 "poison") decal on the front, glowing green, bloom.
- **Head:** large sphere, **fanged underbite jaw** (lower jaw juts out, 4–6 white fang cones pointing up), broad nose, heavy painted angry oni face (glaring eyes, furrowed brow, war-paint stripes). 2 big curved **horns** (cones, swept up/out, toxic-green tint).
- **Mask option:** the face IS a painted oni-mask look (underbite mask face).
- **Arms ×2:** thick, big 4-claw hands (claw cones, green nails).
- **Legs ×2:** stocky, splayed, clawed feet. Loincloth lathe skirt.
- **Spiked club (kanabō):** thick cylinder/tapered shaft + rows of **spike studs** (instanced small cones/pyramids), gripped one-handed over shoulder. Heavy.
- **Venom drips:** small green emissive blobs at fangs, club, claws (slow drip particles).
- Outline 1.05, ink `#2E1742`. Belly kanji + venom = bloom.

**Attacks (mini-boss, telegraph→strike→recover)**

1. **CLUB SLAM (~1.2s)**
   - Telegraph 0.5s: rears back, **lifts club high overhead** with both hands (huge readable wind-up), belly kanji flares, roar, body stretches up.
   - Strike 0.2s: **smashes club down** (+Z), squash on impact, **hit-stop 90ms**, big **venom-pool VFX** spreads on ground (green/violet expanding splat disc = lingering hazard), shockwave ring, screen shake.
   - Recover 0.5s: club stuck briefly, tugs it free, returns to guard. Big vulnerable window.

2. **VENOM POOL SLAM / spit (~1.0s)**
   - Telegraph: hunches, belly inflates + glows, fangs drip heavy.
   - Strike: **slams belly/fists or spits** — spawns **2–3 venom pools** at range (bubbling green hazard discs, bubble-pop particles, deal DoT). Vapor wisps rise.
   - Recover: pant, belly deflates.

**Death dissolve (~1.0s):** staggers, drops club (clangs), **bloats then bursts into venom vapor** — body inflates, kanji flares white-hot, then dissolves into a rising violet/green vapor cloud + collapsing puddle; horns/club clatter down + dissolve. Slow, weighty (it's a mini-boss).

---

## L5 — INFERNO DEMON LORD (fire, FINAL BOSS) — *Water counters*

> The payoff of the element system: only the **Water dragon** truly punishes him. Two phases. Big, theatrical, readable even in split-screen.

**Silhouette:** large winged demon, broad horned-crown head, magma-cracked muscular body glowing from within, great membrane wings, clawed. Height **~3.4** (taller w/ wings spread ~4.0 wide).

**Palette**
| Role | Hex |
|---|---|
| Skin (charcoal rock) | `#2A1C1C` |
| Skin shadow | `#170E0E` |
| Magma veins (emissive) | `#FF6A2A` → `#FFC24B` |
| Crimson plates | `#7A1A12` |
| Flame crown (emissive) | `#FFB23B` / `#FF6A2A` |
| Wing membrane | `#3A1410` (translucent), veins `#C42A1C` |
| Horns / claws | `#1A1212` charcoal, tips `#E8B84B` |
| Eyes (emissive) | `#FFD34B` gold |
| Phase-2 hot core | `#FFE7A0` near-white |

**Part list (~60)**
- **Torso:** large muscular barrel (multiple stacked spheres for chest/abs/pecs), charcoal rock with **magma crack veins** — emissive line-meshes / painted glowing cracks running across body (bloom). Crimson armor plates on chest/shoulders.
- **Head:** big sphere, heavy brow, **flame crown** = ring of upward emissive flame-tongue fins around the head (animated flicker, bloom). 2–4 large swept **horns** (cones). Painted/sculpted snarling demon face, glowing gold eyes, fanged maw (jaw opens for roar/breath).
- **Wings ×2:** bat-membrane wings — 3–4 finger-bones (tapered cylinders) per wing spanning a translucent membrane (planes between bones), crimson vein detail. Fold/spread + flap.
- **Arms ×2:** massive, big 4-claw hands (large claw cones, gold tips).
- **Legs ×2:** digitigrade/stocky, clawed hooves-feet. Loincloth/plate skirt (lathe).
- **Magma vein network:** emissive crack meshes across torso/arms/legs; **pulse brighter in Phase 2.**
- **Back spikes / shoulder horns:** rows of cones.
- Aura: heat-haze shimmer + rising ember particles (Fire aura per dragon-parametric Fire spec).
- Outline 1.05, ink `#3A0E0A`. Heavy bloom on all emissive.

### Phases
- **Phase 1 (100→50% HP):** grounded, wings folded, slower heavier attacks.
- **Phase 2 (<50%):** transition cutscene-beat — roars, **wings spread**, magma veins flare to near-white, flame crown grows, body scale +5%, gains aerial + bigger attacks. Music/lighting shift to red. *Hint to swap to Water dragon.*

**Attacks (telegraph→strike→recover)**

1. **FLAME WAVE (P1, ~1.4s)**
   - Telegraph 0.6s: drags one claw back, arm + veins glow hot, crouches (huge tell).
   - Strike 0.3s: **sweeps claw across ground**, sends a **wall/wave of fire** rolling outward (expanding flame arc the players must jump/dodge), hit-stop, ground scorch decal lingers.
   - Recover 0.5s.

2. **EMBER STORM (P1/P2, ~1.6s)**
   - Telegraph 0.7s: throws head back, **flame crown + crown roars**, arms spread, sky darkens/reddens — **targeting circles** appear on ground (clear AoE tells).
   - Strike: rains **falling ember meteors** (fireball projectiles drop on the circles, explode into flame puffs). Intensifies in Phase 2 (more, faster).
   - Recover: pants, crown settles.

3. **WING FIRESTORM (P2 only, ~1.8s)**
   - Telegraph: leaps up / hovers, **wings spread wide**, gathers a fireball at chest (charge particles, core flares near-white).
   - Strike: **flaps wings → fan of flame breath / firestorm** sweeping the arena (directional flame cone + wind gusts), plus an explosion ring on landing. Heavy hit-stop + shake.
   - Recover 0.7s: lands hard (crater decal), wings droop briefly — **prime punish window for the Water dragon.**

**Death dissolve (~2.5s, theatrical):**
- Phase: staggers, falls to one knee, magma veins **flare white-hot** and crack wider, gouts of fire vent from the cracks. Flame crown sputters.
- Then: **body crumbles to cooling charcoal** — emissive fades from veins outward to black, chunks break off (drop + dissolve), wings disintegrate to ember motes that swirl up and out, a final flame-burst flash + slow shockwave ring as he collapses into a fading ember pile. Hold on the cooling cinders, then fade. Camera slow-mo + bloom flare on the final burst.

---

## SHARED DEMON NOTES
- **Telegraph readability:** all wind-ups exaggerate (scale up, emissive flash) for small split-screen viewports — see ART_BIBLE §7.
- **Element feedback:** when hit by the **countering dragon**, flash white + extra impact particles + bonus damage numbers; when hit by the **resisted element**, dull thud + "resist" spark. Teaches the ring.
- **Reuse:** Frost Imp shards, Tide Wraith lathe robe, and Venom Oni club studs are good reusable instanced-geometry helpers shared with other systems.
```
```
*End demon-line.md*
