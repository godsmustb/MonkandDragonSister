// src/combat/spirits.js — Spirit, BossSpirit classes + wave spawn logic (Pass 3 demon line v2)
import * as THREE from 'three';
import { ctx } from '../state.js';
import { ELEMENT_COLORS, ARENA_SIZE, DEMON_TABLE, WAVE_DEMON } from '../config.js';
import { getElementMult } from '../config.js';
import { spawnDeathParticles, _fxTimers, spawnDemonDeathDissolve, spawnHitFlash } from './projectiles.js';
import { triggerHitstop, triggerBossSlowmo } from '../game/juice.js';
import { initMeleeAI, updateMeleeAI, xzDist } from './ai.js';
import { DEMON_BUILDERS, DEMON_DEATH_TINT } from './demons.js';
import { scaleHp, scaleAtk } from '../game/campaign.js';

// Forward-declare: set by abilities.js after it imports us (avoids circular dep).
export let dealDamageToPlayer = null;
export function setDealDamageToPlayer(fn) { dealDamageToPlayer = fn; }
export let showDamageNumber = null;
export function setShowDamageNumber(fn) { showDamageNumber = fn; }

// Kill score values per demon type (mirrors SCORE_KILL in quest.js — kept local to avoid circular dep)
const _SCORE_KILL = {
  shadowling: 25, frostimp: 50, tidewraith: 75, venomoni: 600, infernolord: 1500,
};

/** Add score to gameState.score with endless-cycle multiplier. */
function _addScore(base) {
  const gs = ctx.gameState;
  if (!gs) return;
  const mult = 1 + 0.5 * (gs.endlessCycle || 0);
  gs.score = (gs.score || 0) + Math.round(base * mult);
  // Defer HUD update to avoid import at top level
  Promise.resolve().then(() => {
    import('../ui/hud.js').then(m => m.updateScoreHUD()).catch(() => {});
  });
}

// Scratch vectors — reused in hot loops
const _v1 = new THREE.Vector3();

// Map a wave number → demon type (for fodder waves). Falls back to shadowling.
function waveType(wave) {
  const w = WAVE_DEMON[wave];
  return (w && w.type) || 'shadowling';
}

export class Spirit {
  // type overrides element-by-wave; if omitted, derived from wave.
  constructor(element, pos, wave, type = null) {
    this._type = type || waveType(wave);
    const cfg = DEMON_TABLE[this._type];
    this.element = cfg ? cfg.element : element;
    this.alive = true;
    this._wave = wave;
    this._isBoss = false;

    const baseHp = cfg ? cfg.hp : (20 + wave * 8);
    this.maxHp = baseHp;
    this.hp = baseHp;
    this.atk = cfg ? cfg.atk : (8 + wave * 1.5);
    this._baseSpeed = cfg ? cfg.speed : (2.5 + wave * 0.3);
    this.speed = this._baseSpeed;
    this._ranged = cfg ? cfg.ranged : 'none';
    this._attackRange = cfg ? cfg.attackRange : 0;
    this._projSpeed = cfg ? cfg.projSpeed : 8;
    this._frozenTimer = 0;

    this.pos = pos.clone();
    this._vel = new THREE.Vector3();
    this._attackCd = 2 + Math.random();
    this._attackTimer = this._attackCd;
    this._bobPhase = Math.random() * Math.PI * 2;
    this._idlePhase = Math.random() * Math.PI * 2;
    this._projectiles = [];

    this._buildMesh();
    this.mesh.position.copy(this.pos);
    ctx.scene.add(this.mesh);

    this._hpBar = this._makeHpBar();
    ctx.scene.add(this._hpBar);

    this._light = new THREE.PointLight(ELEMENT_COLORS[this.element], 0.6, 6);
    this._light.position.copy(pos);
    ctx.scene.add(this._light);

    initMeleeAI(this);
    this._dealDmgFn = null; // wired lazily in update()
  }

  _buildMesh() {
    const builder = DEMON_BUILDERS[this._type] || DEMON_BUILDERS.shadowling;
    const g = builder();
    this._parts = g.userData.parts || {};
    const cfg = DEMON_TABLE[this._type];
    if (cfg && cfg.scale && !this._isBoss) g.scale.setScalar(cfg.scale);
    this.mesh = g;
    // _body: part flagged as body, used for the dt-driven hit-flash. toonMat()
    // CACHES + SHARES material instances by colour, so two demons of the same
    // type share one material. Clone this demon's body material so a hit-flash
    // on one never bleeds onto its siblings (per-instance, no shared-state leak).
    this._body = this._parts.body || null;
    if (this._body && this._body.material && !this._body.material._mdsHitClone) {
      this._body.material = this._body.material.clone();
      this._body.material._mdsHitClone = true;
    }
  }

  _makeHpBar() {
    const g = new THREE.Group();
    const w = this._isBoss ? 2.0 : 1.0;
    const bg = new THREE.Mesh(
      new THREE.PlaneGeometry(w, 0.12),
      new THREE.MeshBasicMaterial({ color: 0x220000 })
    );
    const fill = new THREE.Mesh(
      new THREE.PlaneGeometry(w, 0.12),
      new THREE.MeshBasicMaterial({ color: 0xff4444 })
    );
    fill.position.z = 0.001;
    g.add(bg); g.add(fill);
    g._fill = fill; g._w = w;
    return g;
  }

  updateHpBar(camera) {
    const cfg = DEMON_TABLE[this._type];
    const h = (cfg ? cfg.height : 1.2) + 0.6;
    this._hpBar.position.copy(this.pos);
    this._hpBar.position.y += h;
    this._hpBar.lookAt(camera.position);
    const pct = Math.max(0, this.hp / this.maxHp);
    this._hpBar._fill.scale.x = pct;
    this._hpBar._fill.position.x = (pct - 1) * (this._hpBar._w / 2);
  }

  // ── Idle menace + telegraph pose animation (per demon type) ──
  _animateIdle(dt) {
    this._idlePhase += dt;
    const p = this._parts;
    const telegraphing = this._aiState === 'telegraph';
    const tFlash = telegraphing ? 1.5 + Math.sin(this._idlePhase * 20) * 0.8 : 1.0;

    if (this._type === 'shadowling') {
      // Smoke churn (scale jitter) + claw sway.
      if (p.smoke) p.smoke.forEach(s => {
        const j = 1 + Math.sin(this._idlePhase * 2 + s._phase) * 0.08;
        s.scale.setScalar(s._baseScale * j);
      });
      if (p.claws) p.claws.forEach(a => { a.rotation.z = Math.sin(this._idlePhase * 1.5 + a._phase) * 0.2 * a._side; });
      if (p.eyes) p.eyes.forEach(e => { e.material.emissiveIntensity = 2.4 * tFlash; });
    } else if (this._type === 'frostimp') {
      if (p.core) p.core.material.emissiveIntensity = 3.0 * (0.8 + Math.sin(this._idlePhase * 3) * 0.2) * (telegraphing ? 1.6 : 1);
      if (p.body) p.body.rotation.y = Math.sin(this._idlePhase * 0.8) * 0.15;
      if (telegraphing && p.arms) p.arms.forEach(a => { a.rotation.x = -0.8; }); // raise arms
      else if (p.arms) p.arms.forEach(a => { a.rotation.x = Math.sin(this._idlePhase * 2 + a._side) * 0.1; });
    } else if (this._type === 'tidewraith') {
      this._rippleHem(dt, telegraphing ? 2.5 : 1.2);
      if (p.eyes) p.eyes.forEach(e => { e.material.emissiveIntensity = 2.6 * tFlash; });
      if (p.tendrils) p.tendrils.forEach((t, i) => { t.rotation.z = (t._side || 0) * 0.5 + Math.sin(this._idlePhase * 1.5 + (t._phase || i)) * 0.15; });
      if (telegraphing && p.trident) p.trident.rotation.z = 0.15 - 0.6; // raise trident
      else if (p.trident) p.trident.rotation.z = 0.15;
    }
  }

