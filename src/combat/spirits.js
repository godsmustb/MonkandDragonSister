// src/combat/spirits.js — Spirit, BossSpirit classes + wave spawn logic
import * as THREE from 'three';
import { ctx } from '../state.js';
import { ELEMENT_COLORS, ARENA_SIZE } from '../config.js';
import { getElementMult } from '../config.js';
import { spawnDeathParticles, _fxTimers } from './projectiles.js';
import { initMeleeAI, updateMeleeAI, xzDist, PURSUE_STOP_DIST } from './ai.js';

// Forward-declare: set by abilities.js after it imports us
// We store it here so Spirit can call it without a circular dep.
export let dealDamageToPlayer = null;
export function setDealDamageToPlayer(fn) { dealDamageToPlayer = fn; }
export let showDamageNumber = null;
export function setShowDamageNumber(fn) { showDamageNumber = fn; }

// ---- Shared toon helper (local, avoids re-importing builders to keep dep graph clean) ----
let _gradTex = null;
function _getGradTex() {
  if (_gradTex) return _gradTex;
  const gradData = new Uint8Array([80, 160, 255]);
  _gradTex = new THREE.DataTexture(gradData, 3, 1);
  _gradTex.needsUpdate = true;
  _gradTex.magFilter = THREE.NearestFilter;
  _gradTex.minFilter = THREE.NearestFilter;
  return _gradTex;
}
function toonMat(color, opts = {}) {
  return new THREE.MeshToonMaterial({ color, gradientMap: _getGradTex(), ...opts });
}
function addOutline(mesh, scaleFactor = 1.04) {
  const geo = mesh.geometry.clone ? mesh.geometry.clone() : mesh.geometry;
  const outlineMat = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide });
  const outline = new THREE.Mesh(geo, outlineMat);
  outline.scale.setScalar(scaleFactor);
  mesh.add(outline);
  return outline;
}

// Scratch vectors — reused in hot loops
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();

export class Spirit {
  constructor(element, pos, wave) {
    this.element = element;
    this.alive = true;
    this._wave = wave;
    this._isBoss = false;

    const baseHp = 20 + wave * 8;
    this.maxHp = baseHp;
    this.hp = baseHp;
    this.atk = 8 + wave * 1.5;
    this._baseSpeed = 2.5 + wave * 0.3;
    this.speed = this._baseSpeed;
    this._frozenTimer = 0;

    this.pos = pos.clone();
    this._vel = new THREE.Vector3();
    this._attackCd = 2 + Math.random();
    this._attackTimer = this._attackCd;
    this._bobPhase = Math.random() * Math.PI * 2;
    this._projectiles = [];

    this._buildMesh();
    this.mesh.position.copy(this.pos);
    ctx.scene.add(this.mesh);

    this._hpBar = this._makeHpBar();
    ctx.scene.add(this._hpBar);

    this._light = new THREE.PointLight(ELEMENT_COLORS[element], 0.6, 6);
    this._light.position.copy(pos);
    ctx.scene.add(this._light);

    // Melee AI state machine
    initMeleeAI(this);
    // dealDamageToPlayer will be set via the module-level variable when spirits.js fires
    // We store a thunk so ai.js doesn't import abilities.js (avoids circular dep)
    this._dealDmgFn = null; // wired up lazily in update()
  }

