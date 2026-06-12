// src/ui/hud.js — all HUD update/build functions, damage numbers, toasts
import * as THREE from 'three';
import { ctx } from '../state.js';
import { XP_TO_LEVEL, FORM_DATA, getElementMult } from '../config.js';

// ---- Toast ----
export function showToast(msg, duration = 2200) {
  const c = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  c.appendChild(el);
  setTimeout(() => el.remove(), duration);
}

// ---- Damage numbers ----
// Imported lazily by spirits.js to avoid circular dep; exported directly.
export function elementToCSS(el) {
  const map = { neutral: '#cccccc', fire: '#ff6633', ice: '#88ddff', poison: '#cc44ff', water: '#4488ff' };
  return map[el] || '#ffffff';
}

// _fxTimers reference injected lazily to avoid circular dep
let _fxTimersRef = null;
export function setFxTimersRef(arr) { _fxTimersRef = arr; }

export function showDamageNumber(worldPos, amount, element, mult) {
  try {
    const container = document.getElementById('damage-container');
    if (!container) return;
    const w = window.innerWidth, h = window.innerHeight;
    const halfW = w / 2;
    const text = (mult >= 2 ? '★ ' : '') + amount + (mult >= 2 ? ' Effective!' : '');
    const cls = 'dmg-num' + (mult >= 2 ? ' effective' : '');
    const col = elementToCSS(element);

    const camList = [
      { cam: ctx.cameras.p1, offsetX: 0,     viewW: halfW },
      { cam: ctx.cameras.p2, offsetX: halfW,  viewW: halfW },
    ];
    camList.forEach(({ cam, offsetX, viewW }) => {
      const v = worldPos.clone().project(cam);
      if (v.z > 1) return;
      const sx = (v.x * 0.5 + 0.5) * viewW;
      const sy = (-v.y * 0.5 + 0.5) * h;
      if (sx < 5 || sx > viewW - 5) return;
      if (sy < 5 || sy > h - 5) return;
      const el = document.createElement('div');
      el.className = cls;
      el.textContent = text;
      el.style.cssText = `left:${offsetX + sx}px;top:${sy}px;color:${col};position:absolute;`;
      container.appendChild(el);
      const tid = setTimeout(() => { if (el.parentNode) el.remove(); }, 1300);
      if (_fxTimersRef) _fxTimersRef.push(tid);
    });
  } catch (e) { /* ignore projection errors */ }
}

// ---- HUD update ----

// FIX E: HUD DOM nodes built once, only state-updated
const _hudCache = {
  formBtns: null,
  relicRows: {},
  relicCounts: { p1: 0, p2: 0 },
  p1Icons: null,
  p2Icons: null,
};

export function updateHUD() {
  const p1 = ctx.gameState && ctx.gameState.p1;
  const p2 = ctx.gameState && ctx.gameState.p2;
  if (!p1 || !p2) return;

  const p1Pct = Math.max(0, p1.hp / p1.maxHp) * 100;
  const p1El = document.getElementById('hp-p1');
  if (p1El) p1El.style.width = p1Pct + '%';
  const p1Txt = document.getElementById('hp-text-p1');
  if (p1Txt) p1Txt.textContent = `${Math.ceil(p1.hp)}/${p1.maxHp}`;
  const p1Lvl = document.getElementById('level-p1');
  if (p1Lvl) p1Lvl.textContent = 'L' + p1.level;

  const p1XpEl = document.getElementById('xp-p1');
  if (p1XpEl) {
    const needed = XP_TO_LEVEL[Math.min(p1.level + 1, 10)] - (XP_TO_LEVEL[p1.level] || 0);
    const current = p1.xp - (XP_TO_LEVEL[p1.level] || 0);
    p1XpEl.style.width = Math.min(100, needed > 0 ? current / needed * 100 : 100) + '%';
  }

  const p2Pct = Math.max(0, p2.hp / p2.maxHp) * 100;
  const p2El = document.getElementById('hp-p2');
  if (p2El) p2El.style.width = p2Pct + '%';
  const p2Txt = document.getElementById('hp-text-p2');
  if (p2Txt) p2Txt.textContent = `${Math.ceil(p2.hp)}/${p2.maxHp}`;
  const p2Lvl = document.getElementById('level-p2');
  if (p2Lvl) p2Lvl.textContent = 'L' + p2.level;

  const p2XpEl = document.getElementById('xp-p2');
  if (p2XpEl) {
    const needed = XP_TO_LEVEL[Math.min(p2.level + 1, 10)] - (XP_TO_LEVEL[p2.level] || 0);
    const current = p2.xp - (XP_TO_LEVEL[p2.level] || 0);
    p2XpEl.style.width = Math.min(100, needed > 0 ? current / needed * 100 : 100) + '%';
  }

  updateFormStrip();
  updateRelicIcons();
  updateAbilityIcons();
  updateAdvantageChip();
}

