// src/ui/touch.js — On-screen touch controls for mobile
// Only activates when touch is detected; desktop gets no DOM/listeners.
import { ctx } from '../state.js';
import { initAudioOnGesture } from '../audio/audio.js';
import { togglePause } from './menu.js';

// ── Touch detection ────────────────────────────────────────────────────────
export const IS_TOUCH = (
  ('ontouchstart' in window) ||
  navigator.maxTouchPoints > 0 ||
  matchMedia('(pointer:coarse)').matches
);

// ── Module state ───────────────────────────────────────────────────────────
let _dispatchPlayerAction = null;  // injected from main.js
let _overlayEl = null;
let _audioInited = false;

// Joystick state per player slot (p1, p2)
const _joy = {
  p1: { touchId: null, baseX: 0, baseY: 0, active: false },
  p2: { touchId: null, baseX: 0, baseY: 0, active: false },
};

// Track action-button touch IDs to support multi-touch
// Map<touchId, { who, action, keyCode }>
const _btnTouches = new Map();

const DEADZONE = 12; // px
const JOY_RADIUS = 52; // px — normalisation radius

// ── Inject the dispatch function (called from main.js after it's defined) ──
export function setDispatchPlayerAction(fn) {
  _dispatchPlayerAction = fn;
}

// ── Public: show/hide overlay based on game state ─────────────────────────
export function updateTouchOverlay() {
  if (!_overlayEl) return;
  const state = ctx.gameState && ctx.gameState.state;
  const paused = ctx.gameState && ctx.gameState._paused;
  const live = state && /^WAVE/.test(state) && !paused;
  _overlayEl.style.display = live ? 'block' : 'none';
}

// ── Init ───────────────────────────────────────────────────────────────────
export function initTouchControls(dispatchFn) {
  if (!IS_TOUCH) return; // desktop: do nothing
  _dispatchPlayerAction = dispatchFn;

  _buildOverlay();

  // First touch anywhere → init audio (iOS requirement)
  document.addEventListener('touchstart', _firstTouchAudio, { passive: true, once: true });
}

function _firstTouchAudio() {
  if (_audioInited) return;
  _audioInited = true;
  try { initAudioOnGesture(); } catch (_) {}
}

// ── Build the DOM overlay ──────────────────────────────────────────────────
function _buildOverlay() {
  _overlayEl = document.createElement('div');
  _overlayEl.id = 'touch-overlay';
  _overlayEl.style.cssText = `
    position:fixed;top:0;left:0;width:100%;height:100%;
    pointer-events:none;
    z-index:500;
    display:none;
  `;
  document.body.appendChild(_overlayEl);

  const mode = ctx.mode || '2p';

  if (mode === '1p') {
    // Single control set across the bottom for the active hero
    const who = ctx.soloChar === 'sister' ? 'p2' : 'p1';
    _buildJoystick(who, 'left');
    _buildActionButtons(who, 'right');
  } else {
    // 2P: P1 on left half, P2 on right half
    _buildJoystick('p1', 'left-half');
    _buildActionButtons('p1', 'right-half-left');
    _buildJoystick('p2', 'right-half');
    _buildActionButtons('p2', 'far-right');
  }

  // Pause button (top-right corner)
  _buildPauseButton();
}

