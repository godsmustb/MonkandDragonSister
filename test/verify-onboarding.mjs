// verify-onboarding.mjs — intro cinematic + 3-slide tutorial via the L1 BEGIN path,
// then confirms gameplay starts. Screenshots each stage. Server on 8321.
import { chromium } from 'playwright';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
const p = await ctx.newPage();
const errs = []; p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); p.on('pageerror', e => errs.push('' + e.message));
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; const ok = (c, m, x) => { if (c) { pass++; console.log('PASS ', m, x !== undefined ? '— ' + x : ''); } else { fail++; console.log('FAIL ', m, x !== undefined ? '— ' + x : ''); } };

await p.goto('http://localhost:8321/index.html', { waitUntil: 'load' });
await p.evaluate(() => { try { localStorage.removeItem('mds_onboard_seen'); } catch {} });
await p.reload({ waitUntil: 'load' });
await p.waitForFunction(() => window.__game && window.__game.state, null, { timeout: 20000 });

const click = async (t) => p.evaluate((tx) => { const e=[...document.querySelectorAll('.menu-item,.mds-btn')].find(x=>x.textContent.trim().toUpperCase().includes(tx)); if(e){e.click();return true} return false; }, t);
await click('START GAME'); await sleep(150);
await click('1 PLAYER'); await sleep(250);
await click('BEGIN'); await sleep(700);

// Intro cinematic overlay should be up (z-index 200 scrim with CONTINUE/▶).
const cineUp = await p.evaluate(() => [...document.querySelectorAll('.mds-scrim')].some(s => s.style.zIndex === '200'));
ok(cineUp, 'intro cinematic overlay appeared');
await p.screenshot({ path: 'shots/launch/onboard-cine1.png' });
// advance through 3 cinematic panels
await p.keyboard.press('ArrowRight'); await sleep(400);
await p.keyboard.press('ArrowRight'); await sleep(400);
await p.screenshot({ path: 'shots/launch/onboard-cine3.png' });
await p.keyboard.press('ArrowRight'); await sleep(700); // finishes cinematic -> tutorial

// Tutorial slide 1 (CONTROLS)
const tutUp = await p.evaluate(() => document.body.innerText.includes('CONTROLS'));
ok(tutUp, 'tutorial reached (CONTROLS slide)');
await p.screenshot({ path: 'shots/launch/onboard-tut-controls.png' });
await p.keyboard.press('ArrowRight'); await sleep(400); // POWERS
await p.screenshot({ path: 'shots/launch/onboard-tut-powers.png' });
const powUp = await p.evaluate(() => document.body.innerText.includes('POWERS'));
ok(powUp, 'tutorial POWERS slide');
await p.keyboard.press('ArrowRight'); await sleep(400); // ELEMENTS
await p.screenshot({ path: 'shots/launch/onboard-tut-elements.png' });
const elUp = await p.evaluate(() => document.body.innerText.includes('ELEMENT RING'));
ok(elUp, 'tutorial ELEMENT RING slide');
await p.keyboard.press('ArrowRight'); await sleep(900); // finish -> gameplay

const st = await p.evaluate(() => window.__game.state);
ok(st && st.startsWith('WAVE'), 'gameplay started after onboarding', st);
ok(errs.length === 0, 'zero console/page errors', errs.slice(0, 3).join(' | '));
console.log(`\n===== ONBOARDING: ${pass} passed, ${fail} failed =====`);
await b.close();
process.exit(fail === 0 ? 0 : 1);
