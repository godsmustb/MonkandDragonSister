// Pass 15 verification — campaign framework exposure + lands preview UI + DDA hook.
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

// Framework exposed on debug API.
const lands = await page.evaluate(() => window.__game.lands);
check('window.__game.lands is 4 lands', Array.isArray(lands) && lands.length === 4, `len=${Array.isArray(lands) ? lands.length : 'n/a'}`);
check('Land 1 playable, Lands 2-4 comingSoon', !!lands && lands[0] && lands[0].comingSoon === false && lands[3] && lands[3].comingSoon === true);

const dda = await page.evaluate(() => window.__game.dda);
check('window.__game.dda exposes {S,m} in band', dda && typeof dda.S === 'number' && typeof dda.m === 'number' && dda.m >= 0.85 && dda.m <= 1.15, `S=${dda && dda.S} m=${dda && dda.m}`);

// Campaign preview opens from the main menu.
const clicked = await page.evaluate(() => {
  const els = [...document.querySelectorAll('div,span,button')];
  const el = els.filter(e => e.textContent.trim() === 'CAMPAIGN' && e.offsetParent !== null).sort((a, b) => a.textContent.length - b.textContent.length)[0];
  if (!el) return false;
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  return true;
});
check('CAMPAIGN menu item clicked', clicked);
await sleep(400);
const overlayUp = await page.evaluate(() => {
  // any newly-shown overlay mentioning a land name
  return document.body.innerText.includes('Coming Soon') || document.body.innerText.includes('COMING SOON') || document.body.innerText.toLowerCase().includes('trial');
});
check('Campaign/lands preview shows land states', overlayUp);
await page.screenshot({ path: 'shots/verify-campaign.png' });

// Regression: normal 2P start still works after menu items shifted.
await page.evaluate(() => window.__game.startGame());
await page.waitForFunction(() => window.__game.state === 'INTRO', { timeout: 15000 });
await page.keyboard.press('Space');
const reachedWave = await page.waitForFunction(() => window.__game.state === 'WAVE1', { timeout: 15000 }).then(() => true).catch(() => false);
check('2P start flow still reaches WAVE1', reachedWave);
const w1 = await page.evaluate(() => window.__game.spirits.filter(s => s.alive).length);
check('Trial Wave 1 still spawns 3 (framework did not touch trial)', w1 === 3, `count=${w1}`);

check('No console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
check('No page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

await browser.close();
console.log(`\n===== CAMPAIGN VERIFY: ${hardFail ? 'FAIL' : 'OK'} =====`);
process.exit(hardFail ? 1 : 0);
