// src/world/garden.js — all environment builders
import * as THREE from 'three';
import { ctx } from '../state.js';
import { ARENA_SIZE } from '../config.js';
import { buildSky, buildClouds } from './sky.js';

// ---- shared toon helpers (duplicated here from chars/builders for self-contained use) ----
// The canonical versions live in chars/builders.js; these match exactly.
let _gradTex = null;
function _getGradTex() {
  if (_gradTex) return _gradTex;
  const gradData = new Uint8Array([80, 160, 255]);
  _gradTex = new THREE.DataTexture(gradData, 3, 1);
  _gradTex.needsUpdate = true;
  _gradTex.magFilter = THREE.NearestFilter;
  _gradTex.minFilter = THREE.NearestFilter;
  return _gradTex;
}

function toonMat(color, opts = {}) {
  return new THREE.MeshToonMaterial({ color, gradientMap: _getGradTex(), ...opts });
}

function addOutline(mesh, scaleFactor = 1.04) {
  const geo = mesh.geometry.clone ? mesh.geometry.clone() : mesh.geometry;
  const outlineMat = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide });
  const outline = new THREE.Mesh(geo, outlineMat);
  outline.scale.setScalar(scaleFactor);
  mesh.add(outline);
  return outline;
}

// ---- Canvas texture generators ----
function makeSandTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctxC = c.getContext('2d');
  ctxC.fillStyle = '#e8d5a0';
  ctxC.fillRect(0, 0, 256, 256);
  ctxC.strokeStyle = '#c8b070';
  ctxC.lineWidth = 1.5;
  for (let r = 10; r < 200; r += 12) {
    ctxC.beginPath();
    ctxC.arc(128, 128, r, 0, Math.PI * 2);
    ctxC.stroke();
  }
  ctxC.strokeStyle = '#d4c080';
  ctxC.lineWidth = 0.8;
  for (let x = 0; x < 256; x += 8) {
    ctxC.beginPath(); ctxC.moveTo(x, 0); ctxC.lineTo(x, 256); ctxC.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 3);
  return t;
}

function makeKoiTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctxC = c.getContext('2d');
  ctxC.fillStyle = '#1a3a6a';
  ctxC.fillRect(0, 0, 128, 128);
  ctxC.strokeStyle = '#2255aa';
  ctxC.lineWidth = 2;
  for (let r = 5; r < 90; r += 14) {
    ctxC.beginPath(); ctxC.ellipse(64, 64, r, r * 0.7, 0, 0, Math.PI * 2); ctxC.stroke();
  }
  return new THREE.CanvasTexture(c);
}

// ---- Public build functions ----

export function buildWorld() {
  const scene = ctx.scene;

  // Ground — sand plaza
  const sandTex = makeSandTexture();
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(ARENA_SIZE, 64),
    new THREE.MeshToonMaterial({ color: 0xe8d5a0, gradientMap: _getGradTex(), map: sandTex })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Boundary rocks
  const rockGeo = new THREE.IcosahedronGeometry(2.5, 0);
  const rockMat = toonMat(0x445544);
  const rockPositions = [
    [-22, 0, -18], [18, 0, -15], [-15, 0, 20], [22, 0, 15], [0, 0, -28], [-28, 0, 5], [25, 0, -5],
  ];
  rockPositions.forEach(([x, y, z]) => {
    const r = new THREE.Mesh(rockGeo, rockMat);
    r.position.set(x, 1.2, z);
    r.rotation.set(Math.random(), Math.random(), Math.random());
    r.castShadow = r.receiveShadow = true;
    addOutline(r);
    scene.add(r);
  });

  // Koi pond
  const koiTex = makeKoiTexture();
  const pond = new THREE.Mesh(
    new THREE.CircleGeometry(6, 32),
    new THREE.MeshToonMaterial({ color: 0x2255aa, gradientMap: _getGradTex(), map: koiTex, transparent: true, opacity: 0.85 })
  );
  pond.rotation.x = -Math.PI / 2;
  pond.position.set(-13, 0.05, -7);
  scene.add(pond);

  // Koi fish
  const koiGeo = new THREE.SphereGeometry(0.4, 6, 4);
  koiGeo.scale(2, 0.5, 0.8);
  const koiColors = [0xff6600, 0xff9900, 0xffcc00];
  ctx.koi = [];
  koiColors.forEach((col, i) => {
    const k = new THREE.Mesh(koiGeo, toonMat(col));
    k.position.set(-13, 0.2, -7);
    k._angle = (i / 3) * Math.PI * 2;
    scene.add(k);
    ctx.koi.push(k);
  });

  // Arched bridge over pond
  const bridgeMat = toonMat(0xcc2200);
  for (let i = -1; i <= 1; i += 2) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.5, 0.4), bridgeMat);
    post.position.set(-13 + i * 3.5, 0.75, -11);
    post.castShadow = true;
    addOutline(post);
    scene.add(post);
  }
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(7, 0.3, 1.2), bridgeMat);
  bridge.position.set(-13, 1.5, -11);
  bridge.castShadow = true;
  addOutline(bridge);
  scene.add(bridge);

  // Torii gate
  const toriiMat = toonMat(0xdd2200);
  const tp = [-2, 0, 28, 2, 0, 28];
  for (let i = 0; i < 2; i++) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 5, 8), toriiMat);
    post.position.set(tp[i * 3], 2.5, tp[i * 3 + 2]);
    post.castShadow = true; addOutline(post); scene.add(post);
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(6, 0.5, 0.5), toriiMat);
  lintel.position.set(0, 5.3, 28);
  addOutline(lintel); scene.add(lintel);
  const topBar = new THREE.Mesh(new THREE.BoxGeometry(7, 0.3, 0.5), toriiMat);
  topBar.position.set(0, 5.8, 28);
  addOutline(topBar); scene.add(topBar);

  // Sub-builders
  buildLanterns();
  buildBamboo();
  buildCherryTrees();
  buildPagoda();
  buildCenterGarden();

  // Sky + clouds
  buildSky();
  buildClouds();

  // Cherry petal particles
  buildPetals();
}