  _rippleHem(dt, freq) {
    const p = this._parts;
    if (!p.hem || !p.hem.geometry || !p.hem.geometry._hemReady) return;
    const geo = p.hem.geometry;
    const base = geo._hemBase;
    const pos = geo.attributes.position;
    const t = this._idlePhase * freq;
    for (let i = 0; i < pos.count; i++) {
      const bx = base[i * 3], by = base[i * 3 + 1], bz = base[i * 3 + 2];
      if (by < 0.2) { // hem only
        const ang = Math.atan2(bz, bx);
        const r = 1 + Math.sin(ang * 5 + t) * 0.06;
        pos.setX(i, bx * r); pos.setZ(i, bz * r);
        pos.setY(i, by + Math.sin(ang * 5 + t) * 0.03);
      }
    }
    pos.needsUpdate = true;
  }

  update(dt, players) {
    if (!this.alive) return;
    if (!this._dealDmgFn && dealDamageToPlayer) this._dealDmgFn = dealDamageToPlayer;

    if (this._frozenTimer > 0) {
      this._frozenTimer -= dt;
      if (this._frozenTimer <= 0) { this._frozenTimer = 0; this.speed = this._baseSpeed; }
      else {
        this._bobPhase += dt * 2;
        this.pos.y = this._hoverY() + Math.sin(this._bobPhase) * 0.1;
        this.mesh.position.copy(this.pos);
        this._light.position.copy(this.pos);
        return;
      }
    }

    this._bobPhase += dt * 2;
    this.pos.y = this._hoverY() + Math.sin(this._bobPhase) * 0.12;
    this.mesh.position.copy(this.pos);
    this._light.position.copy(this.pos);
    this._animateIdle(dt);

    let nearest = null, nearXZDist = Infinity;
    players.forEach(p => {
      if (p.inactive) return;  // Pass 12: skip hidden partner
      if (p.hp <= 0 || p.isKO) return;
      const d = xzDist(this, p);
      if (d < nearXZDist) { nearXZDist = d; nearest = p; }
    });

    updateMeleeAI(this, dt, nearest, nearXZDist);

    // Clamp spirits to the current safe radius.
    // In endless mode ctx.gameState.arenaRadius shrinks each collapse so demons
    // crowd the players on the shrinking ground. In regular play it stays 56.
    {
      const _gs = ctx.gameState;
      const _clampR = (_gs && _gs.arenaRadius != null) ? _gs.arenaRadius : (ARENA_SIZE - 4);
      const _r2 = this.pos.x * this.pos.x + this.pos.z * this.pos.z;
      if (_r2 > _clampR * _clampR) {
        const _d = Math.sqrt(_r2) || 1;
        this.pos.x = (this.pos.x / _d) * _clampR;
        this.pos.z = (this.pos.z / _d) * _clampR;
      }
    }

    // Ranged attack (frost imp lob / tide wraith bolt).
    if (this._ranged !== 'none') {
      this._attackTimer -= dt;
      if (this._attackTimer <= 0 && nearest && nearXZDist < this._attackRange &&
          this._aiState !== 'strike' && this._aiState !== 'telegraph') {
        this._attackTimer = this._attackCd + Math.random();
        this._doRangedAttack(nearest);
      }
    }

    this._updateProjectiles(dt, players);
  }

  _hoverY() {
    if (this._type === 'tidewraith') return 1.0;
    if (this._type === 'frostimp') return 0.8;
    if (this._isBoss) return 0;
    return 1.0;
  }

  _updateProjectiles(dt, players) {
    for (let i = this._projectiles.length - 1; i >= 0; i--) {
      const proj = this._projectiles[i];
      if (proj.gravity) proj.vel.y -= 9.8 * dt;
      proj.pos.addScaledVector(proj.vel, dt);
      proj.mesh.position.copy(proj.pos);
      if (proj.spin) proj.mesh.rotation.x += dt * 6;
      proj.life -= dt;
      players.forEach(p => {
        if (p.shieldActive) return;
        const d = p.pos.distanceTo(proj.pos);
        if (d < 1.0 && !proj._hit) {
          proj._hit = true;
          if (dealDamageToPlayer) dealDamageToPlayer(p, this.atk, this.element);
        }
      });
      if (proj.life <= 0 || proj._hit || proj.pos.y < 0) {
        ctx.scene.remove(proj.mesh);
        this._projectiles.splice(i, 1);
      }
    }
  }

