// src/game/quest.js — gameState, wave state machine, startWave, checkWaveComplete, questComplete
import * as THREE from 'three';
import { ctx } from '../state.js';
import { clearAllFx, _fxTimers, _fxEffects, spawnGoldCelebration } from '../combat/projectiles.js';
import { sfx, playVoice } from '../audio/audio.js';
import { spawnSpirits, spawnBoss, spawnDemonLord, spawnBossScaled, spawnDemonLordScaled,
  spawnBossScaledL3, spawnDemonLordScaledL3 } from '../combat/spirits.js';
import { spawnRelicDrop } from './progression.js';
import { updateHUD, updateObjective, showToast, showWaveBanner, updateBossBar } from '../ui/hud.js';
import {
  LAND_ELEMENTS, ELEMENT_TO_TYPE, pickWeightedElement,
  scaleHp, scaleAtk, dIndex, recordWavePerf, resetDDA, getDDA,
} from './campaign.js';
import { resetSuddenDeath, SD_FULL_RADIUS } from './suddendeath.js';
import { applyLevelTheme } from '../world/theme.js';
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
  // Campaign level (1 = Quest 1, 2 = Quest 2, etc.)
  level: 1,
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

// ── Start a specific campaign level ──────────────────────────────────────────
// Resets per-run state and kicks off wave 1 of that level.
// Players keep their forms/XP from a prior level run.
export function startLevel(n) {
  // Validate
  if (n !== 1 && n !== 2 && n !== 3) return;

  // Hide complete screen (may be showing from previous level)
  const completeEl = document.getElementById('complete-screen');
  if (completeEl) completeEl.style.display = 'none';

  gameState.level = n;
  gameState._completed = false;
  gameState._waveClearing = false;
  gameState._waveClearGranted = false;
  gameState._endless = false;
  gameState.arenaRadius = SD_FULL_RADIUS;

  // Re-palette the world for this level immediately so the intro banner already
  // reads as the new place (L2 ice / L3 poison; L1 restores the Zen garden).
  applyLevelTheme(n);

  // Clear any lingering effects/spirits
  clearAllFx();
  gameState.spirits.forEach(s => s.cleanup && s.cleanup());
  gameState.spirits = [];

  // Clear camera lock targets
  try {
    import('../game/camera.js').then(m => m.clearLockTargets()).catch(() => {});
  } catch (_) {}

  // Reset player positions
  [gameState.p1, gameState.p2].forEach((p, i) => {
    if (p) {
      p.pos.set(i === 0 ? -3 : 3, 0, 5);
      p._falling = false; p._fallVel = 0;
      const cm = p.currentMesh && p.currentMesh();
      if (cm) cm.position.copy(p.pos);
    }
  });

  if (n === 3) {
    // Level 3 starts with an ominous intro banner then wave 1
    showToast('QUEST III — THE VENOM ABYSS. Poison fills the wastes — only ice endures!', 3400);
    import('../ui/hud.js').then(m => {
      m.showBanner('QUEST III', 'THE VENOM ABYSS — Poison Wastes Await', '#aa44ff');
    }).catch(() => {});
    _fxTimers.push(setTimeout(() => startWave(1), 2000));
  } else if (n === 2) {
    // Level 2 starts with intro-like banner then wave 1
    showToast('QUEST II — THE GLACIAL PEAKS. Face the frost warlords!', 3200);
    import('../ui/hud.js').then(m => {
      m.showBanner('QUEST II', 'THE GLACIAL PEAKS — Frost Warlords Await', '#88ddff');
    }).catch(() => {});
    _fxTimers.push(setTimeout(() => startWave(1), 2000));
  } else {
    startWave(1);
  }

  updateObjective();
  updateHUD();
}

// localStorage flag so the onboarding (cinematic + tutorial) only auto-plays once.
function _onboardSeen() { try { return localStorage.getItem('mds_onboard_seen') === '1'; } catch { return false; } }
function _markOnboardSeen() { try { localStorage.setItem('mds_onboard_seen', '1'); } catch (_) {} }

