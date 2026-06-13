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

  // Theme system: capture the sky-dome canvas + texture so theme.js can repaint
  // the gradient per level (ice/poison) and restore it for level 1.
  ctx.themeRefs = ctx.themeRefs || {};
  ctx.themeRefs.skyCanvas  = skyCvs;
  ctx.themeRefs.skyTexture = skyTex;
  ctx.themeRefs.mountainMats = [];

  // ── Painterly mountain rings ─────────────────────────────────────────────
  // Three concentric rings of soft "Bob Ross" peaks. Each ring's merged cones
  // carry a VERTICAL canvas gradient (deep shadowed base → lighter mid → soft
  // near-white snow cap at the apex) since ConeGeometry side UVs run v=0 (base)
  // → v=1 (apex). Nearer ring = more contrast/saturation; farther rings = paler,
  // hazier, more blue-violet (atmospheric perspective). A faint warm sun-side
  // tint warms the cap. Still unlit + fog so they melt dreamily into the haze.
  buildMountainRing(scene, {
    radius: 150, count: 14, minH: 22, maxH: 46, baseW: 26, y: -4,
    base: '#5c7d83', mid: '#86a3a6', snow: '#eef4f3', warm: '#f6e9cf',
  });
  buildMountainRing(scene, {
    radius: 210, count: 18, minH: 30, maxH: 64, baseW: 34, y: -8,
    base: '#86a0b4', mid: '#aabfcb', snow: '#eef1f7', warm: '#f0ecdc',
  });
  buildMountainRing(scene, {
    radius: 270, count: 22, minH: 40, maxH: 84, baseW: 42, y: -12,
    base: '#aebccf', mid: '#c6d2de', snow: '#f0f2f7', warm: '#eeecdf',
  });

  // ── Sun disc + glow ──────────────────────────────────────────────────────
  buildSun(scene);

  // ── Fog: warm haze. near/far so mountains soften but arena (≤~60u) is crisp.
  scene.fog = new THREE.Fog(0xe9d3b4, 90, 320);
  scene.background = new THREE.Color(SKY_MID);
}

// Paint a vertical painterly mountain gradient once at build time. ConeGeometry
// side UVs run v=0 (base) → v=1 (apex), and CanvasTexture v=0 is the TOP of the
// canvas — so we paint the snow cap at the top and the shadowed base at the
// bottom. Soft blended stops (deep base → mid → soft snow) plus a faint warm
// sun-side wash near the cap for a dreamy oil-painting feel.
function makeMountainGradient(o) {
  const W = 8, H = 256;
  const cvs = document.createElement('canvas');
  cvs.width = W; cvs.height = H;
  const c = cvs.getContext('2d');
  // Main vertical gradient: top = snow cap (UV v≈1, apex), bottom = base (v≈0).
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0.00, o.snow);
  g.addColorStop(0.16, o.snow);
  g.addColorStop(0.34, o.mid);
  g.addColorStop(0.70, o.mid);
  g.addColorStop(1.00, o.base);
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
  // Faint warm sun-side wash blended over the upper third (cheap golden tint).
  const wg = c.createLinearGradient(0, 0, 0, H * 0.5);
  wg.addColorStop(0.0, o.warm);
  wg.addColorStop(1.0, 'rgba(255,255,255,0)');
  c.globalAlpha = 0.22;
  c.globalCompositeOperation = 'soft-light';
  c.fillStyle = wg;
  c.fillRect(0, 0, W, H * 0.5);
  c.globalCompositeOperation = 'source-over';
  c.globalAlpha = 1.0;
  const tex = new THREE.CanvasTexture(cvs);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Build one ring of merged painterly peaks (single draw call). Peaks are tapered