export function buildLanterns() {
  const scene = ctx.scene;
  const positions = [[15, 0, 15], [-15, 0, 20], [10, 0, -20], [20, 0, 0]];
  positions.forEach(([x, y, z]) => {
    const g = new THREE.Group();
    const base  = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 0.6, 6), toonMat(0x888880));
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1.5, 6), toonMat(0x888880));
    shaft.position.y = 1.05;
    const body  = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), toonMat(0x999990));
    body.position.y = 2.1;
    const roof  = new THREE.Mesh(new THREE.CylinderGeometry(0, 0.7, 0.5, 4), toonMat(0x888880));
    roof.position.y = 2.75;
    g.add(base, shaft, body, roof);
    g.position.set(x, 0, z);
    const glow = new THREE.PointLight(0xffcc44, 0.8, 6);
    glow.position.set(x, 2.1, z);
    scene.add(glow);
    [base, shaft, body, roof].forEach(m => { m.castShadow = true; addOutline(m); });
    scene.add(g);
  });
}

export function buildBamboo() {
  const scene = ctx.scene;
  const bMat = toonMat(0x447733);
  const positions = [[18, 0, -25], [20, 0, -23], [22, 0, -26], [16, 0, -24], [-25, 0, 5], [-27, 0, 7], [-23, 0, 6]];
  ctx.bamboo = [];
  positions.forEach(([x, y, z]) => {
    const g = new THREE.Group();
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 7, 6), bMat);
    stalk.position.y = 3.5;
    for (let i = 0; i < 4; i++) {
      const notch = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.1, 6), toonMat(0x335522));
      notch.position.y = 1 + i * 1.5;
      g.add(notch);
    }
    g.add(stalk);
    g.position.set(x, 0, z);
    g._baseRot = Math.random() * 0.1 - 0.05;
    scene.add(g);
    ctx.bamboo.push(g);
  });
}

export function buildCherryTrees() {
  const scene = ctx.scene;
  const positions = [[-5, 0, -25], [5, 0, -25], [25, 0, 10], [-25, 0, 15]];
  positions.forEach(([x, y, z]) => {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 3, 6), toonMat(0x5c3a1e));
    trunk.position.y = 1.5;
    trunk.castShadow = true;
    addOutline(trunk);
    g.add(trunk);
    for (let i = 0; i < 5; i++) {
      const blob = new THREE.Mesh(
        new THREE.SphereGeometry(1.2 + Math.random() * 0.5, 6, 4),
        toonMat(0xffaacc)
      );
      blob.position.set((Math.random() - 0.5) * 2, 3 + Math.random() * 1.5, (Math.random() - 0.5) * 2);
      addOutline(blob, 1.06);
      g.add(blob);
    }
    g.position.set(x, 0, z);
    scene.add(g);
  });
}

