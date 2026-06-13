// Verifies Level 2 (The Glacial Peaks): startLevel(2) works, demons are harder
// than Level 1, the L2 wave machine advances, and the NEXT LEVEL button exists.
import { chromium } from 'playwright';
let hardFail = false;
function check(name, ok, detail = '') { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`); if (!ok) hardFail = true; }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
const cerr = []; const perr = [];
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('console', m => { if (m.type() === 'error') cerr.push(m.text()); });
page.on('pageerror', e => perr.push(String(e)));

await page.goto('http://localhost:8321/index.html', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__game && window.__game.state === 'MENU', { timeout: 30000 });
await page.evaluate(() => window.__game.startGame());
await page.waitForFunction(() => window.__game.state === 'INTRO', { timeout: 15000 });
await page.keyboard.press('Space');
await page.waitForFunction(() => window.__game.state === 'WAVE1', { timeout: 15000 });

// Jump into Level 2 via the debug hook, then power up the heroes for the test.
await page.evaluate(() => { window.__game.startLevel(2); window.__game.setLevel(1, 10); window.__game.setLevel(2, 10); });

const level = await page.evaluate(() => window.__game.level);
check('startLevel(2) sets level=2', level === 2, `level=${level}`);

// startLevel(2) shows a ~2s banner before spawning — poll until the wave appears.
let w1 = { count: 0, maxHp: undefined, el: undefined };
for (let i = 0; i < 40; i++) {
  w1 = await page.evaluate(() => {
    const s = window.__game.spirits.filter(x => x.alive);
    return { count: s.length, maxHp: s[0] && s[0].maxHp, el: s[0] && s[0].element };
  });
  if (w1.count > 0) break;
  await sleep(150);
}
// Level 1 W1 = 3 shadowlings; Level 2 W1 = ~5 frost imps, scaled HP well above L1 frostimp(44).
check('L2 W1 has more, harder demons than L1', w1.count >= 5 && w1.maxHp > 55 && w1.el === 'ice', `count=${w1.count} maxHp=${w1.maxHp} el=${w1.el}`);

// Clear a wave (strong heroes) to confirm the L2 wave machine advances without error.
async function clearOnce(fromState) {
  const t0 = Date.now();
  while (Date.now() - t0 < 30000) {
    const s = await page.evaluate(() => ({ state: window.__game.state, sp: window.__game.spirits.filter(x=>x.alive).map(x=>({x:x.pos.x,z:x.pos.z})) }));
    if (s.state !== fromState) return s.state;
    if (s.sp.length) {
      const t = s.sp[0];
      await page.evaluate(([x,z]) => { window.__game.teleport(1, x+0.4, z); window.__game.teleport(2, x-0.4, z); }, [t.x, t.z]);
      await page.keyboard.press('Space'); await page.keyboard.press('Enter'); await page.keyboard.press('KeyU');
    }
    await sleep(120);
  }
  return fromState;
}
const next = await clearOnce('WAVE1');
check('L2 wave machine advances past W1', next !== 'WAVE1', `next state=${next}`);

const hasNextBtn = await page.evaluate(() => !!document.getElementById('btn-next-level'));
check('NEXT LEVEL button exists in DOM', hasNextBtn);

check('No console errors', cerr.length === 0, cerr.slice(0,3).join(' | '));
check('No page errors', perr.length === 0, perr.slice(0,3).join(' | '));

await browser.close();
console.log(`\n===== LEVEL 2 VERIFY: ${hardFail ? 'FAIL' : 'OK'} =====`);
process.exit(hardFail ? 1 : 0);
