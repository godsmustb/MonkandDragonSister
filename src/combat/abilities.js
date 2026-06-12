// src/combat/abilities.js — Player class + all player ability implementations
import * as THREE from 'three';
import { ctx } from '../state.js';
import { LEVEL_TABLE, XP_TO_LEVEL, FORM_DATA, ELEMENT_NAMES, ELEMENT_COLORS, ARENA_SIZE } from '../config.js';
import { buildMonk, buildSister, buildDragon } from '../chars/builders.js';
import { _animateCharacter } from '../chars/anim.js';
import {
  _fxTimers, _fxEffects, _particles,
  spawnBreathAttack, spawnProjectile,
  spawnFireTrail, spawnFrostNova, spawnToxicCloud,
  spawnHealingRain, spawnHealRing,
  spawnTransformParticles, triggerLevelUpFlash,
} from './projectiles.js';
import { updateHUD } from '../ui/hud.js';
import { showToast } from '../ui/hud.js';

// ---- Knockback helper ----
export function knockback(spirit, fromPos, force) {
  const dir = new THREE.Vector3().subVectors(spirit.pos, fromPos).normalize();
  dir.y = 0;
  spirit.pos.addScaledVector(dir, force);
  spirit.pos.x = THREE.MathUtils.clamp(spirit.pos.x, -ARENA_SIZE + 2, ARENA_SIZE - 2);
  spirit.pos.z = THREE.MathUtils.clamp(spirit.pos.z, -ARENA_SIZE + 2, ARENA_SIZE - 2);
}

// ---- dealDamageToPlayer ----
export function dealDamageToPlayer(player, amount, element) {
  if (player._iframes > 0) return;
  if (player.shieldActive) return;
  if (player.isKO) return;
  const mitigated = Math.max(1, amount - player.def * 0.3);
  player.hp -= mitigated;
  player._lastHitTime = performance.now() / 1000;
  if (player._meditating) {
    player._meditating = false;
    player._stopMeditationVfx && player._stopMeditationVfx();
  }
  ctx.camState['p' + player.id].shake = 0.1;
  if (window.__game) window.__game.lastPlayerDamage = { amount: mitigated, mult: 1, attackerElement: element, targetElement: 'neutral' };
  if (player.hp <= 0) {
    player.hp = 0;
    player.isKO = true;
    player._koTimer = 10; // 10s revive window (changed from 5)
    showToast(`P${player.id} is down! Partner has 10s to revive!`);
  }
  updateHUD();
}

// Scratch vectors reused in Player update
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();

export class Player {
  constructor(id, startPos) {
    this.id = id;
    this.pos = startPos.clone();
    this._vel = new THREE.Vector3();
    this.facing = new THREE.Vector3(0, 0, -1);

    this.level = 1;
    this.xp = 0;

    const stats = LEVEL_TABLE[0];
    this.maxHp = stats.maxHp;
    this.hp = this.maxHp;
    this.atk = stats.atk;
    this.def = stats.def;

    this.relics = [];
    this._relicBonuses = { def: 1, elemDmg: 1, maxHpMult: 1 };

    this.shieldActive = false;
    this._shieldCd = 0;
    this._shieldTimer = 0;
    this._shieldMesh = null;

    this._healCd = 0;
    this._attackCd = 0;
    this._dodgeCd = 0;
    this._dodgeTimer = 0;
    this._iframes = 0;
    this._comboCount = 0;
    this._comboTimer = 0;

    this._specialCd = 0;
    this._transformCd = 0;

    this._koTimer = 0;
    this.isKO = false;
    this._kneelMesh = null;

    this._animPhase = 0;
    this._attackAnim = 0;
    this._attackAnimActive = false;

    if (id === 2) {
      this.form = 'human';
      this.unlockedForms = ['human'];
    }

    this._buildMesh();
    ctx.scene.add(this.mesh);
  }

  _buildMesh() {
    if (this.id === 1) {
      this.mesh = buildMonk();
    } else {
      this.mesh = buildSister();
      this._dragonMeshes = {};
      ELEMENT_NAMES.slice(1).forEach(el => {
        this._dragonMeshes[el] = buildDragon(el);
      });
    }
    this.mesh.position.copy(this.pos);
  }

  getElement() {
    if (this.id === 1) return 'neutral';
    return this.form === 'human' ? 'neutral' : this.form;
  }

