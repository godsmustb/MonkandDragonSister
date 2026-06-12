// Demon close-up screenshot probe — Pass 3 visual verification.
// Sequences through waves (mash-clearing with setLevel(10)) and parks a camera
// on each demon type, screenshotting to test/shots/demons/*.png.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'shots', 'demons');
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', e => console.log('PAGEERR:', String(e).slice(0, 200)));
page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE-ERR:', m.text().slice(0, 200)); });
const sleep = ms => new Promise(r => setTimeout(r, ms));

await page.goto('http://localhost:8321/index.html', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__game && window.__game.state, null, { timeout: 20000 });
await page.evaluate(() => window.__game.skipIntro());
await sleep(2000);
await page.evaluate(() => { window.__game.setLevel(1, 10); window.__game.setLevel(2, 10); window.__game.unlockAll(); });

const LEFT = { x: 0, y: 0, width: 800, height: 900 };

// Park P1 (left) camera at eye looking at look; screenshot the left viewport.
async function shot(name, eye, look, clip = LEFT) {
  await page.evaluate(({ eye, look }) => window.__game.setCam('p1', eye, look), { eye, look });
  await sleep(150);
  await page.evaluate(({ eye, look }) => window.__game.setCam('p1', eye, look), { eye, look });
  await sleep(150);
  const p = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: p, clip });
  console.log('shot', name, fs.statSync(p).size, 'bytes');
}


// Mash-clear current state until it changes.
async function clear(state, max = 90000) {
  const t0 = Date.now();
  while (Date.now() - t0 < max) {
    const s = await page.evaluate(() => ({ state: window.__game.state, sp: window.__game.spirits.map(x => ({ x: x.pos.x, z: x.pos.z })) }));
    if (s.state !== state) return s.state;
    if (s.sp.length) {
      const t = s.sp[0];
      await page.evaluate(([x, z]) => { window.__game.teleport(1, x + 1, z); window.__game.teleport(2, x - 1, z); }, [t.x, t.z]);
      for (let i = 0; i < 3; i++) { await page.keyboard.press('Space'); await page.keyboard.press('Enter'); await sleep(180); }
    } else await sleep(300);
  }
  return state;
}

// Pin the first demon of `element` to origin, face it +Z (toward camera),
// and frame from a 3/4 front angle. Players parked far away.
async function frameDemon(name, element, dist, height, lookY) {
  await page.evaluate(() => { window.__game.teleport(1, 80, 80); window.__game.teleport(2, 82, 80); });
  const pos = await page.evaluate((el) => window.__game.pinDemon(el, 0, 0), element);
  if (!pos) { console.log('NO DEMON for', name); return; }
  await sleep(300);
  // 3/4 front: camera back (+Z) and to the side (+X), slightly above, looking at mid-body.
  await shot(name, [pos.x + dist * 0.45, height, pos.z + dist], [pos.x, lookY, pos.z]);
}

// ---- WAVE 1: Shadowling (~0.9 tall, large translucent smoke) ----
await sleep(500);
await frameDemon('1-shadowling', 'neutral', 3.2, 1.1, 0.55);

await clear('WAVE1'); await sleep(1500);
// ---- WAVE 2: Frost Imp (~1.0 crouched) ----
await frameDemon('2-frostimp', 'ice', 3.4, 1.2, 0.7);

await clear('WAVE2'); await sleep(1500);
// ---- WAVE 3: Tide Wraith (~1.5 tall) ----
await frameDemon('3-tidewraith', 'water', 4.0, 1.7, 0.9);

await clear('WAVE3'); await sleep(1800);
// ---- WAVE 4: Venom Oni (mini-boss, wide) ----
await frameDemon('4-venom-oni', 'poison', 7.0, 2.6, 1.7);

await clear('WAVE4'); await sleep(3000);
// ---- WAVE 5: Inferno Demon Lord (phase 1, folded wings) ----
await frameDemon('5a-demon-lord-p1', 'fire', 9.0, 3.6, 2.2);

// Drop HP below 50% to trigger phase 2 (wings spread). Boss is pinned at origin.
{
  const t0 = Date.now();
  let phase2 = false;
  await page.evaluate(() => { window.__game.teleport(1, 1.5, 0); window.__game.teleport(2, -1.5, 0); });
  while (Date.now() - t0 < 90000 && !phase2) {
    const info = await page.evaluate(() => {
      const s = window.__game.spirits.find(x => x.element === 'fire');
      return s ? { hp: s.hp, maxHp: s.maxHp, phase: s._phase } : null;
    });
    if (!info) break;
    if (info.phase === 2 || info.hp < info.maxHp * 0.46) { phase2 = true; break; }
    await page.evaluate(() => { window.__game.teleport(1, 1.5, 0); window.__game.teleport(2, -1.5, 0); });
    for (let i = 0; i < 3; i++) { await page.keyboard.press('Space'); await page.keyboard.press('Enter'); await sleep(150); }
  }
  if (phase2) {
    await sleep(900); // let wing-spread lerp settle
    await frameDemon('5b-demon-lord-p2', 'fire', 9.5, 3.7, 2.2);
  } else {
    console.log('did not reach phase 2 (boss died or timeout)');
  }
}

await page.evaluate(() => window.__game.unfreezeCam());
await browser.close();
console.log('done');
