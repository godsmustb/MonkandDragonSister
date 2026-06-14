import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage();
const errs = []; p.on('console', m => { if (m.type()==='error') errs.push(m.text()); }); p.on('pageerror', e => errs.push(''+e.message));
await p.goto('https://slategray-marten-643793.hostingersite.com/index.html', { waitUntil:'load' });
await p.waitForFunction(() => window.__game && window.__game.state, null, { timeout: 25000 });
await p.evaluate(() => window.__game.startGame());
await p.keyboard.press('Space');
let key=null; for(let i=0;i<16;i++){ await new Promise(r=>setTimeout(r,500)); key=await p.evaluate(()=>window.__game.music&&window.__game.music.recordedKey); if(key)break; }
const ms = await p.evaluate(()=>window.__game.music);
console.log('LIVE state:', await p.evaluate(()=>window.__game.state));
console.log('LIVE recordedEnabled:', ms&&ms.recordedEnabled, '| recordedKey:', key);
console.log('LIVE console errors:', errs.length, errs.slice(0,3).join(' | '));
await b.close();