// ── Joystick ───────────────────────────────────────────────────────────────
function _buildJoystick(who, position) {
  const container = document.createElement('div');
  container.id = `joy-${who}`;

  let leftCss, bottomCss, widthCss;
  if (position === 'left') {
    leftCss = '16px'; bottomCss = '120px'; widthCss = 'auto';
  } else if (position === 'right-half') {
    leftCss = '50%'; bottomCss = '120px'; widthCss = 'auto';
  } else {
    leftCss = '16px'; bottomCss = '120px'; widthCss = 'auto';
  }

  container.style.cssText = `
    position:fixed;
    left:${leftCss};
    bottom:${bottomCss};
    width:100px;height:100px;
    pointer-events:auto;
    touch-action:none;
  `;

  // Base ring
  const base = document.createElement('div');
  base.style.cssText = `
    position:absolute;
    width:100px;height:100px;
    border-radius:50%;
    border:2px solid rgba(255,255,255,0.25);
    background:rgba(0,0,0,0.28);
  `;

  // Thumb
  const thumb = document.createElement('div');
  thumb.id = `joy-thumb-${who}`;
  thumb.style.cssText = `
    position:absolute;
    width:44px;height:44px;
    border-radius:50%;
    background:rgba(255,255,255,0.5);
    border:2px solid rgba(255,255,255,0.8);
    top:28px;left:28px;
    transition:none;
    pointer-events:none;
  `;

  container.appendChild(base);
  container.appendChild(thumb);
  _overlayEl.appendChild(container);

  // Store refs
  _joy[who].el = container;
  _joy[who].thumb = thumb;
  _joy[who].who = who;

  // Touch events on the container
  container.addEventListener('touchstart', (e) => {
    e.preventDefault();
    _firstTouchAudio();
    for (const t of e.changedTouches) {
      if (_joy[who].touchId !== null) continue; // already tracking
      _joy[who].touchId = t.identifier;
      _joy[who].active = true;
      const rect = container.getBoundingClientRect();
      _joy[who].baseX = rect.left + 50;
      _joy[who].baseY = rect.top + 50;
      _updateJoystick(who, t.clientX, t.clientY);
    }
  }, { passive: false });

  container.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier !== _joy[who].touchId) continue;
      _updateJoystick(who, t.clientX, t.clientY);
    }
  }, { passive: false });

  const _endJoy = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier !== _joy[who].touchId) continue;
      _joy[who].touchId = null;
      _joy[who].active = false;
      _clearMovement(who);
      // Reset thumb
      const thumb = document.getElementById(`joy-thumb-${who}`);
      if (thumb) { thumb.style.top = '28px'; thumb.style.left = '28px'; }
    }
  };
  container.addEventListener('touchend', _endJoy, { passive: false });
  container.addEventListener('touchcancel', _endJoy, { passive: false });
}

function _updateJoystick(who, cx, cy) {
  const j = _joy[who];
  const dx = cx - j.baseX;
  const dy = cy - j.baseY;
  const dist = Math.sqrt(dx*dx + dy*dy);

  // Move thumb (clamped to radius)
  const clampDist = Math.min(dist, JOY_RADIUS);
  const angle = Math.atan2(dy, dx);
  const tx = 28 + clampDist * Math.cos(angle);
  const ty = 28 + clampDist * Math.sin(angle);
  const thumb = document.getElementById(`joy-thumb-${who}`);
  if (thumb) { thumb.style.left = tx + 'px'; thumb.style.top = ty + 'px'; }

  // Map to directional keys if past deadzone
  const bindings = ctx.bindings;
  const keys = ctx.keys;
  if (!bindings || !keys) return;

  const pBindings = bindings[who];
  if (!pBindings) return;

  const upKey    = pBindings.up    && pBindings.up[0];
  const downKey  = pBindings.down  && pBindings.down[0];
  const leftKey  = pBindings.left  && pBindings.left[0];
  const rightKey = pBindings.right && pBindings.right[0];

  if (dist < DEADZONE) {
    // In deadzone — release all
    if (upKey)    keys[upKey]    = false;
    if (downKey)  keys[downKey]  = false;
    if (leftKey)  keys[leftKey]  = false;
    if (rightKey) keys[rightKey] = false;
    return;
  }

  // Normalised vector
  const nx = dx / dist;
  const ny = dy / dist;

  // Use 45° quadrants (both axes can be active for diagonal)
  if (upKey)    keys[upKey]    = ny < -0.38;
  if (downKey)  keys[downKey]  = ny > 0.38;
  if (leftKey)  keys[leftKey]  = nx < -0.38;
  if (rightKey) keys[rightKey] = nx > 0.38;
}

function _clearMovement(who) {
  const bindings = ctx.bindings;
  const keys = ctx.keys;
  if (!bindings || !keys) return;
  const pBindings = bindings[who];
  if (!pBindings) return;
  ['up','down','left','right'].forEach(dir => {
    const key = pBindings[dir] && pBindings[dir][0];
    if (key) keys[key] = false;
  });
}

