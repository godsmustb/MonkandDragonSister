// src/world/garden.js — all environment builders
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
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

// PAINTED GROUND (Pass 4) — one big painterly canvas mapped across the whole
// arena. Mottled jade grass with warm painterly patches, plus a raked-sand
// centre circle with proper concentric-ring grain. Tileable repeat is OFF so
// the centre circle stays a single feature; texture is 1024² for crispness.
function makePaintedGroundTexture() {
  const SZ = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = SZ;
  const g = c.getContext('2d');

  // Base jade wash.
  g.fillStyle = '#5fa86b';
  g.fillRect(0, 0, SZ, SZ);

  // Mottled grass: soft overlapping blobs in jade light/shadow + warm patches.
  const grassCols = ['#6cb877', '#549a60', '#74bd7e', '#4c8f58', '#67b072'];
  const warmCols  = ['#a7b86a', '#b9a85e', '#8fae5c']; // sun-bleached / warm
  for (let i = 0; i < 2600; i++) {
    const warm = Math.random() < 0.22;
    const pal = warm ? warmCols : grassCols;
    g.fillStyle = pal[(Math.random() * pal.length) | 0];
    g.globalAlpha = 0.10 + Math.random() * 0.22;
    const x = Math.random() * SZ, y = Math.random() * SZ;
    const r = 6 + Math.random() * 40;
    g.beginPath();
    g.ellipse(x, y, r, r * (0.5 + Math.random() * 0.6), Math.random() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;

  // Painterly directional brush flecks for grain.
  g.strokeStyle = 'rgba(60,120,80,0.18)';
  g.lineWidth = 1.4;
  for (let i = 0; i < 1400; i++) {
    const x = Math.random() * SZ, y = Math.random() * SZ;
    const a = Math.random() * Math.PI;
    const len = 4 + Math.random() * 12;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    g.stroke();
  }

  // ── Raked-sand centre circle (combat circle, radius ~5 world → centre of tex).
  // Map world radius 5 of arena ARENA_SIZE onto the texture: sand disc covers
  // the central fraction. We draw a sand disc + concentric raked rings.
  const cx = SZ / 2, cy = SZ / 2;
  const sandR = SZ * 0.16; // ~radius 5 in a ~30u arena mapped to half-tex
  // sand fill with soft painterly edge
  const sandGrad = g.createRadialGradient(cx, cy, sandR * 0.2, cx, cy, sandR);
  sandGrad.addColorStop(0.0, '#ecdcb0');
  sandGrad.addColorStop(0.7, '#e6d3a2');
  sandGrad.addColorStop(0.92, '#dcc690');
  sandGrad.addColorStop(1.0, 'rgba(220,198,144,0)');
  g.fillStyle = sandGrad;
  g.beginPath(); g.arc(cx, cy, sandR, 0, Math.PI * 2); g.fill();

  // sand grain mottle
  g.save();
  g.beginPath(); g.arc(cx, cy, sandR * 0.97, 0, Math.PI * 2); g.clip();
  for (let i = 0; i < 500; i++) {
    g.fillStyle = Math.random() < 0.5 ? 'rgba(200,176,120,0.20)' : 'rgba(255,244,210,0.18)';
    const x = cx + (Math.random() - 0.5) * sandR * 2;
    const y = cy + (Math.random() - 0.5) * sandR * 2;
    g.beginPath(); g.arc(x, y, 1 + Math.random() * 2.5, 0, Math.PI * 2); g.fill();
  }
  // concentric raked rings — double stroke (groove shadow + highlight) for grain
  for (let rr = sandR * 0.12; rr < sandR * 0.95; rr += SZ * 0.012) {
    g.strokeStyle = 'rgba(176,150,96,0.55)';
    g.lineWidth = 2.2;
    g.beginPath(); g.arc(cx, cy, rr, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = 'rgba(255,246,214,0.45)';
    g.lineWidth = 1.0;
    g.beginPath(); g.arc(cx, cy, rr + 2.2, 0, Math.PI * 2); g.stroke();
  }
  g.restore();

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
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

// Soft caustic ripple texture for the pond's second water layer.
function makeRippleTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#000000';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(255,255,255,0.5)';
  for (let i = 0; i < 22; i++) {
    const x = Math.random() * 128, y = Math.random() * 128;
    const r = 3 + Math.random() * 14;
    g.lineWidth = 0.8 + Math.random() * 1.4;
    g.beginPath();
    g.arc(x, y, r, Math.random() * Math.PI, Math.random() * Math.PI + Math.PI * 1.2);
    g.stroke();
  }
  return new THREE.CanvasTexture(c);
}

// ---- Public build functions ----

export function buildWorld() {
  const scene = ctx.scene;

  // Ground — painted jade garden with raked-sand centre (Pass 4).
  // The painterly texture maps ONCE across the whole disc so the central
  // combat circle stays a single readable feature.
  const groundTex = makePaintedGroundTexture();
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(ARENA_SIZE, 96),
    new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: _getGradTex(), map: groundTex })
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

  // Pond water V2: a second translucent animated ripple layer just above the
  // base water. Slow UV scroll + opacity pulse driven from main.js (ctx.pondRipple).
  const rippleTex = makeRippleTexture();
  rippleTex.wrapS = rippleTex.wrapT = THREE.RepeatWrapping;
  rippleTex.repeat.set(2, 2);
  const ripple = new THREE.Mesh(
    new THREE.CircleGeometry(5.9, 32),
    new THREE.MeshBasicMaterial({
      map: rippleTex, color: 0xbfe6ff, transparent: true, opacity: 0.3,
      depthWrite: false, blending: THREE.AdditiveBlending,
    })
  );
  ripple.rotation.x = -Math.PI / 2;
  ripple.position.set(-13, 0.12, -7);
  ripple.renderOrder = 2;
  scene.add(ripple);
  ctx.pondRipple = ripple;

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
  buildFlowers();
  buildGrassField();

  // Sky + clouds
  buildSky();
  buildClouds();

  // Cherry petal particles
  buildPetals();
}

// Emissive "lit paper" body for a stone lantern. emissiveIntensity high enough
// that bloom (threshold 0.85) catches the warm glow. Shared by both lantern sets.
function lanternBody() {
  return new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.9, 0.9),
    new THREE.MeshStandardMaterial({
      color: 0xffe9b0, emissive: 0xffc24b, emissiveIntensity: 1.9,
      roughness: 0.6, metalness: 0.0,
    })
  );
}

