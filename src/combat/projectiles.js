// src/combat/projectiles.js — projectile pool, breath/FX spawn, _fxEffects/_fxTimers
// Pass 5: VFX v2 — trails, element breaths, impact sparks, telegraphs, dissolves, transforms
import * as THREE from 'three';
import { ctx } from '../state.js';
import { ELEMENT_COLORS, ARENA_SIZE } from '../config.js';
import { sfx } from '../audio/audio.js';

// ---- Module-scope registries ----
export const _projectiles = [];
export const _fxEffects   = [];
export const _fxTimers    = [];
export const _particles   = [];

// =====================================================================
//  SHARED GEOMETRIES & MATERIALS — pre-built at module init
// =====================================================================
const GEO = {
  sphere4:  new THREE.SphereGeometry(1, 4, 4),
  sphere6:  new THREE.SphereGeometry(1, 6, 4),
  sphere8:  new THREE.SphereGeometry(1, 8, 6),
  ring16:   new THREE.RingGeometry(0.85, 1, 16),
  ring24:   new THREE.RingGeometry(0.9, 1, 24),
  plane:    new THREE.PlaneGeometry(1, 1),
  cyl8:     new THREE.CylinderGeometry(1, 1, 1, 8),
  cone5:    new THREE.ConeGeometry(1, 1, 5),
  oct:      new THREE.OctahedronGeometry(1, 0),
  torus:    new THREE.TorusGeometry(1, 0.15, 6, 16),
};

// Material cache keyed by "color|blending|opacity"
const _matCache = new Map();
function vfxMat(color, blending = THREE.AdditiveBlending, opacity = 1, opts = {}) {
  const key = color + '|' + blending + '|' + opacity + '|' + JSON.stringify(opts);
  let m = _matCache.get(key);
  if (m) return m;
  m = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, blending,
    depthWrite: false, side: THREE.DoubleSide, ...opts,
  });
  _matCache.set(key, m);
  return m;
}

// =====================================================================
//  FX TIMER/EFFECT MANAGEMENT
// =====================================================================
export function clearAllFx() {
  _fxTimers.forEach(id => clearTimeout(id));
  _fxTimers.length = 0;
  _fxEffects.forEach(fx => { if (fx.cleanup) fx.cleanup(); });
  _fxEffects.length = 0;
}

export function updateFxEffects(dt) {
  for (let i = _fxEffects.length - 1; i >= 0; i--) {
    const fx = _fxEffects[i];
    fx.timer -= dt;
    if (fx.tick) fx.tick(dt);
    if (fx.timer <= 0) {
      if (fx.cleanup) fx.cleanup();
      _fxEffects.splice(i, 1);
    }
  }
}

// =====================================================================
//  PARTICLES
// =====================================================================
export function spawnDeathParticles(pos, color) {
  const scene = ctx.scene;
  for (let i = 0; i < 16; i++) {
    const m = new THREE.Mesh(GEO.sphere4,
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 }));
    m.scale.setScalar(0.15);
    m.position.copy(pos);
    scene.add(m);
    const vel = new THREE.Vector3(
      (Math.random() - 0.5) * 8, Math.random() * 6 + 2, (Math.random() - 0.5) * 8);
    _particles.push({ mesh: m, vel, life: 1, maxLife: 1, type: 'death' });
  }
}

export function spawnTransformParticles(pos, color) {
  const scene = ctx.scene;
  for (let i = 0; i < 30; i++) {
    const m = new THREE.Mesh(GEO.sphere4,
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 }));
    m.scale.setScalar(0.1);
    m.position.copy(pos);
    scene.add(m);
    const angle = (i / 30) * Math.PI * 2;
    const vel = new THREE.Vector3(Math.cos(angle) * 5, 4 + Math.random() * 3, Math.sin(angle) * 5);
    _particles.push({ mesh: m, vel, life: 1.5, maxLife: 1.5, type: 'transform' });
  }
}

export function updateParticles(dt) {
  for (let i = _particles.length - 1; i >= 0; i--) {
    const p = _particles[i];
    if (p.gravity !== false) p.vel.y -= 9.8 * dt;
    p.mesh.position.addScaledVector(p.vel, dt);
    p.life -= dt;
    p.mesh.material.opacity = Math.max(0, p.life / p.maxLife);
    if (p.spin) p.mesh.rotation.x += dt * p.spin;
    if (p.life <= 0) {
      ctx.scene.remove(p.mesh);
      _particles.splice(i, 1);
    }
  }
}