  _doRangedAttack(target) {
    const startPos = this.pos.clone(); startPos.y = this._hoverY() + 0.5;
    if (this._ranged === 'lob') {
      // Frost Imp — lob 2 icicle shards in arcs.
      const n = 2;
      for (let k = 0; k < n; k++) {
        const projMesh = new THREE.Mesh(
          new THREE.ConeGeometry(0.12, 0.5, 4),
          new THREE.MeshBasicMaterial({ color: 0xdcefff })
        );
        projMesh.position.copy(startPos);
        ctx.scene.add(projMesh);
        const dir = new THREE.Vector3().subVectors(target.pos, startPos);
        const horiz = new THREE.Vector3(dir.x, 0, dir.z); const dist = horiz.length();
        horiz.normalize();
        const v = horiz.multiplyScalar(this._projSpeed + k * 1.5);
        v.y = 5 + dist * 0.15; // arc up
        this._projectiles.push({ pos: startPos.clone(), vel: v, mesh: projMesh, life: 3, _hit: false, gravity: true, spin: true });
      }
    } else if (this._ranged === 'bolt') {
      // Tide Wraith — water bolt (straight, fast).
      const projMesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.22, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0x4fe3ff })
      );
      projMesh.position.copy(startPos);
      ctx.scene.add(projMesh);
      const dir = new THREE.Vector3().subVectors(target.pos, startPos).normalize();
      this._projectiles.push({ pos: startPos.clone(), vel: dir.multiplyScalar(this._projSpeed), mesh: projMesh, life: 3, _hit: false });
    }
  }

  takeDamage(amount, attackerElement) {
    const mult = getElementMult(attackerElement, this.element);
    const finalDmg = Math.max(1, Math.round(amount * mult));
    this.hp -= finalDmg;
    if (window.__game) window.__game.lastDamage = { amount: finalDmg, mult, attackerElement, targetElement: this.element };

    if (showDamageNumber) showDamageNumber(this.pos, finalDmg, attackerElement, mult);

    // JUICE — dt-driven enemy hit-flash (pooled, restores base, no leak/setTimeout).
    if (this._body && this._body.material) spawnHitFlash(this._body.material, 0.12);

    // JUICE — HITSTOP on impactful hits: ANY hit on a boss freezes the beat.
    // Heavy/finisher/special/ultimate hits on normal demons trigger hitstop
    // explicitly from abilities.js. Light chip hits do NOT freeze. The juice
    // manager clamps duration + gates a cooldown so freezes can't stack.
    if (this._isBoss) triggerHitstop(0.07);

    if (this.hp <= 0) { this.die(); return mult; }
    return mult;
  }

  die() {
    this.alive = false;
    // JUICE — cinematic slow-mo on any boss death (venomoni / infernolord + L2/L3
    // variants all set _isBoss). Ramps ctx.timeScale down then eases back to 1.
    if (this._isBoss) triggerBossSlowmo();
    // Award score for this kill
    const pts = _SCORE_KILL[this._type] || 25;
    _addScore(pts);
    const tint = DEMON_DEATH_TINT[this.element] || ELEMENT_COLORS[this.element];
    spawnDeathParticles(this.pos, tint);
    // Enhanced per-type death dissolve
    spawnDemonDeathDissolve(this.pos.clone(), this._type, this.element);
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

// ── Generic boss base: shared HP-bar DOM + scale + pools handling ──
class BossBase extends Spirit {
  constructor(type, pos, wave) {
    super(null, pos, wave, type);
    this._isBoss = true;
    const cfg = DEMON_TABLE[type];
    this.mesh.scale.setScalar(cfg.scale);
    this._pools = [];

    // ── Pass 16 — multi-phase / weighted-attack / enrage state ──
    this.phase = 1;            // 1..3 (exposed to HUD + debug)
    this.enraged = false;      // soft enrage flag (exposed to debug)
    this.enrageTimer = 0;      // counts UP toward the enrage threshold
    this._enrageAt = 90;       // seconds until soft enrage (subclass overrides)
    this._enrageAtkMult = 1.3; // ATK multiplier on enrage (subclass overrides)
    this._enrageCdMult = 0.7;  // attack-cooldown multiplier on enrage
    this.lastAttacks = [];     // recent attack-bag picks (anti-repeat, max 3)
    this.attackCooldown = 3.0; // seconds between weighted-bag attacks
    this.attackTimer = this.attackCooldown * (0.6 + Math.random() * 0.4);
    this.spawnAddCooldown = 12;
    this.spawnAddTimer = this.spawnAddCooldown;
    this.aoeTimer = 6;         // ground-AOE cadence (lord)
    this.aoeWarnings = [];     // telegraphed ground circles {mesh, pos, r, delay, exploded, life}
    this._auraMesh = null;     // red enrage aura

    document.getElementById('boss-hp-bar').style.display = 'block';
  }

  // ── Pass 16: weighted attack-bag picker with "never same >2× in a row" ──
  _pickAttack(bag) {
    // bag: [{ name, weight }]. Filter out a choice if it would be the 3rd repeat.
    const last = this.lastAttacks;
    const blocked = (last.length >= 2 && last[last.length - 1] === last[last.length - 2])
      ? last[last.length - 1] : null;
    let pool = bag.filter(b => b.name !== blocked && b.weight > 0);
    if (pool.length === 0) pool = bag.filter(b => b.weight > 0);
    if (pool.length === 0) return null;
    const total = pool.reduce((s, b) => s + b.weight, 0);
    let roll = Math.random() * total;
    let chosen = pool[pool.length - 1].name;
    for (const b of pool) { if (roll < b.weight) { chosen = b.name; break; } roll -= b.weight; }
    last.push(chosen);
    if (last.length > 3) last.shift();
    return chosen;
  }

  // ── Pass 16: shared phase/enrage tick. Subclasses provide config + executors. ──
  tickBossPhase(dt, players) {
    if (!this.alive) return;

    // Phase transitions (subclass decides thresholds via _checkPhase()).
    this._checkPhase(players);

    // Soft enrage (time-based).
    if (!this.enraged) {
      this.enrageTimer += dt;
      if (this.enrageTimer >= this._enrageAt) this._enterEnrage();
    }
    if (this._auraMesh) {
      this._auraMesh.position.copy(this.pos);
      this._auraMesh.rotation.z += dt * 1.5;
      this._auraMesh.material.opacity = 0.35 + Math.sin(this._idlePhase * 4) * 0.12;
    }

    // Weighted attack bag (gated to not overlap the melee-FSM strike windows).
    this.attackTimer -= dt;
    if (this.attackTimer <= 0 && this._aiState !== 'strike' && this._aiState !== 'telegraph') {
      const cd = this.attackCooldown * (this.enraged ? this._enrageCdMult : 1);
      this.attackTimer = cd * (0.75 + Math.random() * 0.5);
      const name = this._pickAttack(this._attackBag());
      if (name) this._doAttack(name, players);
    }
  }

  _enterEnrage() {
    this.enraged = true;
    this.atk = Math.round(this.atk * this._enrageAtkMult);
    // Red aura ring around the boss.
    const aura = new THREE.Mesh(
      new THREE.RingGeometry(1.6, 2.4, 24),
      new THREE.MeshBasicMaterial({ color: 0xff2200, transparent: true, opacity: 0.4,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    aura.rotation.x = -Math.PI / 2;
    aura.position.copy(this.pos);
    ctx.scene.add(aura);
    this._auraMesh = aura;
    ctx.camState.p1.shake = 0.25; ctx.camState.p2.shake = 0.25;
    import('../ui/hud.js').then(m => m.showToast('THE BOSS ENRAGES — attacks come faster!')).catch(() => {});
  }

  // Subclass hooks (defaults = no-op single phase).
  _checkPhase(players) {}
  _attackBag() { return [{ name: 'melee_combo', weight: 1 }]; }
  _doAttack(name, players) {}

  // Boss bar is now owned exclusively by hud.js updateBossBar().
  // This method is intentionally a no-op to avoid dual-writer drift.
  // (FIX 11: removed redundant direct DOM write to #boss-hp-fill)
  _updateBossBar() {}

  _updatePools(dt, players, dmg, element, radius) {
    for (let i = this._pools.length - 1; i >= 0; i--) {
      const pool = this._pools[i];
      pool.life -= dt; pool.tickTimer -= dt;
      // grow-in animation
      if (pool._grow < 1) { pool._grow = Math.min(1, pool._grow + dt * 3); pool.mesh.scale.setScalar(pool._grow); }
      if (pool.tickTimer <= 0) {
        pool.tickTimer = 1;
        players.forEach(p => {
          if (p.shieldActive) return;
          if (p.pos.distanceTo(pool.pos) < radius && dealDamageToPlayer) dealDamageToPlayer(p, dmg, element);
        });
      }
      if (pool.life <= 0) { ctx.scene.remove(pool.mesh); this._pools.splice(i, 1); }
    }
  }

  // ── Pass 16: telegraphed ground-AOE circles that appear then explode ──
  _spawnGroundAoe(pos, radius, element, dmg, delay = 1.1) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(radius * 0.85, radius, 24),
      new THREE.MeshBasicMaterial({ color: element === 'ice' ? 0x66ccff : 0xff5522,
        transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(pos.x, 0.06, pos.z);
    ctx.scene.add(ring);
    const inner = new THREE.Mesh(
      new THREE.CircleGeometry(radius, 24),
      new THREE.MeshBasicMaterial({ color: element === 'ice' ? 0x66ccff : 0xff5522,
        transparent: true, opacity: 0.0, side: THREE.DoubleSide, depthWrite: false }));
    inner.rotation.x = -Math.PI / 2;
    inner.position.set(pos.x, 0.05, pos.z);
    ctx.scene.add(inner);
    this.aoeWarnings.push({ ring, inner, pos: pos.clone(), r: radius, element, dmg, delay, exploded: false, life: delay + 0.6 });
  }

  _updateGroundAoe(dt, players) {
    for (let i = this.aoeWarnings.length - 1; i >= 0; i--) {
      const a = this.aoeWarnings[i];
      a.life -= dt;
      if (a.delay > 0) {
        a.delay -= dt;
        const pulse = 0.4 + Math.abs(Math.sin(a.life * 12)) * 0.4;
        a.ring.material.opacity = pulse;
        a.inner.material.opacity = (1 - a.delay / (a.delay + 0.0001)) * 0; // keep inner faint until blast
        if (a.delay <= 0) {
          // Detonate.
          a.exploded = true;
          a.inner.material.opacity = 0.55;
          players.forEach(p => {
            if (p.shieldActive) return;
            if (p.pos.distanceTo(a.pos) < a.r && dealDamageToPlayer) dealDamageToPlayer(p, a.dmg, a.element);
          });
          spawnDeathParticles(new THREE.Vector3(a.pos.x, 0.3, a.pos.z), a.element === 'ice' ? 0x66ccff : 0xff6a2a);
        }
      } else {
        a.inner.material.opacity = Math.max(0, a.inner.material.opacity - dt * 1.5);
        a.ring.material.opacity = Math.max(0, a.ring.material.opacity - dt * 1.5);
      }
      if (a.life <= 0) {
        ctx.scene.remove(a.ring); ctx.scene.remove(a.inner);
        this.aoeWarnings.splice(i, 1);
      }
    }
  }

  _clearAuraAndAoe() {
    if (this._auraMesh) { ctx.scene.remove(this._auraMesh); this._auraMesh = null; }
    if (this.aoeWarnings) this.aoeWarnings.forEach(a => { ctx.scene.remove(a.ring); ctx.scene.remove(a.inner); });
    this.aoeWarnings = [];
  }

  die() {
    super.die();
    this._clearAuraAndAoe();
    document.getElementById('boss-hp-bar').style.display = 'none';
    this._pools.forEach(p => ctx.scene.remove(p.mesh));
    this._pools = [];
  }

  cleanup() {
    super.cleanup();
    this._clearAuraAndAoe();
  }
}

// ── L4 — VENOM ONI (mini-boss) — Pass 16 two-phase ──
//  P1 (100-60% HP): standard melee combo + poison projectile.
//  P2 (60-0% HP):   transition spectacle, faster attacks, spawns poison adds.
export class BossSpirit extends BossBase {
  constructor(pos) {
    super('venomoni', pos || new THREE.Vector3(0, 0, -15), 4);
    this._venomTimer = 5;
    this._enrageAt = 90;          // soft enrage after 90s
    this._enrageAtkMult = 1.3;    // +30% ATK
    this._enrageCdMult = 0.65;    // faster attack cadence
    this.attackCooldown = 3.2;
    document.getElementById('boss-name').textContent = 'VENOM ONI';
  }

  update(dt, players) {
    super.update(dt, players);
    if (!this.alive) return;
    this._updateBossBar();

    // Pass 16: phase machine + weighted attack bag + enrage.
    this.tickBossPhase(dt, players);

    // Club-slam telegraph pose: raise club arm overhead during telegraph.
    const p = this._parts;
    if (this._aiState === 'telegraph' && p.clubArm) { p.clubArm.rotation.x = -2.2; p.clubArm.rotation.z = 0.1; }
    else if (p.clubArm) { p.clubArm.rotation.x = 0; p.clubArm.rotation.z = 0.3; }
    if (p.kanji) p.kanji.material.opacity = this._aiState === 'telegraph' ? 1.0 : 0.85;

    // Passive venom-pool spit (ambient hazard, phase-independent).
    this._venomTimer -= dt;
    if (this._venomTimer <= 0) {
      this._venomTimer = this.phase === 2 ? 4.5 : 6;
      this._spawnVenomPool();
    }
    this._updatePools(dt, players, 8, 'poison', 2.5);
  }

  // ── Phase 1 → 2 at 60% HP ──
  _checkPhase(players) {
    if (this.phase === 1 && this.hp <= this.maxHp * 0.6) {
      this.phase = 2;
      this._baseSpeed *= 1.2; this.speed = this._baseSpeed;
      this.attackCooldown = 2.4;        // faster
      this.spawnAddTimer = 4;
      this.mesh.scale.multiplyScalar(1.05);
      ctx.camState.p1.shake = 0.32; ctx.camState.p2.shake = 0.32;
      if (ctx.impactLight) {
        ctx.impactLight.color.setHex(0x88ff44); ctx.impactLight.intensity = 2.5;
        _fxTimers.push(setTimeout(() => { if (ctx.impactLight) ctx.impactLight.intensity = 0; }, 1000));
      }
      import('../ui/hud.js').then(m => {
        m.showBanner('VENOM ONI: SECOND VENOM', 'The oni festers — poison adds incoming!', '#88ff44');
      }).catch(() => {});
    }
  }

  _attackBag() {
    const bag = [
      { name: 'melee_combo', weight: 3 },
      { name: 'poison_spit', weight: 2 },
      { name: 'gap_closer',  weight: 2 },
    ];
    if (this.phase === 2) bag.push({ name: 'spawn_adds', weight: 1 });
    return bag;
  }

  _doAttack(name, players) {
    if (name === 'melee_combo') {
      // Force the FSM toward a telegraph→strike if a target is near.
      if (this._aiState === 'pursue' || this._aiState === 'recover') {
        this._aiState = 'pursue';
      }
    } else if (name === 'poison_spit') {
      this._spitVenom(players);
    } else if (name === 'gap_closer') {
      this._gapCloser(players);
    } else if (name === 'spawn_adds') {
      if (ctx.gameState.spirits.filter(s => s.alive && !s._isBoss).length < 3) {
        spawnShadowAdds(1 + (Math.random() < 0.5 ? 1 : 0)); // 1-2 poison adds
        import('../ui/hud.js').then(m => m.showToast('Venom Oni summons spawn!')).catch(() => {});
      }
    }
  }

  // Lob a fast poison glob toward the nearest player.
  _spitVenom(players) {
    let target = null, best = Infinity;
    players.forEach(p => { if (p.inactive || p.isKO) return; const d = xzDist(this, p); if (d < best) { best = d; target = p; } });
    if (!target) return;
    const start = this.pos.clone(); start.y = this._hoverY() + 1.4;
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0x7fe05a }));
    mesh.position.copy(start);
    ctx.scene.add(mesh);
    const dir = new THREE.Vector3().subVectors(target.pos, start).normalize();
    this._projectiles.push({ pos: start.clone(), vel: dir.multiplyScalar(11), mesh, life: 3, _hit: false });
  }

  // Quick lunge toward the nearest player (forced reposition / pressure).
  _gapCloser(players) {
    let target = null, best = Infinity;
    players.forEach(p => { if (p.inactive || p.isKO) return; const d = xzDist(this, p); if (d < best) { best = d; target = p; } });
    if (!target) return;
    const dir = new THREE.Vector3(target.pos.x - this.pos.x, 0, target.pos.z - this.pos.z);
    const len = dir.length() || 1;
    const dash = Math.min(len - 2, 8);
    if (dash > 0) {
      this.pos.x += (dir.x / len) * dash;
      this.pos.z += (dir.z / len) * dash;
      this.pos.x = THREE.MathUtils.clamp(this.pos.x, -ARENA_SIZE + 2, ARENA_SIZE - 2);
      this.pos.z = THREE.MathUtils.clamp(this.pos.z, -ARENA_SIZE + 2, ARENA_SIZE - 2);
      spawnDeathParticles(new THREE.Vector3(this.pos.x, 0.3, this.pos.z), 0x88ff44);
    }
  }

  _spawnVenomPool() {
    const poolPos = this.pos.clone();
    poolPos.x += (Math.random() - 0.5) * 8;
    poolPos.z += (Math.random() - 0.5) * 8;
    poolPos.y = 0.05;
    const mesh = new THREE.Mesh(
      new THREE.CircleGeometry(2.2, 16),
      new THREE.MeshBasicMaterial({ color: 0x7fe05a, transparent: true, opacity: 0.5 })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.copy(poolPos);
    ctx.scene.add(mesh);
    this._pools.push({ pos: poolPos, mesh, life: 8, tickTimer: 1, _grow: 0 });
  }
}

// ── L5 — INFERNO DEMON LORD — Pass 16 THREE-phase final boss ──
//  P1 (100-70% HP): normal fire attacks, telegraphed AOE.
//  P2 (70-35% HP):  transition spectacle, faster + harder, arena hazards.
//  P3 (35-0%  HP):  element SHIFTS to 'ice' (Fire dragon now optimal), full hazards.
//  NOTE: spawn element stays 'fire' (E2E contract) — it only changes in P3.
//  Stays KILLABLE by plain neutral attacks throughout (no damage immunity).
export class DemonLord extends BossBase {
  constructor(pos) {
    super('infernolord', pos || new THREE.Vector3(0, 0, -16), 5);
    this._emberTimer = 4;
    this._flameWaveTimer = 7;
    this._waves = [];      // expanding flame ring hazards
    this._embers = [];     // falling meteor projectiles + targeting circles
    this._enrageAt = 120;  // soft enrage after 120s
    this._enrageAtkMult = 1.4; // +40% ATK
    this._enrageCdMult = 0.7;
    this.attackCooldown = 3.5;
    document.getElementById('boss-name').textContent = 'INFERNO DEMON LORD';
  }

  update(dt, players) {
    super.update(dt, players);
    if (!this.alive) return;
    this._updateBossBar();

    // Pass 16: phase machine + weighted attack bag + enrage.
    this.tickBossPhase(dt, players);

    // Idle: flame crown flicker + wing breathing + vein pulse.
    this._animateLord(dt);

    // Ambient hazards (cadence scales with phase).
    this._emberTimer -= dt;
    if (this._emberTimer <= 0) {
      this._emberTimer = this.phase >= 2 ? 4.5 : 6;
      this._emberStorm(players);
    }
    this._flameWaveTimer -= dt;
    if (this._flameWaveTimer <= 0) {
      this._flameWaveTimer = this.phase >= 2 ? 6 : 9;
      this._flameWave();
    }
    this._updateWaves(dt, players);
    this._updateEmbers(dt, players);
    this._updateGroundAoe(dt, players);
  }

  _animateLord(dt) {
    const p = this._parts;
    const t = this._idlePhase;
    const phaseBoost = this.phase >= 2 ? 1.6 : 1.0;
    if (p.crown) p.crown.forEach(f => {
      f.scale.y = (0.18 + Math.sin(t * 8 + f._phase) * 0.05) / 0.18 * 0.18;
      f.material.emissiveIntensity = 2.6 * (0.8 + Math.sin(t * 6 + f._phase) * 0.2) * phaseBoost;
    });
    if (p.veins) p.veins.forEach(v => { v.material.emissiveIntensity = 2.2 * phaseBoost * (0.85 + Math.sin(t * 2) * 0.15); });
    if (p.eyes) p.eyes.forEach(e => { e.material.emissiveIntensity = 2.8 * phaseBoost; });
    // Wing breathing (fold in P1, spread in P2+).
    if (p.wings) p.wings.forEach(w => {
      const target = this.phase >= 2 ? 1 : 0;
      w._spread = THREE.MathUtils.lerp(w._spread, target, 0.05);
      w.rotation.y = w._side * (0.5 - w._spread * 0.45) + Math.sin(t * 1.5) * 0.05 * (this._aiState === 'telegraph' ? 3 : 1);
    });
  }

  // ── Phase transitions: P2 at 70% HP, P3 (element shift) at 35% HP ──
  _checkPhase(players) {
    if (this.phase === 1 && this.hp <= this.maxHp * 0.70) this._enterPhase2();
    else if (this.phase === 2 && this.hp <= this.maxHp * 0.35) this._enterPhase3();
  }

  _enterPhase2() {
    this.phase = 2;
    this._baseSpeed *= 1.25; this.speed = this._baseSpeed;
    this.attackCooldown = 2.8;
    this.spawnAddTimer = 6;
    this.mesh.scale.multiplyScalar(1.05);
    if (ctx.impactLight) { ctx.impactLight.color.setHex(0xff3300); ctx.impactLight.intensity = 2.5;
      _fxTimers.push(setTimeout(() => { if (ctx.impactLight) ctx.impactLight.intensity = 0; }, 1200)); }
    ctx.camState.p1.shake = 0.35; ctx.camState.p2.shake = 0.35;
    import('../ui/hud.js').then(m => {
      m.showBanner('INFERNO LORD: WINGS SPREAD', 'Arena ignites — watch the ground circles!', '#ff5522');
    }).catch(() => {});
  }

  _enterPhase3() {
    this.phase = 3;
    // ELEMENT SHIFT — boss now defends as ICE, so Fire dragon becomes optimal.
    this.element = 'ice';
    this._baseSpeed *= 1.15; this.speed = this._baseSpeed;
    this.attackCooldown = 2.2;
    if (ctx.impactLight) { ctx.impactLight.color.setHex(0x66ccff); ctx.impactLight.intensity = 3;
      _fxTimers.push(setTimeout(() => { if (ctx.impactLight) ctx.impactLight.intensity = 0; }, 1400)); }
    ctx.camState.p1.shake = 0.45; ctx.camState.p2.shake = 0.45;
    // Recolor the boss light to the new element.
    if (this._light) this._light.color.setHex(ELEMENT_COLORS.ice);
    import('../ui/hud.js').then(m => {
      m.showBanner('INFERNO LORD: FROST HEART', 'Element shifts to ICE — swap to FIRE dragon!', '#66ccff');
    }).catch(() => {});
  }

  _attackBag() {
    const bag = [
      { name: 'melee_slam',  weight: 3 },
      { name: 'fire_barrage', weight: 2 },
    ];
    if (this.phase === 2) bag.push({ name: 'ground_aoe', weight: 2 });
    if (this.phase === 3) {
      bag.push({ name: 'ground_aoe', weight: 3 });
      bag.push({ name: 'element_burst', weight: 1 });
    }
    return bag;
  }

  _doAttack(name, players) {
    if (name === 'melee_slam') {
      if (this._aiState === 'recover') this._aiState = 'pursue';
    } else if (name === 'fire_barrage') {
      this._emberStorm(players);
    } else if (name === 'ground_aoe') {
      this._aoeBarrage(players);
    } else if (name === 'element_burst') {
      this._elementBurst(players);
    }
  }

  // Telegraphed ground-AOE circles around the players (P2+).
  _aoeBarrage(players) {
    const count = this.phase >= 3 ? 4 : 2;
    const el = this.element === 'ice' ? 'ice' : 'fire';
    for (let i = 0; i < count; i++) {
      const target = players[i % players.length];
      const tx = target.pos.x + (Math.random() - 0.5) * 6;
      const tz = target.pos.z + (Math.random() - 0.5) * 6;
      this._spawnGroundAoe(new THREE.Vector3(tx, 0, tz), 2.6, el, Math.round(this.atk * 1.1), 1.1);
    }
  }

  // P3 signature — a big radial burst of AOE circles + flame wave.
  _elementBurst(players) {
    const el = this.element === 'ice' ? 'ice' : 'fire';
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2;
      const r = 6 + Math.random() * 4;
      this._spawnGroundAoe(
        new THREE.Vector3(this.pos.x + Math.cos(ang) * r, 0, this.pos.z + Math.sin(ang) * r),
        2.4, el, Math.round(this.atk * 1.0), 1.0);
    }
    this._flameWave();
    ctx.camState.p1.shake = 0.3; ctx.camState.p2.shake = 0.3;
  }

  // Ember storm — targeting circles + falling meteor projectiles.
  _emberStorm(players) {
    const count = this.phase >= 2 ? 5 : 3;
    for (let i = 0; i < count; i++) {
      const target = players[i % players.length];
      const tx = target.pos.x + (Math.random() - 0.5) * 6;
      const tz = target.pos.z + (Math.random() - 0.5) * 6;
      // Targeting circle (telegraph).
      const circle = new THREE.Mesh(
        new THREE.RingGeometry(1.2, 1.6, 20),
        new THREE.MeshBasicMaterial({ color: 0xff6a2a, transparent: true, opacity: 0.7, side: THREE.DoubleSide })
      );
      circle.rotation.x = -Math.PI / 2;
      circle.position.set(tx, 0.06, tz);
      ctx.scene.add(circle);
      // Meteor spawns above after delay.
      const delay = 0.9;
      const meteor = new THREE.Mesh(
        new THREE.SphereGeometry(0.4, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xff6a2a })
      );
      meteor.position.set(tx, 12, tz);
      meteor.visible = false;
      ctx.scene.add(meteor);
      this._embers.push({ circle, meteor, tx, tz, delay, exploded: false, life: 3 });
    }
  }

  _updateEmbers(dt, players) {
    for (let i = this._embers.length - 1; i >= 0; i--) {
      const e = this._embers[i];
      e.life -= dt;
      if (e.delay > 0) {
        e.delay -= dt;
        e.circle.material.opacity = 0.4 + Math.abs(Math.sin(e.life * 12)) * 0.4;
        if (e.delay <= 0) e.meteor.visible = true;
      } else if (!e.exploded) {
        e.meteor.position.y -= 22 * dt;
        if (e.meteor.position.y <= 0.4) {
          e.exploded = true;
          e.meteor.visible = false;
          ctx.scene.remove(e.circle);
          // Explosion damage.
          players.forEach(p => {
            if (p.shieldActive) return;
            if (p.pos.distanceTo(new THREE.Vector3(e.tx, 0, e.tz)) < 2.0 && dealDamageToPlayer)
              dealDamageToPlayer(p, this.atk, 'fire');
          });
          spawnDeathParticles(new THREE.Vector3(e.tx, 0.3, e.tz), 0xff6a2a);
        }
      }
      if (e.life <= 0) {
        ctx.scene.remove(e.circle); ctx.scene.remove(e.meteor);
        this._embers.splice(i, 1);
      }
    }
  }

  // Flame wave — expanding ring hazard rolling outward from boss.
  _flameWave() {
    const big = this.phase >= 2;
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.8, big ? 2.2 : 1.4, 32),
      new THREE.MeshBasicMaterial({ color: 0xff6a2a, transparent: true, opacity: 0.75, side: THREE.DoubleSide })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.copy(this.pos); mesh.position.y = 0.08;
    ctx.scene.add(mesh);
    this._waves.push({ mesh, r: 1, maxR: big ? 22 : 16, pos: this.pos.clone(), hit: new Set() });
    ctx.camState.p1.shake = 0.15; ctx.camState.p2.shake = 0.15;
  }

  _updateWaves(dt, players) {
    for (let i = this._waves.length - 1; i >= 0; i--) {
      const w = this._waves[i];
      w.r += dt * 10;
      w.mesh.scale.setScalar(w.r);
      w.mesh.material.opacity = 0.75 * (1 - w.r / w.maxR);
      // Damage players caught in the expanding band (once each).
      players.forEach(p => {
        if (p.shieldActive || w.hit.has(p)) return;
        const d = Math.hypot(p.pos.x - w.pos.x, p.pos.z - w.pos.z);
        if (Math.abs(d - w.r) < 1.5) {
          w.hit.add(p);
          if (dealDamageToPlayer) dealDamageToPlayer(p, this.atk, 'fire');
        }
      });
      if (w.r >= w.maxR) { ctx.scene.remove(w.mesh); this._waves.splice(i, 1); }
    }
  }

  die() {
    super.die();
    this._waves.forEach(w => ctx.scene.remove(w.mesh));
    this._embers.forEach(e => { ctx.scene.remove(e.circle); ctx.scene.remove(e.meteor); });
    this._waves = []; this._embers = [];
    // Theatrical final burst.
    spawnDeathParticles(this.pos, 0xffe7a0);
    spawnDeathParticles(this.pos, 0xff6a2a);
    if (ctx.impactLight) { ctx.impactLight.color.setHex(0xffe7a0); ctx.impactLight.intensity = 4;
      _fxTimers.push(setTimeout(() => { if (ctx.impactLight) ctx.impactLight.intensity = 0; }, 600)); }
  }

  cleanup() {
    super.cleanup();
    if (this._waves) this._waves.forEach(w => { if (w.mesh.parent) ctx.scene.remove(w.mesh); });
    if (this._embers) this._embers.forEach(e => { if (e.circle.parent) ctx.scene.remove(e.circle); if (e.meteor.parent) ctx.scene.remove(e.meteor); });
    this._waves = []; this._embers = [];
  }
}

