// src/main.js — boot, renderer/scene/cameras, animate() loop, resize handler
import * as THREE from 'three';
import { ctx } from './state.js';
import { ARENA_SIZE, PREVENT_KEYS } from './config.js';
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
import { updateHUD, updateObjective, showDamageNumber, setFxTimersRef } from './ui/hud.js';
import { setupDebugAPI } from './debug.js';

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
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setScissorTest(true);
ctx.renderer = renderer;

// ---- Scene ----
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x88bbcc, 0.012);
scene.background = new THREE.Color(0x7ab0c8);
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
const game = { _hitstop: 0, clock: new THREE.Clock() };
ctx.game = game;

// ---- Resize ----
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  cameras.p1.aspect = (w / 2) / h;
  cameras.p1.updateProjectionMatrix();
  cameras.p2.aspect = (w / 2) / h;
  cameras.p2.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

// ---- Scratch vectors for camera update ----
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();

function updateCamera(camId, player) {
  const cs = camState[camId];
  const cam = cameras[camId];
  const angle = Math.atan2(player.facing.x, player.facing.z);
  const cosA = Math.cos(angle), sinA = Math.sin(angle);
  _v1.set(10 * sinA, 6, 10 * cosA);
  _v2.copy(player.pos).add(_v1);
  _v3.set(0, 1.2, 0);
  _v4.copy(player.pos).add(_v3);
  const targetPos = _v2;
  const targetLook = _v4;

  if (cs.shake > 0) {
    targetPos.x += (Math.random() - 0.5) * cs.shake * 2;
    targetPos.y += (Math.random() - 0.5) * cs.shake * 2;
    cs.shake *= 0.8;
    if (cs.shake < 0.005) cs.shake = 0;
  }

  cs.pos.lerp(targetPos, 0.08);
  cs.look.lerp(targetLook, 0.12);
  cam.position.copy(cs.pos);
  cam.lookAt(cs.look);
}

// ---- Simulation step ----
function updateGame(dt) {
  const allPlayers = [gameState.p1, gameState.p2];
  allPlayers.forEach(p => p && p.update(dt, keys, allPlayers));

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
window.addEventListener('keydown', (e) => {
  if (PREVENT_KEYS.has(e.code)) e.preventDefault();
  keys[e.code] = true;

  if (gameState.state === 'INTRO') { endIntro(); return; }

  const p1 = gameState.p1, p2 = gameState.p2;
  if (e.code === 'Space' || e.code === 'KeyI') p1.attack();
  if (e.code === 'KeyJ') p1.chiShield();
  if (e.code === 'KeyK') p1.dodge();
  if (e.code === 'KeyL') p1.healingPulse();

  if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Numpad8') p2.attack();
  if (e.code === 'Numpad4') p2.cycleForm();
  if (e.code === 'Numpad5') p2.dodge();
  if (e.code === 'Numpad6') p2.special();
});

window.addEventListener('keyup', (e) => { keys[e.code] = false; });

// ---- Render ----
function renderFrame() {
  const w = window.innerWidth, h = window.innerHeight;
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

  if (game._hitstop > 0) {
    game._hitstop -= frameDt;
    if (game._hitstop > 0) { renderFrame(); return; }
    game._hitstop = 0;
  }

  // Environmental / cosmetic
  sunAngle += frameDt * 0.05;
  sun.position.set(Math.cos(sunAngle) * 50, 50, Math.sin(sunAngle) * 30);

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

  if (ctx.clouds) {
    ctx.clouds.forEach(c => {
      c.position.x += c._speed * frameDt;
      if (c.position.x > 200) c.position.x = -200;
    });
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

  // Fixed-timestep substepping
  const FIXED_STEP = 1 / 60;
  let remaining = frameDt;
  while (remaining > 0) {
    const step = Math.min(remaining, FIXED_STEP);
    updateGame(step);
    remaining -= step;
  }

  if (gameState.p1) updateCamera('p1', gameState.p1);
  if (gameState.p2) updateCamera('p2', gameState.p2);

  const midCam = cameras.p1;
  gameState.spirits.forEach(s => { if (s.alive) s.updateHpBar(midCam); });

  game._hudTimer = (game._hudTimer || 0) + frameDt;
  if (game._hudTimer > 0.05) {
    game._hudTimer = 0;
    updateHUD();
    updateObjective();
  }

  renderFrame();
}

// ---- Init ----
function init() {
  buildWorld();
  resize();

  gameState.p1 = new Player(1, new THREE.Vector3(-3, 0, 5));
  gameState.p2 = new Player(2, new THREE.Vector3(3, 0, 5));

  camState.p1.pos.set(-3, 6, 15);
  camState.p2.pos.set(3, 6, 15);

  updateHUD();
  startIntro();
  setupDebugAPI();
  animate();
}

init();
