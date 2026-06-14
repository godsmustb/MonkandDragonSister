import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newContext({ viewport:{width:1280,height:800} }).then(c=>c.newPage());
const errs=[]; p.on('console',m=>{if(m.type()==='error')errs.push(m.text())}); p.on('pageerror',e=>errs.push(''+e.message));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0; const ok=(c,m,x)=>{if(c){pass++;console.log('PASS ',m,x!==undefined?'— '+x:'')}else{fail++;console.log('FAIL ',m,x!==undefined?'— '+x:'')}};
await p.goto('http://localhost:8321/index.html',{waitUntil:'load'});
await p.evaluate(()=>{try{localStorage.setItem('mds_onboard_seen','1')}catch{}}); // skip onboarding for this nav test
await p.waitForFunction(()=>window.__game&&window.__game.state,null,{timeout:20000});
const click=async t=>p.evaluate(tx=>{const e=[...document.querySelectorAll('.menu-item,.mds-btn')].find(x=>x.textContent.trim().toUpperCase().includes(tx));if(e){e.click();return true}return false},t);
await click('CAMPAIGN'); await sleep(300);
// Glacial Peaks must be PLAYABLE now
const glacialPlayable = await p.evaluate(()=>{const cards=[...document.querySelectorAll('#campaign-preview > div')];return document.body.innerText.includes('GLACIAL PEAKS') && [...document.querySelectorAll('.mds-btn')].some(b=>/PLAY THIS STAGE/.test(b.textContent));});
ok(glacialPlayable,'Campaign shows PLAY THIS STAGE button');
// Click the 2nd PLAY button (Glacial = land 2). Find all PLAY buttons; index 1 = L2.
const launched = await p.evaluate(()=>{const plays=[...document.querySelectorAll('.mds-btn')].filter(b=>/PLAY THIS STAGE/.test(b.textContent)); if(plays[1]){plays[1].click();return true} return false;});
ok(launched,'clicked Glacial Peaks PLAY (stage 2)');
await sleep(300);
const startLvl = await p.evaluate(()=>window.__game.startLevel2);
ok(startLvl===2,'startLevel set to 2 by campaign', startLvl);
// proceed: mode select -> 2 PLAYERS -> intro dismiss -> should land in L2
await click('2 PLAYERS'); await sleep(400);
await p.evaluate(()=>{const i=document.getElementById('intro-screen'); if(i&&i.style.display!=='none')i.click();});
await p.waitForFunction(()=>window.__game.state&&window.__game.state.startsWith('WAVE'),null,{timeout:8000}).catch(()=>{});
const forms = await p.evaluate(()=>window.__game.p2&&window.__game.p2.unlocked);
ok(forms&&['fire','ice','poison','water'].every(f=>forms.includes(f)),'L2 launched with all dragon forms', JSON.stringify(forms));
ok(errs.length===0,'zero console/page errors', errs.slice(0,3).join(' | '));
console.log(`\n===== CAMPAIGN NAV: ${pass} passed, ${fail} failed =====`);
await b.close(); process.exit(fail===0?0:1);
