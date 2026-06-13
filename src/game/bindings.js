// src/game/bindings.js — Control binding system with localStorage persistence
// Provides: DEFAULT_BINDINGS, loadBindings(), saveBindings(), resetBindings(),
//           isDown(who, action), matchAction(who, code)
import { ctx } from '../state.js';

// ── Default bindings ───────────────────────────────────────────────────────
export const DEFAULT_BINDINGS = {
  p1: {
    up:     ['KeyW'],
    down:   ['KeyS'],
    left:   ['KeyA'],
    right:  ['KeyD'],
    attack: ['Space', 'KeyI'],
    shield: ['KeyJ'],
    dodge:  ['KeyK'],
    heal:   ['KeyL'],
    jump:   ['KeyC'],
    lockon: ['KeyF'],
    orbitL: ['KeyQ'],
    orbitR: ['KeyE'],
  },
  p2: {
    up:        ['ArrowUp'],
    down:      ['ArrowDown'],
    left:      ['ArrowLeft'],
    right:     ['ArrowRight'],
    attack:    ['Enter', 'NumpadEnter', 'Numpad8'],
    transform: ['Numpad4'],
    dodge:     ['Numpad5'],
    special:   ['Numpad6'],
    jump:      ['Numpad2'],
    lockon:    ['Numpad0'],
    orbitL:    ['Numpad7'],
    orbitR:    ['Numpad9'],
  },
};

const STORAGE_KEY = 'mds_bindings';

// ── Deep-merge: src over base, returns new object ─────────────────────────
function _deepMerge(base, src) {
  const result = {};
  for (const k of Object.keys(base)) {
    if (src && Array.isArray(src[k]) && src[k].length > 0) {
      result[k] = src[k].slice();
    } else {
      result[k] = Array.isArray(base[k]) ? base[k].slice() : base[k];
    }
  }
  // Also copy any NEW actions in base that src doesn't have
  return result;
}

// ── Load from localStorage, deep-merge over defaults ─────────────────────
export function loadBindings() {
  let saved = null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) saved = JSON.parse(raw);
  } catch (_) { saved = null; }

  const bindings = {
    p1: _deepMerge(DEFAULT_BINDINGS.p1, saved && saved.p1),
    p2: _deepMerge(DEFAULT_BINDINGS.p2, saved && saved.p2),
  };
  ctx.bindings = bindings;
  return bindings;
}

// ── Save ctx.bindings to localStorage ─────────────────────────────────────
export function saveBindings() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ctx.bindings));
  } catch (_) {}
}

// ── Restore defaults + save ────────────────────────────────────────────────
export function resetBindings() {
  ctx.bindings = {
    p1: _deepMerge(DEFAULT_BINDINGS.p1, null),
    p2: _deepMerge(DEFAULT_BINDINGS.p2, null),
  };
  saveBindings();
}

// ── isDown(who, action) → true if any bound key for action is held ─────────
export function isDown(who, action) {
  const keys = ctx.keys;
  if (!keys || !ctx.bindings) return false;
  const codes = ctx.bindings[who][action];
  if (!codes) return false;
  for (let i = 0; i < codes.length; i++) {
    if (keys[codes[i]]) return true;
  }
  return false;
}

// ── matchAction(who, code) → action name or null ──────────────────────────
export function matchAction(who, code) {
  if (!ctx.bindings) return null;
  const map = ctx.bindings[who];
  if (!map) return null;
  for (const action of Object.keys(map)) {
    const codes = map[action];
    if (codes && codes.includes(code)) return action;
  }
  return null;
}
