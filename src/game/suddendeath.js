// src/game/suddendeath.js — Collapsing-arena sudden death for Endless mode
// Runs while ctx.gameState._endless is true and state is a live WAVE/ENDLESS state.
// dt-driven via _fxEffects pattern; NO setTimeout/setInterval for timing or FX.
import * as THREE from 'three';
import { ctx } from '../state.js';
import { _fxEffects } from '../combat/projectiles.js';
import { showPlayerToast } from '../ui/hud.js';
import { sfx } from '../audio/audio.js';

// triggerGameOver is imported lazily to avoid a circular dependency at module load time
// (lives.js → quest.js → suddendeath.js → lives.js).
// Use the dynamic import pattern established by abilities.js and quest.js.

// ─── Constants ────────────────────────────────────────────────────────────────
export const SD_FULL_RADIUS  = 56;   // ARENA_SIZE(60) − 4; starting safe radius
const SD_FINAL_RADIUS = 6;           // smallest safe floor at t=90s
const SD_TOTAL_TIME   = 90;          // total sudden-death seconds
const SD_STEPS        = 9;           // number of collapse steps
const SD_INTERVAL     = SD_TOTAL_TIME / SD_STEPS; // 10s per step

// Collapse schedule: radii[k] is safe radius AFTER the k-th collapse (k=1..9).
// radii[0] = full (no collapse yet). Lerp from SD_FULL_RADIUS → SD_FINAL_RADIUS.
function _collapseRadius(step) {
  return SD_FULL_RADIUS + (SD_FINAL_RADIUS - SD_FULL_RADIUS) * (step / SD_STEPS);
}

// ─── Module state ─────────────────────────────────────────────────────────────
let _elapsed     = 0;    // seconds into sudden-death (reset each endless run)
let _stepsDone   = 0;    // how many collapses have fired

// Scene meshes owned by this module
let _dangerRing  = null; // glowing ring at current safe radius
let _innerRing   = null; // pulsing ring telegraphing the next collapse radius

// ─── Public API ───────────────────────────────────────────────────────────────
/** Reset all state and clean up scene meshes. Call on endless restart or menu. */
export function resetSuddenDeath() {
  _elapsed   = 0;
  _stepsDone = 0;
  _removeDangerRings();
}

/** Seconds elapsed into the current sudden-death run (0 if not active). */
export function getSuddenDeathElapsed() {
  return _elapsed;
}

/**
 * Per-frame update. Call from updateGame() while in endless mode.
 * @param {number} dt - fixed sub-step delta (seconds)
 */
export function updateSuddenDeath(dt) {
  const gs = ctx.gameState;
  if (!gs || !gs._endless) return;
  // Only run during live WAVE states
  const st = gs.state;
  if (st === 'MENU' || st === 'GAMEOVER' || st === 'COMPLETE' || st === 'INTRO') return;

  _elapsed += dt;

  // ── Collapse step logic ──────────────────────────────────────────────────
  const nextStep = _stepsDone + 1;
  if (nextStep <= SD_STEPS && _elapsed >= nextStep * SD_INTERVAL) {
    _doCollapse(nextStep);
    _stepsDone = nextStep;
  }

  // ── Danger-ring cosmetic update ──────────────────────────────────────────
  _updateDangerRings(dt);

  // ── Player fall detection (endless-only) ─────────────────────────────────
  const ar = gs.arenaRadius != null ? gs.arenaRadius : SD_FULL_RADIUS;
  const FALL_GRACE   = 0.5;  // units of grace past the edge
  const FALL_GRAVITY = 12;   // downward velocity (units/s) while falling
  const FALL_DEATH_Y = -4;   // y threshold that triggers game over

  [gs.p1, gs.p2].forEach(p => {
    if (!p || p.inactive || p.isKO) {
      // Clear falling if KO'd by other means
      if (p) p._falling = false;
      return;
    }
    const dist = Math.sqrt(p.pos.x * p.pos.x + p.pos.z * p.pos.z);
    if (dist > ar + FALL_GRACE) {
      // Over collapsed void
      if (!p._falling) {
        p._falling = true;
        p._fallVel = 0;
        showPlayerToast(p.id, `P${p.id} is falling!`);
      }
    } else {
      // Back on safe ground
      if (p._falling) {
        p._falling = false;
        p.pos.y = 0;
        p._fallVel = 0;
      }
    }

    if (p._falling) {
      p._fallVel = (p._fallVel || 0) - FALL_GRAVITY * dt;
      p.pos.y += p._fallVel * dt;
      const cm = p.currentMesh && p.currentMesh();
      if (cm) cm.position.copy(p.pos);
      if (p.pos.y < FALL_DEATH_Y) {
        p._falling = false;
        p.isKO = true;
        p.hp = 0;
        showPlayerToast(p.id, `P${p.id} fell off the edge!`);
        import('./lives.js').then(m => m.triggerGameOver()).catch(() => {});
      }
    }
  });
}

