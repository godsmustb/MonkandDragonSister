// src/game/camera.js — Camera V2
// (a) Auto-follow: yaw eases to behind player movement heading
// (b) Manual orbit: P1 Q/E, P2 Num7/Num9 — hold, decays after 3s
// (c) Lock-on: P1 F, P2 Num0 — targets nearest spirit
// (d) Ground-clip prevention: cam.y >= 1.2
import * as THREE from 'three';
import { ctx } from '../state.js';

// ── Per-player camera state ────────────────────────────────────────────────
const _camExtra = {
  p1: {
    yawOffset:    0,          // manual orbit offset (radians)
    autoYaw:      0,          // current auto-follow yaw
    manualTimer:  0,          // time since last manual input
    lockTarget:   null,       // Spirit reference (or null)
    lockMesh:     null,       // gold diamond indicator
  },
  p2: {
    yawOffset:    0,
    autoYaw:      0,
    manualTimer:  0,
    lockTarget:   null,
    lockMesh:     null,
  },
};

export const camExtra = _camExtra; // exported for debug API

const ORBIT_SPEED    = 1.8;   // rad/s while key held
const ORBIT_DECAY    = 3.0;   // seconds before yawOffset decays to 0
const AUTO_YAW_RATE  = 2.5;   // rad/s max yaw follow rate
const LOCK_BREAK_DIST = 18;   // units: break lock if target XZ dist exceeds this
const LOCK_AIM_BLEND = 0.60;  // fraction: blend auto-aim facing toward target (60%)

// Scratch vectors — module-scope to avoid per-frame allocation.
// Note: two players call updateCamera() sequentially each frame; these are
// safe as scratch because no reference to them is retained between calls.
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
// _targetPos and _targetLook were previously allocated as `new THREE.Vector3()`
// inside updateCamera(). Hoisted here — safe because each call overwrites them
// fully before use and no reference escapes the function.
const _targetPos  = new THREE.Vector3();
const _targetLook = new THREE.Vector3();

// ── Lock-on indicator mesh ─────────────────────────────────────────────────
function _makeLockMesh() {
  // A small gold diamond (octahedron) floating above target
  const geo = new THREE.OctahedronGeometry(0.25, 0);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffdd00 });
  const mesh = new THREE.Mesh(geo, mat);
  return mesh;
}

function _ensureLockMesh(cx) {
  if (!cx.lockMesh) {
    cx.lockMesh = _makeLockMesh();
    ctx.scene.add(cx.lockMesh);
  }
}

function _removeLockMesh(cx) {
  if (cx.lockMesh) {
    ctx.scene.remove(cx.lockMesh);
    cx.lockMesh = null;
  }
}

// ── Toggle lock-on ────────────────────────────────────────────────────────
export function toggleLockOn(camId) {
  const cx = _camExtra[camId];
  if (cx.lockTarget && cx.lockTarget.alive) {
    // Unlock
    cx.lockTarget = null;
    _removeLockMesh(cx);
  } else {
    // Find nearest living spirit
    const player = camId === 'p1' ? ctx.gameState.p1 : ctx.gameState.p2;
    if (!player) return;
    let nearest = null, nearDist = Infinity;
    ctx.gameState.spirits.forEach(s => {
      if (!s.alive) return;
      const d = player.pos.distanceTo(s.pos);
      if (d < nearDist) { nearDist = d; nearest = s; }
    });
    if (nearest) {
      cx.lockTarget = nearest;
      _ensureLockMesh(cx);
    }
  }
}