// ── Pass 16: module-level delegating hook (boss phase/attack-bag/enrage tick) ──
// Bosses already self-call this from their update() (once, after the melee FSM
// has run inside super.update()). Exported so external callers / tests can drive
// it explicitly. Safe no-op for non-boss spirits.
export function tickBossPhase(boss, dt, players) {
  if (boss && boss._isBoss && typeof boss.tickBossPhase === 'function') {
    boss.tickBossPhase(dt, players);
  }
}

// ── Spawn functions ──
export function spawnShadowAdds(count) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const pos = new THREE.Vector3(
      Math.cos(angle) * (15 + Math.random() * 5), 1,
      Math.sin(angle) * (15 + Math.random() * 5)
    );
    const s = new Spirit(null, pos, 1, 'shadowling'); // shadowling adds (neutral)
    ctx.gameState.spirits.push(s);
  }
}

export function spawnSpirits(element, count, type = null) {
  const t = type || waveType(ctx.gameState.wave);
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const dist = 12 + Math.random() * 8;
    const pos = new THREE.Vector3(Math.cos(angle) * dist, 1, Math.sin(angle) * dist);
    const s = new Spirit(element, pos, ctx.gameState.wave, t);
    ctx.gameState.spirits.push(s);
  }
}

export function spawnBoss() {
  const boss = new BossSpirit(new THREE.Vector3(0, 0, -15));
  ctx.gameState.spirits.push(boss);
}

