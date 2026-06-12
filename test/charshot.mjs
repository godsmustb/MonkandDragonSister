// Character close-up screenshot probe — Pass 2 visual verification.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'shots', 'chars');
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
await sleep(2500);
await page.evaluate(() => window.__game.unlockAll());
await sleep(300);

// Clip rectangles for each viewport (1600x900 split-screen)
const LEFT = { x: 0, y: 0, width: 800, height: 900 };
const RIGHT = { x: 800, y: 0, width: 800, height: 900 };

async function setForm(form) {
  let tries = 0;
  while ((await page.evaluate(() => window.__game.p2.form)) !== form && tries < 10) {
    await page.keyboard.press('Numpad4'); await sleep(350); tries++;
  }
}

// Close-up: park camera 'which' at eye looking at look; screenshot that viewport.
async function closeup(name, which, eye, look, clip) {
  await page.evaluate(({ which, eye, look }) => window.__game.setCam(which, eye, look),
    { which, eye, look });
  await sleep(150);
  // re-assert (a stray frame could move it before freeze took hold)
  await page.evaluate(({ which, eye, look }) => window.__game.setCam(which, eye, look),
    { which, eye, look });
  await sleep(120);
  const p = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: p, clip });
  console.log('shot', name, fs.statSync(p).size, 'bytes');
}

// Put both players at origin region
await page.evaluate(() => { window.__game.teleport(1, -1.2, 0); window.__game.teleport(2, 1.2, 0); });
await sleep(600);

// MONK — P1 at (-1.2,0). Camera left viewport, 3/4 front angle, head height.
await closeup('monk', 'p1', [-1.2 + 2.4, 1.5, 3.2], [-1.2, 0.95, 0], LEFT);

// SISTER human — P2 at (1.2,0). Ensure human.
await setForm('human');
await sleep(300);
await closeup('sister-human', 'p2', [1.2 - 2.4, 1.5, 3.2], [1.2, 0.95, 0], RIGHT);

// DRAGONS — P2; pull camera back (dragon is long ~6u). Frame head + front body.
for (const form of ['fire', 'ice', 'poison', 'water']) {
  await setForm(form);
  await sleep(500);
  await closeup('dragon-' + form, 'p2', [1.2 - 3.5, 2.2, 4.5], [1.2, 0.7, -1.5], RIGHT);
}

await page.evaluate(() => window.__game.unfreezeCam());
await browser.close();
console.log('done');