function _buildFormStrip() {
  const strip = document.getElementById('form-strip-p2');
  if (!strip) return;
  strip.innerHTML = '';
  _hudCache.formBtns = {};
  const forms = ['human', 'fire', 'ice', 'poison', 'water'];
  const icons = { human: '👤', fire: '🔥', ice: '❄', poison: '☠', water: '💧' };
  forms.forEach(f => {
    const btn = document.createElement('div');
    btn.className = 'form-btn';
    btn.textContent = icons[f] || f[0];
    btn.title = FORM_DATA[f].name;
    strip.appendChild(btn);
    _hudCache.formBtns[f] = btn;
  });
}

function updateFormStrip() {
  if (!_hudCache.formBtns) _buildFormStrip();
  if (!_hudCache.formBtns) return;
  const p2 = ctx.gameState && ctx.gameState.p2;
  if (!p2) return;
  const forms = ['human', 'fire', 'ice', 'poison', 'water'];
  forms.forEach(f => {
    const btn = _hudCache.formBtns[f];
    if (!btn) return;
    btn.classList.toggle('active', f === p2.form);
    btn.classList.toggle('locked', !p2.unlockedForms.includes(f));
  });
}

function updateRelicIcons() {
  ['p1', 'p2'].forEach(pid => {
    const el = document.getElementById('relics-' + pid);
    if (!el) return;
    const player = pid === 'p1' ? ctx.gameState.p1 : ctx.gameState.p2;
    if (!player) return;
    if (player.relics.length === _hudCache.relicCounts[pid]) return;
    _hudCache.relicCounts[pid] = player.relics.length;
    el.innerHTML = '';
    player.relics.forEach(r => {
      const icon = document.createElement('div');
      icon.className = 'relic-icon';
      icon.title = r;
      const relicIcons = { 'Prayer Beads': '📿', 'Dragon Pearl': '🔮', 'Saffron Robe': '🧣' };
      icon.textContent = relicIcons[r] || r[0];
      el.appendChild(icon);
    });
  });
}

const _p1AbilitySpec = [
  { name: 'Attack', key: 'I/Spc', maxCd: 0.3,  cdProp: '_attackCd' },
  { name: 'Shield', key: 'J',     maxCd: 8,     cdProp: '_shieldCd' },
  { name: 'Dodge',  key: 'K',     maxCd: 2,     cdProp: '_dodgeCd'  },
  { name: 'Heal',   key: 'L',     maxCd: 10,    cdProp: '_healCd'   },
];
const _p2AbilitySpec = [
  { name: 'Attack',    key: 'Ent/8', maxCd: 0.35, cdProp: '_attackCd'    },
  { name: 'Transform', key: 'Num4',  maxCd: 1,    cdProp: '_transformCd' },
  { name: 'Dodge',     key: 'Num5',  maxCd: 2,    cdProp: '_dodgeCd'     },
  { name: 'Special',   key: 'Num6',  maxCd: 8,    cdProp: '_specialCd'   },
];

