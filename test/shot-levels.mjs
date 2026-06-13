import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
await p.goto('http://localhost:8321/index.html', { waitUntil: 'load' });
await p.waitForFunction(() => window.__game && window.__game.state, null, { timeout: 20000 });
await p.evaluate(() => { window.__game.startGame(); window.__game.skipIntro(); window.__game.unlockAll(); });
await p.waitForTimeout(500);
for (const lvl of [1, 2, 3]) {
  await p.evaluate((n) => window.__game.startLevel(n), lvl);
  await p.waitForTimeout(1800);
  await p.screenshot({ path: `shots/env/level${lvl}_theme.png` });
  console.log('shot level', lvl, '->', 'shots/env/level' + lvl + '_theme.png');
}
await b.close();
