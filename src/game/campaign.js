// src/game/campaign.js — Pass 15: Campaign framework, scaling formulas, DDA
// Covers:
//   • LANDS data (4 elemental lands, Land 1 = playable TRIAL, 2-4 comingSoon)
//   • dIndex(land, level) — global difficulty index D ∈ [1,20]
//   • Enemy scaling: scaleHp / scaleAtk / scaleDef / scaleSpeed
//   • pickWeightedElement(themeElement, rng) — 70/20/10 spawn weighting
//   • ELEMENT_TO_TYPE map — demon type per element (for endless spawner)
//   • DDA controller — EWMA skill score S, multiplier m (applied by quest.js)

// ── Land definitions ────────────────────────────────────────────────────────
// themeElement: the dominant element of enemies in this land.
// counterDragon: which Sister form is most effective against the land's theme.
// comingSoon: true if not yet playable.
export const LANDS = [
  {
    id: 1,
    name: 'The Zen Garden',
    subtitle: 'Quest I — The Vow of Compassion',
    themeElement: 'neutral',   // W1 shadowlings, escalates to fire boss — full mix
    counterDragon: 'water',    // Water counters the fire final boss
    comingSoon: false,         // PLAYABLE — this is the current Trial
    description: 'A sacred garden invaded by shadow-demons. Face the Inferno Demon Lord.',
  },
  {
    id: 2,
    name: 'The Glacial Peaks',
    subtitle: 'Quest II — The Frozen Summit',
    themeElement: 'ice',
    counterDragon: 'fire',     // Fire beats Ice
    comingSoon: false,         // PLAYABLE — Level 2 now AAA-complete + directly selectable
    description: 'Ancient ice fortresses guarded by frost warlords. Fire dragon required.',
  },
  {
    id: 3,
    name: 'The Poison Wastes',
    subtitle: 'Quest III — The Withered Valley',
    themeElement: 'poison',
    counterDragon: 'ice',      // Ice beats Poison
    comingSoon: true,
    description: 'A blighted wasteland seething with venomous horrors. Only ice endures.',
  },
  {
    id: 4,
    name: 'The Abyssal Depths',
    subtitle: 'Quest IV — The Final Tide',
    themeElement: 'water',
    counterDragon: 'poison',   // Poison beats Water
    comingSoon: true,
    description: 'The sunken realm where the element-shift final boss awaits. Master all forms.',
  },
];

// ── Global difficulty index ─────────────────────────────────────────────────
// D = 1 for Land 1 Level 1, D = 20 for Land 4 Level 5.
export function dIndex(land, level) {
  return (land - 1) * 5 + level;
}

// ── Enemy scaling formulas (per PROGRESSION_DESIGN_2026.md §2) ─────────────
// base: the value from DEMON_TABLE.  D: dIndex(land, level).
// Returns a scaled numeric value (not rounded — caller rounds if needed).

/** HP: gentle quadratic S-curve (Warframe-style). */
export function scaleHp(base, D) {
  return base * (1 + 0.10 * (D - 1) + 0.012 * (D - 1) ** 2);
}

/** ATK: linear — keeps TTK fair (players forgive spongy; they rage at one-shots). */
export function scaleAtk(base, D) {
  return base * (1 + 0.08 * (D - 1));
}

/** DEF: additive (multiplicative armor = death spiral). */
export function scaleDef(base, D) {
  return base + 0.5 * (D - 1);
}

/** Speed: hard-capped at +35% (speed is the #1 unfairness lever). */
export function scaleSpeed(base, D) {
  return base * Math.min(1.35, 1 + 0.02 * (D - 1));
}

// ── Element → demon-type mapping ────────────────────────────────────────────
// Maps a chosen element to the best-fit demon type for endless spawning.
// Neutral element maps to shadowling (the generic fodder type).
export const ELEMENT_TO_TYPE = {
  neutral: 'shadowling',
  fire:    'shadowling',   // No fire fodder yet — shadowling stands in (visual only)
  ice:     'frostimp',
  poison:  'shadowling',   // No poison fodder yet — shadowling stands in
  water:   'tidewraith',
};

// The four non-boss "land theme" elements that rotate in endless mode.
export const LAND_ELEMENTS = ['neutral', 'ice', 'poison', 'water'];

// ── Weighted element picker (70 / 20 / 10) ──────────────────────────────────
// themeElement: the dominant element for this land/cycle.
// rng: a seeded or plain Math.random()-compatible function.
// Returns one of: 'neutral' | 'fire' | 'ice' | 'poison' | 'water'.
export function pickWeightedElement(themeElement, rng) {
  const r = rng();
  if (r < 0.70) return themeElement;           // 70% — theme element
  if (r < 0.90) return 'neutral';              // 20% — neutral (shadowlings always work)
  // 10% — off-element: pick any element that is not theme or neutral.
  const off = ['fire', 'ice', 'poison', 'water'].filter(e => e !== themeElement);
  return off[Math.floor(rng() * off.length)] || 'neutral';
}

// ── DDA (Dynamic Difficulty Adjustment) controller ──────────────────────────
// Hidden ±15% multiplier on spawn-count and enemy HP only.
// Updated once per endless wave end via recordWavePerf().
// S: EWMA skill score [0,1] (0=struggling, 0.5=flow, 1=dominating).
// m: HP/density multiplier [0.85, 1.15].
const dda = {
  S: 0.5,   // start in flow-band
  m: 1.0,   // start neutral
};

/**
 * Record wave performance and update DDA state.
 * @param {object} perf  — { hpRetainedFrac, clearTime, parTime, deaths, livesBudget }
 * hpRetainedFrac: average player HP fraction at wave end (0..1).
 * clearTime: seconds taken to clear.
 * parTime: expected seconds (use 60 as default).
 * deaths: number of KO events this wave (0..2).
 * livesBudget: max lives (usually 3).
 */
export function recordWavePerf({ hpRetainedFrac = 0.5, clearTime = 60, parTime = 60,
                                  deaths = 0, livesBudget = 3 } = {}) {
  const hpScore    =  0.35 * Math.max(0, Math.min(1, hpRetainedFrac));
  const timeScore  =  0.25 * Math.max(0, 1 - Math.min(1, clearTime / parTime));
  const deathScore = -0.40 * Math.min(1, deaths / Math.max(1, livesBudget));
  const perf = Math.max(0, Math.min(1, hpScore + timeScore + deathScore + 0.25));
  // EWMA — never react to a single wave
  dda.S = Math.max(0, Math.min(1, 0.85 * dda.S + 0.15 * perf));
  // Nudge toward flow-band (S=0.5)
  dda.m += 0.05 * (dda.S - 0.5);
  dda.m = Math.max(0.85, Math.min(1.15, dda.m));
}

/** Reset DDA to neutral (call on startEndless or hard reset). */
export function resetDDA() {
  dda.S = 0.5;
  dda.m = 1.0;
}

/** Live read of DDA state (exposed to window.__game.dda). */
export function getDDA() {
  return { S: dda.S, m: dda.m };
}
