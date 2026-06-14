// verify-music.mjs — recorded-music layer: with ?music=1 + tracks present, a track loads
// and crossfades; with no flag, procedural only (no errors). Server on 8321.
import { chromium } from 'playwright';
const b = await chromium.launch();
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('PASS ', m, x !== undefined ? '— ' + x : ''); } else { fail++; console.log('FAIL ', m, x !== undefined ? '— ' + x : ''); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// 1) Default (no flag): recorded music stays OFF, no errors.
{
  const p = await b.newPage();
  const errs = []; p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); p.on('pageerror', e => errs.push('' + e.message));
  await p.goto('http://localhost:8321/index.html', { waitUntil: 'load' });
  await p.waitForFunction(() => window.__game && window.__game.state, null, { timeout: 20000 });
  await p.evaluate(() => window.__game.startGame());
  await p.keyboard.press('Space'); await sleep(800);
  const ms = await p.evaluate(() => window.__game.music);
  ok(ms && ms.recordedEnabled === false, 'default: recorded music OFF', ms && ms.recordedEnabled);
  ok(errs.length === 0, 'default: zero errors', errs.slice(0, 2).join(' | '));
  await p.close();
}

// 2) ?music=1: a recorded track loads (recordedKey set), no errors.
{
  const p = await b.newPage();
  const errs = []; p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); p.on('pageerror', e => errs.push('' + e.message));
  await p.goto('http://localhost:8321/index.html?music=1', { waitUntil: 'load' });
  await p.waitForFunction(() => window.__game && window.__game.state, null, { timeout: 20000 });
  await p.evaluate(() => window.__game.startGame());
  await p.keyboard.press('Space'); // gesture → audio context
  // give the scheduler + media load time
  let key = null;
  for (let i = 0; i < 20; i++) { await sleep(500); key = await p.evaluate(() => window.__game.music && window.__game.music.recordedKey); if (key) break; }
  const ms = await p.evaluate(() => window.__game.music);
  ok(ms && ms.recordedEnabled === true, '?music=1: recorded music ENABLED', ms && ms.recordedEnabled);
  ok(!!key, '?music=1: a recorded track loaded', key);
  ok(errs.length === 0, '?music=1: zero errors', errs.slice(0, 3).join(' | '));
  await p.close();
}

console.log(`\n===== MUSIC: ${pass} passed, ${fail} failed =====`);
await b.close();
process.exit(fail === 0 ? 0 : 1);
