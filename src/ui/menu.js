// src/ui/menu.js — Main menu + Controls overlay + Pause overlay
// Boot state: 'MENU'. startGame() → 'INTRO'. Esc during play → 'PAUSED'.
import { ctx } from '../state.js';
import { startIntro } from '../game/quest.js';
import { initAudioOnGesture, toggleMute, audioLabel, sfx } from '../audio/audio.js';

// ── State ─────────────────────────────────────────────────────────────────
let _menuEl   = null;
let _pauseEl  = null;
let _ctrlEl   = null;
let _modeEl   = null;     // Pass 12: mode-select sub-screen
let _charEl   = null;     // Pass 12: character-select sub-screen
let _selectedIndex = 0;
let _menuVisible   = false;
let _pauseVisible  = false;

const MENU_ITEMS = ['START GAME', 'CONTROLS', 'QUALITY', 'AUDIO'];

// Quality label reflects ctx.quality ('high' = bloom+ACES composer, 'low' = direct).
function _qualityLabel() {
  return 'QUALITY: ' + ((ctx.quality === 'low') ? 'LOW' : 'HIGH');
}

function _audioItemLabel() {
  try { return audioLabel(); } catch { return 'AUDIO: ON'; }
}

// ── Build menu DOM ────────────────────────────────────────────────────────
export function buildMenu() {
  if (_menuEl) return;

  // ── Drifting petals background ──
  const petalContainer = document.createElement('div');
  petalContainer.id = 'menu-petals';
  petalContainer.style.cssText = `
    position:fixed;top:0;left:0;width:100%;height:100%;
    pointer-events:none;overflow:hidden;z-index:149;
  `;
  _spawnPetals(petalContainer);
  document.body.appendChild(petalContainer);

  // ── Menu panel ──
  _menuEl = document.createElement('div');
  _menuEl.id = 'main-menu';
  _menuEl.style.cssText = `
    position:fixed;top:0;left:0;width:100%;height:100%;
    background:linear-gradient(160deg,#1a0a00 0%,#2d1505 30%,#3a1800 60%,#0a0005 100%);
    z-index:150;
    display:flex;flex-direction:column;
    align-items:center;justify-content:center;
    font-family:Georgia,serif;
    overflow:hidden;
  `;

  // Title
  const titleWrap = document.createElement('div');
  titleWrap.style.cssText = 'text-align:center;margin-bottom:60px;';

  const logo = document.createElement('h1');
  logo.textContent = 'The Monk & The Dragon Sister';
  logo.style.cssText = `
    font-size:clamp(24px,4vw,52px);
    color:#c8a000;
    text-shadow:0 0 40px rgba(200,160,0,0.9),0 0 80px rgba(200,160,0,0.4);
    letter-spacing:3px;margin-bottom:10px;
  `;

  const sub = document.createElement('p');
  sub.textContent = 'Quest I — The Initial Compassion';
  sub.style.cssText = `
    font-size:clamp(13px,1.5vw,18px);color:#aaa;
    font-style:italic;letter-spacing:2px;
  `;

  titleWrap.appendChild(logo);
  titleWrap.appendChild(sub);

  // Menu items
  const itemsWrap = document.createElement('div');
  itemsWrap.style.cssText = 'display:flex;flex-direction:column;gap:18px;align-items:center;';
  const _itemEls = [];

  MENU_ITEMS.forEach((label, idx) => {
    const btn = document.createElement('div');
    btn.className = 'menu-item';
    btn.dataset.index = idx;
    btn.textContent = (label === 'QUALITY') ? _qualityLabel() : (label === 'AUDIO') ? _audioItemLabel() : label;
    btn.style.cssText = `
      font-size:clamp(16px,2vw,22px);
      letter-spacing:5px;
      color:#888;
      cursor:pointer;
      padding:10px 30px;
      border:1px solid transparent;
      border-radius:4px;
      transition:color 0.15s,border-color 0.15s,text-shadow 0.15s;
      user-select:none;
    `;
    btn.addEventListener('mouseenter', () => _selectItem(idx));
    btn.addEventListener('click', () => _activateItem(idx));
    itemsWrap.appendChild(btn);
    _itemEls.push(btn);
  });

  // Store for highlight updates
  _menuEl._itemEls = _itemEls;

  _menuEl.appendChild(titleWrap);
  _menuEl.appendChild(itemsWrap);
  document.body.appendChild(_menuEl);

  // Keyboard navigation
  _menuEl._keyHandler = (e) => {
    if (!_menuVisible) return;
    if (e.code === 'KeyW' || e.code === 'ArrowUp') {
      e.preventDefault();
      _selectItem((_selectedIndex - 1 + MENU_ITEMS.length) % MENU_ITEMS.length);
    } else if (e.code === 'KeyS' || e.code === 'ArrowDown') {
      e.preventDefault();
      _selectItem((_selectedIndex + 1) % MENU_ITEMS.length);
    } else if (e.code === 'Enter' || e.code === 'Space' || e.code === 'NumpadEnter') {
      e.preventDefault();
      _activateItem(_selectedIndex);
    }
  };
  document.addEventListener('keydown', _menuEl._keyHandler);

  _selectItem(0);
  showMenu();

  // Pass 12: restore after a restart-triggered reload
  try {
    const pending = sessionStorage.getItem('mds_restart_pending');
    if (pending === '1') {
      sessionStorage.removeItem('mds_restart_pending');
      const mode     = sessionStorage.getItem('mds_restart_mode')      || '2p';
      const soloChar = sessionStorage.getItem('mds_restart_soloChar')  || null;
      const aiP      = sessionStorage.getItem('mds_restart_aiPartner') === '1';
      ctx.mode = mode;
      ctx.soloChar = soloChar || null;
      ctx.aiPartner = aiP;
      // Slight delay so players are constructed before _applyModeSetup
      setTimeout(() => { startGame(); }, 50);
    }
  } catch (_) {}
}

