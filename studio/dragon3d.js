// 3D dragon viewer for the landing page. Loads a textured dragon GLB, lights it
// dramatically, auto-rotates, and lets the visitor drag to spin. Element buttons swap
// the model. Lazy-inits only when scrolled into view; fails silently if WebGL/GLB is
// unavailable (the 2D art carries the page regardless).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const canvas = document.getElementById('dragon3d');
if (!canvas) throw new Error('no canvas');

const ELEMS = {
  fire:   { url: 'assets/models/dragon_fire.glb',   key: 0xff6a2c, rim: 0xffd08a },
  ice:    { url: 'assets/models/dragon_ice.glb',    key: 0x7fd0ff, rim: 0xeaffff },
  poison: { url: 'assets/models/dragon_poison.glb', key: 0x9be15d, rim: 0xe6ffd0 },
  water:  { url: 'assets/models/dragon_water.glb',  key: 0x5aa9ff, rim: 0xcfe8ff },
};

let renderer, scene, camera, keyLight, rimLight, ground, mixer;
let current = null, loading = false, started = false;
let yaw = 0.5, pitch = -0.05, autoYaw = true;
const loader = new GLTFLoader();
const clock = new THREE.Clock();

function init() {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(0, 0.4, 5.4);

  scene.add(new THREE.HemisphereLight(0x9fc4ff, 0x0b1622, 0.7));
  keyLight = new THREE.DirectionalLight(0xffae42, 2.4); keyLight.position.set(3, 4, 4); scene.add(keyLight);
  rimLight = new THREE.DirectionalLight(0x37e0c8, 1.6); rimLight.position.set(-4, 2, -3); scene.add(rimLight);
  const fill = new THREE.DirectionalLight(0x6aa0ff, 0.6); fill.position.set(-2, -1, 3); scene.add(fill);

  // soft radial contact shadow
  const tex = makeShadowTex();
  ground = new THREE.Mesh(new THREE.PlaneGeometry(6, 6),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -1.35; scene.add(ground);

  resize(); addEventListener('resize', resize);
  bindDrag();
  swap('fire');
  renderer.setAnimationLoop(render);
}

function makeShadowTex() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const g = cv.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 4, 64, 64, 60);
  grd.addColorStop(0, 'rgba(0,0,0,.55)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function resize() {
  const r = canvas.getBoundingClientRect();
  const w = r.width || canvas.clientWidth || 600, h = r.height || 480;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}

function swap(el) {
  const cfg = ELEMS[el]; if (!cfg || loading) return;
  loading = true;
  keyLight.color.setHex(cfg.key); rimLight.color.setHex(cfg.rim);
  loader.load(cfg.url, (gltf) => {
    if (current) { scene.remove(current); current.traverse(o => { o.geometry?.dispose?.(); }); }
    const m = gltf.scene;
    m.traverse(o => { if (o.isMesh) { o.frustumCulled = false; if (o.material) o.material.side = THREE.DoubleSide; } });
    // normalize: scale to a consistent height, then center XZ + sit the feet on the ground.
    let box = new THREE.Box3().setFromObject(m);
    const size = new THREE.Vector3(); box.getSize(size);
    m.scale.setScalar(2.5 / Math.max(size.y, 0.001));
    box = new THREE.Box3().setFromObject(m);
    const ctr = new THREE.Vector3(); box.getCenter(ctr);
    // wrap so we can spin around the model's own vertical axis
    const wrap = new THREE.Group();
    m.position.x -= ctr.x; m.position.z -= ctr.z;
    m.position.y -= box.min.y + 1.35;     // feet at the shadow plane (y = -1.35)
    wrap.add(m);
    scene.add(wrap); current = wrap;
    loading = false;
  }, undefined, () => { loading = false; /* GLB missing → keep prior */ });
}

function bindDrag() {
  let down = false, px = 0, py = 0;
  const start = (e) => { down = true; autoYaw = false; const p = pt(e); px = p.x; py = p.y; };
  const move = (e) => {
    if (!down) return; const p = pt(e);
    yaw += (p.x - px) * 0.01; pitch += (p.y - py) * 0.006;
    pitch = Math.max(-0.6, Math.min(0.6, pitch)); px = p.x; py = p.y;
    if (e.cancelable) e.preventDefault();
  };
  const end = () => { down = false; setTimeout(() => autoYaw = true, 2500); };
  const pt = (e) => e.touches ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : { x: e.clientX, y: e.clientY };
  canvas.addEventListener('pointerdown', start); addEventListener('pointermove', move); addEventListener('pointerup', end);
  canvas.addEventListener('touchstart', start, { passive: true });
  canvas.addEventListener('touchmove', move, { passive: false });
  canvas.addEventListener('touchend', end);
}

function render() {
  const dt = clock.getDelta();
  if (autoYaw) yaw += dt * 0.35;
  if (current) { current.rotation.y = yaw; current.rotation.x = pitch; }
  mixer?.update(dt);
  renderer.render(scene, camera);
}

// element buttons
document.querySelectorAll('.dragon-pick button').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('.dragon-pick button').forEach(x => x.classList.remove('on'));
  b.classList.add('on'); swap(b.dataset.el);
}));

// lazy init when the stage scrolls into view
const stage = document.querySelector('.dragon-stage');
if (stage && 'IntersectionObserver' in window) {
  const o = new IntersectionObserver((ents) => {
    if (ents.some(e => e.isIntersecting) && !started) { started = true; try { init(); } catch (e) { console.warn('[3d]', e); } o.disconnect(); }
  }, { threshold: 0.2 });
  o.observe(stage);
} else { try { init(); started = true; } catch (e) {} }
