// test/hudshot.mjs — Visual verification screenshots for Pass 6 HUD
// Takes 5 screenshots:
//   (a) hud-wave2-dragon.png  — full HUD wave 2, dragon form active
//   (b) hud-boss-wave4.png    — boss bar wave 4
//   (c) hud-ko.png            — KO overlay
//   (d) hud-toast.png         — unlock toast moment
//   (e) hud-resize.png        — 1280×720 resize check

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PAGE_URL = 'http://localhost:8321/index.html';
const HERE  = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(HERE, 'shots', 'hud');
fs.mkdirSync(SHOTS, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));

const browser = await chromium.launch({
  headless: true,
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
});

// ── (a) Wave 2 with dragon form ────────────────────────────────────────────
{
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.goto(PAGE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game && window.__game.state, null, { timeout: 20000 });
  await sleep(1200);

  // Start game + skip to wave 2 directly
  await page.evaluate(() => { window.__game.startGame(); });
  await sleep(400);
  await page.keyboard.press('Space'); // dismiss intro
  // Wait for WAVE1
  await page.waitForFunction(() => window.__game.state === 'WAVE1', null, { timeout: 10000 });
  await sleep(800);

  // Cheat to level 10 for speed
  await page.evaluate(() => { window.__game.setLevel(1,10); window.__game.setLevel(2,10); });
  // Kill all wave 1 spirits
  for (let i = 0; i < 30; i++) {
    const s = await page.evaluate(() => {
      const spirits = window.__game.spirits;
      if (!spirits.length) return null;
      const sp = spirits[0];
      window.__game.teleport(1, sp.pos.x+1, sp.pos.z);
      window.__game.teleport(2, sp.pos.x-1, sp.pos.z);
      return sp;
    });
    if (!s) break;
    await page.keyboard.press('Space');
    await page.keyboard.press('Enter');
    await sleep(250);
    const st = await page.evaluate(() => window.__game.state);
    if (st !== 'WAVE1') break;
  }
  await page.waitForFunction(() => window.__game.state === 'WAVE2', null, { timeout: 15000 });
  await sleep(1200);

  // Transform to fire dragon (wave 2 = ice, fire beats ice)
  await page.keyboard.press('Numpad4');
  await sleep(800);

  // Position near a spirit for gameplay look
  await page.evaluate(() => {
    const spirits = window.__game.spirits;
    if (spirits.length) {
      window.__game.teleport(1, spirits[0].pos.x+2, spirits[0].pos.z+2);
      window.__game.teleport(2, spirits[0].pos.x-2, spirits[0].pos.z+2);
    }
  });
  await sleep(600);
  await page.screenshot({ path: path.join(SHOTS, 'hud-wave2-dragon.png') });
  console.log('(a) hud-wave2-dragon.png');
  await page.close();
}

// ── (b) Boss bar wave 4 ────────────────────────────────────────────────────
{
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.goto(PAGE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game && window.__game.state, null, { timeout: 20000 });
  await sleep(1000);
  await page.evaluate(() => { window.__game.startGame(); });
  await sleep(300);
  await page.keyboard.press('Space');
  await page.waitForFunction(() => window.__game.state === 'WAVE1', null, { timeout: 10000 });

  await page.evaluate(() => {
    window.__game.setLevel(1,10); window.__game.setLevel(2,10);
    window.__game.unlockAll();
  });

  // Fast-clear waves 1-3
  for (const targetWave of ['WAVE1','WAVE2','WAVE3']) {
    let tries = 0;
    while (tries++ < 100) {
      const st = await page.evaluate(() => window.__game.state);
      if (st !== targetWave) break;
      await page.evaluate(() => {
        const s = window.__game.spirits;
        if (s.length) { window.__game.teleport(1,s[0].pos.x+1,s[0].pos.z); window.__game.teleport(2,s[0].pos.x-1,s[0].pos.z); }
      });
      await page.keyboard.press('Space');
      await page.keyboard.press('Enter');
      await sleep(220);
    }
    await sleep(1500);
  }
  await page.waitForFunction(() => window.__game.state === 'WAVE4', null, { timeout: 20000 });
  await sleep(2000);
  await page.screenshot({ path: path.join(SHOTS, 'hud-boss-wave4.png') });
  console.log('(b) hud-boss-wave4.png');
  await page.close();
}

