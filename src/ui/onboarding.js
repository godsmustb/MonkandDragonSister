// src/ui/onboarding.js — slide-sequence infra powering the intro cinematic + the
// 3-slide controls/powers/elements tutorial + the L1->L2 travel transition.
// All self-contained DOM/CSS (no new assets needed); manifest-gated art where used.
import { ctx } from '../state.js';
import { sfx } from '../audio/audio.js';

// ── Generic slide-sequence overlay ──────────────────────────────────────────
// slides: [{ build(stage) -> void }]  (stage = a DOM div to fill)
// onDone: called after advancing past the last slide (or Skip).
// opts: { skipLabel, finalLabel }
function _runSlides(slides, onDone, opts = {}) {
  let i = 0;
  const root = document.createElement('div');
  root.className = 'mds-scrim';
  root.style.cssText = 'z-index:200;flex-direction:column;gap:0;';

  const stage = document.createElement('div');
  stage.style.cssText = 'position:relative;width:100%;flex:1;display:flex;align-items:center;justify-content:center;overflow:hidden;';

  // dots
  const dots = document.createElement('div');
  dots.style.cssText = 'display:flex;gap:10px;margin:14px 0;';
  const dotEls = slides.map(() => { const d = document.createElement('div'); d.style.cssText = 'width:10px;height:10px;border-radius:50%;background:rgba(200,160,0,0.3);transition:background .3s;'; dots.appendChild(d); return d; });

  // nav row
  const nav = document.createElement('div');
  nav.style.cssText = 'display:flex;align-items:center;gap:24px;margin-bottom:26px;';
  const mkArrow = (txt) => { const b = document.createElement('div'); b.className = 'mds-btn'; b.textContent = txt; b.style.cssText = 'font-size:22px;width:54px;height:54px;display:flex;align-items:center;justify-content:center;border-radius:50%;'; return b; };
  const back = mkArrow('◀');
  const next = mkArrow('▶');
  const skip = document.createElement('div'); skip.className = 'mds-btn'; skip.textContent = 'SKIP'; skip.style.cssText = 'font-size:12px;letter-spacing:2px;opacity:0.7;';
  nav.appendChild(back); nav.appendChild(skip); nav.appendChild(next);

  root.appendChild(stage); root.appendChild(dots); root.appendChild(nav);
  document.body.appendChild(root);

  const finish = () => {
    if (root._done) return; root._done = true;
    if (root._key) document.removeEventListener('keydown', root._key);
    root.style.transition = 'opacity .4s'; root.style.opacity = '0';
    setTimeout(() => { root.remove(); try { onDone && onDone(); } catch (_) {} }, 420);
  };

  const render = () => {
    stage.innerHTML = '';
    const panel = document.createElement('div');
    panel.style.cssText = 'opacity:0;transform:translateY(10px);transition:opacity .45s,transform .45s;width:100%;height:100%;display:flex;align-items:center;justify-content:center;';
    stage.appendChild(panel);
    try { slides[i].build(panel); } catch (_) {}
    requestAnimationFrame(() => { panel.style.opacity = '1'; panel.style.transform = 'none'; });
    dotEls.forEach((d, k) => d.style.background = k === i ? 'var(--gold-bright)' : 'rgba(200,160,0,0.3)');
    back.style.visibility = i === 0 ? 'hidden' : 'visible';
    next.textContent = i === slides.length - 1 ? (opts.finalLabel || 'BEGIN ▶') : '▶';
    if (i === slides.length - 1) next.style.width = 'auto', next.style.padding = '0 22px', next.style.borderRadius = '24px', next.style.fontSize = '14px';
    else next.style.width = '54px', next.style.padding = '0', next.style.borderRadius = '50%', next.style.fontSize = '22px';
  };
  const go = (d) => {
    const n = i + d;
    if (n < 0) return;
    if (n >= slides.length) { finish(); return; }
    i = n; try { sfx.menuTick(); } catch {}; render();
  };
  back.onclick = () => go(-1);
  next.onclick = () => { try { sfx.menuSelect(); } catch {}; go(1); };
  skip.onclick = () => { try { sfx.menuTick(); } catch {}; finish(); };
  root._key = (e) => {
    if (e.code === 'ArrowRight' || e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); go(1); }
    else if (e.code === 'ArrowLeft') { e.preventDefault(); go(-1); }
    else if (e.code === 'Escape') { e.preventDefault(); finish(); }
  };
  document.addEventListener('keydown', root._key);
  render();
  return root;
}

