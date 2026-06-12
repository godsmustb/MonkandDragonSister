// src/combat/demons.js — Pass 3 demon builders (5 designed demons)
// Per docs/demons/demon-line.md. Reuses src/chars/common.js helpers
// (toonMat / emissiveMat / outlineMat / buildMergedOutline / getGradTex / lathe).
//
// Each build* returns a THREE.Group whose userData.parts collects animatable
// handles ({ body, mask, eyes[], arms[], core, hood, hem, wings[], crown[], ... })
// that Spirit/BossSpirit drive for idle menace + telegraph poses.
//
// Geometry budgets (per CONSTRAINTS): fodder ≤40 meshes, lord 80-120, merged
// outline hulls via buildMergedOutline (1 draw call per demon body).
import * as THREE from 'three';
import { toonMat, emissiveMat, buildMergedOutline, lathe } from '../chars/common.js';

// ── Shared reused geometries (cones/spheres/etc.) — built once ──
const G = {
  smokeSphere: new THREE.SphereGeometry(1, 10, 8),
  ico:        new THREE.IcosahedronGeometry(1, 0),
  shard:      new THREE.ConeGeometry(1, 1, 4),         // 4-sided icicle prism
  cone6:      new THREE.ConeGeometry(1, 1, 6),
  claw:       new THREE.ConeGeometry(1, 1, 5),
  sphere:     new THREE.SphereGeometry(1, 12, 9),
  sphereLo:   new THREE.SphereGeometry(1, 8, 6),
  cyl:        new THREE.CylinderGeometry(1, 1, 1, 8),
  capsuleTorso: new THREE.SphereGeometry(1, 14, 10),
  plane:      new THREE.PlaneGeometry(1, 1),
  ring:       new THREE.TorusGeometry(1, 0.18, 6, 16),
};

// Element death-dissolve tints (matches ART_BIBLE accent glow).
export const DEMON_DEATH_TINT = {
  neutral: 0x4a3f5e, ice: 0xa9e4ff, water: 0x4fe3ff, poison: 0x7fe05a, fire: 0xff6a2a,
};

function mesh(geo, mat) { return new THREE.Mesh(geo, mat); }
function basicMat(color, opacity = 1, opts = {}) {
  return new THREE.MeshBasicMaterial({ color, transparent: opacity < 1 || opts.transparent, opacity, ...opts });
}

// =====================================================================
//  L1 — SHADOWLING (neutral fodder, ~0.9, ~22 parts)
//  Layered translucent dark smoke spheres + white oni half-mask + wisp claws.
// =====================================================================
export function buildShadowling() {
  const g = new THREE.Group();
  const parts = { type: 'shadowling', element: 'neutral', smoke: [], claws: [], eyes: [] };

  // Smoke body: 4 layered translucent spheres, no depthWrite (smoke churn).
  const smokeCols = [0x2a2436, 0x231d30, 0x2a2436, 0x171320];
  const smokeDefs = [
    [0.0, 0.55, 0.0, 0.42, 0.78],
    [0.12, 0.72, 0.05, 0.34, 0.66],
    [-0.10, 0.48, 0.08, 0.30, 0.7],
    [0.0, 0.40, -0.05, 0.46, 0.6],
  ];
  smokeDefs.forEach((d, i) => {
    const m = mesh(G.smokeSphere, new THREE.MeshBasicMaterial({
      color: smokeCols[i], transparent: true, opacity: d[4], depthWrite: false,
    }));
    m.position.set(d[0], d[1], d[2]);
    m.scale.setScalar(d[3]);
    m._baseScale = d[3]; m._phase = Math.random() * Math.PI * 2;
    g.add(m); parts.smoke.push(m);
  });

  // Bottom wisp cones (trailing down, no feet — hovers).
  for (const sx of [-0.14, 0.14]) {
    const w = mesh(G.cone6, basicMat(0x171320, 0.55, { depthWrite: false }));
    w.position.set(sx, 0.12, 0.0);
    w.scale.set(0.12, 0.5, 0.12);
    w.rotation.x = Math.PI; // taper down
    g.add(w);
  }

  // Oni half-mask: curved white plane-cap on the front upper body.
  const maskGrp = new THREE.Group();
  const maskTex = makeOniMaskTexture();
  const maskGeo = new THREE.SphereGeometry(0.30, 18, 12, Math.PI * 0.5 - 0.95, 1.9, Math.PI * 0.16, Math.PI * 0.5);
  const mask = mesh(maskGeo, new THREE.MeshToonMaterial({ map: maskTex, transparent: true }));
  mask.renderOrder = 2;
  maskGrp.add(mask);
  // Single horn nub (asymmetry).
  const horn = mesh(G.cone6, toonMat(0xede9e0));
  horn.position.set(0.16, 0.30, 0.05); horn.scale.set(0.05, 0.16, 0.05);
  horn.rotation.z = -0.4;
  maskGrp.add(horn);
  // Eye-slit glow (emissive red) — two small bars.
  for (const ex of [-0.10, 0.10]) {
    const eye = mesh(G.sphereLo, emissiveMat(0xff3b5c, 2.4));
    eye.position.set(ex, 0.62, 0.27); eye.scale.set(0.045, 0.025, 0.03);
    maskGrp.add(eye); parts.eyes.push(eye);
  }
  maskGrp.position.set(0, 0.0, 0.04);
  g.add(maskGrp);
  parts.mask = maskGrp;

  // Wisp claw arms ×2 (tapered tubes + 3 claw cones each).
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    const tube = mesh(G.cyl, toonMat(0x3a3350));
    tube.position.set(0, -0.12, 0); tube.scale.set(0.05, 0.34, 0.05);
    tube.rotation.z = side * 0.5;
    arm.add(tube);
    for (let c = 0; c < 3; c++) {
      const cl = mesh(G.claw, toonMat(0x3a3350));
      cl.position.set((c - 1) * 0.05, -0.28, 0.02);
      cl.scale.set(0.025, 0.10, 0.025);
      cl.rotation.x = -0.3;
      arm.add(cl);
    }
    arm.position.set(side * 0.34, 0.5, 0.06);
    arm._side = side; arm._phase = Math.random() * Math.PI * 2;
    g.add(arm); parts.claws.push(arm);
  }

  // Merged outline — mask + claws only (body is smoke).
  const outline = buildMergedOutline([
    { geo: maskGeo, pos: [0, 0.0, 0.04], hull: 1.05 },
    { geo: G.cyl, pos: [-0.34, 0.38, 0.06], rot: [0, 0, -0.5], scale: [0.05, 0.34, 0.05], hull: 1.05 },
    { geo: G.cyl, pos: [0.34, 0.38, 0.06], rot: [0, 0, 0.5], scale: [0.05, 0.34, 0.05], hull: 1.05 },
  ], 0x241a22);
  if (outline) g.add(outline);

  g.userData.parts = parts;
  return g;
}

