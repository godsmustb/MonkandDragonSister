// Pass 12 verification — drives the NEW 1P front-end flow (mode select →
// character select → begin), which the main e2e.mjs (2P-only) does not cover.
// Checks: no console/page errors (esp. the single full-screen composer path),
// state reaches WAVE1, single-camera full-screen, one HUD panel in solo, and
// the Trial-Mode complete-screen buttons exist.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PAGE_URL = 'http://localhost:8321/index.html';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(HERE, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

let hardFail = false;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) hardFail = true;
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const browser = await chromium.launch({
  headless: true,
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
});

async function clickByText(page, text) {
  return page.evaluate((t) => {
    const els = [...document.querySelectorAll('div,span,button')];
    // deepest element whose trimmed text equals the label
    const matches = els.filter(e => e.textContent.trim() === t && e.offsetParent !== null);
    const el = matches.sort((a, b) => a.textContent.length - b.textContent.length)[0]
            || els.find(e => e.textContent.trim().includes(t) && e.offsetParent !== null);
    if (!el) return false;
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return true;
  }, text);
}

async function run(label, { char, partner }) {
  const consoleErrors = [], pageErrors = [];
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  await page.goto(PAGE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game && window.__game.state === 'MENU', { timeout: 30000 });

  check(`[${label}] START GAME clicked`, await clickByText(page, 'START GAME'));
  await sleep(250);
  check(`[${label}] 1 PLAYER clicked`, await clickByText(page, '1 PLAYER'));
  await sleep(250);
  const charLabel = char === 'sister' ? 'THE DRAGON SISTER' : 'THE MONK';
  check(`[${label}] ${charLabel} clicked`, await clickByText(page, charLabel));
  await sleep(150);
  if (partner === 'ai') { check(`[${label}] AI PARTNER clicked`, await clickByText(page, 'AI PARTNER')); await sleep(150); }
  check(`[${label}] BEGIN clicked`, await clickByText(page, 'BEGIN'));

  // INTRO → dismiss with a key → WAVE1
  const gotIntro = await page.waitForFunction(() => window.__game.state === 'INTRO', { timeout: 15000 }).then(() => true).catch(() => false);
  check(`[${label}] reached INTRO`, gotIntro);
  await page.keyboard.press('Space');
  const gotWave = await page.waitForFunction(() => window.__game.state === 'WAVE1', { timeout: 15000 }).then(() => true).catch(() => false);
  check(`[${label}] reached WAVE1`, gotWave);
  await sleep(800);

  // DOM checks: in solo, the partner HUD panel + divider should be hidden.
  const dom = await page.evaluate(() => {
    const p2 = document.getElementById('hud-p2');
    const div = document.getElementById('divider');
    const cs = (el) => el ? getComputedStyle(el) : null;
    return {
      p2hidden: !p2 || cs(p2).display === 'none' || cs(p2).width === '0px',
      dividerHidden: !div || cs(div).display === 'none',
      hasEndlessBtn: !!document.getElementById('btn-endless'),
      hasRestartBtn: !!document.getElementById('btn-restart'),
      hasMenuBtn: !!document.getElementById('btn-mainmenu'),
    };
  });
  if (partner === 'solo') check(`[${label}] partner HUD panel hidden`, dom.p2hidden, `p2hidden=${dom.p2hidden}`);
  check(`[${label}] Trial-Mode buttons exist in DOM`, dom.hasEndlessBtn && dom.hasRestartBtn && dom.hasMenuBtn,
    `endless=${dom.hasEndlessBtn} restart=${dom.hasRestartBtn} menu=${dom.hasMenuBtn}`);

  await page.screenshot({ path: path.join(SHOTS, `verify-1p-${label}.png`) });
  check(`[${label}] no console errors`, consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
  check(`[${label}] no page errors`, pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
  await page.close();
}

await run('monk-solo', { char: 'monk', partner: 'solo' });
await run('sister-ai', { char: 'sister', partner: 'ai' });

await browser.close();
console.log(`\n===== 1P VERIFY: ${hardFail ? 'FAIL' : 'OK'} =====`);
process.exit(hardFail ? 1 : 0);