// ── Shared visual bits ──────────────────────────────────────────────────────
function _key(label) {
  const k = document.createElement('div');
  k.textContent = label;
  k.style.cssText = 'min-width:34px;height:34px;padding:0 8px;display:inline-flex;align-items:center;justify-content:center;margin:3px;border:2px solid rgba(200,160,0,0.6);border-radius:6px;background:rgba(20,16,8,0.8);color:#ffdd88;font-size:13px;font-weight:bold;font-family:var(--font-ui,monospace);box-shadow:0 2px 0 rgba(0,0,0,0.5);';
  return k;
}
function _portrait(who) {
  const img = document.createElement('img');
  img.style.cssText = 'width:150px;height:150px;border-radius:14px;object-fit:cover;border:2px solid rgba(200,160,0,0.5);box-shadow:0 6px 24px rgba(0,0,0,0.6);';
  img.onerror = () => { img.style.display = 'none'; };
  img.src = `assets/ui/portrait_${who === 'sister' ? 'sister' : 'monk'}.png`;
  return img;
}
function _slideShell(title, subtitle) {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:16px;max-width:760px;padding:20px;text-align:center;';
  const h = document.createElement('h2'); h.className = 'mds-heading'; h.textContent = title; h.style.cssText = 'font-size:clamp(20px,3vw,30px);margin:0;';
  const s = document.createElement('div'); s.textContent = subtitle; s.style.cssText = 'color:var(--text-muted);font-size:13px;letter-spacing:1px;font-style:italic;';
  wrap.appendChild(h); wrap.appendChild(s);
  return wrap;
}