// =====================================================================
//  L2 — FROST IMP (ice, ~1.0 crouched, ~30 parts)
//  Faceted icicle-shard body, blue emissive core, scowling icy face.
// =====================================================================
export function buildFrostImp() {
  const g = new THREE.Group();
  const parts = { type: 'frostimp', element: 'ice', shards: [], arms: [], eyes: [] };
  const ICE = 0x8fc5e8, ICE_TIP = 0xdcefff;
  const outlineParts = [];

  // Faceted torso (icosahedron).
  const torso = mesh(G.ico, toonMat(ICE));
  torso.position.set(0, 0.55, 0); torso.scale.setScalar(0.34);
  torso.castShadow = true;
  g.add(torso); parts.body = torso;
  outlineParts.push({ geo: G.ico, pos: [0, 0.55, 0], scale: 0.34, hull: 1.04 });

  // Blue emissive core in chest.
  const core = mesh(G.sphereLo, emissiveMat(0xa9e4ff, 3.0));
  core.position.set(0, 0.58, 0.22); core.scale.setScalar(0.10);
  g.add(core); parts.core = core;

  // Icicle shards jutting from back/shoulders/forearms (instanced-style, 9).
  const shardDefs = [
    [0, 0.85, -0.18, 0.5, 0.5], [-0.18, 0.78, -0.14, 0.9, 0.42],
    [0.18, 0.78, -0.14, -0.9, 0.42], [-0.30, 0.6, -0.05, 1.4, 0.34],
    [0.30, 0.6, -0.05, -1.4, 0.34], [0, 0.95, -0.05, 0.2, 0.4],
    [-0.12, 0.9, -0.1, 0.5, 0.36], [0.12, 0.9, -0.1, -0.5, 0.36],
    [0, 0.35, -0.20, -0.3, 0.3],
  ];
  shardDefs.forEach(d => {
    const sh = mesh(G.shard, toonMat(ICE_TIP));
    sh.position.set(d[0], d[1], d[2]);
    sh.scale.set(0.06, d[4], 0.06);
    sh.rotation.z = d[3];
    g.add(sh); parts.shards.push(sh);
  });

  // Head: small faceted sphere + 2 horn shards + painted icy face.
  const head = mesh(G.ico, toonMat(ICE));
  head.position.set(0, 0.95, 0.04); head.scale.setScalar(0.18);
  g.add(head); parts.head = head;
  outlineParts.push({ geo: G.ico, pos: [0, 0.95, 0.04], scale: 0.18, hull: 1.04 });
  for (const sx of [-1, 1]) {
    const hn = mesh(G.shard, toonMat(ICE_TIP));
    hn.position.set(sx * 0.10, 1.12, 0.02); hn.scale.set(0.035, 0.18, 0.035);
    hn.rotation.z = sx * -0.4;
    g.add(hn);
  }
  // Narrow glowing eyes (emissive cyan slits).
  for (const ex of [-0.07, 0.07]) {
    const eye = mesh(G.sphereLo, emissiveMat(0xa9e4ff, 2.4));
    eye.position.set(ex, 0.96, 0.20); eye.scale.set(0.04, 0.018, 0.025);
    g.add(eye); parts.eyes.push(eye);
  }

  // Arms ×2 (short, 3-claw icicle hands).
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    const upper = mesh(G.cyl, toonMat(ICE));
    upper.scale.set(0.06, 0.22, 0.06); upper.position.y = -0.1;
    arm.add(upper);
    for (let c = -1; c <= 1; c++) {
      const cl = mesh(G.shard, toonMat(ICE_TIP));
      cl.position.set(c * 0.04, -0.24, 0.02); cl.scale.set(0.025, 0.10, 0.025);
      cl.rotation.x = -0.5;
      arm.add(cl);
    }
    arm.position.set(side * 0.28, 0.6, 0.06);
    arm.rotation.z = side * 0.3;
    arm._side = side;
    g.add(arm); parts.arms.push(arm);
  }

  // Legs ×2 (short crouched).
  for (const side of [-1, 1]) {
    const leg = mesh(G.cyl, toonMat(0x5e91be));
    leg.position.set(side * 0.14, 0.16, 0.02); leg.scale.set(0.07, 0.16, 0.07);
    g.add(leg);
  }

  const outline = buildMergedOutline(outlineParts, 0x1e3a52);
  if (outline) g.add(outline);

  g.userData.parts = parts;
  return g;
}

