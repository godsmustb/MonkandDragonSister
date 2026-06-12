// Focused debug probe for movement + KeyI/Numpad8 failures
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', e => console.log('PAGEERROR:', String(e).slice(0, 300)));
page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE-ERR:', m.text().slice(0, 300)); });

await page.goto('http://localhost:8321/index.html', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__game && window.__game.state, null, { timeout: 20000 });
await page.evaluate(() => window.__game.skipIntro());
await new Promise(r => setTimeout(r, 3000)); // let any wave-start input lock expire

const pos = () => page.evaluate(() => ({ x: window.__game.p1.pos.x, z: window.__game.p1.pos.z, state: window.__game.state }));

// Test A: Playwright physical key hold
let a = await pos();
await page.keyboard.down('KeyW');
await new Promise(r => setTimeout(r, 1000));
await page.keyboard.up('KeyW');
let b = await pos();
console.log('A) Playwright KeyW hold:', JSON.stringify(a), '->', JSON.stringify(b), 'moved', Math.hypot(b.x - a.x, b.z - a.z).toFixed(2));

// Test B: synthetic window event hold (bypasses Playwright key mapping)
a = await pos();
await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', key: 'w', bubbles: true })));
await new Promise(r => setTimeout(r, 1000));
await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', key: 'w', bubbles: true })));
b = await pos();
console.log('B) synthetic KeyW hold:', 'moved', Math.hypot(b.x - a.x, b.z - a.z).toFixed(2));

// Test C: what does the page actually receive from Playwright presses?
await page.evaluate(() => { window.__received = []; window.addEventListener('keydown', e => window.__received.push({ code: e.code, key: e.key })); });
for (const k of ['Space', 'KeyI', 'Enter', 'Numpad8', 'Numpad4', 'KeyW']) await page.keyboard.press(k);
console.log('C) received events:', JSON.stringify(await page.evaluate(() => window.__received)));

// Test D: attack damage with each alias, fresh lastDamage each time, teleported point-blank
for (const k of ['Space', 'KeyI', 'Enter', 'Numpad8']) {
  const ok = await page.evaluate(() => {
    const s = window.__game.spirits[0];
    if (!s) return 'NO SPIRITS';
    window.__game.teleport(1, s.pos.x + 1.2, s.pos.z);
    window.__game.teleport(2, s.pos.x - 1.2, s.pos.z);
    window.__game.lastDamage = null;
    return 'ready';
  });
  if (ok !== 'ready') { console.log('D)', k, ok); break; }
  for (let i = 0; i < 5; i++) { await page.keyboard.press(k); await new Promise(r => setTimeout(r, 250)); }
  const dmg = await page.evaluate(() => window.__game.lastDamage);
  console.log('D)', k, '->', JSON.stringify(dmg));
}

// Test E: P2 arrow movement
a = await page.evaluate(() => ({ x: window.__game.p2.pos.x, z: window.__game.p2.pos.z }));
await page.keyboard.down('ArrowUp');
await new Promise(r => setTimeout(r, 1000));
await page.keyboard.up('ArrowUp');
b = await page.evaluate(() => ({ x: window.__game.p2.pos.x, z: window.__game.p2.pos.z }));
console.log('E) ArrowUp hold moved', Math.hypot(b.x - a.x, b.z - a.z).toFixed(2));

await browser.close();
