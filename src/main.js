// src/main.js — boot, renderer/scene/cameras, animate() loop, resize handler
import * as THREE from 'three';
import { ctx } from './state.js';
import { ARENA_SIZE, PREVENT_KEYS } from './config.js';
import { initAudioOnGesture, toggleMute, sfx } from './audio/audio.js';
import { buildWorld, resetPetal } from './world/garden.js';
import { buildLighting } from './world/sky.js';
import { Player, dealDamageToPlayer } from './combat/abilities.js';
import {
  _fxTimers, _particles,
  updateProjectiles, updateParticles, updateFxEffects,
} from './combat/projectiles.js';
import {
  setDealDamageToPlayer, setShowDamageNumber,
} from './combat/spirits.js';
import { gameState, startIntro, endIntro, checkWaveComplete } from './game/quest.js';
import { updateRelicDrops } from './game/progression.js';
import { updateHUD, updateObjective, showDamageNumber, setFxTimersRef, updateBossBar } from './ui/hud.js';
import { setupDebugAPI } from './debug.js';
import { buildMenu, startGame, togglePause, isPaused, isMenuVisible } from './ui/menu.js';
import { initLives, consumeLife, _updateLivesHUD } from './game/lives.js';
import { updateCamera as updateCameraV2, toggleLockOn, clearLockTargets, camExtra } from './game/camera.js';
import { buildPostFX, renderPostFX, resizePostFX, postFxEnabled, disposePostFX } from './fx/postfx.js';
import { setQuality } from './state.js';
import { loadBindings, matchAction } from './game/bindings.js';
import { updatePowerLabels } from './ui/powerlabel.js';
import { updateSuddenDeath } from './game/suddendeath.js';
import { IS_TOUCH, initTouchControls, updateTouchOverlay } from './ui/touch.js';
import { updateJuice } from './game/juice.js';
import { spawnMovementDust } from './combat/projectiles.js';

// ---- Wire up lazy cross-module references ----
setDealDamageToPlayer(dealDamageToPlayer);
setShowDamageNumber(showDamageNumber);
setFxTimersRef(_fxTimers);

// ---- Renderer ----
const canvas = document.getElementById('gameCanvas');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
} catch (e) {
  document.getElementById('webgl-error').style.display = 'block';
  throw e;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); // cap 1.5 (Pass 4)
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setScissorTest(true);
// ACES Filmic tone mapping on BOTH quality paths (consistent colour/exposure).
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.outputColorSpace = THREE.SRGBColorSpace;
ctx.renderer = renderer;

// ---- Scene ----
const scene = new THREE.Scene();
// Initial fog/background; buildSky() (Pass 4) replaces these with tuned haze.
scene.fog = new THREE.Fog(0xe9d3b4, 90, 320);
scene.background = new THREE.Color(0xa9d0e2);
ctx.scene = scene;

// ---- Cameras ----
const cameras = {
  p1: new THREE.PerspectiveCamera(65, 0.5, 0.1, 500),
  p2: new THREE.PerspectiveCamera(65, 0.5, 0.1, 500),
};
const camState = {
  p1: { pos: new THREE.Vector3(0, 5, 10), look: new THREE.Vector3(), shake: 0 },
  p2: { pos: new THREE.Vector3(0, 5, 10), look: new THREE.Vector3(), shake: 0 },
};
ctx.cameras  = cameras;
ctx.camState = camState;

// ---- Lighting ----
const { sun } = buildLighting();
let sunAngle = 0;

// ---- Keys ----
const keys = {};
ctx.keys = keys;

// ---- gameState → ctx ----
ctx.gameState = gameState;

// ---- Game loop object ----
const game = { clock: new THREE.Clock(), _lastDt: 0.016 };
ctx.game = game;

// ---- JUICE: global simulation time-scale (1 = normal). Driven by the juice
// manager (src/game/juice.js) on REAL dt; multiplies the SIM substep dt only —
// rendering + cosmetic world anims keep running at wall-clock speed. ----
ctx.timeScale = 1;

// Movement-dust emit throttle accumulators (per player; real-time spacing).
const _dustAcc = { p1: {}, p2: {} };