// =====================================================================
//  L3 — TIDE WRAITH (water, ~1.5, ~28 parts)
//  Hooded flowing robe (Lathe + animated sine hem), coral trident.
// =====================================================================
export function buildTideWraith() {
  const g = new THREE.Group();
  const parts = { type: 'tidewraith', element: 'water', eyes: [], tendrils: [] };
  const ROBE = 0x235c8c, TRIM = 0x46d6e0, HOODVOID = 0x0e2030;

  // Robe body — Lathe flowing profile (radius,y), hooded → widening hem.
  const profile = [
    [0.02, 1.5], [0.10, 1.4], [0.16, 1.2], [0.22, 0.9],
    [0.30, 0.5], [0.40, 0.15], [0.44, 0.02],
  ];
  const robe = lathe(profile, 28, toonMat(ROBE));
  robe.castShadow = true;
  // Per-vertex sine hem ripple: store base positions, animate in update.
  const pos = robe.geometry.attributes.position;
  robe.geometry._hemBase = pos.array.slice();
  robe.geometry._hemReady = true;
  g.add(robe); parts.robe = robe; parts.hem = robe;

  // Cyan trim band (thin lathe ring on the robe).
  const trim = lathe([[0.305, 0.52], [0.315, 0.46]], 28, emissiveMat(TRIM, 1.4));
  g.add(trim);

  // Hood — cone over head, dark void interior.
  const hood = mesh(G.cone6, toonMat(ROBE));
  hood.position.set(0, 1.38, 0); hood.scale.set(0.22, 0.34, 0.22);
  g.add(hood);
  const voidCap = mesh(G.sphereLo, basicMat(HOODVOID));
  voidCap.position.set(0, 1.28, 0.06); voidCap.scale.set(0.13, 0.15, 0.10);
  g.add(voidCap);
  parts.hood = hood;
  // Two glowing cyan eyes in the shadow.
  for (const ex of [-0.05, 0.05]) {
    const eye = mesh(G.sphereLo, emissiveMat(0x4fe3ff, 2.6));
    eye.position.set(ex, 1.30, 0.14); eye.scale.setScalar(0.035);
    g.add(eye); parts.eyes.push(eye);
  }

  // Sleeves ×2 (wide trailing lathe).
  for (const side of [-1, 1]) {
    const sleeve = lathe([[0.03, 0.4], [0.09, 0.2], [0.12, 0.0]], 14, toonMat(ROBE));
    sleeve.position.set(side * 0.26, 0.78, 0.05);
    sleeve.rotation.z = side * 0.5;
    sleeve._side = side;
    g.add(sleeve); parts.tendrils.push(sleeve);
  }

  // Coral trident — held in one hand (right).
  const trident = new THREE.Group();
  const shaft = mesh(G.cyl, toonMat(0xe07a5f));
  shaft.scale.set(0.025, 0.9, 0.025); shaft.position.y = 0.1;
  trident.add(shaft);
  // 3-prong coral head.
  for (let p = -1; p <= 1; p++) {
    const prong = mesh(G.cone6, toonMat(0xe07a5f));
    prong.position.set(p * 0.07, 0.62, 0); prong.scale.set(0.022, 0.18, 0.022);
    trident.add(prong);
    const tip = mesh(G.sphereLo, emissiveMat(0x4fe3ff, 1.6));
    tip.position.set(p * 0.07, 0.72, 0); tip.scale.setScalar(0.022);
    trident.add(tip);
  }
  trident.position.set(0.32, 0.5, 0.12);
  trident.rotation.z = 0.15;
  g.add(trident); parts.trident = trident;

  // Wave-wisp tendrils (translucent, below hem — no legs).
  for (let t = 0; t < 4; t++) {
    const ang = (t / 4) * Math.PI * 2;
    const wisp = mesh(G.cone6, basicMat(TRIM, 0.4, { depthWrite: false }));
    wisp.position.set(Math.cos(ang) * 0.22, -0.02, Math.sin(ang) * 0.22);
    wisp.scale.set(0.05, 0.25, 0.05); wisp.rotation.x = Math.PI;
    wisp._phase = ang;
    g.add(wisp); parts.tendrils.push(wisp);
  }

  // Outline — robe + hood (use cone proxy for robe silhouette).
  const outline = buildMergedOutline([
    { geo: G.cone6, pos: [0, 0.7, 0], scale: [0.42, 0.8, 0.42], hull: 1.035 },
    { geo: G.cone6, pos: [0, 1.38, 0], scale: [0.22, 0.34, 0.22], hull: 1.04 },
  ], 0x0e2c4a);
  if (outline) g.add(outline);

  g.userData.parts = parts;
  return g;
}

