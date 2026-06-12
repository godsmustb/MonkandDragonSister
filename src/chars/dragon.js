// src/chars/dragon.js — parametric eastern dragon (longshen), 1 builder, 4 element skins
// Per docs/characters/dragon-parametric.md.
// Contract preserved: g._segments (array of Groups, .position driven by _updateDragonSpine),
//   g._head, g._element, g._trail. Adds g._whiskers, g._fins, g._jaw, g._belly for anim.
import * as THREE from 'three';
import { toonMat, emissiveMat } from './common.js';

// ---- Per-element palette + variant matrix (dragon-parametric.md §4) ----
const ELEMENTS = {
  fire:   { BODY: 0xc42a1c, BELLY: 0xffc24b, FIN: 0xff6a2a, AURA: 0xff6a2a, OUTLINE: 0x3a0e0a, antler: 'flame',   dorsal: 'flame',     tail: 'flame'  },
  ice:    { BODY: 0x9fcfef, BELLY: 0xa9e4ff, FIN: 0xf2faff, AURA: 0xa9e4ff, OUTLINE: 0x1e3a52, antler: 'crystal', dorsal: 'crystal',   tail: 'crystal' },
  poison: { BODY: 0x6e4fa0, BELLY: 0x7fe05a, FIN: 0xa45cff, AURA: 0xa45cff, OUTLINE: 0x2e1742, antler: 'drippy',  dorsal: 'membrane',  tail: 'membrane' },
  water:  { BODY: 0x1e5f9e, BELLY: 0x46d6e0, FIN: 0x46d6e0, AURA: 0x4fe3ff, OUTLINE: 0x0e2c4a, antler: 'fronds',  dorsal: 'ribbon',    tail: 'ribbon' },
};

const N_SEG = 18;        // body segments along spine
const HEAD_Y = 0.8;      // matches _updateDragonSpine head height contract

// radius curve along body t∈[0,1]: neck 0.30 → swell 0.42 @t≈0.35 → tail 0.12
function bodyRadius(t) {
  const swell = 0.42, neck = 0.30, tail = 0.12;
  if (t < 0.35) return neck + (swell - neck) * (t / 0.35);
  return swell + (tail - swell) * ((t - 0.35) / 0.65);
}