export function buildPagoda() {
  const scene = ctx.scene;
  const g = new THREE.Group();
  const pMat = toonMat(0x8b3a2a);
  const wMat = toonMat(0xeecc88);
  for (let i = 0; i < 3; i++) {
    const w = (3 - i) * 2.5, h = 1.5;
    const tier = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), i % 2 === 0 ? pMat : wMat);
    tier.position.y = i * 2.5 + 0.75;
    tier.castShadow = true;
    addOutline(tier);
    g.add(tier);
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(0, (w + 1) * 0.7, 1, 4), pMat);
    roof.position.y = i * 2.5 + 1.5 + 0.5;
    roof.rotation.y = Math.PI / 4;
    addOutline(roof);
    g.add(roof);
  }
  g.position.set(22, 0, -22);
  scene.add(g);
}

export function buildCenterGarden() {
  const scene = ctx.scene;

  // Cherry blossom tree near center
  {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 3, 6), toonMat(0x5c3a1e));
    trunk.position.y = 1.5; trunk.castShadow = true; addOutline(trunk); g.add(trunk);
    for (let i = 0; i < 5; i++) {
      const blob = new THREE.Mesh(
        new THREE.SphereGeometry(1.2 + Math.random() * 0.5, 6, 4), toonMat(0xffaacc));
      blob.position.set((Math.random() - 0.5) * 2, 3 + Math.random() * 1.5, (Math.random() - 0.5) * 2);
      addOutline(blob, 1.06); g.add(blob);
    }
    g.position.set(8, 0, -9);
    scene.add(g);
  }

  // Glowing stone lanterns near center
  const centerLanternPos = [[6, 0, -4], [-6, 0, -4]];
  centerLanternPos.forEach(([x, y, z]) => {
    const g = new THREE.Group();
    const base  = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 0.6, 6), toonMat(0x888880));
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1.5, 6), toonMat(0x888880));
    shaft.position.y = 1.05;
    const body  = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), toonMat(0x999990));
    body.position.y = 2.1;
    const roof  = new THREE.Mesh(new THREE.CylinderGeometry(0, 0.7, 0.5, 4), toonMat(0x888880));
    roof.position.y = 2.75;
    g.add(base, shaft, body, roof);
    g.position.set(x, 0, z);
    [base, shaft, body, roof].forEach(m => { m.castShadow = true; addOutline(m); });
    const glow = new THREE.PointLight(0xffcc44, 1.0, 8);
    glow.position.set(x, 2.1, z);
    scene.add(glow);
    scene.add(g);
  });

  // Moss rocks scattered at radius 6-12
  const mossRockPositions = [[7, 0, 6], [-8, 0, 7], [10, 0, -4], [-7, 0, -10], [9, 0, 10]];
  const mossGeo = new THREE.IcosahedronGeometry(0.6, 0);
  const mossMat = toonMat(0x4a6644);
  mossRockPositions.forEach(([x, y, z]) => {
    const r = new THREE.Mesh(mossGeo, mossMat);
    r.position.set(x, 0.5, z);
    r.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    r.scale.set(0.8 + Math.random() * 0.4, 0.5 + Math.random() * 0.3, 0.8 + Math.random() * 0.4);
    r.castShadow = r.receiveShadow = true;
    addOutline(r);
    scene.add(r);
  });

  // Grass tufts
  const grassMat = new THREE.MeshBasicMaterial({ color: 0x55aa44, side: THREE.DoubleSide });
  const grassPositions = [[6, 0, 8], [-9, 0, 5], [11, 0, 2], [-6, 0, -8], [8, 0, -6]];
  grassPositions.forEach(([x, y, z]) => {
    for (let i = 0; i < 3; i++) {
      const blade = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.5 + Math.random() * 0.3), grassMat);
      blade.position.set(x + (Math.random() - 0.5) * 0.6, 0.25, z + (Math.random() - 0.5) * 0.6);
      blade.rotation.y = Math.random() * Math.PI;
      scene.add(blade);
    }
  });
}

export function buildPetals() {
  const scene = ctx.scene;
  ctx.petals = [];
  for (let i = 0; i < 60; i++) {
    const p = new THREE.Mesh(
      new THREE.PlaneGeometry(0.15, 0.1),
      new THREE.MeshBasicMaterial({ color: 0xffaacc, side: THREE.DoubleSide, transparent: true, opacity: 0.8 })
    );
    resetPetal(p);
    scene.add(p);
    ctx.petals.push(p);
  }
}

export function resetPetal(p) {
  p.position.set((Math.random() - 0.5) * 80, 8 + Math.random() * 15, (Math.random() - 0.5) * 80);
  p._vy = -(0.02 + Math.random() * 0.03);
  p._vx = (Math.random() - 0.5) * 0.02;
  p._vz = (Math.random() - 0.5) * 0.02;
  p._spin = (Math.random() - 0.5) * 0.05;
}
