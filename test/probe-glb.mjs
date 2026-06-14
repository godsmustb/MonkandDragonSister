import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1024, height: 640 } });
const errs = [];
p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
p.on('pageerror', e => errs.push('PAGEERR ' + e.message));
await p.goto('http://localhost:8321/index.html', { waitUntil: 'load' });
await p.waitForFunction(() => window.__game && window.__game.state, null, { timeout: 20000 });
const res = await p.evaluate(async () => {
  try {
    const m = await import('/src/chars/gltfChar.js');
    const c = await m.loadGltfCharacter('assets/_loadtest.glb', { scale: 1, forwardYaw: Math.PI });
    return { ok: !!(c && c.group && c.group.isObject3D), isGltf: !!c.group._isGltf,
             hasChar: !!c.group._char, actions: c.actions ? c.actions.size : -1 };
  } catch (e) { return { ok: false, err: String(e && e.message || e) }; }
});
console.log('loader result:', JSON.stringify(res));
console.log('console errors:', errs.length, errs.slice(0, 3).join(' | '));
const pass = res.ok && res.isGltf && res.hasChar && errs.length === 0;
console.log(pass ? '\n===== GLB LOADER PROBE: OK =====' : '\n===== GLB LOADER PROBE: FAIL =====');
await b.close();
process.exit(pass ? 0 : 1);