// =====================================================================
//  LEVEL-UP FLASH
// =====================================================================
export function triggerLevelUpFlash(player) {
  const scene = ctx.scene;
  // CSS flash
  const flashEl = document.createElement('div');
  flashEl.style.cssText = `position:fixed;top:0;left:${player.id === 1 ? '0' : '50%'};width:50%;height:100%;background:rgba(255,220,0,0.3);pointer-events:none;z-index:80;animation:toastOut 0.6s ease-in forwards;`;
  document.body.appendChild(flashEl);
  _fxTimers.push(setTimeout(() => flashEl.remove(), 700));

  // Gold light pillar
  const pos = player.pos.clone();
  _spawnLightPillar(pos, 0xffdd44, 4.0, 0.6);

  // Rising gold motes (8)
  for (let i = 0; i < 8; i++) {
    const m = new THREE.Mesh(GEO.sphere4,
      new THREE.MeshBasicMaterial({ color: 0xffd700, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.scale.setScalar(0.08);
    const offset = (Math.random() - 0.5) * 1.2;
    m.position.set(pos.x + offset, 0.2, pos.z + (Math.random() - 0.5) * 1.2);
    scene.add(m);
    _particles.push({ mesh: m, vel: new THREE.Vector3(offset * 0.5, 2 + Math.random() * 2, 0), life: 1.2, maxLife: 1.2, type: 'mote', gravity: false });
  }
}

// =====================================================================
//  VFX PRIMITIVES
// =====================================================================

/** Expanding ring on the floor — element tinted */
function _spawnGroundRing(pos, color, duration, maxScale = 1) {
  const scene = ctx.scene;
  const m = new THREE.Mesh(GEO.ring24,
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  m.rotation.x = -Math.PI / 2;
  m.position.set(pos.x, 0.05, pos.z);
  scene.add(m);
  let t = 0;
  _fxEffects.push({
    timer: duration,
    tick: (dt) => {
      t += dt / duration;
      m.scale.setScalar(maxScale * t);
      m.material.opacity = 0.8 * (1 - t);
    },
    cleanup: () => scene.remove(m),
  });
}

/** Quick burst flash sphere at pos */
function _spawnBurstFlash(pos, color, size = 0.4, duration = 0.2) {
  const scene = ctx.scene;
  const m = new THREE.Mesh(GEO.sphere8,
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false }));
  m.scale.setScalar(0.01);
  m.position.copy(pos);
  scene.add(m);
  let t = 0;
  _fxEffects.push({
    timer: duration,
    tick: (dt) => {
      t += dt / duration;
      m.scale.setScalar(size * t);
      m.material.opacity = 0.9 * (1 - t * t);
    },
    cleanup: () => scene.remove(m),
  });
}

/** Vertical light pillar (additive cylinder, quick scale+fade) */
function _spawnLightPillar(pos, color, height = 4, duration = 0.5) {
  const scene = ctx.scene;
  const m = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.6, height, 8),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  m.position.set(pos.x, height / 2, pos.z);
  scene.add(m);
  let t = 0;
  _fxEffects.push({
    timer: duration,
    tick: (dt) => {
      t += dt / duration;
      m.scale.set(1 + t * 2, 1, 1 + t * 2);
      m.material.opacity = 0.7 * (1 - t);
    },
    cleanup: () => scene.remove(m),
  });
}

/** Hit sparks: 6-10 small additive cross-stars bursting from hit point */
export function spawnHitSparks(pos, element, isDouble = false) {
  try { sfx.hitSpark(element, isDouble); } catch {}
  const scene = ctx.scene;
  const col = ELEMENT_COLORS[element] || 0xffffff;
  const count = isDouble ? 10 : 6;
  const size = isDouble ? 0.18 : 0.12;

  // Burst flash
  _spawnBurstFlash(pos.clone(), col, isDouble ? 0.7 : 0.4, 0.18);

  // Radial flash ring
  _spawnGroundRing(pos, col, 0.22, isDouble ? 1.6 : 1.0);

  // Spark particles
  for (let i = 0; i < count; i++) {
    const m = new THREE.Mesh(GEO.sphere4,
      new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 1,
        blending: THREE.AdditiveBlending, depthWrite: false }));
    m.scale.setScalar(size * (0.5 + Math.random() * 0.5));
    m.position.copy(pos);
    scene.add(m);
    const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
    const speed = 3 + Math.random() * 5;
    const vel = new THREE.Vector3(
      Math.cos(angle) * speed,
      2 + Math.random() * 4,
      Math.sin(angle) * speed);
    _particles.push({ mesh: m, vel, life: 0.35, maxLife: 0.35, type: 'spark' });
  }

  // For 2x effective hits: extra starburst ring
  if (isDouble) {
    _fxTimers.push(setTimeout(() => {
      _spawnGroundRing(pos, 0xffffff, 0.3, 2.0);
    }, 80));
  }
}

/** Red shards from player when damaged */
export function spawnPlayerHitShards(pos) {
  const scene = ctx.scene;
  for (let i = 0; i < 5; i++) {
    const m = new THREE.Mesh(GEO.oct,
      new THREE.MeshBasicMaterial({ color: 0xff2222, transparent: true, opacity: 0.9,
        blending: THREE.AdditiveBlending, depthWrite: false }));
    m.scale.setScalar(0.10);
    m.position.copy(pos);
    m.position.y = 0.8;
    scene.add(m);
    const angle = (i / 5) * Math.PI * 2 + Math.random() * 0.8;
    const vel = new THREE.Vector3(
      Math.cos(angle) * (3 + Math.random() * 3),
      3 + Math.random() * 3,
      Math.sin(angle) * (3 + Math.random() * 3));
    _particles.push({ mesh: m, vel, life: 0.4, maxLife: 0.4, type: 'shard', spin: 8 });
  }
}

// =====================================================================
//  MELEE TRAILS
// =====================================================================

const _trailPool = [];  // pooled trail meshes
const MAX_TRAIL_POSITIONS = 8;

/**
 * Create and register a weapon trail.
 * Returns a trail object to pass to _updateTrail() each frame.
 * color: hex; duration: fade time; width: ribbon half-width
 */
