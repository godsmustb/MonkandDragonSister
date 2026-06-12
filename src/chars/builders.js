// src/chars/builders.js — character builders facade
// Pass 2: implementations split into common.js / monk.js / sister.js / dragon.js.
// This module re-exports the public API so existing imports keep working.
export { getGradTex, toonMat, addOutline } from './common.js';
export { buildMonk } from './monk.js';
export { buildSister } from './sister.js';
export { buildDragon } from './dragon.js';