  _buildMesh() {
    const g = new THREE.Group();
    const col = ELEMENT_COLORS[this.element];
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 6), toonMat(col));
    body.castShadow = true;
    addOutline(body, 1.08);
    g.add(body);

    const aura = new THREE.Mesh(
      new THREE.SphereGeometry(0.75, 8, 6),
      new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.2, side: THREE.FrontSide })
    );
    g.add(aura);

    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    [-0.2, 0.2].forEach(ex => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 4, 4), eyeMat);
      eye.position.set(ex, 0.15, 0.55);
      g.add(eye);
    });

    this.mesh = g;
    this._aura = aura;
    this._body = body;
  }

  _makeHpBar() {
    const g = new THREE.Group();
    const bg = new THREE.Mesh(
      new THREE.PlaneGeometry(1.2, 0.12),
      new THREE.MeshBasicMaterial({ color: 0x220000 })
    );
    const fill = new THREE.Mesh(
      new THREE.PlaneGeometry(1.2, 0.12),
      new THREE.MeshBasicMaterial({ color: 0xff4444 })
    );
    fill.position.z = 0.001;
    g.add(bg);
    g.add(fill);
    g._fill = fill;
    return g;
  }

  updateHpBar(camera) {
    this._hpBar.position.copy(this.pos);
    this._hpBar.position.y += 1.4;
    this._hpBar.lookAt(camera.position);
    const pct = Math.max(0, this.hp / this.maxHp);
    this._hpBar._fill.scale.x = pct;
    this._hpBar._fill.position.x = (pct - 1) * 0.6;
  }

  update(dt, players) {
    if (!this.alive) return;

    // Wire up dealDamageToPlayer lazily (set by abilities.js after import)
    if (!this._dealDmgFn && dealDamageToPlayer) this._dealDmgFn = dealDamageToPlayer;

    if (this._frozenTimer > 0) {
      this._frozenTimer -= dt;
      if (this._frozenTimer <= 0) {
        this._frozenTimer = 0;
        this.speed = this._baseSpeed;
      } else {
        this._bobPhase += dt * 2;
        this.pos.y = 1.0 + Math.sin(this._bobPhase) * 0.2;
        this.mesh.position.copy(this.pos);
        this._light.position.copy(this.pos);
        return;
      }
    }

    this._bobPhase += dt * 2;
    this.pos.y = 1.0 + Math.sin(this._bobPhase) * 0.2;
    this.mesh.position.copy(this.pos);
    this._light.position.copy(this.pos);

    // Find nearest living player (XZ distance)
    let nearest = null, nearXZDist = Infinity;
    players.forEach(p => {
      if (p.hp <= 0 || p.isKO) return;
      const d = xzDist(this, p);
      if (d < nearXZDist) { nearXZDist = d; nearest = p; }
    });

    // Melee state machine (handles all movement + damage for melee spirits)
    updateMeleeAI(this, dt, nearest, nearXZDist);

    this.pos.x = THREE.MathUtils.clamp(this.pos.x, -ARENA_SIZE + 2, ARENA_SIZE - 2);
    this.pos.z = THREE.MathUtils.clamp(this.pos.z, -ARENA_SIZE + 2, ARENA_SIZE - 2);

    // Ranged attack (wave 3+ projectiles) — separate from melee
    this._attackTimer -= dt;
    if (this._attackTimer <= 0 && nearest && nearXZDist < 20) {
      this._attackTimer = this._attackCd;
      this._doAttack(nearest);
    }

    for (let i = this._projectiles.length - 1; i >= 0; i--) {
      const proj = this._projectiles[i];
      proj.pos.addScaledVector(proj.vel, dt);
      proj.mesh.position.copy(proj.pos);
      proj.life -= dt;
      players.forEach(p => {
        if (p.shieldActive) return;
        const d = p.pos.distanceTo(proj.pos);
        if (d < 1.0 && !proj._hit) {
          proj._hit = true;
          if (dealDamageToPlayer) dealDamageToPlayer(p, this.atk, this.element);
        }
      });
      if (proj.life <= 0 || proj._hit) {
        ctx.scene.remove(proj.mesh);
        this._projectiles.splice(i, 1);
      }
    }
  }

  _doAttack(target) {
    if (this._wave >= 3) {
      const projMesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.2, 4, 4),
        new THREE.MeshBasicMaterial({ color: ELEMENT_COLORS[this.element] })
      );
      const startPos = this.pos.clone(); startPos.y = 1;
      projMesh.position.copy(startPos);
      ctx.scene.add(projMesh);
      const dir = new THREE.Vector3().subVectors(target.pos, startPos).normalize();
      this._projectiles.push({ pos: startPos.clone(), vel: dir.multiplyScalar(8), mesh: projMesh, life: 3, _hit: false });
    }
  }

  takeDamage(amount, attackerElement) {
    const mult = getElementMult(attackerElement, this.element);
    const finalDmg = Math.max(1, Math.round(amount * mult));
    this.hp -= finalDmg;
    if (window.__game) window.__game.lastDamage = { amount: finalDmg, mult, attackerElement, targetElement: this.element };

    if (showDamageNumber) showDamageNumber(this.pos, finalDmg, attackerElement, mult);

    if (this._body && this._body.material && this._body.material.emissive !== undefined) {
      this._body.material.emissive = new THREE.Color(1, 1, 1);
      const _self = this;
      const tid = setTimeout(() => { if (_self._body && _self._body.material) _self._body.material.emissive = new THREE.Color(0, 0, 0); }, 100);
      _fxTimers.push(tid);
    }

    if (this.hp <= 0) { this.die(); return mult; }
    return mult;
  }

  die() {
    this.alive = false;
    spawnDeathParticles(this.pos, ELEMENT_COLORS[this.element]);
    ctx.scene.remove(this.mesh);
    ctx.scene.remove(this._hpBar);
    ctx.scene.remove(this._light);
    this._projectiles.forEach(p => ctx.scene.remove(p.mesh));
    this._projectiles = [];
  }

  cleanup() {
    this.alive = false;
    if (this.mesh && this.mesh.parent) ctx.scene.remove(this.mesh);
    if (this._hpBar && this._hpBar.parent) ctx.scene.remove(this._hpBar);
    if (this._light && this._light.parent) ctx.scene.remove(this._light);
    if (this._projectiles) this._projectiles.forEach(p => { if (p.mesh && p.mesh.parent) ctx.scene.remove(p.mesh); });
    if (this._pools) this._pools.forEach(p => { if (p.mesh && p.mesh.parent) ctx.scene.remove(p.mesh); });
  }
}