export function spawnDemonLord() {
  const lord = new DemonLord(new THREE.Vector3(0, 0, -16));
  ctx.gameState.spirits.push(lord);
}

// ── Level 3 scaled boss spawners (campaign D index pre-applied) ──
/**
 * Spawn a "Plague Oni" (BossSpirit) scaled to dIndex D (Level 3 usage: D≈14).
 * More adds than Level 2, faster add timer, shorter enrage window.
 */
export function spawnBossScaledL3(D) {
  const boss = new BossSpirit(new THREE.Vector3(0, 0, -15));
  document.getElementById('boss-name').textContent = 'PLAGUE ONI';
  boss.maxHp = Math.max(1, Math.round(scaleHp(boss.maxHp, D)));
  boss.hp    = boss.maxHp;
  boss.atk   = Math.max(1, Math.round(scaleAtk(boss.atk, D)));
  // L3 Plague Oni: faster, shorter enrage window, more aggressive
  boss._baseSpeed *= 1.2;
  boss.speed = boss._baseSpeed;
  boss.spawnAddTimer = 4;   // adds arrive sooner than L2 (was 6)
  boss._enrageAt = 60;      // enrages at 60s (L2 default is 90s)
  boss._enrageAtkMult = 1.5; // +50% ATK on enrage (L2 is +30%)
  boss._enrageCdMult = 0.55; // much faster attack cadence
  boss.attackCooldown = 2.6; // already tighter base cd
  ctx.gameState.spirits.push(boss);
}