// ── Main update ────────────────────────────────────────────────────────────
export function updateCamera(camId, player) {
  const cs  = ctx.camState[camId];
  const cam = ctx.cameras[camId];
  const cx  = _camExtra[camId];
  const keys = ctx.keys;

  // ── Check lock target still valid ──
  if (cx.lockTarget) {
    // Break if dead OR XZ distance exceeds threshold
    const xzDist = Math.sqrt(
      (cx.lockTarget.pos.x - player.pos.x) ** 2 +
      (cx.lockTarget.pos.z - player.pos.z) ** 2
    );
    if (!cx.lockTarget.alive || xzDist > LOCK_BREAK_DIST) {
      cx.lockTarget = null;
      _removeLockMesh(cx);
      // Auto-retarget nearest within LOCK_BREAK_DIST units
      let nearest = null, nearDist = Infinity;
      ctx.gameState.spirits.forEach(s => {
        if (!s.alive) return;
        const d = player.pos.distanceTo(s.pos);
        if (d < nearDist && d < LOCK_BREAK_DIST) { nearDist = d; nearest = s; }
      });
      if (nearest) {
        cx.lockTarget = nearest;
        _ensureLockMesh(cx);
      }
    }
  }

  // ── Manual orbit keys ──
  // frameDt is stored on ctx.game._lastDt by the animate loop
  const frameDt = ctx.game._lastDt || 0.016;

  let manualInput = false;
  if (camId === 'p1') {
    if (keys['KeyQ']) { cx.yawOffset -= ORBIT_SPEED * frameDt; manualInput = true; }
    if (keys['KeyE']) { cx.yawOffset += ORBIT_SPEED * frameDt; manualInput = true; }
  } else {
    if (keys['Numpad7']) { cx.yawOffset -= ORBIT_SPEED * frameDt; manualInput = true; }
    if (keys['Numpad9']) { cx.yawOffset += ORBIT_SPEED * frameDt; manualInput = true; }
  }

  if (manualInput) {
    cx.manualTimer = 0;
  } else {
    cx.manualTimer += frameDt;
    if (cx.manualTimer > ORBIT_DECAY) {
      // Decay offset back to 0
      const decayRate = 2.0 * frameDt;
      if (Math.abs(cx.yawOffset) < decayRate) cx.yawOffset = 0;
      else cx.yawOffset -= Math.sign(cx.yawOffset) * decayRate;
    }
  }

  // ── Compute target yaw ──
  let targetYaw;
  if (cx.lockTarget && cx.lockTarget.alive) {
    // Lock-on: yaw toward target
    _v1.subVectors(cx.lockTarget.pos, player.pos);
    targetYaw = Math.atan2(_v1.x, _v1.z); // angle FROM player TO target
    // Pull camera back behind player relative to that direction
  } else {
    // Auto-follow: ease toward behind movement heading
    const movLen = (player._vel && player._vel.lengthSq) ? player._vel.lengthSq() : 0;
    const faceYaw = Math.atan2(player.facing.x, player.facing.z);
    // Smoothly ease autoYaw toward faceYaw
    let diff = faceYaw - cx.autoYaw;
    // Wrap diff to [-π, π]
    while (diff > Math.PI)  diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    cx.autoYaw += diff * Math.min(1, AUTO_YAW_RATE * frameDt);
    targetYaw = cx.autoYaw;
  }

  const finalYaw = targetYaw + cx.yawOffset;
  const cosA = Math.cos(finalYaw), sinA = Math.sin(finalYaw);

  // Camera behind player: offset in -forward direction
  const dist = 10, height = 6;
  _v2.set(dist * sinA, height, dist * cosA);
  // Reuse module-scope scratch vectors (hoisted from per-call allocation — FIX 8)
  _targetPos.copy(player.pos).add(_v2);
  _targetLook.copy(player.pos); _targetLook.y += 1.2;

  // Ground-clip prevention
  if (_targetPos.y < 1.2) _targetPos.y = 1.2;

  // Camera shake
  if (cs.shake > 0) {
    _targetPos.x += (Math.random() - 0.5) * cs.shake * 2;
    _targetPos.y += (Math.random() - 0.5) * cs.shake * 2;
    cs.shake *= 0.8;
    if (cs.shake < 0.005) cs.shake = 0;
  }

  cs.pos.lerp(_targetPos, 0.08);
  cs.look.lerp(_targetLook, 0.12);
  cam.position.copy(cs.pos);
  cam.lookAt(cs.look);

  // ── Lock-on indicator ──
  if (cx.lockTarget && cx.lockTarget.alive && cx.lockMesh) {
    cx.lockMesh.position.copy(cx.lockTarget.pos);
    cx.lockMesh.position.y += 2.0;
    cx.lockMesh.rotation.y += 2.0 * frameDt;
  }

  // ── Auto-aim facing toward lock target (blended, not hard-snap) ──
  // Lerp the player's facing yaw at LOCK_AIM_BLEND (60%) per frame toward the
  // target direction, preserving the player's movement intent for the remaining 40%.
  if (cx.lockTarget && cx.lockTarget.alive) {
    _v4.subVectors(cx.lockTarget.pos, player.pos);
    _v4.y = 0;
    if (_v4.lengthSq() > 0.01) {
      _v4.normalize();
      player.facing.lerp(_v4, LOCK_AIM_BLEND).normalize();
    }
  }
}

// ── Cleanup lock meshes on wave reset ────────────────────────────────────
export function clearLockTargets() {
  ['p1', 'p2'].forEach(id => {
    const cx = _camExtra[id];
    cx.lockTarget = null;
    _removeLockMesh(cx);
  });
}
