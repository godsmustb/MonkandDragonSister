// src/combat/enemyGlb.js — 3D-GLB enemies (demons + bosses), now SKELETAL.
// Preloads a rigged+animated GLB per type, then hands out per-instance animators:
// each demon/boss gets its own skinned-mesh clone (SkeletonUtils) wrapped in a GltfChar
// so it plays real walk/attack/hit/death clips independently. If a type's GLB has no
// clips, GltfChar falls back to its procedural bob — and a missing GLB (404) leaves the
// procedural builder in place. GLTFLoader resolves via the vendored importmap (offline).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { GltfChar } from '../chars/gltfChar.js';
import { DEMON_TABLE } from '../config.js';

const _loader = new GLTFLoader();
const _templates = new Map();   // type -> { scene, animations }
let _started = false;

export const ENEMY_GLB_TYPES = ['shadowling', 'frostimp', 'tidewraith'];
export const BOSS_GLB_TYPES = ['venomoni', 'infernolord'];

export function preloadEnemyGlbs() {
  if (_started) return;
  _started = true;
  for (const type of [...ENEMY_GLB_TYPES, ...BOSS_GLB_TYPES]) {
    _loader.load(
      `assets/demon_${type}.glb`,
      (gltf) => { _templates.set(type, { scene: gltf.scene, animations: gltf.animations || [] }); },
      undefined,
      () => { /* fail-silent → procedural fallback */ }
    );
  }
}

export function hasEnemyGlb(type) { return _templates.has(type); }

// Per-instance animator. Returns a GltfChar (clip-driven if the GLB has animations,
// else procedural bob), scaled to the type's DEMON_TABLE height. null if not loaded.
export function getEnemyChar(type) {
  const tmpl = _templates.get(type);
  if (!tmpl) return null;
  const cfg = DEMON_TABLE[type] || {};
  const scene = tmpl.animations.length ? cloneSkinned(tmpl.scene) : tmpl.scene.clone(true);
  const char = new GltfChar(
    { scene, animations: tmpl.animations },
    { targetHeight: cfg.height || 1.2, forwardYaw: Math.PI }
  );
  let body = null;
  char.group.traverse(o => { if (o.isMesh && !body) body = o; });
  char.group._enemyBody = body;
  return char;
}
