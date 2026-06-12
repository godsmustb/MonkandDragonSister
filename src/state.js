// src/state.js — shared mutable context
// All modules read/write this object instead of using globals.
// scene, renderer, cameras, camState, keys, gameState, etc.
export const ctx = {
  scene: null,
  renderer: null,
  cameras: null,
  camState: null,
  keys: null,
  gameState: null,
  impactLight: null,
  game: null,
  // world animation arrays (was window._koi etc.)
  koi: [],
  bamboo: [],
  clouds: [],
  petals: [],
};