export function createWeaponTrail(color, duration = 0.22, width = 0.06) {
  const scene = ctx.scene;
  // We build a triangle-strip as a BufferGeometry with 2*MAX positions
  const N = MAX_TRAIL_POSITIONS;
  const positions = new Float32Array(N * 2 * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  // Build simple indices for a strip of quads
  const idx = [];
  for (let i = 0; i < N - 1; i++) {
    const b = i * 2;
    idx.push(b, b + 1, b + 2, b + 2, b + 1, b + 3);
  }
  geo.setIndex(idx);
  const mat = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.85,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  scene.add(mesh);

  const trail = {
    mesh, geo, mat, color, duration, width,
    points: [],    // last N tip-positions (THREE.Vector3)
    alive: true,
    _fadeTimer: 0,
    _fading: false,
  };
  return trail;
}

/**
 * Update trail each frame. Call with the current tip world position.
 * When stopRecording=true the trail fades out without new points.
 */
export function updateWeaponTrail(trail, tipPos, dt, stopRecording = false) {
  if (!trail || !trail.alive) return;
  if (!stopRecording) {
    // Push new sample
    trail.points.unshift(tipPos.clone());
    if (trail.points.length > MAX_TRAIL_POSITIONS) trail.points.pop();
  } else {
    trail._fading = true;
  }
  if (trail._fading) {
    trail._fadeTimer += dt;
    trail.mat.opacity = Math.max(0, 0.85 * (1 - trail._fadeTimer / trail.duration));
    if (trail._fadeTimer >= trail.duration) {
      _destroyWeaponTrail(trail);
      return;
    }
  }
  _rebuildTrailMesh(trail);
}

function _rebuildTrailMesh(trail) {
  const pts = trail.points;
  if (pts.length < 2) return;
  const pos = trail.geo.attributes.position;
  const arr = pos.array;
  const w = trail.width;
  const N = pts.length;
  for (let i = 0; i < N; i++) {
    const p = pts[i];
    // Compute a perpendicular in XZ
    let tx = 0, tz = 1;
    if (i < N - 1) { tx = pts[i + 1].x - p.x; tz = pts[i + 1].z - p.z; }
    else if (i > 0) { tx = p.x - pts[i - 1].x; tz = p.z - pts[i - 1].z; }
    const len = Math.sqrt(tx * tx + tz * tz) || 1;
    const nx = -tz / len, nz = tx / len;
    const fade = (N - 1 > 0) ? i / (N - 1) : 0;
    const wt = w * (1 - fade * 0.7);
    const base = i * 6;
    arr[base]     = p.x + nx * wt; arr[base + 1] = p.y; arr[base + 2] = p.z + nz * wt;
    arr[base + 3] = p.x - nx * wt; arr[base + 4] = p.y; arr[base + 5] = p.z - nz * wt;
  }
  pos.needsUpdate = true;
  trail.geo.setDrawRange(0, (pts.length - 1) * 6);
  trail.geo.computeBoundingSphere();
}

function _destroyWeaponTrail(trail) {
  if (!trail.alive) return;
  trail.alive = false;
  ctx.scene.remove(trail.mesh);
  trail.geo.dispose();
}

/**
 * Monk staff swing trail (gold ribbon).
 * Returns a trail object; caller must call updateWeaponTrail each tick.
 */
export function spawnMonkStaffTrail(isFinisher) {
  return createWeaponTrail(isFinisher ? 0xffd700 : 0xe8b84b, 0.22, isFinisher ? 0.1 : 0.06);
}

/**
 * Sister palm-strike — small cyan crescent arc flash (one-shot, not tracked per frame).
 * Called once on attack, auto-fades.
 */
export function spawnSisterPalmFlash(pos, facing) {
  const scene = ctx.scene;
  const col = 0x46d6e0;
  // A partial ring arc (crescent)
  const m = new THREE.Mesh(
    new THREE.RingGeometry(0.2, 0.45, 16, 1, 0, Math.PI * 1.4),
    new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  // Orient along facing direction
  const ang = Math.atan2(facing.x, facing.z);
  m.position.set(
    pos.x + facing.x * 0.8,
    pos.y + 1.1,
    pos.z + facing.z * 0.8);
  m.rotation.y = -ang;
  m.rotation.x = Math.PI / 2;
  scene.add(m);
  let t = 0;
  _fxEffects.push({
    timer: 0.25,
    tick: (dt) => {
      t += dt / 0.25;
      m.scale.setScalar(1 + t * 0.8);
      m.material.opacity = 0.9 * (1 - t);
    },
    cleanup: () => scene.remove(m),
  });
}

/**
 * Dragon lunge — element-colored ribbon along head path.
 * Returns a trail; caller feeds head world position per frame.
 */
export function spawnDragonLungeTrail(element) {
  const col = ELEMENT_COLORS[element] || 0xffffff;
  return createWeaponTrail(col, 0.3, 0.18);
}

// =====================================================================
//  BREATH / PROJECTILE V2
// =====================================================================

/** Fire breath — cone of additive ember sprites + bright core + point light, opens jaw */
export function spawnBreathAttack(player, element, dmg, range) {
  const scene = ctx.scene;
  const col = ELEMENT_COLORS[element];

  // Open dragon jaw if available
  const dm = player._dragonMeshes && player._dragonMeshes[element];
  if (dm && dm._jaw) {
    dm._jaw.rotation.x = 0.5; // open
    _fxTimers.push(setTimeout(() => {
      if (dm && dm._jaw) dm._jaw.rotation.x = 0;
    }, 600));
  }

  // Point light at mouth
  const fireLight = new THREE.PointLight(col, 4, 8);
  const mouthPos = player.pos.clone(); mouthPos.y = 1.2;
  fireLight.position.copy(mouthPos);
  scene.add(fireLight);
  _fxEffects.push({ timer: 0.5, tick: (dt) => { fireLight.intensity = Math.max(0, fireLight.intensity - dt * 8); }, cleanup: () => scene.remove(fireLight) });

  if (element === 'fire') {
    // Cone of ember projectiles + bright core
    for (let i = 0; i < 10; i++) {
      const isCore = i === 0;
      const spread = isCore ? 0 : (Math.random() - 0.5) * 1.0;
      const dir = player.facing.clone().normalize();
      dir.x += spread; dir.normalize();
      const m = new THREE.Mesh(
        isCore ? GEO.sphere8 : GEO.sphere4,
        new THREE.MeshBasicMaterial({ color: isCore ? 0xffff88 : (i % 2 ? 0xffc24b : 0xff6a2a),
          transparent: true, opacity: isCore ? 1.0 : 0.85,
          blending: THREE.AdditiveBlending, depthWrite: false }));
      m.scale.setScalar(isCore ? 0.32 : 0.18 + Math.random() * 0.12);
      const pos = player.pos.clone(); pos.y = 1.1;
      m.position.copy(pos);
      scene.add(m);
      _projectiles.push({ pos: pos.clone(), vel: dir.clone().multiplyScalar(10 + Math.random() * 4),
        mesh: m, life: 0.7 + Math.random() * 0.3, element, dmg, owner: 'player', _hits: new Set(),
        _embers: !isCore, _emberRise: Math.random() * 0.8 });
    }
  } else {
    // Other elements: fallback 8-projectile spread
    for (let i = 0; i < 8; i++) {
      const spread = (Math.random() - 0.5) * 0.8;
      const dir = player.facing.clone().normalize();
      dir.x += spread; dir.normalize();
      const m = new THREE.Mesh(GEO.sphere6,
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9,
          blending: THREE.AdditiveBlending, depthWrite: false }));
      m.scale.setScalar(0.25);
      const pos = player.pos.clone(); pos.y = 1;
      m.position.copy(pos);
      scene.add(m);
      _projectiles.push({ pos: pos.clone(), vel: dir.clone().multiplyScalar(12),
        mesh: m, life: 0.8, element, dmg, owner: 'player', _hits: new Set() });
    }
  }
}

