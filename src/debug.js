// src/debug.js — window.__game debug API
// PRESERVED CONTRACT: state, wave, spirits, p1, p2, lastDamage, lastPlayerDamage, relics,
//   skipIntro(), teleport(), setLevel(), unlockAll()
// PASS 1 ADDITIONS: lives, startGame(), consumeLife(), forceKO(), lockOn(n),
//   state now reports 'MENU' and 'GAMEOVER'
// PASS 7 ADDITIONS: audioReady boolean (context created after first gesture)
// PASS 13 ADDITIONS: bindings getter, rebind(who, action, code)
import { ctx } from './state.js';
import { endIntro } from './game/quest.js';
import { startGame as menuStartGame } from './ui/menu.js';
import { consumeLife as _consumeLife } from './game/lives.js';
import { toggleLockOn, camExtra } from './game/camera.js';
import { saveBindings } from './game/bindings.js';

export function setupDebugAPI() {
  // Expose raw ctx for VFX testing / screenshot scripts
  window.__ctx = ctx;

  window.__game = {
    // Expose startWave for test scripts
    spawnWave(n) {
      import('./game/quest.js').then(m => m.startWave(n)).catch(() => {});
    },
    // ── Core state getters ──────────────────────────────────────────────
    get state()   { return ctx.gameState.state; },
    get wave()    { return ctx.gameState.wave; },
    get lives()   { return ctx.gameState.lives != null ? ctx.gameState.lives : 3; },

    get spirits() {
      return ctx.gameState.spirits.filter(s => s.alive).map(s => ({
        pos: { x: s.pos.x, y: s.pos.y, z: s.pos.z },
        hp: s.hp, maxHp: s.maxHp, element: s.element, alive: s.alive,
        // Pass 16: boss-phase telemetry (undefined/1 for non-bosses)
        phase: s.phase || 1, enraged: !!s.enraged,
      }));
    },

    get p1() {
      const p = ctx.gameState.p1;
      if (!p) return null;
      return {
        pos: { x: p.pos.x, y: p.pos.y, z: p.pos.z },
        hp: p.hp, maxHp: p.maxHp, level: p.level, xp: p.xp,
        isKO: p.isKO,
        resonance: p.resonance || 0, guard: p.guard != null ? p.guard : 100, blocking: !!p.blocking,
        // Pass 16: ultimate telemetry
        ultimateActive: !!p.ultimateActive, ultimateReady: !!(p.ultimateReady && p.ultimateReady()),
        hasLockTarget: !!(camExtra.p1 && camExtra.p1.lockTarget && camExtra.p1.lockTarget.alive),
      };
    },

    get p2() {
      const p = ctx.gameState.p2;
      if (!p) return null;
      return {
        pos: { x: p.pos.x, y: p.pos.y, z: p.pos.z },
        hp: p.hp, maxHp: p.maxHp, level: p.level, xp: p.xp,
        form: p.form, unlocked: p.unlockedForms.slice(),
        isKO: p.isKO,
        resonance: p.resonance || 0, guard: p.guard != null ? p.guard : 100, blocking: !!p.blocking,
        // Pass 16: ultimate telemetry
        ultimateActive: !!p.ultimateActive, ultimateReady: !!(p.ultimateReady && p.ultimateReady()),
        hasLockTarget: !!(camExtra.p2 && camExtra.p2.lockTarget && camExtra.p2.lockTarget.alive),
      };
    },

    lastDamage: null,
    lastPlayerDamage: null,

    // Pass 7: true once AudioContext is created (first user gesture).
    // Headless test environment has WebAudio API but no audio output;
    // audioReady is set to true by audio.js after context creation.
    audioReady: false,

    // Pass 12: endless mode cycle counter
    get endlessCycle() { return ctx.gameState.endlessCycle || 0; },

    get relics() {
      const p1 = ctx.gameState.p1, p2 = ctx.gameState.p2;
      return [...new Set([...(p1 ? p1.relics : []), ...(p2 ? p2.relics : [])])];
    },

    // ── Navigation ──────────────────────────────────────────────────────
    /** Transition from MENU → INTRO (mirrors clicking "Start Game") */
    startGame() {
      if (ctx.gameState.state === 'MENU') {
        menuStartGame();
      } else if (ctx.gameState.state === 'INTRO') {
        endIntro();
      }
    },

    /** Skip intro directly to WAVE1 */
    skipIntro() {
      if (ctx.gameState.state === 'MENU') {
        menuStartGame();
        // menuStartGame calls startIntro(); wait a tick then endIntro
        setTimeout(() => {
          if (ctx.gameState.state === 'INTRO') endIntro();
        }, 50);
      } else if (ctx.gameState.state === 'INTRO') {
        const introEl = document.getElementById('intro-screen');
        if (introEl) introEl.style.display = 'none';
        endIntro();
      }
    },

    // ── Cheats ──────────────────────────────────────────────────────────
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

    // ── Lives helpers ────────────────────────────────────────────────────
    /**
     * Consume one team life (runs the real code path, for E2E testing).
     * Repeating 3 times should trigger GAMEOVER.
     */
    consumeLife() {
      const p1 = ctx.gameState.p1;
      _consumeLife(p1);
    },

    /**
     * Force KO a player (for E2E: immediately set isKO=true, _koTimer=0).
     * Combined with consumeLife() this lets E2E avoid real-time wait.
     */
    forceKO(playerNum) {
      const p = playerNum === 1 ? ctx.gameState.p1 : ctx.gameState.p2;
      if (!p) return;
      p.hp = 0;
      p.isKO = true;
      p._koTimer = 0; // immediately expired
    },

    // ── Pass 14: Combat depth ────────────────────────────────────────────
    /** Trigger a heavy attack for player 1 or 2 (E2E hook). */
    heavy(playerNum) {
      const p = playerNum === 1 ? ctx.gameState.p1 : ctx.gameState.p2;
      if (p && p.heavyAttack) p.heavyAttack();
    },
    /** Set the held block stance for player 1 or 2 (E2E hook). */
    setBlocking(playerNum, on) {
      const p = playerNum === 1 ? ctx.gameState.p1 : ctx.gameState.p2;
      if (p && p.setBlocking) p.setBlocking(!!on);
    },

    // ── Pass 16: Ultimate / Bankai ───────────────────────────────────────
    /** Fill player n's RESONANCE meter to 100 (E2E hook). */
    fillResonance(playerNum) {
      const p = playerNum === 1 ? ctx.gameState.p1 : ctx.gameState.p2;
      if (p) p.resonance = 100;
    },
    /**
     * Grant the Shikai release (unlocks the ultimate) for player n — E2E hook so
     * tests can reach the ultimate without playing through Wave 2. Optional.
     */
    grantShikai(playerNum) {
      const p = playerNum === 1 ? ctx.gameState.p1 : ctx.gameState.p2;
      if (p && p.grantShikai) p.grantShikai();
    },
    /** Activate player n's ULTIMATE if ready (resonance>=100 + Shikai unlocked). */
    ultimate(playerNum) {
      const p = playerNum === 1 ? ctx.gameState.p1 : ctx.gameState.p2;
      if (p && p.ultimate) p.ultimate();
    },

    // ── Camera / lock-on ────────────────────────────────────────────────
    /**
     * Toggle lock-on for a player (1 or 2).
     * Useful for E2E assertions on hasLockTarget.
     */
    lockOn(playerNum) {
      toggleLockOn(playerNum === 1 ? 'p1' : 'p2');
    },

    // ── Camera probe hook (test/charshot.mjs visual verification) ─────────
    // Park P1 (left) or P2 (right) camera at an explicit eye/look for close-ups.
    // Returns nothing; the next render uses it (follow-cam will resume after).
    setCam(which, eye, look) {
      ctx.game._freezeCam = true; // stop follow-cam from overwriting
      const cam = ctx.cameras[which];
      if (!cam) return;
      cam.position.set(eye[0], eye[1], eye[2]);
      cam.lookAt(look[0], look[1], look[2]);
      cam.updateMatrixWorld(true);
    },
    unfreezeCam() { if (ctx.game) ctx.game._freezeCam = false; },

    // ── Demon screenshot helper (test/demonshot.mjs) ──────────────────────
    // Pin the first living demon matching `element` (or boss) to (x,z) and stop its
    // AI/ranged behaviour so it idles in place for a clean close-up. Returns its pos.
    pinDemon(element, x, z) {
      const list = ctx.gameState.spirits.filter(s => s.alive);
      const s = list.find(d => d.element === element) || list[0];
      if (!s) return null;
      s.pos.x = x; s.pos.z = z;
      s._aiState = 'recover'; s._aiTimer = 9999; // hold idle, no lunge
      s._pinned = true;
      if (s.mesh) s.mesh.position.copy(s.pos);
      return { x: s.pos.x, y: s.pos.y, z: s.pos.z, type: s._type, phase: s.phase || 1 };
    },

    // ── Pause (optional convenience) ─────────────────────────────────────
    // __game.pause() freezes simulation via the single source of truth
    // (ctx.gameState._paused) but intentionally does NOT show the pause overlay UI.
    // Use Esc in-game for the full pause-menu experience.
    pause() {
      if (ctx.gameState) ctx.gameState._paused = true;
    },
    resume() {
      if (ctx.gameState) ctx.gameState._paused = false;
    },

    // ── Pass 13: Bindings API ─────────────────────────────────────────────
    /** Live bindings table { p1: {...}, p2: {...} } */
    get bindings() { return ctx.bindings; },

    /**
     * Programmatically rebind an action and persist.
     * @param {string} who   - 'p1' | 'p2'
     * @param {string} action - e.g. 'attack', 'jump', 'dodge'
     * @param {string} code   - KeyboardEvent.code e.g. 'KeyX', 'Space'
     */
    rebind(who, action, code) {
      if (!ctx.bindings || !ctx.bindings[who]) return;
      if (!Object.prototype.hasOwnProperty.call(ctx.bindings[who], action)) return;
      ctx.bindings[who][action] = [code];
      saveBindings();
    },
  };
}
