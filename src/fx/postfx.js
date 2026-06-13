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
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SAOPass } from 'three/addons/postprocessing/SAOPass.js';
import { ctx } from '../state.js';

// SSAO (screen-space ambient occlusion) — subtle, stylized contact shadows so
// characters/props seat onto the flat zen floor (the known weakest visual) and
// crevices gain gentle depth. We use SAOPass: it renders its OWN normal + depth
// pass from the same scene/camera (independent of the composer's depth buffer)
// and MULTIPLIES the AO onto the lit colour. It is inserted right after the
// RenderPass and BEFORE bloom, so:
//   - AO darkens the lit toon surfaces (contact/crevice shading), and
//   - bloom then reads the AO-darkened buffer; emissive VFX still bloom because
//     bright cores are unaffected by occlusion (AO ~= 1 on lit emissives).
// Kept deliberately gentle (low intensity, modest radius) — anime, not photoreal.
// SAO_ENABLED is the single kill-switch: if SwiftShader/E2E ever chokes on the
// depth-texture/normal pass, flip this to false (or it auto-degrades via the
// composer's existing try/catch fallback) without touching the rest of the chain.
const SAO_ENABLED = false;
function _tuneSao(sao) {
  // Subtle, painterly occlusion. Defaults are far too strong/muddy for cel art.
  sao.params.output = SAOPass.OUTPUT.Default; // multiply AO onto colour
  sao.params.saoIntensity = 0.022;   // very gentle darkening
  sao.params.saoScale = 1.0;
  sao.params.saoKernelRadius = 24;   // tighter than default 100 → contact-shadow scale
  sao.params.saoBias = 0.5;
  sao.params.saoMinResolution = 0;
  sao.params.saoBlur = true;
  sao.params.saoBlurRadius = 6;
  sao.params.saoBlurStdDev = 4;
  sao.params.saoBlurDepthCutoff = 0.02;
}

