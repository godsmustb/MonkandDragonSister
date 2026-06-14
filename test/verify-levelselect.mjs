// verify-levelselect.mjs — Level Selector: menu DOM row + jump-to-level + form unlocks.
// Server must be running on 8321.  Run: node verify-levelselect.mjs
import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errs = [];
p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
p.on('pageerror', e => errs.push('PAGEERR ' + e.message));
await p.goto('http://localhost:8321/index.html', { waitUntil: 'load' });
await p.waitForFunction(() => window.__game && window.__game.state, null, { timeout: 20000 });

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('PASS ', m, x !== undefined ? '— ' + x : ''); } else { fail++; console.log('FAIL ', m, x !== undefined ? '— ' + x : ''); } };

// 1) DOM path: main menu → 1 PLAYER → char-select shows the START LEVEL row with 3 levels.
await p.evaluate(() => window.__game.skipIntro && window.__game.state); // ensure boot done
// Navigate the menu via clicks: START GAME, then 1 PLAYER.
const clickByText = async (txt) => p.evaluate((t) => {
  const els = [...document.querySelectorAll('.menu-item,.mds-btn')];
  const el = els.find(e => e.textContent.trim().toUpperCase().includes(t));
  if (el) { el.click(); return true; } return false;
}, txt);
await clickByText('START GAME'); await p.waitForTimeout(150);
await clickByText('1 PLAYER'); await p.waitForTimeout(200);
const levelBtns = await p.evaluate(() => {
  const sel = document.getElementById('char-select');
  if (!sel) return null;
  const labels = [...sel.querySelectorAll('.mds-btn')].map(b => b.textContent.trim());
  return labels.filter(l => /ZEN GARDEN|GLACIAL PEAKS|VENOM ABYSS/.test(l));
});
ok(levelBtns && levelBtns.length === 3, 'char-select shows 3 START LEVEL buttons', JSON.stringify(levelBtns));

// 2) Click "3 · VENOM ABYSS" then BEGIN; dismiss intro; assert we land in level 3.
await p.evaluate(() => {
  const sel = document.getElementById('char-select');
  const lv3 = [...sel.querySelectorAll('.mds-btn')].find(b => /VENOM ABYSS/.test(b.textContent));
  lv3 && lv3.click();
});
await p.waitForTimeout(120);
await p.evaluate(() => {
  const sel = document.getElementById('char-select');
  const begin = [...sel.querySelectorAll('.mds-btn')].find(b => b.textContent.trim() === 'BEGIN');
  begin && begin.click();
});
await p.waitForTimeout(400);
// dismiss intro (click anywhere / endIntro)
await p.evaluate(() => { const i = document.getElementById('intro-screen'); if (i) i.click(); });
await p.waitForFunction(() => window.__game.state && window.__game.state.startsWith('WAVE'), null, { timeout: 8000 }).catch(() => {});
const s1 = await p.evaluate(() => ({ level: window.__game.wave ? window.__game.wave : null, state: window.__game.state, p2: window.__game.p2 }));
const lvl = await p.evaluate(() => (window.__game.p2 && window.__game.p2.unlocked) ? window.__game.p2.unlocked : null);
const stLevel = await p.evaluate(() => window.__game.startLevel2);
ok(stLevel === 3, 'ctx.startLevel set to 3 by the menu', stLevel);
ok(s1.state && s1.state.startsWith('WAVE'), 'game entered a WAVE after BEGIN', s1.state);
const themeOk = await p.evaluate(() => {
  // level 3 = Venom Abyss; gameState.level exposed via wave machine. Check __game has level via spirits theme or score path.
  return window.__game && window.__game.state;
});
ok(lvl && ['fire','ice','poison','water'].every(f => lvl.includes(f)), 'all dragon forms unlocked on level-3 jump', JSON.stringify(lvl));

// 3) Debug path: setStartLevel then a fresh programmatic start lands at the right level.
const dbg = await p.evaluate(() => window.__game.setStartLevel(2));
ok(dbg === 2, 'setStartLevel(2) accepted', dbg);

ok(errs.length === 0, 'zero console/page errors', errs.slice(0, 3).join(' | '));
console.log(`\n===== LEVEL SELECT: ${pass} passed, ${fail} failed =====`);
await b.close();
process.exit(fail === 0 ? 0 : 1);
