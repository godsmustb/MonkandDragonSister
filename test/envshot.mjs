// Environment / rendering screenshot probe — Pass 4 visual verification.
// Captures: (a) wide gameplay both halves, (b) horizon view from arena edge,
// (c) emissive/bloom shot (lantern), (d) low-quality comparison.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'shots', 'env');
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', e => { errors.push('PAGEERR: ' + String(e).slice(0, 200)); });
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE-ERR: ' + m.text().slice(0, 200)); });
const warns = [];
page.on('console', m => { if (m.type() === 'warning') warns.push(m.text().slice(0, 160)); });
const sleep = ms => new Promise(r => setTimeout(r, ms));

await page.goto('http://localhost:8321/index.html', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__game && window.__game.state, null, { timeout: 20000 });
await page.evaluate(() => window.__game.skipIntro());
await sleep(2500);

const LEFT  = { x: 0,   y: 0, width: 800, height: 900 };
const RIGHT = { x: 800, y: 0, width: 800, height: 900 };

async function shot(name, clip) {
  const p = path.join(OUT, `${name}.png`);
  await page.screenshot(clip ? { path: p, clip } : { path: p });
  console.log('shot', name, fs.statSync(p).size, 'bytes');
}

async function setCam(which, eye, look) {
  await page.evaluate(({ which, eye, look }) => window.__game.setCam(which, eye, look), { which, eye, look });
  await sleep(120);
  await page.evaluate(({ which, eye, look }) => window.__game.setCam(which, eye, look), { which, eye, look });
  await sleep(120);
}

// Put players in arena centre so both halves frame gameplay.
await page.evaluate(() => { window.__game.teleport(1, -2, 2); window.__game.teleport(2, 2, 2); });
await sleep(400);

// (a) Wide gameplay — let the follow-cams frame both characters. Full frame.
await page.evaluate(() => window.__game.unfreezeCam());
await sleep(700);
await shot('a_wide_gameplay');

// (b) Horizon view — park P1 camera low at arena edge looking across to the
// karst rings + sun. Reveals sky dome, mountain layering, clouds.
await setCam('p1', [0, 3, 26], [0, 8, -40]);
await shot('b_horizon', LEFT);

// (c) Bloom/emissive shot — frame a lantern (lanterns at e.g. (15,0,15)) up close.
await setCam('p2', [12, 2.4, 18], [15, 2.1, 15]);
await shot('c_bloom_lantern', RIGHT);

// (d) Low-quality comparison — toggle to low (direct render, no composer), reframe wide.
await page.evaluate(() => window.__applyQuality('low'));
await sleep(300);
await page.evaluate(() => window.__game.unfreezeCam());
await page.evaluate(() => { window.__game.teleport(1, -2, 2); window.__game.teleport(2, 2, 2); });
await sleep(700);
await shot('d_low_quality');
// restore high for tidiness
await page.evaluate(() => window.__applyQuality('high'));

console.log('--- console errors:', errors.length);
errors.forEach(e => console.log('  ', e));
console.log('--- console warnings:', warns.length);
warns.slice(0, 8).forEach(w => console.log('  WARN:', w));
await browser.close();
console.log('done');