// The actual "intro is over, begin the level" logic — shared by the tap-dismiss path
// and the onboarding-complete path.
// Advance to the next campaign level with an animated travel transition (the
// hero "runs" from the old world into the new as the backdrop morphs), then start it.
function _advanceToLevel(target) {
  const from = gameState.level || 1;
  import('../ui/onboarding.js')
    .then(m => m.runLevelTransition(from, target, () => startLevel(target)))
    .catch(() => startLevel(target));
}

function _beginAfterIntro() {
  const sl = ctx.startLevel || 1;
  if (sl === 2 || sl === 3) {
    if (gameState.p2) ['fire', 'ice', 'poison', 'water'].forEach(f => gameState.p2.unlockForm && gameState.p2.unlockForm(f));
    startLevel(sl);
    return;
  }
  startWave(1);
}

export function startIntro() {
  gameState.state = 'INTRO';
  gameState.wave = 0;
  gameState.score = 0;
  // Fresh Level-1 play from the menu → cinematic intro + 3-slide tutorial, then waves.
  // Gated by ctx.showOnboarding (set by the menu BEGIN/PLAY buttons, NOT by the
  // programmatic __game.startGame() the E2E uses) so the test flow is unaffected.
  const lvl = ctx.startLevel || 1;
  if (ctx.showOnboarding && lvl === 1 && !_onboardSeen()) {
    ctx.showOnboarding = false;
    ctx.onboardingActive = true;   // freeze the gameplay sim + block stray key→endIntro
    const introElH = document.getElementById('intro-screen');
    if (introElH) introElH.style.display = 'none';
    try { playVoice('intro'); } catch (_) {}
    const finishOnboarding = () => { ctx.onboardingActive = false; _markOnboardSeen(); _beginAfterIntro(); };
    import('../ui/onboarding.js').then(m => {
      m.runIntroCinematic(() => m.runTutorial(finishOnboarding));
    }).catch(() => finishOnboarding());
    return;
  }
  const introEl = document.getElementById('intro-screen');
  if (introEl) introEl.style.display = 'flex';
  // Narrated opening (Kokoro VO; manifest-gated, no-op if absent).
  try { playVoice('intro'); } catch (_) {}
  // Dismiss on ANY tap/click. Listen for pointerup + touchend + click because a
  // synthesized `click` is unreliable on touch (esp. with touch-action:none).
  // Guard on state so it fires once. Keyboard path stays in main.js. A document-
  // level fallback covers the case where something swallows the element's event.
  if (introEl && !introEl._tapWired) {
    introEl._tapWired = true;
    const dismiss = (e) => {
      if (!gameState || gameState.state !== 'INTRO') return;
      if (ctx.onboardingActive) return;   // taps belong to the onboarding overlay, not endIntro
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
  _beginAfterIntro();
}

export function startWave(n) {
  gameState.wave = n;
  gameState.state = 'WAVE' + n;
  gameState._waveClearing = false;
  gameState._waveClearGranted = false;
  // Ensure the world theme matches the active level. Idempotent + cheap; also
  // covers the fresh-game path (endIntro → startWave(1) with level===1) so a new
  // quest is guaranteed to be the default Zen garden.
  applyLevelTheme(gameState.level);
  // Analytics: wave_reached (fail-silent dynamic import — python server has no PHP)
  import('./analytics.js').then(m => m.track('wave_reached', {
    stage: gameState.level, wave: n,
  })).catch(() => {});
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


  if (gameState.level === 3) {
    // ── LEVEL 3: The Venom Abyss — poison-dominant, Ice dragon is the key ──
    // dIndex(land=3, wave=n) → D values: W1=11, W2=12, W3=13, W4=14, W5=15
    const D3 = dIndex(3, n);
    if (n === 1) {
      // W1: 6 poison-flavoured demons (shadowlings + tide wraiths as poison stand-ins)
      spawnSpirits('poison', 4, 'shadowling');
      spawnSpirits('water',  2, 'tidewraith');
      _applyL3Scaling(D3);
      showWaveBanner('L3WAVE1');
      showToast('Venom Abyss — Wave 1: Poison scouts surge! ICE dragon counters poison!');
    } else if (n === 2) {
      // W2: 7 mixed — poison-heavy + water pressure
      spawnSpirits('poison', 4, 'shadowling');
      spawnSpirits('water',  3, 'tidewraith');
      _applyL3Scaling(D3);
      showWaveBanner('L3WAVE2');
      showToast('Wave 2: Poison horde + Tide Wraiths — keep ICE for poison, POISON for water!');
    } else if (n === 3) {
      // W3: 7 tide wraiths + poison mix — elemental pressure ramps up
      spawnSpirits('water',  4, 'tidewraith');
      spawnSpirits('poison', 3, 'shadowling');
      _applyL3Scaling(D3);
      showWaveBanner('L3WAVE3');
      showToast('Wave 3: Tide Wraiths + Poison swarm! Swap forms — Poison vs Water, Ice vs Poison!');
    } else if (n === 4) {
      // W4: Plague Oni (L3 scaled Venom Oni) + 4 poison/water adds
      spawnBossScaledL3(D3);
      spawnSpirits('poison', 2, 'shadowling');
      spawnSpirits('water',  2, 'tidewraith');
      _applyL3ScalingAdds(D3);
      showWaveBanner('L3WAVE4');
      showToast('WAVE 4 — PLAGUE ONI! ICE counters Poison! Watch the adds + ground pools! ▲');
    } else if (n === 5) {
      // W5: Abyssal Demon Lord — starts POISON, P3 shifts to WATER
      spawnDemonLordScaledL3(D3);
      showWaveBanner('L3WAVE5');
      showToast('WAVE 5 — ABYSSAL DEMON LORD! ICE DRAGON on poison — shifts to WATER at 25%! ▲');
    }
  } else if (gameState.level === 2) {
    // ── LEVEL 2: The Glacial Peaks — ice-dominant, Fire dragon is the key ──
    // dIndex(land=2, wave=n) → D values: W1=6, W2=7, W3=8, W4=9, W5=10
    const D2 = dIndex(2, n);
    if (n === 1) {
      // W1: 5 Frost Imps — pure ice opening
      spawnSpirits('ice', 5, 'frostimp');
      _applyL2Scaling(D2);
      showWaveBanner('L2WAVE1');
      showToast('Glacial Peaks — Wave 1: Frost Imps surge! Fire dragon counters ice!');
    } else if (n === 2) {
      // W2: 4 Frost Imps + 3 Shadowlings — mixed pressure
      spawnSpirits('ice', 4, 'frostimp');
      spawnSpirits('neutral', 3, 'shadowling');
      _applyL2Scaling(D2);
      showWaveBanner('L2WAVE2');
      showToast('Wave 2: Frost Imps and shadow scouts — keep Fire form ready!');
    } else if (n === 3) {
      // W3: 3 Tide Wraiths + 3 Frost Imps — elemental mix, Poison good vs water
      spawnSpirits('water', 3, 'tidewraith');
      spawnSpirits('ice', 3, 'frostimp');
      _applyL2Scaling(D2);
      showWaveBanner('L2WAVE3');
      showToast('Wave 3: Tide Wraiths join the frost! Swap forms — Poison vs Water, Fire vs Ice!');
    } else if (n === 4) {
      // W4: Scaled Venom Oni + 3 Frost Imp adds — tougher mini-boss
      spawnBossScaled(D2);
      spawnSpirits('ice', 3, 'frostimp');
      _applyL2ScalingAdds(D2);
      showWaveBanner('L2WAVE4');
      showToast('WAVE 4 — FROST WARLORD (Scaled Venom Oni)! Ice counters Poison! Watch the adds! ▲');
    } else if (n === 5) {
      // W5: Scaled Inferno Demon Lord — starts ICE element, Fire dragon punishes it
      spawnDemonLordScaled(D2);
      showWaveBanner('L2WAVE5');
      showToast('WAVE 5 — GLACIAL INFERNO LORD! Fire dragon DESTROYS his ice heart! ▲');
    }
  } else {
    // ── LEVEL 1 (unchanged) ──
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
  }

  updateObjective();
  updateHUD();
}

// Apply Level-2 campaign scaling to ALL spirits just spawned (including boss).
function _applyL2Scaling(D) {
  gameState.spirits.forEach(s => {
    s.maxHp = Math.max(1, Math.round(scaleHp(s.maxHp, D)));
    s.hp    = s.maxHp;
    s.atk   = Math.max(1, Math.round(scaleAtk(s.atk, D)));
  });
}

// Apply Level-2 campaign scaling to NON-BOSS spirits only (adds spawned alongside a boss).
function _applyL2ScalingAdds(D) {
  gameState.spirits.forEach(s => {
    if (s._isBoss) return; // boss is pre-scaled in spawnBossScaled / spawnDemonLordScaled
    s.maxHp = Math.max(1, Math.round(scaleHp(s.maxHp, D)));
    s.hp    = s.maxHp;
    s.atk   = Math.max(1, Math.round(scaleAtk(s.atk, D)));
  });
}

// Apply Level-3 campaign scaling to ALL spirits just spawned (including boss).
function _applyL3Scaling(D) {
  gameState.spirits.forEach(s => {
    s.maxHp = Math.max(1, Math.round(scaleHp(s.maxHp, D)));
    s.hp    = s.maxHp;
    s.atk   = Math.max(1, Math.round(scaleAtk(s.atk, D)));
  });
}

// Apply Level-3 campaign scaling to NON-BOSS spirits only (adds spawned alongside a boss).
function _applyL3ScalingAdds(D) {
  gameState.spirits.forEach(s => {
    if (s._isBoss) return; // boss is pre-scaled in spawnBossScaledL3 / spawnDemonLordScaledL3
    s.maxHp = Math.max(1, Math.round(scaleHp(s.maxHp, D)));
    s.hp    = s.maxHp;
    s.atk   = Math.max(1, Math.round(scaleAtk(s.atk, D)));
  });
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
  // Level 2 grants slightly more XP to push players to L7-8 by the end.
  const waveXP   = [0, 130, 160, 180, 220, 300];
  const waveXPL2 = [0, 160, 190, 210, 260, 380]; // Level 2 — harder waves, bigger payouts
  const waveXPL3 = [0, 200, 230, 260, 320, 460]; // Level 3 — hardest waves, biggest payouts → push to L9-10
  const xpTable  = gameState.level === 3 ? waveXPL3 : (gameState.level === 2 ? waveXPL2 : waveXP);
  const xpAmt    = xpTable[Math.min(wave, xpTable.length - 1)];

  gameState.p1.gainXP(xpAmt);
  gameState.p2.gainXP(xpAmt);

  const outerTid = setTimeout(() => {
    if (gameState.level === 3) {
      // ── Level 3 wave transitions ──
      // Players have all four dragon forms. Drop relics as harder-earned rewards.
      if (wave === 1) {
        showToast('Wave 1 cleared! The abyss deepens…');
        import('../ui/hud.js').then(m => m.showBanner('WAVE I CLEAR', 'The poison wastes spread…', '#aa44ff')).catch(() => {});
        _fxTimers.push(setTimeout(() => startWave(2), 3000));
      } else if (wave === 2) {
        spawnRelicDrop('Prayer Beads', new THREE.Vector3(0, 0, 0));
        showToast('Wave 2 cleared! Prayer Beads found in the wastes. The rot thickens…');
        _fxTimers.push(setTimeout(() => startWave(3), 3000));
      } else if (wave === 3) {
        spawnRelicDrop('Dragon Pearl', new THREE.Vector3(2, 0, 0));
        showToast('Wave 3 cleared! Dragon Pearl recovered. The Plague Oni stirs…');
        _fxTimers.push(setTimeout(() => startWave(4), 3500));
      } else if (wave === 4) {
        spawnRelicDrop('Saffron Robe', new THREE.Vector3(0, 0, -15));
        showToast('Plague Oni slain! Saffron Robe recovered. The Abyssal Demon Lord descends!');
        _fxTimers.push(setTimeout(() => startWave(5), 3500));
      } else if (wave === 5) {
        showToast('The Abyssal Demon Lord has fallen. The Venom Abyss is cleansed!');
        questCompleteL3();
      }
    } else if (gameState.level === 2) {
      // ── Level 2 wave transitions ──
      // Players already have all four dragon forms from Level 1.
      // Drop better relics as rewards for harder waves.
      if (wave === 1) {
        showToast('Wave 1 cleared! The frost thickens…');
        import('../ui/hud.js').then(m => m.showBanner('WAVE I CLEAR', 'The peaks grow colder…', '#88ddff')).catch(() => {});
        _fxTimers.push(setTimeout(() => startWave(2), 3000));
      } else if (wave === 2) {
        spawnRelicDrop('Prayer Beads', new THREE.Vector3(0, 0, 0));
        showToast('Wave 2 cleared! Frost Relic dropped — the peaks hunger for more.');
        _fxTimers.push(setTimeout(() => startWave(3), 3000));
      } else if (wave === 3) {
        spawnRelicDrop('Dragon Pearl', new THREE.Vector3(2, 0, 0));
        showToast('Wave 3 cleared! Dragon Pearl found in the ice. The Warlord awakens…');
        _fxTimers.push(setTimeout(() => startWave(4), 3500));
      } else if (wave === 4) {
        spawnRelicDrop('Saffron Robe', new THREE.Vector3(0, 0, -15));
        showToast('Frost Warlord defeated! Saffron Robe recovered. The Glacial Inferno Lord descends!');
        _fxTimers.push(setTimeout(() => startWave(5), 3500));
      } else if (wave === 5) {
        showToast('The Glacial Inferno Lord has fallen. The Glacial Peaks are freed!');
        questCompleteL2();
      }
    } else {
      // ── Level 1 wave transitions (UNCHANGED) ──
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
    }
  }, 1500);
  _fxTimers.push(outerTid);
}

export function questComplete() {
  if (gameState._completed) return;
  gameState._completed = true;
  clearAllFx();
  gameState.state = 'COMPLETE';
  try { playVoice('victory'); } catch (_) {}
  gameState.level = 1; // ensure level is recorded as 1 when showing complete screen
  document.getElementById('complete-screen').style.display = 'block';
  spawnGoldCelebration();
  try { sfx.questComplete(); } catch {}
  // Unlock all forms
  gameState.p2.unlockForm('fire');
  gameState.p2.unlockForm('ice');
  gameState.p2.unlockForm('poison');
  gameState.p2.unlockForm('water');
  updateHUD();

  // Show the Level 1 complete screen (show Next Level button, hide L2 complete elements)
  const btnNext = document.getElementById('btn-next-level');
  if (btnNext) btnNext.style.display = '';   // show "NEXT LEVEL ▶"
  const l2CompleteSection = document.getElementById('complete-l2-section');
  if (l2CompleteSection) l2CompleteSection.style.display = 'none';
  const l1Section = document.getElementById('complete-l1-section');
  if (l1Section) l1Section.style.display = '';

  // Wire complete-screen buttons (safe to call multiple times — idempotent)
  _wireCompleteButtons();

  // Analytics: level_complete (fail-silent)
  import('./analytics.js').then(m => m.track('level_complete', {
    stage: 1, score: gameState.score,
  })).catch(() => {});
  // Submit score to leaderboard (stage 1) — fully async, silent on failure
  _submitQuestScore(1, 'QUEST I COMPLETE — Stage 1');
}

// ── Level 2 complete ──────────────────────────────────────────────────────────
export function questCompleteL2() {
  if (gameState._completed) return;
  gameState._completed = true;
  clearAllFx();
  gameState.state = 'COMPLETE';
  gameState.level = 2;
  document.getElementById('complete-screen').style.display = 'block';
  spawnGoldCelebration();
  try { sfx.questComplete(); } catch {}
  // Ensure all forms stay unlocked
  gameState.p2.unlockForm('fire');
  gameState.p2.unlockForm('ice');
  gameState.p2.unlockForm('poison');
  gameState.p2.unlockForm('water');
  updateHUD();

  // Show the Level 2 complete screen — NEXT LEVEL button now visible (Level 3 exists)
  const btnNext = document.getElementById('btn-next-level');
  if (btnNext) btnNext.style.display = '';  // show → takes player to Level 3
  const l2CompleteSection = document.getElementById('complete-l2-section');
  if (l2CompleteSection) l2CompleteSection.style.display = '';
  const l1Section = document.getElementById('complete-l1-section');
  if (l1Section) l1Section.style.display = 'none';
  const l3Section = document.getElementById('complete-l3-section');
  if (l3Section) l3Section.style.display = 'none';

  // Wire complete-screen buttons
  _wireCompleteButtons();

  // Analytics: level_complete (fail-silent)
  import('./analytics.js').then(m => m.track('level_complete', {
    stage: 2, score: gameState.score,
  })).catch(() => {});
  // Submit score to leaderboard (stage 2) — fully async, silent on failure
  _submitQuestScore(2, 'QUEST II COMPLETE — Stage 2');
}

// ── Level 3 complete ──────────────────────────────────────────────────────────
export function questCompleteL3() {
  if (gameState._completed) return;
  gameState._completed = true;
  clearAllFx();
  gameState.state = 'COMPLETE';
  gameState.level = 3;
  document.getElementById('complete-screen').style.display = 'block';
  spawnGoldCelebration();
  try { sfx.questComplete(); } catch {}
  // Ensure all forms stay unlocked
  gameState.p2.unlockForm('fire');
  gameState.p2.unlockForm('ice');
  gameState.p2.unlockForm('poison');
  gameState.p2.unlockForm('water');
  updateHUD();

  // Show Level 3 complete screen — no further campaign level yet → hide NEXT LEVEL
  const btnNext = document.getElementById('btn-next-level');
  if (btnNext) btnNext.style.display = 'none';
  const l1Section = document.getElementById('complete-l1-section');
  if (l1Section) l1Section.style.display = 'none';
  const l2Section = document.getElementById('complete-l2-section');
  if (l2Section) l2Section.style.display = 'none';
  const l3Section = document.getElementById('complete-l3-section');
  if (l3Section) l3Section.style.display = '';

  // Wire complete-screen buttons
  _wireCompleteButtons();

  // Analytics: level_complete (fail-silent)
  import('./analytics.js').then(m => m.track('level_complete', {
    stage: 3, score: gameState.score,
  })).catch(() => {});
  // Submit score to leaderboard (stage 3) — fully async, silent on failure
  _submitQuestScore(3, 'QUEST III COMPLETE — Stage 3');
}

// ── Score submission helper ────────────────────────────────────────────────────
// Called after each quest completes. Fully async and silent on any failure
// (leaderboard module may not load on python server — that's fine).
function _submitQuestScore(stage, title) {
  const score = (gameState && gameState.score) || 0;
  // Stages 1 & 2 have a next campaign level (→2, →3); stage 3 is the last.
  const onNext = (stage === 1 || stage === 2) ? () => _advanceToLevel(stage + 1) : null;
  import('./leaderboard.js').then(async lb => {
    // Prompt name if not yet stored; always silent
    await lb.promptPlayerName().catch(() => {});
    const entries = await lb.submitScore(stage, score).catch(() => null);
    if (entries && entries.length > 0) {
      // Show the stage leaderboard overlay (on top of complete screen). Because it
      // covers the complete screen's NEXT LEVEL button, pass onNext so the overlay
      // itself can advance the campaign.
      lb.showStageLeaderboard(stage, score, entries, title, null, onNext);
    }
  }).catch(() => {});
}

function _wireCompleteButtons() {
  const btnEndless   = document.getElementById('btn-endless');
  const btnRestart   = document.getElementById('btn-restart');
  const btnMainMenu  = document.getElementById('btn-mainmenu');
  const btnCampaign  = document.getElementById('btn-campaign');
  const btnNextLevel = document.getElementById('btn-next-level');
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
  // Next Level button — goes to (currentLevel + 1). Wired fresh each complete screen
  // because the target level can change (L1→L2, L2→L3).
  if (btnNextLevel) {
    // Remove old wiring so we can re-wire for the correct target level each time.
    if (btnNextLevel._wired) {
      btnNextLevel.removeEventListener('click', btnNextLevel._nextLevelHandler);
    }
    const targetLevel = (gameState.level || 1) + 1;
    btnNextLevel._nextLevelHandler = () => _advanceToLevel(targetLevel);
    btnNextLevel.addEventListener('click', btnNextLevel._nextLevelHandler);
    btnNextLevel._wired = true;
  }
}

// ── Restart Quest (Wave 1 in same mode) ───────────────────────────────────
// Uses location.reload() for a clean reset — matches the existing QUIT TO MENU pattern.
// Mode/char selection persists across reload via sessionStorage.
// Note: always restarts Level 1 (the initial quest).
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
