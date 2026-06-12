// src/debug.js — window.__game debug API
// PRESERVED CONTRACT: state, wave, spirits, p1, p2, lastDamage, lastPlayerDamage, relics,
//   skipIntro(), teleport(), setLevel(), unlockAll()
import { ctx } from './state.js';
import { endIntro } from './game/quest.js';

export function setupDebugAPI() {
  window.__game = {
    get state()   { return ctx.gameState.state; },
    get wave()    { return ctx.gameState.wave; },
    get spirits() {
      return ctx.gameState.spirits.filter(s => s.alive).map(s => ({
        pos: { x: s.pos.x, y: s.pos.y, z: s.pos.z },
        hp: s.hp, maxHp: s.maxHp, element: s.element, alive: s.alive,
      }));
    },
    get p1() {
      const p = ctx.gameState.p1;
      return p ? { pos: { x: p.pos.x, y: p.pos.y, z: p.pos.z }, hp: p.hp, maxHp: p.maxHp, level: p.level, xp: p.xp } : null;
    },
    get p2() {
      const p = ctx.gameState.p2;
      return p ? { pos: { x: p.pos.x, y: p.pos.y, z: p.pos.z }, hp: p.hp, maxHp: p.maxHp, level: p.level, xp: p.xp, form: p.form, unlocked: p.unlockedForms.slice() } : null;
    },
    lastDamage: null,
    lastPlayerDamage: null,
    get relics() {
      const p1 = ctx.gameState.p1, p2 = ctx.gameState.p2;
      return [...new Set([...(p1 ? p1.relics : []), ...(p2 ? p2.relics : [])])];
    },
    skipIntro() {
      if (ctx.gameState.state === 'INTRO') {
        document.getElementById('intro-screen').style.display = 'none';
        // Import startWave lazily — we have a reference via endIntro already
        endIntro();
      }
    },
    teleport(playerNum, x, z) {
      const p = playerNum === 1 ? ctx.gameState.p1 : ctx.gameState.p2;
      if (p) { p.pos.set(x, 0, z); const cm = p.currentMesh(); if (cm) cm.position.copy(p.pos); }
    },
    setLevel(playerNum, level) {
      const p = playerNum === 1 ? ctx.gameState.p1 : ctx.gameState.p2;
      if (p) p.setLevel(level);
    },
    unlockAll() {
      if (ctx.gameState.p2) {
        ['fire', 'ice', 'poison', 'water'].forEach(f => ctx.gameState.p2.unlockForm(f));
      }
    },
  };
}
