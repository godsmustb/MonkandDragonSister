// src/ui/hud.js — HUD v2 (Pass 6): Genshin-style player plates, ability clusters,
//   boss bar, wave banners, KO overlays, revive rings, damage/heal numbers.
//   Build-once / update-only pattern: no innerHTML rebuilds in the game loop.
import * as THREE from 'three';
import { ctx } from '../state.js';
import { XP_TO_LEVEL, FORM_DATA, getElementMult } from '../config.js';
import { sfx } from '../audio/audio.js';

// ────────────────────────────────────────────────────────────────────────────
// ELEMENT → CSS COLOR
// ────────────────────────────────────────────────────────────────────────────
export function elementToCSS(el) {
  const map = {
    neutral: '#cccccc',
    fire:    '#ff6633',
    ice:     '#88ddff',
    poison:  '#cc44ff',
    water:   '#4499ff',
  };
  return map[el] || '#ffffff';
}

// ────────────────────────────────────────────────────────────────────────────
// FX TIMERS REF (injected lazily to avoid circular dep)
// ────────────────────────────────────────────────────────────────────────────
let _fxTimersRef = null;
export function setFxTimersRef(arr) { _fxTimersRef = arr; }

// ────────────────────────────────────────────────────────────────────────────
// TOAST / UNLOCK NOTIFICATION
// ────────────────────────────────────────────────────────────────────────────
// side: undefined/'center' = shared centre column (global events like waves/bosses);
// 'p1'/'p2' (or 1/2) = that player's half of the split screen. In 1P (single
// full-screen view) everything routes to the centre column.
export function showToast(msg, duration = 2300, variant = '', side) {
  let containerId = 'toast-container';
  if (side && ctx.mode !== '1p') {
    if (side === 'p1' || side === 1) containerId = 'toast-container-p1';
    else if (side === 'p2' || side === 2) containerId = 'toast-container-p2';
  }
  const c = document.getElementById(containerId) || document.getElementById('toast-container');
  if (!c) return;
  const el = document.createElement('div');
  el.className = 'toast' + (variant ? ' ' + variant : '');
  el.textContent = msg;
  c.appendChild(el);
  const tid = setTimeout(() => { if (el.parentNode) el.remove(); }, duration);
  if (_fxTimersRef) _fxTimersRef.push(tid);
}

// Convenience: a notification that belongs to a specific player (id 1 or 2),
// rendered on that player's side of the split screen.
export function showPlayerToast(playerId, msg, duration = 2300, variant = '') {
  showToast(msg, duration, variant, 'p' + playerId);
}

// ────────────────────────────────────────────────────────────────────────────
// WAVE BANNER
// ────────────────────────────────────────────────────────────────────────────
const WAVE_BANNER_DATA = {
  WAVE1: { title: 'WAVE I',   sub: 'Shadowlings approach' },
  WAVE2: { title: 'WAVE II',  sub: 'Frost Imps — Ice element' },
  WAVE3: { title: 'WAVE III', sub: 'Tide Wraiths — Water element' },
  WAVE4: { title: 'WAVE IV',  sub: 'Venom Oni — Mini-boss' },
  WAVE5: { title: 'WAVE V',   sub: 'Inferno Demon Lord — Final Boss' },
  // Level 2 wave banners
  L2WAVE1: { title: 'WAVE I',   sub: 'Frost Imps — Glacial Peaks' },
  L2WAVE2: { title: 'WAVE II',  sub: 'Frost & Shadow mixed assault' },
  L2WAVE3: { title: 'WAVE III', sub: 'Ice & Water combined force' },
  L2WAVE4: { title: 'WAVE IV',  sub: 'Frost Warlord — Scaled Mini-boss' },
  L2WAVE5: { title: 'WAVE V',   sub: 'Glacial Inferno Lord — Final Boss' },
  // Level 3 wave banners
  L3WAVE1: { title: 'WAVE I',   sub: 'Poison Scouts — Venom Abyss' },
  L3WAVE2: { title: 'WAVE II',  sub: 'Poison & Water mixed assault' },
  L3WAVE3: { title: 'WAVE III', sub: 'Tide Wraiths + Poison swarm' },
  L3WAVE4: { title: 'WAVE IV',  sub: 'Plague Oni — Scaled Mini-boss' },
  L3WAVE5: { title: 'WAVE V',   sub: 'Abyssal Demon Lord — Final Boss' },
};

export function showWaveBanner(state) {
  const data = WAVE_BANNER_DATA[state];
  if (!data) return;
  try { sfx.waveBanner(); } catch {}
  const banner = document.getElementById('wave-banner');
  if (!banner) return;
  const titleEl = document.getElementById('wave-banner-title');
  const subEl   = document.getElementById('wave-banner-sub');
  if (!titleEl || !subEl) return;
  titleEl.textContent = data.title;
  subEl.textContent   = data.sub;
  titleEl.classList.remove('animate-in','animate-out');
  banner.style.display = 'flex';
  // Force reflow then animate
  void banner.offsetWidth;
  titleEl.classList.add('animate-in');
  setTimeout(() => {
    titleEl.classList.remove('animate-in');
    titleEl.classList.add('animate-out');
    setTimeout(() => {
      banner.style.display = 'none';
      titleEl.classList.remove('animate-out');
    }, 400);
  }, 2200);
}

// ────────────────────────────────────────────────────────────────────────────
// CINEMATIC NAME BANNER (Pass 16) — reuses the wave-banner DOM for one-off
// awakening / ultimate / boss-phase name flashes. Custom title + subtitle.
// ────────────────────────────────────────────────────────────────────────────
export function showBanner(title, sub, color) {
  const banner = document.getElementById('wave-banner');
  if (!banner) return;
  const titleEl = document.getElementById('wave-banner-title');
  const subEl   = document.getElementById('wave-banner-sub');
  if (!titleEl || !subEl) return;
  try { sfx.waveBanner(); } catch {}
  titleEl.textContent = title || '';
  subEl.textContent   = sub || '';
  if (color) { titleEl.style.color = color; titleEl.style.textShadow = `0 0 24px ${color}`; }
  else       { titleEl.style.color = ''; titleEl.style.textShadow = ''; }
  titleEl.classList.remove('animate-in','animate-out');
  banner.style.display = 'flex';
  void banner.offsetWidth;
  titleEl.classList.add('animate-in');
  setTimeout(() => {
    titleEl.classList.remove('animate-in');
    titleEl.classList.add('animate-out');
    setTimeout(() => {
      banner.style.display = 'none';
      titleEl.classList.remove('animate-out');
      titleEl.style.color = '';
      titleEl.style.textShadow = '';
    }, 400);
  }, 2200);
}