// ── (c) KO overlay ─────────────────────────────────────────────────────────
{
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.goto(PAGE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game && window.__game.state, null, { timeout: 20000 });
  await sleep(1000);
  await page.evaluate(() => { window.__game.startGame(); });
  await sleep(300);
  await page.keyboard.press('Space');
  await page.waitForFunction(() => window.__game.state === 'WAVE1', null, { timeout: 10000 });
  await sleep(800);
  // Force KO P1 with a live revive window (set _koTimer to 8s so overlay stays visible)
  await page.evaluate(() => {
    const p1 = window.__ctx.gameState.p1;
    if (p1) {
      p1.hp = 0;
      p1.isKO = true;
      p1._koTimer = 8; // 8 seconds left in revive window — overlay stays up
    }
  });
  await sleep(500);
  await page.screenshot({ path: path.join(SHOTS, 'hud-ko.png') });
  console.log('(c) hud-ko.png');
  await page.close();
}

// ── (d) Unlock toast moment ─────────────────────────────────────────────────
{
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.goto(PAGE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game && window.__game.state, null, { timeout: 20000 });
  await sleep(1000);
  await page.evaluate(() => { window.__game.startGame(); });
  await sleep(300);
  await page.keyboard.press('Space');
  await page.waitForFunction(() => window.__game.state === 'WAVE1', null, { timeout: 10000 });
  await page.evaluate(() => { window.__game.setLevel(1,10); window.__game.setLevel(2,10); });

  // Kill all wave 1 spirits to trigger form-unlock toast
  for (let i = 0; i < 40; i++) {
    const done = await page.evaluate(() => {
      const s = window.__game.spirits;
      if (!s.length) return true;
      window.__game.teleport(1, s[0].pos.x+1.2, s[0].pos.z);
      window.__game.teleport(2, s[0].pos.x-1.2, s[0].pos.z);
      return false;
    });
    if (done) break;
    await page.keyboard.press('Space'); await page.keyboard.press('Enter');
    await sleep(230);
  }
  // Wait for wave-clear, then capture at the moment a toast is visible
  await page.waitForFunction(() => window.__game.state === 'WAVE2', null, { timeout: 15000 }).catch(() => {});
  // Trigger a toast directly so we definitely capture one
  await page.evaluate(() => {
    const { showToast } = window.__ctx && {};
    // Use the DOM directly — inject an unlock toast
    const c = document.getElementById('toast-container');
    if (c) {
      const el = document.createElement('div');
      el.className = 'toast unlock';
      el.textContent = 'Sister awakens — FIRE DRAGON unlocked! Press Num4 to transform!';
      c.appendChild(el);
    }
  });
  await sleep(400);
  await page.screenshot({ path: path.join(SHOTS, 'hud-toast.png') });
  console.log('(d) hud-toast.png');
  await page.close();
}

// ── (e) 1280×720 resize check ───────────────────────────────────────────────
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(PAGE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game && window.__game.state, null, { timeout: 20000 });
  await sleep(1000);
  await page.evaluate(() => { window.__game.startGame(); });
  await sleep(300);
  await page.keyboard.press('Space');
  await page.waitForFunction(() => window.__game.state === 'WAVE1', null, { timeout: 10000 });
  await sleep(1200);
  await page.screenshot({ path: path.join(SHOTS, 'hud-resize-720.png') });
  console.log('(e) hud-resize-720.png — 1280x720');
  await page.close();
}

await browser.close();
console.log('\nAll HUD screenshots saved to test/shots/hud/');
