// src/chars/ik.js — two-bone IK solver (analytic, law-of-cosines)
import * as THREE from 'three';

/**
 * Solves two-bone IK and writes results directly into root/mid Object3D rotations.
 * @param {THREE.Object3D} root    – upper arm Object3D (world position = shoulder)
 * @param {THREE.Object3D} mid     – forearm Object3D (child of root, pivot = elbow)
 * @param {THREE.Vector3}  target  – world-space position of the hand target
 * @param {number}         l1      – upper-arm bone length
 * @param {number}         l2      – forearm bone length
 * @param {THREE.Vector3}  poleAxis – local-space pole direction (elbow hint)
 */
export function solveTwoBoneIK(root, mid, target, l1, l2, poleAxis) {
  // 1. Get shoulder world position
  const shoulderWorld = new THREE.Vector3();
  root.getWorldPosition(shoulderWorld);

  // 2. Clamp reach to avoid NaN
  const toTarget = new THREE.Vector3().subVectors(target, shoulderWorld);
  const reach = THREE.MathUtils.clamp(toTarget.length(), 0.001, 0.999 * (l1 + l2));
  const dir = toTarget.clone().normalize();

  // 3. Law of cosines – angle at shoulder
  const cosA = THREE.MathUtils.clamp(
    (reach * reach + l1 * l1 - l2 * l2) / (2 * reach * l1), -1, 1
  );
  const elbowAngle = Math.acos(cosA);

  // 4. Law of cosines – elbow bend angle
  const cosC = THREE.MathUtils.clamp(
    (l1 * l1 + l2 * l2 - reach * reach) / (2 * l1 * l2), -1, 1
  );
  const forearmBend = Math.PI - Math.acos(cosC);

  // 5. Build rotation frame
  const parentWorldQuat = new THREE.Quaternion();
  if (root.parent) root.parent.getWorldQuaternion(parentWorldQuat);
  const parentWorldQuatInv = parentWorldQuat.clone().invert();

  const up = poleAxis ? poleAxis.clone().applyQuaternion(parentWorldQuat) : new THREE.Vector3(0, 1, 0);
  const defaultDir = new THREE.Vector3(0, -1, 0);
  const facingQuat = new THREE.Quaternion().setFromUnitVectors(defaultDir, dir);

  const bendAxis = new THREE.Vector3().crossVectors(dir, up).normalize();
  if (bendAxis.lengthSq() < 0.0001) bendAxis.set(1, 0, 0);
  const bendQuat = new THREE.Quaternion().setFromAxisAngle(bendAxis, -elbowAngle);

  const shoulderWorldQuat = bendQuat.clone().multiply(facingQuat);
  const shoulderLocalQuat = parentWorldQuatInv.clone().multiply(shoulderWorldQuat);
  root.quaternion.copy(shoulderLocalQuat);

  // 6. Elbow / forearm
  const upperArmWorldQuat = shoulderWorldQuat;
  const upperArmWorldQuatInv = upperArmWorldQuat.clone().invert();
  const bendAxisLocal = bendAxis.clone().applyQuaternion(upperArmWorldQuatInv).normalize();
  if (bendAxisLocal.lengthSq() < 0.0001) bendAxisLocal.set(1, 0, 0);
  mid.quaternion.setFromAxisAngle(bendAxisLocal, forearmBend);
}