// =====================================================================
//  L4 — VENOM ONI (poison MINI-BOSS, ~2.3 base unit, ~45 parts)
//  Big horned oni, fanged underbite, spiked club, glowing kanji belly.
//  NOTE: built at unit scale ~1.15 tall; BossSpirit scales group by table.scale.
// =====================================================================
export function buildVenomOni() {
  const g = new THREE.Group();
  const parts = { type: 'venomoni', element: 'poison', fangs: [], horns: [], arms: [] };
  const SKIN = 0x6e5a86, SKIN_LT = 0x8a77a2, TOXIC = 0x7fe05a, LOIN = 0x3a2a52;
  const outlineParts = [];

  // Torso (big barrel).
  const torso = mesh(G.capsuleTorso, toonMat(SKIN));
  torso.position.set(0, 0.78, 0); torso.scale.set(0.42, 0.40, 0.36);
  torso.castShadow = true;
  g.add(torso); parts.body = torso;
  outlineParts.push({ geo: G.capsuleTorso, pos: [0, 0.78, 0], scale: [0.42, 0.40, 0.36], hull: 1.05 });

  // Shoulders (deltoids).
  for (const sx of [-1, 1]) {
    const sh = mesh(G.sphere, toonMat(SKIN));
    sh.position.set(sx * 0.42, 0.95, 0); sh.scale.setScalar(0.22);
    g.add(sh);
  }

  // Belly (fat lower sphere) + emissive kanji mark.
  const belly = mesh(G.sphere, toonMat(SKIN_LT));
  belly.position.set(0, 0.5, 0.08); belly.scale.set(0.40, 0.34, 0.34);
  g.add(belly); parts.belly = belly;
  const kanjiTex = makeKanjiTexture();
  const kanji = mesh(new THREE.PlaneGeometry(0.34, 0.34), new THREE.MeshBasicMaterial({
    map: kanjiTex, transparent: true, depthWrite: false,
  }));
  kanji.position.set(0, 0.5, 0.42); kanji.renderOrder = 2;
  g.add(kanji); parts.kanji = kanji;

  // Head + fanged underbite + oni face.
  const head = mesh(G.sphere, toonMat(SKIN));
  head.position.set(0, 1.28, 0.04); head.scale.set(0.26, 0.26, 0.26);
  g.add(head); parts.head = head;
  outlineParts.push({ geo: G.sphere, pos: [0, 1.28, 0.04], scale: 0.26, hull: 1.05 });
  // Oni face decal.
  const faceTex = makeOniFaceTexture();
  const faceGeo = new THREE.SphereGeometry(0.265, 18, 14, Math.PI * 0.5 - 0.9, 1.8, Math.PI * 0.22, Math.PI * 0.45);
  const face = mesh(faceGeo, new THREE.MeshBasicMaterial({ map: faceTex, transparent: true, depthWrite: false }));
  face.position.set(0, 1.28, 0.04); face.renderOrder = 2;
  g.add(face);
  // Lower jaw (underbite) + 5 fangs pointing up.
  const jaw = mesh(G.sphere, toonMat(SKIN_LT));
  jaw.position.set(0, 1.12, 0.18); jaw.scale.set(0.18, 0.10, 0.14);
  g.add(jaw);
  for (let f = -2; f <= 2; f++) {
    const fang = mesh(G.cone6, toonMat(0xf2f0ea));
    fang.position.set(f * 0.05, 1.18, 0.26); fang.scale.set(0.022, 0.07, 0.022);
    g.add(fang); parts.fangs.push(fang);
  }
  // Horns ×2 (swept up/out, toxic-green tint).
  for (const sx of [-1, 1]) {
    const horn = mesh(G.cone6, toonMat(TOXIC));
    horn.position.set(sx * 0.18, 1.48, 0); horn.scale.set(0.05, 0.26, 0.05);
    horn.rotation.z = sx * -0.5;
    g.add(horn); parts.horns.push(horn);
  }

  // Arms ×2 (thick, big 4-claw hands). Right arm holds club.
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    const upper = mesh(G.cyl, toonMat(SKIN));
    upper.scale.set(0.11, 0.34, 0.11); upper.position.y = -0.16;
    arm.add(upper);
    const hand = mesh(G.sphere, toonMat(SKIN));
    hand.position.y = -0.36; hand.scale.setScalar(0.12);
    arm.add(hand);
    for (let c = 0; c < 4; c++) {
      const cl = mesh(G.claw, toonMat(TOXIC));
      cl.position.set((c - 1.5) * 0.05, -0.46, 0.06); cl.scale.set(0.025, 0.09, 0.025);
      cl.rotation.x = -0.4;
      arm.add(cl);
    }
    arm.position.set(side * 0.5, 0.92, 0.04);
    arm.rotation.z = side * 0.3;
    arm._side = side;
    g.add(arm); parts.arms.push(arm);
    if (side === 1) parts.clubArm = arm;
  }

  // Legs ×2 (stocky splayed) + loincloth.
  for (const side of [-1, 1]) {
    const leg = mesh(G.cyl, toonMat(SKIN));
    leg.position.set(side * 0.2, 0.22, 0); leg.scale.set(0.12, 0.24, 0.12);
    g.add(leg);
    const foot = mesh(G.sphere, toonMat(SKIN));
    foot.position.set(side * 0.2, 0.04, 0.06); foot.scale.set(0.13, 0.07, 0.16);
    g.add(foot);
  }
  const loin = lathe([[0.30, 0.42], [0.36, 0.2], [0.34, 0.05]], 14, toonMat(LOIN));
  loin.position.y = 0.0;
  g.add(loin);

  // Spiked club (kanabō) — held in right hand, over shoulder.
  const club = new THREE.Group();
  const club_shaft = mesh(G.cyl, toonMat(0x4a3a2e));
  club_shaft.scale.set(0.06, 0.7, 0.06); club_shaft.position.y = 0.2;
  club.add(club_shaft);
  const club_head = mesh(G.cyl, toonMat(0x3a2e22));
  club_head.scale.set(0.13, 0.4, 0.13); club_head.position.y = 0.62;
  club.add(club_head);
  // Spike studs (instanced small cones).
  const studGeo = G.cone6;
  for (let ring = 0; ring < 4; ring++) {
    for (let s = 0; s < 5; s++) {
      const ang = (s / 5) * Math.PI * 2 + ring * 0.4;
      const stud = mesh(studGeo, toonMat(0xb8b0a0));
      const y = 0.45 + ring * 0.1;
      stud.position.set(Math.cos(ang) * 0.13, y, Math.sin(ang) * 0.13);
      stud.scale.set(0.03, 0.07, 0.03);
      stud.rotation.z = -Math.cos(ang) * 1.2;
      stud.rotation.x = Math.sin(ang) * 1.2;
      club.add(stud);
    }
  }
  club.position.set(0.62, 1.0, -0.1);
  club.rotation.z = -0.5;
  g.add(club); parts.club = club;

  const outline = buildMergedOutline(outlineParts, 0x2e1742);
  if (outline) g.add(outline);

  g.userData.parts = parts;
  return g;
}