/** Ice shard — crystalline elongated octahedron with frost trail */
export function spawnProjectile(player, element, dmg, speed, isDot = false, isKnockback = false) {
  const scene = ctx.scene;
  const col = ELEMENT_COLORS[element];

  if (element === 'ice') {
    // Crystalline elongated octahedron
    const m = new THREE.Mesh(GEO.oct,
      new THREE.MeshBasicMaterial({ color: 0xc8eeff, transparent: true, opacity: 0.92,
        blending: THREE.AdditiveBlending, depthWrite: false }));
    m.scale.set(0.2, 0.5, 0.2);
    const pos = player.pos.clone(); pos.y = 1.1;
    m.position.copy(pos);
    const facing = player.facing.clone().normalize();
    m.rotation.y = Math.atan2(facing.x, facing.z);
    scene.add(m);
    const proj = { pos: pos.clone(), vel: facing.multiplyScalar(speed),
      mesh: m, life: 2, element, dmg, owner: 'player', isDot, isKnockback, _hits: new Set(),
      _isShard: true, _trailAcc: 0 };
    _projectiles.push(proj);

    // Emissive glow sphere inside
    const glow = new THREE.Mesh(GEO.sphere4,
      new THREE.MeshBasicMaterial({ color: 0xa9e4ff, transparent: true, opacity: 0.7,
        blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.scale.setScalar(0.15);
    glow.position.copy(pos);
    scene.add(glow);
    _fxEffects.push({
      timer: 2.2,
      tick: () => { if (proj.life > 0) glow.position.copy(proj.pos); else glow.visible = false; },
      cleanup: () => scene.remove(glow),
    });

  } else if (element === 'poison') {
    // Glob with dripping particle trail
    const m = new THREE.Mesh(GEO.sphere8,
      new THREE.MeshBasicMaterial({ color: 0x7a3fb0, transparent: true, opacity: 0.88,
        blending: THREE.NormalBlending, depthWrite: false }));
    m.scale.setScalar(0.32);
    const pos = player.pos.clone(); pos.y = 1;
    m.position.copy(pos);
    scene.add(m);
    const proj = { pos: pos.clone(), vel: player.facing.clone().normalize().multiplyScalar(speed),
      mesh: m, life: 2, element, dmg, owner: 'player', isDot, isKnockback, _hits: new Set(),
      _isPoisonGlob: true, _dripAcc: 0 };
    _projectiles.push(proj);

  } else if (element === 'water') {
    // Layered additive streams — main bolt + 2 side streams
    for (let k = 0; k < 3; k++) {
      const col2 = k === 0 ? 0x4fe3ff : 0x46d6e0;
      const m = new THREE.Mesh(GEO.sphere6,
        new THREE.MeshBasicMaterial({ color: col2, transparent: true, opacity: k === 0 ? 0.9 : 0.6,
          blending: THREE.AdditiveBlending, depthWrite: false }));
      m.scale.set(0.18 - k * 0.04, 0.18 - k * 0.04, 0.38 - k * 0.06);
      const pos = player.pos.clone(); pos.y = 1 + k * 0.08;
      m.position.copy(pos);
      const facing = player.facing.clone().normalize();
      m.rotation.y = Math.atan2(facing.x, facing.z);
      scene.add(m);
      if (k === 0) {
        const proj = { pos: pos.clone(), vel: facing.clone().multiplyScalar(speed),
          mesh: m, life: 2, element, dmg, owner: 'player', isDot, isKnockback, _hits: new Set(),
          _isWaterBolt: true };
        _projectiles.push(proj);
      } else {
        // Side streams follow main proj but drift
        const drift = (k === 1 ? 0.15 : -0.15);
        const vel2 = facing.clone().multiplyScalar(speed);
        vel2.x += drift; vel2.normalize().multiplyScalar(speed);
        const proj2 = { pos: pos.clone(), vel: vel2, mesh: m, life: 1.6,
          element: 'neutral', dmg: 0, owner: 'player', _hits: new Set(), _isDeco: true };
        _projectiles.push(proj2);
      }
    }

  } else {
    // Generic
    const m = new THREE.Mesh(GEO.sphere6,
      new THREE.MeshBasicMaterial({ color: col }));
    m.scale.setScalar(0.3);
    const pos = player.pos.clone(); pos.y = 1;
    m.position.copy(pos);
    scene.add(m);
    _projectiles.push({ pos: pos.clone(), vel: player.facing.clone().normalize().multiplyScalar(speed),
      mesh: m, life: 2, element, dmg, owner: 'player', isDot, isKnockback, _hits: new Set() });
  }
}

// =====================================================================
//  FIRE TRAIL, FROST NOVA, TOXIC CLOUD, HEALING
// =====================================================================
export function spawnFireTrail(startPos, dir, length) {
  const scene = ctx.scene;
  for (let i = 0; i < 6; i++) {
    const p = startPos.clone().addScaledVector(dir, i * length / 6);
    p.y = 0.1;
    const m = new THREE.Mesh(GEO.ring16,
      new THREE.MeshBasicMaterial({ color: 0xff4400, transparent: true, opacity: 0.7,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2;
    m.position.copy(p);
    m.scale.setScalar(0.8);
    scene.add(m);
    ctx.gameState.spirits.forEach(s => {
      if (s.alive && s.pos.distanceTo(p) < 1.5) s.takeDamage(8, 'fire');
    });
    let t = 0;
    _fxEffects.push({
      timer: 1.5,
      tick: (dt) => { t += dt / 1.5; m.material.opacity = 0.7 * (1 - t); },
      cleanup: () => scene.remove(m),
    });
  }
}

export function spawnFrostNova(pos) {
  try { sfx.frostNova(); } catch {}
  const scene = ctx.scene;
  // Expanding ice ring
  const m = new THREE.Mesh(GEO.ring24,
    new THREE.MeshBasicMaterial({ color: 0x88ddff, transparent: true, opacity: 0.8,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  m.rotation.x = -Math.PI / 2;
  m.position.copy(pos); m.position.y = 0.1;
  scene.add(m);
  let t = 0;
  _fxEffects.push({
    timer: 0.6,
    tick: (dt) => { t += dt / 0.6; m.scale.setScalar(6 * t); m.material.opacity = 0.8 * (1 - t); },
    cleanup: () => scene.remove(m),
  });

  // Ground frost patch (flat circle, fades over 3s)
  const frost = new THREE.Mesh(
    new THREE.CircleGeometry(4, 16),
    new THREE.MeshBasicMaterial({ color: 0xb0e8ff, transparent: true, opacity: 0.35,
      depthWrite: false, side: THREE.DoubleSide }));
  frost.rotation.x = -Math.PI / 2;
  frost.position.copy(pos); frost.position.y = 0.05;
  scene.add(frost);
  _fxEffects.push({
    timer: 3,
    tick: (dt) => { frost.material.opacity = Math.max(0, frost.material.opacity - dt * 0.12); },
    cleanup: () => scene.remove(frost),
  });

  // Ice shard particles bursting outward
  for (let i = 0; i < 12; i++) {
    const shard = new THREE.Mesh(GEO.oct,
      new THREE.MeshBasicMaterial({ color: 0xdcefff, transparent: true, opacity: 0.9,
        blending: THREE.AdditiveBlending, depthWrite: false }));
    shard.scale.set(0.07, 0.18, 0.07);
    shard.position.copy(pos); shard.position.y = 0.5;
    scene.add(shard);
    const angle = (i / 12) * Math.PI * 2;
    _particles.push({ mesh: shard, vel: new THREE.Vector3(Math.cos(angle) * 6, 3 + Math.random() * 2, Math.sin(angle) * 6), life: 0.5, maxLife: 0.5, type: 'iceshard', spin: 6 });
  }
}

export function spawnToxicCloud(pos) {
  const scene = ctx.scene;
  pos = pos.clone(); pos.y = 0.5;
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(2.5, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0x44aa00, transparent: true, opacity: 0.4,
      depthWrite: false }));
  m.position.copy(pos);
  scene.add(m);
  let tickAccum = 0;
  _fxEffects.push({
    timer: 5,
    tick: (dt) => {
      tickAccum += dt;
      if (tickAccum >= 1) {
        tickAccum -= 1;
        ctx.gameState.spirits.forEach(s => {
          if (s.alive && s.pos.distanceTo(pos) < 2.5) s.takeDamage(6, 'poison');
        });
        // Bubbling particle
        const bub = new THREE.Mesh(GEO.sphere4,
          new THREE.MeshBasicMaterial({ color: 0x7fe05a, transparent: true, opacity: 0.7,
            blending: THREE.AdditiveBlending, depthWrite: false }));
        bub.scale.setScalar(0.12 + Math.random() * 0.1);
        bub.position.set(pos.x + (Math.random() - 0.5) * 2.5, pos.y, pos.z + (Math.random() - 0.5) * 2.5);
        scene.add(bub);
        _particles.push({ mesh: bub, vel: new THREE.Vector3(0, 1.5 + Math.random(), 0), life: 0.8, maxLife: 0.8, type: 'bubble', gravity: false });
      }
    },
    cleanup: () => scene.remove(m),
  });
}

export function spawnHealingRain(pos) {
  const scene = ctx.scene;
  for (let i = 0; i < 20; i++) {
    const drop = new THREE.Mesh(GEO.sphere4,
      new THREE.MeshBasicMaterial({ color: 0x00aaff, transparent: true, opacity: 0.8,
        blending: THREE.AdditiveBlending, depthWrite: false }));
    drop.scale.setScalar(0.08);
    const startY = 6 + Math.random() * 3;
    drop.position.set(pos.x + (Math.random() - 0.5) * 6, startY, pos.z + (Math.random() - 0.5) * 6);
    scene.add(drop);
    const vy = -(5 + Math.random() * 3);
    let alive = true;
    _fxEffects.push({
      timer: startY / Math.abs(vy) + 0.5,
      tick: (dt) => {
        if (!alive) return;
        drop.position.y += vy * dt;
        if (drop.position.y < 0) {
          alive = false; scene.remove(drop);
          // Splash ring
          _spawnGroundRing({ x: drop.position.x, y: 0, z: drop.position.z }, 0x46d6e0, 0.3, 0.4);
        }
      },
      cleanup: () => { if (alive) { alive = false; scene.remove(drop); } },
    });
  }
}

export function spawnHealRing(pos) {
  const scene = ctx.scene;
  // Expanding green ring
  const m = new THREE.Mesh(GEO.ring24,
    new THREE.MeshBasicMaterial({ color: 0x44ff88, transparent: true, opacity: 0.6,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  m.rotation.x = -Math.PI / 2;
  m.position.copy(pos); m.position.y = 0.1;
  scene.add(m);
  let t = 0;
  _fxEffects.push({
    timer: 0.7,
    tick: (dt) => { t += dt / 0.7; m.scale.setScalar(8 * t); m.material.opacity = 0.6 * (1 - t); },
    cleanup: () => scene.remove(m),
  });

  // Rising leaf/petal motes
  for (let i = 0; i < 8; i++) {
    const petal = new THREE.Mesh(GEO.sphere4,
      new THREE.MeshBasicMaterial({ color: 0x88ffcc, transparent: true, opacity: 0.9,
        blending: THREE.AdditiveBlending, depthWrite: false }));
    petal.scale.setScalar(0.08);
    const offset = (Math.random() - 0.5) * 2;
    petal.position.set(pos.x + offset, 0.2, pos.z + (Math.random() - 0.5) * 2);
    scene.add(petal);
    _particles.push({ mesh: petal, vel: new THREE.Vector3(offset * 0.3, 2 + Math.random() * 1.5, 0), life: 1.0, maxLife: 1.0, type: 'petal', gravity: false });
  }
}

export function applyVenomDot(spirit) {
  if (!spirit.alive) return;
  if (spirit._venomDotActive) { spirit._venomDotTimer = 5; return; }
  spirit._venomDotActive = true;
  spirit._venomDotTimer = 5;
  spirit._venomDotAccum = 0;
  const entry = { timer: 5, tick: null, cleanup: null };
  entry.tick = (dt) => {
    if (!spirit.alive || spirit._venomDotTimer <= 0) { entry.timer = 0; return; }
    spirit._venomDotTimer -= dt;
    spirit._venomDotAccum += dt;
    if (spirit._venomDotAccum >= 1) { spirit._venomDotAccum -= 1; spirit.takeDamage(6, 'poison'); }
    if (spirit._venomDotTimer <= 0) entry.timer = 0;
  };
  entry.cleanup = () => { spirit._venomDotActive = false; };
  _fxEffects.push(entry);
}

// =====================================================================
//  WATER BOLT RIPPLE RING ON IMPACT
// =====================================================================
export function spawnWaterImpactRipple(pos) {
  for (let ring = 0; ring < 3; ring++) {
    const delay = ring * 0.07;
    _fxTimers.push(setTimeout(() => {
      _spawnGroundRing(pos, 0x4fe3ff, 0.4, 1.2 + ring * 0.5);
      // Droplet spray particles
      for (let i = 0; i < 4; i++) {
        const drop = new THREE.Mesh(GEO.sphere4,
          new THREE.MeshBasicMaterial({ color: 0x46d6e0, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
        drop.scale.setScalar(0.07);
        drop.position.copy(pos); drop.position.y = 0.3;
        ctx.scene.add(drop);
        const angle = (i / 4) * Math.PI * 2 + Math.random();
        _particles.push({ mesh: drop, vel: new THREE.Vector3(Math.cos(angle) * 3, 2 + Math.random() * 2, Math.sin(angle) * 3), life: 0.4, maxLife: 0.4, type: 'waterdrop' });
      }
    }, delay * 1000));
  }
}

// =====================================================================
//  DEMON TELEGRAPH DECALS
// =====================================================================
/**
 * Spawn a ground decal ring/arc under a demon during wind-up.
 * Returns the decal object to store on spirit._telegraphDecal.
 */
export function spawnTelegraphDecal(spirit) {
  const scene = ctx.scene;
  const element = spirit.element || 'neutral';
  const col = _telegraphColor(element);

  // Flat ring on floor, grows during wind-up
  const m = new THREE.Mesh(
    new THREE.RingGeometry(0.8, 1.3, 20),
    new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.0,
      depthWrite: false, side: THREE.DoubleSide }));
  m.rotation.x = -Math.PI / 2;
  m.position.set(spirit.pos.x, 0.06, spirit.pos.z);
  scene.add(m);

  // Inner warning dot
  const inner = new THREE.Mesh(
    new THREE.CircleGeometry(0.8, 20),
    new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.0,
      depthWrite: false, side: THREE.DoubleSide }));
  inner.rotation.x = -Math.PI / 2;
  inner.position.set(spirit.pos.x, 0.07, spirit.pos.z);
  scene.add(inner);

  const decal = { ring: m, inner, t: 0, alive: true };
  return decal;
}

export function updateTelegraphDecal(decal, spirit, progress) {
  // progress 0→1 over TELEGRAPH_DURATION
  if (!decal || !decal.alive) return;
  const t = Math.min(1, progress);
  decal.t = t;
  // Follow spirit
  decal.ring.position.x = spirit.pos.x;
  decal.ring.position.z = spirit.pos.z;
  decal.inner.position.x = spirit.pos.x;
  decal.inner.position.z = spirit.pos.z;
  // Scale up: 0.2 → 1.2
  const s = 0.2 + t * 1.0;
  decal.ring.scale.setScalar(s);
  decal.inner.scale.setScalar(s * 0.7);
  // Pulse opacity
  const pulse = 0.5 + Math.sin(t * Math.PI * 4) * 0.3;
  decal.ring.material.opacity = t * 0.9 * pulse;
  decal.inner.material.opacity = t * 0.35 * pulse;
}

export function removeTelegraphDecal(decal) {
  if (!decal || !decal.alive) return;
  decal.alive = false;
  ctx.scene.remove(decal.ring);
  ctx.scene.remove(decal.inner);
}

function _telegraphColor(element) {
  const map = { fire: 0xff3300, ice: 0x88ddff, water: 0x00aaff, poison: 0x88ff44, neutral: 0xff4400 };
  return map[element] || 0xff4400;
}

// =====================================================================
//  DEMON DEATH DISSOLVES (per type)
// =====================================================================
export function spawnDemonDeathDissolve(pos, demonType, element) {
  try { sfx.demonDeath(demonType); } catch {}
  const scene = ctx.scene;
  const { DEMON_DEATH_TINT } = { DEMON_DEATH_TINT: { neutral: 0x4a3f5e, ice: 0xa9e4ff, water: 0x4fe3ff, poison: 0x7fe05a, fire: 0xff6a2a } };
  const tint = DEMON_DEATH_TINT[element] || 0xffffff;

  if (demonType === 'shadowling') {
    // Smoke-puff: dark spheres scale-up + fade
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(GEO.sphere8,
        new THREE.MeshBasicMaterial({ color: 0x2a2436, transparent: true, opacity: 0.7, depthWrite: false }));
      m.scale.setScalar(0.15);
      m.position.set(pos.x + (Math.random() - 0.5) * 0.5, pos.y + Math.random() * 0.5, pos.z + (Math.random() - 0.5) * 0.5);
      scene.add(m);
      const targS = 0.4 + Math.random() * 0.6;
      const duration = 0.5 + Math.random() * 0.4;
      let t = 0;
      _fxEffects.push({
        timer: duration,
        tick: (dt) => {
          t += dt / duration;
          m.scale.setScalar(targS * t);
          m.material.opacity = 0.7 * (1 - t * t);
        },
        cleanup: () => scene.remove(m),
      });
    }

  } else if (demonType === 'frostimp') {
    // Ice-shatter: shard particles falling with gravity
    for (let i = 0; i < 16; i++) {
      const m = new THREE.Mesh(GEO.oct,
        new THREE.MeshBasicMaterial({ color: i % 2 ? 0xdcefff : 0xa9e4ff, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.scale.set(0.06, 0.15, 0.06);
      m.position.set(pos.x + (Math.random() - 0.5) * 0.6, pos.y + 0.5, pos.z + (Math.random() - 0.5) * 0.6);
      scene.add(m);
      const angle = (i / 16) * Math.PI * 2 + Math.random();
      _particles.push({ mesh: m, vel: new THREE.Vector3(Math.cos(angle) * (2 + Math.random() * 3), 4 + Math.random() * 2, Math.sin(angle) * (2 + Math.random() * 3)), life: 0.8, maxLife: 0.8, type: 'iceshard', spin: 8 });
    }
    // Flash ring
    _spawnBurstFlash(pos.clone(), 0xa9e4ff, 1.2, 0.25);

  } else if (demonType === 'tidewraith') {
    // Water-pour: blue droplets raining down
    for (let i = 0; i < 20; i++) {
      const m = new THREE.Mesh(GEO.sphere4,
        new THREE.MeshBasicMaterial({ color: i % 2 ? 0x4fe3ff : 0x46d6e0, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.scale.setScalar(0.08 + Math.random() * 0.06);
      m.position.set(pos.x + (Math.random() - 0.5) * 0.8, pos.y + 0.5 + Math.random() * 1.5, pos.z + (Math.random() - 0.5) * 0.8);
      scene.add(m);
      _particles.push({ mesh: m, vel: new THREE.Vector3((Math.random() - 0.5) * 2, -1 + Math.random() * 3, (Math.random() - 0.5) * 2), life: 0.9, maxLife: 0.9, type: 'waterdrop' });
    }
    _spawnBurstFlash(pos.clone(), 0x4fe3ff, 1.0, 0.2);

  } else if (demonType === 'venomoni') {
    // Vapor-burst: green clouds
    for (let i = 0; i < 12; i++) {
      const m = new THREE.Mesh(GEO.sphere8,
        new THREE.MeshBasicMaterial({ color: i % 2 ? 0x7fe05a : 0xa45cff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.scale.setScalar(0.2);
      m.position.set(pos.x + (Math.random() - 0.5) * 0.8, pos.y + Math.random() * 0.8, pos.z + (Math.random() - 0.5) * 0.8);
      scene.add(m);
      const targS = 0.5 + Math.random() * 0.7;
      const dur = 0.6 + Math.random() * 0.5;
      let t = 0;
      _fxEffects.push({
        timer: dur,
        tick: (dt) => { t += dt / dur; m.scale.setScalar(targS * (0.5 + t * 0.5)); m.material.opacity = 0.6 * (1 - t); },
        cleanup: () => scene.remove(m),
      });
    }
    _spawnBurstFlash(pos.clone(), 0x7fe05a, 1.4, 0.3);

  } else if (demonType === 'infernolord') {
    // Charcoal-crumble + ember swirl finale (bigger, slower, theatrical)
    // Dark crumble chunks
    for (let i = 0; i < 20; i++) {
      const m = new THREE.Mesh(GEO.oct,
        new THREE.MeshBasicMaterial({ color: i % 3 ? 0x2a1c1c : (i % 3 === 1 ? 0x7a1a12 : 0xff6a2a), transparent: true, opacity: 1, depthWrite: false }));
      m.scale.set(0.12, 0.08 + Math.random() * 0.12, 0.12);
      m.position.set(pos.x + (Math.random() - 0.5) * 1.5, pos.y + Math.random() * 2, pos.z + (Math.random() - 0.5) * 1.5);
      scene.add(m);
      _particles.push({ mesh: m, vel: new THREE.Vector3((Math.random() - 0.5) * 5, 2 + Math.random() * 5, (Math.random() - 0.5) * 5), life: 1.5, maxLife: 1.5, type: 'chunk', spin: 4 });
    }
    // Ember swirl: orbiting embers
    for (let i = 0; i < 16; i++) {
      const ember = new THREE.Mesh(GEO.sphere4,
        new THREE.MeshBasicMaterial({ color: i % 2 ? 0xffc24b : 0xff6a2a, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }));
      ember.scale.setScalar(0.08 + Math.random() * 0.06);
      ember.position.copy(pos);
      scene.add(ember);
      const angle0 = (i / 16) * Math.PI * 2;
      const radius = 0.5 + Math.random() * 1.0;
      const riseSpeed = 1.5 + Math.random() * 2;
      let phase = angle0, riseY = pos.y;
      const dur2 = 1.5 + Math.random() * 0.8;
      let t2 = 0;
      _fxEffects.push({
        timer: dur2,
        tick: (dt) => {
          t2 += dt / dur2;
          phase += dt * (3 + Math.random());
          riseY += dt * riseSpeed;
          ember.position.set(pos.x + Math.cos(phase) * radius * (1 - t2 * 0.5), riseY, pos.z + Math.sin(phase) * radius * (1 - t2 * 0.5));
          ember.material.opacity = 1 - t2;
        },
        cleanup: () => scene.remove(ember),
      });
    }
    // Big burst flash + scorch ring
    _spawnBurstFlash(pos.clone(), 0xff6a2a, 2.5, 0.4);
    _spawnGroundRing(pos, 0xff6a2a, 1.5, 3.0);
  }
}

// =====================================================================
//  TRANSFORMATION V2 (sister transform + shockwave)
// =====================================================================
export function spawnTransformPillar(player, toForm) {
  const scene = ctx.scene;
  const col = ELEMENT_COLORS[toForm] || 0xffffff;
  const pos = player.pos.clone();

  // White CSS screen flash (80ms)
  const flashEl = document.createElement('div');
  const side = player.id === 1 ? '0' : '50%';
  flashEl.style.cssText = `position:fixed;top:0;left:${side};width:50%;height:100%;background:rgba(255,255,255,0.7);pointer-events:none;z-index:90;animation:toastOut 0.08s ease-in forwards;`;
  document.body.appendChild(flashEl);
  _fxTimers.push(setTimeout(() => flashEl.remove(), 120));

  // Vertical light pillar (additive cylinder)
  _spawnLightPillar(pos, col, 5.0, 0.55);

  // Petal/element swirl: 12 orbiting particles
  for (let i = 0; i < 12; i++) {
    const orb = new THREE.Mesh(GEO.sphere4,
      new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    orb.scale.setScalar(0.1 + Math.random() * 0.06);
    orb.position.copy(pos);
    scene.add(orb);
    const angle0 = (i / 12) * Math.PI * 2;
    const radius = 0.6 + Math.random() * 0.6;
    const riseSpeed = 1.5 + Math.random() * 1.5;
    let phase = angle0, riseY = 0.3;
    const dur = 0.6 + Math.random() * 0.3;
    let t = 0;
    _fxEffects.push({
      timer: dur,
      tick: (dt) => {
        t += dt / dur;
        phase += dt * 6;
        riseY += dt * riseSpeed;
        orb.position.set(pos.x + Math.cos(phase) * radius * (1 - t * 0.4), riseY, pos.z + Math.sin(phase) * radius * (1 - t * 0.4));
        orb.material.opacity = (1 - t);
      },
      cleanup: () => scene.remove(orb),
    });
  }

  // Shockwave ring on dragon emerge
  _fxTimers.push(setTimeout(() => {
    _spawnGroundRing(pos, col, 0.45, 4.0);
    _spawnBurstFlash(pos.clone(), col, 1.8, 0.25);
    ctx.impactLight.color.setHex(col);
    ctx.impactLight.intensity = 5;
    _fxTimers.push(setTimeout(() => { ctx.impactLight.intensity = 0; }, 300));
  }, 150));
}

// =====================================================================
//  CHI SHIELD v2 — hexagonal-pattern bubble
// =====================================================================
export function buildChiShieldMesh(pos) {
  const scene = ctx.scene;

  // Canvas hexagonal pattern texture
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d');
  x.clearRect(0, 0, 256, 256);
  // Draw hex grid
  const hex = (cx, cy, r) => {
    x.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 6;
      const nx = cx + Math.cos(a) * r, ny = cy + Math.sin(a) * r;
      i === 0 ? x.moveTo(nx, ny) : x.lineTo(nx, ny);
    }
    x.closePath();
  };
  x.strokeStyle = 'rgba(255,220,80,0.8)'; x.lineWidth = 2;
  const hr = 28;
  for (let row = -1; row < 5; row++) {
    for (let col2 = -1; col2 < 5; col2++) {
      const cx = col2 * hr * 1.73 + (row % 2 ? hr * 0.87 : 0) + 14;
      const cy = row * hr * 1.5 + 14;
      hex(cx, cy, hr * 0.95);
      x.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.needsUpdate = true;

  const m = new THREE.Mesh(
    new THREE.SphereGeometry(3, 16, 12),
    new THREE.MeshBasicMaterial({ map: tex, color: 0xffdd55, transparent: true, opacity: 0.22,
      side: THREE.FrontSide, depthWrite: false }));
  m.position.copy(pos); m.position.y = 1;
  scene.add(m);
  return m;
}

/** Flash ripple on shield block */
export function spawnShieldImpactRipple(pos) {
  try { sfx.shieldBlock(); } catch {}
  _spawnBurstFlash(pos.clone(), 0xffdd55, 0.8, 0.2);
  _spawnGroundRing(pos, 0xffdd55, 0.25, 1.5);
}

// =====================================================================
//  MEDITATION AURA — orbiting lotus sprites
// =====================================================================
export function spawnMeditationLotus(playerPos, onTick) {
  const scene = ctx.scene;
  const lotusGroup = [];
  const COUNT = 3;
  for (let i = 0; i < COUNT; i++) {
    const orb = new THREE.Mesh(
      new THREE.CircleGeometry(0.12, 6),
      new THREE.MeshBasicMaterial({ color: 0xff88cc, transparent: true, opacity: 0.8,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    orb._phase = (i / COUNT) * Math.PI * 2;
    orb._radius = 0.8;
    orb._speed = 1.2;
    scene.add(orb);
    lotusGroup.push(orb);
  }
  const fxEntry = {
    timer: 999,
    tick: (dt) => {
      const pos = onTick();
      if (!pos) { fxEntry.timer = 0; return; }
      for (const orb of lotusGroup) {
        orb._phase += dt * orb._speed;
        orb.position.set(
          pos.x + Math.cos(orb._phase) * orb._radius,
          0.8 + Math.sin(orb._phase * 0.7) * 0.3,
          pos.z + Math.sin(orb._phase) * orb._radius);
        orb.rotation.y = -orb._phase;
        orb.material.opacity = 0.6 + Math.sin(orb._phase * 2) * 0.25;
      }
    },
    cleanup: () => { lotusGroup.forEach(o => scene.remove(o)); },
  };
  return fxEntry;
}

// =====================================================================
//  PROJECTILE UPDATES (extended for V2 effects)
// =====================================================================
export function updateProjectiles(dt) {
  const scene = ctx.scene;
  for (let i = _projectiles.length - 1; i >= 0; i--) {
    const proj = _projectiles[i];
    proj.pos.addScaledVector(proj.vel, dt);
    proj.mesh.position.copy(proj.pos);
    proj.life -= dt;

    // Ember rise for fire breath
    if (proj._embers) {
      proj.mesh.position.y += proj._emberRise * dt * 0.5;
      proj.mesh.material.opacity = Math.max(0, proj.life / 0.7);
    }

    // Ice shard spin + frost trail
    if (proj._isShard) {
      proj.mesh.rotation.x += dt * 4;
      proj.mesh.rotation.z += dt * 3;
      proj._trailAcc = (proj._trailAcc || 0) + dt;
      if (proj._trailAcc > 0.05) {
        proj._trailAcc = 0;
        const frost = new THREE.Mesh(GEO.sphere4,
          new THREE.MeshBasicMaterial({ color: 0xa9e4ff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
        frost.scale.setScalar(0.08);
        frost.position.copy(proj.pos);
        scene.add(frost);
        _particles.push({ mesh: frost, vel: new THREE.Vector3(0, 0.2, 0), life: 0.3, maxLife: 0.3, type: 'frosttrail', gravity: false });
      }
    }

    // Poison glob drip trail
    if (proj._isPoisonGlob) {
      proj._dripAcc = (proj._dripAcc || 0) + dt;
      if (proj._dripAcc > 0.06) {
        proj._dripAcc = 0;
        const drip = new THREE.Mesh(GEO.sphere4,
          new THREE.MeshBasicMaterial({ color: 0x7fe05a, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
        drip.scale.setScalar(0.06);
        drip.position.copy(proj.pos);
        scene.add(drip);
        _particles.push({ mesh: drip, vel: new THREE.Vector3(0, -1, 0), life: 0.4, maxLife: 0.4, type: 'poisondrip', gravity: false });
      }
    }

    if (proj.owner === 'player' && !proj._isDeco) {
      ctx.gameState.spirits.forEach(s => {
        if (!s.alive) return;
        if (proj._hits.has(s)) return;
        if (s.pos.distanceTo(proj.pos) < 1.2) {
          proj._hits.add(s);
          const mult = s.takeDamage(proj.dmg, proj.element);
          const isDouble = mult >= 2;
          spawnHitSparks(proj.pos.clone(), proj.element, isDouble);
          if (proj._isWaterBolt) spawnWaterImpactRipple(proj.pos.clone());
          if (proj.isKnockback) knockback(s, proj.pos, 3);
          if (proj.isDot) applyVenomDot(s);
          if (!proj.isDot && !proj._embers) { proj.life = 0; }
        }
      });
    }

    if (proj.life <= 0) {
      scene.remove(proj.mesh);
      _projectiles.splice(i, 1);
    }
  }
}

function knockback(spirit, fromPos, force) {
  const dir = new THREE.Vector3().subVectors(spirit.pos, fromPos).normalize();
  dir.y = 0;
  spirit.pos.addScaledVector(dir, force);
  spirit.pos.x = THREE.MathUtils.clamp(spirit.pos.x, -ARENA_SIZE + 2, ARENA_SIZE - 2);
  spirit.pos.z = THREE.MathUtils.clamp(spirit.pos.z, -ARENA_SIZE + 2, ARENA_SIZE - 2);
}

// =====================================================================
//  CELEBRATION
// =====================================================================
export function spawnGoldCelebration() {
  const scene = ctx.scene;
  for (let i = 0; i < 50; i++) {
    _fxTimers.push(setTimeout(() => {
      const m = new THREE.Mesh(GEO.sphere4,
        new THREE.MeshBasicMaterial({ color: 0xffdd00, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.scale.setScalar(0.15);
      m.position.set((Math.random() - 0.5) * 20, 0.5, (Math.random() - 0.5) * 20);
      scene.add(m);
      const vel = new THREE.Vector3((Math.random() - 0.5) * 4, 5 + Math.random() * 5, (Math.random() - 0.5) * 4);
      _particles.push({ mesh: m, vel, life: 2, maxLife: 2, type: 'celebration' });
    }, i * 60));
  }
}
