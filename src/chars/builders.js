// src/chars/builders.js — buildMonk, buildSister, buildDragon + toon helpers
import * as THREE from 'three';
import { ctx } from '../state.js';
import { FORM_DATA, ELEMENT_NAMES } from '../config.js';

// ---- Shared gradient map (created once) ----
let _gradTex = null;
export function getGradTex() {
  if (_gradTex) return _gradTex;
  const gradData = new Uint8Array([80, 160, 255]);
  _gradTex = new THREE.DataTexture(gradData, 3, 1);
  _gradTex.needsUpdate = true;
  _gradTex.magFilter = THREE.NearestFilter;
  _gradTex.minFilter = THREE.NearestFilter;
  return _gradTex;
}

export function toonMat(color, opts = {}) {
  return new THREE.MeshToonMaterial({ color, gradientMap: getGradTex(), ...opts });
}

export function addOutline(mesh, scaleFactor = 1.04) {
  const geo = mesh.geometry.clone ? mesh.geometry.clone() : mesh.geometry;
  const outlineMat = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide });
  const outline = new THREE.Mesh(geo, outlineMat);
  outline.scale.setScalar(scaleFactor);
  mesh.add(outline);
  return outline;
}

// ---- Character mesh builders ----

export function buildMonk() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.6, 1.4, 8), toonMat(0xdd8800));
  body.position.y = 0.9;
  body.castShadow = true;
  addOutline(body);
  g.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.38, 8, 6), toonMat(0xe8c08a));
  head.position.y = 2.0;
  addOutline(head);
  g.add(head);

  const eyeMat = toonMat(0x111111);
  [-0.12, 0.12].forEach(ex => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 4, 4), eyeMat);
    eye.position.set(ex, 2.05, 0.33);
    g.add(eye);
  });

  const armMat = toonMat(0xe8c08a);
  const armGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.7, 6);
  const lArm = new THREE.Mesh(armGeo, armMat);
  lArm.position.set(-0.6, 1.3, 0);
  lArm.rotation.z = 0.4;
  lArm.castShadow = true;
  g.add(lArm);

  const rUpperArm = new THREE.Group();
  rUpperArm.position.set(0.55, 1.55, 0);
  const rUpperArmMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.07, 0.42, 6), armMat);
  rUpperArmMesh.position.y = -0.21;
  rUpperArmMesh.castShadow = true;
  rUpperArm.add(rUpperArmMesh);

  const rForeArm = new THREE.Group();
  rForeArm.position.y = -0.42;
  const rForeArmMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.40, 6), armMat);
  rForeArmMesh.position.y = -0.20;
  rForeArmMesh.castShadow = true;
  rForeArm.add(rForeArmMesh);
  rUpperArm.add(rForeArm);
  g.add(rUpperArm);

  const staff = new THREE.Group();
  staff.position.y = -0.40;
  const staffShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.2, 6), toonMat(0x8b5e3c));
  staffShaft.castShadow = true;
  addOutline(staffShaft);
  staff.add(staffShaft);
  const staffHead = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4), toonMat(0xccaa44));
  staffHead.position.y = 1.1;
  staff.add(staffHead);
  rForeArm.add(staff);

  g._lArm = lArm;
  g._rArm = rUpperArm;
  g._rUpperArm = rUpperArm;
  g._rForeArm = rForeArm;
  g._staff = staff;
  g._head = head;
  g._body = body;
  return g;
}

export function buildSister() {
  const g = new THREE.Group();
  const dress = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, 1.3, 8), toonMat(0x2255aa));
  dress.position.y = 0.85;
  dress.castShadow = true;
  addOutline(dress);
  g.add(dress);

  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.35, 0.6, 8), toonMat(0xeeeeff));
  torso.position.y = 1.7;
  addOutline(torso);
  g.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.33, 8, 6), toonMat(0xf0c8a0));
  head.position.y = 2.2;
  addOutline(head);
  g.add(head);

  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.36, 8, 4), toonMat(0x221111));
  hair.scale.y = 0.5;
  hair.position.y = 2.45;
  g.add(hair);

  const eyeMat = toonMat(0x222244);
  [-0.1, 0.1].forEach(ex => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 4, 4), eyeMat);
    eye.position.set(ex, 2.25, 0.28);
    g.add(eye);
  });

  const armMat = toonMat(0xf0c8a0);
  const armGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.65, 6);
  const lArm = new THREE.Mesh(armGeo, armMat);
  lArm.position.set(-0.45, 1.6, 0);
  lArm.rotation.z = 0.3;
  g.add(lArm);
  const rArm = new THREE.Mesh(armGeo.clone(), armMat);
  rArm.position.set(0.45, 1.6, 0);
  rArm.rotation.z = -0.3;
  g.add(rArm);
  g._lArm = lArm;
  g._rArm = rArm;
  g._head = head;
  g._body = dress;
  return g;
}

export function buildDragon(element) {
  const scene = ctx.scene;
  const g = new THREE.Group();
  const col = FORM_DATA[element].color;
  const mat = toonMat(col);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6), mat);
  head.position.y = 0.8;
  addOutline(head, 1.05);
  g.add(head);

  const eyeMat = toonMat(
    element === 'fire' ? 0xffff00 :
    element === 'ice'  ? 0x00ffff :
    element === 'poison' ? 0x88ff00 : 0x00ddff
  );
  [-0.22, 0.22].forEach(ex => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.1, 4, 4), eyeMat);
    eye.position.set(ex, 0.9, 0.45);
    g.add(eye);
  });

  const hornMat = toonMat(element === 'fire' ? 0xff9900 : 0x888888);
  [-0.3, 0.3].forEach(hx => {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.4, 4), hornMat);
    horn.position.set(hx, 1.35, 0);
    horn.rotation.z = hx > 0 ? -0.3 : 0.3;
    g.add(horn);
  });

  const segs = [];
  const segCount = 10;
  for (let i = 0; i < segCount; i++) {
    const r = 0.35 - i * 0.025;
    const seg = new THREE.Mesh(new THREE.SphereGeometry(Math.max(r, 0.08), 6, 4), mat);
    const segGroup = new THREE.Group();
    segGroup.add(seg);
    segGroup._seg = seg;
    segs.push(segGroup);
    g.add(segGroup);
  }
  g._segments = segs;
  g._head = head;
  g._element = element;

  const trail = new THREE.Group();
  scene.add(trail);
  g._trail = trail;

  return g;
}
