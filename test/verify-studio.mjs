// verify-studio.mjs — landing page QA: happy path + edge cases.
// Usage: node verify-studio.mjs [baseURL]   (default local; pass live URL to test PHP)
import { chromium } from 'playwright';
const BASE = process.argv[2] || 'http://localhost:8321/studio/index.html';
let pass=0, fail=0;
const ok=(n,c,d='')=>{console.log(`${c?'PASS':'FAIL'}  ${n}${d?' — '+d:''}`); c?pass++:fail++;};

const b=await chromium.launch();
const errs=[], net=[];
const p=await b.newPage({viewport:{width:1440,height:900}});
p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
p.on('pageerror',e=>errs.push('PE '+e.message));
p.on('response',r=>{if(r.status()>=400)net.push(r.status()+' '+r.url())});

await p.goto(BASE,{waitUntil:'load'});
await new Promise(r=>setTimeout(r,1500));

// structure
for(const id of ['top','game','heroes','dragons','worlds','bosses','mechanics','join','studio']){
  const present = await p.$(`#${id}`); ok(`section #${id} present`, !!present);
}
ok('hero title text', (await p.textContent('h1')).includes('Dragon Sister'));
ok('subscriber count rendered', /[\d,]+/.test(await p.textContent('[data-count]')));
ok('countdown running', /\d/.test(await p.textContent('[data-cd="d"]')));

// EDGE: invalid email shows error, no submit
await p.fill('.hero input[type=email]','not-an-email');
await p.click('.hero form.signup button');
await new Promise(r=>setTimeout(r,400));
let msg = await p.textContent('.hero .form-msg, [data-msg]').catch(()=>'');
const heroMsg = await p.evaluate(()=>{const m=document.querySelector('#top').parentElement.querySelector('[data-msg]')||document.querySelector('.hero').querySelector('[data-msg]'); return m?m.textContent:'';});
ok('invalid email rejected', /valid email/i.test(heroMsg||msg||''), (heroMsg||msg));

// HAPPY: valid email → success/acknowledge (PHP live, or fail-soft local)
await p.fill('.hero input[type=email]','playtester+'+Date.now()+'@example.com');
await p.click('.hero form.signup button');
await new Promise(r=>setTimeout(r,1200));
const heroMsg2 = await p.evaluate(()=>{const m=document.querySelector('.hero').querySelector('[data-msg]'); return m?m.textContent:'';});
ok('valid email acknowledged', /in|welcome|list|✦/i.test(heroMsg2), heroMsg2);

// 3D viewer canvas exists + has a GL context
await p.evaluate(()=>document.querySelector('#dragons').scrollIntoView());
await new Promise(r=>setTimeout(r,3000));
const gl = await p.evaluate(()=>{const c=document.getElementById('dragon3d'); if(!c) return false; try{return !!(c.getContext('webgl2')||c.getContext('webgl'))}catch{return false}});
ok('3D dragon canvas + WebGL', !!gl);

// nav anchor scroll
await p.click('.nav-links a[href="#worlds"]');
await new Promise(r=>setTimeout(r,800));
const aty = await p.evaluate(()=>{const e=document.getElementById('worlds'); const r=e.getBoundingClientRect(); return Math.abs(r.top)<200;});
ok('nav anchor scrolls to section', aty);

// MOBILE responsive
const mp=await b.newPage({viewport:{width:390,height:844},isMobile:true});
await mp.goto(BASE,{waitUntil:'load'});
await new Promise(r=>setTimeout(r,1000));
const noOverflow = await mp.evaluate(()=>document.documentElement.scrollWidth <= window.innerWidth+2);
ok('mobile: no horizontal overflow', noOverflow, `sw=${await mp.evaluate(()=>document.documentElement.scrollWidth)}`);
const burgerVisible = await mp.evaluate(()=>{const b=document.getElementById('burger'); return b && getComputedStyle(b).display!=='none';});
ok('mobile: hamburger visible', burgerVisible);
await mp.screenshot({path:'shots/studio/mobile.png'});
await mp.close();

ok('zero console errors', errs.length===0, errs.slice(0,3).join(' | '));
ok('zero 4xx/5xx requests', net.length===0, net.slice(0,3).join(' | '));

console.log(`\n===== STUDIO: ${pass} passed, ${fail} failed =====`);
await b.close();
process.exit(fail?1:0);
