// src/combat/ai.js — Spirit melee attack state machine
// States: idle → pursue → telegraph → strike → recover
// XZ-plane distances only (spirits hover at y≈1, players at y=0)
import * as THREE from 'three';
import { ctx } from '../state.js';
import { spawnTelegraphDecal, updateTelegraphDecal, removeTelegraphDecal } from './projectiles.js';
import { sfx } from '../audio/audio.js';

// Balance constants
export const MELEE_STRIKE_RANGE  = 3.5;  // enter telegraph when XZ dist < this
export const MELEE_HIT_RANGE     = 1.6;  // deal damage when XZ dist < this during strike
export const TELEGRAPH_DURATION  = 0.5;  // wind-up seconds
export const STRIKE_DURATION     = 0.25; // lunge seconds
export const RECOVER_DURATION    = 1.75; // slow drift seconds
export const PURSUE_STOP_DIST    = 3.8;  // stop closing when this close (inside strike range)
export const LUNGE_SPEED         = 18;   // units/s during strike

const _xz = new THREE.Vector3();

/** Horizontal (XZ) distance between two objects with .pos */
export function xzDist(a, b) {
  _xz.set(a.pos.x - b.pos.x, 0, a.pos.z - b.pos.z);
  return _xz.length();
}

/**
 * Initialise the AI state machine fields on a spirit.
 * Call this once in Spirit constructor (or just let updateMeleeAI
 * lazy-initialise on first call).
 */
export function initMeleeAI(spirit) {
  spirit._aiState      = 'pursue';  // pursue | telegraph | strike | recover
  spirit._aiTimer      = 0;
  spirit._strikeHit    = false;
  spirit._strikeTarget = null;     // cached target pos for lunge direction
  spirit._strikeDirXZ  = new THREE.Vector3();
}

/**
 * Run one dt tick of the melee state machine.
 * Called from Spirit.update() INSTEAD of the old distance-based pursuit block.
 *
 * Returns true if the spirit moved itself (so Spirit.update can skip its own
 * pursuit movement for this frame).
 */
