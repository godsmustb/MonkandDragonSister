// Quick art check screenshots for FIX 9 review
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PAGE_URL  = 'http://localhost:8321/index.html';
const HERE      = path.dirname(fileURLToPath(import.meta.url));
const SHOTS     = path.join(HERE, 'shots');

const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader','--use-angle=swiftshader'] });
const page    = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto(PAGE_URL, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__game && window.__game.state, null, { timeout: 20000 });
await new Promise(r => setTimeout(r, 1200));

// Boot into wave 1 gameplay
await page.evaluate(() => window.__game.skipIntro());
await page.waitForFunction(() => window.__game.state === 'WAVE1', null, { timeout: 15000 });
await new Promise(r => setTimeout(r, 800));

// Move P1 to a nice view angle and P2 to the side
await page.evaluate(() => {
  window.__game.teleport(1, 0, 2);
  window.__game.teleport(2, 5, 6);
});
await new Promise(r => setTimeout(r, 600));

// Wide gameplay shot
await page.screenshot({ path: path.join(SHOTS, 'fix9-wave1-wide.png') });
console.log('Saved fix9-wave1-wide.png');

// Move cameras to look at cherry trees + ground
await page.evaluate(() => {
  window.__ctx.game._freezeCam = true;
  // Left viewport cam: look at the outer cherry trees (at z≈-25)
  window.__ctx.cameras.p1.position.set(0, 5, 5);
  window.__ctx.cameras.p1.lookAt(0, 3, -22);
  window.__ctx.cameras.p1.updateMatrixWorld(true);
  // Right viewport cam: look at the near cherry tree at (8,-9) + ground
  window.__ctx.cameras.p2.position.set(12, 5, 0);
  window.__ctx.cameras.p2.lookAt(8, 2, -9);
  window.__ctx.cameras.p2.updateMatrixWorld(true);
});
await new Promise(r => setTimeout(r, 600));
await page.screenshot({ path: path.join(SHOTS, 'fix9-cherry-ground.png') });
console.log('Saved fix9-cherry-ground.png');

await browser.close();
console.log('Done');