export class BossSpirit extends Spirit {
  constructor(pos) {
    super('poison', pos, 4);
    this.maxHp = 250;
    this.hp = 250;
    this._isBoss = true;
    this.atk = 18;
    this._baseSpeed = 2.0;
    this.speed = 2.0;
    this._venomTimer = 5;
    this._addTimer = 15;
    this._pools = [];

    this.mesh.scale.setScalar(2.2);
    document.getElementById('boss-hp-bar').style.display = 'block';
  }

  update(dt, players) {
    super.update(dt, players);
    if (!this.alive) return;

    const pct = Math.max(0, this.hp / this.maxHp) * 100;
    document.getElementById('boss-hp-fill').style.width = pct + '%';

    this._venomTimer -= dt;
    if (this._venomTimer <= 0) {
      this._venomTimer = 6;
      this._spawnVenomPool();
    }

    for (let i = this._pools.length - 1; i >= 0; i--) {
      const pool = this._pools[i];
      pool.life -= dt;
      pool.tickTimer -= dt;
      if (pool.tickTimer <= 0) {
        pool.tickTimer = 1;
        players.forEach(p => {
          if (p.shieldActive) return;
          const d = p.pos.distanceTo(pool.pos);
          if (d < 2.5 && dealDamageToPlayer) dealDamageToPlayer(p, 8, 'poison');
        });
      }
      if (pool.life <= 0) { ctx.scene.remove(pool.mesh); this._pools.splice(i, 1); }
    }

    this._addTimer -= dt;
    if (this._addTimer <= 0 && ctx.gameState.spirits.filter(s => s.alive && !s._isBoss).length < 2) {
      this._addTimer = 20;
      spawnShadowAdds(2);
    }
  }

  _spawnVenomPool() {
    const poolPos = this.pos.clone();
    poolPos.x += (Math.random() - 0.5) * 8;
    poolPos.z += (Math.random() - 0.5) * 8;
    poolPos.y = 0.05;
    const mesh = new THREE.Mesh(
      new THREE.CircleGeometry(2.2, 12),
      new THREE.MeshBasicMaterial({ color: 0x44aa00, transparent: true, opacity: 0.5 })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.copy(poolPos);
    ctx.scene.add(mesh);
    this._pools.push({ pos: poolPos, mesh, life: 8, tickTimer: 1 });
  }

  die() {
    super.die();
    document.getElementById('boss-hp-bar').style.display = 'none';
    this._pools.forEach(p => ctx.scene.remove(p.mesh));
    this._pools = [];
  }
}

export function spawnShadowAdds(count) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const pos = new THREE.Vector3(
      Math.cos(angle) * (15 + Math.random() * 5), 1,
      Math.sin(angle) * (15 + Math.random() * 5)
    );
    const s = new Spirit('neutral', pos, 4);
    ctx.gameState.spirits.push(s);
  }
}

export function spawnSpirits(element, count) {
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const dist = 12 + Math.random() * 8;
    const pos = new THREE.Vector3(Math.cos(angle) * dist, 1, Math.sin(angle) * dist);
    const s = new Spirit(element, pos, ctx.gameState.wave);
    ctx.gameState.spirits.push(s);
  }
}

export function spawnBoss() {
  const pos = new THREE.Vector3(0, 1, -15);
  const boss = new BossSpirit(pos);
  ctx.gameState.spirits.push(boss);
}
