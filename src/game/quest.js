// src/game/quest.js — gameState, wave state machine, startWave, checkWaveComplete, questComplete
import * as THREE from 'three';
import { ctx } from '../state.js';
import { clearAllFx, _fxTimers, _fxEffects, spawnGoldCelebration } from '../combat/projectiles.js';
import { sfx } from '../audio/audio.js';
import { spawnSpirits, spawnBoss, spawnDemonLord } from '../combat/spirits.js';
import { spawnRelicDrop } from './progression.js';
import { updateHUD, updateObjective, showToast, showWaveBanner, updateBossBar } from '../ui/hud.js';
// clearLockTargets imported lazily below to avoid circular dep at module load time

export const gameState = {
  state: 'MENU',
  wave: 0,
  spirits: [],
  p1: null,
  p2: null,
  lives: 3,
  _introTimer: 6,
  _waveClearing: false,
  _clearTimer: 0,
  _completed: false,
  _waveClearGranted: false,
  _paused: false,
  // Pass 12: Endless mode
  _endless: false,
  endlessCycle: 0,
};

export function startIntro() {
  gameState.state = 'INTRO';
  gameState.wave = 0;
  const introEl = document.getElementById('intro-screen');
  if (introEl) introEl.style.display = 'flex';
}

export function endIntro() {
  document.getElementById('intro-screen').style.display = 'none';
  startWave(1);
}

export function startWave(n) {
  gameState.wave = n;
  gameState.state = 'WAVE' + n;
  gameState._waveClearing = false;
  gameState._waveClearGranted = false;

  // Cancel all outstanding FX timers and effects
  clearAllFx();

  // Clear existing spirits
  gameState.spirits.forEach(s => s.cleanup && s.cleanup());
  gameState.spirits = [];

  // Clear camera lock-on targets (lazy import avoids circular dep at startup)
  try {
    import('../game/camera.js').then(m => m.clearLockTargets()).catch(() => {});
  } catch (_) {}


  if (n === 1) {
    spawnSpirits('neutral', 3, 'shadowling');
    showWaveBanner('WAVE1');
    showToast('Wave 1: Shadowlings approach! Use Space/I to attack.');
  } else if (n === 2) {
    spawnSpirits('ice', 4, 'frostimp');
    showWaveBanner('WAVE2');
    showToast('Wave 2: Frost Imps! Fire counters Ice! They lob icicles — dodge! ▲');
  } else if (n === 3) {
    spawnSpirits('water', 4, 'tidewraith');
    showWaveBanner('WAVE3');
    showToast('Wave 3: Tide Wraiths! Poison counters Water! Shield deflects bolts!');
  } else if (n === 4) {
    spawnBoss();
    showWaveBanner('WAVE4');
    showToast('WAVE 4 — MINI-BOSS: VENOM ONI! Ice counters Poison! ▲');
  } else if (n === 5) {
    spawnDemonLord();
    showWaveBanner('WAVE5');
    showToast('WAVE 5 — FINAL BOSS: INFERNO DEMON LORD! Only WATER punishes him! ▲');
  }

  updateObjective();
  updateHUD();
}

export function checkWaveComplete() {
  if (gameState.state === 'INTRO' || gameState.state === 'COMPLETE' ||
      gameState.state === 'MENU'  || gameState.state === 'GAMEOVER') return;
  // In endless mode, any wave completion triggers the endless cycle handler
  if (gameState._endless) {
    const alive = gameState.spirits.filter(s => s.alive);
    if (alive.length > 0 || gameState._waveClearing) return;
    if (gameState.spirits.length === 0) return;
    gameState._waveClearing = true;
    _endlessWaveComplete();
    return;
  }

  const alive = gameState.spirits.filter(s => s.alive);
  if (alive.length > 0 || gameState._waveClearing) return;
  if (gameState.spirits.length === 0) return;
  gameState._waveClearing = true;

  const wave = gameState.wave;
  // XP retuned for 5 waves so the boss kill lands ~L5-6 (XP_TO_LEVEL: L5=520, L6=700).
  // Cumulative: 130,290,470,690 → ~L5 entering wave 5; final wave grants the rest.
  const waveXP = [0, 130, 160, 180, 220, 300];
  const xpAmt = waveXP[Math.min(wave, waveXP.length - 1)];

  gameState.p1.gainXP(xpAmt);
  gameState.p2.gainXP(xpAmt);

  const outerTid = setTimeout(() => {
    if (wave === 1) {
      gameState.p2.unlockForm('fire');
      showToast('Sister awakens — FIRE DRAGON unlocked! Press Num4 to transform!');
      _fxTimers.push(setTimeout(() => startWave(2), 3000));
    } else if (wave === 2) {
      gameState.p2.unlockForm('poison');
      spawnRelicDrop('Prayer Beads', new THREE.Vector3(0, 0, 0));
      showToast('POISON DRAGON unlocked! Prayer Beads relic dropped.');
      _fxTimers.push(setTimeout(() => startWave(3), 3000));
    } else if (wave === 3) {
      gameState.p2.unlockForm('ice');
      spawnRelicDrop('Dragon Pearl', new THREE.Vector3(2, 0, 0));
      showToast('ICE DRAGON unlocked! Dragon Pearl relic dropped.');
      _fxTimers.push(setTimeout(() => startWave(4), 3000));
    } else if (wave === 4) {
      gameState.p2.unlockForm('water');
      spawnRelicDrop('Saffron Robe', new THREE.Vector3(0, 0, -15));
      showToast('WATER DRAGON unlocked! The final trial awaits — the sea answers fire.');
      _fxTimers.push(setTimeout(() => startWave(5), 3500));
    } else if (wave === 5) {
      showToast('The Inferno Demon Lord has fallen. Victory!');
      questComplete();
    }
  }, 1500);
  _fxTimers.push(outerTid);
}