// Cinematic grade — runs in display space after tone mapping. A painterly look:
// gentle S-curve contrast, lifted blacks (toward an ink-wash navy, not pure
// black), a vibrance pass (saturate muted tones more than already-saturated
// ones, to avoid neon), a warm push, an optional per-level tint, and a soft
// vignette to frame each split-screen half. Kept tasteful so it polishes rather
// than dominates the toon palette.
const GradeShader = {
  uniforms: {
    tDiffuse:  { value: null },
    uVignette: { value: 0.24 },
    uWarm:     { value: 0.030 },
    uSat:      { value: 1.10 },   // global saturation floor
    uVibrance: { value: 0.18 },   // extra saturation, weighted to muted colours
    uContrast: { value: 0.10 },   // S-curve strength around mid-grey
    uLift:     { value: 0.012 },  // black lift amount (painterly, not crushed)
    uTint:     { value: new THREE.Vector3(0.0, 0.0, 0.0) }, // per-level mood tint (additive, tiny)
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */`
    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform float uVignette, uWarm, uSat, uVibrance, uContrast, uLift;
    uniform vec3 uTint;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb;
      float l = dot(col, vec3(0.299, 0.587, 0.114));

      // --- global saturation ---
      col = mix(vec3(l), col, uSat);

      // --- vibrance: push muted colours more than already-saturated ones ---
      float mx = max(col.r, max(col.g, col.b));
      float mn = min(col.r, min(col.g, col.b));
      float sat = mx - mn;                     // current colourfulness 0..1
      float vib = uVibrance * (1.0 - sat);     // less boost where already vivid
      col = mix(vec3(l), col, 1.0 + vib);

      // --- soft S-curve contrast around mid-grey (painterly tone) ---
      col = mix(col, col * col * (3.0 - 2.0 * col), uContrast);

      // --- lifted blacks toward a faint cool ink (keeps shadows from going dead) ---
      col += uLift * vec3(0.85, 0.92, 1.0) * (1.0 - smoothstep(0.0, 0.35, l));

      // --- warm grade + per-level mood tint ---
      col += vec3(uWarm, uWarm * 0.4, -uWarm * 0.5);
      col += uTint;

      // --- vignette ---
      vec2 d = vUv - 0.5;
      float v = smoothstep(0.85, 0.32, length(d));
      col *= mix(1.0 - uVignette, 1.0, v);

      gl_FragColor = vec4(clamp(col, 0.0, 1.0), c.a);
    }
  `,
};

// Optional, very subtle per-level mood tint read from ctx._activeTheme. Theme
// ids: 1 = zen garden (warm neutral), others reserved for future lands. Values
// are additive in display space and intentionally tiny (≤ ~0.02) so they nudge
// the mood without recolouring the art. Safe no-op if the theme is unknown.
const _THEME_TINT = {
  1: [0.006, 0.004, -0.002],   // golden-hour zen garden: faint warm
  2: [-0.004, 0.000, 0.008],   // (reserved) cooler land
  3: [0.004, -0.002, -0.004],  // (reserved) ember land
  4: [-0.006, 0.002, 0.006],   // (reserved) frost land
};
function _applyThemeTint(grade) {
  try {
    const t = _THEME_TINT[ctx._activeTheme] || _THEME_TINT[1];
    grade.uniforms.uTint.value.set(t[0], t[1], t[2]);
  } catch (e) { /* keep zero tint */ }
}

// Bloom tuned so ONLY emissives bloom (demon veins/eyes, lantern glows, belly
// bands, ability VFX). High threshold keeps lit toon surfaces out of the glow.
const BLOOM_THRESHOLD = 0.85;
const BLOOM_STRENGTH  = 0.55;
const BLOOM_RADIUS    = 0.40;

let _composers = null;     // { p1, p2 } or null when unavailable (2P)
let _composer1p = null;    // Pass 12: single full-screen composer for 1P
let _enabled = false;

export function postFxEnabled() { return _enabled && (!!(ctx.mode === '1p' ? _composer1p : _composers)); }
export function getComposers() { return _composers; }

// Internal helper: build one composer
function _makeComposer(camera, w, h) {
  const renderer = ctx.renderer;
  const scene = ctx.scene;
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(w, h);
  composer.renderToScreen = true;

  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  // SSAO — inserted between the scene render and bloom. Multiplies gentle
  // occlusion onto the lit colour so contact shadows/crevices read; bloom then
  // operates on the AO-darkened buffer (emissive cores are unoccluded → still
  // bloom). High-quality only; guarded by SAO_ENABLED + this whole builder is
  // wrapped in try/catch by buildPostFX() (auto-fallback to low on any failure).
  let sao = null;
  if (SAO_ENABLED) {
    sao = new SAOPass(scene, camera, new THREE.Vector2(w, h));
    _tuneSao(sao);
    composer.addPass(sao);
  }

  const bloom = new UnrealBloomPass(
    new THREE.Vector2(w, h), BLOOM_STRENGTH, BLOOM_RADIUS, BLOOM_THRESHOLD,
  );
  composer.addPass(bloom);

  const output = new OutputPass();
  composer.addPass(output);

  const grade = new ShaderPass(GradeShader);
  _applyThemeTint(grade);
  composer.addPass(grade);

  const smaa = new SMAAPass(w, h);
  composer.addPass(smaa);

  return { composer, renderPass, sao, bloom, smaa, grade };
}

/**
 * Build composers. In 2P: two half-screen composers. In 1P: one full-screen composer.
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
    if (ctx.mode === '1p') {
      const w = Math.max(2, window.innerWidth);
      const h = Math.max(2, window.innerHeight);
      const activeCam = (ctx.soloChar === 'sister') ? cameras.p2 : cameras.p1;
      _composer1p = _makeComposer(activeCam, w, h);
      _composers = null;
    } else {
      const w = Math.max(2, Math.floor(window.innerWidth / 2));
      const h = Math.max(2, window.innerHeight);
      _composers = { p1: _makeComposer(cameras.p1, w, h), p2: _makeComposer(cameras.p2, w, h) };
      _composer1p = null;
    }
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
  if (ctx.mode === '1p') {
    if (!_composer1p) return;
    const w = Math.max(2, window.innerWidth);
    const h = Math.max(2, window.innerHeight);
    _composer1p.composer.setPixelRatio(ctx.renderer.getPixelRatio());
    _composer1p.composer.setSize(w, h);
    _composer1p.bloom.setSize(w, h);
    _composer1p.smaa.setSize(w, h);
    if (_composer1p.sao) _composer1p.sao.setSize(w, h);
    return;
  }
  if (!_composers) return;
  const w = Math.max(2, Math.floor(window.innerWidth / 2));
  const h = Math.max(2, window.innerHeight);
  for (const half of [_composers.p1, _composers.p2]) {
    half.composer.setPixelRatio(ctx.renderer.getPixelRatio());
    half.composer.setSize(w, h);
    half.bloom.setSize(w, h);
    half.smaa.setSize(w, h);
    if (half.sao) half.sao.setSize(w, h);
  }
}

export function disposePostFX() {
  if (_composers) {
    for (const half of [_composers.p1, _composers.p2]) {
      try { half.composer.dispose(); } catch (e) { /* ignore */ }
    }
    _composers = null;
  }
  if (_composer1p) {
    try { _composer1p.composer.dispose(); } catch (e) { /* ignore */ }
    _composer1p = null;
  }
  _enabled = false;
}

/**
 * Render through composer(s).
 * 1P: single full-screen view. 2P: two half-screen views.
 * Returns true if it rendered (high path), false if caller should use direct path.
 */
export function renderPostFX() {
  if (!_enabled) return false;
  const renderer = ctx.renderer;
  const w = window.innerWidth, h = window.innerHeight;

  try {
    if (ctx.mode === '1p') {
      if (!_composer1p) return false;
      renderer.setScissorTest(true);
      renderer.setScissor(0, 0, w, h);
      renderer.setViewport(0, 0, w, h);
      _composer1p.composer.render();
      return true;
    }

    if (!_composers) return false;
    const halfW = w / 2;

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