  equipRelic(relic) {
    if (this.relics.includes(relic)) return;
    this.relics.push(relic);
    showToast('Relic: ' + relic + ' equipped!');
    if (relic === 'Prayer Beads') {
      this._relicBonuses.def = 1.15;
      this.def = Math.round(LEVEL_TABLE[this.level - 1].def * 1.15);
    } else if (relic === 'Dragon Pearl') {
      this._relicBonuses.elemDmg = 1.15;
    } else if (relic === 'Saffron Robe') {
      this._relicBonuses.maxHpMult = 1.2;
      this.maxHp = Math.round(LEVEL_TABLE[this.level - 1].maxHp * 1.2);
      this.hp = Math.min(this.hp + Math.round(LEVEL_TABLE[this.level - 1].maxHp * 0.2), this.maxHp);
    }
    updateHUD();
  }

  gainXP(amount) {
    this.xp += amount;
    const needed = XP_TO_LEVEL[Math.min(this.level + 1, 10)];
    if (this.level < 10 && this.xp >= needed) this.levelUp();
    updateHUD();
  }

  levelUp() {
    this.level = Math.min(this.level + 1, 10);
    const stats = LEVEL_TABLE[this.level - 1];
    const oldAtk = this.atk;
    this.maxHp = Math.round(stats.maxHp * this._relicBonuses.maxHpMult);
    this.hp = this.maxHp;
    this.atk = stats.atk;
    this.def = Math.round(stats.def * this._relicBonuses.def);
    showToast(`P${this.id} Level ${this.level}! ATK ${oldAtk}→${this.atk}`);
    triggerLevelUpFlash(this);
    updateHUD();
  }

  setLevel(level) {
    this.level = THREE.MathUtils.clamp(level, 1, 10);
    this.xp = XP_TO_LEVEL[this.level] || 0;
    const stats = LEVEL_TABLE[this.level - 1];
    this.maxHp = Math.round(stats.maxHp * this._relicBonuses.maxHpMult);
    this.hp = this.maxHp;
    this.atk = stats.atk;
    this.def = Math.round(stats.def * this._relicBonuses.def);
    updateHUD();
  }

  transform(toForm) {
    if (this.id !== 2) return;
    const prevForm = this.form;
    if (prevForm !== 'human' && this._dragonMeshes[prevForm]) {
      ctx.scene.remove(this._dragonMeshes[prevForm]);
      if (this._dragonMeshes[prevForm]._trail)
        ctx.scene.remove(this._dragonMeshes[prevForm]._trail);
    }
    if (prevForm === 'human') ctx.scene.remove(this.mesh);

    this.form = toForm;
    if (toForm === 'human') {
      ctx.scene.add(this.mesh);
    } else {
      const dm = this._dragonMeshes[toForm];
      dm.position.copy(this.pos);
      ctx.scene.add(dm);
      if (dm._trail) ctx.scene.add(dm._trail);
    }

    spawnTransformParticles(this.pos, ELEMENT_COLORS[toForm] || 0xffffff);
    showToast(`Dragon Sister: ${FORM_DATA[toForm].name} Form!`);

    ctx.impactLight.color.setHex(ELEMENT_COLORS[toForm] || 0xffffff);
    ctx.impactLight.intensity = 3;
    _fxTimers.push(setTimeout(() => { ctx.impactLight.intensity = 0; }, 400));
    updateHUD();
  }

  cycleForm() {
    if (this.id !== 2 || this._transformCd > 0) return;
    this._transformCd = 1.0;
    const forms = this.unlockedForms;
    const idx = forms.indexOf(this.form);
    const next = forms[(idx + 1) % forms.length];
    this.transform(next);
  }

  unlockForm(form) {
    if (!this.unlockedForms.includes(form)) {
      this.unlockedForms.push(form);
      showToast(`Dragon form unlocked: ${FORM_DATA[form].name}!`);
      updateHUD();
    }
  }

  currentMesh() {
    if (this.id === 1) return this.mesh;
    if (this.form === 'human') return this.mesh;
    return this._dragonMeshes[this.form];
  }

