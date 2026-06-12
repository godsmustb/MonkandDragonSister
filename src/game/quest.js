// src/game/quest.js — gameState, wave state machine, startWave, checkWaveComplete, questComplete
import * as THREE from 'three';
import { ctx } from '../state.js';
import { clearAllFx, _fxTimers, _fxEffects, spawnGoldCelebration } from '../combat/projectiles.js';
import { spawnSpirits, spawnBoss } from '../combat/spirits.js';
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
    spawnSpirits('neutral', 3);
    showToast('Wave 1: Shadows approach! Use Space/I to attack.');
  } else if (n === 2) {
    spawnSpirits('ice', 4);
    showToast('Wave 2: Ice Imps! Fire is effective against Ice! ▲');
  } else if (n === 3) {
    spawnSpirits('water', 4);
    showToast('Wave 3: Water Wraiths! Poison is effective! Use shield to deflect bolts!');
  } else if (n === 4) {
    spawnBoss();
    showToast('WAVE 4 — BOSS: POISON ONI! Ice is effective! ▲');
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
  const waveXP = [0, 120, 140, 160, 200];
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
      showToast('POISON DRAGON unlocked!');
      _fxTimers.push(setTimeout(() => startWave(3), 3000));
    } else if (wave === 3) {
      gameState.p2.unlockForm('ice');
      spawnRelicDrop('Dragon Pearl', new THREE.Vector3(2, 0, 0));
      showToast('ICE DRAGON unlocked!');
      _fxTimers.push(setTimeout(() => startWave(4), 3000));
    } else if (wave === 4) {
      gameState.p2.unlockForm('water');
      spawnRelicDrop('Saffron Robe', new THREE.Vector3(0, 0, -15));
      showToast('WATER DRAGON unlocked! Victory!');
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
