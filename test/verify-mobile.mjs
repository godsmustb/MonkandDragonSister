// Mobile compatibility: emulate Android Chrome (Chromium/Pixel) and iPhone Safari
// (WebKit/iPhone). Verifies touch detection, tap menu-nav, tap-to-dismiss intro,
// the on-screen touch overlay, and touch movement/actions.
import { chromium, webkit, devices } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(HERE, 'shots');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const URL = 'http://localhost:8321/index.html';
let hardFail = false;
function check(label, name, ok, detail = '') { console.log(`${ok ? 'PASS' : 'FAIL'}  [${label}] ${name}${detail ? ' — ' + detail : ''}`); if (!ok) hardFail = true; }

async function tapText(page, t) {
  const box = await page.evaluate((txt) => {
    const el = [...document.querySelectorAll('div,span,button')].filter(e => e.textContent.trim() === txt && e.offsetParent !== null).sort((a,b)=>a.textContent.length-b.textContent.length)[0];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width/2, y: r.y + r.height/2 };
  }, t);
  if (box) await page.touchscreen.tap(box.x, box.y);
  return !!box;
}

async function testDevice(label, browser, device) {
  const ctx = await browser.newContext({ ...device, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  const cerr = []; page.on('console', m => { if (m.type()==='error') cerr.push(m.text()); });
  await page.goto(URL, { waitUntil: 'domcontentloaded' });

  // WebGL availability (headless WebKit may lack it).
  const booted = await page.waitForFunction(() => window.__game && window.__game.state === 'MENU', { timeout: 20000 }).then(()=>true).catch(()=>false);
  if (!booted) {
    const webglErr = await page.evaluate(() => { const e = document.getElementById('webgl-error'); return e && getComputedStyle(e).display !== 'none'; }).catch(()=>false);
    check(label, 'game boots', false, webglErr ? 'WebGL unavailable in this headless engine (renders fine on real device)' : 'did not reach MENU');
    await page.screenshot({ path: path.join(SHOTS, `mobile-${label}-fail.png`) }).catch(()=>{});
    await ctx.close();
    return;
  }
  check(label, 'game boots to MENU', true);
  const isTouch = await page.evaluate(() => window.__game.isTouch);
  check(label, 'touch detected (__game.isTouch)', isTouch === true, `isTouch=${isTouch}`);

  // Tap-navigate the menu to start a 1P game.
  await tapText(page, 'START GAME'); await sleep(300);
  const okMode = await tapText(page, '1 PLAYER'); await sleep(250);
  await tapText(page, 'THE MONK'); await sleep(150);
  const okBegin = await tapText(page, 'BEGIN');
  check(label, 'menu tap-navigation works', okMode && okBegin);
  const gotIntro = await page.waitForFunction(() => window.__game.state === 'INTRO', { timeout: 8000 }).then(()=>true).catch(()=>false);
  // Tap anywhere to dismiss the intro (no keyboard on mobile).
  if (gotIntro) await page.touchscreen.tap(device.viewport.width/2, device.viewport.height/2);
  const gotWave = await page.waitForFunction(() => window.__game.state === 'WAVE1', { timeout: 8000 }).then(()=>true).catch(()=>false);
  check(label, 'tap dismisses intro → WAVE1', gotWave);
  await sleep(500);

  // Touch overlay visible during gameplay.
  const overlay = await page.evaluate(() => { const o = document.getElementById('touch-overlay'); return !!o && getComputedStyle(o).display !== 'none'; });
  check(label, 'on-screen touch controls shown in gameplay', overlay);
  await page.screenshot({ path: path.join(SHOTS, `mobile-${label}-gameplay.png`) });

  // Touch movement via the debug hook.
  const z0 = await page.evaluate(() => window.__game.p1.pos.z);
  await page.evaluate(() => window.__game.touchMove(1, 0, -1));
  await sleep(700);
  await page.evaluate(() => window.__game.touchMove(1, 0, 0));
  const z1 = await page.evaluate(() => window.__game.p1.pos.z);
  check(label, 'touch joystick moves the hero', z1 < z0 - 0.3, `z ${z0.toFixed(1)}→${z1.toFixed(1)}`);

  // Touch attack via the debug hook.
  await page.evaluate(() => { const s = window.__game.spirits.find(x=>x.alive); if (s) window.__game.teleport(1, s.pos.x+0.4, s.pos.z); });
  let dmg = 0;
  for (let i = 0; i < 6; i++) { await page.evaluate(() => window.__game.touchAction(1, 'attack')); await sleep(120); const d = await page.evaluate(() => window.__game.lastDamage); if (d && d.amount > dmg) dmg = d.amount; }
  check(label, 'touch attack button deals damage', dmg > 0, `dmg=${dmg}`);

  check(label, 'no console errors', cerr.length === 0, cerr.slice(0,2).join(' | '));
  check(label, 'no page errors', errs.length === 0, errs.slice(0,2).join(' | '));
  await ctx.close();
}

// Android Chrome (Chromium + Pixel 5, software GL)
{
  const b = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
  await testDevice('android-chrome', b, devices['Pixel 5']);
  await b.close();
}
// iPhone Safari (WebKit + iPhone 13)
{
  const b = await webkit.launch({ headless: true });
  await testDevice('ios-safari', b, devices['iPhone 13']);
  await b.close();
}

console.log(`\n===== MOBILE VERIFY: ${hardFail ? 'FAIL' : 'OK'} =====`);
process.exit(hardFail ? 1 : 0);
