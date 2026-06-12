// src/world/sky.js — SKY V2 (Pass 4)
// Layered distant scenery that fills the horizon from the low 3rd-person camera:
//   • gradient sky dome (warm peach horizon → soft blue zenith)
//   • 3 rings of stylized karst mountain silhouettes, fading lighter into haze
//     (classic atmospheric perspective; merged geometry = 1 draw call per ring)
//   • a soft sun disc + glow sprite anchored to the directional light
//   • improved clouds: flattened billboard clusters at 2 altitudes, slightly
//     emissive cream so they catch a touch of bloom, drifting slowly
//   • fog tuned so mountains haze beautifully but the arena stays crisp
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ctx } from '../state.js';

// ART_BIBLE colour script (atmospheric perspective: distant = lighter/hazier).
const SKY_ZENITH  = '#5b9fd4';
const SKY_MID     = '#a9d0e2';
const SKY_HORIZON = '#f3dcb8'; // warm peach/cream (#F4E3C1 family)

export function buildSky() {
  const scene = ctx.scene;

  // ── Sky dome — canvas vertical gradient ──────────────────────────────────
  const skyCvs = document.createElement('canvas');
  skyCvs.width = 4; skyCvs.height = 512;
  const sc = skyCvs.getContext('2d');
  const grad = sc.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0.00, SKY_ZENITH);
  grad.addColorStop(0.45, SKY_MID);
  grad.addColorStop(0.78, '#d8e2dc');
  grad.addColorStop(1.00, SKY_HORIZON);
  sc.fillStyle = grad;
  sc.fillRect(0, 0, 4, 512);
  const skyTex = new THREE.CanvasTexture(skyCvs);
  skyTex.colorSpace = THREE.SRGBColorSpace;
  const skyGeo = new THREE.SphereGeometry(300, 24, 16);
  const skyMat = new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false });
  const dome = new THREE.Mesh(skyGeo, skyMat);
  dome.renderOrder = -10;
  scene.add(dome);

  // ── Karst mountain rings ─────────────────────────────────────────────────
  // Three concentric rings of stylized limestone peaks. Nearer = darker jade;
  // farther = lighter, blue-shifted, hazier (atmospheric perspective).
  buildMountainRing(scene, { radius: 150, count: 14, minH: 22, maxH: 46, baseW: 26, color: 0x6f8f86, y: -4 });
  buildMountainRing(scene, { radius: 210, count: 18, minH: 30, maxH: 64, baseW: 34, color: 0x9bb7bf, y: -8 });
  buildMountainRing(scene, { radius: 270, count: 22, minH: 40, maxH: 84, baseW: 42, color: 0xc4d6da, y: -12 });

  // ── Sun disc + glow ──────────────────────────────────────────────────────
  buildSun(scene);

  // ── Fog: warm haze. near/far so mountains soften but arena (≤~60u) is crisp.
  scene.fog = new THREE.Fog(0xe9d3b4, 90, 320);
  scene.background = new THREE.Color(SKY_MID);
}

// Build one ring of merged karst peaks (single draw call). Peaks are tapered
// cones with slight random lean; flat toon-ish colour via MeshBasicMaterial
// (unlit so distant silhouettes read as clean flat shapes, fog blends them).
function buildMountainRing(scene, opts) {
  const { radius, count, minH, maxH, baseW, color, y } = opts;
  const geos = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();

  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.12;
    const h = minH + Math.random() * (maxH - minH);
    const w = baseW * (0.7 + Math.random() * 0.6);
    // Karst peaks: a cone with few radial segments reads as a faceted limestone tower.
    const cone = new THREE.ConeGeometry(w * 0.5, h, 5, 1, false);
    // anchor base at y=0 of the local geo (cone is centred)
    cone.translate(0, h / 2, 0);
    const rr = radius * (0.92 + Math.random() * 0.16);
    p.set(Math.cos(a) * rr, y, Math.sin(a) * rr);
    e.set(0, Math.random() * Math.PI, (Math.random() - 0.5) * 0.12);
    q.setFromEuler(e);
    s.set(1, 1, 1);
    m.compose(p, q, s);
    cone.applyMatrix4(m);
    geos.push(cone);
  }
  const merged = mergeGeometries(geos, false);
  geos.forEach(g => g.dispose());
  // Unlit flat colour + fog so the ring melts into haze with distance.
  const mat = new THREE.MeshBasicMaterial({ color, fog: true });
  const mesh = new THREE.Mesh(merged, mat);
  mesh.renderOrder = -9;
  scene.add(mesh);
  return mesh;
}

