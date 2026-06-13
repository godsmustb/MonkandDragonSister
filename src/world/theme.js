// src/world/theme.js — LEVEL-THEME re-paletting system (Art Dept)
// Each campaign level re-dresses the SAME world geometry into a distinct place by
// re-tinting the existing materials/lights/fog/sky + swapping petal behaviour.
// No geometry rebuild per level (too heavy) — pure recolour + a couple cheap touches.
//
//   • Level 1 — Zen Garden (DEFAULT): warm green meadow, blue sky, golden sun,
//     pink cherry petals.  applyLevelTheme(1) restores the EXACT original palette
//     so a fresh quest / return-to-menu looks byte-identical to before this system.
//   • Level 2 — The Glacial Peaks (ICE): cold pale-blue→white sky, cool dimmer
//     light, snow-tinted ground/flora/mountains, drifting WHITE SNOW petals.
//   • Level 3 — The Venom Abyss (POISON): sickly purple-green sky, murky denser
//     fog, dim purple-green light, toxic-black ground/flora, TOXIC-GREEN spores.
//
// Theme-able refs are captured on ctx.themeRefs during buildSky/buildLighting/
// buildWorld. applyLevelTheme(level) recolours them; it is dt-free, idempotent,
// allocation-light (a tiny scratch THREE.Color is reused), and uses no timers.
import * as THREE from 'three';
import { ctx } from '../state.js';

// Reused scratch color so applyLevelTheme makes no per-call allocations in the
// hot path (it can be called on every startWave).
const _c = new THREE.Color();

// ── THEME TABLE ──────────────────────────────────────────────────────────────
// Hex palettes per level. Level 1 holds the original Zen-garden values verbatim
// (see buildSky / buildLighting / garden.js comments) so applyLevelTheme(1) is a
// perfect restore. Values not listed for a level fall back to level 1.
const THEMES = {
  // ── LEVEL 1 — ZEN GARDEN (original warm look — DO NOT alter visually) ──
  1: {
    sky:       { zenith: '#5b9fd4', mid: '#a9d0e2', band: '#d8e2dc', horizon: '#f3dcb8' },
    background: 0xa9d0e2,           // SKY_MID
    fog:       { color: 0xe9d3b4, near: 90, far: 320 },
    hemi:      { sky: 0xdfe9f5, ground: 0x6e7a52, intensity: 0.55 },
    sun:       { color: 0xfff0d6, intensity: 1.35 },
    rim:       { color: 0xbcd2ff, intensity: 0.7 },
    // Ground/flora/mountain tints are multiplicative overlays on the baked
    // textures/materials. Level 1 = pure white (no tint → original look).
    groundTint:   0xffffff,
    mountainTint: 0xffffff,
    cherryTint:   0xffffff,
    grassTint:    0xffffff,
    flowerTint:   0xffffff,
    // Petals: pink cherry blossom, original drift (downward float + flutter).
    petal: { color: 0xffaacc, opacity: 0.8, mode: 'petal' },
  },

  // ── LEVEL 2 — THE GLACIAL PEAKS (ICE) ──
  2: {
    // Pale icy blue high → near-white at the horizon (cold, misty).
    sky:       { zenith: '#9fc6e8', mid: '#cfe2ef', band: '#e6eef4', horizon: '#f4f8fb' },
    background: 0xcfe2ef,
    // Cooler + a touch denser/closer fog → cold mist hangs over the arena.
    fog:       { color: 0xd4e2ee, near: 70, far: 280 },
    // Cool blue-white fill, slightly dimmer.
    hemi:      { sky: 0xe4f0fb, ground: 0x9fb0c2, intensity: 0.5 },
    sun:       { color: 0xdfecff, intensity: 1.15 },
    rim:       { color: 0xd6e8ff, intensity: 0.75 },
    // Icy blue-white wash. tintMix>0 → LERP the baked albedo toward these targets
    // (not multiply) so pink blossoms/green grass actually FROST OVER to white-blue
    // instead of staying a darker pink. Ground keeps a lower mix so the raked rings
    // still read faintly under the "snow".
    tintMix:      { ground: 0.62, mountain: 0.66, cherry: 0.8, grass: 0.74, flower: 0.78 },
    groundTint:   0xd9e7f2,   // snow blanket over the gravel
    mountainTint: 0xeef5fc,   // bright white/snow peaks
    cherryTint:   0xe9f2fb,   // snow-laden canopy (icy white)
    grassTint:    0xd4e4ee,   // frosted snowy field
    flowerTint:   0xe6eff8,   // pale frosted blossoms
    // Petals → gentle WHITE SNOW: drift straighter & a little faster, less flutter.
    petal: { color: 0xffffff, opacity: 0.85, mode: 'snow' },
  },

  // ── LEVEL 3 — THE VENOM ABYSS (POISON) ──
  3: {
    // Dark desaturated purple-green, oppressive.
    sky:       { zenith: '#2a2438', mid: '#3a3f33', band: '#43412f', horizon: '#4a4a26' },
    background: 0x3a3f33,
    // Murky green-purple, denser & closer for dread.
    fog:       { color: 0x37412e, near: 48, far: 220 },
    // Dim with a purple-green tint.
    hemi:      { sky: 0x6a5f7a, ground: 0x39431f, intensity: 0.42 },
    sun:       { color: 0x9fb878, intensity: 0.85 },   // sickly green-tinted, dim
    rim:       { color: 0x9a6fd0, intensity: 0.55 },   // toxic-purple rim accent
    // Dark toxic (sickly green-black) ground.
    groundTint:   0x586a3a,
    mountainTint: 0x4a4858,   // dark, oppressive peaks
    cherryTint:   0x6a4a78,   // withered purple-black canopy
    grassTint:    0x5a6a36,   // toxic green
    flowerTint:   0x7a5a86,   // withered purple
    // Petals → drifting TOXIC-GREEN spores: slow, hang in the air, gentle drift.
    petal: { color: 0x9fe04a, opacity: 0.9, mode: 'spore' },
  },
};