// ---- Resize ----
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  if (ctx.mode === '1p') {
    // Full-screen single camera for 1P
    const activeCam = _getActiveCam();
    activeCam.aspect = w / h;
    activeCam.updateProjectionMatrix();
    // Keep the unused camera aspect consistent to avoid stale matrix
    const otherCam = activeCam === cameras.p1 ? cameras.p2 : cameras.p1;
    otherCam.aspect = w / h;
    otherCam.updateProjectionMatrix();
  } else {
    cameras.p1.aspect = (w / 2) / h;
    cameras.p1.updateProjectionMatrix();
    cameras.p2.aspect = (w / 2) / h;
    cameras.p2.updateProjectionMatrix();
  }
  resizePostFX();
}
window.addEventListener('resize', resize);

// ---- JUICE: movement-dust emitter (real-time throttled, pooled particles) ----
// Emits a small ground puff under a player while it's moving along the ground.
// Detects movement from the player's own per-frame XZ delta (cached on _dustAcc).
function _emitMovementDust(who, p, frameDt) {
  if (!p || p.inactive || p.isKO || p._airborne) return;
  // In 1P mode only the active hero leaves dust.
  if (ctx.mode === '1p') {
    const activeIsMonk = ctx.soloChar !== 'sister';
    if ((who === 'p1') !== activeIsMonk) return;
  }
  const acc = _dustAcc[who];
  const lastX = acc.x, lastZ = acc.z;
  acc.x = p.pos.x; acc.z = p.pos.z;
  if (lastX === undefined) return; // first frame: just seed position
  const moved = Math.hypot(p.pos.x - lastX, p.pos.z - lastZ);
  // Speed gate (~ running). frameDt-normalised so it's framerate-independent.
  const speed = frameDt > 0 ? moved / frameDt : 0;
  acc.t = (acc.t || 0) + frameDt;
  if (speed > 1.5 && acc.t >= 0.09) {
    acc.t = 0;
    try { spawnMovementDust(p.pos); } catch {}
  }
}

// ---- Helper: get the active camera for 1P mode ----
function _getActiveCam() {
  // In 2P mode this is unused; in 1P: monk → cameras.p1, sister → cameras.p2
  if (ctx.mode === '1p' && ctx.soloChar === 'sister') return cameras.p2;
  return cameras.p1;
}

// ---- Simulation step ----
function updateGame(dt) {
  if (ctx.gameState._paused) return;
  if (ctx.gameState.state === 'MENU' || ctx.gameState.state === 'GAMEOVER') return;

  const allPlayers = [gameState.p1, gameState.p2];
  allPlayers.forEach(p => p && p.update(dt, keys, allPlayers));

  // KO / lives handling — timer expiry path
  // Partner-revive (within 10s) is handled inside Player.update in abilities.js.
  // Here we handle the "timer expired with no revive" case.
  //
  // FIX 4: Each player's KO timer is handled independently so both get their
  // full 10-second revive window regardless of what the other player is doing.
  // The old special both-KO instant branch is removed — each timer fires separately.
  allPlayers.forEach(p => {
    if (!p || !p.isKO) return;
    if (p.inactive) return;  // Pass 12: inactive partner never KOs
    if (p._koTimer <= 0) {
      // Solo KO timer expired → consume life, respawn via lives.js
      consumeLife(p);
    }
  });

  if (gameState.state !== 'INTRO') {
    gameState.spirits.forEach(s => { if (s.alive) s.update(dt, allPlayers); });
    checkWaveComplete();
  }

  updateProjectiles(dt);
  updateParticles(dt);
  updateRelicDrops(dt);
  updateFxEffects(dt);

  // Collapsing-arena sudden death (endless mode only; no-op in regular play)
  updateSuddenDeath(dt);

  // Update world-space XP/Level power labels under each character
  updatePowerLabels([gameState.p1, gameState.p2]);
}