  update(dt, keys, allPlayers) {
    if (ctx.gameState.state === 'INTRO') return;

    if (this._shieldCd > 0) this._shieldCd -= dt;
    if (this._healCd > 0) this._healCd -= dt;
    if (this._attackCd > 0) this._attackCd -= dt;
    if (this._dodgeCd > 0) this._dodgeCd -= dt;
    if (this._specialCd > 0) this._specialCd -= dt;
    if (this._transformCd > 0) this._transformCd -= dt;
    if (this._iframes > 0) this._iframes -= dt;
    if (this._comboTimer > 0) this._comboTimer -= dt; else this._comboCount = 0;
    if (this._attackAnimActive) {
      this._attackAnim += dt * 5;
      if (this._attackAnim > 1) { this._attackAnim = 0; this._attackAnimActive = false; }
    }
    if (this._dodgeTimer > 0) { this._dodgeTimer -= dt; this._iframes = this._dodgeTimer; }

    if (this.isKO) {
      this._koTimer -= dt;
      const other = allPlayers.find(p => p.id !== this.id);
      // Partner revive: stand within 2.5 units within 10s
      if (other && !other.isKO && other.pos.distanceTo(this.pos) < 2.5 && this._koTimer > 0) {
        this.hp = Math.round(this.maxHp * 0.3);
        this.isKO = false;
        this._koTimer = 0;
        this._iframes = 1.5;
        showToast(`P${this.id} revived by partner!`);
        updateHUD();
      }
      // When timer hits 0, main.js handleKoExpiry() calls consumeLife() — see main.js
      // We do NOT reset the timer here; main.js intercepts _koTimer <= 0 and isKO
      return;
    }

    const speed = 5.5 * (1 + (this.level - 1) * 0.05);
    let mx = 0, mz = 0;
    if (this.id === 1) {
      if (keys['KeyW']) mz = -1;
      if (keys['KeyS']) mz = 1;
      if (keys['KeyA']) mx = -1;
      if (keys['KeyD']) mx = 1;
    } else {
      if (keys['ArrowUp'])    mz = -1;
      if (keys['ArrowDown'])  mz = 1;
      if (keys['ArrowLeft'])  mx = -1;
      if (keys['ArrowRight']) mx = 1;
    }

    _v3.set(mx, 0, mz);
    if (_v3.lengthSq() > 0) {
      _v3.normalize().multiplyScalar(speed * dt);
      this.pos.add(_v3);
      this.facing.set(mx, 0, mz).normalize();
    }
    const moveVec = _v3;

    this.pos.x = THREE.MathUtils.clamp(this.pos.x, -ARENA_SIZE + 2, ARENA_SIZE - 2);
    this.pos.z = THREE.MathUtils.clamp(this.pos.z, -ARENA_SIZE + 2, ARENA_SIZE - 2);
    this.pos.y = 0;

    const cm = this.currentMesh();
    if (cm) {
      cm.position.copy(this.pos);
      if (moveVec.lengthSq() > 0.001)
        cm.rotation.y = Math.atan2(this.facing.x, this.facing.z);
    }

    this._animPhase += dt * (moveVec.lengthSq() > 0.001 ? 4 : 1);
    _animateCharacter(this, dt, moveVec.lengthSq() > 0.001);

    if (this.id === 2 && this.form !== 'human') {
      this._updateDragonSpine(dt);
    }

    if (this._shieldMesh) {
      this._shieldMesh.position.copy(this.pos);
      this._shieldMesh.position.y = 1;
      if (!this.shieldActive) {
        ctx.scene.remove(this._shieldMesh);
        this._shieldMesh = null;
      }
    }

    // Meditation passive (P1 only)
    if (this.id === 1) {
      const isMoving = moveVec.lengthSq() > 0.001;
      if (isMoving) {
        this._meditationTimer = 0;
        if (this._meditating) { this._meditating = false; this._stopMeditationVfx(); }
      } else {
        this._meditationTimer = (this._meditationTimer || 0) + dt;
        const sinceHit = (this._lastHitTime !== undefined) ? (performance.now() / 1000 - this._lastHitTime) : 999;
        if (this._meditationTimer > 2 && sinceHit >= 4) {
          if (!this._meditating) { this._meditating = true; this._startMeditationVfx(); }
          this.hp = Math.min(this.hp + dt * this.maxHp * 0.06, this.maxHp);
          updateHUD();
        } else if (this._meditating && sinceHit < 4) {
          this._meditating = false;
          this._stopMeditationVfx();
        }
      }
    }

    // Contact damage is now handled by the melee AI state machine in src/combat/ai.js
    // (telegraph → strike → recover). The old distance-based continuous damage
    // block is intentionally removed to fix the "enemies never hurt players" bug.
  }

  _updateDragonSpine(dt) {
    const dm = this._dragonMeshes[this.form];
    if (!dm || !dm._segments) return;
    const segs = dm._segments;
    const headPos = dm.position.clone();
    headPos.y = 0.8;
    for (let i = 0; i < segs.length; i++) {
      const targetPos = i === 0 ? headPos :
        segs[i - 1].position.clone().add(new THREE.Vector3(0, -0.15, -0.35 * (i + 1) * 0.3));
      segs[i].position.lerp(targetPos, 0.25);
      segs[i].position.y = 0.5 + Math.sin(this._animPhase + i * 0.6) * 0.2;
    }
  }