// cones with slight random lean; a vertical snow-capped gradient texture is
// mapped across the cone side UVs. Unlit (MeshBasicMaterial + map) + fog so the
// distant silhouettes read as soft, dreamy snow-lit shapes that haze with depth.
function buildMountainRing(scene, opts) {
  const { radius, count, minH, maxH, baseW, y } = opts;
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
    // Soft peaks: a cone with few radial segments reads as a gently faceted summit.
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
  // Unlit vertical gradient map (snow cap → shadowed base) + fog so the ring
  // melts into haze with distance. Farther rings pass paler/bluer base+mid
  // colours so they read hazier (atmospheric perspective) — see buildSky().
  const tex = makeMountainGradient(opts);
  const mat = new THREE.MeshBasicMaterial({ map: tex, fog: true });
  const mesh = new THREE.Mesh(merged, mat);
  mesh.renderOrder = -9;
  scene.add(mesh);
  // Theme system: collect each ring's material so theme.js can tint the peaks.
  if (ctx.themeRefs && ctx.themeRefs.mountainMats) ctx.themeRefs.mountainMats.push(mat);
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

// Paint a soft oil-painting "puff" once at build time: a cluster of overlapping
// radial gradients on a feathered transparent canvas, warm-cream sunlit TOP →
// cooler lavender-grey UNDERSIDE, edges fading to fully transparent so the blobs
// read as fluffy painted cloud rather than hard spheres. Unlit + below bloom.
function makeCloudPuffTexture() {
  const SZ = 256;
  const cvs = document.createElement('canvas');
  cvs.width = cvs.height = SZ;
  const c = cvs.getContext('2d');
  // Vertical body wash: warm cream top → soft lavender-grey bottom (the two-tone).
  const body = c.createLinearGradient(0, 0, 0, SZ);
  body.addColorStop(0.00, 'rgba(255,250,238,0.96)');
  body.addColorStop(0.42, 'rgba(250,242,236,0.92)');
  body.addColorStop(0.72, 'rgba(214,210,228,0.80)');
  body.addColorStop(1.00, 'rgba(186,184,210,0.62)');
  // Draw the body only inside a soft feathered mask so square edges never show.
  c.save();
  c.fillStyle = body;
  c.fillRect(0, 0, SZ, SZ);
  c.restore();
  // Feather the whole thing radially to transparent at the rim.
  const feather = c.createRadialGradient(SZ * 0.5, SZ * 0.52, SZ * 0.10, SZ * 0.5, SZ * 0.5, SZ * 0.5);
  feather.addColorStop(0.0, 'rgba(255,255,255,1)');
  feather.addColorStop(0.62, 'rgba(255,255,255,1)');
  feather.addColorStop(1.0, 'rgba(255,255,255,0)');
  c.globalCompositeOperation = 'destination-in';
  c.fillStyle = feather;
  c.fillRect(0, 0, SZ, SZ);
  c.globalCompositeOperation = 'source-over';
  // A few soft overlapping highlight puffs on the sunlit upper half for dab feel.
  const puffs = [
    [0.36, 0.34, 0.20], [0.60, 0.30, 0.17], [0.50, 0.44, 0.22], [0.28, 0.50, 0.15],
  ];
  for (const [px, py, pr] of puffs) {
    const hg = c.createRadialGradient(SZ * px, SZ * py, 0, SZ * px, SZ * py, SZ * pr);
    hg.addColorStop(0.0, 'rgba(255,253,245,0.55)');
    hg.addColorStop(1.0, 'rgba(255,253,245,0)');
    c.fillStyle = hg;
    c.fillRect(0, 0, SZ, SZ);
  }
  const tex = new THREE.CanvasTexture(cvs);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildClouds() {
  const scene = ctx.scene;
  ctx.cloudLayers = [];
  // Fluffy two-tone oil-painting puffs at 2 altitudes. The puff texture carries
  // the warm-cream sunlit top / lavender-grey underside + feathered edges, so a
  // flattened sphere reads as a soft painted cloud. Unlit + transparent, kept
  // below the bloom threshold (no emissive) so distant clouds don't bloom.
  const puffTex = makeCloudPuffTexture();
  const lowMat = new THREE.MeshBasicMaterial({ map: puffTex, color: 0xfff4e8, transparent: true, opacity: 0.9, depthWrite: false, fog: true });
  const hiMat  = new THREE.MeshBasicMaterial({ map: puffTex, color: 0xfffaf2, transparent: true, opacity: 0.82, depthWrite: false, fog: true });
  const altitudes = [
    { y: 34, mat: lowMat, n: 7,  scale: 1.25, speed: 1.1 },
    { y: 58, mat: hiMat,  n: 6,  scale: 1.9,  speed: 0.6 },
  ];
  altitudes.forEach(layer => {
    for (let i = 0; i < layer.n; i++) {
      const g = new THREE.Group();
      const blobCount = 4 + Math.floor(Math.random() * 3);
      for (let j = 0; j < blobCount; j++) {
        const r = (6 + Math.random() * 5) * layer.scale;
        const blob = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), layer.mat);
        blob.position.set(j * 7 * layer.scale - 10, (Math.random() - 0.5) * 3.0, (Math.random() - 0.5) * 5);
        blob.scale.y = 0.5; // flatten → soft puff cluster
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
  // Theme system: capture the hemisphere fill so theme.js can shift it cool/toxic.
  ctx.themeRefs = ctx.themeRefs || {};
  ctx.themeRefs.hemi = hemi;

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

  // Cool rim / back light — the "Genshin pop". Placed opposite the warm key,
  // on the far (−Z) side behind the characters relative to the fixed +Z camera,
  // so it edge-lights their silhouettes and separates them from the background.
  // No shadows (rim lights never cast) and kept below the key so it reads as a
  // cool sky-bounce highlight, not a second sun.
  const rim = new THREE.DirectionalLight(0xbcd2ff, 0.7);
  rim.position.set(-22, 24, -40);
  rim.castShadow = false;
  scene.add(rim);
  scene.add(rim.target);
  ctx.rimLight = rim;

  const impactLight = new THREE.PointLight(0xffffff, 0, 20);
  scene.add(impactLight);
  ctx.impactLight = impactLight;

  ctx.sun = sun;
  return { sun, rim };
}