// Repaint the sky-dome CanvasTexture gradient for a theme (regenerates the 4×512
// vertical gradient on the existing canvas; cheap, happens only on level start).
function _repaintSkyDome(theme) {
  const refs = ctx.themeRefs;
  if (!refs || !refs.skyCanvas || !refs.skyTexture) return;
  const cvs = refs.skyCanvas;
  const sc = cvs.getContext('2d');
  const s = theme.sky;
  const grad = sc.createLinearGradient(0, 0, 0, cvs.height);
  grad.addColorStop(0.00, s.zenith);
  grad.addColorStop(0.45, s.mid);
  grad.addColorStop(0.78, s.band);
  grad.addColorStop(1.00, s.horizon);
  sc.fillStyle = grad;
  sc.fillRect(0, 0, cvs.width, cvs.height);
  refs.skyTexture.needsUpdate = true;
}

// Tint a list of materials by MULTIPLYING their baked base color by the theme
// tint. Each material caches its original color (m._themeBaseColor) the first
// time it is seen, so level 1 (tint 0xffffff) restores the exact original color
// and the per-blob painterly variation in the cherry canopy is preserved.
// the cached base by a falsy/undefined `mix` (level 1, tint 0xffffff → identity),
// or LERP the base toward the tint by `mix` (0..1) when given — lerp is needed to
// desaturate a saturated albedo toward a pale target (e.g. pink blossom → snow),
// which multiply cannot do.
function _tintMaterials(mats, hex, mix) {
  if (!mats) return;
  _c.set(hex);
  for (const m of mats) {
    if (!m || !m.color) continue;
    if (!m._themeBaseColor) m._themeBaseColor = m.color.clone();
    if (mix) m.color.copy(m._themeBaseColor).lerp(_c, mix);
    else     m.color.copy(m._themeBaseColor).multiply(_c);
  }
}

// ── PUBLIC: apply a level's theme by recolouring the captured refs ──────────────
// level 1 = restore original Zen palette; 2 = ice; 3 = poison. Unknown → level 1.
export function applyLevelTheme(level) {
  const refs = ctx.themeRefs;
  if (!refs) return; // world not built yet (e.g. very early boot) — safe no-op
  const theme = THEMES[level] || THEMES[1];

  // ── Sky dome gradient + scene background ──
  _repaintSkyDome(theme);
  if (ctx.scene && ctx.scene.background) {
    ctx.scene.background.set(theme.background);
  } else if (ctx.scene) {
    ctx.scene.background = new THREE.Color(theme.background);
  }

  // ── Fog ──
  if (ctx.scene && ctx.scene.fog) {
    ctx.scene.fog.color.set(theme.fog.color);
    ctx.scene.fog.near = theme.fog.near;
    ctx.scene.fog.far  = theme.fog.far;
  }

  // ── Lighting: hemisphere / sun / rim ──
  if (refs.hemi) {
    refs.hemi.color.set(theme.hemi.sky);
    refs.hemi.groundColor.set(theme.hemi.ground);
    refs.hemi.intensity = theme.hemi.intensity;
  }
  if (ctx.sun) {
    ctx.sun.color.set(theme.sun.color);
    ctx.sun.intensity = theme.sun.intensity;
  }
  if (ctx.rimLight) {
    ctx.rimLight.color.set(theme.rim.color);
    ctx.rimLight.intensity = theme.rim.intensity;
  }

  // ── Ground / mountains / flora tints. Level 1 multiplies (tintMix absent →
  // identity with white); levels with a tintMix lerp toward the target so the
  // albedo recolours strongly instead of only darkening. ──
  const mix = theme.tintMix || {};
  if (refs.groundMat) _tintMaterials([refs.groundMat], theme.groundTint, mix.ground);
  _tintMaterials(refs.mountainMats, theme.mountainTint, mix.mountain);
  _tintMaterials(refs.cherryMats,   theme.cherryTint,   mix.cherry);
  _tintMaterials(refs.grassMats,    theme.grassTint,    mix.grass);
  _tintMaterials(refs.flowerMats,   theme.flowerTint,   mix.flower);

  // ── Petals: tint + behaviour mode (drives the main.js drift loop) ──
  if (ctx.petals) {
    const p = theme.petal;
    for (const m of ctx.petals) {
      if (m.material && m.material.color) {
        m.material.color.set(p.color);
        m.material.opacity = p.opacity;
      }
      m._driftMode = p.mode; // 'petal' | 'snow' | 'spore' — read by resetPetal/loop
    }
  }

  ctx._activeTheme = level; // debug/introspection only (additive, non-contract)
}