function _selectItem(idx) {
  const prev = _selectedIndex;
  _selectedIndex = idx;
  // Play tick only when navigating (not on initial build)
  if (_menuVisible && prev !== idx) {
    try { initAudioOnGesture(); sfx.menuTick(); } catch {}
  }
  const els = _menuEl && _menuEl._itemEls;
  if (!els) return;
  els.forEach((el, i) => {
    if (i === idx) {
      el.style.color = '#ffdd55';
      el.style.borderColor = 'rgba(200,160,0,0.6)';
      el.style.textShadow = '0 0 20px rgba(200,160,0,0.8)';
      el.style.background = 'rgba(200,160,0,0.08)';
    } else {
      el.style.color = '#888';
      el.style.borderColor = 'transparent';
      el.style.textShadow = 'none';
      el.style.background = 'transparent';
    }
  });
}

function _activateItem(idx) {
  // Every menu interaction is a user gesture — init audio context
  try { initAudioOnGesture(); } catch {}
  if (idx === 0) {
    // START GAME → open mode select
    try { sfx.menuSelect(); } catch {}
    _showModeSelect();
  } else if (idx === 1) {
    try { sfx.menuSelect(); } catch {}
    showControls();
  } else if (idx === 2) {
    // QUALITY — toggle high/low, persist + rebuild composer, refresh label.
    try { sfx.menuTick(); } catch {}
    const next = (ctx.quality === 'low') ? 'high' : 'low';
    if (typeof window.__applyQuality === 'function') window.__applyQuality(next);
    const els = _menuEl && _menuEl._itemEls;
    if (els && els[2]) els[2].textContent = _qualityLabel();
  } else if (idx === 3) {
    // AUDIO — toggle mute
    try { toggleMute(); sfx.menuTick(); } catch {}
    const els = _menuEl && _menuEl._itemEls;
    if (els && els[3]) els[3].textContent = _audioItemLabel();
  }
}

// ── Show/hide menu ────────────────────────────────────────────────────────
export function showMenu() {
  if (!_menuEl) buildMenu();
  _menuEl.style.display = 'flex';
  _menuVisible = true;
  _selectItem(0);
}

export function hideMenu() {
  if (_menuEl) _menuEl.style.display = 'none';
  _menuVisible = false;
}

export function isMenuVisible() { return _menuVisible; }