// ---- Shared action dispatch (also called by touch layer) ----
export function dispatchPlayerAction(playerId, action) {
  const p1 = gameState.p1, p2 = gameState.p2;
  if (!p1 || !p2) return;

  const p1Active = ctx.mode !== '1p' || ctx.soloChar === 'monk';
  const p2Active = ctx.mode !== '1p' || ctx.soloChar === 'sister';

  if (playerId === 1) {
    if (!p1Active) return;
    if (action === 'lockon') { toggleLockOn('p1'); return; }
    if (p1.isKO) return;
    if (action === 'attack')  p1.attack();
    else if (action === 'heavy')   p1.heavyAttack();
    else if (action === 'shield')  p1.chiShield();
    else if (action === 'dodge')   p1.dodge();
    else if (action === 'heal')    p1.healingPulse();
    else if (action === 'jump')    p1.jump();
    else if (action === 'ultimate') p1.ultimate();
  } else if (playerId === 2) {
    if (!p2Active) return;
    if (action === 'lockon') { toggleLockOn('p2'); return; }
    if (p2.isKO) return;
    if (action === 'attack')    p2.attack();
    else if (action === 'heavy')     p2.heavyAttack();
    else if (action === 'transform') p2.cycleForm();
    else if (action === 'dodge')     p2.dodge();
    else if (action === 'special')   p2.special();
    else if (action === 'jump')      p2.jump();
    else if (action === 'ultimate')  p2.ultimate();
  }
}

// ---- Input ----
// Extra keys for camera V2 + pause (supplement PREVENT_KEYS from config.js)
const EXTRA_PREVENT = new Set(['KeyQ','KeyE','KeyF','Numpad7','Numpad9','Numpad0','Escape']);

window.addEventListener('keydown', (e) => {
  // Prevent default for all static keys plus any currently bound key
  if (PREVENT_KEYS.has(e.code) || EXTRA_PREVENT.has(e.code)) e.preventDefault();
  // Also prevent default for any remapped key so the page doesn't scroll/navigate
  if (ctx.bindings) {
    const a1 = matchAction('p1', e.code);
    const a2 = matchAction('p2', e.code);
    if (a1 || a2) e.preventDefault();
  }
  keys[e.code] = true;

  // Every keydown is a user gesture — init audio lazily (no-op if already created)
  try { initAudioOnGesture(); } catch {}

  // M key = mute toggle (works in any state during gameplay)
  if (e.code === 'KeyM') {
    try { toggleMute(); } catch {}
  }

  // Menu state — let menu.js handle navigation via its own listener
  if (gameState.state === 'MENU') return;

  // Pause toggle (Escape key during game) — not remappable
  if (e.code === 'Escape') {
    togglePause();
    return;
  }

  if (isPaused()) return;

  if (gameState.state === 'INTRO') { endIntro(); return; }

  const p1 = gameState.p1, p2 = gameState.p2;
  if (!p1 || !p2) return;

  // Pass 12: in 1P mode, only send key actions to the active hero; skip inactive/AI partner
  const p1Active = ctx.mode !== '1p' || ctx.soloChar === 'monk';
  const p2Active = ctx.mode !== '1p' || ctx.soloChar === 'sister';

  // Binding-driven dispatch using matchAction()
  const act1 = p1Active ? matchAction('p1', e.code) : null;
  const act2 = p2Active ? matchAction('p2', e.code) : null;

  // KO gate: skip action calls for a downed player (movement is already gated in update())
  if (act1) dispatchPlayerAction(1, act1);
  if (act2) dispatchPlayerAction(2, act2);
});

window.addEventListener('keyup', (e) => { keys[e.code] = false; });

// ---- Quality toggle (called by menu) ----
// Rebuilds or tears down the composer to match ctx.quality at runtime.
function applyQuality(q) {
  setQuality(q);
  disposePostFX();
  if (ctx.quality === 'high') buildPostFX(); // auto-falls back to low on failure
}
window.__applyQuality = applyQuality; // simple hook for menu + debug

// ---- Render ----
// 2P HIGH quality → two half-screen composers (bloom + ACES + SMAA).
// 2P LOW quality  → direct split-screen scissor render.
// 1P              → single full-screen render of the active hero's camera.
function renderFrame() {
  if (postFxEnabled() && renderPostFX()) return;

  const w = window.innerWidth, h = window.innerHeight;
  renderer.setScissorTest(true);

  if (ctx.mode === '1p') {
    // Single full-screen view
    const activeCam = _getActiveCam();
    renderer.setScissor(0, 0, w, h);
    renderer.setViewport(0, 0, w, h);
    renderer.render(scene, activeCam);
    return;
  }

  // 2P split-screen
  renderer.setScissor(0, 0, w / 2, h);
  renderer.setViewport(0, 0, w / 2, h);
  renderer.render(scene, cameras.p1);

  renderer.setScissor(w / 2, 0, w / 2, h);
  renderer.setViewport(w / 2, 0, w / 2, h);
  renderer.render(scene, cameras.p2);
}

