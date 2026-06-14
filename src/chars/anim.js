// src/chars/anim.js — procedural character animation (monk + sister human form)
// Walk/run cycles, idle breathing, twin-tail/sleeve/robe sway, monk IK staff combo,
// sister palm-strike. Death/KO kneel handled by caller (mesh swap) — we no-op when KO.
import * as THREE from 'three';
import { solveTwoBoneIK } from './ik.js';

const _v = new THREE.Vector3();

export function _animateCharacter(player, dt, moving) {
  const cm = player.currentMesh();
  if (!cm) return;
  if (cm._isGltf && cm._char) {           // ContentGenAI v1.5: rigged-GLB hero -> clip state machine
    const c = cm._char;
    if (player.isKO) c.play('death', 0.12);
    else if (player._attackCd > 0 && player._comboCount > 0) c.play('attack' + Math.min(3, player._comboCount));
    else c.setLocomotion(moving, false);
    c.update(dt);
    return;
  }
  if (player.isKO) return; // kneel pose is a static transform set elsewhere

  const phase = player._animPhase;
  const sin = Math.sin(phase);
  const cos = Math.cos(phase);
  // running = fast anim phase rate (set in abilities update); approximate from moving
  const speedScale = moving ? 1 : 0;

  if (player.id === 1) {
    animateMonk(player, cm, dt, moving, phase, sin, cos);
  } else if (player.form === 'human') {
    animateSister(player, cm, dt, moving, phase, sin, cos);
  }
}

// =====================================================================
//  MONK
// =====================================================================
function animateMonk(player, cm, dt, moving, phase, sin, cos) {
  // Body bob + breathing + lean
  const bob = moving ? Math.abs(sin) * 0.04 : 0;
  const breathe = 1 + Math.sin(phase * 0.45) * 0.02;
  if (cm._body) {
    cm._body.position.y = 1.18 + bob;
    cm._body.scale.set(1, breathe, 1);
  }
  if (cm._head) cm._head.position.y = 1.68 + bob;
  if (cm._face) cm._face.position.y = 1.68 + bob;
  // forward lean while moving (run)
  cm.rotation.x = moving ? 0.12 : 0;

  // LEFT arm counter-swing
  if (cm._lArm) {
    cm._lArm.rotation.x = moving ? sin * 0.6 : Math.sin(phase * 0.5) * 0.05;
  }

  // Skirt hem sway (lag): rotate the whole skirt slightly opposite lead leg
  if (cm._skirt) cm._skirt.rotation.z = moving ? -sin * 0.06 : Math.sin(phase * 0.4) * 0.01;

  // Jingle rings micro-sway (follow-through)
  if (cm._jingles) {
    cm._jingles.children.forEach((jr, i) => {
      jr.rotation.z = Math.sin(phase * 2 + i) * (moving ? 0.3 : 0.08);
    });
  }

  // ---- Staff combo via two-bone IK on the right arm ----
  if (player._attackAnimActive && cm._rUpperArm && cm._rForeArm) {
    const t = player._attackAnim; // 0→1
    const pPos = player.pos;
    const fwd = player.facing.clone();
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    // Shoulder is at world ~y 1.38; targets sit around that height now.
    const windUp = pPos.clone().addScaledVector(right, 0.35).addScaledVector(fwd, -0.35)
      .add(new THREE.Vector3(0, 1.75, 0));
    const strike = pPos.clone().addScaledVector(right, 0.25).addScaledVector(fwd, 0.95)
      .add(new THREE.Vector3(0, 1.05, 0));
    const recover = pPos.clone().addScaledVector(right, 0.45)
      .add(new THREE.Vector3(0, 1.15, 0));

    let handTarget;
    if (t < 0.45) {
      handTarget = windUp.clone().lerp(strike, easeOut(t / 0.45));
    } else {
      handTarget = strike.clone().lerp(recover, (t - 0.45) / 0.55);
    }
    const poleAxis = right.clone().add(new THREE.Vector3(0, 0.3, 0)).normalize();
    solveTwoBoneIK(cm._rUpperArm, cm._rForeArm, handTarget, 0.42, 0.40, poleAxis);
  } else if (cm._rUpperArm) {
    // Guard / idle rest: staff held at angle, slight sway
    cm._rUpperArm.quaternion.identity();
    cm._rUpperArm.rotation.x = moving ? -Math.sin(phase) * 0.5 : Math.sin(phase * 0.5 + 1) * 0.05;
    cm._rUpperArm.rotation.z = -0.35;
    if (cm._rForeArm) { cm._rForeArm.quaternion.identity(); cm._rForeArm.rotation.x = -0.4; }
  }
}