export function buildDragon(element) {
  const P = ELEMENTS[element] || ELEMENTS.water;
  const g = new THREE.Group();

  const matBody = toonMat(P.BODY);
  const matFin = toonMat(P.FIN);
  const matBelly = emissiveMat(P.BELLY, 2.0);
  const matEye = emissiveMat(P.BELLY, 2.2);
  const matAntler = toonMat(P.FIN);
  const matBone = toonMat(0xe8e0c8);

  // =================== HEAD ===================
  const head = new THREE.Group();
  head.position.y = HEAD_Y;
  g.add(head);
  g._head = head;

  const cranium = new THREE.Mesh(new THREE.SphereGeometry(0.30, 16, 12), matBody);
  cranium.castShadow = true;
  addHull(cranium, P.OUTLINE, 1.04);
  head.add(cranium);

  // snout / upper jaw
  const snout = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.20, 0.34, 12), matBody);
  snout.rotation.x = Math.PI / 2; snout.position.set(0, -0.02, 0.30);
  addHull(snout, P.OUTLINE, 1.04);
  head.add(snout);
  // nostril bumps
  for (const sx of [-0.07, 0.07]) {
    const n = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), matBody);
    n.position.set(sx, 0.05, 0.46); head.add(n);
  }
  // lower jaw (hinged) — pivot at jaw joint
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.10, 0.10);
  const jawMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.16, 0.30, 10), matBody);
  jawMesh.rotation.x = Math.PI / 2; jawMesh.position.z = 0.18;
  jaw.add(jawMesh);
  // tongue
  const tongue = new THREE.Mesh(new THREE.PlaneGeometry(0.10, 0.22), toonMat(0xcc3344));
  tongue.rotation.x = -Math.PI / 2 + 0.2; tongue.position.set(0, 0.02, 0.22);
  jaw.add(tongue);
  head.add(jaw);
  g._jaw = jaw;

  // teeth / fangs
  for (const sx of [-0.10, -0.04, 0.04, 0.10]) {
    const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.07, 5), matBone);
    tooth.position.set(sx, 0.04, 0.42); tooth.rotation.x = Math.PI; head.add(tooth);
  }

  // eyes (big, expressive, emissive iris)
  for (const sx of [-0.18, 0.18]) {
    const eyeWhite = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), toonMat(0xffffff));
    eyeWhite.position.set(sx, 0.12, 0.20); head.add(eyeWhite);
    const iris = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), matEye);
    iris.position.set(sx, 0.12, 0.27); head.add(iris);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), toonMat(0x111111));
    pupil.position.set(sx, 0.12, 0.31); head.add(pupil);
    // brow ridge (fierce wedge)
    const brow = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 4), matBody);
    brow.position.set(sx, 0.22, 0.18);
    brow.rotation.z = sx < 0 ? -0.5 : 0.5; brow.rotation.x = -0.6;
    head.add(brow);
  }

  // forehead pearl (chasing-pearl motif)
  const pearl = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), matEye);
  pearl.position.set(0, 0.28, 0.12); head.add(pearl);
  g._pearl = pearl;

  // antler crests (deer-antler, 2-3 tines, element variant)
  for (const sgn of [-1, 1]) {
    const antler = buildAntler(P.antler, matAntler);
    antler.position.set(sgn * 0.16, 0.26, -0.06);
    antler.rotation.z = sgn * 0.35; antler.rotation.x = -0.4;
    head.add(antler);
  }
  // cheek horns / jaw fins
  for (const sgn of [-1, 1]) {
    const cheek = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.20, 5), matFin);
    cheek.position.set(sgn * 0.26, 0.0, -0.05);
    cheek.rotation.z = sgn * 1.3; cheek.rotation.y = sgn * 0.4;
    head.add(cheek);
  }
  // neck mane (swept-back fins behind head)
  for (let i = 0; i < 5; i++) {
    const mane = buildFin(P.dorsal, 0.10 + i * 0.02, matFin);
    mane.position.set(0, 0.20 - i * 0.06, -0.10 - i * 0.06);
    mane.rotation.x = -0.9;
    head.add(mane);
  }

  // whiskers (long curved tubes, sway physics)
  g._whiskers = [];
  for (const sgn of [-1, 1]) {
    const whisker = buildWhisker(sgn, matFin, P.AURA);
    whisker.position.set(sgn * 0.16, 0.04, 0.42);
    head.add(whisker);
    g._whiskers.push({ mesh: whisker, side: sgn, phase: Math.random() * 6 });
  }

  // =================== BODY SEGMENTS along spine ===================
  const segs = [];
  g._fins = [];
  g._belly = [];
  for (let i = 0; i < N_SEG; i++) {
    const t = i / (N_SEG - 1);
    const r = bodyRadius(t);
    const segGroup = new THREE.Group();

    // tapered body piece (squashed sphere reads continuous + bends smoothly)
    const seg = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), matBody);
    seg.scale.z = 1.25; // slight elongation along travel
    seg.castShadow = true;
    segGroup.add(seg);
    segGroup._seg = seg;

    // glowing belly band on underside
    const belly = new THREE.Mesh(
      new THREE.SphereGeometry(r * 0.82, 10, 8, 0, Math.PI * 2, Math.PI * 0.62, Math.PI * 0.38),
      matBelly);
    belly.position.y = 0;
    segGroup.add(belly);
    g._belly.push(belly);

    // dorsal fin every other segment, scaling down tail-ward
    if (i % 2 === 0 && t < 0.95) {
      const fin = buildFin(P.dorsal, (0.22 - t * 0.16), matFin);
      fin.position.set(0, r * 0.85, 0);
      segGroup.add(fin);
      g._fins.push({ mesh: fin, seg: i });
    }

    g.add(segGroup);
    segs.push(segGroup);
  }
  g._segments = segs;

  // =================== LIMBS — 4 small clawed ===================
  // front pair near t≈0.20 (seg ~3-4), rear pair near t≈0.55 (seg ~10)
  g._limbs = [];
  const limbSpecs = [
    { seg: Math.round(0.20 * N_SEG), sgn: -1 }, { seg: Math.round(0.20 * N_SEG), sgn: 1 },
    { seg: Math.round(0.55 * N_SEG), sgn: -1 }, { seg: Math.round(0.55 * N_SEG), sgn: 1 },
  ];
  for (const spec of limbSpecs) {
    const limb = buildLimb(matBody, matBone, matFin);
    limb.rotation.z = spec.sgn * 1.0;
    segs[spec.seg].add(limb);
    limb.position.set(spec.sgn * 0.25, -0.1, 0);
    g._limbs.push(limb);
  }

  // =================== TAIL FIN (element variant) ===================
  const tailFin = buildTailFin(P.tail, matFin);
  const lastSeg = segs[N_SEG - 1];
  tailFin.position.set(0, 0, -0.1);
  lastSeg.add(tailFin);
  g._tailFin = tailFin;

  // =================== TRAIL (aura anchor, kept in scene) ===================
  const trail = new THREE.Group();
  g._trail = trail;
  g._auraColor = P.AURA;

  g._element = element;
  g._kind = 'dragon';
  return g;
}

// ---- per-mesh hull (dragon segments are dynamic, so per-mesh outline) ----
function addHull(mesh, ink, scale = 1.04) {
  const outline = new THREE.Mesh(mesh.geometry,
    new THREE.MeshBasicMaterial({ color: ink, side: THREE.BackSide }));
  outline.scale.setScalar(scale);
  mesh.add(outline);
}

