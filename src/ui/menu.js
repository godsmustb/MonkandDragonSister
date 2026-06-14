// src/ui/menu.js — Main menu + Controls overlay + Pause overlay
// Boot state: 'MENU'. startGame() → 'INTRO'. Esc during play → 'PAUSED'.
import { ctx } from '../state.js';
import { startIntro } from '../game/quest.js';
import { initAudioOnGesture, toggleMute, audioLabel, sfx } from '../audio/audio.js';
import { saveBindings, resetBindings, DEFAULT_BINDINGS } from '../game/bindings.js';
import { LANDS } from '../game/campaign.js';
// On mobile (touch-primary) there's no room/multitouch for split-screen, so we
// offer 1-Player only (Monk or Sister); desktop keeps the full 1P/2P choice.
import { IS_TOUCH } from '../config.js';
// Touch layout editor — import lazily to avoid loading touch.js on desktop builds
// that never need it. Resolved at call-time inside showControls().

// ── State ─────────────────────────────────────────────────────────────────
let _menuEl   = null;
let _pauseEl  = null;
let _ctrlEl   = null;
let _modeEl   = null;     // Pass 12: mode-select sub-screen
let _charEl   = null;     // Pass 12: character-select sub-screen
let _campaignEl = null;   // Pass 15: campaign preview sub-screen
let _selectedIndex = 0;
let _menuVisible   = false;
let _pauseVisible  = false;

const MENU_ITEMS = ['START GAME', 'CAMPAIGN', 'HIGH SCORES', 'CONTROLS', 'QUALITY', 'AUDIO'];

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
    color:var(--gold);
    text-shadow:0 0 40px rgba(var(--gold-rgb),0.9),0 0 80px rgba(var(--gold-rgb),0.4);
    letter-spacing:3px;margin-bottom:10px;
  `;

  const sub = document.createElement('p');
  sub.textContent = 'Quest I — The Initial Compassion';
  sub.style.cssText = `
    font-size:clamp(13px,1.5vw,18px);color:var(--text-dim);
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
    btn.className = 'menu-item mds-btn';
    btn.dataset.index = idx;
    btn.textContent = (label === 'QUALITY') ? _qualityLabel() : (label === 'AUDIO') ? _audioItemLabel() : label;
    // Slightly larger type + tighter tracking than the base .mds-btn for the
    // main menu list; chrome (border/radius/colors) comes from the shared class.
    btn.style.cssText = `
      font-size:clamp(16px,2vw,22px);
      letter-spacing:5px;
      padding:10px 30px;
      border:1px solid transparent;
    `;
    btn.addEventListener('mouseenter', () => _selectItem(idx));
    btn.addEventListener('click', () => _activateItem(idx));
    itemsWrap.appendChild(btn);
    _itemEls.push(btn);
  });

  // Store for highlight updates
  _menuEl._itemEls = _itemEls;

  // Privacy notice — unobtrusive footer
  const privacyNote = document.createElement('p');
  privacyNote.id = 'analytics-notice';
  privacyNote.textContent = 'Anonymous gameplay stats help improve the game.';
  privacyNote.style.cssText = `
    position:absolute;bottom:14px;left:50%;transform:translateX(-50%);
    font-size:10px;color:rgba(150,130,80,0.55);letter-spacing:1px;
    pointer-events:none;white-space:nowrap;font-family:var(--font-ui);
  `;

  _menuEl.appendChild(titleWrap);
  _menuEl.appendChild(itemsWrap);
  _menuEl.appendChild(privacyNote);
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
      el.classList.add('selected');
      el.style.color = 'var(--gold-bright)';
      el.style.borderColor = 'var(--border-strong)';
      el.style.textShadow = 'var(--glow-gold)';
      el.style.background = 'rgba(var(--gold-rgb),0.10)';
    } else {
      el.classList.remove('selected');
      el.style.color = '';
      el.style.borderColor = 'transparent';
      el.style.textShadow = 'none';
      el.style.background = '';
    }
  });
}