// ────────────────────────────────────────────────────────────────────────────
// DAMAGE / HEAL NUMBERS
// ────────────────────────────────────────────────────────────────────────────
export function showDamageNumber(worldPos, amount, element, mult) {
  try {
    const container = document.getElementById('damage-container');
    if (!container) return;
    const w = window.innerWidth, h = window.innerHeight;
    const halfW = w / 2;
    const isHeal  = element === 'heal';
    const isCrit  = !isHeal && mult >= 2;
    const text    = (isCrit ? '★ ' : '') + amount + (isCrit ? ' !' : '');
    const col     = isHeal ? '#44ff99' : elementToCSS(element);
    const baseCls = isHeal ? 'dmg-num heal' : ('dmg-num' + (isCrit ? ' effective' : ''));

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
      if (sy < 5 || sy > h - 5)    return;
      const el = document.createElement('div');
      el.className = baseCls;
      el.textContent = text;
      el.style.cssText = `left:${(offsetX + sx + (Math.random()-0.5)*18).toFixed(0)}px;top:${sy.toFixed(0)}px;color:${col};position:absolute;`;
      container.appendChild(el);
      const dur = isCrit ? 1550 : isHeal ? 1150 : 1250;
      const tid = setTimeout(() => { if (el.parentNode) el.remove(); }, dur);
      if (_fxTimersRef) _fxTimersRef.push(tid);
    });
  } catch (e) { /* ignore projection errors */ }
}

// ────────────────────────────────────────────────────────────────────────────
// PORTRAIT CANVAS — draw-once per form change
// ────────────────────────────────────────────────────────────────────────────
const FORM_ELEMENT_COLORS = {
  human:  { bg: '#1a1008', accent: '#e8b84b' },   // monk warm gold
  fire:   { bg: '#1a0800', accent: '#ff6633' },
  ice:    { bg: '#001520', accent: '#88ddff' },
  poison: { bg: '#120020', accent: '#cc44ff' },
  water:  { bg: '#001040', accent: '#4499ff' },
};

function _drawMonkPortrait(canvas) {
  const s = canvas.width;
  const c = canvas.getContext('2d');
  c.clearRect(0, 0, s, s);
  // Background
  const bg = c.createRadialGradient(s/2,s/2,2,s/2,s/2,s/2);
  bg.addColorStop(0,'#2a1c08'); bg.addColorStop(1,'#0e0903');
  c.fillStyle = bg; c.beginPath(); c.arc(s/2,s/2,s/2,0,Math.PI*2); c.fill();
  // Saffron robe body
  c.fillStyle = '#c8700a';
  c.beginPath(); c.ellipse(s/2, s*0.72, s*0.28, s*0.22, 0, 0, Math.PI*2); c.fill();
  // Head
  c.fillStyle = '#d4a470';
  c.beginPath(); c.arc(s/2, s*0.38, s*0.22, 0, Math.PI*2); c.fill();
  // Shaved head highlight
  c.fillStyle = 'rgba(255,200,140,0.35)';
  c.beginPath(); c.arc(s*0.44, s*0.30, s*0.10, 0, Math.PI*2); c.fill();
  // Eyes
  c.fillStyle = '#241a22';
  c.beginPath(); c.arc(s*0.42, s*0.40, s*0.035, 0, Math.PI*2); c.fill();
  c.beginPath(); c.arc(s*0.58, s*0.40, s*0.035, 0, Math.PI*2); c.fill();
  // Mouth
  c.strokeStyle = '#7a4a28'; c.lineWidth = 1.2;
  c.beginPath(); c.arc(s/2, s*0.46, s*0.05, 0.2, Math.PI-0.2); c.stroke();
  // Gold rim
  c.strokeStyle = '#e8b84b'; c.lineWidth = 1.5;
  c.beginPath(); c.arc(s/2,s/2,s/2-1,0,Math.PI*2); c.stroke();
}

function _drawSisterPortrait(canvas, form) {
  const s = canvas.width;
  const c = canvas.getContext('2d');
  const pal = FORM_ELEMENT_COLORS[form] || FORM_ELEMENT_COLORS.human;
  c.clearRect(0,0,s,s);
  // Background
  const bg = c.createRadialGradient(s/2,s/2,2,s/2,s/2,s/2);
  bg.addColorStop(0, pal.bg); bg.addColorStop(1,'#050408');
  c.fillStyle = bg; c.beginPath(); c.arc(s/2,s/2,s/2,0,Math.PI*2); c.fill();
  if (form === 'human') {
    // Teal dress
    c.fillStyle = '#1e8090';
    c.beginPath(); c.ellipse(s/2, s*0.74, s*0.26, s*0.20, 0, 0, Math.PI*2); c.fill();
    // Head
    c.fillStyle = '#e0c8a0';
    c.beginPath(); c.arc(s/2, s*0.38, s*0.20, 0, Math.PI*2); c.fill();
    // Hair — dark with teal sheen
    c.fillStyle = '#1a1a30';
    c.beginPath(); c.arc(s/2, s*0.32, s*0.22, Math.PI, 0); c.fill();
    c.fillStyle = '#2e4060';
    c.beginPath(); c.arc(s*0.28, s*0.42, s*0.12, Math.PI*0.3, Math.PI*1.2); c.fill();
    c.beginPath(); c.arc(s*0.72, s*0.42, s*0.12, -Math.PI*0.2, Math.PI*0.8); c.fill();
    // Eyes (bigger anime style)
    c.fillStyle = '#46D6E0';
    c.beginPath(); c.ellipse(s*0.41, s*0.40, s*0.045, s*0.06, 0, 0, Math.PI*2); c.fill();
    c.beginPath(); c.ellipse(s*0.59, s*0.40, s*0.045, s*0.06, 0, 0, Math.PI*2); c.fill();
    c.fillStyle = '#fff'; c.globalAlpha=0.7;
    c.beginPath(); c.arc(s*0.415, s*0.375, s*0.015, 0, Math.PI*2); c.fill();
    c.beginPath(); c.arc(s*0.595, s*0.375, s*0.015, 0, Math.PI*2); c.fill();
    c.globalAlpha=1;
  } else {
    // Dragon form — scales + horn
    c.fillStyle = pal.accent + 'aa';
    c.beginPath(); c.ellipse(s/2, s*0.72, s*0.28, s*0.22, 0, 0, Math.PI*2); c.fill();
    c.fillStyle = pal.accent + '55';
    c.beginPath(); c.arc(s/2, s*0.38, s*0.22, 0, Math.PI*2); c.fill();
    // Scales pattern
    c.fillStyle = pal.accent + '88';
    for (let i=0;i<3;i++) for(let j=0;j<3;j++) {
      c.beginPath();
      c.arc(s*(0.34+i*0.16), s*(0.60+j*0.11), s*0.04, 0, Math.PI*2);
      c.fill();
    }
    // Horn
    c.fillStyle = pal.accent;
    c.beginPath();
    c.moveTo(s/2, s*0.12); c.lineTo(s*0.44, s*0.28); c.lineTo(s*0.56, s*0.28); c.closePath();
    c.fill();
    // Glow eyes
    c.fillStyle = pal.accent;
    c.shadowColor = pal.accent; c.shadowBlur = 6;
    c.beginPath(); c.arc(s*0.40, s*0.40, s*0.04, 0, Math.PI*2); c.fill();
    c.beginPath(); c.arc(s*0.60, s*0.40, s*0.04, 0, Math.PI*2); c.fill();
    c.shadowBlur=0;
  }
  // Accent rim matching element
  c.strokeStyle = pal.accent; c.lineWidth = 1.8;
  c.beginPath(); c.arc(s/2,s/2,s/2-1,0,Math.PI*2); c.stroke();
}