// =====================================================================
//  L5 — INFERNO DEMON LORD (fire FINAL BOSS, ~3.4, ~70 parts)
//  Winged demon, flame crown, magma crack emissive veins, membrane wings.
//  Built at unit ~1.3 tall; BossSpirit scales by table.scale (2.6).
// =====================================================================
export function buildInfernoLord() {
  const g = new THREE.Group();
  const parts = { type: 'infernolord', element: 'fire', wings: [], crown: [], veins: [], horns: [], arms: [], eyes: [] };
  const ROCK = 0x2a1c1c, PLATE = 0x7a1a12, CHAR = 0x1a1212;
  const MAGMA = 0xff6a2a, CROWN = 0xffb23b;
  const outlineParts = [];

  // Torso — stacked spheres (chest/abs/pecs).
  const chest = mesh(G.capsuleTorso, toonMat(ROCK));
  chest.position.set(0, 0.95, 0); chest.scale.set(0.42, 0.34, 0.32);
  chest.castShadow = true;
  g.add(chest); parts.body = chest;
  outlineParts.push({ geo: G.capsuleTorso, pos: [0, 0.95, 0], scale: [0.42, 0.34, 0.32], hull: 1.05 });
  const abs = mesh(G.sphere, toonMat(ROCK));
  abs.position.set(0, 0.6, 0.04); abs.scale.set(0.32, 0.30, 0.28);
  g.add(abs);
  outlineParts.push({ geo: G.sphere, pos: [0, 0.6, 0.04], scale: [0.32, 0.30, 0.28], hull: 1.05 });
  // Crimson chest plate.
  const plate = mesh(G.sphere, toonMat(PLATE));
  plate.position.set(0, 1.0, 0.22); plate.scale.set(0.30, 0.22, 0.14);
  g.add(plate);
  for (const sx of [-1, 1]) {
    const pauldron = mesh(G.sphere, toonMat(PLATE));
    pauldron.position.set(sx * 0.44, 1.12, 0); pauldron.scale.setScalar(0.20);
    g.add(pauldron);
  }

  // Magma crack veins (emissive torus arcs across torso) — flare in phase 2.
  const veinDefs = [
    [0, 0.95, 0.30, 0.0, 0.18], [-0.18, 0.78, 0.26, 0.6, 0.14],
    [0.18, 0.78, 0.26, -0.6, 0.14], [0, 0.55, 0.26, 0.0, 0.15],
    [-0.30, 0.95, 0.10, 1.2, 0.12], [0.30, 0.95, 0.10, -1.2, 0.12],
  ];
  veinDefs.forEach(d => {
    const vein = mesh(G.ring, emissiveMat(MAGMA, 2.2));
    vein.position.set(d[0], d[1], d[2]);
    vein.rotation.z = d[3];
    vein.scale.setScalar(d[4]);
    g.add(vein); parts.veins.push(vein);
  });

  // Head — big sphere + heavy brow + demon face.
  const head = mesh(G.sphere, toonMat(ROCK));
  head.position.set(0, 1.5, 0.04); head.scale.setScalar(0.26);
  g.add(head); parts.head = head;
  outlineParts.push({ geo: G.sphere, pos: [0, 1.5, 0.04], scale: 0.26, hull: 1.05 });
  const faceTex = makeDemonLordFace();
  const faceGeo = new THREE.SphereGeometry(0.265, 18, 14, Math.PI * 0.5 - 0.9, 1.8, Math.PI * 0.22, Math.PI * 0.46);
  const face = mesh(faceGeo, new THREE.MeshBasicMaterial({ map: faceTex, transparent: true, depthWrite: false }));
  face.position.set(0, 1.5, 0.04); face.renderOrder = 2;
  g.add(face);
  // Gold glowing eyes.
  for (const ex of [-0.09, 0.09]) {
    const eye = mesh(G.sphereLo, emissiveMat(0xffd34b, 2.8));
    eye.position.set(ex, 1.52, 0.2); eye.scale.set(0.045, 0.03, 0.03);
    g.add(eye); parts.eyes.push(eye);
  }
  // Fanged maw (jaw — opens for roar).
  const jaw = mesh(G.sphere, toonMat(CHAR));
  jaw.position.set(0, 1.36, 0.16); jaw.scale.set(0.16, 0.08, 0.12);
  g.add(jaw); parts.jaw = jaw;

  // Horns ×4 (large swept cones).
  const hornDefs = [[-0.18, 1.68, -0.6, 0.34], [0.18, 1.68, 0.6, 0.34], [-0.26, 1.55, -1.0, 0.26], [0.26, 1.55, 1.0, 0.26]];
  hornDefs.forEach(d => {
    const horn = mesh(G.cone6, toonMat(CHAR));
    horn.position.set(d[0], d[1], 0); horn.scale.set(0.06, d[3], 0.06);
    horn.rotation.z = d[2];
    g.add(horn); parts.horns.push(horn);
    const tip = mesh(G.sphereLo, toonMat(0xe8b84b));
    tip.position.set(d[0] + Math.sin(-d[2]) * d[3] * 0.5, d[1] + d[3] * 0.5, 0); tip.scale.setScalar(0.04);
    g.add(tip);
  });

  // Flame crown — ring of upward emissive flame-tongue fins around head.
  for (let f = 0; f < 9; f++) {
    const ang = (f / 9) * Math.PI * 2;
    const flame = mesh(G.cone6, emissiveMat(f % 2 ? CROWN : MAGMA, 2.6, { transparent: true, opacity: 0.92, depthWrite: false }));
    flame.position.set(Math.cos(ang) * 0.24, 1.72, Math.sin(ang) * 0.24);
    flame.scale.set(0.05, 0.18, 0.05);
    flame._baseY = 1.72; flame._phase = ang;
    g.add(flame); parts.crown.push(flame);
  }

  // Wings ×2 — finger-bones + translucent membrane planes.
  for (const side of [-1, 1]) {
    const wing = new THREE.Group();
    // 3 finger-bones.
    const boneAngles = [0.3, 0.0, -0.4];
    boneAngles.forEach((ba, bi) => {
      const bone = mesh(G.cyl, toonMat(CHAR));
      bone.scale.set(0.025, 0.5 - bi * 0.06, 0.025);
      bone.position.set(0.3 + bi * 0.18, 0.1 - bi * 0.12, 0);
      bone.rotation.z = side * (0.9 + ba);
      wing.add(bone);
    });
    // Membrane planes (translucent, crimson vein).
    const memb = mesh(new THREE.PlaneGeometry(0.9, 0.7), new THREE.MeshBasicMaterial({
      color: 0x3a1410, transparent: true, opacity: 0.78, side: THREE.DoubleSide, depthWrite: false,
    }));
    memb.position.set(0.45, -0.05, 0);
    wing.add(memb);
    // Vein lines on membrane.
    for (let v = 0; v < 3; v++) {
      const vline = mesh(G.cyl, basicMat(0xc42a1c, 0.6));
      vline.scale.set(0.012, 0.4, 0.012);
      vline.position.set(0.3 + v * 0.18, -0.1, 0.005);
      vline.rotation.z = side * (0.8 + v * 0.2);
      wing.add(vline);
    }
    wing.position.set(side * 0.4, 1.0, -0.18);
    wing.rotation.y = side * 0.5;
    wing._side = side; wing._spread = 0; // 0=folded 1=spread
    g.add(wing); parts.wings.push(wing);
  }

  // Arms ×2 (massive, 4-claw hands, gold tips).
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    const upper = mesh(G.cyl, toonMat(ROCK));
    upper.scale.set(0.12, 0.4, 0.12); upper.position.y = -0.2;
    arm.add(upper);
    const hand = mesh(G.sphere, toonMat(ROCK));
    hand.position.y = -0.44; hand.scale.setScalar(0.14);
    arm.add(hand);
    for (let c = 0; c < 4; c++) {
      const cl = mesh(G.claw, toonMat(0xe8b84b));
      cl.position.set((c - 1.5) * 0.055, -0.56, 0.08); cl.scale.set(0.028, 0.11, 0.028);
      cl.rotation.x = -0.4;
      arm.add(cl);
    }
    arm.position.set(side * 0.52, 1.1, 0.02);
    arm.rotation.z = side * 0.25;
    arm._side = side;
    g.add(arm); parts.arms.push(arm);
  }

  // Legs ×2 (stocky, clawed) + plate skirt.
  for (const side of [-1, 1]) {
    const leg = mesh(G.cyl, toonMat(ROCK));
    leg.position.set(side * 0.22, 0.28, 0); leg.scale.set(0.14, 0.3, 0.14);
    g.add(leg);
    const foot = mesh(G.sphere, toonMat(CHAR));
    foot.position.set(side * 0.22, 0.04, 0.08); foot.scale.set(0.15, 0.08, 0.2);
    g.add(foot);
  }
  const skirt = lathe([[0.34, 0.5], [0.4, 0.28], [0.38, 0.1]], 16, toonMat(PLATE));
  skirt.position.y = 0.05;
  g.add(skirt);

  // Back spikes (rows of cones).
  for (let s = 0; s < 5; s++) {
    const spike = mesh(G.cone6, toonMat(CHAR));
    spike.position.set(0, 1.2 - s * 0.14, -0.28); spike.scale.set(0.04, 0.16 - s * 0.015, 0.04);
    spike.rotation.x = -0.6;
    g.add(spike);
  }

  const outline = buildMergedOutline(outlineParts, 0x3a0e0a);
  if (outline) g.add(outline);

  g.userData.parts = parts;
  return g;
}