function _activateItem(idx) {
  // Every menu interaction is a user gesture — init audio context
  try { initAudioOnGesture(); } catch {}
  if (idx === 0) {
    // START GAME. Mobile/touch → straight to 1-Player character select (no
    // split-screen on phones). Desktop → the 1P/2P mode chooser.
    try { sfx.menuSelect(); } catch {}
    // Hide the main menu so ITS keyboard handler (which checks _menuVisible) stops
    // intercepting arrows/Enter — otherwise the hidden menu behind the overlay eats
    // the keys and the visible mode/character buttons can't be navigated.
    hideMenu();
    if (IS_TOUCH) { ctx.mode = '1p'; _showCharSelect(); }
    else _showModeSelect();
  } else if (idx === 1) {
    // CAMPAIGN — show lands preview
    try { sfx.menuSelect(); } catch {}
    showCampaignPreview();
  } else if (idx === 2) {
    // HIGH SCORES — global/local leaderboard overlay
    try { sfx.menuSelect(); } catch {}
    import('../game/leaderboard.js').then(lb => {
      lb.showLeaderboardOverlay();
    }).catch(() => {});
  } else if (idx === 3) {
    try { sfx.menuSelect(); } catch {}
    showControls();
  } else if (idx === 4) {
    // QUALITY — toggle high/low, persist + rebuild composer, refresh label.
    try { sfx.menuTick(); } catch {}
    const next = (ctx.quality === 'low') ? 'high' : 'low';
    if (typeof window.__applyQuality === 'function') window.__applyQuality(next);
    const els = _menuEl && _menuEl._itemEls;
    if (els && els[4]) els[4].textContent = _qualityLabel();
  } else if (idx === 5) {
    // AUDIO — toggle mute
    try { toggleMute(); sfx.menuTick(); } catch {}
    const els = _menuEl && _menuEl._itemEls;
    if (els && els[5]) els[5].textContent = _audioItemLabel();
  }
}