// ────────────────────────────────────────────────────────────────────────────
// ABILITY GLYPH CANVASES — draw-once
// ────────────────────────────────────────────────────────────────────────────
function _drawGlyph(canvas, type, color) {
  const s = canvas.width;
  const c = canvas.getContext('2d');
  c.clearRect(0,0,s,s);
  c.strokeStyle = color || '#e8c86a';
  c.fillStyle   = color || '#e8c86a';
  c.lineCap = 'round'; c.lineJoin = 'round';
  const h = s/2;
  switch (type) {
    case 'staff': // P1 attack — vertical staff with rings
      c.lineWidth=2;
      c.beginPath(); c.moveTo(h,4); c.lineTo(h,s-4); c.stroke();
      c.lineWidth=1.5;
      c.beginPath(); c.arc(h,8,4,0,Math.PI*2); c.stroke();
      c.beginPath(); c.arc(h,h-2,3,0,Math.PI*2); c.stroke();
      c.lineWidth=2;
      c.beginPath(); c.moveTo(h-6,s*0.7); c.lineTo(h+6,s*0.7); c.stroke();
      break;
    case 'shield': // P1 shield — chi bubble
      c.lineWidth=2;
      c.beginPath(); c.arc(h,h,s*0.38,0,Math.PI*2); c.stroke();
      c.globalAlpha=0.18; c.beginPath(); c.arc(h,h,s*0.38,0,Math.PI*2); c.fill(); c.globalAlpha=1;
      c.lineWidth=1;
      c.beginPath(); c.arc(h,h,s*0.22,0,Math.PI*2); c.stroke();
      break;
    case 'boot': // dodge — running boot silhouette
      c.lineWidth=2;
      c.beginPath();
      c.moveTo(s*0.3,s*0.35);c.lineTo(s*0.7,s*0.28);c.lineTo(s*0.75,s*0.5);
      c.lineTo(s*0.5,s*0.68);c.lineTo(s*0.25,s*0.70);c.closePath();
      c.stroke();
      // Speed lines
      c.lineWidth=1; c.globalAlpha=0.5;
      c.beginPath();c.moveTo(s*0.08,s*0.42);c.lineTo(s*0.28,s*0.42);c.stroke();
      c.beginPath();c.moveTo(s*0.05,s*0.55);c.lineTo(s*0.22,s*0.55);c.stroke();
      c.globalAlpha=1;
      break;
    case 'lotus': // P1 heal — 4-petal lotus
      c.lineWidth=1.5;
      for (let a=0;a<4;a++) {
        c.save(); c.translate(h,h); c.rotate(a*Math.PI/2);
        c.beginPath(); c.ellipse(0,-s*0.22,s*0.10,s*0.18,0,0,Math.PI*2);
        c.stroke(); c.restore();
      }
      c.beginPath(); c.arc(h,h,s*0.09,0,Math.PI*2); c.fill();
      break;
    case 'claw': // P2 attack — dragon claw slashes
      c.lineWidth=2.2;
      [[-0.18,-0.32,0.28,0.18],[-0.06,-0.36,0.18,0.28],[0.08,-0.34,0.08,0.32]].forEach(([x1,y1,x2,y2]) => {
        c.beginPath();
        c.moveTo(h+x1*s, h+y1*s); c.lineTo(h+x2*s, h+y2*s);
        c.stroke();
      });
      break;
    case 'yinyang': // P2 transform
      c.lineWidth=2;
      c.beginPath(); c.arc(h,h,s*0.38,0,Math.PI*2); c.stroke();
      // Yin half
      c.globalAlpha=0.6;
      c.beginPath(); c.arc(h,h,s*0.38,Math.PI*1.5,Math.PI*0.5); c.arc(h,h-s*0.19,s*0.19,Math.PI*0.5,Math.PI*1.5,true); c.arc(h,h+s*0.19,s*0.19,Math.PI*1.5,Math.PI*0.5); c.fill();
      c.globalAlpha=1;
      // Dots
      c.fillStyle='rgba(0,0,0,0.7)'; c.beginPath(); c.arc(h,h-s*0.19,s*0.06,0,Math.PI*2); c.fill();
      c.fillStyle=color||'#e8c86a'; c.beginPath(); c.arc(h,h+s*0.19,s*0.06,0,Math.PI*2); c.fill();
      break;
    case 'star': // P2 special — element star burst
      c.lineWidth=1.5;
      for (let i=0;i<6;i++) {
        const a=i*Math.PI/3;
        c.beginPath();
        c.moveTo(h+Math.cos(a)*s*0.12, h+Math.sin(a)*s*0.12);
        c.lineTo(h+Math.cos(a)*s*0.38, h+Math.sin(a)*s*0.38);
        c.stroke();
      }
      c.beginPath(); c.arc(h,h,s*0.12,0,Math.PI*2); c.fill();
      break;
    case 'heavy': // heavy attack — downward slam chevron + impact
      c.lineWidth=2.4;
      c.beginPath();
      c.moveTo(s*0.28,s*0.22); c.lineTo(h,s*0.5); c.lineTo(s*0.72,s*0.22);
      c.stroke();
      c.beginPath();
      c.moveTo(s*0.32,s*0.42); c.lineTo(h,s*0.66); c.lineTo(s*0.68,s*0.42);
      c.stroke();
      // impact burst dots
      c.lineWidth=1.4;
      c.beginPath();c.moveTo(s*0.18,s*0.74);c.lineTo(s*0.28,s*0.8);c.stroke();
      c.beginPath();c.moveTo(s*0.82,s*0.74);c.lineTo(s*0.72,s*0.8);c.stroke();
      break;
    case 'block': // block/parry — shield with vertical guard line
      c.lineWidth=2;
      c.beginPath();
      c.moveTo(h,s*0.16);
      c.lineTo(s*0.74,s*0.3);
      c.lineTo(s*0.7,s*0.62);
      c.lineTo(h,s*0.84);
      c.lineTo(s*0.3,s*0.62);
      c.lineTo(s*0.26,s*0.3);
      c.closePath(); c.stroke();
      c.lineWidth=1.5;
      c.beginPath(); c.moveTo(h,s*0.3); c.lineTo(h,s*0.68); c.stroke();
      break;
    default:
      c.font = `${s*0.55}px Georgia`;
      c.textAlign='center'; c.textBaseline='middle';
      c.fillText(type[0].toUpperCase(), h, h+1);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// OBJECTIVE ICON (quest marker)
// ────────────────────────────────────────────────────────────────────────────
function _drawObjIcon(canvas, kills, total) {
  const s = canvas.width;
  const c = canvas.getContext('2d');
  c.clearRect(0,0,s,s);
  const done = kills >= total && total > 0;
  c.fillStyle = done ? '#44ff99' : '#e8c86a';
  // Diamond quest marker
  c.save(); c.translate(s/2,s/2); c.rotate(Math.PI/4);
  c.fillRect(-4,-4,8,8);
  c.restore();
}

// ────────────────────────────────────────────────────────────────────────────
// HUD CACHE — build-once references
// ────────────────────────────────────────────────────────────────────────────
const _hud = {
  built: false,
  // Portraits
  portraitP1: null,  // canvas el
  portraitP2: null,
  _p2LastForm: null, // track form changes for portrait redraw

  // Ability icons cache
  p1Icons: null,   // array of { iconEl, glyphCanvas, cdConic, glyphType }
  p2Icons: null,

  // Form strip diamonds
  formDiamonds: null,  // { human, fire, ice, poison, water } → el

  // Relic rows
  relicCounts: { p1: 0, p2: 0 },

  // Ghost HP (trailing bar)
  ghostTimers: { p1: null, p2: null },
  ghostPct: { p1: 100, p2: 100 },

  // KO state (track to avoid DOM thrash)
  koState: { p1: false, p2: false },
};

// ────────────────────────────────────────────────────────────────────────────
// BUILD ONCE (called from updateHUD first time)
// ────────────────────────────────────────────────────────────────────────────
function _buildHUD() {
  if (_hud.built) return;
  _hud.built = true;

  // Portraits
  _hud.portraitP1 = document.getElementById('portrait-p1');
  _hud.portraitP2 = document.getElementById('portrait-p2');
  if (_hud.portraitP1) _drawMonkPortrait(_hud.portraitP1);
  if (_hud.portraitP2) _drawSisterPortrait(_hud.portraitP2, 'human');
  _hud._p2LastForm = 'human';

  // Build ability rows
  _buildAbilityRow('p1');
  _buildAbilityRow('p2');
  _buildFormStrip();

  // Pass 14: meter element cache (GUARD + RESONANCE)
  _hud.meters = {
    p1: { guard: document.getElementById('guard-fill-p1'), reson: document.getElementById('reson-fill-p1'),
          guardWrap: document.querySelector('#meter-strip-p1 .meter.guard'), resonWrap: document.querySelector('#meter-strip-p1 .meter.reson') },
    p2: { guard: document.getElementById('guard-fill-p2'), reson: document.getElementById('reson-fill-p2'),
          guardWrap: document.querySelector('#meter-strip-p2 .meter.guard'), resonWrap: document.querySelector('#meter-strip-p2 .meter.reson') },
  };

  // Objective icons
  _drawObjIcon(document.getElementById('obj-icon-p1'), 0, 0);
  _drawObjIcon(document.getElementById('obj-icon-p2'), 0, 0);

  // Controls chips
  _wireControlsChips();
}

// ────────────────────────────────────────────────────────────────────────────
// ABILITY ROW BUILD
// ────────────────────────────────────────────────────────────────────────────
// Pass 14: each ability carries a `kind` ('attack' | 'defend') so the HUD can
// tint offensive vs defensive abilities.
const _P1_SPEC = [
  { glyph: 'staff',   key: 'I/Spc', maxCd: 0.3,  cdProp: '_attackCd',  label: 'Attack',  kind: 'attack' },
  { glyph: 'heavy',   key: 'U',     maxCd: 1.6,  cdProp: '_heavyCd',   label: 'Heavy',   kind: 'attack' },
  { glyph: 'block',   key: 'G',     maxCd: 0,    cdProp: null,         label: 'Block',   kind: 'defend' },
  { glyph: 'shield',  key: 'J',     maxCd: 8,    cdProp: '_shieldCd',  label: 'Shield',  kind: 'defend' },
  { glyph: 'boot',    key: 'K',     maxCd: 2,    cdProp: '_dodgeCd',   label: 'Dodge',   kind: 'defend' },
  { glyph: 'lotus',   key: 'L',     maxCd: 10,   cdProp: '_healCd',    label: 'Heal',    kind: 'defend' },
];
const _P2_SPEC = [
  { glyph: 'claw',    key: 'Ent',   maxCd: 0.35, cdProp: '_attackCd',    label: 'Attack',    kind: 'attack' },
  { glyph: 'heavy',   key: 'Num3',  maxCd: 1.6,  cdProp: '_heavyCd',     label: 'Heavy',     kind: 'attack' },
  { glyph: 'star',    key: 'Num6',  maxCd: 8,    cdProp: '_specialCd',   label: 'Breath',    kind: 'attack' },
  { glyph: 'block',   key: 'Num1',  maxCd: 0,    cdProp: null,           label: 'Block',     kind: 'defend' },
  { glyph: 'yinyang', key: 'Num4',  maxCd: 1,    cdProp: '_transformCd', label: 'Transform', kind: 'defend' },
  { glyph: 'boot',    key: 'Num5',  maxCd: 2,    cdProp: '_dodgeCd',     label: 'Dodge',     kind: 'defend' },
];

function _buildAbilityRow(pid) {
  const spec  = pid === 'p1' ? _P1_SPEC : _P2_SPEC;
  const rowEl = document.getElementById('abilities-' + pid);
  if (!rowEl) return;
  rowEl.innerHTML = '';

  const icons = spec.map(a => {
    const wrap = document.createElement('div');
    wrap.className = 'ability-icon' + (a.kind ? ' kind-' + a.kind : '');

    // Canvas glyph — offensive warm, defensive cool tint
    const gc = document.createElement('canvas');
    gc.width = 28; gc.height = 28;
    gc.style.cssText = 'width:28px;height:28px;display:block;';
    const glyphCol = a.kind === 'defend' ? '#9cc4ff' : '#f0a868';
    _drawGlyph(gc, a.glyph, glyphCol);
    wrap.appendChild(gc);

    // Cooldown conic overlay
    const cd = document.createElement('div');
    cd.className = 'cd-conic';
    wrap.appendChild(cd);

    // Key chip
    const kc = document.createElement('span');
    kc.className = 'key-chip';
    kc.textContent = a.key;
    wrap.appendChild(kc);

    rowEl.appendChild(wrap);
    return { iconEl: wrap, glyphCanvas: gc, cdConic: cd, spec: a };
  });

  if (pid === 'p1') _hud.p1Icons = icons;
  else              _hud.p2Icons = icons;
}

// ────────────────────────────────────────────────────────────────────────────
// FORM STRIP (P2 diamonds)
// ────────────────────────────────────────────────────────────────────────────
const _FORMS = ['human','fire','ice','poison','water'];
const _FORM_LABELS = { human:'H',fire:'F',ice:'I',poison:'P',water:'W' };

function _buildFormStrip() {
  const strip = document.getElementById('form-strip-p2');
  if (!strip) return;
  strip.innerHTML = '';
  _hud.formDiamonds = {};
  _FORMS.forEach(f => {
    const d = document.createElement('div');
    d.className = 'form-diamond';
    d.title = FORM_DATA[f].name;
    strip.appendChild(d);
    _hud.formDiamonds[f] = d;
  });
}

// ────────────────────────────────────────────────────────────────────────────
// CONTROLS CHIP HOVER TOOLTIP
// ────────────────────────────────────────────────────────────────────────────
function _wireControlsChips() {
  const P1_CONTROLS = 'WASD: Move | I/Spc: Attack | U: Heavy | G: Block/Parry | J: Shield | K: Dodge | L: Heal | C: Jump | F: Lock-on | R: Ultimate';
  const P2_CONTROLS = 'Arrows: Move | Ent/8: Attack | Num3: Heavy | Num1: Block/Parry | Num4: Transform | Num5: Dodge | Num6: Special | Num2: Jump | 0: Lock-on | Num*: Ultimate';

  [['controls-chip-p1', P1_CONTROLS],['controls-chip-p2', P2_CONTROLS]].forEach(([id, txt]) => {
    const chip = document.getElementById(id);
    if (!chip) return;
    chip.style.pointerEvents = 'all';
    let tip = null;
    chip.addEventListener('mouseenter', () => {
      tip = document.createElement('div');
      tip.style.cssText = `
        position:absolute;
        bottom:30px;
        ${id.includes('p1') ? 'right:0' : 'left:0'};
        background:rgba(10,8,6,0.92);
        border:1px solid rgba(var(--gold-rgb),0.45);
        color:rgba(220,200,160,0.9);
        font-family:var(--font-ui);
        font-size:9px;
        padding:5px 10px;
        border-radius:6px;
        white-space:nowrap;
        z-index:100;
        backdrop-filter:var(--blur);
        line-height:1.7;
        pointer-events:none;
      `;
      tip.textContent = txt;
      chip.parentElement.appendChild(tip);
    });
    chip.addEventListener('mouseleave', () => { if (tip) { tip.remove(); tip = null; } });
  });
}

// ────────────────────────────────────────────────────────────────────────────
// COOLDOWN CONIC SWEEP
// ────────────────────────────────────────────────────────────────────────────
function _setCdConic(el, pct) {
  // pct = 0 → ready (no overlay), 100 → full cooldown
  const deg = pct * 3.6; // pct% → degrees
  if (pct <= 0) {
    el.style.background = 'none';
  } else {
    // Conic: transparent arc for ready portion, dark overlay for remaining
    el.style.background = `conic-gradient(
      rgba(0,0,0,0) 0deg ${360-deg}deg,
      rgba(0,0,0,0.72) ${360-deg}deg 360deg
    )`;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// MAIN UPDATE (called every 50 ms from main.js animate loop)
// ────────────────────────────────────────────────────────────────────────────
export function updateHUD() {
  if (!_hud.built) _buildHUD();

  const p1 = ctx.gameState && ctx.gameState.p1;
  const p2 = ctx.gameState && ctx.gameState.p2;
  if (!p1 || !p2) return;

  // Pass 12: in 1P mode show only the active hero's panel; hide the partner's.
  if (ctx.mode === '1p') {
    const showP1 = ctx.soloChar === 'monk';
    const showP2 = ctx.soloChar === 'sister';
    const hudP1 = document.getElementById('hud-p1');
    const hudP2 = document.getElementById('hud-p2');
    const divider = document.getElementById('divider');
    if (hudP1) {
      hudP1.style.width = showP1 ? '100%' : '0';
      hudP1.style.display = showP1 ? '' : 'none';
    }
    if (hudP2) {
      hudP2.style.left = showP2 ? '0' : '50%';
      hudP2.style.width = showP2 ? '100%' : '50%';
      hudP2.style.display = showP2 ? '' : 'none';
    }
  }

  // Split-screen chrome (the centre divider + the two vignette halves) belongs
  // ONLY to 2P gameplay. Keep it hidden on the menu / intro / 1P (it is also
  // display:none by default in CSS) so it never flashes as a fake "static split
  // screen" while the page is still fetching the Three.js CDN module on load.
  const _st = ctx.gameState.state;
  const _inGame = _st !== 'MENU' && _st !== 'INTRO' && _st !== 'GAMEOVER' && _st !== 'COMPLETE';
  const _show2pChrome = ctx.mode === '2p' && _inGame;
  const _div = document.getElementById('divider');
  const _vL = document.querySelector('.vignette');
  const _vR = document.querySelector('.vignette-r');
  if (_div) _div.style.display = _show2pChrome ? '' : 'none';
  if (_vL) _vL.style.display = _show2pChrome ? '' : 'none';
  if (_vR) _vR.style.display = _show2pChrome ? '' : 'none';

  _updatePlayerPlate('p1', p1);
  _updatePlayerPlate('p2', p2);
  _updateFormStrip(p2);
  _updateAbilityIcons(p1, p2);
  _updateMeters(p1, p2);
  _updateRelicIcons();
  _updateAdvantageChips(p1, p2);
  _updateKOOverlays(p1, p2);
  updateScoreHUD();
}

// ────────────────────────────────────────────────────────────────────────────
// PASS 14: GUARD + RESONANCE METERS
// ────────────────────────────────────────────────────────────────────────────
function _updateMeters(p1, p2) {
  if (!_hud.meters) return;
  _updateMeterFor('p1', p1);
  _updateMeterFor('p2', p2);
}

function _updateMeterFor(pid, player) {
  const m = _hud.meters[pid];
  if (!m) return;
  const guard = Math.max(0, Math.min(100, player.guard != null ? player.guard : 100));
  const reson = Math.max(0, Math.min(100, player.resonance || 0));
  if (m.guard) m.guard.style.width = guard + '%';
  if (m.reson) m.reson.style.width = reson + '%';
  // Visual state flags
  if (m.guardWrap) m.guardWrap.classList.toggle('broken', guard <= 0);
  if (m.resonWrap) m.resonWrap.classList.toggle('full', reson >= 100);
  // Pass 16: ULTIMATE READY glow — resonance full AND the hero has unlocked it
  // (Shikai cleared on Wave 2). Toggle a label + glow class on the resonance bar.
  const ultReady = reson >= 100 && !!player.shikaiUnlocked && !player.ultimateActive;
  if (m.resonWrap) {
    m.resonWrap.classList.toggle('ult-ready', ultReady);
    let lbl = m._ultLabel;
    if (ultReady) {
      if (!lbl) {
        lbl = document.createElement('div');
        lbl.className = 'ult-ready-label';
        lbl.textContent = 'ULTIMATE READY';
        lbl.style.cssText = 'position:absolute;left:0;right:0;top:-13px;text-align:center;' +
          'font-family:var(--font-display);font-size:9px;letter-spacing:2px;color:var(--p1);' +
          'text-shadow:0 0 8px rgba(255,200,60,0.9);pointer-events:none;' +
          'animation:ultPulse 0.9s ease-in-out infinite;';
        // ensure a positioning context
        if (getComputedStyle(m.resonWrap).position === 'static') m.resonWrap.style.position = 'relative';
        m.resonWrap.appendChild(lbl);
        m._ultLabel = lbl;
        if (!document.getElementById('_ultPulseStyle')) {
          const st = document.createElement('style');
          st.id = '_ultPulseStyle';
          st.textContent = '@keyframes ultPulse{0%,100%{opacity:0.55;}50%{opacity:1;}}';
          document.head.appendChild(st);
        }
      }
      lbl.style.display = 'block';
    } else if (lbl) {
      lbl.style.display = 'none';
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// PLAYER PLATE UPDATE
// ────────────────────────────────────────────────────────────────────────────
function _updatePlayerPlate(pid, player) {
  // HP fill + ghost
  const hpPct  = Math.max(0, player.hp / player.maxHp) * 100;
  const fillEl = document.getElementById('hp-' + pid);
  const ghostEl= document.getElementById('hp-ghost-' + pid);
  const txtEl  = document.getElementById('hp-text-' + pid);
  const lvlEl  = document.getElementById('level-' + pid);
  const xpEl   = document.getElementById('xp-' + pid);

  if (fillEl) {
    const prev = parseFloat(fillEl.style.width) || 100;
    fillEl.style.width = hpPct + '%';
    if (hpPct > prev + 1) {
      // healing — flash the bar
      fillEl.classList.remove('healed');
      void fillEl.offsetWidth;
      fillEl.classList.add('healed');
      setTimeout(() => fillEl.classList.remove('healed'), 450);
    }
  }

  // Ghost bar: only moves when hp drops; lags 1.5 s behind (CSS transition handles it)
  if (ghostEl) {
    const currentGhost = _hud.ghostPct[pid];
    if (hpPct < currentGhost) {
      // HP dropped — update ghost target immediately (CSS transition animates it slowly)
      _hud.ghostPct[pid] = hpPct;
      // Delay ghost drain by 0.3s to see the gap first
      clearTimeout(_hud.ghostTimers[pid]);
      _hud.ghostTimers[pid] = setTimeout(() => {
        ghostEl.style.width = hpPct + '%';
      }, 300);
    } else if (hpPct > currentGhost) {
      // HP went up (heal) — snap ghost immediately
      _hud.ghostPct[pid] = hpPct;
      ghostEl.style.width = hpPct + '%';
    }
  }

  if (txtEl) txtEl.textContent = `${Math.ceil(player.hp)}/${player.maxHp}`;
  if (lvlEl) lvlEl.textContent = 'L' + player.level;

  if (xpEl) {
    const needed  = XP_TO_LEVEL[Math.min(player.level + 1, 10)] - (XP_TO_LEVEL[player.level] || 0);
    const current = player.xp - (XP_TO_LEVEL[player.level] || 0);
    xpEl.style.width = Math.min(100, needed > 0 ? current / needed * 100 : 100) + '%';
  }

  // P2 portrait redraws when form changes
  if (pid === 'p2') {
    const form = player.form || 'human';
    if (form !== _hud._p2LastForm) {
      _hud._p2LastForm = form;
      if (_hud.portraitP2) _drawSisterPortrait(_hud.portraitP2, form);
      // Tint the level ring accent color per form
      const ring = document.getElementById('lvl-ring-p2');
      const pal  = FORM_ELEMENT_COLORS[form] || FORM_ELEMENT_COLORS.human;
      if (ring) {
        ring.style.borderColor = pal.accent;
        ring.style.boxShadow   = `0 0 6px ${pal.accent}88, inset 0 0 4px ${pal.accent}33`;
      }
      // Retint transform + breath glyphs by element (find by glyph, indices vary).
      if (_hud.p2Icons) {
        _hud.p2Icons.forEach(({ glyphCanvas, spec }) => {
          if (spec.glyph === 'yinyang') _drawGlyph(glyphCanvas, 'yinyang', pal.accent);
          else if (spec.glyph === 'star') _drawGlyph(glyphCanvas, 'star', pal.accent);
        });
      }
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// FORM STRIP UPDATE (P2 diamonds)
// ────────────────────────────────────────────────────────────────────────────
function _updateFormStrip(p2) {
  if (!_hud.formDiamonds) return;
  const form = p2.form || 'human';
  const unlocked = p2.unlockedForms || ['human'];
  _FORMS.forEach(f => {
    const d = _hud.formDiamonds[f];
    if (!d) return;
    const isActive  = f === form;
    const isLocked  = !unlocked.includes(f);
    d.classList.toggle('active', isActive);
    d.classList.toggle('locked', isLocked);
    if (isActive) {
      const pal = FORM_ELEMENT_COLORS[f] || FORM_ELEMENT_COLORS.human;
      d.style.background  = pal.accent;
      d.style.borderColor = pal.accent;
      d.style.boxShadow   = `0 0 7px ${pal.accent}cc`;
    } else {
      d.style.background  = '';
      d.style.borderColor = '';
      d.style.boxShadow   = '';
    }
  });
}

// ────────────────────────────────────────────────────────────────────────────
// ABILITY ICON UPDATES (cooldown conic sweep)
// ────────────────────────────────────────────────────────────────────────────
function _updateAbilityIcons(p1, p2) {
  if (!_hud.p1Icons || !_hud.p2Icons) return;
  const apply = (icons, player) => {
    icons.forEach(({ cdConic, iconEl, spec }) => {
      // Pass 14: block has no cooldown — show an "active" ring while held.
      if (!spec.cdProp || !spec.maxCd) {
        _setCdConic(cdConic, 0);
        if (spec.glyph === 'block' && iconEl) iconEl.classList.toggle('active-stance', !!player.blocking);
        return;
      }
      const cd  = Math.max(0, player[spec.cdProp] || 0);
      const pct = Math.min(100, cd / spec.maxCd * 100);
      _setCdConic(cdConic, pct);
    });
  };
  apply(_hud.p1Icons, p1);
  apply(_hud.p2Icons, p2);
}

// ────────────────────────────────────────────────────────────────────────────
// RELIC ICONS UPDATE
// ────────────────────────────────────────────────────────────────────────────
const RELIC_ICONS = { 'Prayer Beads': '📿', 'Dragon Pearl': '🔮', 'Saffron Robe': '🧣' };

function _updateRelicIcons() {
  ['p1', 'p2'].forEach(pid => {
    const el = document.getElementById('relics-' + pid);
    if (!el) return;
    const player = pid === 'p1' ? ctx.gameState.p1 : ctx.gameState.p2;
    if (!player) return;
    if (player.relics.length === _hud.relicCounts[pid]) return;
    _hud.relicCounts[pid] = player.relics.length;
    el.innerHTML = '';
    player.relics.forEach(r => {
      const icon = document.createElement('div');
      icon.className = 'relic-icon';
      icon.title = r;
      icon.textContent = RELIC_ICONS[r] || r[0];
      el.appendChild(icon);
    });
  });
}

// ────────────────────────────────────────────────────────────────────────────
// ADVANTAGE CHIPS
// ────────────────────────────────────────────────────────────────────────────
function _updateAdvantageChips(p1, p2) {
  // P1 advantage: nearest enemy vs neutral attack
  _updateAdvantageForPlayer('p1', p1, 'neutral');
  // P2 advantage: nearest enemy vs current element
  const p2elem = (p2.form !== 'human' && typeof p2.getElement === 'function') ? p2.getElement() : null;
  _updateAdvantageForPlayer('p2', p2, p2elem);
}

function _updateAdvantageForPlayer(pid, player, elem) {
  const chip = document.getElementById('advantage-' + pid);
  if (!chip) return;
  if (!elem || elem === 'neutral') { chip.innerHTML = ''; return; }
  let nearest = null, nearDist = Infinity;
  (ctx.gameState.spirits || []).forEach(s => {
    if (!s.alive) return;
    const d = player.pos.distanceTo(s.pos);
    if (d < nearDist) { nearDist = d; nearest = s; }
  });
  if (!nearest) { chip.innerHTML = ''; return; }
  const mult = getElementMult(elem, nearest.element);
  const cls  = mult >= 2 ? 'strong' : mult <= 0.5 ? 'weak' : 'neutral';
  const sym  = mult >= 2 ? '▲ Effective' : mult <= 0.5 ? '▼ Weak' : '● Neutral';
  chip.innerHTML = `<span class="advantage-pill ${cls}">${sym} vs ${nearest.element}</span>`;
}

// ────────────────────────────────────────────────────────────────────────────
// KO OVERLAYS + REVIVE RING
// ────────────────────────────────────────────────────────────────────────────
const KO_REVIVE_WINDOW = 10; // seconds (matches lives.js)

function _updateKOOverlays(p1, p2) {
  _updateKOForPlayer('p1', p1);
  _updateKOForPlayer('p2', p2);
}

function _updateKOForPlayer(pid, player) {
  const koEl     = document.getElementById('ko-' + pid);
  const ringWrap = document.getElementById('revive-ring-' + pid);
  const ringFill = document.getElementById('revive-fill-' + pid);
  if (!koEl) return;

  const isKO = !!(player && player.isKO);
  if (isKO !== _hud.koState[pid]) {
    _hud.koState[pid] = isKO;
    koEl.classList.toggle('visible', isKO);
    if (ringWrap) ringWrap.classList.toggle('visible', isKO);
  }

  if (isKO && ringFill && player._koTimer != null) {
    // _koTimer counts DOWN from KO_REVIVE_WINDOW
    const frac   = Math.max(0, Math.min(1, player._koTimer / KO_REVIVE_WINDOW));
    const circ   = 100.5; // matching dasharray
    const offset = circ * (1 - frac);
    ringFill.style.strokeDashoffset = offset.toFixed(1);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// OBJECTIVE BAR UPDATE
// ────────────────────────────────────────────────────────────────────────────
let _lastObjText = { p1: '', p2: '' };

export function updateObjective() {
  const state  = ctx.gameState && ctx.gameState.state;
  const spirits = ctx.gameState ? ctx.gameState.spirits : [];
  const alive  = spirits.filter(s => s.alive).length;
  const total  = spirits.length;

  const level = ctx.gameState && ctx.gameState.level != null ? ctx.gameState.level : 1;
  let txt = '';
  if (!state || state === 'MENU')       txt = '';
  else if (state === 'INTRO')           txt = 'Awaiting the storm…';
  else if (state === 'COMPLETE' && level === 3) txt = 'Venom Abyss Cleansed!';
  else if (state === 'COMPLETE' && level === 2) txt = 'Glacial Peaks Freed!';
  else if (state === 'COMPLETE')        txt = 'Garden Cleansed!';
  else if (state === 'GAMEOVER')        txt = 'Game Over';
  else if (level === 3) {
    // Level 3 objective text
    if (state === 'WAVE1')      txt = `Abyss W1 — Poison Scouts  ${alive}/${total}`;
    else if (state === 'WAVE2') txt = `Abyss W2 — Poison & Water  ${alive}/${total}`;
    else if (state === 'WAVE3') txt = `Abyss W3 — Tide Wraiths + Poison  ${alive}/${total}`;
    else if (state === 'WAVE4') txt = 'Abyss W4 — Plague Oni (mini-boss)';
    else if (state === 'WAVE5') txt = 'Abyss W5 — Abyssal Demon Lord';
    else                        txt = state;
  } else if (level === 2) {
    // Level 2 objective text
    if (state === 'WAVE1')      txt = `Glacial W1 — Frost Imps  ${alive}/${total}`;
    else if (state === 'WAVE2') txt = `Glacial W2 — Mixed Assault  ${alive}/${total}`;
    else if (state === 'WAVE3') txt = `Glacial W3 — Ice & Water  ${alive}/${total}`;
    else if (state === 'WAVE4') txt = 'Glacial W4 — Frost Warlord';
    else if (state === 'WAVE5') txt = 'Glacial W5 — Glacial Inferno Lord';
    else                        txt = state;
  } else {
    // Level 1 objective text (UNCHANGED)
    if (state === 'WAVE1')      txt = `Wave 1 — Shadowlings  ${alive}/${total}`;
    else if (state === 'WAVE2') txt = `Wave 2 — Frost Imps  ${alive}/${total}`;
    else if (state === 'WAVE3') txt = `Wave 3 — Tide Wraiths  ${alive}/${total}`;
    else if (state === 'WAVE4') txt = 'Wave 4 — Venom Oni (mini-boss)';
    else if (state === 'WAVE5') txt = 'Wave 5 — Inferno Demon Lord';
    else                        txt = state;
  }

  ['p1','p2'].forEach(pid => {
    const txtEl = document.getElementById('obj-text-' + pid);
    const iconEl = document.getElementById('obj-icon-' + pid);
    if (!txtEl) return;
    if (txt !== _lastObjText[pid]) {
      _lastObjText[pid] = txt;
      txtEl.textContent = txt;
      // Tick animation on kill count change
      if (/\d+\/\d+/.test(txt)) {
        txtEl.classList.remove('obj-tick');
        void txtEl.offsetWidth;
        txtEl.classList.add('obj-tick');
        setTimeout(() => txtEl.classList.remove('obj-tick'), 380);
      }
      if (iconEl) _drawObjIcon(iconEl, alive, total);
    }
  });
}

// ────────────────────────────────────────────────────────────────────────────
// BOSS HP BAR
// ────────────────────────────────────────────────────────────────────────────
export function updateBossBar(boss, show) {
  const bar = document.getElementById('boss-hp-bar');
  if (!bar) return;
  if (!show || !boss) {
    bar.style.display = 'none';
    return;
  }
  bar.style.display = 'block';
  const nameEl  = document.getElementById('boss-name');
  const phaseEl = document.getElementById('boss-phase');
  const fillEl  = document.getElementById('boss-hp-fill');
  const bgEl    = document.getElementById('boss-bar-bg');
  if (!nameEl || !fillEl) return;

  const pct = Math.max(0, Math.min(100, (boss.hp / boss.maxHp) * 100));
  fillEl.style.width = pct + '%';

  // Pass 16: phase is now driven by the boss's own `phase` field (1..3).
  const phase = boss.phase || (boss.hp / boss.maxHp <= 0.5 ? 2 : 1);
  const advanced = phase >= 2;
  if (bgEl) bgEl.classList.toggle('phase2', advanced);
  const roman = phase >= 3 ? 'PHASE III' : phase === 2 ? 'PHASE II' : 'PHASE I';
  if (phaseEl) phaseEl.textContent = roman + (boss.enraged ? ' • ENRAGED' : '');

  // Name (Pass 16: phase 3 of the lord tints toward its shifted element)
  // Level 2 bosses set their own name via document.getElementById at spawn time;
  // we only tint by phase here rather than overwriting the set name.
  if (nameEl && boss._type) {
    const gs = ctx.gameState;
    const isL2 = gs && gs.level === 2;
    const isL3 = gs && gs.level === 3;
    if (!isL2 && !isL3) {
      // Level 1: use the canonical names
      const names = { venomoni: 'Venom Oni — Mini-boss', infernolord: 'Inferno Demon Lord' };
      nameEl.textContent = names[boss._type] || boss._type;
    }
    // L2 and L3 bosses set their own name via document.getElementById at spawn time;
    // Tint: venomoni phases use purple→bright-purple; infernolord uses fire→ice
    let col;
    if (boss._type === 'venomoni') {
      col = phase >= 2 ? '#ff44ff' : '#ff8844';
    } else {
      // infernolord / DemonLordL2 / DemonLordL3 — color follows current element
      if (boss.element === 'ice')    col = '#66ccff';
      else if (boss.element === 'poison') col = '#aa44ff';
      else if (boss.element === 'water')  col = '#4499ff';
      else col = phase >= 2 ? '#ff5522' : '#ff8844';
    }
    nameEl.style.color = col;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// SCORE HUD — top-center display (build-once/update-only)
// ────────────────────────────────────────────────────────────────────────────
let _scoreEl = null;
let _lastScore = -1;

export function updateScoreHUD() {
  if (!_scoreEl) _scoreEl = document.getElementById('score-hud');
  if (!_scoreEl) return;
  const gs = ctx.gameState;
  if (!gs) return;

  // Only show during an active game (not MENU)
  const active = gs.state !== 'MENU';
  _scoreEl.style.display = active ? 'block' : 'none';
  if (!active) return;

  const score = gs.score || 0;
  if (score === _lastScore) return;
  _lastScore = score;

  const fmt = score.toLocaleString();
  _scoreEl.textContent = (gs._endless ? '∞ ' : '') + 'SCORE  ' + fmt;

  // Pop animation on change
  _scoreEl.classList.remove('score-pop');
  void _scoreEl.offsetWidth; // force reflow
  _scoreEl.classList.add('score-pop');
}

// ────────────────────────────────────────────────────────────────────────────
// ABILITY ACTIVATION POP (called externally from abilities.js)
// ────────────────────────────────────────────────────────────────────────────
export function flashAbility(pid, idx) {
  const icons = pid === 1 ? _hud.p1Icons : _hud.p2Icons;
  if (!icons || !icons[idx]) return;
  const el = icons[idx].iconEl;
  el.classList.remove('activated');
  void el.offsetWidth;
  el.classList.add('activated');
  setTimeout(() => el.classList.remove('activated'), 400);
}
