// src/state.js — shared mutable context
// All modules read/write this object instead of using globals.
// scene, renderer, cameras, camState, keys, gameState, etc.
// Render quality: 'high' (post-processing composer: bloom + ACES + SMAA) or
// 'low' (direct render, no composer — for weak machines). Persisted to
// localStorage; default 'high'. Read once at boot so module init can branch.
import { IS_TOUCH } from './config.js';
function _readQuality() {
  try {
    const v = localStorage.getItem('mds_quality');
    if (v === 'low' || v === 'high') return v;
  } catch (e) { /* localStorage may be unavailable */ }
  // No saved preference yet: default TOUCH/mobile devices to 'low'. The high path's
  // bloom + SMAA composer is heavy for mobile GPUs. Desktop still defaults to 'high'.
  if (IS_TOUCH) return 'low';
  return 'high';
}

export const ctx = {
  scene: null,
  renderer: null,
  cameras: null,
  camState: null,
  keys: null,
  gameState: null,
  impactLight: null,
  game: null,
  quality: _readQuality(),  // 'high' | 'low'
  // world animation arrays (was window._koi etc.)
  koi: [],
  bamboo: [],
  clouds: [],
  petals: [],
  // distant scenery / fx animation arrays (Pass 4)
  cloudLayers: [],
  grassTufts: [],
  pondRipple: null,
  sunGlow: null,
  // Level-theme system (world/theme.js): captured material/light refs to re-palette
  // per campaign level, and the active theme id. Populated during buildSky/world.
  themeRefs: null,
  _activeTheme: 1,
  // Pass 12 — game mode
  mode: '2p',           // '2p' | '1p'
  soloChar: null,       // null | 'monk' | 'sister'  (1p only)
  aiPartner: false,     // false | true  (1p only)
  // Pass 13 — control bindings (populated by loadBindings() in main.js boot)
  bindings: null,
};

export function setQuality(q) {
  ctx.quality = (q === 'low') ? 'low' : 'high';
  try { localStorage.setItem('mds_quality', ctx.quality); } catch (e) { /* ignore */ }
  return ctx.quality;
}