// ── Start game (MENU → INTRO) ─────────────────────────────────────────────
// Called directly by debug.js startGame() — must keep 2P default behaviour.
export function startGame() {
  // Remove petal container as it overlaps with game
  const petals = document.getElementById('menu-petals');
  if (petals) petals.remove();
  hideMenu();
  _hideModeSelect();
  _hideCharSelect();
  // Ensure we always boot into 2P when called programmatically (E2E contract)
  if (ctx.mode !== '1p') ctx.mode = '2p';
  _applyModeSetup();
  // Rebuild postFX composers for the selected mode (1P=full-screen, 2P=split).
  // Falls back silently to the direct render path if unavailable.
  try {
    if (typeof window.__applyQuality === 'function') window.__applyQuality(ctx.quality);
  } catch (_) {}
  startIntro();
}

// ── Internal: apply mode setup to players after mode/char chosen ──────────
function _applyModeSetup() {
  const p1 = ctx.gameState && ctx.gameState.p1;
  const p2 = ctx.gameState && ctx.gameState.p2;
  if (!p1 || !p2) return;

  if (ctx.mode === '2p') {
    // Both active
    p1.inactive = false; p1._isAiPartner = false;
    p2.inactive = false; p2._isAiPartner = false;
    const cm1 = p1.currentMesh(); if (cm1) cm1.visible = true;
    const cm2 = p2.currentMesh(); if (cm2) cm2.visible = true;
  } else if (ctx.mode === '1p') {
    if (ctx.soloChar === 'monk') {
      // P1 = active monk; P2 = partner (solo hidden OR AI driven)
      p1.inactive = false; p1._isAiPartner = false;
      const cm1 = p1.currentMesh(); if (cm1) cm1.visible = true;
      if (ctx.aiPartner) {
        p2.inactive = false; p2._isAiPartner = true;
        const cm2 = p2.currentMesh(); if (cm2) cm2.visible = true;
      } else {
        p2.inactive = true; p2._isAiPartner = false;
        const cm2 = p2.currentMesh(); if (cm2) cm2.visible = false;
      }
    } else {
      // soloChar === 'sister': P2 = active; P1 = partner
      p2.inactive = false; p2._isAiPartner = false;
      const cm2 = p2.currentMesh(); if (cm2) cm2.visible = true;
      if (ctx.aiPartner) {
        p1.inactive = false; p1._isAiPartner = true;
        const cm1 = p1.currentMesh(); if (cm1) cm1.visible = true;
      } else {
        p1.inactive = true; p1._isAiPartner = false;
        const cm1 = p1.currentMesh(); if (cm1) cm1.visible = false;
      }
    }
  }
}

// ── Mode select screen ────────────────────────────────────────────────────
function _showModeSelect() {
  if (_modeEl) { _modeEl.style.display = 'flex'; return; }
  _modeEl = document.createElement('div');
  _modeEl.id = 'mode-select';
  _modeEl.style.cssText = `
    position:fixed;top:0;left:0;width:100%;height:100%;
    background:rgba(0,0,0,0.92);z-index:160;
    display:flex;flex-direction:column;
    align-items:center;justify-content:center;
    font-family:Georgia,serif;
  `;

  const h = document.createElement('h2');
  h.textContent = 'SELECT MODE';
  h.style.cssText = 'color:#c8a000;font-size:28px;letter-spacing:6px;margin-bottom:40px;';

  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:30px;align-items:center;margin-bottom:30px;';

  const btn1P = _makeMenuBtn('1 PLAYER', () => {
    try { sfx.menuSelect(); } catch {}
    _hideModeSelect();
    _showCharSelect();
  });
  const btn2P = _makeMenuBtn('2 PLAYERS', () => {
    try { sfx.menuSelect(); } catch {}
    ctx.mode = '2p'; ctx.soloChar = null; ctx.aiPartner = false;
    _hideModeSelect();
    startGame();
  });
  const btnBack = _makeMenuBtn('BACK', () => {
    try { sfx.menuTick(); } catch {}
    _hideModeSelect();
  });

  btnRow.appendChild(btn1P);
  btnRow.appendChild(btn2P);

  _modeEl.appendChild(h);
  _modeEl.appendChild(btnRow);
  _modeEl.appendChild(btnBack);
  document.body.appendChild(_modeEl);

  _modeEl._keyHandler = (e) => {
    if (e.code === 'Escape' || e.code === 'Backspace') { _hideModeSelect(); }
  };
  document.addEventListener('keydown', _modeEl._keyHandler);
}