  attack() {
    if (this._attackCd > 0) return;
    if (this.id === 1) this._monkAttack();
    else this._sisterAttack();
  }

  _monkAttack() {
    this._comboCount = (this._comboTimer > 0) ? this._comboCount + 1 : 1;
    if (this._comboCount > 3) this._comboCount = 1;
    this._comboTimer = 0.6;
    this._attackCd = 0.25;
    this._attackAnimActive = true;
    this._attackAnim = 0;

    const isFinisher = this._comboCount === 3;
    const baseDmg = this.atk;
    const dmg = isFinisher ? baseDmg * 2 : baseDmg;
    const range = isFinisher ? 3.5 : 2.5;

    if (isFinisher) {
      ctx.camState.p1.shake = 0.15;
      ctx.impactLight.color.setHex(0xffaa00);
      ctx.impactLight.intensity = 2;
      _fxTimers.push(setTimeout(() => { ctx.impactLight.intensity = 0; }, 150));
    }

    ctx.game._hitstop = isFinisher ? 0.08 : 0.04;

    let hit = false;
    ctx.gameState.spirits.forEach(s => {
      if (!s.alive) return;
      const d = this.pos.distanceTo(s.pos);
      if (d < range) {
        s.takeDamage(dmg, 'neutral');
        hit = true;
        if (isFinisher) knockback(s, this.pos, 4);
      }
    });

    if (!hit) ctx.game._hitstop = 0;
  }

  _sisterAttack() {
    this._attackCd = 0.35;
    this._attackAnimActive = true;
    this._attackAnim = 0;

    const form = this.form;
    const baseDmg = Math.round(this.atk * this._relicBonuses.elemDmg);

    if (form === 'human') {
      ctx.gameState.spirits.forEach(s => {
        if (!s.alive) return;
        if (this.pos.distanceTo(s.pos) < 2.5) s.takeDamage(baseDmg, 'neutral');
      });
    } else if (form === 'fire') {
      spawnBreathAttack(this, 'fire', baseDmg * 1.2, 8);
    } else if (form === 'ice') {
      spawnProjectile(this, 'ice', baseDmg, 12);
    } else if (form === 'poison') {
      spawnProjectile(this, 'poison', baseDmg * 0.5, 8, true);
    } else if (form === 'water') {
      spawnProjectile(this, 'water', baseDmg, 10, false, true);
    }

    ctx.camState.p2.shake = 0.06;
    ctx.impactLight.color.setHex(ELEMENT_COLORS[this.getElement()]);
    ctx.impactLight.intensity = 1.5;
    _fxTimers.push(setTimeout(() => { ctx.impactLight.intensity = 0; }, 100));
  }

  special() {
    if (this._specialCd > 0 || this.id !== 2) return;
    const form = this.form;
    if (form === 'human') return;
    this._specialCd = 8;

    if (form === 'fire') {
      const dir = this.facing.clone().normalize();
      const dashDist = 8;
      spawnFireTrail(this.pos.clone(), dir, dashDist);
      this.pos.addScaledVector(dir, dashDist);
      this.pos.x = THREE.MathUtils.clamp(this.pos.x, -ARENA_SIZE + 2, ARENA_SIZE - 2);
      this.pos.z = THREE.MathUtils.clamp(this.pos.z, -ARENA_SIZE + 2, ARENA_SIZE - 2);
      ctx.gameState.spirits.forEach(s => {
        if (s.alive && this.pos.distanceTo(s.pos) < 3) s.takeDamage(this.atk * 2, 'fire');
      });
      showToast('Fire Dash!');
    } else if (form === 'ice') {
      ctx.gameState.spirits.forEach(s => {
        if (!s.alive) return;
        if (this.pos.distanceTo(s.pos) < 6) {
          s.takeDamage(this.atk, 'ice');
          s._frozenTimer = 2;
          s.speed = 0;
        }
      });
      spawnFrostNova(this.pos);
      showToast('Frost Nova!');
    } else if (form === 'poison') {
      spawnToxicCloud(this.pos.clone());
      showToast('Toxic Cloud!');
    } else if (form === 'water') {
      const healAmt = Math.round(ctx.gameState.p1.maxHp * 0.2);
      ctx.gameState.p1.hp = Math.min(ctx.gameState.p1.hp + healAmt, ctx.gameState.p1.maxHp);
      ctx.gameState.p2.hp = Math.min(ctx.gameState.p2.hp + healAmt, ctx.gameState.p2.maxHp);
      spawnHealingRain(this.pos);
      showToast('Healing Rain!');
      updateHUD();
    }
  }

