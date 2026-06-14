import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.goto('http://localhost:8321/index.html', { waitUntil: 'load' });
await p.waitForFunction(() => window.__game && window.__game.state, null, { timeout: 20000 });
await p.waitForTimeout(1800); // let menu bg fade in
await p.screenshot({ path: 'shots/launch/menu-with-art.png' });
const click = async (t) => p.evaluate((tx)=>{const e=[...document.querySelectorAll('.menu-item,.mds-btn')].find(x=>x.textContent.trim().toUpperCase().includes(tx));if(e){e.click();return true}return false;},t);
await click('START GAME'); await p.waitForTimeout(150);
await click('1 PLAYER'); await p.waitForTimeout(1400);
await p.screenshot({ path: 'shots/launch/charselect-portraits.png' });
console.log('shots saved');
await b.close();
