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
const game = { _hitstop: 0, clock: new THREE.Clock(), _lastDt: 0.016 };
ctx.game = game;

// ---- Resize ----
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  cameras.p1.aspect = (w / 2) / h;
  cameras.p1.updateProjectionMatrix();
  cameras.p2.aspect = (w / 2) / h;
  cameras.p2.updateProjectionMatrix();
  resizePostFX();
}
window.addEventListener('resize', resize);

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
}

// ---- Input ----
// Extra keys for camera V2 + pause
const EXTRA_PREVENT = new Set(['KeyQ','KeyE','KeyF','Numpad7','Numpad9','Numpad0','Escape']);

window.addEventListener('keydown', (e) => {
  if (PREVENT_KEYS.has(e.code) || EXTRA_PREVENT.has(e.code)) e.preventDefault();
  keys[e.code] = true;

  // Every keydown is a user gesture — init audio lazily (no-op if already created)
  try { initAudioOnGesture(); } catch {}

  // M key = mute toggle (works in any state during gameplay)
  if (e.code === 'KeyM') {
    try { toggleMute(); } catch {}
  }

  // Menu state — let menu.js handle navigation via its own listener
  if (gameState.state === 'MENU') return;

  // Pause toggle (Escape key during game)
  if (e.code === 'Escape') {
    togglePause();
    return;
  }

  if (isPaused()) return;

  if (gameState.state === 'INTRO') { endIntro(); return; }

  const p1 = gameState.p1, p2 = gameState.p2;
  if (!p1 || !p2) return;

  // KO gate: skip action calls for a downed player (movement is already gated in update())
  if (!p1.isKO) {
    if (e.code === 'Space' || e.code === 'KeyI') p1.attack();
    if (e.code === 'KeyJ') p1.chiShield();
    if (e.code === 'KeyK') p1.dodge();
    if (e.code === 'KeyL') p1.healingPulse();
  }
  // Camera V2: P1 lock-on (allowed even while KO so player can track the fight)
  if (e.code === 'KeyF') toggleLockOn('p1');

  if (!p2.isKO) {
    if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Numpad8') p2.attack();
    if (e.code === 'Numpad4') p2.cycleForm();
    if (e.code === 'Numpad5') p2.dodge();
    if (e.code === 'Numpad6') p2.special();
  }
  // Camera V2: P2 lock-on
  if (e.code === 'Numpad0') toggleLockOn('p2');
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
// HIGH quality → two half-screen composers (bloom + ACES + SMAA).
// LOW quality (or composer unavailable) → direct split-screen scissor render.
function renderFrame() {
  if (postFxEnabled() && renderPostFX()) return;

  const w = window.innerWidth, h = window.innerHeight;
  renderer.setScissorTest(true);
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

  if (game._hitstop > 0) {
    game._hitstop -= frameDt;
    if (game._hitstop > 0) { renderFrame(); return; }
    game._hitstop = 0;
  }

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
    // Fixed-timestep substepping
    const FIXED_STEP = 1 / 60;
    let remaining = frameDt;
    while (remaining > 0) {
      const step = Math.min(remaining, FIXED_STEP);
      updateGame(step);
      remaining -= step;
    }
  }

  if (!game._freezeCam) {
    if (gameState.p1) updateCameraV2('p1', gameState.p1);
    if (gameState.p2) updateCameraV2('p2', gameState.p2);
  }

  const midCam = cameras.p1;
  gameState.spirits.forEach(s => { if (s.alive) s.updateHpBar(midCam); });

  game._hudTimer = (game._hudTimer || 0) + frameDt;
  if (game._hudTimer > 0.05) {
    game._hudTimer = 0;
    updateHUD();
    updateObjective();
    _updateLivesHUD();
    // Boss bar: show during wave 4 and 5
    const _ws = gameState.state;
    if (_ws === 'WAVE4' || _ws === 'WAVE5') {
      const boss = gameState.spirits.find(s => s.alive && (s._type === 'venomoni' || s._type === 'infernolord'));
      updateBossBar(boss, !!boss);
    } else {
      updateBossBar(null, false);
    }
  }

  renderFrame();
}

// ---- Init ----
function init() {
  buildWorld();
  resize();

  // Build post-processing composers (high quality). On failure auto-falls back
  // to 'low' (direct render) with a console.warn — never a hard error.
  buildPostFX();

  gameState.p1 = new Player(1, new THREE.Vector3(-3, 0, 5));
  gameState.p2 = new Player(2, new THREE.Vector3(3, 0, 5));

  camState.p1.pos.set(-3, 6, 15);
  camState.p2.pos.set(3, 6, 15);

  // Set initial state to MENU (boot landing)
  gameState.state = 'MENU';

  // Init lives
  initLives();

  updateHUD();
  buildMenu();      // shows menu, wires its own event listeners
  setupDebugAPI();
  animate();
}

init();
