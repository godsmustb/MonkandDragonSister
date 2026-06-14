import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.goto('http://localhost:8321/index.html', { waitUntil: 'load' });
await p.waitForFunction(() => window.__game && window.__game.state, null, { timeout: 20000 });
const click = async (t) => p.evaluate((tx)=>{const e=[...document.querySelectorAll('.menu-item,.mds-btn')].find(x=>x.textContent.trim().toUpperCase().includes(tx));if(e){e.click();return true}return false;},t);
await click('START GAME'); await p.waitForTimeout(150);
await click('1 PLAYER'); await p.waitForTimeout(800);
const before = await p.evaluate(()=>document.getElementById('charselect-bg-art')?.style.backgroundImage||'');
// click exact glacial level button
await p.evaluate(()=>{const sel=document.getElementById('char-select');const g=[...sel.querySelectorAll('.mds-btn')].find(x=>/GLACIAL/.test(x.textContent));g&&g.click();});
await p.waitForTimeout(900);
const after = await p.evaluate(()=>document.getElementById('charselect-bg-art')?.style.backgroundImage||'');
console.log('before:', before.replace(/.*assets/,'assets').replace(/".*/,''));
console.log('after :', after.replace(/.*assets/,'assets').replace(/".*/,''));
console.log(after.includes('bg_l2') ? 'SWAP OK -> glacial' : 'no swap');
await b.close();
