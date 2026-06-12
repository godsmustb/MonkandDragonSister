// src/ui/menu.js — Main menu + Controls overlay + Pause overlay
// Boot state: 'MENU'. startGame() → 'INTRO'. Esc during play → 'PAUSED'.
import { ctx } from '../state.js';
import { startIntro } from '../game/quest.js';

// ── State ─────────────────────────────────────────────────────────────────
let _menuEl   = null;
let _pauseEl  = null;
let _ctrlEl   = null;
let _selectedIndex = 0;
let _menuVisible   = false;
let _pauseVisible  = false;

const MENU_ITEMS = ['START GAME', 'CONTROLS'];

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
  sub.textContent = 'Quest I — The Initial Trauma';
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
    btn.textContent = label;
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
}

function _selectItem(idx) {
  _selectedIndex = idx;
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
  if (idx === 0) {
    // START GAME
    hideMenu();
    startGame();
  } else if (idx === 1) {
    showControls();
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
export function startGame() {
  // Remove petal container as it overlaps with game
  const petals = document.getElementById('menu-petals');
  if (petals) petals.remove();
  hideMenu();
  startIntro();
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
let _isPaused = false;

export function togglePause() {
  if (ctx.gameState.state === 'MENU' ||
      ctx.gameState.state === 'INTRO' ||
      ctx.gameState.state === 'GAMEOVER' ||
      ctx.gameState.state === 'COMPLETE') return;

  if (_isPaused) {
    resumeGame();
  } else {
    pauseGame();
  }
}

export function pauseGame() {
  if (_isPaused) return;
  _isPaused = true;
  ctx.gameState._paused = true;
  _showPauseOverlay();
}

export function resumeGame() {
  if (!_isPaused) return;
  _isPaused = false;
  ctx.gameState._paused = false;
  _hidePauseOverlay();
}

export function isPaused() { return _isPaused; }

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

  const resume = _makePauseBtn('RESUME', () => resumeGame());
  const quit   = _makePauseBtn('QUIT TO MENU', () => { location.reload(); });

  _pauseEl.appendChild(h);
  _pauseEl.appendChild(resume);
  _pauseEl.appendChild(quit);
  document.body.appendChild(_pauseEl);

  _pauseEl._keyHandler = (e) => {
    if (e.code === 'Escape') resumeGame();
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