/**
 * Spawn the "Abyssal Demon Lord" scaled to dIndex D (Level 3 usage: D≈15).
 * HP clearly above Level 2 (~1700+). Poison/ice element rotation. Faster hazards.
 */
export function spawnDemonLordScaledL3(D) {
  const lord = new DemonLordL3(new THREE.Vector3(0, 0, -16), D);
  ctx.gameState.spirits.push(lord);
}

// ── Level 2 scaled boss spawners (campaign D index pre-applied) ──
/**
 * Spawn a Venom Oni scaled to dIndex D (Level 2 usage: D=9).
 * Base HP=260 @ D=9 → ~549.  Base ATK=18 @ D=9 → ~30.
 * Phase 2 transition stays at 60% of the SCALED maxHp.
 * Extra adds (ice imps) are spawned by quest.js alongside this.
 */
export function spawnBossScaled(D) {
  const boss = new BossSpirit(new THREE.Vector3(0, 0, -15));
  // Override name to distinguish from L1
  document.getElementById('boss-name').textContent = 'FROST WARLORD';
  // Apply campaign scaling
  boss.maxHp = Math.max(1, Math.round(scaleHp(boss.maxHp, D)));
  boss.hp    = boss.maxHp;
  boss.atk   = Math.max(1, Math.round(scaleAtk(boss.atk, D)));
  // Extra menace: phase 2 transition is 55% (slightly easier for a harder fight overall)
  // is handled naturally — we just reduce spawnAddTimer to spawn adds sooner
  boss.spawnAddTimer = 6; // adds spawn sooner in L2
  // Increase speed slightly for extra pressure
  boss._baseSpeed *= 1.1;
  boss.speed = boss._baseSpeed;
  ctx.gameState.spirits.push(boss);
}