function _buildAbilityRow(rowEl, spec) {
  rowEl.innerHTML = '';
  return spec.map(a => {
    const icon = document.createElement('div');
    icon.className = 'ability-icon';
    const label = document.createElement('span');
    label.textContent = a.name;
    const keyChip = document.createElement('span');
    keyChip.className = 'key-chip';
    keyChip.textContent = a.key;
    const overlay = document.createElement('div');
    overlay.className = 'cd-overlay';
    overlay.style.height = '0%';
    icon.appendChild(label);
    icon.appendChild(keyChip);
    icon.appendChild(overlay);
    rowEl.appendChild(icon);
    return { overlayEl: overlay };
  });
}

function updateAbilityIcons() {
  const p1AbRow = document.getElementById('abilities-p1');
  const p2AbRow = document.getElementById('abilities-p2');
  if (!p1AbRow || !p2AbRow) return;
  const p1 = ctx.gameState.p1, p2 = ctx.gameState.p2;
  if (!p1 || !p2) return;

  if (!_hudCache.p1Icons) _hudCache.p1Icons = _buildAbilityRow(p1AbRow, _p1AbilitySpec);
  if (!_hudCache.p2Icons) _hudCache.p2Icons = _buildAbilityRow(p2AbRow, _p2AbilitySpec);

  _p1AbilitySpec.forEach((a, i) => {
    const cd = Math.max(0, p1[a.cdProp] || 0);
    _hudCache.p1Icons[i].overlayEl.style.height = Math.min(100, cd / a.maxCd * 100) + '%';
  });
  _p2AbilitySpec.forEach((a, i) => {
    const cd = Math.max(0, p2[a.cdProp] || 0);
    _hudCache.p2Icons[i].overlayEl.style.height = Math.min(100, cd / a.maxCd * 100) + '%';
  });
}

function updateAdvantageChip() {
  const chip = document.getElementById('advantage-p2');
  if (!chip) return;
  const p2 = ctx.gameState && ctx.gameState.p2;
  if (!p2 || p2.form === 'human') { chip.innerHTML = ''; return; }
  const elem = p2.getElement();
  let nearest = null, nearDist = Infinity;
  ctx.gameState.spirits.forEach(s => {
    if (!s.alive) return;
    const d = p2.pos.distanceTo(s.pos);
    if (d < nearDist) { nearDist = d; nearest = s; }
  });
  if (!nearest) { chip.innerHTML = ''; return; }
  const mult = getElementMult(elem, nearest.element);
  const cls = mult >= 2 ? 'strong' : mult <= 0.5 ? 'weak' : 'neutral';
  const sym = mult >= 2 ? '▲ Effective' : mult <= 0.5 ? '▼ Weak' : '● Neutral';
  chip.innerHTML = `<span class="advantage-chip ${cls}">${sym} vs ${nearest.element}</span>`;
}

export function updateObjective() {
  const state = ctx.gameState && ctx.gameState.state;
  const alive = ctx.gameState ? ctx.gameState.spirits.filter(s => s.alive).length : 0;
  const total = ctx.gameState ? ctx.gameState.spirits.length : 0;
  let txt = '';
  if (state === 'INTRO')     txt = 'Awaiting the storm…';
  else if (state === 'WAVE1') txt = `Wave 1: Spirits ${alive}/${total}`;
  else if (state === 'WAVE2') txt = `Wave 2: Ice Imps ${alive}/${total}`;
  else if (state === 'WAVE3') txt = `Wave 3: Water Wraiths ${alive}/${total}`;
  else if (state === 'WAVE4') txt = 'Wave 4: BOSS';
  else if (state === 'COMPLETE') txt = 'Garden Cleansed!';

  const o1 = document.getElementById('objective-p1');
  const o2 = document.getElementById('objective-p2');
  if (o1) o1.textContent = txt;
  if (o2) o2.textContent = txt;
}
