// Pass 14 verification — heavy attack, resonance meter, block state.
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
await sleep(500);

// Sit P1 on top of a spirit, then read the damage a light vs heavy hit deals.
async function hitAndRead(pressFn) {
  await page.evaluate(() => {
    const s = window.__game.spirits.find(s => s.alive);
    if (s) window.__game.teleport(1, s.pos.x + 0.5, s.pos.z);
  });
  const before = await page.evaluate(() => (window.__game.lastDamage && window.__game.lastDamage.amount) || 0);
  await pressFn();
  let best = 0;
  for (let i = 0; i < 14; i++) {
    const d = await page.evaluate(() => window.__game.lastDamage);
    if (d && d.amount > best) best = d.amount;
    await sleep(60);
  }
  return best;
}

const light = await hitAndRead(() => page.keyboard.press('Space'));
check('Light attack deals damage (~10)', light >= 8 && light <= 14, `light=${light}`);
await sleep(700);
const heavy = await hitAndRead(() => page.keyboard.press('KeyU')); // P1 heavy default
check('Heavy attack deals MORE than light', heavy > light, `heavy=${heavy} light=${light}`);

// Resonance should have built from landing hits.
const res = await page.evaluate(() => window.__game.p1.resonance);
check('Resonance meter exposed + builds from hits', typeof res === 'number' && res > 0, `resonance=${res}`);

// Block state toggles via debug hook.
await page.evaluate(() => window.__game.setBlocking(1, true));
const blkOn = await page.evaluate(() => window.__game.p1.blocking);
await page.evaluate(() => window.__game.setBlocking(1, false));
const blkOff = await page.evaluate(() => window.__game.p1.blocking);
check('Block state toggles (setBlocking)', blkOn === true && blkOff === false, `on=${blkOn} off=${blkOff}`);

// Guard meter exposed.
const guard = await page.evaluate(() => window.__game.p1.guard);
check('Guard meter exposed', typeof guard === 'number', `guard=${guard}`);

check('No console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
check('No page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

await browser.close();
console.log(`\n===== COMBAT VERIFY: ${hardFail ? 'FAIL' : 'OK'} =====`);
process.exit(hardFail ? 1 : 0);