/**
 * Spawn an Inferno Demon Lord scaled to dIndex D (Level 2 usage: D=10).
 * Base HP=400 @ D=10 → ~868.  Base ATK=22 @ D=10 → ~38.
 * ELEMENT CHANGE: spawns with 'ice' element from the start (Level 2 theme).
 * Fire dragon is immediately effective (counter at 2×) from phase 1 onward.
 * Phase 2 at 65% HP (earlier than L1's 70%).
 * Phase 3 at 30% HP — shifts to FIRE element so WATER dragon counters again.
 * An extra add wave of Frost Imps spawns at phase 2.
 */
export function spawnDemonLordScaled(D) {
  const lord = new DemonLordL2(new THREE.Vector3(0, 0, -16), D);
  ctx.gameState.spirits.push(lord);
}

// ── Level 3 Final Boss: Abyssal Demon Lord ──────────────────────────────────
// Extends DemonLord with:
//  • Starts as POISON element (Ice dragon is optimal from the start)
//  • Phase 2 at 60% HP (earlier than L1 70% / L2 65%); Phase 3 at 25% HP
//  • Phase 3 shifts to WATER element → Poison dragon is the final counter
//  • Persistent poison ground pools (arena hazards that force repositioning)
//  • Full arena-saturating element burst (more circles than L2)
//  • Tighter ember + wave cadence than L2; shorter enrage window (75s vs 90s)
//  • Scaled HP/ATK via campaign D index (~D=15 → maxHp 1700+)
class DemonLordL3 extends DemonLord {
  constructor(pos, D) {
    super(pos);
    document.getElementById('boss-name').textContent = 'ABYSSAL DEMON LORD';
    this.maxHp = Math.max(1, Math.round(scaleHp(this.maxHp, D)));
    this.hp    = this.maxHp;
    this.atk   = Math.max(1, Math.round(scaleAtk(this.atk, D)));
    // Start as POISON — Ice dragon is immediately the counter
    this.element = 'poison';
    if (this._light) this._light.color.setHex(0xaa44ff);
    // Ambient poison hazard (ground-pool drip like Venom Oni but spread wide)
    this._abyssPoolTimer = 5;
    // Tighter cadences for harder feel
    this._enrageAt = 75;          // enrages at 75s (L2 is 90s)
    this._enrageAtkMult = 1.6;   // +60% ATK (L2 is +50%)
    this.attackCooldown = 2.8;   // faster than L2's 3.0
    this._emberTimer = 2.5;      // more frequent embers (L2 is 3)
    this._flameWaveTimer = 4;    // more frequent waves (L2 is 5)
  }

  update(dt, players) {
    super.update(dt, players);
    if (!this.alive) return;
    // Periodic ambient poison pools that force repositioning
    this._abyssPoolTimer -= dt;
    if (this._abyssPoolTimer <= 0) {
      this._abyssPoolTimer = this.phase >= 2 ? 3.5 : 5;
      this._spawnAbyssPool();
    }
    this._updatePools(dt, players, 10, 'poison', 2.8);
  }

  _spawnAbyssPool() {
    // Drop a poison pool at a random arena position (not just near boss)
    const angle = Math.random() * Math.PI * 2;
    const dist  = 6 + Math.random() * 18;
    const poolPos = new THREE.Vector3(
      this.pos.x + Math.cos(angle) * dist,
      0.05,
      this.pos.z + Math.sin(angle) * dist
    );
    poolPos.x = THREE.MathUtils.clamp(poolPos.x, -22, 22);
    poolPos.z = THREE.MathUtils.clamp(poolPos.z, -22, 22);
    const mesh = new THREE.Mesh(
      new THREE.CircleGeometry(2.6, 16),
      new THREE.MeshBasicMaterial({ color: 0xaa44ff, transparent: true, opacity: 0.48 })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.copy(poolPos);
    ctx.scene.add(mesh);
    // Life: 12s in P1, 9s in P2+ (more churn = less safe ground)
    const life = this.phase >= 2 ? 9 : 12;
    this._pools.push({ pos: poolPos, mesh, life, tickTimer: 1, _grow: 0 });
  }

  // Override phase thresholds: P2 at 60%, P3 at 25%
  _checkPhase(players) {
    if (this.phase === 1 && this.hp <= this.maxHp * 0.60) this._enterPhase2L3();
    else if (this.phase === 2 && this.hp <= this.maxHp * 0.25) this._enterPhase3L3();
  }

  _enterPhase2L3() {
    this.phase = 2;
    this._baseSpeed *= 1.30; this.speed = this._baseSpeed;
    this.attackCooldown = 2.1;
    this.spawnAddTimer = 3;
    this.mesh.scale.multiplyScalar(1.07);
    if (ctx.impactLight) {
      ctx.impactLight.color.setHex(0xaa44ff); ctx.impactLight.intensity = 3;
      _fxTimers.push(setTimeout(() => { if (ctx.impactLight) ctx.impactLight.intensity = 0; }, 1200));
    }
    ctx.camState.p1.shake = 0.45; ctx.camState.p2.shake = 0.45;
    // Spawn 4 mixed poison/water adds to flood the arena
    const addTypes = ['shadowling', 'tidewraith', 'shadowling', 'tidewraith'];
    addTypes.forEach((t, i) => {
      const angle = (i / addTypes.length) * Math.PI * 2;
      const addPos = new THREE.Vector3(Math.cos(angle) * 13, 1, Math.sin(angle) * 13);
      const add = new Spirit(null, addPos, 3, t);
      ctx.gameState.spirits.push(add);
    });
    import('../ui/hud.js').then(m => {
      m.showBanner('ABYSSAL LORD: VENOM TIDE', 'Poison floods the arena — Ice counters! Adds incoming!', '#aa44ff');
    }).catch(() => {});
  }

  _enterPhase3L3() {
    this.phase = 3;
    // Shift element to WATER — Poison dragon is now the best counter
    this.element = 'water';
    if (this._light) this._light.color.setHex(0x4499ff);
    this._baseSpeed *= 1.18; this.speed = this._baseSpeed;
    this.attackCooldown = 1.7;
    // Override aoe colour helper: _spawnGroundAoe uses this.element now
    if (ctx.impactLight) {
      ctx.impactLight.color.setHex(0x4499ff); ctx.impactLight.intensity = 4;
      _fxTimers.push(setTimeout(() => { if (ctx.impactLight) ctx.impactLight.intensity = 0; }, 1400));
    }
    ctx.camState.p1.shake = 0.55; ctx.camState.p2.shake = 0.55;
    import('../ui/hud.js').then(m => {
      m.showBanner('ABYSSAL LORD: TIDAL RECKONING', 'Element shifts to WATER — swap to POISON dragon!', '#4499ff');
    }).catch(() => {});
  }

  // L3 has an even richer attack bag — every phase adds more options
  _attackBag() {
    const bag = [
      { name: 'melee_slam',    weight: 2 },
      { name: 'fire_barrage',  weight: 3 }, // emits in current element (poison/water)
      { name: 'ground_aoe',   weight: 2 },
    ];
    if (this.phase >= 2) {
      bag.push({ name: 'ground_aoe',    weight: 3 });
      bag.push({ name: 'gap_closer_l3', weight: 2 });
    }
    if (this.phase >= 3) {
      bag.push({ name: 'ground_aoe',    weight: 3 });
      bag.push({ name: 'element_burst', weight: 3 });
    }
    return bag;
  }

  _doAttack(name, players) {
    if (name === 'gap_closer_l3') {
      this._gapCloserL3(players);
    } else {
      super._doAttack(name, players);
    }
  }

  // Aggressive lunge + instant pool-drop at landing position
  _gapCloserL3(players) {
    let target = null, best = Infinity;
    players.forEach(p => {
      if (p.inactive || p.isKO) return;
      const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z;
      const d = Math.sqrt(dx*dx + dz*dz);
      if (d < best) { best = d; target = p; }
    });
    if (!target) return;
    const dx = target.pos.x - this.pos.x, dz = target.pos.z - this.pos.z;
    const len = Math.sqrt(dx*dx + dz*dz) || 1;
    const dash = Math.min(len - 2, 12);
    if (dash > 0) {
      this.pos.x += (dx / len) * dash;
      this.pos.z += (dz / len) * dash;
      this.pos.x = THREE.MathUtils.clamp(this.pos.x, -22, 22);
      this.pos.z = THREE.MathUtils.clamp(this.pos.z, -22, 22);
      // Drop a pool at the landing spot for positional pressure
      this._spawnAbyssPool();
      spawnDeathParticles(new THREE.Vector3(this.pos.x, 0.3, this.pos.z), 0xaa44ff);
      ctx.camState.p1.shake = 0.30; ctx.camState.p2.shake = 0.30;
    }
  }

  // Override _spawnGroundAoe colour: L3 uses poison/water colours
  _spawnGroundAoe(pos, radius, element, dmg, delay = 1.1) {
    const col = element === 'water' ? 0x4499ff : (element === 'poison' ? 0xaa44ff : 0xff5522);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(radius * 0.85, radius, 24),
      new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.6,
        side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(pos.x, 0.06, pos.z);
    ctx.scene.add(ring);
    const inner = new THREE.Mesh(
      new THREE.CircleGeometry(radius, 24),
      new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.0,
        side: THREE.DoubleSide, depthWrite: false }));
    inner.rotation.x = -Math.PI / 2;
    inner.position.set(pos.x, 0.05, pos.z);
    ctx.scene.add(inner);
    this.aoeWarnings.push({ ring, inner, pos: pos.clone(), r: radius, element, dmg, delay, exploded: false, life: delay + 0.6 });
  }

  // P3 element burst: 8 circles + twin waves (vs L2's 6 circles + 1 wave)
  _elementBurst(players) {
    const el = this.element;
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      const r = 5 + Math.random() * 6;
      this._spawnGroundAoe(
        new THREE.Vector3(this.pos.x + Math.cos(ang) * r, 0, this.pos.z + Math.sin(ang) * r),
        2.6, el, Math.round(this.atk * 1.1), 1.0);
    }
    // Two expanding hazard waves
    this._flameWave();
    this._flameWave();
    ctx.camState.p1.shake = 0.4; ctx.camState.p2.shake = 0.4;
  }
}

