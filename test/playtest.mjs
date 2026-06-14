// playtest.mjs — Autonomous self-playtest. Drives each level via the Level Selector,
// plays real combat (teleport + attack, like e2e), screenshots every wave, and writes
// a report of what works / fails / how far each level gets.
//   node playtest.mjs            (server must be on 8321)
// Output: shots/playtest/*.png  +  playtest-report.json  +  console summary.
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';

mkdirSync('shots/playtest', { recursive: true });
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1280, height: 800 } });
const allErrs = [];
page.on('console', m => { if (m.type() === 'error') allErrs.push(m.text()); });
page.on('pageerror', e => allErrs.push('PAGEERR ' + e.message));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const g = (expr) => page.evaluate(e => { try { return Function('G', 'return ' + e)(window.__game); } catch { return null; } }, expr);

await page.goto('http://localhost:8321/index.html', { waitUntil: 'load' });
await page.waitForFunction(() => window.__game && window.__game.state, null, { timeout: 20000 });

const report = { startedAt: new Date().toISOString(), levels: {}, errors: [] };

// Focus the first living spirit, teleport both players adjacent, attack with dwell
// (mirrors e2e clearWave — attacks have cooldowns, so 280ms between presses).
async function combatTick() {
  const spirits = await g('(G.spirits||[]).map(s=>({x:s.pos.x,z:s.pos.z}))');
  if (!spirits || !spirits.length) { await sleep(400); return; }
  const s = spirits[0];
  await page.evaluate(([x, z]) => { window.__game.teleport(1, x + 1.5, z); window.__game.teleport(2, x - 1.5, z); }, [s.x, s.z]);
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Space');
    await page.keyboard.press('Enter');
    await sleep(280);
  }
}

async function playLevel(n) {
  const L = { level: n, reached: [], maxWave: 0, bossSeen: false, completed: false, errorsDuring: 0, notes: [] };
  const errBefore = allErrs.length;
  // Fresh start at level n via the selector path.
  await page.evaluate((lvl) => {
    // ensure we're at menu; if mid-game, hard reset by reloading is heavy — instead just
    // set start level and (re)enter via skipIntro from MENU.
    window.__game.setStartLevel(lvl);
  }, n);
  // If not at MENU (previous level left us in-game), reload to reset cleanly.
  const st0 = await g('G.state');
  if (st0 !== 'MENU') {
    await page.goto('http://localhost:8321/index.html', { waitUntil: 'load' });
    await page.waitForFunction(() => window.__game && window.__game.state, null, { timeout: 20000 });
    await page.evaluate((lvl) => window.__game.setStartLevel(lvl), n);
  }
  await page.evaluate(() => window.__game.skipIntro());
  await sleep(400);
  // Power up so combat resolves fast.
  await page.evaluate(() => { window.__game.unlockAll && window.__game.unlockAll(); window.__game.setLevel(1, 10); window.__game.setLevel(2, 10); });
  await page.keyboard.press('Numpad4'); // sister to a dragon form

  const deadline = Date.now() + 95000; // ~95s wall budget per level
  let lastShotWave = -1;
  while (Date.now() < deadline) {
    const state = await g('G.state');
    if (!state) break;
    if (state === 'COMPLETE') { L.completed = true; L.reached.push('COMPLETE'); break; }
    if (state === 'GAMEOVER') { L.notes.push('hit GAMEOVER'); L.reached.push('GAMEOVER'); break; }
    const m = /WAVE(\d)/.exec(state);
    if (m) {
      const w = +m[1];
      L.maxWave = Math.max(L.maxWave, w);
      if (!L.reached.includes(state)) L.reached.push(state);
      if (w >= 4) { const boss = await g('(G.spirits||[]).some(s=>s.maxHp>=150)'); if (boss) L.bossSeen = true; }
      if (w !== lastShotWave) {
        lastShotWave = w;
        await page.screenshot({ path: `shots/playtest/L${n}_wave${w}.png` });
      }
    }
    await combatTick();
  }
  // final screenshot
  await page.screenshot({ path: `shots/playtest/L${n}_final.png` });
  L.errorsDuring = allErrs.length - errBefore;
  L.finalState = await g('G.state');
  report.levels['L' + n] = L;
  console.log(`L${n}: reached ${L.reached.join(' → ') || '(none)'} | maxWave ${L.maxWave} | boss:${L.bossSeen} | complete:${L.completed} | errs:${L.errorsDuring}`);
}

for (const n of [1, 2, 3]) {
  try { await playLevel(n); }
  catch (e) { console.log(`L${n} crashed: ${e.message}`); report.levels['L' + n] = { level: n, crashed: e.message }; }
}

report.errors = [...new Set(allErrs)].slice(0, 20);
report.totalUniqueErrors = new Set(allErrs).size;
writeFileSync('playtest-report.json', JSON.stringify(report, null, 2));
console.log('\n=== PLAYTEST DONE ===');
console.log('unique console/page errors:', report.totalUniqueErrors);
if (report.errors.length) console.log('errors:', report.errors.slice(0, 8).join('\n  '));
await b.close();
