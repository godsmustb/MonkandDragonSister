// src/combat/projectiles.js — projectile pool, breath/FX spawn, _fxEffects/_fxTimers
import * as THREE from 'three';
import { ctx } from '../state.js';
import { ELEMENT_COLORS, ARENA_SIZE } from '../config.js';

// ---- Module-scope registries ----
export const _projectiles = [];
export const _fxEffects   = [];
export const _fxTimers    = [];
export const _particles   = [];

// ---- FX timer/effect management ----

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

// ---- Particles ----

export function spawnDeathParticles(pos, color) {
  const scene = ctx.scene;
  for (let i = 0; i < 16; i++) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 4, 4),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 })
    );
    mesh.position.copy(pos);
    scene.add(mesh);
    const vel = new THREE.Vector3(
      (Math.random() - 0.5) * 8, Math.random() * 6 + 2, (Math.random() - 0.5) * 8
    );
    _particles.push({ mesh, vel, life: 1, maxLife: 1, type: 'death' });
  }
}

export function spawnTransformParticles(pos, color) {
  const scene = ctx.scene;
  for (let i = 0; i < 30; i++) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 4, 4),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 })
    );
    mesh.position.copy(pos);
    scene.add(mesh);
    const angle = (i / 30) * Math.PI * 2;
    const vel = new THREE.Vector3(Math.cos(angle) * 5, 4 + Math.random() * 3, Math.sin(angle) * 5);
    _particles.push({ mesh, vel, life: 1.5, maxLife: 1.5, type: 'transform' });
  }
}

export function updateParticles(dt) {
  for (let i = _particles.length - 1; i >= 0; i--) {
    const p = _particles[i];
    p.vel.y -= 9.8 * dt;
    p.mesh.position.addScaledVector(p.vel, dt);
    p.life -= dt;
    p.mesh.material.opacity = p.life / p.maxLife;
    if (p.life <= 0) {
      ctx.scene.remove(p.mesh);
      _particles.splice(i, 1);
    }
  }
}

// ---- Level-up flash ----

export function triggerLevelUpFlash(player) {
  const flashEl = document.createElement('div');
  flashEl.style.cssText = `position:fixed;top:0;left:${player.id === 1 ? '0' : '50%'};width:50%;height:100%;background:rgba(255,220,0,0.3);pointer-events:none;z-index:80;animation:toastOut 0.6s ease-in forwards;`;
  document.body.appendChild(flashEl);
  _fxTimers.push(setTimeout(() => flashEl.remove(), 700));
}

// ---- Ability spawn functions ----

export function spawnBreathAttack(player, element, dmg, range) {
  const scene = ctx.scene;
  const col = ELEMENT_COLORS[element];
  for (let i = 0; i < 8; i++) {
    const spread = (Math.random() - 0.5) * 0.8;
    const dir = player.facing.clone().normalize();
    dir.x += spread; dir.normalize();
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.25, 4, 4),
      new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9 })
    );
    const pos = player.pos.clone(); pos.y = 1;
    mesh.position.copy(pos);
    scene.add(mesh);
    _projectiles.push({ pos: pos.clone(), vel: dir.clone().multiplyScalar(12), mesh, life: 0.8, element, dmg, owner: 'player', _hits: new Set() });
  }
}

export function spawnProjectile(player, element, dmg, speed, isDot = false, isKnockback = false) {
  const scene = ctx.scene;
  const col = ELEMENT_COLORS[element];
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 6, 4),
    new THREE.MeshBasicMaterial({ color: col })
  );
  const pos = player.pos.clone(); pos.y = 1;
  mesh.position.copy(pos);
  scene.add(mesh);
  _projectiles.push({
    pos: pos.clone(), vel: player.facing.clone().normalize().multiplyScalar(speed),
    mesh, life: 2, element, dmg, owner: 'player', isDot, isKnockback, _hits: new Set(),
  });
}

