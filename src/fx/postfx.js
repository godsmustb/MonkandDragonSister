// src/fx/postfx.js — Pass 4 post-processing pipeline (Genshin-inspired anime painting)
//
// SPLIT-SCREEN STRATEGY — the hard part:
//   The game renders two camera halves with renderer.setScissor/setViewport.
//   EffectComposer's passes draw full-screen quads and don't honor an arbitrary
//   scissor cleanly (the bloom blur would bleed across the seam and the final
//   quad would stamp the whole framebuffer).
//
//   Chosen approach: ONE EffectComposer PER CAMERA HALF (two composers), each
//   sized to (halfWidth × fullHeight). Each composer owns its own RenderPass +
//   UnrealBloomPass + OutputPass(ACES) + SMAA. Before composer.render() we set
//   renderer.setViewport / setScissor to that half so the OutputPass's final
//   fullscreen quad lands only on its half of the screen. Because each composer
//   is sized to exactly one half, its internal render targets, bloom mip chain,
//   and SMAA edge buffers are all half-width — no cross-seam bleed, no double
//   processing. Both halves get identical, independent bloom.
//
//   Why not one composer + scissor? UnrealBloom downsamples to a mip pyramid in
//   its own (full-size) targets; a scissor on the renderer doesn't constrain the
//   internal blur, so glow leaks across the centre divider. Why not render-to-RT
//   then composite? That works but costs an extra fullscreen blit per half and a
//   bespoke composite shader; two half-size composers is simpler and the OutputPass
//   already does the screen blit for free.
//
// QUALITY:
//   ctx.quality === 'low'  → composer skipped entirely; main.js uses the direct
//                            renderer.render() path (cheap, for weak machines).
//   ctx.quality === 'high' → composer path (bloom + ACES + SMAA).
//   Tone mapping is ACESFilmic on BOTH paths (set on the renderer) so colour and
//   exposure stay consistent when toggling quality.
//
// ROBUSTNESS:
//   buildPostFX() is wrapped so a runtime failure (e.g. headless SwiftShader
//   choking on a float target) auto-falls back to 'low' with console.warn — never
//   a hard error. The E2E suite must stay green under SwiftShader.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { ctx } from '../state.js';

// Bloom tuned so ONLY emissives bloom (demon veins/eyes, lantern glows, belly
// bands, ability VFX). High threshold keeps lit toon surfaces out of the glow.
const BLOOM_THRESHOLD = 0.85;
const BLOOM_STRENGTH  = 0.55;
const BLOOM_RADIUS    = 0.40;

let _composers = null;     // { p1, p2 } or null when unavailable
let _enabled = false;

export function postFxEnabled() { return _enabled && !!_composers; }
export function getComposers() { return _composers; }

/**
 * Build the two half-screen composers. Call after renderer/scene/cameras exist.
 * Returns true on success, false if it fell back to the direct path.
 */
export function buildPostFX() {
  const renderer = ctx.renderer;
  const scene = ctx.scene;
  const cameras = ctx.cameras;
  if (!renderer || !scene || !cameras) return false;

  // Direct-path tone mapping is set in main.js; we only build the composer here.
  if (ctx.quality === 'low') { _enabled = false; return false; }

  try {
    const w = Math.max(2, Math.floor(window.innerWidth / 2));
    const h = Math.max(2, window.innerHeight);

    const make = (camera) => {
      const composer = new EffectComposer(renderer);
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(w, h);
      // Don't let the composer auto-clear the whole framebuffer each pass — we
      // manage scissor/viewport ourselves so the *other* half is preserved.
      composer.renderToScreen = true;

      const renderPass = new RenderPass(scene, camera);
      composer.addPass(renderPass);

      const bloom = new UnrealBloomPass(
        new THREE.Vector2(w, h), BLOOM_STRENGTH, BLOOM_RADIUS, BLOOM_THRESHOLD,
      );
      composer.addPass(bloom);

      // OutputPass applies tone mapping (renderer.toneMapping=ACES) + sRGB encode.
      const output = new OutputPass();
      composer.addPass(output);

      // Anti-alias last (operates in display space). SMAA is cheap + sharp for
      // the stylized toon edges.
      const smaa = new SMAAPass(w, h);
      composer.addPass(smaa);

      return { composer, renderPass, bloom, smaa };
    };

    _composers = { p1: make(cameras.p1), p2: make(cameras.p2) };
    _enabled = true;
    return true;
  } catch (e) {
    console.warn('[postfx] composer init failed, falling back to low quality:', e && e.message);
    disposePostFX();
    ctx.quality = 'low';
    _enabled = false;
    return false;
  }
}

export function resizePostFX() {
  if (!_composers) return;
  const w = Math.max(2, Math.floor(window.innerWidth / 2));
  const h = Math.max(2, window.innerHeight);
  for (const half of [_composers.p1, _composers.p2]) {
    half.composer.setPixelRatio(ctx.renderer.getPixelRatio());
    half.composer.setSize(w, h);
    half.bloom.setSize(w, h);
    half.smaa.setSize(w, h);
  }
}

export function disposePostFX() {
  if (!_composers) return;
  for (const half of [_composers.p1, _composers.p2]) {
    try { half.composer.dispose(); } catch (e) { /* ignore */ }
  }
  _composers = null;
}

/**
 * Render both halves through their composers.
 * Each composer is half-screen sized; we set the renderer scissor+viewport to the
 * matching half before render() so the final OutputPass quad lands on that half.
 * Returns true if it rendered (high path), false if caller should use direct path.
 */
export function renderPostFX() {
  if (!_enabled || !_composers) return false;
  const renderer = ctx.renderer;
  const w = window.innerWidth, h = window.innerHeight;
  const halfW = w / 2;

  try {
    // Left half (p1)
    renderer.setScissorTest(true);
    renderer.setScissor(0, 0, halfW, h);
    renderer.setViewport(0, 0, halfW, h);
    _composers.p1.composer.render();

    // Right half (p2)
    renderer.setScissor(halfW, 0, halfW, h);
    renderer.setViewport(halfW, 0, halfW, h);
    _composers.p2.composer.render();
    return true;
  } catch (e) {
    // Runtime failure mid-frame: degrade gracefully to direct path for the rest
    // of the session rather than spamming errors.
    console.warn('[postfx] render failed, disabling composer:', e && e.message);
    disposePostFX();
    ctx.quality = 'low';
    _enabled = false;
    return false;
  }
}
