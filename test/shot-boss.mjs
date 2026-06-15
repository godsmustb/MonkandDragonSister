import { chromium } from 'playwright';
const b=await chromium.launch(); const p=await b.newPage({viewport:{width:1280,height:800}});
const errs=[]; p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
await p.goto('http://localhost:8321/index.html',{waitUntil:'load'});
await p.waitForFunction(()=>window.__game&&window.__game.state,null,{timeout:20000});
const verTag = await p.evaluate(()=>{const v=document.getElementById('build-tag'); return v?v.textContent:'(none)';});
await p.evaluate(()=>window.__game.startGame()); await p.keyboard.press('Space'); await new Promise(r=>setTimeout(r,400));
await p.evaluate(()=>{window.__game.unlockAll&&window.__game.unlockAll(); window.__game.startWave&&window.__game.startWave(4);});
await new Promise(r=>setTimeout(r,1500));
// teleport p1 near the boss (center) to frame it
const boss = await p.evaluate(()=>{const s=(window.__game.spirits||[]).find(x=>x.maxHp>=150); if(s){window.__game.teleport(1, s.pos.x, s.pos.z+4); return {el:s.element, hp:s.hp, max:s.maxHp}} return null;});
await new Promise(r=>setTimeout(r,800));
await p.screenshot({path:'shots/launch/boss-hpbar.png'});
console.log('version tag:', verTag, '| boss:', JSON.stringify(boss), '| errors:', errs.length);
await b.close();