export function questComplete() {
  if (gameState._completed) return;
  gameState._completed = true;
  clearAllFx();
  gameState.state = 'COMPLETE';
  document.getElementById('complete-screen').style.display = 'block';
  spawnGoldCelebration();
  try { sfx.questComplete(); } catch {}
  // Unlock all forms
  gameState.p2.unlockForm('fire');
  gameState.p2.unlockForm('ice');
  gameState.p2.unlockForm('poison');
  gameState.p2.unlockForm('water');
  updateHUD();

  // Wire complete-screen buttons (safe to call multiple times — idempotent)
  _wireCompleteButtons();
}

function _wireCompleteButtons() {
  const btnEndless  = document.getElementById('btn-endless');
  const btnRestart  = document.getElementById('btn-restart');
  const btnMainMenu = document.getElementById('btn-mainmenu');
  if (btnEndless && !btnEndless._wired) {
    btnEndless._wired = true;
    btnEndless.addEventListener('click', () => startEndless());
  }
  if (btnRestart && !btnRestart._wired) {
    btnRestart._wired = true;
    btnRestart.addEventListener('click', () => restartQuest());
  }
  if (btnMainMenu && !btnMainMenu._wired) {
    btnMainMenu._wired = true;
    btnMainMenu.addEventListener('click', () => { location.reload(); });
  }
}

// ── Restart Quest (Wave 1 in same mode) ───────────────────────────────────
// Uses location.reload() for a clean reset — matches the existing QUIT TO MENU pattern.
// Mode/char selection persists across reload via sessionStorage.
export function restartQuest() {
  // Persist the current mode settings so after reload they are restored
  try {
    sessionStorage.setItem('mds_restart_mode',      ctx.mode      || '2p');
    sessionStorage.setItem('mds_restart_soloChar',  ctx.soloChar  || '');
    sessionStorage.setItem('mds_restart_aiPartner', ctx.aiPartner ? '1' : '0');
    sessionStorage.setItem('mds_restart_pending',   '1');
  } catch (_) {}
  location.reload();
}

// ── Endless Wave Mode ─────────────────────────────────────────────────────
// Spawns cycling waves with increasing HP/count until team runs out of lives.
export function startEndless() {
  const completeEl = document.getElementById('complete-screen');
  if (completeEl) completeEl.style.display = 'none';

  gameState._endless = true;
  gameState.endlessCycle = 0;
  gameState._completed = false;
  gameState._waveClearing = false;
  gameState._waveClearGranted = false;

  clearAllFx();
  _spawnEndlessWave();
}

function _spawnEndlessWave() {
  const cycle = gameState.endlessCycle;
  const scaleMult = 1 + 0.25 * cycle;
  const MAX_CONCURRENT = 8;

  // Cycle through wave slots 1-5
  const waveSlot = ((cycle % 5) + 1);
  gameState.wave = waveSlot;
  gameState.state = 'WAVE' + waveSlot;
  gameState._waveClearing = false;
  gameState._waveClearGranted = false;

  // Clear old spirits
  gameState.spirits.forEach(s => s.cleanup && s.cleanup());
  gameState.spirits = [];
  clearAllFx();
  try {
    import('../game/camera.js').then(m => m.clearLockTargets()).catch(() => {});
  } catch (_) {}

  // Mix demon types for variety (forces form-swapping — no single dragon dominates)
  const mixTypes = ['shadowling', 'frostimp', 'tidewraith'];
  const baseCount = Math.min(3 + cycle, MAX_CONCURRENT);

  // spawnSpirits creates a group; we call it with a type and scale results after
  // We use it for each type in the mix, distributing count
  const perType = Math.max(1, Math.floor(baseCount / mixTypes.length));
  mixTypes.forEach((type, ti) => {
    const n = (ti < baseCount % mixTypes.length) ? perType + 1 : perType;
    if (n <= 0) return;
    const elements = { shadowling: 'neutral', frostimp: 'ice', tidewraith: 'water' };
    spawnSpirits(elements[type], n, type);
  });

  // Scale HP/ATK on newly spawned spirits
  if (scaleMult > 1) {
    gameState.spirits.forEach(s => {
      s.maxHp = Math.round(s.maxHp * scaleMult);
      s.hp    = s.maxHp;
      s.atk   = Math.round(s.atk * scaleMult);
    });
  }

  showToast(`ENDLESS — Cycle ${cycle + 1}  (×${scaleMult.toFixed(2)} power)`);
  updateObjective();
  updateHUD();
}

// Called from checkWaveComplete when in endless mode instead of questComplete
function _endlessWaveComplete() {
  gameState.endlessCycle += 1;
  const xpAmt = 50 + gameState.endlessCycle * 20;
  if (gameState.p1) gameState.p1.gainXP(xpAmt);
  if (gameState.p2) gameState.p2.gainXP(xpAmt);
  const tid = setTimeout(() => { _spawnEndlessWave(); }, 2000);
  _fxTimers.push(tid);
}
