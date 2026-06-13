# Progression, Difficulty & Power Design (June 2026 research)

> Research-backed, implementable design for the campaign, difficulty, bosses, and
> Bleach-style power arc. Grounded in live sources (Warframe scaling, Vampire
> Survivors cycles, Hades DDA, Souls boss design, mistreevous behaviour trees).
> Translated into this project's conventions: `stat(L)=base×(1+0.18(L-1))`, the
> Water>Fire>Ice>Poison ring, `ctx` / `window.__game` patterns, dt-driven FX.

## 1. Campaign shape — 4 lands × 5 levels

- 4 lands (Fire / Ice / Poison / Water themed) × 5 levels = 20 levels.
- Global difficulty index **`D = (land-1)*5 + level`**, D ∈ [1,20] — one number drives all enemy scaling.
- Per land: **levels 1–4 = escalating combat** (3–5 waves each, tension curve) → **level 5 = boss**, with a "relief" beat (low density, relic/heal) right before the boss. Tension curve (build→peak→relief), not a monotonic ramp (L4D AI-Director principle).

## 2. Enemy scaling (drop-in formulas)

```js
hp    = base.hp    * (1 + 0.10*(D-1) + 0.012*(D-1)**2); // gentle quadratic (Warframe S-curve)
atk   = base.atk   * (1 + 0.08*(D-1));                  // linear — keep time-to-kill fair
def   = base.def   + 0.5*(D-1);                          // ADDITIVE (multiplicative armor = death spiral)
speed = base.speed * Math.min(1.35, 1 + 0.02*(D-1));    // HARD CAP — speed is the #1 unfairness lever
// density is a SEPARATE knob from stats:
spawnCount    = Math.ceil(baseCount * (1 + 0.20*(w-1)) * (1 + 0.05*(D-1)) * ddaM);
spawnInterval = Math.max(0.6, baseInterval * 0.92**(w-1));
maxConcurrent = Math.min(perfBudget, 6 + Math.floor(D/2)); // cap for browser FPS + readability
```
Rule of thumb: **HP scales fastest, ATK slowest, speed capped.** Players forgive spongy; they rage at one-shots and un-dodgeable speed.

## 3. Element-gated lands — SOFT gate, never hard gate

- Per-land spawn weighting: **70% land-element / 20% neutral / 10% off-element.** Never 100% — that forces one form and kills build expression. The 20%+10% guarantees every dragon always has *something* to be good against.
- Multipliers: keep **counter 2.0×**, but raise the off-element floor from 0.5× → **0.65×**. At 0.5× a tanky late-game enemy can become a literal wall; 0.65× = "~1.5× longer fight," hard not impossible. Net spread right-vs-wrong ≈ 3.0–3.3× — strong incentive, not mandatory.
- Boss may be mono-element (its theme = land's reward dragon is clearly correct) BUT must have a **neutral-damage window or off-element adds** so a "wrong" player can still win with skill.
- **Legibility is everything** — color-code demons by `ELEMENT_COLORS` so players learn the RPS by reading the arena.

## 4. Progressive difficulty + DDA (Dynamic Difficulty Adjustment)

No production JS DDA lib worth importing; hand-roll a tight **flow-band controller** (study: arrakh/ArrDDA C#, Capybara-Survivor GDScript which adjusts every 40s on a perf slope):
```js
// per WAVE end (not per frame):
perf = 0.35*hpRetainedFrac + 0.25*(1-clamp(clearTime/parTime)) + 0.25*dodgeSuccessFrac - 0.40*(deaths/livesBudget);
S = clamp(0.85*S_prev + 0.15*perf, 0, 1);   // EWMA — never react to a single wave
m += 0.05*(S - 0.5);                          // nudge toward "challenged but winning"
m = clamp(m, 0.85, 1.15);                     // ±15% only
```
**Anti-cheese rules (what makes DDA not feel cheap):**
- Apply `m` to **spawnCount + enemy HP ONLY — never ATK or speed** (players instantly detect damage rubber-banding).
- **Asymmetric assist** (Hades "God Mode"): help the struggling player, never punish a winning one (stacking resist on death streaks).
- Hide it (no UI); evaluate on a cadence; expose `window.__game.dda = {S, m}` for E2E to assert it stays in band and never touches ATK/speed.

## 5. Bosses — +1 *verb* per boss (new mechanics, not bigger numbers)

Architecture: import **mistreevous** (MIT, TS, browser-ready behaviour trees) — `lotto` weighted attack bags, guard conditions on `hp%` for phase transitions. Boss = FSM over HP-gated phases; each phase = a BT of attack patterns. Telegraph scaled to lethality (bigger hit = longer, clearer tell + color flash + audio sting). Soft enrage at `par×1.5` (visible red glow), never a hard wall.

| Boss | New mechanic it teaches |
|---|---|
| Land 1 | Phases + reading tells |
| Land 2 | Adds-spawning mid-fight (target prioritization) |
| Land 3 | Arena hazards + forced-reposition attack (spatial management) |
| Land 4 | **Element-shift phase** — boss changes element between phases, forcing dragon-form swaps mid-fight. The capstone exam of the whole element system. |

## 6. Bleach-style power arc — 3 story-gated tiers (synced to difficulty)

Tiers are *step-function spikes*; the `1+0.18(L-1)` curve is the *smooth ramp between* them. Each tier unlocks exactly when a new boss mechanic appears, so the new power is the *answer* to the new threat.

| Tier | Gate | Grants | Balanced for |
|---|---|---|---|
| **T1 Sealed** | start | Base kit; Sister 1–2 forms | Lands 1–2 |
| **T2 "Shikai" Released** | clear Land 2 boss | Named signature ability per hero + all 4 forms + resonance active | Lands 3–4 |
| **T3 "Bankai" Final** | clear Land 4 boss | Meter-driven transformation super-state (~10s, i-frames on cast, fills 2× from counter-element hits) | Endless / NG+ |

Ultimate meter fills from dealing/taking damage and counter-element hits (rewards good play); named unlocks get a one-time cinematic flash ("Bankai: Heavenly Sovereign Dragon").

## 7. Endless Wave Mode (Vampire-Survivors cycle model, ~90s cycles)

```
per cycle c: hpMult=1+1.00c, spawnMult=1+0.50c, dmgMult=1+0.25c, speedMult=min(1.4,1+0.05c)
```
- Introduce one demon type per cycle until all 5 rotate, then **mix elements** so no single dragon counters the wave → forces form-swapping = infinite variety from existing art.
- **Relic/upgrade choice every cycle boundary** so player power can chase enemy power (intended arms race; keep player power paced *just behind*).
- **Anti-stall**: at 2× par time spawn an un-counterable Reaper hazard so turtle/AFK builds can't farm forever.

## Single highest-leverage takeaway
Import **mistreevous** for boss AI, hand-roll a tight **±15% HP-and-density-only DDA** (Hades-style asymmetric assist), and lean on the **element ring as the variety engine** (70/20/10 soft-gating; mixed-element endless hordes; element-shift final boss). That trio gives escalation, fairness, and infinite replay using almost entirely systems/art already in the game.

---
*Full source list in session research history (Warframe wiki, Vampire Survivors wiki, ArrDDA, mistreevous, Souls boss-design articles, Hades/L4D DDA references).*