// ── The 3 tutorial slides ───────────────────────────────────────────────────
function _slideControls(who) {
  return { build(p) {
    const w = _slideShell('CONTROLS', 'Move, strike, and survive');
    const row = document.createElement('div'); row.style.cssText = 'display:flex;align-items:center;gap:40px;flex-wrap:wrap;justify-content:center;margin-top:6px;';
    const port = _portrait(who); port.style.animation = 'mdsBob 1.6s ease-in-out infinite';
    const keys = document.createElement('div'); keys.style.cssText = 'display:flex;flex-direction:column;gap:10px;align-items:flex-start;';
    const line = (label, ...ks) => { const d = document.createElement('div'); d.style.cssText = 'display:flex;align-items:center;gap:8px;'; ks.forEach(k => d.appendChild(_key(k))); const t = document.createElement('span'); t.textContent = label; t.style.cssText = 'color:#ddd;font-size:13px;margin-left:6px;'; d.appendChild(t); keys.appendChild(d); };
    const p2 = (who === 'sister' && ctx.mode === '2p');
    line('Move', 'W','A','S','D');
    line('Attack', 'Spc');
    line('Heavy', 'U');
    line('Dodge (i-frames)', 'K');
    line('Block / Parry', 'G');
    line('Ultimate', 'R');
    row.appendChild(port); row.appendChild(keys);
    w.appendChild(row);
    const tip = document.createElement('div'); tip.textContent = 'Tip: dodge through an attack to slip past it unharmed.'; tip.style.cssText = 'color:#aa9;font-size:12px;margin-top:8px;'; w.appendChild(tip);
    p.appendChild(w);
  }};
}
function _slidePowers(who) {
  return { build(p) {
    const w = _slideShell('POWERS', who === 'sister' ? 'Four dragons, one ring' : 'Chi, staff, and spirit');
    const grid = document.createElement('div'); grid.style.cssText = 'display:flex;gap:18px;flex-wrap:wrap;justify-content:center;max-width:680px;margin-top:6px;';
    const items = who === 'sister'
      ? [['🔥','Fire','Burns ice'],['❄','Ice','Freezes poison'],['☠','Poison','Melts water'],['💧','Water','Douses fire'],['⚡','Ultimate','10s super — i-frames + 2.5x dmg']]
      : [['🥢','Staff Combo','Light + heavy, knockback finisher'],['🛡','Chi Shield','Absorb + reflect on parry'],['✚','Heal','Restore party HP'],['🌀','Parry','Time it to stagger'],['⚡','Ultimate','10s super — i-frames + 2.5x dmg']];
    items.forEach(([ic, nm, ds], k) => {
      const c = document.createElement('div'); c.style.cssText = `width:180px;padding:14px;border:1px solid rgba(200,160,0,0.3);border-radius:10px;background:rgba(15,12,6,0.6);animation:mdsPulse 2s ease-in-out ${k * 0.15}s infinite;`;
      c.innerHTML = `<div style="font-size:30px;">${ic}</div><div style="color:var(--gold-bright);font-weight:bold;margin:4px 0;letter-spacing:1px;">${nm}</div><div style="color:#bbb;font-size:12px;">${ds}</div>`;
      grid.appendChild(c);
    });
    w.appendChild(grid);
    p.appendChild(w);
  }};
}
function _slideElements() {
  return { build(p) {
    const w = _slideShell('ELEMENT RING', 'Water ▸ Fire ▸ Ice ▸ Poison ▸ Water');
    const ring = document.createElement('div'); ring.style.cssText = 'position:relative;width:300px;height:300px;margin-top:4px;animation:mdsSpin 18s linear infinite;';
    const els = [['💧','Water','#4ea8ff'],['🔥','Fire','#ff7a3c'],['❄','Ice','#9fe8ff'],['☠','Poison','#9bdb3c']];
    els.forEach(([ic, nm, col], k) => {
      const ang = (k / els.length) * Math.PI * 2 - Math.PI / 2;
      const x = 150 + Math.cos(ang) * 110, y = 150 + Math.sin(ang) * 110;
      const node = document.createElement('div');
      node.style.cssText = `position:absolute;left:${x - 38}px;top:${y - 38}px;width:76px;height:76px;border-radius:50%;border:2px solid ${col};background:rgba(10,10,14,0.85);display:flex;flex-direction:column;align-items:center;justify-content:center;animation:mdsSpinR 18s linear infinite;`;
      node.innerHTML = `<div style="font-size:24px;">${ic}</div><div style="color:${col};font-size:10px;letter-spacing:1px;">${nm}</div>`;
      ring.appendChild(node);
    });
    const center = document.createElement('div'); center.style.cssText = 'position:absolute;left:110px;top:120px;width:80px;text-align:center;color:#ffdd88;font-size:12px;animation:mdsSpinR 18s linear infinite;'; center.innerHTML = 'each beats<br>the next →';
    ring.appendChild(center);
    w.appendChild(ring);
    const legend = document.createElement('div'); legend.innerHTML = '<span style="color:var(--jade);">2.0×</span> when strong · <span style="color:#ff6b6b;">0.5×</span> when weak · 1× neutral'; legend.style.cssText = 'color:#ccc;font-size:13px;margin-top:6px;'; w.appendChild(legend);
    p.appendChild(w);
  }};
}

// Public: run the 3-slide tutorial, then onDone.
export function runTutorial(onDone) {
  const who = ctx.soloChar === 'sister' ? 'sister' : 'monk';
  _runSlides([_slideControls(who), _slidePowers(who), _slideElements()], onDone, { finalLabel: 'ENTER THE GARDEN ▶' });
}

