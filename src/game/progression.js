// src/game/progression.js — XP/levels/relics (relic drop system)
import * as THREE from 'three';
import { ctx } from '../state.js';
import { toonMat, addOutline } from '../chars/builders.js';
import { showToast, updateHUD } from '../ui/hud.js';

export const _relicDrops = [];

export function spawnRelicDrop(name, pos) {
  const scene = ctx.scene;
  const colors = { 'Prayer Beads': 0x9966cc, 'Dragon Pearl': 0x00ff88, 'Saffron Robe': 0xffaa00 };
  const col = colors[name] || 0xffffff;
  const mesh = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.4, 0),
    toonMat(col)
  );
  mesh.position.copy(pos);
  mesh.position.y = 0.5;
  addOutline(mesh);
  scene.add(mesh);
  _relicDrops.push({ name, pos: pos.clone(), mesh, _angle: 0 });
  showToast(`Relic dropped: ${name}!`);
}

export function updateRelicDrops(dt) {
  for (let i = _relicDrops.length - 1; i >= 0; i--) {
    const drop = _relicDrops[i];
    drop._angle += dt;
    drop.mesh.rotation.y = drop._angle;
    drop.mesh.position.y = 0.5 + Math.sin(drop._angle * 2) * 0.15;

    [ctx.gameState.p1, ctx.gameState.p2].forEach(p => {
      if (p.pos.distanceTo(drop.pos) < 1.5) {
        p.equipRelic(drop.name);
        ctx.scene.remove(drop.mesh);
        _relicDrops.splice(i, 1);
      }
    });
  }
}
