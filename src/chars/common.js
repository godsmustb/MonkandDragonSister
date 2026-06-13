// src/chars/common.js — shared character-kit helpers
// 3-band toon ramp, cached toon materials, inverted-hull outline (mergeable),
// canvas-painted anime face textures, lathe + geometry helpers.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ---- Shared 3-band toon gradient (ART_BIBLE: shadow 0.45 → mid 0.72 → light 1.0) ----
let _gradTex = null;
export function getGradTex() {
  if (_gradTex) return _gradTex;
  // 4 bands: deep 0.30, shadow 0.45, mid 0.72, light 1.0 — second is unused by most but
  // gives a touch more depth on bosses; clamp to 0..255.
  const data = new Uint8Array([Math.round(0.45 * 255), Math.round(0.72 * 255), 255]);
  _gradTex = new THREE.DataTexture(data, 3, 1, THREE.RedFormat);
  _gradTex.needsUpdate = true;
  _gradTex.magFilter = THREE.NearestFilter;
  _gradTex.minFilter = THREE.NearestFilter;
  return _gradTex;
}

// ---- Fresnel rim injection (the "Genshin pop") ----
// Adds a cool view-angle rim glow to a toon material via onBeforeCompile. Hooked
// at <dithering_fragment> (the final include in every lit fragment shader) so it
// works regardless of the exact toon chunk names, and degrades to a silent no-op
// if the token is ever absent — never a hard shader error (E2E stays green).
const RIM_COLOR    = new THREE.Color(0xbcd2ff); // matches the scene rim light
const RIM_POWER    = 2.6;
const RIM_STRENGTH = 0.32;
function applyToonRim(mat) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uRimColor    = { value: RIM_COLOR };
    shader.uniforms.uRimPower    = { value: RIM_POWER };
    shader.uniforms.uRimStrength = { value: RIM_STRENGTH };
    shader.fragmentShader =
      'uniform vec3 uRimColor; uniform float uRimPower; uniform float uRimStrength;\n' +
      shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        '#include <dithering_fragment>\n' +
        '  float _rim = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), uRimPower);\n' +
        '  gl_FragColor.rgb += uRimColor * (_rim * uRimStrength);'
      );
  };
}

// ---- Cached toon materials (one shared instance per color, per opts signature) ----
const _matCache = new Map();
export function toonMat(color, opts = {}) {
  const key = color + '|' + JSON.stringify(opts);
  let m = _matCache.get(key);
  if (m) return m;
  m = new THREE.MeshToonMaterial({ color, gradientMap: getGradTex(), ...opts });
  applyToonRim(m);
  _matCache.set(key, m);
  return m;
}

// ---- Emissive (bloom-catching) accent material, cached ----
const _emCache = new Map();
export function emissiveMat(color, intensity = 1.8, opts = {}) {
  const key = color + '|' + intensity + '|' + JSON.stringify(opts);
  let m = _emCache.get(key);
  if (m) return m;
  m = new THREE.MeshStandardMaterial({
    color, emissive: color, emissiveIntensity: intensity,
    roughness: 0.5, metalness: 0.0, ...opts,
  });
  _emCache.set(key, m);
  return m;
}

// ---- Outline material cache (per ink color) ----
const _outlineMatCache = new Map();
export function outlineMat(ink = 0x241a22) {
  let m = _outlineMatCache.get(ink);
  if (m) return m;
  m = new THREE.MeshBasicMaterial({ color: ink, side: THREE.BackSide });
  _outlineMatCache.set(ink, m);
  return m;
}

/**
 * Build ONE merged inverted-hull outline mesh for a list of {geometry, matrix} parts.
 * Each entry: { geo, pos:[x,y,z], rot:[x,y,z], scale:number|[x,y,z], hull:1.04 }.
 * Returns a single Mesh (BackSide) so a whole character outline = 1 draw call.
 */
export function buildMergedOutline(parts, ink = 0x241a22) {
  const geos = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  for (const part of parts) {
    const g = part.geo.clone();
    const hull = part.hull || 1.04;
    const baseScale = part.scale != null
      ? (Array.isArray(part.scale) ? part.scale : [part.scale, part.scale, part.scale])
      : [1, 1, 1];
    s.set(baseScale[0] * hull, baseScale[1] * hull, baseScale[2] * hull);
    e.set(...(part.rot || [0, 0, 0]));
    q.setFromEuler(e);
    p.set(...(part.pos || [0, 0, 0]));
    m.compose(p, q, s);
    g.applyMatrix4(m);
    geos.push(g);
  }
  if (!geos.length) return null;
  const merged = mergeGeometries(geos, false);
  geos.forEach(g => g.dispose());
  return new THREE.Mesh(merged, outlineMat(ink));
}