export function buildLanterns() {
  const scene = ctx.scene;
  const positions = [[15, 0, 15], [-15, 0, 20], [10, 0, -20], [20, 0, 0]];
  positions.forEach(([x, y, z]) => {
    const g = new THREE.Group();
    const base  = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 0.6, 6), toonMat(0x888880));
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1.5, 6), toonMat(0x888880));
    shaft.position.y = 1.05;
    const body  = lanternBody();   // emissive glowing paper → bloom catches it
    body.position.y = 2.1;
    const roof  = new THREE.Mesh(new THREE.CylinderGeometry(0, 0.7, 0.5, 4), toonMat(0x888880));
    roof.position.y = 2.75;
    g.add(base, shaft, body, roof);
    g.position.set(x, 0, z);
    const glow = new THREE.PointLight(0xffcc44, 0.8, 6);
    glow.position.set(x, 2.1, z);
    scene.add(glow);
    // Outline the stone parts only; the glowing paper stays clean (no ink hull).
    [base, shaft, roof].forEach(m => { m.castShadow = true; addOutline(m); });
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

// Varied cherry-blossom pinks (Pass 4): each tree picks a canopy hue so the
// playfield reads with colour variation rather than one flat pink.
const CHERRY_PINKS = [0xffaacc, 0xffc2da, 0xff95bf, 0xffd6e6, 0xf7a8cf];

function buildCherryTree(x, z, scale = 1, pink) {
  const scene = ctx.scene;
  const g = new THREE.Group();
  const col = pink ?? CHERRY_PINKS[(Math.random() * CHERRY_PINKS.length) | 0];
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3 * scale, 0.4 * scale, 3 * scale, 6), toonMat(0x5c3a1e));
  trunk.position.y = 1.5 * scale;
  trunk.castShadow = true;
  addOutline(trunk);
  g.add(trunk);
  const blobs = 5 + Math.floor(Math.random() * 2);
  for (let i = 0; i < blobs; i++) {
    // Slight per-blob hue jitter for a painterly canopy.
    const c = new THREE.Color(col).offsetHSL(0, (Math.random() - 0.5) * 0.04, (Math.random() - 0.5) * 0.06);
    const blob = new THREE.Mesh(
      new THREE.SphereGeometry((1.2 + Math.random() * 0.5) * scale, 6, 4),
      toonMat(c.getHex())
    );
    blob.position.set((Math.random() - 0.5) * 2 * scale, (3 + Math.random() * 1.5) * scale, (Math.random() - 0.5) * 2 * scale);
    blob.castShadow = true;
    addOutline(blob, 1.06);
    g.add(blob);
  }
  g.position.set(x, 0, z);
  scene.add(g);
  return g;
}

export function buildCherryTrees() {
  // Outer ring trees (backdrop) + extra trees nearer the playfield, varied pinks.
  const outer = [[-5, -25], [5, -25], [25, 10], [-25, 15]];
  outer.forEach(([x, z], i) => buildCherryTree(x, z, 1, CHERRY_PINKS[i % CHERRY_PINKS.length]));
  // 3 more near the playfield (radius ~12-16) — kept clear of the combat circle.
  const near = [[-13, 9], [14, 8], [11, -13]];
  near.forEach(([x, z]) => buildCherryTree(x, z, 0.85));
}

// ── Instanced flower patches (Pass 4) ──────────────────────────────────────
// 5-petal stylized blossoms (pink / white / gold) in clusters of 8-15, placed
// around the garden edges + a couple of mid-field patches. Each colour is one
// InstancedMesh of a flat 5-petal flower geometry (cheap, ~1 draw call each).

