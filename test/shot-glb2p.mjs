import { chromium } from 'playwright';
const b=await chromium.launch(); const p=await b.newPage({viewport:{width:1400,height:800}});
const errs=[]; const warns=[]; p.on('console',m=>{if(m.type()==='error')errs.push(m.text()); if(m.type()==='warning'&&m.text().includes('glb'))warns.push(m.text())}); p.on('pageerror',e=>errs.push('PE '+e.message));
await p.goto('http://localhost:8321/index.html?glb=1',{waitUntil:'load'});
await p.evaluate(()=>{try{localStorage.setItem('mds_onboard_seen','1')}catch{}});
await p.waitForFunction(()=>window.__game&&window.__game.state,null,{timeout:20000});
const click=async t=>p.evaluate(tx=>{const e=[...document.querySelectorAll('.menu-item,.mds-btn')].find(x=>x.textContent.trim().toUpperCase().includes(tx));if(e){e.click();return true}return false},t);
await click('START GAME'); await new Promise(r=>setTimeout(r,200));
await click('2 PLAYER'); await new Promise(r=>setTimeout(r,300));
await click('BEGIN'); await new Promise(r=>setTimeout(r,500));
await p.evaluate(()=>{const i=document.getElementById('intro-screen'); if(i&&i.style.display!=='none')i.click();});
await p.waitForFunction(()=>window.__game.state&&window.__game.state.startsWith('WAVE'),null,{timeout:8000}).catch(()=>{});
await new Promise(r=>setTimeout(r,3000)); // let both GLBs load + render
const info=await p.evaluate(()=>({state:window.__game.state, glb:!!(window.__game.heroGlb&&window.__game.heroGlb.monk&&window.__game.heroGlb.sister)}));
await p.screenshot({path:'shots/launch/glb-2p-ingame.png'});
console.log('in-game:', JSON.stringify(info), '| errors:', errs.length, errs.slice(0,4).join(' | '));
console.log('glb-warns:', warns.join(' || ') || '(none)');
await b.close();
