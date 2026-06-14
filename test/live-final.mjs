import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:1280,height:800} });
const errs=[]; p.on('console',m=>{if(m.type()==='error')errs.push(m.text())}); p.on('pageerror',e=>errs.push(''+e.message));
const U='https://slategray-marten-643793.hostingersite.com/index.html';
await p.goto(U,{waitUntil:'load'});
await p.waitForFunction(()=>window.__game&&window.__game.state,null,{timeout:25000});
await new Promise(r=>setTimeout(r,1800));
await p.screenshot({path:'shots/launch/live-menu.png'});
const st=await p.evaluate(()=>window.__game.state);
// quick nav: START GAME -> 1 PLAYER -> char select shows portraits+powers
const click=async t=>p.evaluate(tx=>{const e=[...document.querySelectorAll('.menu-item,.mds-btn')].find(x=>x.textContent.trim().toUpperCase().includes(tx));if(e){e.click();return true}return false},t);
await click('START GAME'); await new Promise(r=>setTimeout(r,150));
await click('1 PLAYER'); await new Promise(r=>setTimeout(r,1200));
const hasPowers=await p.evaluate(()=>document.body.innerText.includes('UNLOCKS BY LEVEL'));
console.log('LIVE state:',st,'| char-select powers panel:',hasPowers,'| errors:',errs.length, errs.slice(0,2).join(' | '));
await b.close();
