// Pass 13 verification — jump + control remapping.
// Checks: default jump key raises the hero (airborne), __game.rebind redirects
// the action to a new key, the old key stops triggering it, the change persists
// to localStorage, and the remap UI opens. Run with the server up on 8321.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PAGE_URL = 'http://localhost:8321/index.html';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(HERE, 'shots');
let hardFail = false;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) hardFail = true;
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });

// Press a key and report the peak p1.pos.y observed over a short window.
// NOTE: window.__game.p1 is a read-only SNAPSHOT (its .pos is a live ref, but
// jump state like _airborne/_jumpCd is NOT writable through it). So instead of
// poking private fields, we WAIT for the hero to be grounded (pos.y settled)
// and for the jump cooldown to clear before each measurement.
async function peakJumpY(page, code) {
  // wait until grounded (pos.y stays ~0) so a prior jump can't bleed in
  for (let i = 0; i < 25; i++) {
    const y = await page.evaluate(() => window.__game.p1.pos.y);
    if (y < 0.02) break;
    await sleep(80);
  }
  await sleep(900); // clear the ~0.7s jump cooldown
  await page.evaluate(() => { window.__game.p1.pos.y = 0; });
  await page.keyboard.down(code);
  let peak = 0;
  for (let i = 0; i < 8; i++) {
    const y = await page.evaluate(() => window.__game.p1.pos.y);
    if (y > peak) peak = y;
    await sleep(60);
  }
  await page.keyboard.up(code);
  await sleep(700); // let it land before the next measurement
  return peak;
}

// ── Gameplay: jump + rebind ───────────────────────────────────────────────
{
  const consoleErrors = [], pageErrors = [];
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  await page.goto(PAGE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game && window.__game.state === 'MENU', { timeout: 30000 });

  await page.evaluate(() => window.__game.startGame());
  await page.waitForFunction(() => window.__game.state === 'INTRO', { timeout: 15000 });
  await page.keyboard.press('Space');
  await page.waitForFunction(() => window.__game.state === 'WAVE1', { timeout: 15000 });
  await sleep(400);

  // Default jump key for P1 is KeyC.
  const peakDefault = await peakJumpY(page, 'KeyC');
  check('Default jump (KeyC) makes P1 airborne', peakDefault > 0.2, `peakY=${peakDefault.toFixed(2)}`);

  // bindings exposed
  const hasBindings = await page.evaluate(() => !!(window.__game.bindings && window.__game.bindings.p1 && window.__game.bindings.p1.jump));
  check('window.__game.bindings exposed', hasBindings);

  // Rebind P1 jump → KeyZ, then KeyZ should jump and KeyC should NOT.
  await page.evaluate(() => window.__game.rebind('p1', 'jump', 'KeyZ'));
  await sleep(800); // clear jump cooldown
  const peakNewKey = await peakJumpY(page, 'KeyZ');
  check('Rebound jump key (KeyZ) works', peakNewKey > 0.2, `peakY=${peakNewKey.toFixed(2)}`);
  await sleep(800);
  const peakOldKey = await peakJumpY(page, 'KeyC');
  check('Old jump key (KeyC) no longer jumps after rebind', peakOldKey < 0.05, `peakY=${peakOldKey.toFixed(2)}`);

  // Persistence to localStorage.
  const persisted = await page.evaluate(() => {
    const raw = localStorage.getItem('mds_bindings');
    return raw && raw.includes('KeyZ');
  });
  check('Rebind persisted to localStorage (mds_bindings has KeyZ)', !!persisted);

  check('No console errors during jump/rebind', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
  check('No page errors during jump/rebind', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
  await page.close();
}

// ── Remap UI opens from the main menu ─────────────────────────────────────
{
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.goto(PAGE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game && window.__game.state === 'MENU', { timeout: 30000 });
  const opened = await page.evaluate(() => {
    const els = [...document.querySelectorAll('div,span,button')];
    const el = els.filter(e => e.textContent.trim() === 'CONTROLS' && e.offsetParent !== null)
                 .sort((a, b) => a.textContent.length - b.textContent.length)[0];
    if (!el) return false;
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return true;
  });
  check('CONTROLS menu item clicked', opened);
  await sleep(400);
  const overlayVisible = await page.evaluate(() => {
    const o = document.getElementById('controls-overlay');
    return !!o && getComputedStyle(o).display !== 'none';
  });
  check('Remap overlay visible', overlayVisible);
  await page.screenshot({ path: path.join(SHOTS, 'verify-controls-remap.png') });
  await page.close();
}

await browser.close();
console.log(`\n===== CONTROLS VERIFY: ${hardFail ? 'FAIL' : 'OK'} =====`);
process.exit(hardFail ? 1 : 0);