// =====================================================================
//  CANVAS-PAINTED TEXTURES (masks / kanji / faces)
// =====================================================================
function _canvas(S = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  return { c, x: c.getContext('2d'), S };
}
function _tex(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true;
  return t;
}

function makeOniMaskTexture() {
  const { c, x, S } = _canvas(256);
  x.clearRect(0, 0, S, S);
  // White mask field (jagged top).
  x.fillStyle = '#ede9e0';
  x.beginPath();
  x.moveTo(S * 0.12, S * 0.32);
  const teeth = 7;
  for (let i = 0; i <= teeth; i++) {
    const tx = S * 0.12 + (S * 0.76) * (i / teeth);
    x.lineTo(tx, S * 0.32 + (i % 2 ? -S * 0.06 : 0));
  }
  x.lineTo(S * 0.88, S * 0.85);
  x.lineTo(S * 0.12, S * 0.85);
  x.closePath();
  x.fill();
  // Angry brows.
  x.strokeStyle = '#1a1018'; x.lineWidth = S * 0.04; x.lineCap = 'round';
  for (const sgn of [-1, 1]) {
    const ix = S / 2 + sgn * S * 0.08, ox = S / 2 + sgn * S * 0.26;
    x.beginPath(); x.moveTo(ix, S * 0.5); x.lineTo(ox, S * 0.44); x.stroke();
  }
  // Eye slits (glow handled by emissive geo; paint dark sockets).
  x.fillStyle = '#3a0a14';
  for (const sgn of [-1, 1]) {
    x.save(); x.translate(S / 2 + sgn * S * 0.17, S * 0.56); x.rotate(sgn * -0.3);
    x.beginPath(); x.ellipse(0, 0, S * 0.09, S * 0.03, 0, 0, Math.PI * 2); x.fill(); x.restore();
  }
  // Red stripe accents.
  x.strokeStyle = '#c42a1c'; x.lineWidth = S * 0.012;
  x.beginPath(); x.moveTo(S * 0.3, S * 0.7); x.lineTo(S * 0.4, S * 0.78); x.stroke();
  x.beginPath(); x.moveTo(S * 0.7, S * 0.7); x.lineTo(S * 0.6, S * 0.78); x.stroke();
  return _tex(c);
}

