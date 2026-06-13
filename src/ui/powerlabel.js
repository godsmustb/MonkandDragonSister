// src/ui/powerlabel.js — XP/Level "power label" Sprite under each player character
// Billboards automatically (THREE.Sprite always faces camera).
// Redraws canvas ONLY when level or xp-bucket changes; updates world position every frame.
import * as THREE from 'three';
import { ctx } from '../state.js';
import { XP_TO_LEVEL } from '../config.js';

// Per-player config: tint color and last-known state for dirty tracking
const _CONFIG = {
  1: { color: '#ffe27a', shadowColor: 'rgba(255,200,0,0.7)' }, // Monk — gold
  2: { color: '#46d6e0', shadowColor: 'rgba(70,214,224,0.7)' }, // Sister — cyan
};

// Sprite size in world units
const SPRITE_SCALE = 1.6;
const SPRITE_Y = 0.22; // just above ground level

// Per-player sprite state
const _state = {
  1: null, // { sprite, texture, canvas, ctx2d, lastLevel, lastXpBucket }
  2: null,
};

/** Build or rebuild the canvas texture for a power label. */
function _drawLabel(state, level, xp, cfg) {
  const cv = state.canvas;
  const c  = state.ctx2d;
  const W  = cv.width;
  const H  = cv.height;
  c.clearRect(0, 0, W, H);

  // Dark pill background
  c.fillStyle = 'rgba(8,6,4,0.72)';
  _roundRect(c, 1, 1, W - 2, H - 2, 6);
  c.fill();

  // Level text
  c.fillStyle = cfg.color;
  c.shadowColor = cfg.shadowColor;
  c.shadowBlur = 6;
  c.font = 'bold 18px Georgia,serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText('Lv ' + level, W / 2, H * 0.38);
  c.shadowBlur = 0;

  // XP progress bar
  const barX = 6, barY = H * 0.64, barW = W - 12, barH = 5;
  // bar bg
  c.fillStyle = 'rgba(0,0,0,0.55)';
  _roundRect(c, barX, barY, barW, barH, 2.5);
  c.fill();
  // bar fill
  const needed  = (XP_TO_LEVEL[Math.min(level + 1, 10)] || 0) - (XP_TO_LEVEL[level] || 0);
  const current = xp - (XP_TO_LEVEL[level] || 0);
  const frac    = needed > 0 ? Math.min(1, Math.max(0, current / needed)) : 1;
  if (frac > 0) {
    c.fillStyle = cfg.color;
    c.globalAlpha = 0.85;
    _roundRect(c, barX, barY, Math.max(4, barW * frac), barH, 2.5);
    c.fill();
    c.globalAlpha = 1;
  }

  state.texture.needsUpdate = true;
}

function _roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.lineTo(x + w - r, y);
  c.arcTo(x + w, y, x + w, y + r, r);
  c.lineTo(x + w, y + h - r);
  c.arcTo(x + w, y + h, x + w - r, y + h, r);
  c.lineTo(x + r, y + h);
  c.arcTo(x, y + h, x, y + h - r, r);
  c.lineTo(x, y + r);
  c.arcTo(x, y, x + r, y, r);
  c.closePath();
}

/** Create a sprite for the given player (1 or 2). */
function _createSprite(pid) {
  const cfg = _CONFIG[pid];
  const cv  = document.createElement('canvas');
  cv.width  = 96;
  cv.height = 32;
  const ctx2d = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(SPRITE_SCALE, SPRITE_SCALE / 3, 1);
  sprite.renderOrder = 999; // draw on top of ground art

  const state = { sprite, texture: tex, canvas: cv, ctx2d, lastLevel: -1, lastXpBucket: -1 };
  _state[pid] = state;

  ctx.scene.add(sprite);
  return state;
}

/** Called once per frame from main.js updateGame(). */
export function updatePowerLabels(players) {
  if (!players) return;
  players.forEach(player => {
    if (!player) return;
    const pid = player.id;
    if (!_CONFIG[pid]) return;

    // In 1P mode, hide the inactive partner's label
    if (player.inactive) {
      if (_state[pid] && _state[pid].sprite) {
        _state[pid].sprite.visible = false;
      }
      return;
    }

    let state = _state[pid];
    if (!state) state = _createSprite(pid);

    state.sprite.visible = true;

    // Position: follow character, slightly above ground
    const cm = player.currentMesh ? player.currentMesh() : null;
    const worldPos = cm ? cm.position : player.pos;
    state.sprite.position.set(worldPos.x, SPRITE_Y, worldPos.z);

    // Dirty check — only redraw when level or xp-bucket (1% steps) changes
    const xpBucket = Math.floor(
      ((player.xp - (XP_TO_LEVEL[player.level] || 0)) /
       Math.max(1, (XP_TO_LEVEL[Math.min(player.level + 1, 10)] || 1) - (XP_TO_LEVEL[player.level] || 0))) * 100
    );
    if (player.level !== state.lastLevel || xpBucket !== state.lastXpBucket) {
      state.lastLevel    = player.level;
      state.lastXpBucket = xpBucket;
      _drawLabel(state, player.level, player.xp, _CONFIG[pid]);
    }
  });
}

/** Hide and remove sprites (called on game restart / cleanup). */
export function cleanupPowerLabels() {
  [1, 2].forEach(pid => {
    if (_state[pid] && _state[pid].sprite) {
      ctx.scene.remove(_state[pid].sprite);
      if (_state[pid].texture) _state[pid].texture.dispose();
      if (_state[pid].sprite.material) _state[pid].sprite.material.dispose();
    }
    _state[pid] = null;
  });
}