function _hideModeSelect() {
  if (_modeEl) {
    _modeEl.style.display = 'none';
    if (_modeEl._keyHandler) {
      document.removeEventListener('keydown', _modeEl._keyHandler);
      _modeEl._keyHandler = null;
    }
  }
}

// ── Character select screen ───────────────────────────────────────────────
function _showCharSelect() {
  if (_charEl) { _charEl.style.display = 'flex'; _charEl._refresh && _charEl._refresh(); return; }
  _charEl = document.createElement('div');
  _charEl.id = 'char-select';
  _charEl.style.cssText = `
    position:fixed;top:0;left:0;width:100%;height:100%;
    background:rgba(0,0,0,0.92);z-index:161;
    display:flex;flex-direction:column;
    align-items:center;justify-content:center;
    font-family:Georgia,serif;gap:24px;
  `;

  const h = document.createElement('h2');
  h.textContent = 'SELECT CHARACTER';
  h.style.cssText = 'color:#c8a000;font-size:28px;letter-spacing:6px;';

  // Char buttons
  const charRow = document.createElement('div');
  charRow.style.cssText = 'display:flex;gap:30px;align-items:center;';

  let _selectedChar = 'monk'; // default
  let _aiPartnerFlag = false;

  const btnMonk = _makeMenuBtn('THE MONK', () => {
    _selectedChar = 'monk';
    try { sfx.menuTick(); } catch {}
    _refreshCharButtons();
  });
  const btnSister = _makeMenuBtn('THE DRAGON SISTER', () => {
    _selectedChar = 'sister';
    try { sfx.menuTick(); } catch {}
    _refreshCharButtons();
  });

  charRow.appendChild(btnMonk);
  charRow.appendChild(btnSister);

  // Partner toggle
  const partnerWrap = document.createElement('div');
  partnerWrap.style.cssText = 'display:flex;align-items:center;gap:16px;';
  const partnerLabel = document.createElement('span');
  partnerLabel.textContent = 'PARTNER:';
  partnerLabel.style.cssText = 'color:#888;font-size:14px;letter-spacing:3px;';

  const btnSolo = _makeMenuBtn('SOLO', () => {
    _aiPartnerFlag = false;
    try { sfx.menuTick(); } catch {}
    _refreshPartnerButtons();
  });
  const btnAI = _makeMenuBtn('AI PARTNER', () => {
    _aiPartnerFlag = true;
    try { sfx.menuTick(); } catch {}
    _refreshPartnerButtons();
  });

  partnerWrap.appendChild(partnerLabel);
  partnerWrap.appendChild(btnSolo);
  partnerWrap.appendChild(btnAI);

  // Action row
  const actionRow = document.createElement('div');
  actionRow.style.cssText = 'display:flex;gap:20px;align-items:center;';

  const btnBegin = _makeMenuBtn('BEGIN', () => {
    try { sfx.menuSelect(); } catch {}
    ctx.mode = '1p'; ctx.soloChar = _selectedChar; ctx.aiPartner = _aiPartnerFlag;
    _hideCharSelect();
    startGame();
  });
  const btnBack = _makeMenuBtn('BACK', () => {
    try { sfx.menuTick(); } catch {}
    _hideCharSelect();
    _showModeSelect();
  });

  actionRow.appendChild(btnBegin);
  actionRow.appendChild(btnBack);

  _charEl.appendChild(h);
  _charEl.appendChild(charRow);
  _charEl.appendChild(partnerWrap);
  _charEl.appendChild(actionRow);
  document.body.appendChild(_charEl);

  function _refreshCharButtons() {
    btnMonk.style.color = _selectedChar === 'monk' ? '#ffdd55' : '#888';
    btnMonk.style.borderColor = _selectedChar === 'monk' ? 'rgba(200,160,0,0.6)' : 'rgba(200,160,0,0.4)';
    btnMonk.style.background = _selectedChar === 'monk' ? 'rgba(200,160,0,0.08)' : 'transparent';
    btnSister.style.color = _selectedChar === 'sister' ? '#ffdd55' : '#888';
    btnSister.style.borderColor = _selectedChar === 'sister' ? 'rgba(200,160,0,0.6)' : 'rgba(200,160,0,0.4)';
    btnSister.style.background = _selectedChar === 'sister' ? 'rgba(200,160,0,0.08)' : 'transparent';
  }
  function _refreshPartnerButtons() {
    btnSolo.style.color = !_aiPartnerFlag ? '#ffdd55' : '#888';
    btnSolo.style.borderColor = !_aiPartnerFlag ? 'rgba(200,160,0,0.6)' : 'rgba(200,160,0,0.4)';
    btnSolo.style.background = !_aiPartnerFlag ? 'rgba(200,160,0,0.08)' : 'transparent';
    btnAI.style.color = _aiPartnerFlag ? '#ffdd55' : '#888';
    btnAI.style.borderColor = _aiPartnerFlag ? 'rgba(200,160,0,0.6)' : 'rgba(200,160,0,0.4)';
    btnAI.style.background = _aiPartnerFlag ? 'rgba(200,160,0,0.08)' : 'transparent';
  }

  // Store refresh function for re-open
  _charEl._refresh = () => { _refreshCharButtons(); _refreshPartnerButtons(); };
  _refreshCharButtons();
  _refreshPartnerButtons();

  _charEl._keyHandler = (e) => {
    if (e.code === 'Escape' || e.code === 'Backspace') {
      _hideCharSelect(); _showModeSelect();
    }
  };
  document.addEventListener('keydown', _charEl._keyHandler);
}