// One flat 5-petal flower geometry (in the XZ plane, facing +Y), centred at origin.
function makeFlowerGeometry() {
  const petals = [];
  const petalShape = new THREE.Shape();
  // teardrop petal pointing +X
  petalShape.moveTo(0, 0);
  petalShape.bezierCurveTo(0.06, 0.05, 0.16, 0.05, 0.20, 0);
  petalShape.bezierCurveTo(0.16, -0.05, 0.06, -0.05, 0, 0);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const geo = new THREE.ShapeGeometry(petalShape, 4);
    geo.rotateZ(a);
    petals.push(geo);
  }
  let flower = mergeGeometries(petals, false);
  petals.forEach(p => p.dispose());
  // lay flat on the ground (shape is in XY → rotate to XZ)
  flower.rotateX(-Math.PI / 2);
  return flower;
}

function buildFlowerPatch(scene, flowerGeo, color, cx, cz, count, spread) {
  const mat = new THREE.MeshToonMaterial({
    color, gradientMap: _getGradTex(), side: THREE.DoubleSide,
    emissive: new THREE.Color(color).multiplyScalar(0.12), // faint life, well under bloom threshold
  });
  const inst = new THREE.InstancedMesh(flowerGeo, mat, count);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * spread;
    p.set(cx + Math.cos(a) * r, 0.06, cz + Math.sin(a) * r);
    e.set(0, Math.random() * Math.PI * 2, 0);
    q.setFromEuler(e);
    const sc = 0.7 + Math.random() * 0.8;
    s.set(sc, sc, sc);
    m.compose(p, q, s);
    inst.setMatrixAt(i, m);
  }
  inst.instanceMatrix.needsUpdate = true;
  inst.frustumCulled = false; // small patches near camera; avoid pop-out
  scene.add(inst);
  return inst;
}

export function buildFlowers() {
  const scene = ctx.scene;
  const flowerGeo = makeFlowerGeometry();
  const pink  = 0xff9ec4;
  const white = 0xfff4f8;
  const gold  = 0xf2c64b;
  // Garden-edge patches (kept outside the central combat circle r≈5).
  const edge = [
    [-18, 12, pink], [17, 14, white], [-20, -6, gold], [19, -10, pink],
    [-9, 22, white], [9, 21, gold], [-24, 2, pink], [23, 4, white],
  ];
  edge.forEach(([x, z, col]) => buildFlowerPatch(scene, flowerGeo, col, x, z, 8 + ((Math.random() * 7) | 0), 2.2));
  // 3 mid-field patches (radius ~8-12, off-centre, clear of combat circle).
  const mid = [[8, 9, pink], [-9, -9, gold], [11, -7, white]];
  mid.forEach(([x, z, col]) => buildFlowerPatch(scene, flowerGeo, col, x, z, 6 + ((Math.random() * 5) | 0), 1.6));
}

// ── Instanced grass tufts (Pass 4) ─────────────────────────────────────────
// ~150 cross-quad grass tufts with cheap per-group wind sway. We use small
// Groups (so main.js can rotate each for wind) but share one geometry+material.
// 150 tufts is light; grouped for the sway trick described in main.js.
export function buildGrassField() {
  const scene = ctx.scene;
  ctx.grassTufts = [];
  const bladeGeo = new THREE.PlaneGeometry(0.18, 0.55);
  bladeGeo.translate(0, 0.275, 0); // pivot at base
  const grassMat = new THREE.MeshToonMaterial({
    color: 0x5fa86b, gradientMap: _getGradTex(), side: THREE.DoubleSide,
  });
  const COUNT = 150;
  for (let i = 0; i < COUNT; i++) {
    // Ring distribution: keep the central combat circle (r<6) clear.
    const a = Math.random() * Math.PI * 2;
    const r = 6.5 + Math.random() * (ARENA_SIZE - 9);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const g = new THREE.Group();
    // crossed quads = readable tuft from any angle
    for (let b = 0; b < 2; b++) {
      const blade = new THREE.Mesh(bladeGeo, grassMat);
      blade.rotation.y = b * Math.PI / 2 + Math.random() * 0.4;
      blade.scale.setScalar(0.7 + Math.random() * 0.7);
      g.add(blade);
    }
    g.position.set(x, 0, z);
    g._phase = Math.random() * Math.PI * 2;
    scene.add(g);
    ctx.grassTufts.push(g);
  }
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
    const body  = lanternBody();   // emissive glowing paper → bloom catches it
    body.position.y = 2.1;
    const roof  = new THREE.Mesh(new THREE.CylinderGeometry(0, 0.7, 0.5, 4), toonMat(0x888880));
    roof.position.y = 2.75;
    g.add(base, shaft, body, roof);
    g.position.set(x, 0, z);
    [base, shaft, roof].forEach(m => { m.castShadow = true; addOutline(m); });
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

  // (Static grass tufts replaced by instanced wind-swept field — see buildGrassField.)
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