export function updateMeleeAI(spirit, dt, nearest, nearXZDist) {
  if (!spirit._aiState) initMeleeAI(spirit);
  if (spirit._pinned) return true; // screenshot-probe hold: no movement

  const state = spirit._aiState;

  // ── PURSUE ───────────────────────────────────────────────────────────────
  if (state === 'pursue') {
    if (nearest && nearXZDist > PURSUE_STOP_DIST) {
      // Move toward target on XZ plane
      const dx = nearest.pos.x - spirit.pos.x;
      const dz = nearest.pos.z - spirit.pos.z;
      const len = Math.sqrt(dx * dx + dz * dz) || 1;
      spirit._vel.lerp(
        new THREE.Vector3((dx / len) * spirit.speed, 0, (dz / len) * spirit.speed),
        0.08
      );
      spirit.pos.x += spirit._vel.x * dt;
      spirit.pos.z += spirit._vel.z * dt;
      spirit.mesh.rotation.y = Math.atan2(spirit._vel.x, spirit._vel.z);
    }

    if (nearest && nearXZDist < MELEE_STRIKE_RANGE) {
      // Enter telegraph
      spirit._aiState = 'telegraph';
      spirit._aiTimer = TELEGRAPH_DURATION;
      spirit._strikeHit = false;
      // Scale up (wind-up visual) — remember the demon's resting scale (per-type / boss).
      spirit._restScale = spirit.mesh.scale.x;
      spirit.mesh.scale.setScalar(spirit._restScale * 1.25);
      if (spirit._body && spirit._body.material && spirit._body.material.emissive !== undefined) {
        spirit._body.material.emissive = new THREE.Color(1.0, 0.4, 0);
      }
      // Spawn ground telegraph decal
      spirit._telegraphDecal = spawnTelegraphDecal(spirit);
      try { sfx.telegraphGrowl(); } catch {}
    }
    return true;
  }

  // ── TELEGRAPH ────────────────────────────────────────────────────────────
  if (state === 'telegraph') {
    spirit._aiTimer -= dt;
    // Slight pull-back
    if (nearest) {
      const dx = nearest.pos.x - spirit.pos.x;
      const dz = nearest.pos.z - spirit.pos.z;
      const len = Math.sqrt(dx * dx + dz * dz) || 1;
      // Drift slightly away
      spirit.pos.x -= (dx / len) * 1.5 * dt;
      spirit.pos.z -= (dz / len) * 1.5 * dt;
    }
    // Pulsing emissive
    const pulse = Math.abs(Math.sin(spirit._aiTimer * Math.PI * 6));
    if (spirit._body && spirit._body.material && spirit._body.material.emissive !== undefined) {
      spirit._body.material.emissive = new THREE.Color(pulse, pulse * 0.4, 0);
    }

    // Update telegraph decal progress
    if (spirit._telegraphDecal) {
      const progress = 1 - spirit._aiTimer / TELEGRAPH_DURATION;
      updateTelegraphDecal(spirit._telegraphDecal, spirit, progress);
    }

    if (spirit._aiTimer <= 0) {
      // Enter strike: cache target position for lunge direction
      spirit._aiState = 'strike';
      spirit._aiTimer = STRIKE_DURATION;
      spirit._strikeHit = false;
      try { sfx.enemyStrike(); } catch {}
      if (nearest) {
        spirit._strikeTarget = nearest;
        const dx = nearest.pos.x - spirit.pos.x;
        const dz = nearest.pos.z - spirit.pos.z;
        const len = Math.sqrt(dx * dx + dz * dz) || 1;
        spirit._strikeDirXZ.set(dx / len, 0, dz / len);
      }
      // Reset scale to the demon's resting scale (per-type / boss).
      spirit.mesh.scale.setScalar(spirit._restScale != null ? spirit._restScale : 1.0);
      if (spirit._body && spirit._body.material && spirit._body.material.emissive !== undefined) {
        spirit._body.material.emissive = new THREE.Color(0, 0, 0);
      }
      // Remove telegraph decal on strike
      if (spirit._telegraphDecal) {
        removeTelegraphDecal(spirit._telegraphDecal);
        spirit._telegraphDecal = null;
      }
    }
    return true;
  }

  // ── STRIKE ───────────────────────────────────────────────────────────────
  if (state === 'strike') {
    spirit._aiTimer -= dt;

    // Lunge
    spirit.pos.x += spirit._strikeDirXZ.x * LUNGE_SPEED * dt;
    spirit.pos.z += spirit._strikeDirXZ.z * LUNGE_SPEED * dt;

    // Check hit (once per strike)
    if (!spirit._strikeHit && nearest) {
      const curXZDist = xzDist(spirit, nearest);
      if (curXZDist < MELEE_HIT_RANGE) {
        spirit._strikeHit = true;
        // dealDamageToPlayer is injected on spirits.js — call it via the spirit reference
        if (spirit._dealDmgFn) {
          spirit._dealDmgFn(nearest, spirit.atk, spirit.element);
        }
        // Red viewport-edge flash
        _flashViewport(nearest.id);
      }
    }

    if (spirit._aiTimer <= 0) {
      spirit._aiState = 'recover';
      spirit._aiTimer = RECOVER_DURATION * (0.9 + Math.random() * 0.4);
      spirit._vel.set(0, 0, 0);
    }
    return true;
  }

  // ── RECOVER ──────────────────────────────────────────────────────────────
  if (state === 'recover') {
    spirit._aiTimer -= dt;
    // Slow drift away
    if (nearest) {
      const dx = spirit.pos.x - nearest.pos.x;
      const dz = spirit.pos.z - nearest.pos.z;
      const len = Math.sqrt(dx * dx + dz * dz) || 1;
      spirit.pos.x += (dx / len) * 1.2 * dt;
      spirit.pos.z += (dz / len) * 1.2 * dt;
    }
    // Ensure decal cleaned up
    if (spirit._telegraphDecal) {
      removeTelegraphDecal(spirit._telegraphDecal);
      spirit._telegraphDecal = null;
    }

    if (spirit._aiTimer <= 0) {
      spirit._aiState = 'pursue';
    }
    return true;
  }

  return false;
}

// ── Red viewport-edge flash ───────────────────────────────────────────────
const _flashCooldown = { 1: 0, 2: 0 };

function _flashViewport(playerId) {
  const now = performance.now();
  if (now - (_flashCooldown[playerId] || 0) < 300) return;
  _flashCooldown[playerId] = now;

  const side = playerId === 1 ? 'left:0;' : 'left:50%;';
  const el = document.createElement('div');
  el.style.cssText = `
    position:fixed;top:0;${side}width:50%;height:100%;
    background:rgba(220,0,0,0);
    border:6px solid rgba(220,30,30,0.85);
    box-shadow:inset 0 0 60px 20px rgba(220,0,0,0.5);
    pointer-events:none;z-index:75;
    animation:dmgFlash 0.45s ease-out forwards;
  `;
  document.body.appendChild(el);

  // Ensure keyframes exist
  if (!document.getElementById('_dmgFlashStyle')) {
    const s = document.createElement('style');
    s.id = '_dmgFlashStyle';
    s.textContent = `@keyframes dmgFlash{0%{opacity:1;}100%{opacity:0;}}`;
    document.head.appendChild(s);
  }

  setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 500);
}
