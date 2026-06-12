// src/chars/sister.js — Dragon Sister, human form (Player 2)
// Per docs/characters/dragon-sister.md. Teal/white hanfu, wide lathe sleeves,
// physics-sway twin-tails, gold horn hairpins, jade pendant.
// Contract: g._lArm, g._rArm, g._head, g._body. Adds g._tails (sway), g._sleeves.
import * as THREE from 'three';
import {
  toonMat, emissiveMat, lathe, makeFaceTexture, buildFaceDecal, buildMergedOutline,
} from './common.js';

// ---- Palette (dragon-sister.md) ----
const TEAL = 0x2fa8b5;
const WHITE = 0xf4f7f5;
const CYAN = 0x46d6e0;
const GOLD = 0xe8b84b;
const HAIR = 0x2b2438;
const HAIR_HI = 0x4a4060;
const SKIN = 0xf3d2b0;
const JADE = 0x5fa86b;
const INK = 0x241a28;

export function buildSister() {
  const g = new THREE.Group();
  const outlineParts = [];

  const matTeal = toonMat(TEAL);
  const matWhite = toonMat(WHITE);
  const matCyan = toonMat(CYAN);
  const matGold = toonMat(GOLD);
  const matHair = toonMat(HAIR);
  const matSkin = toonMat(SKIN);
  const matJadeEm = emissiveMat(JADE, 1.0);
  const matGoldEm = emissiveMat(GOLD, 1.2);

  const add = (mesh, cast = true) => { mesh.castShadow = cast; g.add(mesh); return mesh; };
  const ol = (geo, pos, rot, scale, hull = 1.04) =>
    outlineParts.push({ geo, pos, rot, scale, hull });

  // ===== DRESS SKIRT — A-line lathe (waist 0.92 → hem 0.10) =====
  const skirtPts = [[0.18, 0.92], [0.22, 0.70], [0.26, 0.48], [0.30, 0.26], [0.34, 0.10]];
  const skirt = lathe(skirtPts, 24, matTeal);
  add(skirt);
  ol(skirt.geometry, [0, 0, 0]);
  g._skirt = skirt;
  const skirtLine = lathe(skirtPts.map(([r, y]) => [r * 0.9, y + 0.005]), 24, matWhite);
  add(skirtLine, false);
  const hem = lathe([[0.34, 0.10], [0.36, 0.095], [0.34, 0.085]], 24, matGold);
  add(hem, false);
  // front slit showing white lining + leg
  const slit = new THREE.Mesh(new THREE.PlaneGeometry(0.10, 0.6), matWhite);
  slit.position.set(0, 0.42, 0.30); add(slit, false);

  // ===== TORSO / BODICE =====
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.19, 0.46, 12), matWhite);
  torso.position.y = 1.15;
  add(torso);
  ol(torso.geometry, [0, 1.15, 0]);
  g._body = torso;
  // teal bodice front/back panels
  const bodice = new THREE.Mesh(new THREE.CylinderGeometry(0.185, 0.185, 0.40, 12, 1, true), matTeal);
  bodice.position.y = 1.18; add(bodice, false);
  // cross-collar lapels (two diagonal planes crossing R-over-L)
  for (const sgn of [-1, 1]) {
    const lapel = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.34), matWhite);
    lapel.position.set(sgn * 0.05, 1.28, 0.17);
    lapel.rotation.z = sgn * 0.55; lapel.rotation.x = -0.1;
    add(lapel, false);
    const trim = new THREE.Mesh(new THREE.PlaneGeometry(0.025, 0.34), matGold);
    trim.position.set(sgn * 0.12, 1.28, 0.175);
    trim.rotation.z = sgn * 0.55; trim.rotation.x = -0.1;
    add(trim, false);
  }
  // waist sash (cyan obi)
  const sash = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.20, 0.10, 12), matCyan);
  sash.position.y = 0.96; add(sash, false);
  // sash bow at back (2 loops + 2 trailing ribbons that sway)
  const bow = new THREE.Group();
  bow.position.set(0, 0.98, -0.18);
  for (const sgn of [-1, 1]) {
    const loop = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.02, 6, 12), matCyan);
    loop.position.x = sgn * 0.06; loop.scale.y = 0.7; bow.add(loop);
  }
  const ribbons = new THREE.Group();
  for (const sgn of [-1, 1]) {
    const rib = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.35), matCyan);
    rib.position.set(sgn * 0.04, -0.18, 0); rib.rotation.x = -0.2;
    rib._baseX = sgn * 0.04; ribbons.add(rib);
  }
  bow.add(ribbons);
  g.add(bow);
  g._sashRibbons = ribbons;

  // ===== NECK & HEAD =====
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.10, 8), matSkin);
  neck.position.y = 1.40; add(neck);

  const HEAD_R = 0.25; // Ø0.50
  const HEAD_CY = 1.64;
  const head = new THREE.Mesh(new THREE.SphereGeometry(HEAD_R, 20, 16), matSkin);
  head.position.y = HEAD_CY; head.scale.y = 0.97;
  add(head);
  ol(head.geometry, [0, HEAD_CY, 0], [0, 0, 0], [1, 0.97, 1], 1.035);
  g._head = head;

  const faceTex = makeFaceTexture({
    skin: '#f3d2b0', iris: '#2fb5c4', brow: '#3a3048', mouth: '#d98a8a',
    blush: '#d98a8a', expression: 'gentle', lashes: true,
  });
  const face = buildFaceDecal(HEAD_R, faceTex);
  face.position.copy(head.position); face.scale.y = 0.97;
  g.add(face);
  g._face = face;

  // ===== HAIR — layered curved meshes =====
  const hairGroup = new THREE.Group();
  // back skull cap (larger than head) — shallower at front so it doesn't dip over eyes
  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(HEAD_R * 1.06, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), matHair);
  cap.position.copy(head.position); cap.position.set(0, HEAD_CY + 0.04, -0.03);
  hairGroup.add(cap);
  ol(cap.geometry, [head.position.x, head.position.y, -0.02], [0, 0, 0], 1, 1.03);
  // crown volume
  const crown = new THREE.Mesh(
    new THREE.SphereGeometry(HEAD_R * 0.85, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), matHair);
  crown.position.set(0, HEAD_CY + 0.10, -0.05); hairGroup.add(crown);
  // bang clusters (teardrop cones over forehead, center part) — sit ABOVE the eyes,
  // framing the face rather than covering it.
  const bangX = [-0.17, -0.10, -0.03, 0.04, 0.11, 0.18];
  const bangLen = [0.13, 0.15, 0.14, 0.14, 0.15, 0.12];
  bangX.forEach((bx, i) => {
    const bang = new THREE.Mesh(new THREE.ConeGeometry(0.05, bangLen[i], 6), matHair);
    bang.position.set(bx, HEAD_CY + 0.22, HEAD_R * 0.80);
    bang.rotation.x = Math.PI; bang.rotation.z = bx * 0.5;
    hairGroup.add(bang);
  });
  // side fringe (longer locks framing face)
  for (const sgn of [-1, 1]) {
    const fringe = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.34, 6), matHair);
    fringe.position.set(sgn * HEAD_R * 0.92, HEAD_CY - 0.05, 0.10);
    fringe.rotation.x = Math.PI - 0.1; fringe.rotation.z = sgn * 0.12;
    hairGroup.add(fringe);
  }
  // ahoge (cowlick) — springs up from crown
  const ahoge = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.18, 5), matHair);
  ahoge.position.set(0.04, HEAD_CY + 0.30, -0.02);
  ahoge.rotation.z = -0.5; ahoge.rotation.x = -0.3;
  hairGroup.add(ahoge);
  g._ahoge = ahoge;
  g.add(hairGroup);
  g._hair = hairGroup;

  // hair-tie rings + twin-tail anchors
  const tailBaseY = HEAD_CY + 0.02;
  for (const sgn of [-1, 1]) {
    const tie = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.012, 6, 12), matGold);
    tie.position.set(sgn * HEAD_R * 1.0, tailBaseY, -0.08);
    tie.rotation.y = Math.PI / 2;
    g.add(tie);
  }

  // ===== TWIN-TAILS — chain of tapered spheres w/ spring sway =====
  // Each tail is a group of node-groups; anim.js drives sway via g._tails.
  g._tails = [];
  const SEG = 9;
  for (const sgn of [-1, 1]) {
    const tail = new THREE.Group();
    tail.position.set(sgn * HEAD_R * 1.0, tailBaseY, -0.08);
    const nodes = [];
    let parent = tail;
    for (let i = 0; i < SEG; i++) {
      const node = new THREE.Group();
      node.position.y = i === 0 ? 0 : -0.10;
      const r = 0.05 - (i / SEG) * 0.034; // 0.10Ø → 0.03Ø
      const bead = new THREE.Mesh(new THREE.SphereGeometry(Math.max(r, 0.016), 8, 6), matHair);
      bead.scale.y = 1.2;
      node.add(bead);
      parent.add(node);
      parent = node;
      nodes.push({ node, restAngle: 0, vel: 0 });
    }
    // tip tuft
    const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.10, 6), matHair);
    tuft.position.y = -0.08; tuft.rotation.x = Math.PI;
    parent.add(tuft);
    g.add(tail);
    g._tails.push({ root: tail, nodes, side: sgn, swayX: 0, swayVX: 0, swayZ: 0, swayVZ: 0 });
  }

  // ===== DRAGON-HORN HAIRPINS (gold cones, emissive — foreshadow dragon) =====
  for (const sgn of [-1, 1]) {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.20, 6), matGoldEm);
    horn.position.set(sgn * HEAD_R * 0.82, HEAD_CY + 0.20, 0.0);
    horn.rotation.z = sgn * 0.5; horn.rotation.x = -0.5;
    g.add(horn);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 5), matGold);
    cap.position.set(sgn * HEAD_R * 0.82, HEAD_CY + 0.12, 0.02);
    g.add(cap);
  }

  // ===== ARMS — slim, mostly inside wide sleeves =====
  const matArmSkin = matSkin;
  const lArm = new THREE.Group();
  lArm.position.set(-0.20, 1.32, 0);
  const lUp = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.40, 8), matArmSkin);
  lUp.position.y = -0.20; lArm.add(lUp);
  const lHand = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), matArmSkin);
  lHand.position.y = -0.42; lHand.scale.set(0.9, 1.1, 0.8); lArm.add(lHand);
  lArm.rotation.z = 0.22; add(lArm, false); g._lArm = lArm;

  const rArm = new THREE.Group();
  rArm.position.set(0.20, 1.32, 0);
  const rUp = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.40, 8), matArmSkin);
  rUp.position.y = -0.20; rArm.add(rUp);
  const rHand = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), matArmSkin);
  rHand.position.y = -0.42; rHand.scale.set(0.9, 1.1, 0.8); rArm.add(rHand);
  rArm.rotation.z = -0.22; add(rArm, false); g._rArm = rArm;

  // ===== WIDE SLEEVES — lathe bells flaring past hands (attached to arms) =====
  // Profile from shoulder(0) → cuff: (0.10,0)(0.12,-0.20)(0.16,-0.40)(0.22,-0.60)(0.28,-0.72)
  g._sleeves = [];
  const slvPts = [[0.10, 0], [0.12, -0.20], [0.16, -0.40], [0.22, -0.60], [0.28, -0.72]];
  const slvLinePts = slvPts.map(([r, y]) => [r * 0.85, y]);
  for (const [armGroup, sgn] of [[lArm, -1], [rArm, 1]]) {
    const sleeve = lathe(slvPts, 16, matTeal);
    sleeve.castShadow = true;
    armGroup.add(sleeve);
    const lining = lathe(slvLinePts, 16, matWhite);
    armGroup.add(lining);
    const cuff = lathe([[0.28, -0.72], [0.30, -0.73], [0.28, -0.74]], 16, matGold);
    armGroup.add(cuff);
    g._sleeves.push({ sleeve, arm: armGroup, side: sgn });
  }

  // ===== JADE PENDANT =====
  const cord = new THREE.Mesh(new THREE.TorusGeometry(0.10, 0.006, 6, 16), toonMat(0x222018));
  cord.position.y = 1.34; cord.rotation.x = Math.PI / 2; add(cord, false);
  const jade = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.018, 8, 16), matJadeEm);
  jade.position.set(0, 1.20, 0.16); add(jade, false);
  g._jade = jade;
  for (const sgn of [-1, 1]) {
    const cb = new THREE.Mesh(new THREE.SphereGeometry(0.016, 6, 5), matGold);
    cb.position.set(sgn * 0.05, 1.27, 0.14); add(cb, false);
  }

  // ===== LEGS / FEET =====
  for (const sgn of [-1, 1]) {
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.05, 0.18), matWhite);
    shoe.position.set(sgn * 0.08, 0.03, 0.05); add(shoe);
    const toe = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), matGold);
    toe.position.set(sgn * 0.08, 0.05, 0.13); add(toe, false);
    const ribbon = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.01, 6, 12), matCyan);
    ribbon.position.set(sgn * 0.08, 0.10, 0); ribbon.rotation.x = Math.PI / 2; add(ribbon, false);
  }

  // ===== MERGED OUTLINE HULL =====
  const hull = buildMergedOutline(outlineParts, INK);
  if (hull) { hull.renderOrder = -1; g.add(hull); g._outline = hull; }

  g._kind = 'sister';
  return g;
}
