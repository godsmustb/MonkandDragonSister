// src/ui/touch.js — On-screen touch controls for mobile
// Only activates when touch is detected; desktop gets no DOM/listeners.
import { ctx } from '../state.js';
import { initAudioOnGesture } from '../audio/audio.js';
import { togglePause, pauseGame, resumeGame } from './menu.js';
import { IS_TOUCH } from '../config.js';

// ── Touch detection (single source of truth in config.js) ───────────────────
export { IS_TOUCH };

// ── Module state ───────────────────────────────────────────────────────────
let _dispatchPlayerAction = null;  // injected from main.js
let _overlayEl = null;
let _audioInited = false;
let _builtSig = null; // mode:soloChar the overlay was last built for

// ── Touch layout persistence ───────────────────────────────────────────────
// Each control group has an id; users can override {x, y, scale}.
// x/y are viewport-relative percentages [0..100] (left/top).
// scale is a multiplier [0.7..1.6] applied via CSS transform: scale().
// Saved to localStorage as JSON: { [controlId]: {x, y, scale} }.
const LS_KEY = 'mds_touch_layout';

// Default positions for each control id (as % of viewport, left/top origin).
// These mirror the hardcoded CSS in _buildJoystick/_buildActionButtons/_buildPauseButton.
// We compute defaults lazily in the editor so we have accurate viewport dims.
const _DEFAULTS = {
  'joy-p1':          { xPct: 2,   yPct: null, xFromRight: false, yFromBottom: true,  wPx: 100, hPx: 100, bottomPx: 120, leftPx: 16 },
  'joy-p2':          { xPct: 50,  yPct: null, xFromRight: false, yFromBottom: true,  wPx: 100, hPx: 100, bottomPx: 120, leftPx: null },
  'btn-cluster-p1':  { xPct: null, yPct: null, xFromRight: false, yFromBottom: true, wPx: 176, hPx: 120, bottomPx: 16,  leftPx: null },
  'btn-cluster-p2':  { xPct: null, yPct: null, xFromRight: true,  yFromBottom: true, wPx: 176, hPx: 120, bottomPx: 16,  rightPx: 16 },
  'touch-pause-btn': { xPct: null, yPct: null, xFromRight: true,  yFromBottom: false, wPx: 44, hPx: 44, topPx: 12, rightPx: 12 },
};

let _layoutOverrides = {};   // controlId → { x, y, scale }  (x/y in px, left/top)
let _editorEl = null;        // the live editor overlay element

function _loadLayout() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) _layoutOverrides = JSON.parse(raw);
  } catch (_) { _layoutOverrides = {}; }
}

function _saveLayout() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(_layoutOverrides)); } catch (_) {}
}

export function resetTouchLayout() {
  _layoutOverrides = {};
  try { localStorage.removeItem(LS_KEY); } catch (_) {}
  if (IS_TOUCH) _rebuildOverlay();
}

export function getTouchLayout() {
  return JSON.parse(JSON.stringify(_layoutOverrides));
}

// Apply any saved layout override to a control element.
// Clears default positioning (left/right/bottom/top) and uses explicit left/top + scale.
function _applyLayoutOverride(el, id) {
  const ov = _layoutOverrides[id];
  if (!ov) return;
  el.style.left   = ov.x + 'px';
  el.style.top    = ov.y + 'px';
  el.style.right  = 'auto';
  el.style.bottom = 'auto';
  el.style.transformOrigin = 'top left';
  el.style.transform = 'scale(' + ov.scale + ')';
}

// Compute the default top-left pixel position of a control (for editor drag baseline).
function _defaultPx(id) {
  const d = _DEFAULTS[id];
  if (!d) return { x: 16, y: 16, scale: 1 };
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let x, y;
  if (id === 'joy-p1')         { x = 16; y = vh - 120 - 100; }
  else if (id === 'joy-p2')    { x = vw * 0.5; y = vh - 120 - 100; }
  else if (id === 'btn-cluster-p1') {
    // left:calc(50% - 176px); bottom:16px  → approx
    x = vw * 0.5 - 176; y = vh - 16 - 120;
  } else if (id === 'btn-cluster-p2') {
    // right:16px; bottom:16px → left = vw-16-176
    x = vw - 16 - 176; y = vh - 16 - 120;
  } else if (id === 'touch-pause-btn') {
    // right:12px; top:12px → left = vw-12-44
    x = vw - 12 - 44; y = 12;
  } else { x = 16; y = 16; }
  return { x, y, scale: 1 };
}

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
  if (!IS_TOUCH) return;
  // The layout is chosen at build time from ctx.mode/soloChar. If the mode changed
  // since it was built (boot default 2P → a 1P game), rebuild so 1P shows ONE
  // control set and 2P shows two — not the wrong default layout.
  const sig = (ctx.mode || '2p') + ':' + (ctx.soloChar || '');
  if (!_overlayEl || sig !== _builtSig) _rebuildOverlay();
  if (!_overlayEl) return;
  const state = ctx.gameState && ctx.gameState.state;
  const paused = ctx.gameState && ctx.gameState._paused;
  const live = state && /^WAVE/.test(state) && !paused;
  _overlayEl.style.display = live ? 'block' : 'none';
}

