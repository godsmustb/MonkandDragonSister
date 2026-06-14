// src/chars/gltfChar.js — rigged-GLB hero loader + animation state machine.
// Drop-in for FirstGame (Three.js). Loads a Mixamo-merged GLB (multiple clips),
// exposes a tiny state machine the player update can drive, and stays compatible
// with the game's `currentMesh()`/transform expectations.
//
// GLTFLoader resolves via the existing importmap `three/addons/` → vendored r160
// (vendor/three/addons/), so it works fully offline — no CDN. Its only addon dep
// (utils/BufferGeometryUtils.js) is already vendored.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const _loader = new GLTFLoader();

// Game-state -> clip-name resolution (falls back gracefully if a clip is missing).
const CLIP_ALIASES = {
  idle:   ['idle', 'breathing_idle'],
  walk:   ['walk', 'walking'],
  run:    ['run', 'running'],
  attack1:['attack1', 'attack', 'staff_smash'],
  attack2:['attack2', 'attack1', 'attack'],
  attack3:['attack3', 'attack2', 'attack'],
  cast:   ['cast', 'praying', 'transform'],
  dodge:  ['dodge', 'roll'],
  hit:    ['hit', 'react'],
  death:  ['death', 'dying', 'ko'],
};
const ONESHOT = new Set(['attack1', 'attack2', 'attack3', 'cast', 'dodge', 'hit', 'death']);

export class GltfChar {
  constructor(gltf, opts = {}) {
    this.group = new THREE.Group();          // what the game adds to the scene & positions
    this.group.add(gltf.scene);
    this.group._isGltf = true;               // anim.js checks this to skip procedural posing
    this.group._char = this;

    // Forward/scale alignment to the game's conventions (tune per project).
    gltf.scene.rotation.y = opts.forwardYaw ?? 0;
    if (opts.scale) gltf.scene.scale.setScalar(opts.scale);

    // Optional cel-shade match: swap to the game's toon material if provided.
    if (opts.toonify) gltf.scene.traverse(o => { if (o.isMesh) opts.toonify(o); });
    gltf.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });

    this.mixer = new THREE.AnimationMixer(gltf.scene);
    this.actions = new Map();
    for (const clip of gltf.animations) {
      const a = this.mixer.clipAction(clip);
      this.actions.set(clip.name.toLowerCase().replace(/[^a-z0-9]+/g, '_'), a);
    }
    this.current = null;
    this._lockUntil = 0;                      // one-shot lock (don't interrupt mid-attack)
    this._t = 0;
    this.play('idle', 0);
  }

  _resolve(state) {
    for (const name of (CLIP_ALIASES[state] || [state])) {
      const key = name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
      if (this.actions.has(key)) return key;
    }
    return this.actions.keys().next().value; // first available
  }

  // Crossfade to a state. One-shot states play once, then auto-return to `then` (default idle).
  play(state, fade = 0.18, then = 'idle') {
    const key = this._resolve(state);
    if (!key) return;
    const action = this.actions.get(key);
    const oneshot = ONESHOT.has(state);

    if (this.current === action && !oneshot) return;
    action.reset();
    action.enabled = true;
    action.setEffectiveWeight(1);
    if (oneshot) { action.setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true; this._lockUntil = this._t + action.getClip().duration; this._pendingThen = then; }
    else { action.setLoop(THREE.LoopRepeat, Infinity); this._lockUntil = 0; }
    if (this.current && this.current !== action) action.crossFadeFrom(this.current, fade, false);
    action.play();
    this.current = action;
  }

  // Drive from player flags each frame. Priority: KO > one-shot lock > locomotion.
  setLocomotion(moving, running) {
    if (this._t < this._lockUntil) return;   // don't interrupt an active one-shot
    this.play(running ? 'run' : moving ? 'walk' : 'idle');
  }

  update(dt) {
    this._t += dt;
    this.mixer.update(dt);
    if (this._lockUntil && this._t >= this._lockUntil) {
      this._lockUntil = 0;
      if (this._pendingThen) { this.play(this._pendingThen, 0.15); this._pendingThen = null; }
    }
  }
}

// Async loader. Preload during MENU/INTRO so the model is ready before WAVE1.
export function loadGltfCharacter(url, opts = {}) {
  return new Promise((resolve, reject) => {
    _loader.load(url, (gltf) => resolve(new GltfChar(gltf, opts)),
      undefined, (err) => reject(err));
  });
}
