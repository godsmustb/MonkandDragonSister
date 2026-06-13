import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
p.on('pageerror', e => errs.push('PAGEERR ' + e.message));
await p.goto('http://localhost:8321/index.html', { waitUntil: 'load' });
await p.waitForFunction(() => window.__game && window.__game.state, null, { timeout: 20000 });
await p.waitForTimeout(500);
const vis = (id) => p.evaluate((i) => { const e = document.getElementById(i); return e ? getComputedStyle(e).display : 'absent'; }, id);

// ── Keyboard nav: main menu (START GAME focused) → Enter → mode select ──
await p.keyboard.press('Enter');
await p.waitForTimeout(250);
const modeVis = await vis('mode-select');
console.log('after Enter on menu -> mode-select display:', modeVis);

// In mode select focus[0]=1 PLAYER → Enter → char select
await p.keyboard.press('Enter');
await p.waitForTimeout(250);
const charVis = await vis('char-select');
console.log('after Enter on mode -> char-select display:', charVis);

// In char select navigate Monk→...→BEGIN (index 4) with ArrowRight, Enter
for (let i = 0; i < 4; i++) { await p.keyboard.press('ArrowRight'); await p.waitForTimeout(80); }
await p.keyboard.press('Enter');
await p.waitForTimeout(400);
const charAfter = await vis('char-select');
const mode = await p.evaluate(() => window.__game ? window.__game.state : '?');
console.log('after navigating to BEGIN + Enter -> char-select display:', charAfter, '| game state:', mode);

// ── Leaderboard NEXT LEVEL button advances the campaign ──
const nextResult = await p.evaluate(async () => {
  const lb = await import('/src/game/leaderboard.js');
  let nextCalled = false;
  const entries = [{ name: 'TEST', score: 100, date: '2026-06-13' }];
  lb.showStageLeaderboard(1, 100, entries, 'TEST', null, () => { nextCalled = true; });
  const ov = document.getElementById('stage-lb-overlay');
  const btns = ov ? Array.from(ov.querySelectorAll('.mds-btn')) : [];
  const nextBtn = btns.find(x => /NEXT LEVEL/i.test(x.textContent));
  if (!nextBtn) return { hasNext: false };
  nextBtn.click();
  await new Promise(r => setTimeout(r, 50));
  return { hasNext: true, nextCalled, overlayGone: !document.getElementById('stage-lb-overlay') };
});
console.log('leaderboard NEXT LEVEL button:', JSON.stringify(nextResult));

console.log('CONSOLE ERRORS:', errs.length, errs.slice(0,3).join(' | '));
const pass = modeVis === 'flex' && charVis === 'flex' && charAfter === 'none'
  && nextResult.hasNext && nextResult.nextCalled && nextResult.overlayGone && errs.length === 0;
console.log(pass ? '\n===== FIXES PROBE: OK =====' : '\n===== FIXES PROBE: FAIL =====');
await b.close();
process.exit(pass ? 0 : 1);