// ── Show/hide menu ────────────────────────────────────────────────────────
export function showMenu() {
  if (!_menuEl) buildMenu();
  _menuEl.style.display = 'flex';
  _menuVisible = true;
  _selectItem(0);
  // The menu is now visible — remove the boot splash so it can never trap the
  // user on a "LOADING…" screen (robust even if later init steps fail).
  const _splash = document.getElementById('boot-splash');
  if (_splash) { _splash.style.transition = 'opacity 0.25s'; _splash.style.opacity = '0'; setTimeout(() => _splash.remove(), 280); }
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

// ── Keyboard navigation for the sub-select screens (mode / character) ─────────
// Reads `el._navButtons` (ordered list of clickable buttons) and `el._navOnEscape`.
// Arrow keys / WASD move a focus ring; Enter/Space activates (fires the button's
// own click handler); Esc/Backspace runs onEscape. Re-installable (call on every
// show — including the cached-element early-return path). Stored as `el._keyHandler`
// so the existing `_hide*` removal code keeps working.
function _installNav(el) {
  if (el._keyHandler) document.removeEventListener('keydown', el._keyHandler);
  let focus = 0;
  const apply = () => {
    const buttons = el._navButtons || [];
    buttons.forEach((b, i) => {
      b.style.outline = (i === focus) ? '2px solid var(--gold-bright)' : '';
      b.style.outlineOffset = (i === focus) ? '3px' : '';
    });
  };
  const move = (d) => {
    const n = (el._navButtons || []).length;
    if (!n) return;
    focus = (focus + d + n) % n;
    apply();
    try { sfx.menuTick(); } catch {}
  };
  const handler = (e) => {
    if (['ArrowLeft', 'ArrowUp', 'KeyA', 'KeyW'].includes(e.code)) { e.preventDefault(); move(-1); }
    else if (['ArrowRight', 'ArrowDown', 'KeyD', 'KeyS'].includes(e.code)) { e.preventDefault(); move(1); }
    else if (['Enter', 'Space', 'NumpadEnter'].includes(e.code)) {
      e.preventDefault();
      const b = (el._navButtons || [])[focus];
      if (b) b.click();
    } else if (e.code === 'Escape' || e.code === 'Backspace') {
      e.preventDefault();
      if (el._navOnEscape) el._navOnEscape();
    }
  };
  el._keyHandler = handler;
  document.addEventListener('keydown', handler);
  apply();
}

// ── Mode select screen ────────────────────────────────────────────────────
function _showModeSelect() {
  if (_modeEl) { _modeEl.style.display = 'flex'; _installNav(_modeEl); return; }
  _modeEl = document.createElement('div');
  _modeEl.id = 'mode-select';
  _modeEl.className = 'mds-scrim';
  _modeEl.style.cssText = 'z-index:160;';

  const h = document.createElement('h2');
  h.className = 'mds-heading';
  h.textContent = 'SELECT MODE';
  h.style.cssText = 'font-size:28px;margin-bottom:40px;';

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
    ctx.startLevel = levelRow.get();
    _hideModeSelect();
    startGame();
  });
  const btnBack = _makeMenuBtn('BACK', () => {
    try { sfx.menuTick(); } catch {}
    _hideModeSelect();
    showMenu();
  });

  btnRow.appendChild(btn1P);
  btnRow.appendChild(btn2P);

  // Level selector (applies to the 2-player path; 1-player picks its own on char-select)
  const levelRow = _makeLevelRow(ctx.startLevel || 1);

  _modeEl.appendChild(h);
  _modeEl.appendChild(btnRow);
  _modeEl.appendChild(levelRow.wrap);
  _modeEl.appendChild(btnBack);
  document.body.appendChild(_modeEl);

  // Keyboard navigation: 1 PLAYER ↔ 2 PLAYERS ↔ levels ↔ BACK; Enter activates; Esc backs out.
  _modeEl._navButtons = [btn1P, btn2P, ...levelRow.buttons, btnBack];
  _modeEl._navOnEscape = () => { _hideModeSelect(); showMenu(); };
  _installNav(_modeEl);
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
  if (_charEl) { _charEl.style.display = 'flex'; _charEl._refresh && _charEl._refresh(); _installNav(_charEl); return; }
  _charEl = document.createElement('div');
  _charEl.id = 'char-select';
  _charEl.className = 'mds-scrim';
  _charEl.style.cssText = 'z-index:161;gap:24px;';

  const h = document.createElement('h2');
  h.className = 'mds-heading';
  h.textContent = 'SELECT CHARACTER';
  h.style.cssText = 'font-size:28px;';

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
  partnerLabel.style.cssText = 'color:var(--text-muted);font-size:14px;letter-spacing:3px;';

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

  // Level selector row (jump to Zen / Glacial / Venom)
  const levelRow = _makeLevelRow(ctx.startLevel || 1);

  // Action row
  const actionRow = document.createElement('div');
  actionRow.style.cssText = 'display:flex;gap:20px;align-items:center;';

  const btnBegin = _makeMenuBtn('BEGIN', () => {
    try { sfx.menuSelect(); } catch {}
    ctx.mode = '1p'; ctx.soloChar = _selectedChar; ctx.aiPartner = _aiPartnerFlag;
    ctx.startLevel = levelRow.get();
    _hideCharSelect();
    startGame();
  });
  const btnBack = _makeMenuBtn('BACK', () => {
    try { sfx.menuTick(); } catch {}
    _hideCharSelect();
    // Mobile entered char-select directly from the main menu (no mode chooser).
    if (IS_TOUCH) showMenu();
    else _showModeSelect();
  });

  actionRow.appendChild(btnBegin);
  actionRow.appendChild(btnBack);

  _charEl.appendChild(h);
  _charEl.appendChild(charRow);
  // AI Partner is a split-screen / desktop feature (an AI plays the second hero).
  // Mobile is single-player only, so don't offer the Solo/AI toggle there.
  if (!IS_TOUCH) _charEl.appendChild(partnerWrap);
  _charEl.appendChild(levelRow.wrap);
  _charEl.appendChild(actionRow);
  document.body.appendChild(_charEl);

  // Set a persistent _selected flag + style. mouseleave honors _selected so the
  // gold highlight survives the cursor leaving the button.
  function _styleSelectable(btn, selected) {
    btn._selected = selected;
    btn.classList.toggle('selected', selected);
    // Mirror the selected look inline too. Inline color is the source of truth the
    // E2E reads (style.color === rgb(255,221,85)); literals match the gold tokens.
    btn.style.color = selected ? '#ffdd55' : '';
    btn.style.borderColor = selected ? 'rgba(200,160,0,0.7)' : '';
    btn.style.background = selected ? 'rgba(200,160,0,0.12)' : '';
  }
  function _refreshCharButtons() {
    _styleSelectable(btnMonk, _selectedChar === 'monk');
    _styleSelectable(btnSister, _selectedChar === 'sister');
  }
  function _refreshPartnerButtons() {
    _styleSelectable(btnSolo, !_aiPartnerFlag);
    _styleSelectable(btnAI, _aiPartnerFlag);
  }

  // Store refresh function for re-open
  _charEl._refresh = () => { _refreshCharButtons(); _refreshPartnerButtons(); };
  _refreshCharButtons();
  _refreshPartnerButtons();

  // Keyboard navigation: THE MONK ↔ THE DRAGON SISTER ↔ (SOLO ↔ AI PARTNER) ↔
  // BEGIN ↔ BACK. Enter selects/activates the focused button; Esc backs out.
  const navBtns = [btnMonk, btnSister];
  if (!IS_TOUCH) navBtns.push(btnSolo, btnAI);
  navBtns.push(...levelRow.buttons, btnBegin, btnBack);
  _charEl._navButtons = navBtns;
  _charEl._navOnEscape = () => {
    _hideCharSelect();
    if (IS_TOUCH) showMenu(); else _showModeSelect();
  };
  _installNav(_charEl);
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