function _hideCharSelect() {
  if (_charEl) {
    _charEl.style.display = 'none';
    if (_charEl._keyHandler) {
      document.removeEventListener('keydown', _charEl._keyHandler);
      _charEl._keyHandler = null;
    }
  }
}

// ── Shared styled button helper ───────────────────────────────────────────
function _makeMenuBtn(label, fn) {
  const btn = document.createElement('div');
  btn.textContent = label;
  btn.style.cssText = `
    font-size:clamp(14px,1.8vw,20px);letter-spacing:4px;color:#888;cursor:pointer;
    padding:10px 24px;border:1px solid rgba(200,160,0,0.4);
    border-radius:4px;transition:color 0.15s,border-color 0.15s,background 0.15s;
    user-select:none;
  `;
  btn.addEventListener('mouseenter', () => {
    btn.style.color = '#ffdd55';
    btn.style.borderColor = 'rgba(200,160,0,0.8)';
    btn.style.background = 'rgba(200,160,0,0.08)';
    try { initAudioOnGesture(); sfx.menuTick(); } catch {}
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.color = '#888';
    btn.style.borderColor = 'rgba(200,160,0,0.4)';
    btn.style.background = 'transparent';
  });
  btn.addEventListener('click', fn);
  return btn;
}

// ── Controls overlay ──────────────────────────────────────────────────────
export function showControls() {
  if (_ctrlEl && _ctrlEl.parentNode) {
    _ctrlEl.style.display = 'flex';
    return;
  }
  _ctrlEl = document.createElement('div');
  _ctrlEl.id = 'controls-overlay';
  _ctrlEl.style.cssText = `
    position:fixed;top:0;left:0;width:100%;height:100%;
    background:rgba(0,0,0,0.92);z-index:200;
    display:flex;flex-direction:column;
    align-items:center;justify-content:center;
    font-family:Georgia,serif;
  `;

  const h = document.createElement('h2');
  h.textContent = 'CONTROLS';
  h.style.cssText = 'color:#c8a000;font-size:28px;letter-spacing:6px;margin-bottom:30px;';

  const cols = document.createElement('div');
  cols.style.cssText = 'display:flex;gap:60px;align-items:flex-start;';

  cols.appendChild(_makeControlCol('P1 — The Monk', [
    ['WASD',       'Move'],
    ['Space / I',  'Attack'],
    ['J',          'Chi Shield'],
    ['K',          'Dodge'],
    ['L',          'Healing Pulse'],
    ['Q / E',      'Camera orbit left/right'],
    ['F',          'Lock-on toggle'],
  ]));
  cols.appendChild(_makeControlCol('P2 — Dragon Sister', [
    ['Arrow Keys',   'Move'],
    ['Enter / Num8', 'Attack'],
    ['Num4',         'Transform'],
    ['Num5',         'Dodge'],
    ['Num6',         'Special'],
    ['Num7 / Num9',  'Camera orbit left/right'],
    ['Num0',         'Lock-on toggle'],
  ]));

  const esc = document.createElement('p');
  esc.textContent = 'Esc / Backspace — Back';
  esc.style.cssText = 'color:#666;font-size:12px;margin-top:30px;letter-spacing:2px;';

  _ctrlEl.appendChild(h);
  _ctrlEl.appendChild(cols);
  _ctrlEl.appendChild(esc);
  document.body.appendChild(_ctrlEl);

  _ctrlEl._keyHandler = (e) => {
    if (e.code === 'Escape' || e.code === 'Backspace') {
      hideControls();
    }
  };
  document.addEventListener('keydown', _ctrlEl._keyHandler);
}