function makeKanjiTexture() {
  const { c, x, S } = _canvas(128);
  x.clearRect(0, 0, S, S);
  x.fillStyle = '#7fe05a';
  x.font = `bold ${S * 0.7}px serif`;
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.shadowColor = '#7fe05a'; x.shadowBlur = 12;
  x.fillText('毒', S / 2, S * 0.55); // "poison"
  return _tex(c);
}

function makeOniFaceTexture() {
  const { c, x, S } = _canvas(256);
  x.clearRect(0, 0, S, S);
  // Glaring eyes.
  x.fillStyle = '#1e1430';
  for (const sgn of [-1, 1]) {
    x.save(); x.translate(S / 2 + sgn * S * 0.18, S * 0.5); x.rotate(sgn * -0.25);
    x.beginPath(); x.ellipse(0, 0, S * 0.1, S * 0.06, 0, 0, Math.PI * 2); x.fill(); x.restore();
  }
  // Glowing red iris.
  x.fillStyle = '#ff3b3b';
  for (const sgn of [-1, 1]) {
    x.beginPath(); x.arc(S / 2 + sgn * S * 0.18, S * 0.5, S * 0.03, 0, Math.PI * 2); x.fill();
  }
  // Furrowed brow.
  x.strokeStyle = '#1e1430'; x.lineWidth = S * 0.05; x.lineCap = 'round';
  for (const sgn of [-1, 1]) {
    x.beginPath(); x.moveTo(S / 2 + sgn * S * 0.07, S * 0.42); x.lineTo(S / 2 + sgn * S * 0.30, S * 0.34); x.stroke();
  }
  // War-paint stripes.
  x.strokeStyle = '#7fe05a'; x.lineWidth = S * 0.02;
  for (const sgn of [-1, 1]) {
    x.beginPath(); x.moveTo(S / 2 + sgn * S * 0.22, S * 0.6); x.lineTo(S / 2 + sgn * S * 0.28, S * 0.72); x.stroke();
  }
  // Broad nose.
  x.fillStyle = '#473a5e';
  x.beginPath(); x.ellipse(S / 2, S * 0.62, S * 0.05, S * 0.04, 0, 0, Math.PI * 2); x.fill();
  return _tex(c);
}