// ── Shared LEVEL selector row ─────────────────────────────────────────────
// Lets testers/players jump straight to Level 1 (Zen), 2 (Glacial) or 3 (Venom)
// without clearing the earlier levels first. Returns { wrap, buttons, get } where
// get() yields the chosen level (1-3). Levels 2/3 auto-unlock all dragon forms
// (handled in quest.endIntro). Default selection = 1.
const LEVEL_NAMES = { 1: 'ZEN GARDEN', 2: 'GLACIAL PEAKS', 3: 'VENOM ABYSS' };
function _makeLevelRow(initial = 1) {
  let _lvl = initial;
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;align-items:center;gap:14px;flex-wrap:wrap;justify-content:center;';
  const label = document.createElement('span');
  label.textContent = 'START LEVEL:';
  label.style.cssText = 'color:var(--text-muted);font-size:14px;letter-spacing:3px;';
  wrap.appendChild(label);
  const buttons = [];
  const refresh = () => buttons.forEach((b, i) => {
    const sel = (i + 1) === _lvl;
    b._selected = sel;
    b.classList.toggle('selected', sel);
    b.style.color = sel ? '#ffdd55' : '';
    b.style.borderColor = sel ? 'rgba(200,160,0,0.7)' : '';
    b.style.background = sel ? 'rgba(200,160,0,0.12)' : '';
  });
  [1, 2, 3].forEach(n => {
    const b = _makeMenuBtn(`${n} · ${LEVEL_NAMES[n]}`, () => {
      _lvl = n; try { sfx.menuTick(); } catch {}
      refresh();
    });
    b.style.fontSize = 'clamp(11px,1.3vw,15px)';
    b.style.padding = '6px 14px';
    buttons.push(b);
    wrap.appendChild(b);
  });
  refresh();
  return { wrap, buttons, get: () => _lvl };
}

// ── Shared styled button helper ───────────────────────────────────────────
function _makeMenuBtn(label, fn) {
  const btn = document.createElement('div');
  btn.className = 'mds-btn';
  btn.textContent = label;
  // Only size/tracking here; the panel/button chrome + hover come from .mds-btn.
  btn.style.cssText = 'font-size:clamp(14px,1.8vw,20px);';
  btn.addEventListener('mouseenter', () => {
    try { initAudioOnGesture(); sfx.menuTick(); } catch {}
  });
  btn.addEventListener('mouseleave', () => {
    // Respect a persistent selected state (toggle buttons like character/partner)
    // so leaving the button doesn't wipe the gold "selected" highlight.
    // We set BOTH the shared .selected class (for cohesion) and the inline color
    // (literal hex of --gold-bright; the E2E reads style.color as source of truth).
    btn.classList.toggle('selected', !!btn._selected);
    if (btn._selected) {
      btn.style.color = '#ffdd55';            // --gold-bright
      btn.style.borderColor = 'rgba(200,160,0,0.7)';
      btn.style.background = 'rgba(200,160,0,0.12)';
    } else {
      btn.style.color = '';
      btn.style.borderColor = '';
      btn.style.background = '';
    }
  });
  btn.addEventListener('click', fn);
  return btn;
}

