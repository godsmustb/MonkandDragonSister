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

export const PREVENT_KEYS = new Set([
  'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Numpad8', 'Numpad4', 'Numpad5', 'Numpad6', 'Enter',
  'NumpadEnter', 'KeyI', 'KeyJ', 'KeyK', 'KeyL',
]);
