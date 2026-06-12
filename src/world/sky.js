// src/world/sky.js — sky sphere, clouds, sun/lighting rig
import * as THREE from 'three';
import { ctx } from '../state.js';

export function buildSky() {
  const scene = ctx.scene;

  // Sky dome — canvas-gradient texture (horizon warm peach → zenith soft blue)
  const skyCvs = document.createElement('canvas');
  skyCvs.width = 2; skyCvs.height = 256;
  const skyCtx = skyCvs.getContext('2d');
  const skyGrad = skyCtx.createLinearGradient(0, 0, 0, 256);
  skyGrad.addColorStop(0,   '#5b9fd4'); // zenith blue
  skyGrad.addColorStop(0.6, '#a8cfe0'); // mid
  skyGrad.addColorStop(1,   '#f0d5b0'); // horizon warm cream/peach
  skyCtx.fillStyle = skyGrad;
  skyCtx.fillRect(0, 0, 2, 256);
  const skyTex = new THREE.CanvasTexture(skyCvs);
  const skyGeo = new THREE.SphereGeometry(200, 16, 16);
  const skyMat = new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide });
  scene.add(new THREE.Mesh(skyGeo, skyMat));
  // Soften fog to match horizon
  scene.fog.color.set(0xf0d5b0);
}

export function buildClouds() {
  const scene = ctx.scene;
  ctx.clouds = [];
  for (let i = 0; i < 10; i++) {
    const g = new THREE.Group();
    const cMat = new THREE.MeshBasicMaterial({ color: 0xfff8f0, transparent: true, opacity: 0.88 });
    const blobCount = 4 + Math.floor(Math.random() * 3);
    for (let j = 0; j < blobCount; j++) {
      const blob = new THREE.Mesh(new THREE.SphereGeometry(5 + Math.random() * 4, 6, 4), cMat);
      blob.position.set(j * 6 - 8, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 4);
      g.add(blob);
    }
    g.position.set((Math.random() - 0.5) * 160, 30 + Math.random() * 15, (Math.random() - 0.5) * 160);
    g._speed = 1.5 + Math.random() * 1.0;
    scene.add(g);
    ctx.clouds.push(g);
  }
}

export function buildLighting() {
  const scene = ctx.scene;

  const hemi = new THREE.HemisphereLight(0xbbddff, 0x998866, 0.6);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfffaee, 1.2);
  sun.position.set(30, 50, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 200;
  sun.shadow.camera.left   = -70; sun.shadow.camera.right  = 70;
  sun.shadow.camera.top    =  70; sun.shadow.camera.bottom = -70;
  scene.add(sun);

  const impactLight = new THREE.PointLight(0xffffff, 0, 20);
  scene.add(impactLight);
  ctx.impactLight = impactLight;

  return { sun };
}