// ── Level 2 Final Boss: Glacial Inferno Lord ─────────────────────────────────
// Extends DemonLord with:
//  • Starts as ICE element (Fire dragon is optimal from the start)
//  • Phase 2 at 65% HP (earlier); Phase 3 at 30% HP (shifts back to FIRE → Water counters)
//  • Extra add wave at phase 2 (3 Frost Imps)
//  • Faster ember storm + denser ground AOEs
//  • Scaled HP/ATK via campaign D index
class DemonLordL2 extends DemonLord {
  constructor(pos, D) {
    super(pos);
    // Override name
    document.getElementById('boss-name').textContent = 'GLACIAL INFERNO LORD';
    // Apply campaign scaling
    this.maxHp = Math.max(1, Math.round(scaleHp(this.maxHp, D)));
    this.hp    = this.maxHp;
    this.atk   = Math.max(1, Math.round(scaleAtk(this.atk, D)));
    // Start as ICE — Fire dragon is immediately the counter
    this.element = 'ice';
    if (this._light) this._light.color.setHex(0x66ccff);
    // Tighter cadences for harder feel
    this._enrageAt = 90;       // enrages at 90s (L1 is 120s)
    this._enrageAtkMult = 1.5; // +50% ATK (L1 is +40%)
    this.attackCooldown = 3.0; // faster (L1 is 3.5)
    this._emberTimer = 3;      // more frequent embers (L1 is 4)
    this._flameWaveTimer = 5;  // more frequent waves (L1 is 7)
  }

  // Override phase thresholds and add the extra ice-add spawn at P2
  _checkPhase(players) {
    if (this.phase === 1 && this.hp <= this.maxHp * 0.65) this._enterPhase2L2();
    else if (this.phase === 2 && this.hp <= this.maxHp * 0.30) this._enterPhase3L2();
  }

  _enterPhase2L2() {
    this.phase = 2;
    this._baseSpeed *= 1.25; this.speed = this._baseSpeed;
    this.attackCooldown = 2.4;
    this.spawnAddTimer = 3; // adds come fast
    this.mesh.scale.multiplyScalar(1.06);
    if (ctx.impactLight) {
      ctx.impactLight.color.setHex(0x66ccff); ctx.impactLight.intensity = 3;
      _fxTimers.push(setTimeout(() => { if (ctx.impactLight) ctx.impactLight.intensity = 0; }, 1200));
    }
    ctx.camState.p1.shake = 0.40; ctx.camState.p2.shake = 0.40;
    // Spawn 3 Frost Imp adds to punish players
    for (let i = 0; i < 3; i++) {
      const angle = Math.random() * Math.PI * 2;
      const pos = new THREE.Vector3(Math.cos(angle) * 14, 1, Math.sin(angle) * 14);
      const add = new Spirit(null, pos, 2, 'frostimp');
      ctx.gameState.spirits.push(add);
    }
    import('../ui/hud.js').then(m => {
      m.showBanner('GLACIAL LORD: FROST STORM', 'Ice adds — the peaks crack open! Fire wins!', '#88ddff');
    }).catch(() => {});
  }

  _enterPhase3L2() {
    this.phase = 3;
    // Shift element BACK to fire — now WATER dragon is the best counter
    this.element = 'fire';
    if (this._light) this._light.color.setHex(0xff3300);
    this._baseSpeed *= 1.15; this.speed = this._baseSpeed;
    this.attackCooldown = 1.9;
    if (ctx.impactLight) {
      ctx.impactLight.color.setHex(0xff3300); ctx.impactLight.intensity = 4;
      _fxTimers.push(setTimeout(() => { if (ctx.impactLight) ctx.impactLight.intensity = 0; }, 1400));
    }
    ctx.camState.p1.shake = 0.50; ctx.camState.p2.shake = 0.50;
    import('../ui/hud.js').then(m => {
      m.showBanner('GLACIAL LORD: MAGMA REBIRTH', 'Element shifts to FIRE — swap to WATER dragon!', '#ff5522');
    }).catch(() => {});
  }

  // L2 uses a richer attack bag at every phase
  _attackBag() {
    const bag = [
      { name: 'melee_slam',   weight: 3 },
      { name: 'fire_barrage', weight: 3 }, // re-used but does ice/fire damage based on element
    ];
    if (this.phase >= 2) {
      bag.push({ name: 'ground_aoe',    weight: 3 });
      bag.push({ name: 'gap_closer_l2', weight: 2 }); // new: aggressive lunge
    }
    if (this.phase >= 3) {
      bag.push({ name: 'ground_aoe',    weight: 2 });
      bag.push({ name: 'element_burst', weight: 2 });
    }
    return bag;
  }

  _doAttack(name, players) {
    if (name === 'gap_closer_l2') {
      this._gapCloserL2(players);
    } else {
      super._doAttack(name, players);
    }
  }

  // Quick lunge — same as Venom Oni's gap closer, re-implemented here
  _gapCloserL2(players) {
    let target = null, best = Infinity;
    players.forEach(p => {
      if (p.inactive || p.isKO) return;
      const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z;
      const d = Math.sqrt(dx*dx + dz*dz);
      if (d < best) { best = d; target = p; }
    });
    if (!target) return;
    const dx = target.pos.x - this.pos.x, dz = target.pos.z - this.pos.z;
    const len = Math.sqrt(dx*dx + dz*dz) || 1;
    const dash = Math.min(len - 2, 10);
    if (dash > 0) {
      this.pos.x += (dx / len) * dash;
      this.pos.z += (dz / len) * dash;
      this.pos.x = THREE.MathUtils.clamp(this.pos.x, -20, 20);
      this.pos.z = THREE.MathUtils.clamp(this.pos.z, -20, 20);
      spawnDeathParticles(new THREE.Vector3(this.pos.x, 0.3, this.pos.z), 0x66ccff);
      ctx.camState.p1.shake = 0.25; ctx.camState.p2.shake = 0.25;
    }
  }
}
