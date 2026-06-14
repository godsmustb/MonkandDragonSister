import { chromium } from 'playwright';
const b=await chromium.launch(); const p=await b.newPage({viewport:{width:1280,height:800}});
await p.goto('http://localhost:8321/index.html?glb=1',{waitUntil:'load'});
await p.evaluate(()=>{try{localStorage.setItem('mds_onboard_seen','1')}catch{}});
await p.waitForFunction(()=>window.__game&&window.__game.state,null,{timeout:20000});
const click=async t=>p.evaluate(tx=>{const e=[...document.querySelectorAll('.menu-item,.mds-btn')].find(x=>x.textContent.trim().toUpperCase().includes(tx));if(e){e.click();return true}return false},t);
await click('START GAME'); await new Promise(r=>setTimeout(r,150));
await click('1 PLAYER'); await new Promise(r=>setTimeout(r,250));
await click('BEGIN'); await new Promise(r=>setTimeout(r,400));
await p.evaluate(()=>{const i=document.getElementById('intro-screen'); if(i&&i.style.display!=='none')i.click();});
await p.waitForFunction(()=>window.__game.state&&window.__game.state.startsWith('WAVE'),null,{timeout:8000}).catch(()=>{});
await new Promise(r=>setTimeout(r,2500));
// Traverse scene: is there a _isGltf group (the swapped monk)? + its world bounding height
const info = await p.evaluate(()=>{
  let found=false, h=0;
  if(window.__game && window.THREE) {}
  // access scene via ctx is not exposed; use the renderer? Instead check via p1 mesh marker on the group
  // Walk all objects we can reach through the gameState players
  try {
    const p1 = window.__game.p1; // snapshot, no mesh ref. Fall back: search document? no.
  } catch {}
  // Use a global the game may expose
  return { note: 'no direct scene access' };
});
// Simpler: bump scale via a reload param is not supported; just screenshot a few scales by setting localStorage HERO not available.
await p.screenshot({path:'shots/launch/glb-monk-check.png', clip:{x:440,y:240,width:400,height:360}});
console.log('cropped close-up saved');
await b.close();