function _rebuildOverlay() {
  if (_overlayEl) { _overlayEl.remove(); _overlayEl = null; }
  _joy.p1.touchId = null; _joy.p1.active = false;
  _joy.p2.touchId = null; _joy.p2.active = false;
  _btnTouches.clear();
  _buildOverlay();
}

// ── Init ───────────────────────────────────────────────────────────────────
export function initTouchControls(dispatchFn) {
  if (!IS_TOUCH) return; // desktop: do nothing
  _dispatchPlayerAction = dispatchFn;

  _loadLayout();
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

  _builtSig = (ctx.mode || '2p') + ':' + (ctx.soloChar || '');
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

  // Apply any saved layout override (position + scale)
  _applyLayoutOverride(container, `joy-${who}`);

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

  // Apply any saved layout override (position + scale)
  _applyLayoutOverride(cluster, `btn-cluster-${who}`);
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

  // Apply any saved layout override (position + scale)
  _applyLayoutOverride(btn, 'touch-pause-btn');
}

// ── Touch Layout Editor ────────────────────────────────────────────────────
// Opens a full-screen editor overlay. Each control group becomes draggable.
// Tap to select → resize toolbar appears. SAVE/RESET/DONE in a fixed toolbar.

export function enterTouchLayoutEditor() {
  if (!IS_TOUCH) return;
  if (_editorEl) return; // already open

  // Pause the game while editing (if in-play)
  let _wasPlaying = false;
  const gs = ctx.gameState;
  if (gs && /^WAVE/.test(gs.state) && !gs._paused) {
    _wasPlaying = true;
    try { pauseGame(); } catch (_) {}
  }

  // ── Ensure layout is loaded ──
  if (Object.keys(_layoutOverrides).length === 0) _loadLayout();

  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // ── Working copy we edit live; only commit on SAVE ──
  const _working = {};
  function _wGet(id) {
    if (_working[id]) return _working[id];
    if (_layoutOverrides[id]) {
      _working[id] = { ..._layoutOverrides[id] };
    } else {
      _working[id] = { ..._defaultPx(id) };
    }
    return _working[id];
  }

  // ── Determine which control IDs are present for the current mode ──
  const mode = ctx.mode || '2p';
  let _controlIds;
  if (mode === '1p') {
    const who = ctx.soloChar === 'sister' ? 'p2' : 'p1';
    _controlIds = [`joy-${who}`, `btn-cluster-${who}`, 'touch-pause-btn'];
  } else {
    _controlIds = ['joy-p1', 'joy-p2', 'btn-cluster-p1', 'btn-cluster-p2', 'touch-pause-btn'];
  }

  const _LABELS = {
    'joy-p1': 'P1 Joystick',
    'joy-p2': 'P2 Joystick',
    'btn-cluster-p1': 'P1 Buttons',
    'btn-cluster-p2': 'P2 Buttons',
    'touch-pause-btn': 'Pause Button',
  };

  // Control element sizes (approx bounding box for drag + display)
  const _SIZES = {
    'joy-p1': { w: 100, h: 100 },
    'joy-p2': { w: 100, h: 100 },
    'btn-cluster-p1': { w: 176, h: 120 },
    'btn-cluster-p2': { w: 176, h: 120 },
    'touch-pause-btn': { w: 44, h: 44 },
  };

  // ── Build editor overlay ──
  _editorEl = document.createElement('div');
  _editorEl.id = 'touch-layout-editor';
  _editorEl.style.cssText = `
    position:fixed;top:0;left:0;width:100%;height:100%;
    z-index:900;
    font-family:Georgia,serif;
    touch-action:none;
    overflow:hidden;
  `;

  // Dimmed backdrop
  const _backdrop = document.createElement('div');
  _backdrop.style.cssText = `
    position:absolute;top:0;left:0;width:100%;height:100%;
    background:rgba(0,0,0,0.72);
  `;
  _editorEl.appendChild(_backdrop);

  // ── Selected control state ──
  let _selectedId = null;
  const _ctrlEls = {};    // id → DOM element
  const _labelEls = {};   // id → label DOM element

  // ── Build one draggable proxy for each control ──
  function _buildProxy(id) {
    const st = _wGet(id);
    const sz = _SIZES[id] || { w: 100, h: 60 };
    const proxy = document.createElement('div');
    proxy.dataset.ctrlId = id;
    proxy.style.cssText = `
      position:fixed;
      left:${st.x}px;
      top:${st.y}px;
      width:${sz.w}px;
      height:${sz.h}px;
      transform:scale(${st.scale});
      transform-origin:top left;
      box-sizing:border-box;
      border:2px dashed rgba(200,160,0,0.6);
      border-radius:10px;
      background:rgba(0,0,0,0.35);
      display:flex;align-items:center;justify-content:center;
      touch-action:none;
      user-select:none;
      -webkit-user-select:none;
      cursor:grab;
    `;

    const labelEl = document.createElement('div');
    labelEl.textContent = _LABELS[id] || id;
    labelEl.style.cssText = `
      color:rgba(200,160,0,0.9);
      font-size:11px;
      letter-spacing:2px;
      text-align:center;
      pointer-events:none;
      padding:4px;
    `;
    proxy.appendChild(labelEl);
    _ctrlEls[id] = proxy;
    _labelEls[id] = labelEl;

    // ── Drag logic ──
    let _dragActive = false;
    let _dragTouchId = null;
    let _dragStartX = 0;
    let _dragStartY = 0;
    let _dragOrigX = 0;
    let _dragOrigY = 0;
    let _hasMoved = false;

    proxy.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      for (const t of e.changedTouches) {
        if (_dragActive) break; // only track one finger per proxy
        _dragActive = true;
        _dragTouchId = t.identifier;
        _dragStartX = t.clientX;
        _dragStartY = t.clientY;
        const cur = _wGet(id);
        _dragOrigX = cur.x;
        _dragOrigY = cur.y;
        _hasMoved = false;
        break;
      }
    }, { passive: false });

    proxy.addEventListener('touchmove', (e) => {
      e.preventDefault();
      e.stopPropagation();
      for (const t of e.changedTouches) {
        if (t.identifier !== _dragTouchId) continue;
        const dx = t.clientX - _dragStartX;
        const dy = t.clientY - _dragStartY;
        if (Math.abs(dx) > 4 || Math.abs(dy) > 4) _hasMoved = true;
        const cur = _wGet(id);
        const sz2 = _SIZES[id] || { w: 100, h: 60 };
        const newX = Math.max(0, Math.min(vw - sz2.w, _dragOrigX + dx));
        const newY = Math.max(0, Math.min(vh - sz2.h, _dragOrigY + dy));
        cur.x = newX;
        cur.y = newY;
        proxy.style.left = newX + 'px';
        proxy.style.top  = newY + 'px';
        break;
      }
    }, { passive: false });

    const _endDrag = (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier !== _dragTouchId) continue;
        _dragActive = false;
        _dragTouchId = null;
        // If finger didn't move much, treat as a tap → select
        if (!_hasMoved) {
          _selectControl(id);
        }
        break;
      }
    };
    proxy.addEventListener('touchend', _endDrag, { passive: false });
    proxy.addEventListener('touchcancel', _endDrag, { passive: false });

    _editorEl.appendChild(proxy);
  }

  _controlIds.forEach(_buildProxy);

  // ── Select / deselect ──
  function _selectControl(id) {
    // Deselect previous
    if (_selectedId && _ctrlEls[_selectedId]) {
      _ctrlEls[_selectedId].style.borderColor = 'rgba(200,160,0,0.6)';
      _ctrlEls[_selectedId].style.background  = 'rgba(0,0,0,0.35)';
    }
    _selectedId = id;
    if (_ctrlEls[id]) {
      _ctrlEls[id].style.borderColor = 'rgba(255,220,50,1)';
      _ctrlEls[id].style.background  = 'rgba(200,160,0,0.18)';
    }
    _refreshToolbar();
  }

  // ── Top toolbar ──
  const _topBar = document.createElement('div');
  _topBar.style.cssText = `
    position:fixed;top:0;left:0;width:100%;
    display:flex;align-items:center;justify-content:space-between;
    padding:10px 14px;
    background:rgba(0,0,0,0.85);
    border-bottom:1px solid rgba(200,160,0,0.4);
    box-sizing:border-box;z-index:1;
    gap:10px;
  `;

  const _titleEl = document.createElement('span');
  _titleEl.textContent = 'EDIT TOUCH LAYOUT';
  _titleEl.style.cssText = 'color:#c8a000;font-size:12px;letter-spacing:3px;flex-shrink:0;';

  const _saveBtn  = _makeEditorBtn('SAVE');
  const _resetBtn = _makeEditorBtn('RESET');
  const _doneBtn  = _makeEditorBtn('DONE');

  _saveBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    // Commit working copy → persisted overrides
    Object.keys(_working).forEach(id => { _layoutOverrides[id] = { ..._working[id] }; });
    _saveLayout();
    _rebuildOverlay(); // apply to live game overlay
    _flashBtn(_saveBtn, 'SAVED!');
  }, { passive: false });

  _resetBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    // Clear everything and rebuild proxies with defaults
    _layoutOverrides = {};
    try { localStorage.removeItem(LS_KEY); } catch (_) {}
    // Reset working copy + proxy positions
    _controlIds.forEach(id => {
      const def = _defaultPx(id);
      _working[id] = { ...def };
      const el = _ctrlEls[id];
      if (el) {
        el.style.left = def.x + 'px';
        el.style.top  = def.y + 'px';
        el.style.transform = 'scale(1)';
      }
    });
    _selectedId = null;
    _refreshToolbar();
    if (_IS_TOUCH_ref) _rebuildOverlay();
  }, { passive: false });

  _doneBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    _closeEditor();
  }, { passive: false });

  _topBar.appendChild(_titleEl);
  _topBar.appendChild(_saveBtn);
  _topBar.appendChild(_resetBtn);
  _topBar.appendChild(_doneBtn);
  _editorEl.appendChild(_topBar);

  // ── Bottom resize toolbar (shown when a control is selected) ──
  const _bottomBar = document.createElement('div');
  _bottomBar.style.cssText = `
    position:fixed;bottom:0;left:0;width:100%;
    display:flex;align-items:center;justify-content:center;
    padding:10px 14px;
    background:rgba(0,0,0,0.85);
    border-top:1px solid rgba(200,160,0,0.4);
    box-sizing:border-box;z-index:1;
    gap:16px;
    display:none;
  `;

  const _selLabel = document.createElement('span');
  _selLabel.style.cssText = 'color:#c8a000;font-size:11px;letter-spacing:2px;min-width:80px;text-align:center;';

  const _scaleLabel = document.createElement('span');
  _scaleLabel.style.cssText = 'color:#ffdd55;font-size:13px;min-width:42px;text-align:center;';

  const _minusBtn = _makeEditorBtn('A−');
  const _plusBtn  = _makeEditorBtn('A+');

  _minusBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (!_selectedId) return;
    const st = _wGet(_selectedId);
    st.scale = Math.max(0.7, Math.round((st.scale - 0.1) * 10) / 10);
    _applyProxyScale(_selectedId, st.scale);
    _scaleLabel.textContent = st.scale.toFixed(1) + '×';
  }, { passive: false });

  _plusBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (!_selectedId) return;
    const st = _wGet(_selectedId);
    st.scale = Math.min(1.6, Math.round((st.scale + 0.1) * 10) / 10);
    _applyProxyScale(_selectedId, st.scale);
    _scaleLabel.textContent = st.scale.toFixed(1) + '×';
  }, { passive: false });

  _bottomBar.appendChild(_selLabel);
  _bottomBar.appendChild(_minusBtn);
  _bottomBar.appendChild(_scaleLabel);
  _bottomBar.appendChild(_plusBtn);
  _editorEl.appendChild(_bottomBar);

  function _refreshToolbar() {
    if (_selectedId) {
      _bottomBar.style.display = 'flex';
      _selLabel.textContent = _LABELS[_selectedId] || _selectedId;
      const st = _wGet(_selectedId);
      _scaleLabel.textContent = st.scale.toFixed(1) + '×';
    } else {
      _bottomBar.style.display = 'none';
    }
  }

  function _applyProxyScale(id, scale) {
    const el = _ctrlEls[id];
    if (!el) return;
    el.style.transform = 'scale(' + scale + ')';
  }

  function _flashBtn(btn, msg) {
    const orig = btn.textContent;
    btn.textContent = msg;
    btn.style.color = '#66ff88';
    // Use requestAnimationFrame-based delay to avoid setTimeout for UI (allowed for UI only)
    // The constraint is no setTimeout for game/FX; UI feedback is fine
    let t = Date.now();
    function _check() {
      if (Date.now() - t >= 800) {
        btn.textContent = orig;
        btn.style.color = '';
      } else {
        requestAnimationFrame(_check);
      }
    }
    requestAnimationFrame(_check);
  }

  function _closeEditor() {
    if (_editorEl) {
      _editorEl.remove();
      _editorEl = null;
    }
    // Resume game if we paused it
    if (_wasPlaying) {
      try { resumeGame(); } catch (_) {}
    }
  }

  document.body.appendChild(_editorEl);
}

// Keep a local ref to IS_TOUCH for the reset handler inside the closure
const _IS_TOUCH_ref = IS_TOUCH;

function _makeEditorBtn(label) {
  const btn = document.createElement('div');
  btn.textContent = label;
  btn.style.cssText = `
    font-size:12px;letter-spacing:3px;color:#c8a000;
    padding:7px 14px;
    border:1px solid rgba(200,160,0,0.5);
    border-radius:4px;
    background:rgba(0,0,0,0.5);
    touch-action:none;
    user-select:none;
    -webkit-user-select:none;
    cursor:pointer;
    flex-shrink:0;
  `;
  return btn;
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
