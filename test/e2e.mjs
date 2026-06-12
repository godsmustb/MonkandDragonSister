// E2E integration test for "The Monk & The Dragon Sister" — Quest 1
// Drives both players through the entire quest via the window.__game debug API + real key presses.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PAGE_URL = 'http://localhost:8321/index.html';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(HERE, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

const results = [];
let hardFail = false;
function check(name, ok, detail = '', soft = false) {
  results.push({ name, ok, detail, soft });
  console.log(`${ok ? 'PASS' : soft ? 'WARN' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok && !soft) hardFail = true;
}

const consoleErrors = [];
const pageErrors = [];

const browser = await chromium.launch({
  headless: true,
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => pageErrors.push(String(e)));

const g = (expr) => page.evaluate(`(() => { const G = window.__game; return ${expr}; })()`);
const snap = () => page.evaluate(() => {
  const G = window.__game;
  return {
    state: G.state, wave: G.wave,
    spirits: G.spirits.map(s => ({ x: s.pos.x, y: s.pos.y, z: s.pos.z, hp: s.hp, maxHp: s.maxHp, element: s.element, alive: s.alive })),
    p1: { x: G.p1.pos.x, z: G.p1.pos.z, hp: G.p1.hp, maxHp: G.p1.maxHp, level: G.p1.level, xp: G.p1.xp },
    p2: { x: G.p2.pos.x, z: G.p2.pos.z, hp: G.p2.hp, maxHp: G.p2.maxHp, level: G.p2.level, xp: G.p2.xp, form: G.p2.form, unlocked: G.p2.unlocked },
    lastDamage: G.lastDamage, relics: G.relics,
  };
});
const shot = async (name) => { const p = path.join(SHOTS, `${name}.png`); await page.screenshot({ path: p }); return fs.statSync(p).size; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function waitForState(state, timeoutMs = 30000) {
  try {
    await page.waitForFunction((s) => window.__game.state === s, state, { timeout: timeoutMs });
    return true;
  } catch { return false; }
}

// Teleport both players onto the nearest spirit and mash all four attack keys until wave clears.
async function clearWave(stateName, nextStates, timeoutMs = 150000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const s = await snap();
    if (s.state !== stateName) return s.state;
    if (s.spirits.length > 0) {
      const sp = s.spirits[0];
      await page.evaluate(([x, z]) => { window.__game.teleport(1, x + 1.5, z); window.__game.teleport(2, x - 1.5, z); }, [sp.x, sp.z]);
      for (let i = 0; i < 3; i++) {
        await page.keyboard.press('Space');
        await page.keyboard.press('Enter');
        await sleep(280);
      }
    } else {
      await sleep(400); // intermission between waves
    }
  }
  return (await snap()).state;
}

try {
  // ---------- 1. Load, no errors, game boots ----------
  await page.goto(PAGE_URL, { waitUntil: 'domcontentloaded' });
  const booted = await page.waitForFunction(() => window.__game && window.__game.state, null, { timeout: 20000 }).then(() => true).catch(() => false);
  check('Game boots and exposes window.__game', booted);
  if (!booted) throw new Error('Game did not boot');
  await sleep(1500);

  const hudOk = await page.evaluate(() => {
    const els = [...document.querySelectorAll('.hud-bottom')];
    return els.length === 2 && els.every(el => { const r = el.getBoundingClientRect(); return r.y > 0 && r.y < innerHeight && r.width > 100; });
  });
  check('Both bottom HUD panels positioned on-screen', hudOk);

  const introSize = await shot('01-intro');
  check('Canvas renders (intro screenshot non-trivial)', introSize > 40000, `${introSize} bytes`);
  check('Initial state is INTRO', (await g('G.state')) === 'INTRO', await g('G.state'));

  // ---------- 2. Intro dismiss via action key ----------
  await page.keyboard.press('Space');
  check('Action key dismisses intro → WAVE1', await waitForState('WAVE1', 8000));
  await sleep(1000);

  let s = await snap();
  check('Wave 1 spawns 3 spirits', s.spirits.length === 3, `${s.spirits.length} spirits`);
  check('Wave 1 spirits are neutral element', s.spirits.every(x => x.element === 'neutral'), s.spirits.map(x => x.element).join(','));
  check('Players start at level 1', s.p1.level === 1 && s.p2.level === 1);
  check('P2 starts in human form', s.p2.form === 'human', s.p2.form);

  // ---------- 3. Movement ----------
  // Hold the key and poll until the player has visibly moved (slow headless renderer can stall frames)
  async function moveTest(key, playerKey, label) {
    const b = await snap();
    await page.keyboard.down(key);
    let dist = 0;
    const t0 = Date.now();
    while (Date.now() - t0 < 4000) {
      await sleep(300);
      const a = await snap();
      dist = Math.hypot(a[playerKey].x - b[playerKey].x, a[playerKey].z - b[playerKey].z);
      if (dist > 0.5) break;
    }
    await page.keyboard.up(key);
    check(label, dist > 0.5, `moved ${dist.toFixed(2)}`);
  }
  await moveTest('KeyW', 'p1', 'P1 moves with W');
  await moveTest('ArrowUp', 'p2', 'P2 moves with ArrowUp');

  // ---------- 4. Attack aliases (all four) ----------
  // Attacks are directional (cones/strikes along facing) — try all 4 sides of the spirit
  const SIDES = [[1.0, 0], [-1.0, 0], [0, 1.0], [0, -1.0]];
  async function attackUntilDamage(playerNum, key, tries = 16) {
    await page.evaluate(() => { window.__game.lastDamage = null; });
    await sleep(600); // let prior attack cooldowns expire
    for (let i = 0; i < tries; i++) {
      const cur = await snap();
      if (!cur.spirits.length) return null;
      const t = cur.spirits[0];
      const [ox, oz] = SIDES[i % 4];
      await page.evaluate(([p, x, z]) => window.__game.teleport(p, x, z), [playerNum, t.x + ox, t.z + oz]);
      await page.keyboard.press(key); await sleep(300);
      const dmg = await g('G.lastDamage');
      if (dmg) return dmg;
    }
    return false;
  }
  async function attackTest(key, who) {
    const dmg = await attackUntilDamage(who === 'P1' ? 1 : 2, key);
    if (dmg === null) return check(`${who} attack via ${key} deals damage`, false, 'no spirits left to test on');
    check(`${who} attack via ${key} deals damage`, !!dmg && dmg.amount > 0, dmg ? `amount=${dmg.amount} mult=${dmg.mult}` : 'no damage registered');
  }
  await attackTest('Space', 'P1');
  await attackTest('KeyI', 'P1');
  await attackTest('Enter', 'P2');
  await attackTest('Numpad8', 'P2');
  await shot('02-wave1-fight');

  // ---------- 5. Clear wave 1 → fire unlock + level up ----------
  let st = await clearWave('WAVE1');
  check('Wave 1 cleared → WAVE2', st === 'WAVE2', `state=${st}`);
  await sleep(1500);
  s = await snap();
  check('Level increased after wave 1 (shared XP)', s.p1.level >= 2 && s.p2.level >= 2, `p1=L${s.p1.level} p2=L${s.p2.level}`);
  check('Fire dragon unlocked after wave 1', s.p2.unlocked.includes('fire'), s.p2.unlocked.join(','));

  // ---------- 6. Transformation ----------
  await page.keyboard.press('Numpad4');
  await sleep(1300);
  s = await snap();
  check('Numpad4 transforms P2 → fire dragon', s.p2.form === 'fire', s.p2.form);
  await shot('03-fire-dragon');

  // ---------- 7. Elemental advantage: fire vs ice = 2x ----------
  s = await snap();
  check('Wave 2 spirits are ice', s.spirits.length > 0 && s.spirits.every(x => x.element === 'ice'), s.spirits.map(x => x.element).join(','));
  if (s.spirits.length) {
    const dmg = await attackUntilDamage(2, 'Numpad8');
    check('Fire vs Ice deals 2.0x', !!dmg && Math.abs(dmg.mult - 2.0) < 0.01, dmg ? `mult=${dmg.mult} (${dmg.attackerElement}→${dmg.targetElement})` : 'no damage');
  }

  // Boost levels for speed through remaining waves (after natural leveling was verified above)
  await page.evaluate(() => { window.__game.setLevel(1, 10); window.__game.setLevel(2, 10); });
  s = await snap();
  check('setLevel(10) raises stats', s.p1.level === 10 && s.p1.maxHp > 150, `L${s.p1.level} maxHp=${s.p1.maxHp}`);

  // ---------- 8. Clear wave 2 → poison unlock, relic drop ----------
  st = await clearWave('WAVE2');
  check('Wave 2 cleared → WAVE3', st === 'WAVE3', `state=${st}`);
  await sleep(1500);
  s = await snap();
  check('Poison dragon unlocked after wave 2', s.p2.unlocked.includes('poison'), s.p2.unlocked.join(','));

  // Relic pickup: sweep both players around plaza center to walk over any drop
  for (const [x, z] of [[0, 0], [3, 0], [-3, 0], [0, 3], [0, -3], [5, 5], [-5, -5], [5, -5], [-5, 5]]) {
    await page.evaluate(([px, pz]) => { window.__game.teleport(1, px, pz); window.__game.teleport(2, px + 1, pz); }, [x, z]);
    await sleep(250);
    if ((await g('G.relics.length')) > 0) break;
  }
  s = await snap();
  check('Relic equipped after wave 2 sweep', s.relics.length > 0, s.relics.join(',') || 'none found', true);

  // ---------- 9. Wave 3: water spirits; fire vs water = 0.5x ----------
  s = await snap();
  check('Wave 3 spirits are water', s.spirits.length > 0 && s.spirits.every(x => x.element === 'water'), s.spirits.map(x => x.element).join(','));
  if (s.spirits.length) {
    // ensure P2 is in fire form for the weakness check
    for (let i = 0; i < 5 && (await g('G.p2.form')) !== 'fire'; i++) { await page.keyboard.press('Numpad4'); await sleep(1300); }
    check('P2 in fire form for weakness test', (await g('G.p2.form')) === 'fire', await g('G.p2.form'), true);
    const dmg = await attackUntilDamage(2, 'Numpad8');
    check('Fire vs Water deals 0.5x (weak)', !!dmg && Math.abs(dmg.mult - 0.5) < 0.01, dmg ? `mult=${dmg.mult}` : 'no damage');
  }
  await shot('04-wave3');

  st = await clearWave('WAVE3');
  check('Wave 3 cleared → WAVE4 (boss)', st === 'WAVE4', `state=${st}`);
  await sleep(2000);

  // ---------- 10. Boss wave ----------
  s = await snap();
  check('Ice dragon unlocked before boss', s.p2.unlocked.includes('ice'), s.p2.unlocked.join(','));
  check('Boss wave has spirits (boss + adds)', s.spirits.length >= 1, `${s.spirits.length} entities, elements: ${s.spirits.map(x => x.element).join(',')}`);
  check('Boss is poison element', s.spirits.some(x => x.element === 'poison'), '', true);
  // Switch P2 to ice (counter) — cycle Numpad4 up to 5 times
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('Numpad4'); await sleep(1200);
    if ((await g('G.p2.form')) === 'ice') break;
  }
  check('P2 can cycle to ice form', (await g('G.p2.form')) === 'ice', await g('G.p2.form'), true);
  await shot('05-boss');

  st = await clearWave('WAVE4', ['COMPLETE'], 240000);
  check('Boss defeated → COMPLETE', st === 'COMPLETE', `state=${st}`);
  await sleep(2500);

  // ---------- 11. Quest complete screen ----------
  const qcVisible = await page.evaluate(() => {
    const els = [...document.querySelectorAll('div,h1,h2,h3')];
    return els.some(el => /quest\s*complete/i.test(el.textContent || '') && el.offsetParent !== null && el.getBoundingClientRect().width > 0);
  });
  check('"Quest Complete" panel visible', qcVisible);
  s = await snap();
  check('Water dragon unlocked at quest end', s.p2.unlocked.includes('water'), s.p2.unlocked.join(','));
  await shot('06-quest-complete');

} catch (err) {
  check('Test run completed without harness exception', false, String(err));
  await shot('99-error').catch(() => {});
}

// ---------- 12. Error budget ----------
check('Zero page errors (uncaught exceptions)', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
check('Zero console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

await browser.close();

const passed = results.filter(r => r.ok).length;
const failed = results.filter(r => !r.ok && !r.soft).length;
const warned = results.filter(r => !r.ok && r.soft).length;
console.log(`\n===== RESULT: ${passed} passed, ${failed} failed, ${warned} warnings =====`);
fs.writeFileSync(path.join(HERE, 'results.json'), JSON.stringify({ results, consoleErrors, pageErrors }, null, 2));
process.exit(hardFail ? 1 : 0);