// ── Campaign preview ──────────────────────────────────────────────────────
// Lightweight listing of the 4 elemental lands. Reachable from main menu and
// wired to the complete-screen via _wireCampaignFromComplete() in quest.js.
export function showCampaignPreview(fromComplete = false) {
  if (_campaignEl && _campaignEl.parentNode) {
    _campaignEl.style.display = 'flex';
    return;
  }

  _campaignEl = document.createElement('div');
  _campaignEl.id = 'campaign-preview';
  _campaignEl.className = 'mds-scrim';
  _campaignEl.style.cssText = `
    background:var(--scrim);z-index:170;
    justify-content:flex-start;
    overflow-y:auto;padding:30px 16px 36px;
  `;

  const h = document.createElement('h2');
  h.className = 'mds-heading';
  h.textContent = 'CAMPAIGN — ELEMENTAL LANDS';
  h.style.cssText = 'font-size:clamp(18px,2.5vw,26px);letter-spacing:5px;margin-bottom:6px;';

  const sub = document.createElement('p');
  sub.textContent = 'Master all four dragon forms across four elemental realms.';
  sub.style.cssText = 'color:var(--text-muted);font-size:12px;letter-spacing:1px;margin-bottom:28px;text-align:center;';

  // Element accent colors matching ELEMENT_COLORS (CSS tokens defined in :root)
  const ELEM_CSS = {
    neutral: 'var(--el-neutral)',
    fire:    'var(--el-fire)',
    ice:     'var(--el-ice)',
    poison:  'var(--el-poison)',
    water:   'var(--el-water)',
  };

  const grid = document.createElement('div');
  grid.style.cssText = 'display:flex;flex-direction:column;gap:16px;width:100%;max-width:520px;';

  LANDS.forEach(land => {
    const card = document.createElement('div');
    const accent = ELEM_CSS[land.themeElement] || '#c8a000';
    const playable = !land.comingSoon;
    card.style.cssText = `
      border:1px solid ${playable ? accent : 'rgba(var(--gold-rgb),0.2)'};
      border-radius:6px;
      padding:14px 18px;
      background:${playable ? 'rgba(var(--gold-rgb),0.06)' : 'rgba(30,30,30,0.5)'};
      opacity:${playable ? '1' : '0.65'};
    `;

    const cardTitle = document.createElement('div');
    cardTitle.style.cssText = `display:flex;align-items:baseline;gap:12px;margin-bottom:4px;`;

    const landNum = document.createElement('span');
    landNum.textContent = `LAND ${land.id}`;
    landNum.style.cssText = `color:${accent};font-size:11px;letter-spacing:3px;`;

    const landName = document.createElement('span');
    landName.textContent = land.name;
    landName.style.cssText = `color:${playable ? '#ffdd88' : 'var(--text-dim)'};font-size:clamp(14px,1.8vw,17px);letter-spacing:2px;`;

    const badge = document.createElement('span');
    badge.textContent = playable ? 'PLAYABLE' : 'COMING SOON';
    badge.style.cssText = `
      margin-left:auto;
      font-size:9px;letter-spacing:2px;
      color:${playable ? 'var(--jade)' : '#666'};
      border:1px solid ${playable ? 'rgba(68,255,153,0.5)' : 'rgba(100,100,100,0.3)'};
      border-radius:3px;padding:2px 6px;
    `;

    cardTitle.appendChild(landNum);
    cardTitle.appendChild(landName);
    cardTitle.appendChild(badge);

    const cardSub = document.createElement('div');
    cardSub.textContent = land.subtitle;
    cardSub.style.cssText = `color:var(--text-muted);font-size:11px;font-style:italic;letter-spacing:1px;margin-bottom:6px;`;

    const cardDesc = document.createElement('div');
    cardDesc.textContent = land.description;
    cardDesc.style.cssText = `color:#ccc;font-size:12px;line-height:1.6;margin-bottom:8px;`;

    const cardMeta = document.createElement('div');
    cardMeta.style.cssText = 'display:flex;gap:18px;flex-wrap:wrap;';

    const elemTag = document.createElement('span');
    elemTag.textContent = `Theme: ${land.themeElement.toUpperCase()}`;
    elemTag.style.cssText = `font-size:10px;color:${accent};letter-spacing:2px;`;

    const counterTag = document.createElement('span');
    counterTag.textContent = `Counter: ${land.counterDragon.toUpperCase()} DRAGON`;
    counterTag.style.cssText = `font-size:10px;color:var(--text-dim);letter-spacing:2px;`;

    cardMeta.appendChild(elemTag);
    cardMeta.appendChild(counterTag);

    card.appendChild(cardTitle);
    card.appendChild(cardSub);
    card.appendChild(cardDesc);
    card.appendChild(cardMeta);
    grid.appendChild(card);
  });

  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:16px;margin-top:24px;flex-shrink:0;';
  const backBtn = _makeMenuBtn('BACK', () => {
    try { sfx.menuTick(); } catch {}
    _hideCampaignPreview();
  });
  btnRow.appendChild(backBtn);

  _campaignEl.appendChild(h);
  _campaignEl.appendChild(sub);
  _campaignEl.appendChild(grid);
  _campaignEl.appendChild(btnRow);
  document.body.appendChild(_campaignEl);

  _campaignEl._keyHandler = (e) => {
    if (e.code === 'Escape' || e.code === 'Backspace') {
      e.stopPropagation();
      _hideCampaignPreview();
    }
  };
  document.addEventListener('keydown', _campaignEl._keyHandler);
}

