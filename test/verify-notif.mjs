import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newContext({viewport:{width:1280,height:800}}).then(c=>c.newPage());
const errs=[]; p.on('console',m=>{if(m.type()==='error')errs.push(m.text())}); p.on('pageerror',e=>errs.push(''+e.message));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0; const ok=(c,m,x)=>{if(c){pass++;console.log('PASS ',m,x!==undefined?'— '+x:'')}else{fail++;console.log('FAIL ',m,x!==undefined?'— '+x:'')}};
await p.goto('http://localhost:8321/index.html',{waitUntil:'load'});
await p.evaluate(()=>{try{localStorage.setItem('mds_onboard_seen','1')}catch{}});
await p.waitForFunction(()=>window.__game&&window.__game.state,null,{timeout:20000});
// Navigate: START GAME -> 1 PLAYER -> BEGIN (monk default solo)
const click=async t=>p.evaluate(tx=>{const e=[...document.querySelectorAll('.menu-item,.mds-btn')].find(x=>x.textContent.trim().toUpperCase().includes(tx));if(e){e.click();return true}return false},t);
await click('START GAME'); await sleep(150);
await click('1 PLAYER'); await sleep(250);
await click('BEGIN'); await sleep(400);
await p.evaluate(()=>{const i=document.getElementById('intro-screen'); if(i&&i.style.display!=='none')i.click();});
await p.waitForFunction(()=>window.__game.state&&window.__game.state.startsWith('WAVE'),null,{timeout:8000}).catch(()=>{});
const p2inactive = await p.evaluate(()=>window.__game.p2 && window.__game.p2.inactive);
ok(p2inactive===true, '1P solo monk: P2 (Sister) is inactive', p2inactive);
// Now fire a toast for each via hud and count which appear
const res = await p.evaluate(async ()=>{
  const m = await import('/src/ui/hud.js');
  // clear existing toasts
  ['toast-container','toast-container-p1','toast-container-p2'].forEach(id=>{const c=document.getElementById(id); if(c) c.innerHTML='';});
  m.showPlayerToast(1, 'MONK-LEVELUP');
  m.showPlayerToast(2, 'SISTER-LEVELUP');
  await new Promise(r=>setTimeout(r,100));
  const all=[...document.querySelectorAll('.toast')].map(t=>t.textContent);
  return all;
});
ok(res.includes('MONK-LEVELUP'), 'P1 (active monk) toast shows', JSON.stringify(res));
ok(!res.includes('SISTER-LEVELUP'), 'P2 (inactive sister) toast SUPPRESSED', JSON.stringify(res));
ok(errs.length===0,'zero errors', errs.slice(0,2).join(' | '));
console.log(`\n===== NOTIF: ${pass} passed, ${fail} failed =====`);
await b.close(); process.exit(fail===0?0:1);