// ─── Internal helpers ─────────────────────────────────────────────────────────
function _doCollapse(step) {
  const gs = ctx.gameState;
  const oldRadius = gs.arenaRadius != null ? gs.arenaRadius : SD_FULL_RADIUS;
  const newRadius = _collapseRadius(step);

  gs.arenaRadius = newRadius;

  // Kick any demons that wandered outside back onto the shrinking disc
  if (gs.spirits) {
    gs.spirits.forEach(s => {
      if (!s.alive) return;
      const r2 = s.pos.x * s.pos.x + s.pos.z * s.pos.z;
      if (r2 > newRadius * newRadius) {
        const r = Math.sqrt(r2) || 1;
        s.pos.x = (s.pos.x / r) * (newRadius - 0.5);
        s.pos.z = (s.pos.z / r) * (newRadius - 0.5);
        if (s.mesh) s.mesh.position.x = s.pos.x;
        if (s.mesh) s.mesh.position.z = s.pos.z;
      }
    });
  }

  // Screen shake on both cameras
  if (ctx.camState) {
    if (ctx.camState.p1) ctx.camState.p1.shake = 0.3;
    if (ctx.camState.p2) ctx.camState.p2.shake = 0.3;
  }

  // Audio sting
  try { sfx.playerKO && sfx.playerKO(); } catch (_) {}

  // ── Falling-ring VFX (annulus between old and new radius drops and fades) ──
  _spawnFallingRingVfx(oldRadius, newRadius);

  // Rebuild the danger rings at the new radius
  _rebuildDangerRings(newRadius, step);
}

function _spawnFallingRingVfx(outerR, innerR) {
  const scene = ctx.scene;
  const segments = 64;
  // RingGeometry(innerRadius, outerRadius, thetaSegments)
  const geo = new THREE.RingGeometry(innerR, outerR, segments);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x8B6914,  // earthy ground colour
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const ring = new THREE.Mesh(geo, mat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  scene.add(ring);

  const FALL_GRAVITY = 18;
  let velY = 0;
  let life = 1.4;

  const entry = {
    timer: life,
    tick(dt) {
      velY -= FALL_GRAVITY * dt;
      ring.position.y += velY * dt;
      life -= dt;
      mat.opacity = Math.max(0, 0.85 * (life / 1.4));
    },
    cleanup() {
      scene.remove(ring);
      geo.dispose();
      mat.dispose();
    },
  };
  _fxEffects.push(entry);
}

function _removeDangerRings() {
  if (_dangerRing) {
    if (_dangerRing.parent) _dangerRing.parent.remove(_dangerRing);
    if (_dangerRing.geometry) _dangerRing.geometry.dispose();
    if (_dangerRing.material) _dangerRing.material.dispose();
    _dangerRing = null;
  }
  if (_innerRing) {
    if (_innerRing.parent) _innerRing.parent.remove(_innerRing);
    if (_innerRing.geometry) _innerRing.geometry.dispose();
    if (_innerRing.material) _innerRing.material.dispose();
    _innerRing = null;
  }
}

/**
 * Build (or rebuild) the glowing danger ring at the current safe radius and
 * the pulsing inner ring telegraphing the NEXT collapse radius.
 */
function _rebuildDangerRings(currentRadius, stepsDone) {
  const scene = ctx.scene;
  _removeDangerRings();

  // ── Danger ring — at current safe edge ──────────────────────────────────
  const dGeo = new THREE.RingGeometry(currentRadius - 0.5, currentRadius + 0.3, 128);
  const dMat = new THREE.MeshBasicMaterial({
    color: 0xff2200,
    transparent: true,
    opacity: 0.75,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  _dangerRing = new THREE.Mesh(dGeo, dMat);
  _dangerRing.rotation.x = -Math.PI / 2;
  _dangerRing.position.y = 0.06;
  scene.add(_dangerRing);

  // ── Inner ring — telegraph of next collapse radius (shown if steps remain) ──
  if (stepsDone < SD_STEPS) {
    const nextR = _collapseRadius(stepsDone + 1);
    const iGeo = new THREE.RingGeometry(nextR - 0.35, nextR + 0.2, 128);
    const iMat = new THREE.MeshBasicMaterial({
      color: 0xff8800,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    _innerRing = new THREE.Mesh(iGeo, iMat);
    _innerRing.rotation.x = -Math.PI / 2;
    _innerRing.position.y = 0.05;
    scene.add(_innerRing);
  }
}

/** Called every frame to pulse opacity on the danger rings. */
function _updateDangerRings(dt) {
  if (!_dangerRing) {
    // Build rings on first endless frame (step 0, no collapse yet)
    const gs = ctx.gameState;
    if (gs && gs._endless) {
      const ar = gs.arenaRadius != null ? gs.arenaRadius : SD_FULL_RADIUS;
      _rebuildDangerRings(ar, _stepsDone);
    }
    return;
  }

  const t = _elapsed;
  // Danger ring pulses faster as time runs out
  const pulseRate = 1.5 + _stepsDone * 0.3;
  if (_dangerRing.material) {
    _dangerRing.material.opacity = 0.55 + Math.sin(t * pulseRate * Math.PI * 2) * 0.2;
  }
  if (_innerRing && _innerRing.material) {
    // Inner ring pulses offset, slightly dimmer
    _innerRing.material.opacity = 0.2 + Math.sin(t * pulseRate * Math.PI * 2 + Math.PI) * 0.12;
  }
}
