// src/chars/anim.js — _animateCharacter and animation helpers
import * as THREE from 'three';
import { solveTwoBoneIK } from './ik.js';

/**
 * Animate a player's character mesh for the current frame.
 * Called from Player.update() via player._animateCharacter(dt, moving).
 * We attach this as a method on the Player instance in combat/abilities.js.
 */
export function _animateCharacter(player, dt, moving) {
  const cm = player.currentMesh();
  if (!cm) return;
  const sin = Math.sin(player._animPhase);
  if (player.id === 1) {
    if (cm._lArm) cm._lArm.rotation.x = moving ? sin * 0.5 : Math.sin(player._animPhase * 0.5) * 0.05;

    // Two-bone IK attack animation
    if (player._attackAnimActive && cm._rUpperArm && cm._rForeArm) {
      const t = player._attackAnim; // 0→1
      const pPos = player.pos;
      const fwd = player.facing.clone();
      const right = new THREE.Vector3(-fwd.z, 0, fwd.x);

      const windUpTarget = pPos.clone()
        .addScaledVector(right, 0.5)
        .addScaledVector(fwd, -0.5)
        .add(new THREE.Vector3(0, 2.2, 0));

      const strikeTarget = pPos.clone()
        .addScaledVector(right, 0.4)
        .addScaledVector(fwd, 1.8)
        .add(new THREE.Vector3(0, 1.0, 0));

      const recoverTarget = pPos.clone()
        .addScaledVector(right, 0.8)
        .add(new THREE.Vector3(0, 1.0, 0));

      let handTarget;
      if (t < 0.5) {
        const s = t / 0.5;
        handTarget = windUpTarget.clone().lerp(strikeTarget, s);
      } else {
        const s = (t - 0.5) / 0.5;
        handTarget = strikeTarget.clone().lerp(recoverTarget, s);
      }

      const poleAxis = right.clone().add(new THREE.Vector3(0, 0.3, 0)).normalize();
      solveTwoBoneIK(cm._rUpperArm, cm._rForeArm, handTarget, 0.42, 0.40, poleAxis);
    } else if (!player._attackAnimActive && cm._rUpperArm) {
      cm._rUpperArm.quaternion.identity();
      cm._rUpperArm.rotation.x = moving ? -sin * 0.5 : Math.sin(player._animPhase * 0.5 + 1) * 0.05;
      cm._rUpperArm.rotation.z = -0.4;
      if (cm._rForeArm) cm._rForeArm.quaternion.identity();
    }

    if (cm._body) cm._body.position.y = 0.9 + Math.sin(player._animPhase * 0.5) * 0.02;
  } else {
    if (cm._lArm) cm._lArm.rotation.x = moving ? sin * 0.4 : 0;
    if (cm._rArm) cm._rArm.rotation.x = moving ? -sin * 0.4 : 0;
  }
}