  chiShield() {
    if (this.id !== 1 || this._shieldCd > 0) return;
    this._shieldCd = 8;
    this._shieldTimer = 2.5;
    this.shieldActive = true;
    ctx.gameState.p2.shieldActive = true;

    const shieldMesh = new THREE.Mesh(
      new THREE.SphereGeometry(3, 12, 8),
      new THREE.MeshBasicMaterial({ color: 0xffdd55, transparent: true, opacity: 0.25, side: THREE.FrontSide })
    );
    shieldMesh.position.copy(this.pos);
    shieldMesh.position.y = 1;
    ctx.scene.add(shieldMesh);
    this._shieldMesh = shieldMesh;

    showToast('Chi Shield activated!');

    _fxTimers.push(setTimeout(() => {
      this.shieldActive = false;
      ctx.gameState.p2.shieldActive = false;
      if (this._shieldMesh) { ctx.scene.remove(this._shieldMesh); this._shieldMesh = null; }
    }, 2500));
  }

  healingPulse() {
    if (this.id !== 1 || this._healCd > 0) return;
    this._healCd = 10;
    const healAmt = Math.round(this.maxHp * 0.25);
    this.hp = Math.min(this.hp + Math.round(healAmt * 0.5), this.maxHp);
    const other = ctx.gameState.p2;
    if (other.pos.distanceTo(this.pos) < 8) {
      other.hp = Math.min(other.hp + healAmt, other.maxHp);
    }
    spawnHealRing(this.pos);
    showToast('Healing Pulse!');
    updateHUD();
  }

  dodge() {
    if (this._dodgeCd > 0) return;
    this._dodgeCd = 2;
    this._dodgeTimer = 0.3;
    this._iframes = 0.3;
    const dashDir = this.facing.clone().multiplyScalar(-4);
    dashDir.y = 0;
    this.pos.add(dashDir);
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, -ARENA_SIZE + 2, ARENA_SIZE - 2);
    this.pos.z = THREE.MathUtils.clamp(this.pos.z, -ARENA_SIZE + 2, ARENA_SIZE - 2);
  }

  // Meditation VFX
  _startMeditationVfx() {
    if (this._medAura) return;
    const scene = ctx.scene;
    const aura = new THREE.Mesh(
      new THREE.RingGeometry(0.6, 1.2, 32),
      new THREE.MeshBasicMaterial({ color: 0xffcc33, transparent: true, opacity: 0.5, side: THREE.DoubleSide })
    );
    aura.rotation.x = -Math.PI / 2;
    aura.position.copy(this.pos);
    aura.position.y = 0.05;
    scene.add(aura);
    this._medAura = aura;

    const spawnParticle = () => {
      if (!this._meditating) return;
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.07, 4, 4),
        new THREE.MeshBasicMaterial({ color: 0xff88cc, transparent: true, opacity: 0.9 })
      );
      mesh.position.copy(this.pos);
      mesh.position.x += (Math.random() - 0.5) * 1.2;
      mesh.position.y = 0.2;
      mesh.position.z += (Math.random() - 0.5) * 1.2;
      scene.add(mesh);
      _particles.push({ mesh, vel: new THREE.Vector3((Math.random() - 0.5) * 0.5, 1.5 + Math.random(), (Math.random() - 0.5) * 0.5), life: 1.2, maxLife: 1.2, type: 'lotus' });
    };
    for (let i = 0; i < 5; i++) spawnParticle();
    let acc = 0;
    const fxEntry = {
      timer: 999,
      tick: (dt) => {
        if (!this._meditating) { fxEntry.timer = 0; return; }
        if (this._medAura) {
          this._medAura.position.copy(this.pos);
          this._medAura.position.y = 0.05;
          this._medAura.rotation.z += dt * 1.2;
        }
        acc += dt;
        if (acc >= 0.15) { acc = 0; spawnParticle(); }
      },
      cleanup: () => {},
    };
    this._medFxEntry = fxEntry;
    _fxEffects.push(fxEntry);
  }

  _stopMeditationVfx() {
    if (this._medAura) { ctx.scene.remove(this._medAura); this._medAura = null; }
    if (this._medFxEntry) { this._medFxEntry.timer = 0; this._medFxEntry = null; }
  }
}