export function spawnFireTrail(startPos, dir, length) {
  const scene = ctx.scene;
  for (let i = 0; i < 6; i++) {
    const p = startPos.clone().addScaledVector(dir, i * length / 6);
    p.y = 0.1;
    const mesh = new THREE.Mesh(
      new THREE.CircleGeometry(0.6, 6),
      new THREE.MeshBasicMaterial({ color: 0xff4400, transparent: true, opacity: 0.7 })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.copy(p);
    scene.add(mesh);
    ctx.gameState.spirits.forEach(s => {
      if (s.alive && s.pos.distanceTo(p) < 1.5) s.takeDamage(8, 'fire');
    });
    _fxEffects.push({
      timer: 1.5,
      tick: null,
      cleanup: () => { scene.remove(mesh); },
    });
  }
}

export function spawnFrostNova(pos) {
  const scene = ctx.scene;
  const mesh = new THREE.Mesh(
    new THREE.RingGeometry(0, 6, 24),
    new THREE.MeshBasicMaterial({ color: 0x88ddff, transparent: true, opacity: 0.7, side: THREE.DoubleSide })
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.copy(pos); mesh.position.y = 0.1;
  scene.add(mesh);
  let t = 0;
  const expand = () => {
    t += 0.05; mesh.scale.setScalar(t); mesh.material.opacity = 0.7 * (1 - t);
    if (t < 1) requestAnimationFrame(expand); else scene.remove(mesh);
  };
  requestAnimationFrame(expand);
}

export function spawnToxicCloud(pos) {
  const scene = ctx.scene;
  pos = pos.clone(); pos.y = 0.5;
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(2.5, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0x44aa00, transparent: true, opacity: 0.4 })
  );
  mesh.position.copy(pos);
  scene.add(mesh);
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
      }
    },
    cleanup: () => { scene.remove(mesh); },
  });
}

export function spawnHealingRain(pos) {
  const scene = ctx.scene;
  for (let i = 0; i < 20; i++) {
    const drop = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 4, 4),
      new THREE.MeshBasicMaterial({ color: 0x00aaff, transparent: true, opacity: 0.8 })
    );
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
        if (drop.position.y < 0) { alive = false; scene.remove(drop); }
      },
      cleanup: () => { if (alive) { alive = false; scene.remove(drop); } },
    });
  }
}

export function spawnHealRing(pos) {
  const scene = ctx.scene;
  const mesh = new THREE.Mesh(
    new THREE.RingGeometry(0, 8, 24),
    new THREE.MeshBasicMaterial({ color: 0x44ff88, transparent: true, opacity: 0.6, side: THREE.DoubleSide })
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.copy(pos); mesh.position.y = 0.1;
  scene.add(mesh);
  let s = 0;
  const grow = () => {
    s += 0.04; mesh.scale.setScalar(s); mesh.material.opacity = 0.6 * (1 - s);
    if (s < 1) requestAnimationFrame(grow); else scene.remove(mesh);
  };
  requestAnimationFrame(grow);
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

export function updateProjectiles(dt) {
  const scene = ctx.scene;
  for (let i = _projectiles.length - 1; i >= 0; i--) {
    const proj = _projectiles[i];
    proj.pos.addScaledVector(proj.vel, dt);
    proj.mesh.position.copy(proj.pos);
    proj.life -= dt;

    if (proj.owner === 'player') {
      ctx.gameState.spirits.forEach(s => {
        if (!s.alive) return;
        if (proj._hits.has(s)) return;
        if (s.pos.distanceTo(proj.pos) < 1.2) {
          proj._hits.add(s);
          s.takeDamage(proj.dmg, proj.element);
          if (proj.isKnockback) knockback(s, proj.pos, 3);
          if (proj.isDot) applyVenomDot(s);
          if (!proj.isDot) { proj.life = 0; }
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

export function spawnGoldCelebration() {
  const scene = ctx.scene;
  for (let i = 0; i < 50; i++) {
    _fxTimers.push(setTimeout(() => {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.15, 4, 4),
        new THREE.MeshBasicMaterial({ color: 0xffdd00, transparent: true, opacity: 1 })
      );
      mesh.position.set((Math.random() - 0.5) * 20, 0.5, (Math.random() - 0.5) * 20);
      scene.add(mesh);
      const vel = new THREE.Vector3((Math.random() - 0.5) * 4, 5 + Math.random() * 5, (Math.random() - 0.5) * 4);
      _particles.push({ mesh, vel, life: 2, maxLife: 2, type: 'celebration' });
    }, i * 60));
  }
}