function makeDemonLordFace() {
  const { c, x, S } = _canvas(256);
  x.clearRect(0, 0, S, S);
  // Heavy brow ridge.
  x.fillStyle = '#170e0e';
  x.beginPath(); x.moveTo(S * 0.2, S * 0.42);
  x.quadraticCurveTo(S / 2, S * 0.32, S * 0.8, S * 0.42);
  x.lineTo(S * 0.8, S * 0.5); x.quadraticCurveTo(S / 2, S * 0.42, S * 0.2, S * 0.5);
  x.closePath(); x.fill();
  // Snarling eyes (angled, glowing gold).
  for (const sgn of [-1, 1]) {
    x.save(); x.translate(S / 2 + sgn * S * 0.18, S * 0.52); x.rotate(sgn * -0.35);
    x.fillStyle = '#1a0e08'; x.beginPath(); x.ellipse(0, 0, S * 0.1, S * 0.05, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#ffd34b'; x.shadowColor = '#ffb23b'; x.shadowBlur = 14;
    x.beginPath(); x.ellipse(0, 0, S * 0.05, S * 0.03, 0, 0, Math.PI * 2); x.fill();
    x.shadowBlur = 0; x.restore();
  }
  // Snarl lines around mouth.
  x.strokeStyle = '#170e0e'; x.lineWidth = S * 0.03; x.lineCap = 'round';
  x.beginPath(); x.moveTo(S * 0.34, S * 0.68); x.quadraticCurveTo(S / 2, S * 0.62, S * 0.66, S * 0.68); x.stroke();
  // Magma crack on cheek.
  x.strokeStyle = '#ff6a2a'; x.lineWidth = S * 0.014;
  x.beginPath(); x.moveTo(S * 0.7, S * 0.55); x.lineTo(S * 0.78, S * 0.7); x.stroke();
  return _tex(c);
}

// ── Dispatch helper ──
export const DEMON_BUILDERS = {
  shadowling: buildShadowling,
  frostimp: buildFrostImp,
  tidewraith: buildTideWraith,
  venomoni: buildVenomOni,
  infernolord: buildInfernoLord,
};
