import { chromium } from 'playwright';
const b=await chromium.launch(); const p=await b.newPage({viewport:{width:1280,height:800}});
const errs=[]; p.on('console',m=>{if(m.type()==='error')errs.push(m.text())}); p.on('pageerror',e=>errs.push('PAGEERR '+e.message));
await p.goto('http://localhost:8321/index.html',{waitUntil:'load'});
await p.waitForFunction(()=>window.__game&&window.__game.state,null,{timeout:20000});
const click=async t=>p.evaluate(tx=>{const e=[...document.querySelectorAll('.menu-item,.mds-btn')].find(x=>x.textContent.trim().toUpperCase().includes(tx));if(e){e.click();return true}return false},t);
await click('CONTROLS'); await new Promise(r=>setTimeout(r,600));
const hasInput = await p.evaluate(()=>document.body.innerText.includes('KEYBOARD')&&document.body.innerText.includes('GAMEPAD')&&document.body.innerText.includes('VIEW CONTROLS'));
const gpExists = await p.evaluate(()=>typeof window.__game.state);  // boot ok
await p.screenshot({path:'shots/launch/controls-input.png'});
console.log('controls input section present:', hasInput, '| boot ok:', !!gpExists, '| errors:', errs.length, errs.slice(0,3).join(' | '));
await b.close();
