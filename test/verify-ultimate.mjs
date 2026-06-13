// Pass 16 verification — ultimate/Bankai system + boss phase exposure.
// (Boss phase/element-shift killability is validated by the main E2E, which
//  fights both bosses to death; here we cover the ultimate + debug hooks.)
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

// Boss/spirit phase field exposed on snapshot.
const phaseExposed = await page.evaluate(() => {
  const s = window.__game.spirits[0];
  return s && typeof s.phase === 'number' && typeof s.enraged === 'boolean';
});
check('Spirit snapshot exposes phase + enraged', phaseExposed);

// Helper: peak light-hit damage onto a spirit. Mash a few times (re-teleporting)
// so a FRESH hit lands despite attack cooldown — otherwise lastDamage can read
// stale from a prior measurement.
async function lightHit() {
  let best = 0;
  for (let k = 0; k < 4; k++) {
    await page.evaluate(() => { const s = window.__game.spirits.find(x => x.alive); if (s) window.__game.teleport(1, s.pos.x + 0.5, s.pos.z); });
    await page.keyboard.press('Space');
    await sleep(170);
    const d = await page.evaluate(() => window.__game.lastDamage);
    if (d && d.amount > best) best = d.amount;
  }
  return best;
}

const baseline = await lightHit();
check('Baseline light hit deals normal damage', baseline >= 8 && baseline <= 25, `baseline=${baseline}`);

// Ultimate is gated behind shikai + full resonance.
const readyBefore = await page.evaluate(() => window.__game.p1.ultimateReady);
check('Ultimate NOT ready before shikai/resonance', readyBefore === false, `ready=${readyBefore}`);

await page.evaluate(() => { window.__game.grantShikai(1); window.__game.fillResonance(1); });
const ready = await page.evaluate(() => window.__game.p1.ultimateReady);
check('Ultimate READY after shikai + full resonance', ready === true, `ready=${ready}`);

await page.evaluate(() => window.__game.ultimate(1));
await sleep(200);
const active = await page.evaluate(() => window.__game.p1.ultimateActive);
check('Ultimate activates', active === true, `active=${active}`);

// During ultimate, attacks hit harder (2.5x buff).
const ultDmg = await lightHit();
check('Ultimate buffs attack damage', ultDmg > baseline, `ult=${ultDmg} baseline=${baseline}`);

check('No console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
check('No page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

await browser.close();
console.log(`\n===== ULTIMATE VERIFY: ${hardFail ? 'FAIL' : 'OK'} =====`);
process.exit(hardFail ? 1 : 0);