// ── Intro cinematic (3 art panels) ──────────────────────────────────────────
function _cinePanel(bg, kicker, title, body) {
  return { build(p) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:relative;width:100%;height:100%;display:flex;align-items:flex-end;justify-content:center;';
    const art = document.createElement('div');
    art.style.cssText = `position:absolute;inset:0;background-size:cover;background-position:center;opacity:0;transition:opacity 1s;`;
    const im = new Image(); im.onload = () => { art.style.backgroundImage = `url(${im.src})`; art.style.opacity = '0.85'; }; im.src = bg;
    const scrim = document.createElement('div'); scrim.style.cssText = 'position:absolute;inset:0;background:linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.2) 60%, rgba(0,0,0,0.4) 100%);';
    const txt = document.createElement('div'); txt.style.cssText = 'position:relative;z-index:1;max-width:680px;text-align:center;padding:40px 20px 50px;';
    txt.innerHTML = `<div style="color:var(--gold);letter-spacing:4px;font-size:12px;margin-bottom:8px;">${kicker}</div><h2 class="mds-heading" style="font-size:clamp(22px,4vw,38px);margin:0 0 12px;">${title}</h2><div style="color:#ddd;font-size:15px;line-height:1.7;">${body}</div>`;
    wrap.appendChild(art); wrap.appendChild(scrim); wrap.appendChild(txt);
    p.appendChild(wrap);
  }};
}
export function runIntroCinematic(onDone) {
  _runSlides([
    _cinePanel('assets/ui/bg_l1.jpg', 'THE MONK & THE DRAGON SISTER', 'A Garden of Stillness',
      'For a hundred years the Zen garden knew only peace. The Monk tended his chi; the Dragon Sister slept beside her four dragons. The villagers lived without fear.'),
    _cinePanel('assets/ui/boss_inferno_lord.png', 'QUEST I — THE INITIAL COMPASSION', 'The Shadow Falls',
      'Then the demons came. Shadow-spirits poured from the void, striking down the innocent at the garden\'s edge. The stillness shattered.'),
    _cinePanel('assets/ui/keyart_cover.jpg', 'RISE', 'Answer the Call',
      'The Monk takes up his staff. The Sister calls her dragons to her side. Compassion demands action — and the demons will learn its weight.'),
  ], onDone, { finalLabel: 'CONTINUE ▶' });
}

// ── L1 -> L2 travel transition (animated) ───────────────────────────────────
export function runLevelTransition(fromLevel, toLevel, onDone) {
  const names = { 1: 'THE ZEN GARDEN', 2: 'THE GLACIAL PEAKS', 3: 'THE VENOM ABYSS' };
  const root = document.createElement('div'); root.className = 'mds-scrim'; root.style.cssText = 'z-index:205;flex-direction:column;gap:18px;overflow:hidden;';
  const fromBg = document.createElement('div'); fromBg.style.cssText = `position:absolute;inset:0;background:url(assets/ui/bg_l${fromLevel}.jpg) center/cover;opacity:0.5;transition:opacity 2.4s,transform 2.4s;`;
  const toBg = document.createElement('div'); toBg.style.cssText = `position:absolute;inset:0;background:url(assets/ui/bg_l${toLevel}.jpg) center/cover;opacity:0;transition:opacity 2.4s;`;
  const runner = document.createElement('div'); runner.textContent = '🏃'; runner.style.cssText = 'position:relative;z-index:1;font-size:54px;animation:mdsRun 2.2s linear forwards;filter:drop-shadow(0 4px 6px rgba(0,0,0,0.6));';
  const label = document.createElement('div'); label.style.cssText = 'position:relative;z-index:1;text-align:center;'; label.innerHTML = `<div style="color:var(--text-muted);letter-spacing:3px;font-size:12px;">TRAVELING TO</div><div class="mds-heading" style="font-size:clamp(22px,4vw,34px);">${names[toLevel] || ''}</div>`;
  root.appendChild(fromBg); root.appendChild(toBg); root.appendChild(runner); root.appendChild(label);
  document.body.appendChild(root);
  requestAnimationFrame(() => { fromBg.style.opacity = '0'; fromBg.style.transform = 'translateX(-30%) scale(1.1)'; toBg.style.opacity = '0.55'; });
  setTimeout(() => { root.style.transition = 'opacity .4s'; root.style.opacity = '0'; setTimeout(() => { root.remove(); try { onDone && onDone(); } catch (_) {} }, 420); }, 2500);
}