/** Convenience: simple per-mesh inverted hull (use sparingly; prefer merged). */
export function addOutline(mesh, scaleFactor = 1.04, ink = 0x241a22) {
  const geo = mesh.geometry;
  const outline = new THREE.Mesh(geo, outlineMat(ink));
  outline.scale.setScalar(scaleFactor);
  mesh.add(outline);
  return outline;
}

// ---- Lathe helper: points are [ [radius,height], ... ] ----
export function lathe(points, segments = 24, material) {
  const v = points.map(([r, y]) => new THREE.Vector2(r, y));
  const geo = new THREE.LatheGeometry(v, segments);
  return new THREE.Mesh(geo, material);
}

// =====================================================================
//  CANVAS-PAINTED ANIME FACE TEXTURES
//  Painted to a 256² canvas, mapped onto a curved decal plane that hugs
//  the front of the head sphere. Face stays crisp (no outline).
// =====================================================================

/**
 * Paint an anime face onto a canvas and return a CanvasTexture.
 * opts: { skin, iris, brow, mouth, blush, expression, lashes }
 *   expression: 'determined' | 'gentle' | 'fierce'
 */
export function makeFaceTexture(opts = {}) {
  const {
    skin = '#f0c79a',
    iris = '#5a3a2a',
    brow = '#3a2418',
    mouth = '#a85a4a',
    blush = '#e89a8a',
    expression = 'determined',
    lashes = false,
  } = opts;

  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d');

  // Transparent base so only the painted face shows over the skin sphere
  x.clearRect(0, 0, S, S);

  // Soft skin wash (very subtle, transparent edges) so the decal blends
  const grad = x.createRadialGradient(S / 2, S / 2, S * 0.15, S / 2, S / 2, S * 0.55);
  grad.addColorStop(0, hexA(skin, 0.0));
  grad.addColorStop(0.7, hexA(skin, 0.0));
  grad.addColorStop(1, hexA(skin, 0.0));
  x.fillStyle = grad;
  x.fillRect(0, 0, S, S);

  // Eyes set low (lower-middle), ~40% of face height. Face center ~y 0.46.
  const eyeY = S * 0.56;
  const eyeDX = S * 0.20;       // horizontal offset from center
  const eyeW = S * 0.15;        // eye half-width
  const eyeH = expression === 'fierce' ? S * 0.11 : S * 0.16;
  const cx = S / 2;

  for (const sgn of [-1, 1]) {
    const ex = cx + sgn * eyeDX;

    // White of eye
    x.fillStyle = '#ffffff';
    ellipse(x, ex, eyeY, eyeW, eyeH);
    x.fill();

    // Iris
    const irisR = eyeW * 0.78;
    x.save();
    ellipsePath(x, ex, eyeY, eyeW, eyeH);
    x.clip();
    // iris gradient (darker rim, brighter center)
    const ig = x.createRadialGradient(ex, eyeY + eyeH * 0.1, irisR * 0.2, ex, eyeY, irisR);
    ig.addColorStop(0, lighten(iris, 0.25));
    ig.addColorStop(0.7, iris);
    ig.addColorStop(1, darken(iris, 0.35));
    x.fillStyle = ig;
    x.beginPath();
    x.arc(ex, eyeY + eyeH * 0.06, irisR, 0, Math.PI * 2);
    x.fill();
    // pupil
    x.fillStyle = '#1a1014';
    x.beginPath();
    x.arc(ex, eyeY + eyeH * 0.06, irisR * 0.5, 0, Math.PI * 2);
    x.fill();
    // two highlights
    x.fillStyle = 'rgba(255,255,255,0.95)';
    x.beginPath();
    x.arc(ex - irisR * 0.35, eyeY - eyeH * 0.25, irisR * 0.32, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = 'rgba(255,255,255,0.7)';
    x.beginPath();
    x.arc(ex + irisR * 0.3, eyeY + eyeH * 0.25, irisR * 0.16, 0, Math.PI * 2);
    x.fill();
    x.restore();

    // Upper lash line / eye outline
    x.strokeStyle = lashes ? '#1a1018' : darken(skin, 0.45);
    x.lineWidth = lashes ? S * 0.018 : S * 0.012;
    x.lineCap = 'round';
    ellipseArc(x, ex, eyeY, eyeW, eyeH, Math.PI * 1.05, Math.PI * 1.95);
    x.stroke();
    if (lashes) {
      // outer lash flick
      x.beginPath();
      x.moveTo(ex + sgn * eyeW * 0.9, eyeY - eyeH * 0.1);
      x.lineTo(ex + sgn * eyeW * 1.35, eyeY - eyeH * 0.5);
      x.lineWidth = S * 0.014;
      x.stroke();
    }

    // Brow — bold, angled (determined/fierce = angled in & down; gentle = soft up)
    const browY = eyeY - eyeH * (expression === 'fierce' ? 1.0 : 1.25);
    const innerDrop = (expression === 'gentle') ? -S * 0.012 : S * 0.04;
    const innerX = cx + sgn * (eyeDX - eyeW * 0.85);
    const outerX = cx + sgn * (eyeDX + eyeW * 0.85);
    x.strokeStyle = brow;
    x.lineCap = 'round';
    // taper: thick at inner, thin at outer (anime brow)
    x.lineWidth = S * 0.036;
    x.beginPath();
    x.moveTo(innerX, browY + innerDrop);
    x.quadraticCurveTo((innerX + outerX) / 2, browY - S * 0.012, outerX, browY - S * 0.004);
    x.stroke();
  }

  // Nose dot
  x.fillStyle = hexA(darken(skin, 0.25), 0.5);
  x.beginPath();
  x.arc(cx, eyeY + eyeH * 1.6, S * 0.012, 0, Math.PI * 2);
  x.fill();

  // Mouth — small, neutral-firm or soft smile
  const mouthY = eyeY + eyeH * 2.5;
  x.strokeStyle = mouth;
  x.lineWidth = S * 0.02;
  x.lineCap = 'round';
  x.beginPath();
  if (expression === 'gentle') {
    x.moveTo(cx - S * 0.06, mouthY);
    x.quadraticCurveTo(cx, mouthY + S * 0.04, cx + S * 0.06, mouthY);
  } else if (expression === 'fierce') {
    x.moveTo(cx - S * 0.07, mouthY + S * 0.01);
    x.quadraticCurveTo(cx, mouthY - S * 0.015, cx + S * 0.07, mouthY + S * 0.01);
  } else {
    // determined: firm flat-ish
    x.moveTo(cx - S * 0.06, mouthY);
    x.lineTo(cx + S * 0.06, mouthY);
  }
  x.stroke();

  // Blush dots
  x.fillStyle = hexA(blush, 0.35);
  for (const sgn of [-1, 1]) {
    x.beginPath();
    x.ellipse(cx + sgn * S * 0.30, eyeY + eyeH * 1.3, S * 0.07, S * 0.045, 0, 0, Math.PI * 2);
    x.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Build a curved face-decal plane hugging the front of a head sphere of radius R.
 * Returns a Mesh using a CylinderGeometry segment (front arc) with the face texture.
 */
export function buildFaceDecal(R, faceTex) {
  // Curved shell hugging the front of the head. The patch must be large enough that
  // the anime face reads at small viewport size: wide phi arc + tall theta band that
  // straddles the equator (eyes sit just below center).
  const phiStart = Math.PI * 0.5 - 1.05;   // center the arc on +Z
  const phiLength = 2.1;                     // ~120° horizontal wrap
  const thetaStart = Math.PI * 0.26;         // start above the eyes (forehead)
  const thetaLength = Math.PI * 0.50;        // down to chin
  const geo = new THREE.SphereGeometry(R * 1.015, 28, 20, phiStart, phiLength, thetaStart, thetaLength);
  remapDecalUVs(geo);
  const mat = new THREE.MeshBasicMaterial({ map: faceTex, transparent: true, depthWrite: false });
  mat.polygonOffset = true; mat.polygonOffsetFactor = -1; mat.polygonOffsetUnits = -1;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 2;
  return mesh;
}

function remapDecalUVs(geo) {
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
  for (let i = 0; i < uv.count; i++) {
    minU = Math.min(minU, uv.getX(i)); maxU = Math.max(maxU, uv.getX(i));
    minV = Math.min(minV, uv.getY(i)); maxV = Math.max(maxV, uv.getY(i));
  }
  const du = maxU - minU || 1, dv = maxV - minV || 1;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, (uv.getX(i) - minU) / du, (uv.getY(i) - minV) / dv);
  }
  uv.needsUpdate = true;
}

// ---- canvas color helpers ----
function hexA(hex, a) {
  const { r, g, b } = hexRGB(hex);
  return `rgba(${r},${g},${b},${a})`;
}
function hexRGB(hex) {
  if (typeof hex === 'number') hex = '#' + hex.toString(16).padStart(6, '0');
  const h = hex.replace('#', '');
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}
function lighten(hex, amt) {
  const { r, g, b } = hexRGB(hex);
  return `rgb(${Math.min(255, r + amt * 255 | 0)},${Math.min(255, g + amt * 255 | 0)},${Math.min(255, b + amt * 255 | 0)})`;
}
function darken(hex, amt) {
  const { r, g, b } = hexRGB(hex);
  return `rgb(${Math.max(0, r - amt * 255 | 0)},${Math.max(0, g - amt * 255 | 0)},${Math.max(0, b - amt * 255 | 0)})`;
}

// ---- canvas ellipse helpers ----
function ellipse(x, cx, cy, rx, ry) { x.beginPath(); x.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); }
function ellipsePath(x, cx, cy, rx, ry) { x.beginPath(); x.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); }
function ellipseArc(x, cx, cy, rx, ry, a0, a1) { x.beginPath(); x.ellipse(cx, cy, rx, ry, 0, a0, a1); }
