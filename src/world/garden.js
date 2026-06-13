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
  // RedFormat: 3 bytes for a 3x1 ramp (matches chars/common.js). The default RGBA
  // format expects 12 bytes for 3x1 and throws a texSubImage2D error on the strict
  // iOS/WebKit WebGL implementation (Chromium silently tolerates it).
  _gradTex = new THREE.DataTexture(gradData, 3, 1, THREE.RedFormat);
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

// Shared raked-gravel ring geometry (as texture-space fractions, so albedo and
// normal-map rings line up at any resolution since both map 0..1 across the disc).
const SAND_R_FRAC   = 0.16;   // gravel circle radius as fraction of full texture
const RAKE_STEP_FRAC = 0.012; // spacing between concentric rake rings
function _forEachRakeRing(SZ, fn) {
  const sandR = SZ * SAND_R_FRAC;
  for (let rr = sandR * 0.12; rr < sandR * 0.95; rr += SZ * RAKE_STEP_FRAC) fn(rr, sandR);
}

// PAINTED GROUND (Pass 10 art polish) — higher-res painterly albedo. A cool pale
// raked-gravel zen circle at centre (crisp groove shadows + ridge highlights)
// surrounded by a jade meadow with moss + sun-bleached patches. Paired with a
// generated normal map (makeGroundNormalTexture) so the rake grooves and grass
// clumps catch the warm key sun for real relief instead of reading flat.
function makePaintedGroundTexture() {
  const SZ = 2048;
  const c = document.createElement('canvas');
  c.width = c.height = SZ;
  const g = c.getContext('2d');
  const cx = SZ / 2, cy = SZ / 2;

  // Base jade wash.
  g.fillStyle = '#4d9459';
  g.fillRect(0, 0, SZ, SZ);

  // Mottled grass: wide value range for contrast between light/shadow zones.
  const grassCols = ['#72c47f', '#3e8050', '#82ce8c', '#366844', '#5ea86a', '#2d6040'];
  const warmCols  = ['#b2c26a', '#c8b25e', '#98b85c', '#d4b870']; // sun-bleached / warm
  for (let i = 0; i < 6400; i++) {
    const warm = Math.random() < 0.22;
    const pal = warm ? warmCols : grassCols;
    g.fillStyle = pal[(Math.random() * pal.length) | 0];
    g.globalAlpha = 0.12 + Math.random() * 0.28;
    const x = Math.random() * SZ, y = Math.random() * SZ;
    const r = 12 + Math.random() * 88;
    g.beginPath();
    g.ellipse(x, y, r, r * (0.4 + Math.random() * 0.7), Math.random() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;

  // Darker moss speckles scattered across the field.
  for (let i = 0; i < 1200; i++) {
    g.fillStyle = `rgba(${28 + (Math.random() * 20 | 0)},${70 + (Math.random() * 30 | 0)},${36 + (Math.random() * 20 | 0)},${(0.25 + Math.random() * 0.35).toFixed(2)})`;
    const x = Math.random() * SZ, y = Math.random() * SZ;
    const r = 3 + Math.random() * 13;
    g.beginPath(); g.ellipse(x, y, r, r * (0.5 + Math.random() * 0.5), Math.random() * Math.PI, 0, Math.PI * 2); g.fill();
  }

  // Light dry-brush streaks radiating outward from the centre.
  for (let i = 0; i < 150; i++) {
    const ang = Math.random() * Math.PI * 2;
    const startR = SZ * 0.22 + Math.random() * SZ * 0.15;
    const len = SZ * 0.04 + Math.random() * SZ * 0.10;
    const x0 = cx + Math.cos(ang) * startR;
    const y0 = cy + Math.sin(ang) * startR;
    g.strokeStyle = `rgba(200,230,180,${(0.07 + Math.random() * 0.13).toFixed(2)})`;
    g.lineWidth = 1.4 + Math.random() * 2.8;
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x0 + Math.cos(ang) * len, y0 + Math.sin(ang) * len);
    g.stroke();
  }

  // Painterly directional brush flecks for grain.
  g.strokeStyle = 'rgba(40,100,60,0.20)';
  g.lineWidth = 2.2;
  for (let i = 0; i < 3000; i++) {
    const x = Math.random() * SZ, y = Math.random() * SZ;
    const a = Math.random() * Math.PI;
    const len = 8 + Math.random() * 26;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    g.stroke();
  }

  // ── Raked-gravel centre circle — cool pale stone, not muddy tan.
  const sandR = SZ * SAND_R_FRAC;
  const sandGrad = g.createRadialGradient(cx, cy, sandR * 0.2, cx, cy, sandR);
  sandGrad.addColorStop(0.0, '#e7e9df');
  sandGrad.addColorStop(0.7, '#dadecf');
  sandGrad.addColorStop(0.92, '#c9cfbc');
  sandGrad.addColorStop(1.0, 'rgba(201,207,188,0)');
  g.fillStyle = sandGrad;
  g.beginPath(); g.arc(cx, cy, sandR, 0, Math.PI * 2); g.fill();

  // gravel grain + crisp concentric rake rings (groove shadow + ridge highlight).
  g.save();
  g.beginPath(); g.arc(cx, cy, sandR * 0.97, 0, Math.PI * 2); g.clip();
  for (let i = 0; i < 1100; i++) {
    g.fillStyle = Math.random() < 0.5 ? 'rgba(150,156,140,0.16)' : 'rgba(255,255,250,0.18)';
    const x = cx + (Math.random() - 0.5) * sandR * 2;
    const y = cy + (Math.random() - 0.5) * sandR * 2;
    g.beginPath(); g.arc(x, y, 1 + Math.random() * 3, 0, Math.PI * 2); g.fill();
  }
  _forEachRakeRing(SZ, (rr) => {
    g.strokeStyle = 'rgba(120,128,112,0.65)'; // cool groove shadow
    g.lineWidth = 4.0;
    g.beginPath(); g.arc(cx, cy, rr, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = 'rgba(255,255,252,0.6)';  // ridge highlight
    g.lineWidth = 1.8;
    g.beginPath(); g.arc(cx, cy, rr + 4.0, 0, Math.PI * 2); g.stroke();
  });
  g.restore();

  // Radial vignette: gently darken toward the arena edge.
  const vignette = g.createRadialGradient(cx, cy, SZ * 0.28, cx, cy, SZ * 0.58);
  vignette.addColorStop(0,   'rgba(0,0,0,0)');
  vignette.addColorStop(0.6, 'rgba(0,0,0,0)');
  vignette.addColorStop(1.0, 'rgba(0,0,0,0.34)');
  g.fillStyle = vignette;
  g.fillRect(0, 0, SZ, SZ);

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 16;
  return t;
}

// Generate a tangent-space NORMAL map for the ground from a procedural height
// field (raised grass clumps + recessed rake grooves), via a cheap Sobel pass.
// Lower res than the albedo (normals tolerate it) to keep the one-time cost down.
function makeGroundNormalTexture() {
  const SZ = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = SZ;
  const g = c.getContext('2d');
  const cx = SZ / 2, cy = SZ / 2;

  // Mid height baseline.
  g.fillStyle = '#808080';
  g.fillRect(0, 0, SZ, SZ);

  // Soft grass clumps as gentle bumps (lighter = higher) across the meadow.
  for (let i = 0; i < 2600; i++) {
    const x = Math.random() * SZ, y = Math.random() * SZ;
    const r = 4 + Math.random() * 16;
    const up = Math.random() < 0.6;
    const a = (0.06 + Math.random() * 0.14).toFixed(2);
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, up ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`);
    rg.addColorStop(1, 'rgba(128,128,128,0)');
    g.fillStyle = rg;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }

  // Raked rings as recessed grooves with raised ridges — strong, aligned relief.
  _forEachRakeRing(SZ, (rr) => {
    g.strokeStyle = 'rgba(0,0,0,0.85)';   // groove (low)
    g.lineWidth = 3.0;
    g.beginPath(); g.arc(cx, cy, rr, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.7)'; // ridge (high)
    g.lineWidth = 2.0;
    g.beginPath(); g.arc(cx, cy, rr + 3.0, 0, Math.PI * 2); g.stroke();
  });

  // Sobel → normal map.
  const src = g.getImageData(0, 0, SZ, SZ).data;
  const out = g.createImageData(SZ, SZ);
  const o = out.data;
  const at = (x, y) => src[((y * SZ + x) << 2)]; // red == height (grayscale)
  const strength = 2.4;
  for (let y = 0; y < SZ; y++) {
    const yu = (y - 1 + SZ) % SZ, yd = (y + 1) % SZ;
    for (let x = 0; x < SZ; x++) {
      const xl = (x - 1 + SZ) % SZ, xr = (x + 1) % SZ;
      let nx = (at(xl, y) - at(xr, y)) / 255 * strength;
      let ny = (at(x, yu) - at(x, yd)) / 255 * strength;
      let nz = 1;
      const inv = 1 / Math.hypot(nx, ny, nz);
      nx *= inv; ny *= inv; nz *= inv;
      const i = (y * SZ + x) << 2;
      o[i]     = (nx * 0.5 + 0.5) * 255;
      o[i + 1] = (ny * 0.5 + 0.5) * 255;
      o[i + 2] = (nz * 0.5 + 0.5) * 255;
      o[i + 3] = 255;
    }
  }
  g.putImageData(out, 0, 0);
  const t = new THREE.CanvasTexture(c); // linear (normal data) — do NOT set sRGB
  t.anisotropy = 8;
  t.needsUpdate = true;
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
  const groundNormal = makeGroundNormalTexture();
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(ARENA_SIZE, 96),
    new THREE.MeshToonMaterial({
      color: 0xffffff, gradientMap: _getGradTex(),
      map: groundTex,
      normalMap: groundNormal,
      normalScale: new THREE.Vector2(0.85, 0.85),
    })
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

// Cherry tree canopy — Pass 8 2-tone approach:
// Lower blobs use a deep magenta-shadow hue; upper blobs use a light pink highlight
// with a few white-pink highlight dabs so canopy reads lush instead of flat purple.
const CHERRY_PINKS = [0xffaacc, 0xffc2da, 0xff95bf, 0xffd6e6, 0xf7a8cf];
// Shadow (lower blob) palette — deeper, more saturated
const CHERRY_SHADOW = [0xd4649a, 0xc45c90, 0xcc6097, 0xbe5888];
// Highlight dab colors — near-white pinks
const CHERRY_HIGHLIGHT = [0xffe6f2, 0xfffafc, 0xfff0f6, 0xfce0ee];

function buildCherryTree(x, z, scale = 1, pink) {
  const scene = ctx.scene;
  const g = new THREE.Group();
  const col = pink ?? CHERRY_PINKS[(Math.random() * CHERRY_PINKS.length) | 0];
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3 * scale, 0.4 * scale, 3 * scale, 6), toonMat(0x5c3a1e));
  trunk.position.y = 1.5 * scale;
  trunk.castShadow = true;
  addOutline(trunk);
  g.add(trunk);
  // Lush oil-dabbed canopy: more, rounder blobs massed into a soft crown. The
  // garden sun comes from +X (upper-left of frame), so blobs biased toward +X
  // and higher get a sunlit lift; lower / -X blobs sink into deeper shadow —
  // stronger painterly light/shadow separation than a flat 2-tone. A few bright
  // near-white dabs sit on the sunlit upper side as oil highlights.
  const blobs = 7 + Math.floor(Math.random() * 3); // 7-9 blobs — fuller massing
  for (let i = 0; i < blobs; i++) {
    // Y-fraction: 0 = lowest, 1 = highest blob in this tree's crown
    const yFrac = i / (blobs - 1);
    // Pre-pick horizontal offset so colour can react to the light direction.
    const spread = (1.9 - yFrac * 0.6) * scale;
    const ox = (Math.random() - 0.5) * spread * 2;
    const oz = (Math.random() - 0.5) * spread * 2;
    // Light term: +1 = fully sunlit (high + toward +X), -1 = deep shadow.
    const light = Math.max(-1, Math.min(1, (yFrac - 0.5) * 1.6 + (ox / (spread + 0.001)) * 0.7));
    let blobColor;
    if (light < -0.35) {
      // Shadowed underside / far side — deep saturated magenta.
      blobColor = CHERRY_SHADOW[(Math.random() * CHERRY_SHADOW.length) | 0];
    } else if (light > 0.5 && Math.random() < 0.6) {
      // Sunlit crown — bright near-white highlight dabs.
      blobColor = CHERRY_HIGHLIGHT[(Math.random() * CHERRY_HIGHLIGHT.length) | 0];
    } else {
      // Mid blobs — base pink lifted/darkened by the light term + gentle jitter.
      blobColor = new THREE.Color(col).offsetHSL(
        (Math.random() - 0.5) * 0.03,
        (Math.random() - 0.5) * 0.05,
        light * 0.13 + (Math.random() - 0.5) * 0.05
      ).getHex();
    }
    const blob = new THREE.Mesh(
      new THREE.SphereGeometry((1.2 + Math.random() * 0.6) * scale, 8, 6),
      toonMat(blobColor)
    );
    // Spread lower blobs wider; upper blobs cluster tighter near the crown top.
    blob.position.set(
      ox,
      (3 + yFrac * 2.0 + Math.random() * 0.8) * scale,
      oz
    );
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

// ── Instanced grass tufts (Pass 8 perf) ────────────────────────────────────
// Two InstancedMesh objects (one per blade orientation in a crossed-quad tuft)
// replace the previous 150 Group×2 approach (~300 draw calls → 2 draw calls).
// Wind sway is intentionally removed (static instances, identical to flowers).
// ctx.grassTufts is set to null so main.js skips the old sway loop gracefully.
export function buildGrassField() {
  const scene = ctx.scene;
  // Signal to main.js animate loop that the old group-sway is no longer needed.
  ctx.grassTufts = null;

  const COUNT = 150;

  // Blade geometry: a single vertical plane, pivot at the base.
  const bladeGeoA = new THREE.PlaneGeometry(0.18, 0.55);
  bladeGeoA.translate(0, 0.275, 0);
  // Second blade rotated 90° for the crossed-quad look (done via instance matrix).
  const bladeGeoB = new THREE.PlaneGeometry(0.18, 0.55);
  bladeGeoB.translate(0, 0.275, 0);

  const grassMat = new THREE.MeshToonMaterial({
    color: 0x5fa86b, gradientMap: _getGradTex(), side: THREE.DoubleSide,
  });

  const instA = new THREE.InstancedMesh(bladeGeoA, grassMat, COUNT);
  const instB = new THREE.InstancedMesh(bladeGeoB, grassMat, COUNT);
  instA.frustumCulled = false;
  instB.frustumCulled = false;

  const _m  = new THREE.Matrix4();
  const _p  = new THREE.Vector3();
  const _q  = new THREE.Quaternion();
  const _e  = new THREE.Euler();
  const _s  = new THREE.Vector3();

  for (let i = 0; i < COUNT; i++) {
    // Ring distribution: keep the central combat circle (r<6) clear.
    const a = Math.random() * Math.PI * 2;
    const r = 6.5 + Math.random() * (ARENA_SIZE - 9);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const sc = 0.7 + Math.random() * 0.7;
    const yawBase = Math.random() * Math.PI;

    _p.set(x, 0, z);
    _s.set(sc, sc, sc);

    // Blade A — base yaw
    _e.set(0, yawBase, 0);
    _q.setFromEuler(_e);
    _m.compose(_p, _q, _s);
    instA.setMatrixAt(i, _m);

    // Blade B — perpendicular (+ π/2) for the crossed look
    _e.set(0, yawBase + Math.PI * 0.5, 0);
    _q.setFromEuler(_e);
    _m.compose(_p, _q, _s);
    instB.setMatrixAt(i, _m);
  }

  instA.instanceMatrix.needsUpdate = true;
  instB.instanceMatrix.needsUpdate = true;
  scene.add(instA);
  scene.add(instB);
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

  // Cherry blossom tree near center — use shared buildCherryTree for 2-tone canopy
  buildCherryTree(8, -9, 1.0, CHERRY_PINKS[2]);

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