function _makeControlCol(title, rows) {
  const col = document.createElement('div');
  col.style.cssText = 'min-width:260px;';
  const h = document.createElement('h3');
  h.textContent = title;
  h.style.cssText = 'color:#c8a000;font-size:16px;margin-bottom:16px;border-bottom:1px solid rgba(200,160,0,0.3);padding-bottom:8px;letter-spacing:2px;';
  col.appendChild(h);
  rows.forEach(([key, label]) => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;justify-content:space-between;gap:20px;margin-bottom:10px;';
    const kEl = document.createElement('span');
    kEl.textContent = key;
    kEl.style.cssText = 'color:#ffdd55;font-size:13px;background:rgba(255,220,0,0.1);padding:2px 8px;border-radius:3px;border:1px solid rgba(200,160,0,0.4);white-space:nowrap;';
    const lEl = document.createElement('span');
    lEl.textContent = label;
    lEl.style.cssText = 'color:#ccc;font-size:13px;';
    row.appendChild(kEl);
    row.appendChild(lEl);
    col.appendChild(row);
  });
  return col;
}

export function hideControls() {
  if (_ctrlEl) {
    _ctrlEl.style.display = 'none';
    if (_ctrlEl._keyHandler) {
      document.removeEventListener('keydown', _ctrlEl._keyHandler);
      _ctrlEl._keyHandler = null;
    }
  }
}

// ── Pause overlay ─────────────────────────────────────────────────────────
// Single source of truth: ctx.gameState._paused
// The old module-level _isPaused is removed; all reads go through ctx.gameState._paused.
// __game.pause() / __game.resume() in debug.js also write ctx.gameState._paused directly,
// so they freeze/unfreeze the sim consistently without needing to show the overlay UI.

export function togglePause() {
  if (ctx.gameState.state === 'MENU' ||
      ctx.gameState.state === 'INTRO' ||
      ctx.gameState.state === 'GAMEOVER' ||
      ctx.gameState.state === 'COMPLETE') return;

  if (ctx.gameState._paused) {
    resumeGame();
  } else {
    pauseGame();
  }
}

export function pauseGame() {
  if (ctx.gameState._paused) return;
  ctx.gameState._paused = true;
  _showPauseOverlay();
}

export function resumeGame() {
  if (!ctx.gameState._paused) return;
  ctx.gameState._paused = false;
  _hidePauseOverlay();
}

// isPaused(): single source of truth — reads ctx.gameState._paused.
export function isPaused() { return !!(ctx.gameState && ctx.gameState._paused); }

function _pauseQualityLabel() {
  return 'QUALITY: ' + ((ctx.quality === 'low') ? 'LOW' : 'HIGH');
}