// ── Action buttons ─────────────────────────────────────────────────────────
function _buildActionButtons(who, position) {
  const isMonk = (who === 'p1'); // P1 = monk, P2 = sister; also 1P solo
  // In 1P mode determine by soloChar
  const charIsMonk = (ctx.mode === '1p')
    ? (ctx.soloChar === 'monk')
    : (who === 'p1');

  const cluster = document.createElement('div');
  cluster.id = `btn-cluster-${who}`;

  let rightCss = '16px';
  let bottomCss = '16px';
  if (position === 'right-half-left') {
    // P1 buttons in left half: near left-center bottom
    rightCss = 'auto'; // use left instead
    // place on the right side of the left half
  }

  // Position the cluster
  let posStyle;
  if (position === 'left') {
    posStyle = 'right:16px;bottom:16px;left:auto;';
  } else if (position === 'right') {
    posStyle = 'right:16px;bottom:16px;left:auto;';
  } else if (position === 'right-half-left') {
    // P1 action buttons: right side of the left half
    posStyle = 'left:calc(50% - 176px);bottom:16px;';
  } else if (position === 'far-right') {
    // P2 action buttons: right side of the right half
    posStyle = 'right:16px;bottom:16px;';
  } else if (position === 'right-half') {
    posStyle = 'right:16px;bottom:16px;';
  } else {
    posStyle = 'right:16px;bottom:16px;';
  }

  cluster.style.cssText = `
    position:fixed;
    ${posStyle}
    pointer-events:none;
    display:flex;flex-direction:column;align-items:flex-end;gap:6px;
  `;

  // Row 1: special/utility buttons (lock-on, ultimate)
  const row1 = document.createElement('div');
  row1.style.cssText = 'display:flex;gap:6px;pointer-events:auto;';

  const btnLockOn = _makeBtn('🎯', 'lockon', who, false);
  const btnUltimate = _makeBtn('✦', 'ultimate', who, false);
  row1.appendChild(btnLockOn);
  row1.appendChild(btnUltimate);

  // Row 2: character-specific + jump
  const row2 = document.createElement('div');
  row2.style.cssText = 'display:flex;gap:6px;pointer-events:auto;';

  if (charIsMonk) {
    // Monk: Chi Shield, Heal, Jump
    const btnShield = _makeBtn('🛡', 'shield', who, false);
    const btnHeal = _makeBtn('💚', 'heal', who, false);
    const btnJump = _makeBtn('↑', 'jump', who, false);
    row2.appendChild(btnShield);
    row2.appendChild(btnHeal);
    row2.appendChild(btnJump);
  } else {
    // Sister: Transform, Special, Jump
    const btnTransform = _makeBtn('🐉', 'transform', who, false);
    const btnSpecial = _makeBtn('★', 'special', who, false);
    const btnJump = _makeBtn('↑', 'jump', who, false);
    row2.appendChild(btnTransform);
    row2.appendChild(btnSpecial);
    row2.appendChild(btnJump);
  }

  // Row 3: main combat — Block (held), Dodge, Attack
  const row3 = document.createElement('div');
  row3.style.cssText = 'display:flex;gap:6px;pointer-events:auto;';

  const btnBlock = _makeBtn('🛡B', 'block', who, true); // held action
  const btnDodge = _makeBtn('↩', 'dodge', who, false);
  const btnHeavy = _makeBtn('⚡', 'heavy', who, false);
  const btnAttack = _makeBtn('⚔', 'attack', who, false);

  row3.appendChild(btnBlock);
  row3.appendChild(btnDodge);
  row3.appendChild(btnHeavy);
  row3.appendChild(btnAttack);

  cluster.appendChild(row1);
  cluster.appendChild(row2);
  cluster.appendChild(row3);
  _overlayEl.appendChild(cluster);
}

