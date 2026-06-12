// src/game/quest.js — gameState, wave state machine, startWave, checkWaveComplete, questComplete
import * as THREE from 'three';
import { ctx } from '../state.js';
import { clearAllFx, _fxTimers, _fxEffects, spawnGoldCelebration } from '../combat/projectiles.js';
import { spawnSpirits, spawnBoss, spawnDemonLord } from '../combat/spirits.js';
import { spawnRelicDrop } from './progression.js';
import { updateHUD, updateObjective, showToast } from '../ui/hud.js';
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
    showToast('Wave 1: Shadowlings approach! Use Space/I to attack.');
  } else if (n === 2) {
    spawnSpirits('ice', 4, 'frostimp');
    showToast('Wave 2: Frost Imps! Fire counters Ice! They lob icicles — dodge! ▲');
  } else if (n === 3) {
    spawnSpirits('water', 4, 'tidewraith');
    showToast('Wave 3: Tide Wraiths! Poison counters Water! Shield deflects bolts!');
  } else if (n === 4) {
    spawnBoss();
    showToast('WAVE 4 — MINI-BOSS: VENOM ONI! Ice counters Poison! ▲');
  } else if (n === 5) {
    spawnDemonLord();
    showToast('WAVE 5 — FINAL BOSS: INFERNO DEMON LORD! Only WATER punishes him! ▲');
  }

  updateObjective();
  updateHUD();
}

export function checkWaveComplete() {
  if (gameState.state === 'INTRO' || gameState.state === 'COMPLETE' ||
      gameState.state === 'MENU'  || gameState.state === 'GAMEOVER') return;
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
  // Unlock all forms
  gameState.p2.unlockForm('fire');
  gameState.p2.unlockForm('ice');
  gameState.p2.unlockForm('poison');
  gameState.p2.unlockForm('water');
  updateHUD();
}