// ---- antler variants ----
function buildAntler(variant, mat) {
  const grp = new THREE.Group();
  if (variant === 'crystal') {
    // faceted angular shards (low-poly cones)
    const main = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.32, 4), mat);
    main.position.y = 0.16; grp.add(main);
    for (const [dx, dy, rz] of [[-0.06, 0.22, 0.6], [0.05, 0.26, -0.5]]) {
      const tine = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.18, 4), mat);
      tine.position.set(dx, dy, 0); tine.rotation.z = rz; grp.add(tine);
    }
  } else if (variant === 'drippy') {
    const main = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.05, 0.30, 8), mat);
    main.position.y = 0.15; grp.add(main);
    for (const [dx, dy] of [[-0.05, 0.24], [0.05, 0.20]]) {
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), mat);
      bulb.position.set(dx, dy, 0); grp.add(bulb);
    }
  } else if (variant === 'fronds') {
    // smooth flowing fin-like fronds
    const main = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.30, 8), mat);
    main.position.y = 0.15; main.scale.x = 0.5; grp.add(main);
    for (const [dx, dy, rz] of [[-0.07, 0.20, 0.7], [0.07, 0.24, -0.7]]) {
      const frond = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.18, 8), mat);
      frond.position.set(dx, dy, 0); frond.rotation.z = rz; frond.scale.x = 0.5; grp.add(frond);
    }
  } else { // flame (fire) — sharp upswept
    const main = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.34, 5), mat);
    main.position.y = 0.17; grp.add(main);
    for (const [dx, dy, rz] of [[-0.06, 0.24, 0.5], [0.06, 0.28, -0.4], [0.0, 0.34, 0]]) {
      const tine = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.16, 5), mat);
      tine.position.set(dx, dy, 0); tine.rotation.z = rz; grp.add(tine);
    }
  }
  return grp;
}

// ---- dorsal fin / mane variants (returns a single mesh) ----
function buildFin(variant, size, mat) {
  if (variant === 'crystal') {
    // hard hexagonal crystal shard
    const m = new THREE.Mesh(new THREE.ConeGeometry(size * 0.5, size * 1.4, 6), mat);
    return m;
  }
  if (variant === 'ribbon') {
    // long wavy ribbon fin (animated elsewhere)
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size * 0.5, size * 1.8, 1, 4), mat);
    m.position.y = size * 0.9;
    return m;
  }
  if (variant === 'membrane') {
    const m = new THREE.Mesh(new THREE.CircleGeometry(size, 8, 0, Math.PI), mat);
    m.rotation.x = -Math.PI / 2; m.scale.y = 1.4;
    return m;
  }
  // flame fin — pointed teardrop (triangle plane)
  const shape = new THREE.Shape();
  shape.moveTo(-size * 0.5, 0); shape.lineTo(0, size * 1.5); shape.lineTo(size * 0.5, 0);
  shape.closePath();
  const m = new THREE.Mesh(new THREE.ShapeGeometry(shape), mat);
  m.material = mat.clone(); m.material.side = THREE.DoubleSide;
  return m;
}

// ---- tail fin variants ----
function buildTailFin(variant, mat) {
  const grp = new THREE.Group();
  const count = variant === 'ribbon' ? 3 : 5;
  for (let i = 0; i < count; i++) {
    const a = (i / (count - 1) - 0.5) * (variant === 'ribbon' ? 0.8 : 1.4);
    let blade;
    if (variant === 'crystal') {
      blade = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.4, 4), mat);
    } else if (variant === 'ribbon') {
      blade = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.5, 1, 5), mat.clone());
      blade.material.side = THREE.DoubleSide;
      blade.position.y = -0.2;
    } else if (variant === 'membrane') {
      blade = new THREE.Mesh(new THREE.CircleGeometry(0.18, 6, 0, Math.PI), mat.clone());
      blade.material.side = THREE.DoubleSide;
    } else { // flame fan
      const shape = new THREE.Shape();
      shape.moveTo(-0.04, 0); shape.lineTo(0, 0.42); shape.lineTo(0.04, 0); shape.closePath();
      blade = new THREE.Mesh(new THREE.ShapeGeometry(shape), mat.clone());
      blade.material.side = THREE.DoubleSide;
    }
    blade.rotation.z = a; blade.position.z = -0.12;
    grp.add(blade);
  }
  return grp;
}

// ---- whisker (curved tube along a catmull-rom curve) ----
function buildWhisker(sgn, mat, tipColor) {
  const pts = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    pts.push(new THREE.Vector3(
      sgn * (0.0 + t * 0.5),
      0.0 - Math.sin(t * Math.PI) * 0.12 - t * 0.1,
      t * 0.6,
    ));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const geo = new THREE.TubeGeometry(curve, 16, 0.015, 5, false);
  const mesh = new THREE.Mesh(geo, mat);
  return mesh;
}

// ---- small clawed limb ----
function buildLimb(matBody, matBone, matFin) {
  const limb = new THREE.Group();
  const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.18, 8), matBody);
  upper.position.y = -0.09; limb.add(upper);
  const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.14, 8), matBody);
  fore.position.y = -0.22; limb.add(fore);
  const paw = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), matBody);
  paw.position.y = -0.30; limb.add(paw);
  // 3 claws
  for (const dx of [-0.03, 0, 0.03]) {
    const claw = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.05, 5), matBone);
    claw.position.set(dx, -0.34, 0.03); limb.add(claw);
  }
  // wind-fin tuft at elbow
  const fin = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.10, 5), matFin);
  fin.position.set(0, -0.14, -0.05); fin.rotation.x = 1.0; limb.add(fin);
  return limb;
}