function _makeBtn(label, action, who, isHeld) {
  const btn = document.createElement('div');
  btn.dataset.action = action;
  btn.dataset.who = who;
  btn.textContent = label;
  btn.style.cssText = `
    width:52px;height:52px;
    border-radius:${isHeld ? '8px' : '50%'};
    background:rgba(0,0,0,0.45);
    border:2px solid rgba(255,255,255,0.30);
    color:rgba(255,255,255,0.9);
    font-size:18px;
    display:flex;align-items:center;justify-content:center;
    user-select:none;
    -webkit-user-select:none;
    touch-action:none;
    cursor:pointer;
    transition:background 0.08s,border-color 0.08s;
  `;

  if (isHeld) {
    // Block: touchstart sets key, touchend clears key
    btn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      _firstTouchAudio();
      for (const t of e.changedTouches) {
        const blockKey = _getFirstKey(who, action);
        if (blockKey && ctx.keys) ctx.keys[blockKey] = true;
        btn.style.background = 'rgba(100,180,255,0.45)';
        btn.style.borderColor = 'rgba(140,200,255,0.9)';
        _btnTouches.set(t.identifier, { who, action, isHeld: true, keyCode: blockKey, el: btn });
      }
    }, { passive: false });

    const _endBlock = (e) => {
      for (const t of e.changedTouches) {
        const info = _btnTouches.get(t.identifier);
        if (!info) continue;
        if (info.keyCode && ctx.keys) ctx.keys[info.keyCode] = false;
        _btnTouches.delete(t.identifier);
        btn.style.background = 'rgba(0,0,0,0.45)';
        btn.style.borderColor = 'rgba(255,255,255,0.30)';
      }
    };
    btn.addEventListener('touchend', _endBlock, { passive: false });
    btn.addEventListener('touchcancel', _endBlock, { passive: false });
  } else {
    // One-shot action on touchstart
    btn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      _firstTouchAudio();
      for (const t of e.changedTouches) {
        if (_dispatchPlayerAction) {
          const playerId = (who === 'p1') ? 1 : 2;
          _dispatchPlayerAction(playerId, action);
        }
        btn.style.background = 'rgba(200,160,0,0.45)';
        btn.style.borderColor = 'rgba(255,220,50,0.9)';
        _btnTouches.set(t.identifier, { who, action, el: btn });
      }
    }, { passive: false });

    const _endBtn = (e) => {
      for (const t of e.changedTouches) {
        const info = _btnTouches.get(t.identifier);
        if (!info || info.el !== btn) continue;
        _btnTouches.delete(t.identifier);
        btn.style.background = 'rgba(0,0,0,0.45)';
        btn.style.borderColor = 'rgba(255,255,255,0.30)';
      }
    };
    btn.addEventListener('touchend', _endBtn, { passive: false });
    btn.addEventListener('touchcancel', _endBtn, { passive: false });
  }

  return btn;
}

function _getFirstKey(who, action) {
  const bindings = ctx.bindings;
  if (!bindings) return null;
  const pBindings = bindings[who];
  if (!pBindings) return null;
  const codes = pBindings[action];
  return (codes && codes.length > 0) ? codes[0] : null;
}

// ── Pause button ───────────────────────────────────────────────────────────
function _buildPauseButton() {
  const btn = document.createElement('div');
  btn.id = 'touch-pause-btn';
  btn.textContent = '⏸';
  btn.style.cssText = `
    position:fixed;
    top:12px;right:12px;
    width:44px;height:44px;
    border-radius:50%;
    background:rgba(0,0,0,0.45);
    border:2px solid rgba(255,255,255,0.30);
    color:rgba(255,255,255,0.85);
    font-size:18px;
    display:flex;align-items:center;justify-content:center;
    pointer-events:auto;
    touch-action:none;
    z-index:501;
    user-select:none;
    -webkit-user-select:none;
  `;
  btn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    _firstTouchAudio();
    try { togglePause(); } catch (_) {}
  }, { passive: false });
  _overlayEl.appendChild(btn);
}

// ── Debug helpers (called from debug.js) ──────────────────────────────────
/** Simulate touch movement: dx,dz in [-1,1] range; 0,0 = release */
export function touchMove(who, dx, dz) {
  const bindings = ctx.bindings;
  const keys = ctx.keys;
  if (!bindings || !keys) return;
  const pBindings = bindings[who];
  if (!pBindings) return;

  const upKey    = pBindings.up    && pBindings.up[0];
  const downKey  = pBindings.down  && pBindings.down[0];
  const leftKey  = pBindings.left  && pBindings.left[0];
  const rightKey = pBindings.right && pBindings.right[0];

  if (dx === 0 && dz === 0) {
    if (upKey)    keys[upKey]    = false;
    if (downKey)  keys[downKey]  = false;
    if (leftKey)  keys[leftKey]  = false;
    if (rightKey) keys[rightKey] = false;
    return;
  }
  if (upKey)    keys[upKey]    = dz < -0.38;
  if (downKey)  keys[downKey]  = dz > 0.38;
  if (leftKey)  keys[leftKey]  = dx < -0.38;
  if (rightKey) keys[rightKey] = dx > 0.38;
}