function _hideCampaignPreview() {
  if (_campaignEl) {
    _campaignEl.style.display = 'none';
    if (_campaignEl._keyHandler) {
      document.removeEventListener('keydown', _campaignEl._keyHandler);
      _campaignEl._keyHandler = null;
    }
  }
}

// ── Controls overlay — interactive remapper ───────────────────────────────

// Human-readable labels for each action per player
const _P1_ACTIONS = [
  { action: 'up',     label: 'Move Up'    },
  { action: 'down',   label: 'Move Down'  },
  { action: 'left',   label: 'Move Left'  },
  { action: 'right',  label: 'Move Right' },
  { action: 'attack', label: 'Attack (Light)' },
  { action: 'heavy',  label: 'Heavy Attack' },
  { action: 'block',  label: 'Block / Parry' },
  { action: 'shield', label: 'Chi Shield' },
  { action: 'dodge',  label: 'Dodge / Evade' },
  { action: 'heal',   label: 'Healing Pulse' },
  { action: 'jump',   label: 'Jump (i-frames)' },
  { action: 'lockon', label: 'Lock-on'    },
  { action: 'orbitL', label: 'Camera Left'},
  { action: 'orbitR', label: 'Camera Right'},
];
const _P2_ACTIONS = [
  { action: 'up',        label: 'Move Up'    },
  { action: 'down',      label: 'Move Down'  },
  { action: 'left',      label: 'Move Left'  },
  { action: 'right',     label: 'Move Right' },
  { action: 'attack',    label: 'Attack (Light)' },
  { action: 'heavy',     label: 'Heavy Attack' },
  { action: 'block',     label: 'Block / Parry' },
  { action: 'transform', label: 'Transform'  },
  { action: 'dodge',     label: 'Dodge / Evade' },
  { action: 'special',   label: 'Special'    },
  { action: 'jump',      label: 'Jump (i-frames)' },
  { action: 'lockon',    label: 'Lock-on'    },
  { action: 'orbitL',    label: 'Camera Left'},
  { action: 'orbitR',    label: 'Camera Right'},
];

// Format a codes array into display string
function _codeLabel(codes) {
  if (!codes || codes.length === 0) return '—';
  return codes.map(c => _prettyCode(c)).join(' / ');
}

function _prettyCode(code) {
  return code
    .replace('Arrow', '')
    .replace('Numpad', 'Num')
    .replace('NumpadEnter', 'NumEnt')
    .replace('Key', '')
    .replace('Space', 'Spc')
    .replace('Enter', 'Ent');
}

