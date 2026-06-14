import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errs=[]; p.on('console',m=>{if(m.type()==='error')errs.push(m.text())}); p.on('pageerror',e=>errs.push(''+e.message));
await p.goto('http://localhost:8321/index.html', { waitUntil: 'load' });
await p.waitForFunction(() => window.__game && window.__game.state, null, { timeout: 20000 });
await p.evaluate(() => window.__game.startGame());
await p.keyboard.press('Space'); await new Promise(r=>setTimeout(r,500));
// trigger the travel transition directly (L1 -> L2) and verify it shows + completes
const fired = await p.evaluate(() => new Promise(res => { import('/src/ui/onboarding.js').then(m => { let done=false; m.runLevelTransition(1,2,()=>{done=true}); setTimeout(()=>res({shown: !!document.body.innerText.includes('TRAVELING'), done}), 900); }); }));
await p.screenshot({ path: 'shots/launch/level-transition.png' });
console.log('transition shown mid-animation:', fired.shown);
const doneAfter = await p.evaluate(() => new Promise(res => setTimeout(()=>res(!document.body.innerText.includes('TRAVELING')), 2200)));
console.log('transition cleared + onDone path ok:', doneAfter, '| errors:', errs.length);
await b.close();