// ---- Animate loop ----
function animate() {
  requestAnimationFrame(animate);

  const frameDt = Math.min(game.clock.getDelta(), 0.2);
  game._lastDt = frameDt;

  // JUICE: advance the time-scale manager on REAL dt and read the scalar. This
  // ALWAYS returns to exactly 1 once no effect is active (no drift / stuck-slow).
  // Note: rendering + cosmetic world animation below stay on wall-clock frameDt;
  // only the SIM substep accumulator is scaled (see below).
  const timeScale = updateJuice(frameDt);

  // Environmental / cosmetic (always run, even in menu/pause)
  // Slow golden-hour drift; keep the sun around ~35° elevation, never overhead.
  sunAngle += frameDt * 0.012;
  const sx = Math.cos(sunAngle) * 60;
  const sz = Math.sin(sunAngle) * 40;
  sun.position.set(sx, 42, sz);
  if (sun.target) { sun.target.position.set(0, 0, 0); sun.target.updateMatrixWorld(); }
  // Sun disc/glow sits far along the light direction so it reads on the horizon.
  if (ctx.sunGlow) {
    const d = sun.position.clone().normalize().multiplyScalar(240);
    ctx.sunGlow.position.copy(d);
  }

  if (ctx.bamboo) {
    ctx.bamboo.forEach((b, i) => {
      b.rotation.z = b._baseRot + Math.sin(Date.now() * 0.001 + i) * 0.03;
    });
  }

  if (ctx.koi) {
    ctx.koi.forEach(k => {
      k._angle += frameDt * 0.5;
      k.position.x = -13 + Math.cos(k._angle) * 3.5;
      k.position.z = -7  + Math.sin(k._angle) * 2.5;
      k.rotation.y = -k._angle;
    });
  }

  if (ctx.cloudLayers) {
    ctx.cloudLayers.forEach(c => {
      c.position.x += c._speed * frameDt;
      if (c.position.x > 300) c.position.x = -300;
    });
  }

  // Grass tuft wind sway (cheap group-rotation trick, no per-vertex work).
  if (ctx.grassTufts) {
    const t = Date.now() * 0.001;
    ctx.grassTufts.forEach(g => {
      g.rotation.z = Math.sin(t * 1.3 + g._phase) * 0.12;
    });
  }

  // Koi pond second ripple layer: slow scroll + gentle opacity pulse.
  if (ctx.pondRipple) {
    const r = ctx.pondRipple;
    if (r.material.map) {
      r.material.map.offset.x = (Date.now() * 0.00003) % 1;
      r.material.map.offset.y = (Date.now() * 0.00002) % 1;
    }
    r.material.opacity = 0.28 + Math.sin(Date.now() * 0.0012) * 0.12;
  }

  if (ctx.petals) {
    ctx.petals.forEach(p => {
      p.position.x += p._vx;
      p.position.y += p._vy;
      p.position.z += p._vz;
      p.rotation.z += p._spin;
      if (p.position.y < -2) resetPetal(p);
    });
  }

  // Skip simulation if in menu or gameover
  if (gameState.state !== 'MENU' && gameState.state !== 'GAMEOVER' && !isPaused()) {
    // Fixed-timestep substepping. JUICE: the SIM advances by (frameDt × timeScale)
    // so hitstop (≈0) freezes the world and slow-mo (~0.35) eases it — while the
    // render keeps running every rAF. timeScale ∈ [0,1] and frameDt is capped at
    // 0.2s, so scaled time ≤ 0.2 → at most ~12 substeps (no substep explosion).
    // At timeScale ≈ 0 the loop simply makes no progress (sim paused) and exits.
    const FIXED_STEP = 1 / 60;
    let remaining = Math.min(frameDt * timeScale, 0.2);
    while (remaining > 1e-6) {
      const step = Math.min(remaining, FIXED_STEP);
      updateGame(step);
      remaining -= step;
    }

    // JUICE — pooled movement dust under running players (real-time throttle so
    // it's framerate-independent and unaffected by the sim time-scale). Skips
    // airborne / inactive / KO'd heroes.
    _emitMovementDust('p1', gameState.p1, frameDt);
    _emitMovementDust('p2', gameState.p2, frameDt);
  }

  if (!game._freezeCam) {
    // In 1P, only update the active hero's camera (skip partner camera)
    if (ctx.mode === '1p') {
      const activeId = ctx.soloChar === 'sister' ? 'p2' : 'p1';
      const activePlayer = activeId === 'p1' ? gameState.p1 : gameState.p2;
      if (activePlayer) updateCameraV2(activeId, activePlayer);
    } else {
      if (gameState.p1) updateCameraV2('p1', gameState.p1);
      if (gameState.p2) updateCameraV2('p2', gameState.p2);
    }
  }

  const midCam = cameras.p1;
  gameState.spirits.forEach(s => { if (s.alive) s.updateHpBar(midCam); });

  game._hudTimer = (game._hudTimer || 0) + frameDt;
  if (game._hudTimer > 0.05) {
    game._hudTimer = 0;
    updateHUD();
    updateObjective();
    _updateLivesHUD();
    updateTouchOverlay();
    // Boss bar: show during wave 4 and 5 (both Level 1 and Level 2)
    const _ws = gameState.state;
    if (_ws === 'WAVE4' || _ws === 'WAVE5') {
      const boss = gameState.spirits.find(s => s.alive && s._isBoss);
      updateBossBar(boss, !!boss);
    } else {
      updateBossBar(null, false);
    }
  }

  renderFrame();
}