// =====================================================================
//  SISTER (human form)
// =====================================================================
function animateSister(player, cm, dt, moving, phase, sin, cos) {
  // Graceful float + breathing
  const bob = moving ? Math.abs(sin) * 0.035 : Math.sin(phase * 0.4) * 0.01;
  const breathe = 1 + Math.sin(phase * 0.4) * 0.02;
  if (cm._body) { cm._body.position.y = 1.15 + bob; cm._body.scale.set(1, breathe, 1); }
  if (cm._head) cm._head.position.y = 1.64 + bob;
  if (cm._face) cm._face.position.y = 1.64 + bob;
  if (cm._hair) cm._hair.position.y = bob;
  cm.rotation.x = moving ? 0.10 : 0;

  // Arms: palm-strike anim or relaxed sway
  if (player._attackAnimActive) {
    const t = player._attackAnim;
    // coil → release: both arms thrust forward (open-palm), ease-out
    const coil = t < 0.4 ? t / 0.4 : 1;
    const release = t < 0.4 ? 0 : easeOut((t - 0.4) / 0.6);
    if (cm._lArm) { cm._lArm.rotation.x = -coil * 0.8 + release * 1.6; cm._lArm.rotation.z = 0.22 - release * 0.15; }
    if (cm._rArm) { cm._rArm.rotation.x = -coil * 0.8 + release * 1.6; cm._rArm.rotation.z = -0.22 + release * 0.15; }
  } else {
    if (cm._lArm) cm._lArm.rotation.x = moving ? sin * 0.45 : Math.sin(phase * 0.4) * 0.04;
    if (cm._rArm) cm._rArm.rotation.x = moving ? -sin * 0.45 : Math.sin(phase * 0.4 + 1) * 0.04;
  }

  // Sleeve trail (follow-through): sleeves lag arm motion
  if (cm._sleeves) {
    for (const s of cm._sleeves) {
      const lag = Math.sin(phase - 0.6) * (moving ? 0.18 : 0.05);
      // sleeve is child of arm; add a little extra droop/sway
      s.sleeve.rotation.x = lag * 0.3;
    }
  }

  // Skirt hem sway
  if (cm._skirt) cm._skirt.rotation.z = moving ? -sin * 0.07 : Math.sin(phase * 0.35) * 0.012;

  // Sash ribbon sway
  if (cm._sashRibbons) {
    cm._sashRibbons.children.forEach((rib, i) => {
      rib.rotation.x = -0.2 + Math.sin(phase * 1.4 + i) * (moving ? 0.3 : 0.1);
    });
  }

  // Ahoge bounce
  if (cm._ahoge) cm._ahoge.rotation.z = -0.5 + Math.sin(phase * 2.2) * 0.15;

  // Jade glow pulse
  if (cm._jade && cm._jade.material.emissiveIntensity != null)
    cm._jade.material.emissiveIntensity = 1.0 + Math.sin(phase * 1.5) * 0.4;

  // ---- Twin-tail spring sway (verlet-ish damped lag) ----
  animateTwinTails(player, cm, dt, moving, phase);
}

function animateTwinTails(player, cm, dt, moving, phase) {
  if (!cm._tails) return;
  // Drive base impulse from movement: facing velocity & body sway push the tails.
  const driveX = moving ? Math.sin(phase) * 0.5 : Math.sin(phase * 0.4) * 0.08;
  const driveZ = moving ? 0.3 : 0; // stream back when running
  const stiffness = 0.25, damping = 0.85;

  for (const tail of cm._tails) {
    // Two DOF spring at the root (swayX side-to-side, swayZ front-back)
    const tgtX = driveX * tail.side * 0.6;
    const tgtZ = driveZ;
    tail.swayVX += (tgtX - tail.swayX) * stiffness;
    tail.swayVX *= damping;
    tail.swayX += tail.swayVX;
    tail.swayVZ += (tgtZ - tail.swayZ) * stiffness;
    tail.swayVZ *= damping;
    tail.swayZ += tail.swayVZ;

    // Apply increasing sway down the chain (each node adds a fraction + gravity bias down)
    tail.nodes.forEach((n, i) => {
      const f = (i + 1) / tail.nodes.length;
      n.node.rotation.z = THREE.MathUtils.clamp(tail.swayX * f, -0.6, 0.6);
      n.node.rotation.x = THREE.MathUtils.clamp(tail.swayZ * f + 0.04 * i, -0.6, 0.9);
    });
  }
}

function easeOut(t) { return 1 - (1 - t) * (1 - t); }
