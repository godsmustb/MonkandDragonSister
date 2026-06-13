// Verifies the Endless collapsing-arena sudden death. NOTE: headless runs the sim
// at ~0.5x realtime (the 0.2s frame-cap), so game-time (suddenDeathElapsed) lags
// wall-clock; we poll on game-time, not wall-clock.
import { chromium } from 'playwright';
let hardFail = false;
function check(name, ok, detail = '') { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`); if (!ok) hardFail = true; }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
const consoleErrors = [], pageErrors = [];
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', e => pageErrors.push(String(e)));

await page.goto('http://localhost:8321/index.html', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__game && window.__game.state === 'MENU', { timeout: 30000 });
await page.evaluate(() => window.__game.startGame());
await page.waitForFunction(() => window.__game.state === 'INTRO', { timeout: 15000 });
await page.keyboard.press('Space');
await page.waitForFunction(() => window.__game.state === 'WAVE1', { timeout: 15000 });
await page.evaluate(() => window.__game.startEndless());
await sleep(500);

const r0 = await page.evaluate(() => window.__game.arenaRadius);
check('Endless arena starts at full radius (~56)', r0 >= 54 && r0 <= 57, `arenaRadius=${r0}`);

const e1 = await page.evaluate(() => window.__game.suddenDeathElapsed);
await sleep(3000);
const e2 = await page.evaluate(() => window.__game.suddenDeathElapsed);
check('Sudden-death timer runs', typeof e1 === 'number' && typeof e2 === 'number' && e2 > e1, `elapsed ${e1?.toFixed(1)}→${e2?.toFixed(1)}`);

// Poll (on wall-clock, generously) until the first collapse shrinks the radius.
let rNow = r0;
for (let i = 0; i < 110; i++) { // up to ~55s wall
  rNow = await page.evaluate(() => window.__game.arenaRadius);
  if (rNow < r0 - 1) break;
  await sleep(500);
}
const elapsed = await page.evaluate(() => window.__game.suddenDeathElapsed);
check('Arena collapses inward over time', rNow < r0 - 1, `arenaRadius ${r0}→${rNow.toFixed(1)} at elapsed=${elapsed?.toFixed(1)}s`);

if (rNow < r0 - 1) {
  // Place the hero over the collapsed void (beyond the safe radius, inside the
  // original 56 footprint) → it should FALL (pos.y goes negative) then game over.
  await page.evaluate((r) => window.__game.teleport(1, r + 4, 0), rNow);
  let minY = 0;
  for (let i = 0; i < 30; i++) { const y = await page.evaluate(() => window.__game.p1.pos.y); if (y < minY) minY = y; if (y < -1) break; await sleep(100); }
  check('Player over the void FALLS (pos.y goes negative)', minY < -0.5, `minY=${minY.toFixed(2)}`);
  const over = await page.waitForFunction(() => window.__game.state === 'GAMEOVER', { timeout: 8000 }).then(() => true).catch(() => false);
  check('Falling off → endless GAME OVER', over);
}

check('No console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
check('No page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
await browser.close();
console.log(`\n===== SUDDEN-DEATH VERIFY: ${hardFail ? 'FAIL' : 'OK'} =====`);
process.exit(hardFail ? 1 : 0);
