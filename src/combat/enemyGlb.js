// src/combat/enemyGlb.js — optional 3D-GLB demon meshes (ContentGenAI breadth pass).
// Mirrors the hero GLB swap (gltfChar.js) but for enemies: preload a demon GLB per
// type, then hand out per-instance clones scaled to the demon's in-game height. The
// meshes are clip-less (Hunyuan shape), so the existing per-spirit bob in spirits.js
// keeps them alive — no skeleton/clip machinery (cheap: many demons on screen at once).
//
// Fail-silent: if a type has no GLB (404) the loader simply never caches it, and
// Spirit._buildMesh falls back to the procedural builder. GLTFLoader resolves via the
// vendored importmap (offline, no CDN). Bosses are intentionally NOT swapped — their
// procedural telegraph/element-shift poses are gameplay tells.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DEMON_TABLE } from '../config.js';

const _loader = new GLTFLoader();
const _templates = new Map();   // type -> gltf.scene template (cloned per instance)
let _started = false;

// Common (non-boss) demons get the 3D swap.
export const ENEMY_GLB_TYPES = ['shadowling', 'frostimp', 'tidewraith'];

export function preloadEnemyGlbs() {
  if (_started) return;
  _started = true;
  for (const type of ENEMY_GLB_TYPES) {
    _loader.load(
      `assets/demon_${type}.glb`,
      (gltf) => { _templates.set(type, gltf.scene); },
      undefined,
      () => { /* fail-silent → procedural fallback */ }
    );
  }
}

export function hasEnemyGlb(type) { return _templates.has(type); }

// Per-instance clone, scaled to the demon's intended height, feet at y=0, centered XZ.
// Returns null when no template is loaded (→ caller keeps the procedural mesh).
export function getEnemyMesh(type) {
  const tmpl = _templates.get(type);
  if (!tmpl) return null;
  const group = new THREE.Group();
  const scene = tmpl.clone(true);
  group.add(scene);

  const cfg = DEMON_TABLE[type] || {};
  const targetH = cfg.height || 1.2;
  scene.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(scene);
  const size = new THREE.Vector3(); box.getSize(size);
  scene.scale.multiplyScalar(targetH / Math.max(size.y, 1e-3));
  scene.updateWorldMatrix(true, true);
  const box2 = new THREE.Box3().setFromObject(scene);
  const ctr = new THREE.Vector3(); box2.getCenter(ctr);
  scene.position.x -= ctr.x;
  scene.position.z -= ctr.z;
  scene.position.y -= box2.min.y;

  let body = null;
  group.traverse(o => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = true; if (!body) body = o; } });
  group._enemyBody = body;
  return group;
}