// ---- Init ----
function init() {
  // Pass 13: load control bindings (localStorage → ctx.bindings)
  loadBindings();

  buildWorld();
  resize();

  // Build post-processing composers (high quality). On failure auto-falls back
  // to 'low' (direct render) with a console.warn — never a hard error.
  buildPostFX();

  gameState.p1 = new Player(1, new THREE.Vector3(-3, 0, 5));
  gameState.p2 = new Player(2, new THREE.Vector3(3, 0, 5));

  // ContentGenAI v1.5: optional rigged-GLB heroes. OFF by default — enable WITHOUT
  // editing code via either the saved setting (localStorage `mds_gltf_heroes` = '1',
  // toggled by `window.__game.setGltfHeroes(true)` + reload) or the URL `?glb=1`.
  // Dynamic import => with the flag off, gltfChar.js / GLTFLoader never load (E2E-safe).
  if (ctx.useGltfHeroes === undefined) {
    let on = false;
    try { on = localStorage.getItem('mds_gltf_heroes') === '1'; } catch (_) {}
    try { if (new URLSearchParams(location.search).get('glb') === '1') on = true; } catch (_) {}
    ctx.useGltfHeroes = on;
  }
  ctx.heroGlb = ctx.heroGlb || {};
  ctx.HERO_SCALE = ctx.HERO_SCALE ?? 1.0;
  if (ctx.useGltfHeroes) {
    import('./chars/gltfChar.js').then(m => {
      m.loadGltfCharacter('assets/monk_animated.glb', { scale: ctx.HERO_SCALE, forwardYaw: Math.PI })
        .then(c => { ctx.heroGlb.monk = c; gameState.p1._swapHeroMesh(c.group); })
        .catch(e => console.warn('[glb] monk load failed', e));
      m.loadGltfCharacter('assets/sister_animated.glb', { scale: ctx.HERO_SCALE, forwardYaw: Math.PI })
        .then(c => { ctx.heroGlb.sister = c; gameState.p2._swapHeroMesh(c.group); })
        .catch(e => console.warn('[glb] sister load failed', e));
    }).catch(e => console.warn('[glb] module load failed', e));
  }

  camState.p1.pos.set(-3, 6, 15);
  camState.p2.pos.set(3, 6, 15);

  // Set initial state to MENU (boot landing)
  gameState.state = 'MENU';

  // Init lives
  initLives();

  updateHUD();
  buildMenu();      // shows menu (and removes the boot splash in showMenu)
  setupDebugAPI();
  // Touch controls (no-op on desktop). Wrapped so a touch-build error can never
  // stop the game from running or leave the boot splash up.
  try { initTouchControls(dispatchPlayerAction); } catch (e) { console.warn('[touch] init failed:', e && e.message); }
  animate();
}

init();
