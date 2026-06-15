import { chromium } from 'playwright';
const b=await chromium.launch(); const p=await b.newPage({viewport:{width:1280,height:800}});
const errs=[]; p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
await p.goto('http://localhost:8321/index.html',{waitUntil:'load'});
await p.evaluate(()=>{try{localStorage.setItem('mds_onboard_seen','1')}catch{}});
await p.waitForFunction(()=>window.__game&&window.__game.state,null,{timeout:20000});
const click=async t=>p.evaluate(tx=>{const e=[...document.querySelectorAll('.menu-item,.mds-btn')].find(x=>x.textContent.trim().toUpperCase().includes(tx));if(e){e.click();return true}return false},t);
await click('START GAME'); await new Promise(r=>setTimeout(r,150));
await click('1 PLAYER'); await new Promise(r=>setTimeout(r,250));
// select sister
await p.evaluate(()=>{const s=document.getElementById('char-select'); const b=[...s.querySelectorAll('.mds-btn')].find(x=>/DRAGON SISTER/.test(x.textContent)); b&&b.click();});
await new Promise(r=>setTimeout(r,150));
await click('BEGIN'); await new Promise(r=>setTimeout(r,400));
await p.evaluate(()=>{const i=document.getElementById('intro-screen'); if(i&&i.style.display!=='none')i.click();});
await p.waitForFunction(()=>window.__game.state&&window.__game.state.startsWith('WAVE'),null,{timeout:8000}).catch(()=>{});
await new Promise(r=>setTimeout(r,2800));
await p.screenshot({path:'shots/launch/glb-sister.png', clip:{x:480,y:200,width:340,height:360}});
console.log('sister errors:', errs.length);
await b.close();
