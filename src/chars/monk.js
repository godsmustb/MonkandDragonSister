// src/chars/monk.js — chibi-anime warrior-monk (Player 1)
// Per docs/characters/monk.md. Saffron/burgundy layered robe, bare right shoulder,
// prayer beads, ringed khakkhara staff. IK arm contract preserved:
//   g._rUpperArm (shoulder pivot) → g._rForeArm (elbow pivot) → staff on forearm end.
import * as THREE from 'three';
import {
  toonMat, emissiveMat, lathe, makeFaceTexture, buildFaceDecal, buildMergedOutline,
} from './common.js';

// ---- Palette (monk.md) ----
const SAFFRON = 0xe08a2b;
const BURGUNDY = 0x7a2230;
const SKIN = 0xf0c79a;
const GOLD = 0xe8b84b;
const GOLD_DEEP = 0xb8862e;
const BEAD_WOOD = 0x6b3a26;
const JADE = 0x5fa86b;
const STAFF_WOOD = 0x8a5a34;
const INK = 0x2a1a14;

export function buildMonk() {
  const g = new THREE.Group();
  const outlineParts = []; // {geo,pos,rot,scale,hull} merged into one hull at the end

  const matSaffron = toonMat(SAFFRON);
  const matBurgundy = toonMat(BURGUNDY);
  const matSkin = toonMat(SKIN);
  const matGold = toonMat(GOLD);
  const matWood = toonMat(STAFF_WOOD);
  const matBead = toonMat(BEAD_WOOD);
  const matJadeEm = emissiveMat(JADE, 1.0);
  const matGoldEm = emissiveMat(GOLD, 1.4);

  const add = (mesh, cast = true) => { mesh.castShadow = cast; g.add(mesh); return mesh; };
  const ol = (geo, pos, rot, scale, hull = 1.04) =>
    outlineParts.push({ geo, pos, rot, scale, hull });

  // ===== ROBE SKIRT — LatheGeometry flaring bell (waist 0.95 → hem 0.30) =====
  const skirtPts = [
    [0.20, 0.95], [0.24, 0.80], [0.27, 0.62], [0.30, 0.45], [0.36, 0.34], [0.40, 0.30],
  ];
  const skirt = lathe(skirtPts, 24, matSaffron);
  add(skirt);
  ol(skirt.geometry, [0, 0, 0]);
  g._skirt = skirt;
  // inner lining (burgundy, slightly smaller, visible at hem)
  const linePts = skirtPts.map(([r, y]) => [r * 0.92, y - 0.01]);
  const skirtLine = lathe(linePts, 24, matBurgundy);
  add(skirtLine, false);
  // hem gold band
  const hem = lathe([[0.40, 0.30], [0.42, 0.295], [0.40, 0.285]], 24, matGold);
  add(hem, false);
  // front apron flap
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.55), matSaffron);
  apron.position.set(0, 0.62, 0.30);
  apron.rotation.x = -0.06;
  apron.material = matBurgundy;
  add(apron, false);
  const apronTrim = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.05), matGold);
  apronTrim.position.set(0, 0.34, 0.305);
  add(apronTrim, false);

  // ===== TORSO / ROBE UPPER =====
  // burgundy underlayer core (waist 0.95 up to shoulders ~1.40)
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.21, 0.50, 12), matBurgundy);
  torso.position.y = 1.18;
  add(torso);
  ol(torso.geometry, [0, 1.18, 0]);
  g._body = torso;

  // saffron robe front panel (left-covering, leaves right shoulder bare)
  const robePanel = lathe(
    [[0.20, 0.95], [0.225, 1.10], [0.24, 1.25], [0.22, 1.38]], 16, matSaffron);
  add(robePanel, false);
  // diagonal burgundy chest sash (left-high → right-low)
  const sash = new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.12, 0.02), matBurgundy);
  sash.position.set(0, 1.22, 0.20);
  sash.rotation.z = -0.5;
  add(sash, false);
  const sashTrim = new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.025, 0.022), matGold);
  sashTrim.position.set(0, 1.26, 0.205);
  sashTrim.rotation.z = -0.5;
  add(sashTrim, false);

  // left-shoulder saffron pauldron drape (sphere-cap)
  const pauldron = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), matSaffron);
  pauldron.position.set(-0.24, 1.40, 0);
  add(pauldron);
  ol(pauldron.geometry, [-0.24, 1.40, 0]);

  // gold collar ring at neckline
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.022, 6, 16), matGold);
  collar.position.y = 1.43;
  collar.rotation.x = Math.PI / 2;
  add(collar, false);

  // sash knot at right hip (2 spheres + 2 cone tails)
  const knot = new THREE.Group();
  knot.position.set(0.20, 1.00, 0.18);
  for (const dx of [-0.04, 0.04]) {
    const k = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), matBurgundy);
    k.position.x = dx; knot.add(k);
  }
  for (const dx of [-0.05, 0.06]) {
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.22, 6), matBurgundy);
    tail.position.set(dx, -0.13, 0); tail.rotation.x = 0.1; knot.add(tail);
  }
  g.add(knot);

  // ===== NECK & HEAD =====
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.10, 8), matSkin);
  neck.position.y = 1.45;
  add(neck);

  const HEAD_R = 0.26; // Ø0.52
  const headY = 1.40 + 0.30; // head center ~1.70? doc says 1.40. Use 1.66 for visible neck.
  const HEAD_CY = 1.68;
  const head = new THREE.Mesh(new THREE.SphereGeometry(HEAD_R, 20, 16), matSkin);
  head.position.y = HEAD_CY;
  head.scale.y = 0.96;
  add(head);
  ol(head.geometry, [0, HEAD_CY, 0], [0, 0, 0], [1, 0.96, 1], 1.035);
  g._head = head;

  // face decal (determined)
  const faceTex = makeFaceTexture({
    skin: '#f0c79a', iris: '#5a3a2a', brow: '#3a2418', mouth: '#7a2230',
    blush: '#e89a8a', expression: 'determined',
  });
  const face = buildFaceDecal(HEAD_R, faceTex);
  face.position.copy(head.position);
  face.scale.y = 0.96;
  g.add(face);
  g._face = face;

  // ears
  for (const sgn of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), matSkin);
    ear.scale.z = 0.5;
    ear.position.set(sgn * HEAD_R * 0.95, HEAD_CY, 0);
    add(ear, false);
  }
  // three ritual forehead dots (gold, emissive low)
  for (let i = 0; i < 3; i++) {
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 4), matGoldEm);
    dot.position.set(0, HEAD_CY + 0.14 - i * 0.05, HEAD_R * 0.97);
    g.add(dot);
  }

  // ===== ARMS =====
  // LEFT arm — saffron sleeve over skin (swings; g._lArm)
  const lArm = new THREE.Group();
  lArm.position.set(-0.26, 1.38, 0);
  const lUpper = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.065, 0.22, 8), matSaffron);
  lUpper.position.y = -0.11; lUpper.castShadow = true; lArm.add(lUpper);
  const lFore = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.055, 0.20, 8), matSkin);
  lFore.position.y = -0.32; lFore.castShadow = true; lArm.add(lFore);
  // sleeve cuff mini-flare
  const lCuff = lathe([[0.07, 0], [0.10, -0.06], [0.085, -0.09]], 12, matSaffron);
  lCuff.position.y = -0.20; lArm.add(lCuff);
  const lHand = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), matSkin);
  lHand.position.y = -0.44; lHand.scale.set(1, 1.1, 0.8); lArm.add(lHand);
  lArm.rotation.z = 0.18;
  g.add(lArm);
  g._lArm = lArm;
  ol(lUpper.geometry, [-0.26, 1.27, 0], [0, 0, 0], 1, 1.03);

  // RIGHT arm — BARE skin, IK chain. g._rUpperArm → g._rForeArm → staff.
  const rUpperArm = new THREE.Group();
  rUpperArm.position.set(0.26, 1.38, 0);
  const rUpperMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.065, 0.22, 8), matSkin);
  rUpperMesh.position.y = -0.11; rUpperMesh.castShadow = true;
  rUpperArm.add(rUpperMesh);
  // bare shoulder ball
  const rShoulder = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), matSkin);
  rShoulder.position.y = 0; rUpperArm.add(rShoulder);

  const rForeArm = new THREE.Group();
  rForeArm.position.y = -0.22;
  const rForeMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.055, 0.20, 8), matSkin);
  rForeMesh.position.y = -0.10; rForeMesh.castShadow = true;
  rForeArm.add(rForeMesh);
  const rHand = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 6), matSkin);
  rHand.position.y = -0.20; rHand.scale.set(1, 1.1, 0.85);
  rForeArm.add(rHand);
  rUpperArm.add(rForeArm);
  g.add(rUpperArm);
  g._rArm = rUpperArm;
  g._rUpperArm = rUpperArm;
  g._rForeArm = rForeArm;
  // wrist beaded bracelet on left handled in beads loop below

  // ===== PRAYER-BEAD NECKLACE (InstancedMesh) =====
  const beadCount = 22;
  const beadGeo = new THREE.SphereGeometry(0.022, 6, 5);
  const beads = new THREE.InstancedMesh(beadGeo, matBead, beadCount);
  const dummy = new THREE.Object3D();
  const neckR = 0.20;
  for (let i = 0; i < beadCount; i++) {
    const a = (i / beadCount) * Math.PI * 2;
    // drape: torus around neck, dipping lower at front
    const dip = Math.cos(a) > 0 ? 0.10 * Math.cos(a) : 0;
    dummy.position.set(Math.sin(a) * neckR, 1.32 - dip, Math.cos(a) * neckR * 0.7 + 0.02);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    beads.setMatrixAt(i, dummy.matrix);
  }
  g.add(beads);
  // jade guru bead (front center) + tassel
  const guru = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 6), matJadeEm);
  guru.position.set(0, 1.22, neckR * 0.7 + 0.04);
  g.add(guru);
  const tasselCone = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.06, 6), matBurgundy);
  tasselCone.position.set(0, 1.18, neckR * 0.7 + 0.04);
  g.add(tasselCone);
  for (const dx of [-0.012, 0, 0.012]) {
    const strand = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.09, 4), matBurgundy);
    strand.position.set(dx, 1.10, neckR * 0.7 + 0.04);
    g.add(strand);
  }

  // ===== FEET / SANDALS =====
  for (const sgn of [-1, 1]) {
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.05, 0.20), matSkin);
    foot.position.set(sgn * 0.10, 0.025, 0.04);
    add(foot);
    const sandal = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 0.22), toonMat(0x4a3020));
    sandal.position.set(sgn * 0.10, 0.015, 0.04);
    add(sandal, false);
    const ankle = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.06, 8), matBurgundy);
    ankle.position.set(sgn * 0.10, 0.32, 0);
    add(ankle, false);
  }

  // ===== KHAKKHARA STAFF (on forearm end) =====
  const staff = new THREE.Group();
  // forearm end is ~y=-0.20 in rForeArm space; place grip there, shaft extends up & down
  staff.position.y = -0.20;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 1.55, 8), matWood);
  shaft.castShadow = true;
  staff.add(shaft);
  // 3 gold bands
  for (const by of [-0.5, 0, 0.45]) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.008, 6, 12), matGold);
    band.position.y = by; band.rotation.x = Math.PI / 2; staff.add(band);
  }
  // head assembly atop shaft
  const staffHeadY = 0.80;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.018, 8, 20), matGoldEm);
  ring.position.y = staffHeadY; staff.add(ring);
  g._staffRing = ring;
  const finial = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.10, 6), matGold);
  finial.position.y = staffHeadY + 0.16; staff.add(finial);
  const lotus = lathe([[0.0, 0], [0.05, 0.02], [0.06, 0.05], [0.0, 0.08]], 8, matGold);
  lotus.position.y = staffHeadY - 0.14; staff.add(lotus);
  // 4 small jingle rings hung on main ring — kept in a group so anim can sway them
  const jingles = new THREE.Group();
  jingles.position.y = staffHeadY;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const jr = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.008, 6, 12), matGold);
    jr.position.set(Math.cos(a) * 0.13, 0.02, Math.sin(a) * 0.06);
    jr.rotation.x = Math.PI / 2;
    jr._baseAngle = a;
    jingles.add(jr);
  }
  staff.add(jingles);
  g._jingles = jingles;
  // pommel cap
  const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), matGold);
  pommel.position.y = -0.80; staff.add(pommel);
  rForeArm.add(staff);
  g._staff = staff;
  ol(shaft.geometry, [0, 0, 0], [0, 0, 0], 1, 1.025); // local outline approx; staff swings

  // ===== MERGED OUTLINE HULL (one draw call for the static body masses) =====
  const hull = buildMergedOutline(outlineParts, INK);
  if (hull) { hull.renderOrder = -1; g.add(hull); g._outline = hull; }

  g._kind = 'monk';
  return g;
}
