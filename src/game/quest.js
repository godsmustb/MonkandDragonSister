// src/game/quest.js — gameState, wave state machine, startWave, checkWaveComplete, questComplete
import * as THREE from 'three';
import { ctx } from '../state.js';
import { clearAllFx, _fxTimers, _fxEffects, spawnGoldCelebration } from '../combat/projectiles.js';
import { sfx } from '../audio/audio.js';
import { spawnSpirits, spawnBoss, spawnDemonLord } from '../combat/spirits.js';
import { spawnRelicDrop } from './progression.js';
import { updateHUD, updateObjective, showToast, showWaveBanner, updateBossBar } from '../ui/hud.js';
import {
  LAND_ELEMENTS, ELEMENT_TO_TYPE, pickWeightedElement,
  scaleHp, scaleAtk, dIndex, recordWavePerf, resetDDA, getDDA,
} from './campaign.js';
import { resetSuddenDeath, SD_FULL_RADIUS } from './suddendeath.js';
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
  // Score system
  score: 0,
  // Collapsing-arena sudden death (endless only).
  // Starts at SD_FULL_RADIUS (56) and shrinks each collapse step.
  // Non-endless waves always keep 56 so clampToArena is unaffected.
  arenaRadius: 56,
};

export function startIntro() {
  gameState.state = 'INTRO';
  gameState.wave = 0;
  gameState.score = 0;
  const introEl = document.getElementById('intro-screen');
  if (introEl) introEl.style.display = 'flex';
  // Dismiss on ANY tap/click. Listen for pointerup + touchend + click because a
  // synthesized `click` is unreliable on touch (esp. with touch-action:none).
  // Guard on state so it fires once. Keyboard path stays in main.js. A document-
  // level fallback covers the case where something swallows the element's event.
  if (introEl && !introEl._tapWired) {
    introEl._tapWired = true;
    const dismiss = (e) => {
      if (!gameState || gameState.state !== 'INTRO') return;
      if (e && e.cancelable) e.preventDefault();
      endIntro();
    };
    introEl.addEventListener('click', dismiss);
    introEl.addEventListener('pointerup', dismiss);
    introEl.addEventListener('touchend', dismiss, { passive: false });
    document.addEventListener('pointerup', dismiss);
    document.addEventListener('touchend', dismiss, { passive: false });
  }
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
  // Non-endless waves always use the full arena radius.
  // Endless uses startEndless() which sets arenaRadius via resetSuddenDeath.
  if (!gameState._endless) {
    gameState.arenaRadius = SD_FULL_RADIUS;
  }

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
      // Pass 16 — T2 SHIKAI awakening: unlocks the ULTIMATE for both heroes.
      // Staggered cinematic flashes so each named banner reads cleanly.
      if (gameState.p1 && gameState.p1.grantShikai) gameState.p1.grantShikai();
      _fxTimers.push(setTimeout(() => { if (gameState.p2 && gameState.p2.grantShikai) gameState.p2.grantShikai(); }, 2400));
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
  const btnCampaign = document.getElementById('btn-campaign');
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
  // Pass 15: campaign preview from complete screen
  if (btnCampaign && !btnCampaign._wired) {
    btnCampaign._wired = true;
    btnCampaign.addEventListener('click', () => {
      import('../ui/menu.js').then(m => m.showCampaignPreview(true)).catch(() => {});
    });
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

  // Reset sudden-death arena (also resets arenaRadius to SD_FULL_RADIUS)
  resetSuddenDeath();
  gameState.arenaRadius = SD_FULL_RADIUS;

  // Clear any lingering _falling flag on players
  [gameState.p1, gameState.p2].forEach(p => {
    if (p) { p._falling = false; p._fallVel = 0; p.pos.y = 0; }
  });

  // Pass 15: reset DDA to neutral on each fresh endless run
  resetDDA();
  // Track wave start time for DDA perf scoring
  gameState._waveStartTime = Date.now();

  clearAllFx();
  _spawnEndlessWave();
}

// Pass 15: framework-driven endless spawn using campaign scaling + DDA.
// Cycle 0 → Land 1 theme (neutral), cycle 1 → ice, cycle 2 → poison, cycle 3 → water,
// cycle 4 → back to neutral but MIX is now richer (more demons, 70/20/10 spread active).
function _spawnEndlessWave() {
  const cycle = gameState.endlessCycle;
  const MAX_CONCURRENT = 8;

  // Rotate theme through the 4 land elements: neutral/ice/poison/water
  const themeElement = LAND_ELEMENTS[cycle % LAND_ELEMENTS.length];

  // land index 1-4 derived from cycle (wraps after 4 rotations)
  const landIdx = (cycle % LAND_ELEMENTS.length) + 1;
  // level within land: increases 1-5 then resets (each full rotation = harder land)
  const rotation = Math.floor(cycle / LAND_ELEMENTS.length);
  const levelIdx = Math.min(5, 1 + rotation);
  const D = dIndex(landIdx, levelIdx);

  // Wave slot for state machine — cycles 1-5, wraps
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

  // Base count grows with cycle; DDA multiplier m applies only to count.
  const { m } = getDDA();
  const baseCount = Math.round(Math.min(3 + cycle, MAX_CONCURRENT) * m);
  const spawnCount = Math.max(2, Math.min(MAX_CONCURRENT, baseCount));

  // Each demon is individually element-picked (70/20/10 weighting).
  // First 4 cycles: use the pure theme element so players learn the counter system.
  // From cycle 4 onward: use weighted picker to force form-swapping.
  const usePicker = cycle >= 4;
  for (let i = 0; i < spawnCount; i++) {
    const el = usePicker ? pickWeightedElement(themeElement, Math.random) : themeElement;
    const type = ELEMENT_TO_TYPE[el] || 'shadowling';
    spawnSpirits(el, 1, type);
  }

  // Apply campaign scaling (HP from scaleHp, DDA m applies to HP; ATK from scaleAtk; no speed/ATK from DDA)
  gameState.spirits.forEach(s => {
    s.maxHp = Math.max(1, Math.round(scaleHp(s.maxHp, D) * m));
    s.hp    = s.maxHp;
    // ATK uses scaleAtk with D but NOT m (asymmetric assist — never punish with damage)
    s.atk   = Math.max(1, Math.round(scaleAtk(s.atk, D)));
    // Speed and def are NOT modified by DDA (only HP+density per design)
  });

  showToast(`ENDLESS — Cycle ${cycle + 1}  (Land ${landIdx} · D=${D} · DDA ${(m * 100).toFixed(0)}%)`);
  updateObjective();
  updateHUD();

  // Track wave start time for DDA perf scoring at wave end
  gameState._waveStartTime = Date.now();
}

// Called from checkWaveComplete when in endless mode instead of questComplete
function _endlessWaveComplete() {
  // Pass 15: record wave performance for DDA before incrementing cycle
  const clearTime = gameState._waveStartTime
    ? (Date.now() - gameState._waveStartTime) / 1000
    : 60;
  const p1 = gameState.p1, p2 = gameState.p2;
  // HP retained fraction: average of alive players (0..1)
  let hpRetained = 0, playerCount = 0;
  if (p1 && !p1.inactive) { hpRetained += (p1.hp / Math.max(1, p1.maxHp)); playerCount++; }
  if (p2 && !p2.inactive) { hpRetained += (p2.hp / Math.max(1, p2.maxHp)); playerCount++; }
  const hpRetainedFrac = playerCount > 0 ? hpRetained / playerCount : 0.5;

  recordWavePerf({
    hpRetainedFrac,
    clearTime,
    parTime: 60,          // 60s par per wave (reasonable for a small arena)
    deaths: 0,            // KO tracking is handled by lives.js; wave-level deaths N/A here
    livesBudget: 3,
  });

  gameState.endlessCycle += 1;
  const xpAmt = 50 + gameState.endlessCycle * 20;
  if (p1) p1.gainXP(xpAmt);
  if (p2) p2.gainXP(xpAmt);
  const tid = setTimeout(() => { _spawnEndlessWave(); }, 2000);
  _fxTimers.push(tid);
}
