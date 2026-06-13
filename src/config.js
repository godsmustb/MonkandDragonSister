// src/config.js — constants & configuration
export const ARENA_SIZE = 60;

export const LEVEL_TABLE = [];
for (let l = 1; l <= 10; l++) {
  LEVEL_TABLE.push({
    level: l,
    maxHp: Math.round(100 * (1 + 0.18 * (l - 1))),
    atk:   Math.round(10  * (1 + 0.18 * (l - 1))),
    def:   Math.round(5   * (1 + 0.18 * (l - 1))),
  });
}

export const XP_PER_KILL = [0, 40, 60, 80, 120]; // indexed by wave
export const XP_TO_LEVEL = [0, 0, 100, 220, 360, 520, 700, 900, 1120, 1360, 1620];

// ── DEMON LINE v2 (Pass 3) — per-type tuning (docs/demons/demon-line.md) ──
// type → { element, hp, atk, speed, ranged, attackRange, projSpeed, scale }
// ranged: 'none' | 'lob' | 'bolt'  — fodder elements per wave:
//   w1 Shadowling(neutral), w2 Frost Imp(ice), w3 Tide Wraith(water),
//   w4 Venom Oni(poison, mini-boss), w5 Inferno Demon Lord(fire, final boss).
export const DEMON_TABLE = {
  shadowling: { element: 'neutral', hp: 28,  atk: 9,  speed: 3.0, ranged: 'none', attackRange: 0,  projSpeed: 0,  scale: 1.0, height: 0.9 },
  frostimp:   { element: 'ice',     hp: 44,  atk: 11, speed: 2.6, ranged: 'lob',  attackRange: 16, projSpeed: 9,  scale: 1.0, height: 1.0 },
  tidewraith: { element: 'water',   hp: 56,  atk: 13, speed: 2.4, ranged: 'bolt', attackRange: 20, projSpeed: 12, scale: 1.0, height: 1.5 },
  venomoni:   { element: 'poison',  hp: 520, atk: 18, speed: 2.0, ranged: 'none', attackRange: 0,  projSpeed: 0,  scale: 2.2, height: 2.3 }, // boss HP doubled (was 260)
  infernolord:{ element: 'fire',    hp: 800, atk: 22, speed: 2.3, ranged: 'ember',attackRange: 26, projSpeed: 10, scale: 2.6, height: 3.4 }, // boss HP doubled (was 400)
};

// Which demon type each wave spawns.
export const WAVE_DEMON = {
  1: { type: 'shadowling', count: 3 },
  2: { type: 'frostimp',   count: 4 },
  3: { type: 'tidewraith', count: 4 },
  4: { type: 'venomoni',   count: 1 }, // + 2 shadowling adds (boss-driven)
  5: { type: 'infernolord',count: 1 }, // + shadowling adds in phase 2
};

export const ELEMENT_COLORS = {
  neutral: 0x555566, fire: 0xff3300, ice: 0x66ccff, poison: 0xaa00cc, water: 0x0066ff,
};

export const ELEMENT_NAMES = ['neutral', 'fire', 'ice', 'poison', 'water'];

// Counter ring: Water>Fire>Ice>Poison>Water
export function getElementMult(atk, def) {
  if (atk === 'neutral' || def === 'neutral') return 1.0;
  const strong = { water: 'fire', fire: 'ice', ice: 'poison', poison: 'water' };
  const weak   = { fire: 'water', ice: 'fire', poison: 'ice', water: 'poison' };
  if (strong[atk] === def) return 2.0;
  if (weak[atk]   === def) return 0.5;
  return 1.0;
}

export const FORM_DATA = {
  human:  { color: 0xffccaa, trailColor: 0xffccaa, name: 'Human',  glowColor: 0xffffff },
  fire:   { color: 0xff3300, trailColor: 0xff6600, name: 'Fire',   glowColor: 0xff2200 },
  ice:    { color: 0x66ccff, trailColor: 0xaaddff, name: 'Ice',    glowColor: 0x0099ff },
  poison: { color: 0xaa00cc, trailColor: 0x66ff00, name: 'Poison', glowColor: 0x880088 },
  water:  { color: 0x0066ff, trailColor: 0x00ccff, name: 'Water',  glowColor: 0x0044cc },
};

// Touch/mobile-primary detection — single source of truth.
// Uses ONLY the primary-pointer media query: `(pointer:coarse)` is true when the
// primary input is touch (phone/tablet) and false on desktop — including desktop
// Chrome, which misleadingly reports `'ontouchstart' in window` = true and
// `navigator.maxTouchPoints` = 10. Those two signals are unreliable, so excluded.
export const IS_TOUCH = (typeof window !== 'undefined') && !!(
  window.matchMedia && window.matchMedia('(pointer:coarse)').matches
);

// Whether the server-side APIs (leaderboard, analytics PHP) should be called.
// FALSE on localhost / 127.x / file:// — those have no PHP, and POSTing there
// makes the browser log a 501 "Failed to load resource" console error that JS
// catch() cannot suppress. On a real deployed domain this is TRUE and the APIs
// work; locally the clients fall back to localStorage. Keeps the test gate clean.
export const API_ENABLED = (typeof window !== 'undefined') && !!window.location &&
  window.location.protocol !== 'file:' &&
  !/^(localhost|127\.|0\.0\.0\.0|\[?::1\]?$)/i.test(window.location.hostname || '');

export const PREVENT_KEYS = new Set([
  'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Numpad8', 'Numpad4', 'Numpad5', 'Numpad6', 'Numpad7', 'Numpad9', 'Numpad0',
  'Numpad2', 'Numpad1', 'Numpad3',
  'Enter', 'NumpadEnter',
  'KeyI', 'KeyJ', 'KeyK', 'KeyL', 'KeyF', 'KeyQ', 'KeyE', 'KeyC', 'KeyU', 'KeyG',
  // Pass 16 — ULTIMATE: P1=R, P2=Numpad *
  'KeyR', 'NumpadMultiply',
]);