export function showControls() {
  if (_ctrlEl && _ctrlEl.parentNode) {
    // Rebuild to reflect any binding changes since last open
    document.body.removeChild(_ctrlEl);
    if (_ctrlEl._keyHandler) {
      document.removeEventListener('keydown', _ctrlEl._keyHandler);
    }
    _ctrlEl = null;
  }
  _ctrlEl = document.createElement('div');
  _ctrlEl.id = 'controls-overlay';
  _ctrlEl.className = 'mds-scrim';
  _ctrlEl.style.cssText = `
    z-index:200;
    justify-content:flex-start;
    overflow-y:auto;
    padding:20px 0 30px;
  `;

  const h = document.createElement('h2');
  h.className = 'mds-heading';
  h.textContent = 'CONTROLS & REMAP';
  h.style.cssText = 'font-size:26px;margin-bottom:6px;flex-shrink:0;';

  const hint = document.createElement('p');
  hint.textContent = 'Click an action row to rebind. Press a key to assign. Esc cancels.';
  hint.style.cssText = 'color:var(--text-muted);font-size:11px;margin-bottom:18px;letter-spacing:1px;flex-shrink:0;';

  // ── Touch-only: EDIT TOUCH LAYOUT button (built now, appended in order below) ──
  let _editLayoutBtn = null;
  if (IS_TOUCH) {
    _editLayoutBtn = _makeMenuBtn('✛ EDIT TOUCH LAYOUT', () => {
      try { sfx.menuTick(); } catch {}
      // Lazy import to keep touch.js out of desktop execution path
      import('./touch.js').then(m => {
        if (m.enterTouchLayoutEditor) m.enterTouchLayoutEditor();
      }).catch(() => {});
    });
    _editLayoutBtn.style.marginBottom = '16px';
    _editLayoutBtn.style.letterSpacing = '3px';
    _editLayoutBtn.style.fontSize = 'clamp(13px,1.6vw,16px)';
    _editLayoutBtn.style.flexShrink = '0';
  }

  const cols = document.createElement('div');
  cols.style.cssText = 'display:flex;gap:40px;align-items:flex-start;flex-wrap:wrap;justify-content:center;flex-shrink:0;';

  // Track listening state
  let _listening = null; // { who, action, keyEl } or null

  function _stopListening() {
    if (!_listening) return;
    const { keyEl, who, action } = _listening;
    const codes = (ctx.bindings && ctx.bindings[who] && ctx.bindings[who][action]) || [];
    keyEl.textContent = _codeLabel(codes);
    keyEl.style.background = 'rgba(255,220,0,0.1)';
    keyEl.style.color = 'var(--gold-bright)';
    keyEl.style.borderColor = 'var(--border)';
    _listening = null;
  }

  function _buildCol(who, playerLabel, actions) {
    const col = document.createElement('div');
    col.style.cssText = 'min-width:280px;max-width:320px;';
    const ch = document.createElement('h3');
    ch.textContent = playerLabel;
    ch.style.cssText = 'color:var(--gold);font-size:15px;margin-bottom:14px;border-bottom:1px solid rgba(var(--gold-rgb),0.3);padding-bottom:7px;letter-spacing:2px;';
    col.appendChild(ch);

    actions.forEach(({ action, label }) => {
      const row = document.createElement('div');
      row.style.cssText = `
        display:flex;justify-content:space-between;align-items:center;
        gap:16px;margin-bottom:8px;cursor:pointer;
        padding:4px 6px;border-radius:4px;
        border:1px solid transparent;
        transition:background 0.12s,border-color 0.12s;
      `;
      row.title = 'Click to rebind';
      row.addEventListener('mouseenter', () => {
        if (_listening && _listening.row === row) return;
        row.style.background = 'rgba(var(--gold-rgb),0.07)';
        row.style.borderColor = 'rgba(var(--gold-rgb),0.2)';
      });
      row.addEventListener('mouseleave', () => {
        if (_listening && _listening.row === row) return;
        row.style.background = 'transparent';
        row.style.borderColor = 'transparent';
      });

      const lEl = document.createElement('span');
      lEl.textContent = label;
      lEl.style.cssText = 'color:#ccc;font-size:12px;flex:1;';

      const codes = (ctx.bindings && ctx.bindings[who] && ctx.bindings[who][action]) || [];
      const keyEl = document.createElement('span');
      keyEl.textContent = _codeLabel(codes);
      keyEl.style.cssText = `
        color:var(--gold-bright);font-size:11px;
        background:rgba(255,220,0,0.1);
        padding:2px 8px;border-radius:3px;
        border:1px solid var(--border);
        white-space:nowrap;min-width:60px;text-align:center;
        cursor:pointer;
      `;

      row.appendChild(lEl);
      row.appendChild(keyEl);
      col.appendChild(row);

      row.addEventListener('click', () => {
        // Cancel any previous listening
        _stopListening();
        // Enter listening mode
        _listening = { who, action, keyEl, row };
        keyEl.textContent = 'Press a key…';
        keyEl.style.background = 'rgba(var(--gold-rgb),0.25)';
        keyEl.style.color = '#fff';
        keyEl.style.borderColor = 'var(--gold)';
        row.style.background = 'rgba(var(--gold-rgb),0.12)';
        row.style.borderColor = 'rgba(var(--gold-rgb),0.5)';
      });
    });
    return col;
  }

  cols.appendChild(_buildCol('p1', 'P1 — The Monk', _P1_ACTIONS));
  cols.appendChild(_buildCol('p2', 'P2 — Dragon Sister', _P2_ACTIONS));

  // Reset button + Back
  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:20px;margin-top:20px;flex-shrink:0;';

  const resetBtn = _makeMenuBtn('RESET TO DEFAULTS', () => {
    try { sfx.menuTick(); } catch {}
    resetBindings();
    // Rebuild overlay to reflect defaults
    showControls();
  });
  const backBtn = _makeMenuBtn('BACK', () => {
    try { sfx.menuTick(); } catch {}
    hideControls();
  });
  btnRow.appendChild(resetBtn);
  btnRow.appendChild(backBtn);

  const esc = document.createElement('p');
  esc.textContent = 'Esc / Backspace — Back  ·  M — Mute  ·  Global: Esc = Pause (not remappable)';
  esc.style.cssText = 'color:var(--text-faint);font-size:10px;margin-top:14px;letter-spacing:1px;flex-shrink:0;';

  _ctrlEl.appendChild(h);
  _ctrlEl.appendChild(hint);
  if (_editLayoutBtn) _ctrlEl.appendChild(_editLayoutBtn); // touch-only layout editor entry
  _ctrlEl.appendChild(cols);
  _ctrlEl.appendChild(btnRow);
  _ctrlEl.appendChild(esc);
  document.body.appendChild(_ctrlEl);

  // Single keydown listener — captures rebind OR handles Back
  _ctrlEl._keyHandler = (e) => {
    if (_listening) {
      // Capture for rebind
      e.stopPropagation();
      e.preventDefault();
      if (e.code === 'Escape') {
        // Cancel — restore old label
        _stopListening();
        return;
      }
      // Assign new binding
      const { who, action, keyEl, row } = _listening;
      if (ctx.bindings && ctx.bindings[who]) {
        ctx.bindings[who][action] = [e.code];
        saveBindings();
      }
      _listening = null;
      keyEl.textContent = _codeLabel([e.code]);
      keyEl.style.background = 'rgba(255,220,0,0.1)';
      keyEl.style.color = 'var(--gold-bright)';
      keyEl.style.borderColor = 'var(--border)';
      row.style.background = 'transparent';
      row.style.borderColor = 'transparent';
      try { sfx.menuTick(); } catch {}
      return;
    }
    // Not listening — handle navigation
    if (e.code === 'Escape' || e.code === 'Backspace') {
      e.stopPropagation();
      hideControls();
    }
  };
  document.addEventListener('keydown', _ctrlEl._keyHandler);
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
  _pauseEl.className = 'mds-scrim';
  _pauseEl.style.cssText = 'background:var(--scrim-soft);z-index:180;';
  const h = document.createElement('h2');
  h.className = 'mds-heading';
  h.textContent = 'PAUSED';
  h.style.cssText = 'font-size:40px;letter-spacing:8px;margin-bottom:30px;';

  const resume  = _makePauseBtn('RESUME', () => resumeGame());

  // View/edit controls without leaving the game (overlays the pause screen).
  const ctrlBtn = _makePauseBtn('CONTROLS', () => { showControls(); });

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
  _pauseEl.appendChild(ctrlBtn);
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
  btn.className = 'mds-btn';
  btn.textContent = label;
  // .mds-btn provides the chrome + hover/selected; pause buttons are a touch
  // larger with extra vertical rhythm.
  btn.style.cssText = 'font-size:18px;padding:10px 30px;margin:8px;';
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