function _showPauseOverlay() {
  if (_pauseEl && _pauseEl.parentNode) { _pauseEl.style.display = 'flex'; return; }
  _pauseEl = document.createElement('div');
  _pauseEl.id = 'pause-overlay';
  _pauseEl.style.cssText = `
    position:fixed;top:0;left:0;width:100%;height:100%;
    background:rgba(0,0,0,0.7);z-index:180;
    display:flex;flex-direction:column;
    align-items:center;justify-content:center;
    font-family:Georgia,serif;
  `;
  const h = document.createElement('h2');
  h.textContent = 'PAUSED';
  h.style.cssText = 'color:#c8a000;font-size:40px;letter-spacing:8px;margin-bottom:30px;';

  const resume  = _makePauseBtn('RESUME', () => resumeGame());

  // Quality toggle — reuses applyQuality from main.js + refreshes label.
  const qualBtn = _makePauseBtn(_pauseQualityLabel(), () => {
    const next = (ctx.quality === 'low') ? 'high' : 'low';
    if (typeof window.__applyQuality === 'function') window.__applyQuality(next);
    qualBtn.textContent = _pauseQualityLabel();
  });
  qualBtn.title = 'Press Q while paused to toggle quality';

  const quit    = _makePauseBtn('QUIT TO MENU', () => { location.reload(); });

  _pauseEl.appendChild(h);
  _pauseEl.appendChild(resume);
  _pauseEl.appendChild(qualBtn);
  _pauseEl.appendChild(quit);
  document.body.appendChild(_pauseEl);

  _pauseEl._qualBtn = qualBtn; // store reference for Q key handler

  _pauseEl._keyHandler = (e) => {
    if (e.code === 'Escape') { resumeGame(); return; }
    // Q key while paused = toggle quality (keyboard-accessible)
    if (e.code === 'KeyQ' && ctx.gameState && ctx.gameState._paused) {
      const next = (ctx.quality === 'low') ? 'high' : 'low';
      if (typeof window.__applyQuality === 'function') window.__applyQuality(next);
      if (_pauseEl._qualBtn) _pauseEl._qualBtn.textContent = _pauseQualityLabel();
    }
  };
  document.addEventListener('keydown', _pauseEl._keyHandler);
}

function _makePauseBtn(label, fn) {
  const btn = document.createElement('div');
  btn.textContent = label;
  btn.style.cssText = `
    font-size:18px;letter-spacing:4px;color:#888;cursor:pointer;
    padding:10px 30px;margin:8px;border:1px solid rgba(200,160,0,0.4);
    border-radius:4px;transition:color 0.15s;
  `;
  btn.addEventListener('mouseenter', () => { btn.style.color = '#ffdd55'; });
  btn.addEventListener('mouseleave', () => { btn.style.color = '#888'; });
  btn.addEventListener('click', fn);
  return btn;
}

function _hidePauseOverlay() {
  if (_pauseEl) _pauseEl.style.display = 'none';
  if (_pauseEl && _pauseEl._keyHandler) {
    document.removeEventListener('keydown', _pauseEl._keyHandler);
  }
}

// ── Drifting petals ───────────────────────────────────────────────────────
function _spawnPetals(container) {
  for (let i = 0; i < 28; i++) {
    const p = document.createElement('div');
    const size = 8 + Math.random() * 12;
    const startX = Math.random() * 100;
    const dur = 6 + Math.random() * 12;
    const delay = -Math.random() * 14;
    const drift = (Math.random() - 0.5) * 60;
    p.style.cssText = `
      position:absolute;
      width:${size}px;height:${size}px;
      left:${startX}%;top:-20px;
      background:rgba(255,180,200,${0.4 + Math.random() * 0.4});
      border-radius:50% 0 50% 0;
      transform:rotate(${Math.random() * 360}deg);
      animation:petalFall ${dur}s ${delay}s linear infinite;
    `;
    container.appendChild(p);
  }
  if (!document.getElementById('_petalStyle')) {
    const s = document.createElement('style');
    s.id = '_petalStyle';
    s.textContent = `
      @keyframes petalFall{
        0%  {transform:translateX(0)     translateY(-20px) rotate(0deg);   opacity:0.9;}
        50% {transform:translateX(var(--drift,30px)) translateY(50vh) rotate(180deg); opacity:0.7;}
        100%{transform:translateX(0)     translateY(105vh) rotate(360deg); opacity:0;}
      }
    `;
    document.head.appendChild(s);
  }
}