// Soft sun disc + radial glow sprite, parked toward the directional light.
function buildSun(scene) {
  // Core disc — bright cream, emissive-bright so bloom catches it lightly.
  const discCvs = document.createElement('canvas');
  discCvs.width = discCvs.height = 128;
  const dc = discCvs.getContext('2d');
  const dg = dc.createRadialGradient(64, 64, 0, 64, 64, 64);
  dg.addColorStop(0.0, 'rgba(255,250,235,1)');
  dg.addColorStop(0.55, 'rgba(255,243,210,1)');
  dg.addColorStop(0.75, 'rgba(255,225,170,0.6)');
  dg.addColorStop(1.0, 'rgba(255,210,150,0)');
  dc.fillStyle = dg;
  dc.fillRect(0, 0, 128, 128);
  const discTex = new THREE.CanvasTexture(discCvs);
  const discMat = new THREE.SpriteMaterial({ map: discTex, transparent: true, depthWrite: false, fog: false });
  const disc = new THREE.Sprite(discMat);
  disc.scale.set(30, 30, 1);

  // Wide outer glow — very soft, large, low alpha (catches a little bloom).
  const glowCvs = document.createElement('canvas');
  glowCvs.width = glowCvs.height = 128;
  const gc = glowCvs.getContext('2d');
  const gg = gc.createRadialGradient(64, 64, 0, 64, 64, 64);
  gg.addColorStop(0.0, 'rgba(255,236,200,0.55)');
  gg.addColorStop(0.4, 'rgba(255,224,178,0.28)');
  gg.addColorStop(1.0, 'rgba(255,210,150,0)');
  gc.fillStyle = gg;
  gc.fillRect(0, 0, 128, 128);
  const glowTex = new THREE.CanvasTexture(glowCvs);
  const glowMat = new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const glow = new THREE.Sprite(glowMat);
  glow.scale.set(90, 90, 1);

  const sunGroup = new THREE.Group();
  sunGroup.add(glow);
  sunGroup.add(disc);
  sunGroup.renderOrder = -8;
  scene.add(sunGroup);
  ctx.sunGlow = sunGroup;
}

export function buildClouds() {
  const scene = ctx.scene;
  ctx.cloudLayers = [];
  // Flattened billboard clusters at 2 altitudes. Slightly emissive cream so a
  // touch of bloom catches them. MeshBasicMaterial w/ flattened spheres.
  const lowMat = new THREE.MeshBasicMaterial({ color: 0xfff6ea, transparent: true, opacity: 0.85, fog: true });
  const hiMat  = new THREE.MeshBasicMaterial({ color: 0xfffdf6, transparent: true, opacity: 0.78, fog: true });
  const altitudes = [
    { y: 34, mat: lowMat, n: 7,  scale: 1.0, speed: 1.1 },
    { y: 58, mat: hiMat,  n: 6,  scale: 1.6, speed: 0.6 },
  ];
  altitudes.forEach(layer => {
    for (let i = 0; i < layer.n; i++) {
      const g = new THREE.Group();
      const blobCount = 4 + Math.floor(Math.random() * 3);
      for (let j = 0; j < blobCount; j++) {
        const r = (5 + Math.random() * 4) * layer.scale;
        const blob = new THREE.Mesh(new THREE.SphereGeometry(r, 7, 5), layer.mat);
        blob.position.set(j * 6 * layer.scale - 8, (Math.random() - 0.5) * 2.5, (Math.random() - 0.5) * 4);
        blob.scale.y = 0.42; // flatten → billboard cluster
        g.add(blob);
      }
      g.position.set((Math.random() - 0.5) * 280, layer.y + (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 280);
      g._speed = layer.speed * (0.7 + Math.random() * 0.6);
      scene.add(g);
      ctx.cloudLayers.push(g);
    }
  });
}

export function buildLighting() {
  const scene = ctx.scene;

  // Hemisphere fill tuned to sky colours: warm peach sky / jade ground bounce.
  const hemi = new THREE.HemisphereLight(0xdfe9f5, 0x6e7a52, 0.55);
  scene.add(hemi);

  // Warm golden-hour key sun (~35° elevation). Slightly warm tint.
  const sun = new THREE.DirectionalLight(0xfff0d6, 1.35);
  sun.position.set(40, 34, 26); // ~35° elevation, warm angle
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 160;
  // Tight frustum on the arena for crisp shadows where they matter.
  sun.shadow.camera.left   = -45; sun.shadow.camera.right  = 45;
  sun.shadow.camera.top    =  45; sun.shadow.camera.bottom = -45;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(sun.target);

  const impactLight = new THREE.PointLight(0xffffff, 0, 20);
  scene.add(impactLight);
  ctx.impactLight = impactLight;

  ctx.sun = sun;
  return { sun };
}
