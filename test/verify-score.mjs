// Verifies: circular boundary clamp (no off-disc/air), menu selection persistence,
// score-on-kill, and the arcade high-score table hooks.
import { chromium } from 'playwright';
let hardFail = false;
function check(name, ok, detail = '') { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`); if (!ok) hardFail = true; }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });

// ── Block 1: gameplay (boundary clamp + score + leaderboard) ──────────────
{
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
  await sleep(400);

  // Boundary: teleport to a far corner; the circular clamp should pull P1 back
  // onto the disc and keep it grounded (y≈0), not floating in the void.
  await page.evaluate(() => window.__game.teleport(1, 100, 100));
  // Poll until the update loop applies the circular clamp (robust against a
  // load-starved headless sim that may not advance a frame for a while).
  let p = { x: 100, y: 0, z: 100 };
  for (let i = 0; i < 25; i++) {
    p = await page.evaluate(() => ({ x: window.__game.p1.pos.x, y: window.__game.p1.pos.y, z: window.__game.p1.pos.z }));
    if (Math.hypot(p.x, p.z) <= 57) break;
    await sleep(80);
  }
  const dist = Math.hypot(p.x, p.z);
  check('Player clamped to circular disc (not square corner)', dist <= 57, `dist=${dist.toFixed(1)}`);
  check('Player stays grounded (y≈0, not in air)', Math.abs(p.y) < 0.2, `y=${p.y.toFixed(2)}`);

  // Score on kill.
  const before = await page.evaluate(() => window.__game.score);
  for (let i = 0; i < 10; i++) {
    await page.evaluate(() => { const s = window.__game.spirits.find(x => x.alive); if (s) window.__game.teleport(1, s.pos.x + 0.4, s.pos.z); });
    await page.keyboard.press('Space'); await page.keyboard.press('KeyU');
    await sleep(120);
  }
  const after = await page.evaluate(() => window.__game.score);
  check('Score increases on kills', after > before, `before=${before} after=${after}`);
  check('window.__game.score exposed', typeof after === 'number');

  // Leaderboard hooks.
  const lb = await page.evaluate(() => { window.__game.recordScore(99999); return window.__game.highScores; });
  check('recordScore + highScores work, sorted desc', Array.isArray(lb) && lb[0] && lb[0].score === 99999, `top=${lb && lb[0] && lb[0].score}`);

  check('No console errors (gameplay)', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
  check('No page errors (gameplay)', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
  await page.close();
}

// ── Block 2: menu selection persistence (bug #3) ──────────────────────────
{
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.goto('http://localhost:8321/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game && window.__game.state === 'MENU', { timeout: 30000 });
  const clickByText = (t) => page.evaluate((txt) => {
    const el = [...document.querySelectorAll('div,span,button')].filter(e => e.textContent.trim() === txt && e.offsetParent !== null).sort((a, b) => a.textContent.length - b.textContent.length)[0];
    if (!el) return false; el.dispatchEvent(new MouseEvent('click', { bubbles: true })); return true;
  }, t);
  await clickByText('START GAME'); await sleep(200);
  await clickByText('1 PLAYER'); await sleep(200);
  await clickByText('THE DRAGON SISTER'); await sleep(150);
  // Move the mouse OFF the button (mouseleave) — the gold selection must persist.
  // Read the INLINE style.color (source of truth); getComputedStyle lags behind
  // the CSS color-transition in throttled headless, so it is not reliable here.
  const color = await page.evaluate(() => {
    const el = [...document.querySelectorAll('div')].filter(e => e.textContent.trim() === 'THE DRAGON SISTER' && e.offsetParent !== null)[0];
    if (!el) return null;
    el.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
    return el.style.color; // gold #ffdd55 normalizes to rgb(255, 221, 85)
  });
  check('Selected character stays highlighted after mouseleave', color === 'rgb(255, 221, 85)', `color=${color}`);
  await page.close();
}

await browser.close();
console.log(`\n===== SCORE/FIX VERIFY: ${hardFail ? 'FAIL' : 'OK'} =====`);
process.exit(hardFail ? 1 : 0);
