// src/audio/audio.js — Pass 7: Procedural WebAudio
// 100% synth, no audio files. Lazy AudioContext (created on first user gesture).
// Architecture: ctx → compressor → masterGain → musicBus / sfxBus
// All public calls fire-and-forget, wrapped in try/catch so audio never breaks gameplay.

import { ctx as gameCtx } from '../state.js';

// ─────────────────────────────────────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────────────────────────────────────
let _ac = null;            // AudioContext (lazy)
let _masterGain = null;    // master gain node
let _musicBus = null;      // gain bus for music
let _sfxBus = null;        // gain bus for SFX
let _compressor = null;    // dynamics compressor on master

let _muted = false;
let _schedulerInterval = null;   // single setInterval id for music scheduler
let _beatClock = 0;              // beats elapsed (float)
let _lastScheduleTime = 0;       // audioCtx.currentTime when last scheduled
let _musicLayer = 'none';        // 'zen' | 'combat' | 'boss' | 'none'
let _targetLayer = 'zen';        // layer we want
let _zenGain = null;
let _combatGain = null;
let _bossGain = null;
let _zenDroneNode = null;        // persistent low drone
let _bossDroneNode = null;

// ── ADAPTIVE MUSIC state ──────────────────────────────────────────────────────
// All of these are plain numbers / nullable nodes; every consumer is null-safe so
// nothing here can throw when the AudioContext was never started (headless E2E).
let _intensity = 0;        // smoothed 0..1 threat/intensity (drives combat layers)
let _intensityTarget = 0;  // raw target each tick, _intensity eases toward it
let _tension = 0;          // smoothed 0..1 low-HP tension (drives the tension drone)
let _tensionTarget = 0;
let _bossActive = false;   // a boss is currently alive in the arena
let _bossPhase = 1;        // 1..3 of the live boss (drives darker/faster shifts)
let _bossEnraged = false;
let _ultActive = false;    // any player's ultimate currently running (musical swell)
let _activeTheme = 1;      // mirror of ctx._activeTheme (1 zen / 2 ice / 3 poison)
let _tensionDroneOsc = null;   // detuned low drone for low-HP dread
let _tensionDroneGain = null;
let _tensionDroneOsc2 = null;  // 2nd, detuned partner for a beating/unease effect
let _lastTheme = 1;            // last theme we re-pitched drones to

// ── Recorded-music layer (optional ACE-Step tracks) ──────────────────────────
// If audio/music/<key>.mp3 files exist they crossfade in over the procedural music
// (one track per land + a boss track). With no files present, nothing changes — the
// procedural generator plays exactly as before (E2E-safe). Keys: theme1/2/3 + boss.
let _recEl = null;          // HTMLAudioElement currently playing
let _recSrc = null;         // MediaElementAudioSourceNode
let _recGain = null;        // gain for the recorded track (→ master)
let _recKey = null;         // currently-loaded track key
let _recDisabled = false;   // set true once a key 404s so we don't retry forever per key
let _recEnabled = false;    // master opt-in (localStorage mds_recorded_music=1 or ?music=1)
let _recSettleAt = 0;       // time the current track's fade-in finishes (loop-dip gate)

// Smooth the loop seam: ease the recorded gain down just before the track ends and
// back up just after it restarts, so a short track loops without an audible cut.
function _smoothRecLoop() {
  if (!_recEnabled || !_recEl || !_recGain || !_ac) return;
  if (_ac.currentTime < _recSettleAt) return;     // don't fight an in-progress crossfade
  const dur = _recEl.duration;
  if (!dur || isNaN(dur) || dur < 4) return;
  const t = _recEl.currentTime, EDGE = 0.8, FULL = 0.62;
  let target = FULL;
  if (t > dur - EDGE) target = FULL * Math.max(0.2, (dur - t) / EDGE);
  else if (t < EDGE) target = FULL * Math.max(0.2, t / EDGE);
  try { _recGain.gain.setTargetAtTime(target, _ac.currentTime, 0.08); } catch (_) {}
}
const _recMissing = {};     // keys known to be absent → skip
const _SYNTH_DUCK = 0.12;   // _musicBus gain while a recorded track owns the mix
const _SYNTH_FULL = 0.55;   // normal procedural music bus gain

// Per-theme musical mood. The generative engine is reused verbatim — only the
// melodic scale, drone roots and tempo feel shift per land so L2 reads colder /
// higher and L3 darker / lower / dissonant. Level 1 = the original zen values.
const THEME_MUSIC = {
  // L1 — Zen garden: warm C pentatonic, C3 drone, original 70 BPM feel.
  1: {
    zenScale: [48, 50, 52, 55, 57, 60, 62, 64, 67, 69], // C3..A4 major pentatonic
    zenDroneHz: 130.81,   // C3
    bossDroneHz: 82.41,   // E2 (minor)
    bossScaleRoot: 36,    // C2 minor pentatonic root
    beatMult: 1.0,        // tempo multiplier (1 = base 70 BPM)
    kotoVol: 1.0,
    tensionHz: 65.41,     // C2 — tension drone root
    detune: 8,            // cents of detune for the tension beating
  },
  // L2 — Glacial Peaks: higher, sparser, cold. D pentatonic up an octave-ish,
  // brighter koto, slightly quicker. Drone lifts to a colder G.
  2: {
    zenScale: [50, 52, 55, 57, 60, 62, 64, 67, 69, 72], // D3..C5 — higher/colder
    zenDroneHz: 146.83,   // D3
    bossDroneHz: 92.50,   // F#2
    bossScaleRoot: 38,    // D2
    beatMult: 1.08,       // a touch faster, brittle
    kotoVol: 0.92,        // sparser/quieter plucks (cold air)
    tensionHz: 73.42,     // D2
    detune: 11,
  },
  // L3 — Venom Abyss: lower, darker, dissonant. Minor pentatonic, low drone,
  // slower and heavier. Adds a tritone-ish colour via the minor scale + low root.
  3: {
    zenScale: [43, 46, 48, 50, 53, 55, 58, 60, 62, 65], // G2 minor-pentatonic-ish, low/dark
    zenDroneHz: 97.999,   // G2 — low dread
    bossDroneHz: 73.42,   // D2 (deep)
    bossScaleRoot: 31,    // G1 region
    beatMult: 0.94,       // slower, heavier
    kotoVol: 1.0,
    tensionHz: 48.99,     // G1 — very low
    detune: 16,           // wide, queasy detune
  },
};
function _themeMusic() { return THEME_MUSIC[_activeTheme] || THEME_MUSIC[1]; }

// Persistent taiko loop references (so we can stop them cleanly)
let _taikoNode = null;

// localStorage key for mute toggle
const LS_KEY_MUTE = 'mds_audio_mute';

// Pentatonic scale (MIDI note offsets from root, in semitones)
const PENTATONIC = [0, 2, 4, 7, 9]; // C, D, E, G, A
const MINOR_PENTATONIC = [0, 3, 5, 7, 10]; // C, Eb, F, G, Bb

function _noteFreq(midiNote) {
  return 440 * Math.pow(2, (midiNote - 69) / 12);
}

// ─────────────────────────────────────────────────────────────────────────────
// INIT — lazy, on first user gesture
// ─────────────────────────────────────────────────────────────────────────────
function _ensureContext() {
  if (_ac) {
    // Resume if suspended (browsers suspend on inactivity)
    if (_ac.state === 'suspended') _ac.resume().catch(() => {});
    return true;
  }

  try {
    _ac = new (window.AudioContext || window.webkitAudioContext)();
  } catch (e) {
    return false;
  }

  // Dynamics compressor on master path (prevents clipping)
  _compressor = _ac.createDynamicsCompressor();
  _compressor.threshold.value = -18;
  _compressor.knee.value = 10;
  _compressor.ratio.value = 4;
  _compressor.attack.value = 0.003;
  _compressor.release.value = 0.25;
  _compressor.connect(_ac.destination);

  // Master gain (~0.5)
  _masterGain = _ac.createGain();
  _masterGain.gain.value = _muted ? 0 : 0.5;
  _masterGain.connect(_compressor);

  // Music bus
  _musicBus = _ac.createGain();
  _musicBus.gain.value = 0.55;
  _musicBus.connect(_masterGain);

  // SFX bus
  _sfxBus = _ac.createGain();
  _sfxBus.gain.value = 1.0;
  _sfxBus.connect(_masterGain);

  // Sub-gain nodes per music layer
  _zenGain = _ac.createGain(); _zenGain.gain.value = 0; _zenGain.connect(_musicBus);
  _combatGain = _ac.createGain(); _combatGain.gain.value = 0; _combatGain.connect(_musicBus);
  _bossGain = _ac.createGain(); _bossGain.gain.value = 0; _bossGain.connect(_musicBus);

  // Recorded-music opt-in. Auto-enabled when assets/manifest.json lists tracks (so real
  // players get the soundtrack); a stored '0' or absent manifest keeps it procedural-only.
  // ?music=1 / ?music=0 force it. The manifest is always served → no 404 → E2E-safe.
  try {
    const stored = localStorage.getItem('mds_recorded_music');
    if (stored === '1') _recEnabled = true;
    else if (stored !== '0') {
      fetch('assets/manifest.json').then(r => r.ok ? r.json() : null).then(mf => {
        if (mf && Array.isArray(mf.music) && mf.music.length) _recEnabled = true;
      }).catch(() => {});
    }
    const q = new URLSearchParams(location.search).get('music');
    if (q === '1') _recEnabled = true; else if (q === '0') _recEnabled = false;
  } catch (_) {}

  // Expose audioReady flag
  if (window.__game) window.__game.audioReady = true;
  else window._audioReady = true;

  // Start music scheduler
  _startScheduler();

  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// MUTE TOGGLE (localStorage-persisted)
// ─────────────────────────────────────────────────────────────────────────────
function _readMuteState() {
  try { return localStorage.getItem(LS_KEY_MUTE) === '1'; } catch { return false; }
}
function _saveMuteState(m) {
  try { localStorage.setItem(LS_KEY_MUTE, m ? '1' : '0'); } catch {}
}

_muted = _readMuteState();

// Opt into the recorded-music layer (persisted). Takes effect immediately if the
// AudioContext is live; otherwise on the next gesture. Returns the saved value.
export function setRecordedMusic(on) {
  try { localStorage.setItem('mds_recorded_music', on ? '1' : '0'); } catch (_) {}
  _recEnabled = !!on;
  if (!on) { _setSynthDuck(false); _recKey = null; if (_recEl) { try { _recEl.pause(); } catch {} _recEl = null; } }
  return _recEnabled;
}

// One-shot voice-over (Kokoro narration). Self-contained + manifest-gated: only plays
// keys listed in assets/manifest.json `voice` AND respects mute → never 404s in E2E.
let _voiceManifestP = null;
function _voiceManifest() {
  if (!_voiceManifestP) _voiceManifestP = fetch('assets/manifest.json').then(r => r.ok ? r.json() : {}).catch(() => ({}));
  return _voiceManifestP;
}
let _voiceEl = null;
export function playVoice(key) {
  if (_muted) return;
  _voiceManifest().then(mf => {
    if (!mf || !Array.isArray(mf.voice) || !mf.voice.includes(key)) return;
    try {
      if (_voiceEl) { try { _voiceEl.pause(); } catch {} }
      _voiceEl = new Audio(`assets/voice/${key}.mp3`);
      _voiceEl.volume = 0.95;
      _voiceEl.play().catch(() => {});  // autoplay may reject pre-gesture; harmless
    } catch (_) {}
  });
}

export function toggleMute() {
  _muted = !_muted;
  _saveMuteState(_muted);
  if (_masterGain) {
    const now = _ac.currentTime;
    _masterGain.gain.cancelScheduledValues(now);
    _masterGain.gain.setTargetAtTime(_muted ? 0 : 0.5, now, 0.05);
  }
  return _muted;
}

export function isMuted() { return _muted; }

// ─────────────────────────────────────────────────────────────────────────────
// LOW-LEVEL SYNTH PRIMITIVES
// ─────────────────────────────────────────────────────────────────────────────

/** White noise burst with bandpass filter — whoosh, thud, crackle, etc. */
function _noiseBurst({ duration = 0.3, freq = 800, Q = 1.5, gain = 0.25, type = 'bandpass', attack = 0.005, bus = null } = {}) {
  if (!_ac) return;
  const bufLen = _ac.sampleRate * duration;
  const buf = _ac.createBuffer(1, bufLen, _ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;

  const src = _ac.createBufferSource();
  src.buffer = buf;

  const filt = _ac.createBiquadFilter();
  filt.type = type;
  filt.frequency.value = freq;
  filt.Q.value = Q;

  const env = _ac.createGain();
  const now = _ac.currentTime;
  env.gain.setValueAtTime(0, now);
  env.gain.linearRampToValueAtTime(gain, now + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  src.connect(filt);
  filt.connect(env);
  env.connect(bus || _sfxBus);
  src.start(now);
  src.stop(now + duration + 0.01);
}

/** Oscillator with ADSR envelope */
function _toneBlip({ freq = 440, type = 'sine', duration = 0.25, attack = 0.01, decay = 0.1, sustain = 0.3, release = 0.15, gain = 0.25, bus = null, startTime = null } = {}) {
  if (!_ac) return;
  const now = startTime !== null ? startTime : _ac.currentTime;

  const osc = _ac.createOscillator();
  osc.type = type;
  osc.frequency.value = freq;

  const env = _ac.createGain();
  env.gain.setValueAtTime(0, now);
  env.gain.linearRampToValueAtTime(gain, now + attack);
  env.gain.linearRampToValueAtTime(gain * sustain, now + attack + decay);
  env.gain.setValueAtTime(gain * sustain, now + attack + decay + duration);
  env.gain.exponentialRampToValueAtTime(0.0001, now + attack + decay + duration + release);

  osc.connect(env);
  env.connect(bus || _sfxBus);
  osc.start(now);
  osc.stop(now + attack + decay + duration + release + 0.05);
}

/** Frequency sweep osc (rising or falling pitch ramp) */
function _sweep({ startFreq = 100, endFreq = 2000, duration = 0.5, type = 'sawtooth', gain = 0.2, attack = 0.02, bus = null } = {}) {
  if (!_ac) return;
  const now = _ac.currentTime;

  const osc = _ac.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(startFreq, now);
  osc.frequency.exponentialRampToValueAtTime(endFreq, now + duration);

  const env = _ac.createGain();
  env.gain.setValueAtTime(0, now);
  env.gain.linearRampToValueAtTime(gain, now + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  osc.connect(env);
  env.connect(bus || _sfxBus);
  osc.start(now);
  osc.stop(now + duration + 0.05);
}

/** Chord/arpeggio helper — plays an array of {freq, delay} via _toneBlip */
function _arpeggio({ notes, type = 'sine', noteDur = 0.2, gain = 0.2, bus = null, attack = 0.01, decay = 0.08, sustain = 0.4, release = 0.12 } = {}) {
  if (!_ac) return;
  for (const n of notes) {
    const startTime = _ac.currentTime + (n.delay || 0);
    _toneBlip({ freq: n.freq, type, duration: noteDur, attack, decay, sustain, release, gain, bus, startTime });
  }
}

/** Low-pass filtered sawtooth swell */
function _filteredSaw({ freq = 80, filterFreq = 400, duration = 1.0, gain = 0.2, attack = 0.1, bus = null } = {}) {
  if (!_ac) return;
  const now = _ac.currentTime;

  const osc = _ac.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.value = freq;

  const lp = _ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(filterFreq, now);
  lp.frequency.exponentialRampToValueAtTime(filterFreq * 0.3, now + duration);

  const env = _ac.createGain();
  env.gain.setValueAtTime(0, now);
  env.gain.linearRampToValueAtTime(gain, now + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  osc.connect(lp);
  lp.connect(env);
  env.connect(bus || _sfxBus);
  osc.start(now);
  osc.stop(now + duration + 0.05);
}

// ─────────────────────────────────────────────────────────────────────────────
// SFX SET
// ─────────────────────────────────────────────────────────────────────────────

export const sfx = {

  /** Monk staff swing — bandpass noise whoosh, pitch rises per combo, finisher adds boom */
  monkSwing(comboCount = 1, isFinisher = false) {
    try {
      if (!_ensureContext()) return;
      // Base whoosh — higher freq per combo
      const freq = 600 + comboCount * 200;
      _noiseBurst({ duration: 0.22, freq, Q: 2.5, gain: 0.25, type: 'bandpass' });
      // High attack click
      _toneBlip({ freq: 180 + comboCount * 60, type: 'square', duration: 0.03, attack: 0.003, decay: 0.03, sustain: 0.0, release: 0.02, gain: 0.15 });
      if (isFinisher) {
        // Low boom
        _noiseBurst({ duration: 0.4, freq: 80, Q: 1.0, gain: 0.3, type: 'lowshelf' });
        _toneBlip({ freq: 55, type: 'sine', duration: 0.3, attack: 0.01, decay: 0.2, sustain: 0, release: 0.1, gain: 0.35 });
        // Rising whoosh on finisher
        _sweep({ startFreq: 300, endFreq: 1800, duration: 0.35, type: 'sawtooth', gain: 0.18 });
      }
    } catch (e) { /* audio failure never breaks gameplay */ }
  },

  /** Sister palm strike — short airy chi 'pah' */
  sisterPalm() {
    try {
      if (!_ensureContext()) return;
      _noiseBurst({ duration: 0.18, freq: 2200, Q: 3.5, gain: 0.18, type: 'bandpass' });
      _toneBlip({ freq: 880, type: 'sine', duration: 0.08, attack: 0.003, decay: 0.06, sustain: 0, release: 0.05, gain: 0.16 });
    } catch (e) {}
  },

  /** Hit sparks — element-tinted tick */
  hitSpark(element = 'neutral', isDouble = false) {
    try {
      if (!_ensureContext()) return;
      const vol = isDouble ? 0.28 : 0.18;
      if (element === 'fire') {
        // Crackle noise burst
        _noiseBurst({ duration: 0.12, freq: 1500, Q: 1.2, gain: vol, type: 'highpass' });
        _noiseBurst({ duration: 0.06, freq: 400, Q: 2.0, gain: vol * 0.6, type: 'bandpass' });
      } else if (element === 'ice') {
        // High glassy ping ~2-3kHz
        _toneBlip({ freq: 2600, type: 'sine', duration: 0.08, attack: 0.003, decay: 0.12, sustain: 0, release: 0.08, gain: vol });
        _toneBlip({ freq: 3200, type: 'sine', duration: 0.06, attack: 0.003, decay: 0.08, sustain: 0, release: 0.06, gain: vol * 0.6 });
      } else if (element === 'water') {
        // Soft plop
        _toneBlip({ freq: 320, type: 'sine', duration: 0.1, attack: 0.005, decay: 0.08, sustain: 0, release: 0.05, gain: vol * 0.8 });
        _noiseBurst({ duration: 0.08, freq: 600, Q: 4.0, gain: vol * 0.5, type: 'bandpass' });
      } else if (element === 'poison') {
        // Squelchy low blip
        _toneBlip({ freq: 140, type: 'sawtooth', duration: 0.15, attack: 0.01, decay: 0.1, sustain: 0, release: 0.06, gain: vol });
        _noiseBurst({ duration: 0.1, freq: 200, Q: 3.0, gain: vol * 0.6, type: 'bandpass' });
      } else {
        // Neutral: dry thud
        _noiseBurst({ duration: 0.08, freq: 180, Q: 1.5, gain: vol, type: 'bandpass' });
        _toneBlip({ freq: 120, type: 'sine', duration: 0.06, attack: 0.003, decay: 0.05, sustain: 0, release: 0.03, gain: vol * 0.8 });
      }
    } catch (e) {}
  },

  /** Fire breath — roaring filtered-noise swell */
  breathAttack(element = 'fire') {
    try {
      if (!_ensureContext()) return;
      if (element === 'fire') {
        _noiseBurst({ duration: 0.55, freq: 500, Q: 0.8, gain: 0.3, type: 'bandpass', attack: 0.04 });
        _noiseBurst({ duration: 0.4, freq: 1200, Q: 1.5, gain: 0.18, type: 'bandpass', attack: 0.02 });
        _sweep({ startFreq: 150, endFreq: 600, duration: 0.5, type: 'sawtooth', gain: 0.15 });
      } else {
        // Generic element breath hiss
        _noiseBurst({ duration: 0.4, freq: 1800, Q: 2.0, gain: 0.2, type: 'highpass', attack: 0.03 });
      }
    } catch (e) {}
  },

  /** Projectile fire per element */
  projectileFire(element = 'neutral') {
    try {
      if (!_ensureContext()) return;
      if (element === 'ice') {
        _toneBlip({ freq: 2400, type: 'sine', duration: 0.06, attack: 0.003, decay: 0.1, sustain: 0, release: 0.05, gain: 0.2 });
        _noiseBurst({ duration: 0.12, freq: 3000, Q: 4.0, gain: 0.12, type: 'bandpass' });
      } else if (element === 'water') {
        _noiseBurst({ duration: 0.15, freq: 1400, Q: 2.5, gain: 0.18, type: 'bandpass', attack: 0.01 });
      } else if (element === 'poison') {
        _toneBlip({ freq: 160, type: 'sawtooth', duration: 0.12, attack: 0.01, decay: 0.08, sustain: 0, release: 0.05, gain: 0.2 });
        _noiseBurst({ duration: 0.1, freq: 250, Q: 2.0, gain: 0.15, type: 'bandpass' });
      } else {
        // neutral/fire generic
        _noiseBurst({ duration: 0.12, freq: 800, Q: 2.0, gain: 0.18, type: 'bandpass' });
      }
    } catch (e) {}
  },

  /** Dragon transform — rising sweep + soft roar */
  dragonTransform() {
    try {
      if (!_ensureContext()) return;
      // Rising sweep
      _sweep({ startFreq: 80, endFreq: 1600, duration: 0.7, type: 'sawtooth', gain: 0.25, attack: 0.05 });
      // Soft roar: low-pass sawtooth swell
      _filteredSaw({ freq: 55, filterFreq: 600, duration: 0.8, gain: 0.28, attack: 0.08 });
      // High shimmer sparkle
      _toneBlip({ freq: 1800, type: 'sine', duration: 0.3, attack: 0.02, decay: 0.2, sustain: 0, release: 0.1, gain: 0.18 });
    } catch (e) {}
  },

  /** Level up — pentatonic ascending arpeggio chime */
  levelUp() {
    try {
      if (!_ensureContext()) return;
      // Gold pentatonic arpeggio (C5 pentatonic)
      const root = 72; // C5
      const notes = PENTATONIC.map((s, i) => ({
        freq: _noteFreq(root + s),
        delay: i * 0.07,
      }));
      _arpeggio({ notes, type: 'sine', noteDur: 0.3, gain: 0.2, attack: 0.01, decay: 0.1, sustain: 0.3, release: 0.15 });
      // Final chord (top note + octave)
      const lastDelay = (notes.length - 1) * 0.07;
      _toneBlip({ freq: _noteFreq(root + 12), type: 'sine', duration: 0.5, attack: 0.02, decay: 0.2, sustain: 0.4, release: 0.3, gain: 0.18, startTime: _ac.currentTime + lastDelay + 0.1 });
    } catch (e) {}
  },

  /** Telegraph wind-up — low rumble growl (60-90Hz saw + noise) */
  telegraphGrowl() {
    try {
      if (!_ensureContext()) return;
      // Low saw rumble
      _filteredSaw({ freq: 65, filterFreq: 200, duration: 0.45, gain: 0.22, attack: 0.08 });
      // Sub-noise
      _noiseBurst({ duration: 0.4, freq: 90, Q: 0.8, gain: 0.15, type: 'lowpass', attack: 0.06 });
    } catch (e) {}
  },

  /** Enemy strike whoosh */
  enemyStrike() {
    try {
      if (!_ensureContext()) return;
      _noiseBurst({ duration: 0.15, freq: 700, Q: 2.5, gain: 0.22, type: 'bandpass' });
      _sweep({ startFreq: 500, endFreq: 1600, duration: 0.18, type: 'sawtooth', gain: 0.14 });
    } catch (e) {}
  },

  /** Player takes a hit — thud + brief 200Hz drop */
  playerHit() {
    try {
      if (!_ensureContext()) return;
      // Thud
      _noiseBurst({ duration: 0.18, freq: 120, Q: 1.2, gain: 0.3, type: 'bandpass', attack: 0.003 });
      // Pitch drop
      _sweep({ startFreq: 280, endFreq: 80, duration: 0.22, type: 'sine', gain: 0.25 });
    } catch (e) {}
  },

  /** Player KO — descending minor phrase */
  playerKO() {
    try {
      if (!_ensureContext()) return;
      const root = 64; // E4
      const descMinor = [0, -2, -3, -5, -7];
      const notes = descMinor.map((s, i) => ({
        freq: _noteFreq(root + s),
        delay: i * 0.1,
      }));
      _arpeggio({ notes, type: 'sine', noteDur: 0.35, gain: 0.22, attack: 0.01, decay: 0.15, sustain: 0.3, release: 0.2 });
    } catch (e) {}
  },

  /** Player revive — ascending soft chime */
  playerRevive() {
    try {
      if (!_ensureContext()) return;
      const root = 57; // A3
      const notes = PENTATONIC.slice(0, 4).map((s, i) => ({
        freq: _noteFreq(root + s + 12),
        delay: i * 0.09,
      }));
      _arpeggio({ notes, type: 'sine', noteDur: 0.3, gain: 0.18, attack: 0.01, decay: 0.1, sustain: 0.3, release: 0.15 });
    } catch (e) {}
  },

  /** Chi shield activate — gong-ish resonant sine cluster (long ~1.2s decay) */
  chiShield() {
    try {
      if (!_ensureContext()) return;
      const gongFreqs = [220, 330, 550, 880];
      for (const f of gongFreqs) {
        const now = _ac.currentTime;
        const osc = _ac.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = f;
        const env = _ac.createGain();
        env.gain.setValueAtTime(0, now);
        env.gain.linearRampToValueAtTime(0.18 / gongFreqs.length, now + 0.01);
        env.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);
        osc.connect(env);
        env.connect(_sfxBus);
        osc.start(now);
        osc.stop(now + 1.25);
      }
    } catch (e) {}
  },

  /** Shield block ripple — metallic clang */
  shieldBlock() {
    try {
      if (!_ensureContext()) return;
      _toneBlip({ freq: 1200, type: 'square', duration: 0.04, attack: 0.002, decay: 0.08, sustain: 0, release: 0.15, gain: 0.22 });
      _toneBlip({ freq: 800, type: 'square', duration: 0.04, attack: 0.002, decay: 0.06, sustain: 0, release: 0.12, gain: 0.15 });
      _noiseBurst({ duration: 0.12, freq: 2000, Q: 3.0, gain: 0.18, type: 'bandpass', attack: 0.002 });
    } catch (e) {}
  },

  /** Healing pulse — gentle 3-note harp-like arpeggio */
  healingPulse() {
    try {
      if (!_ensureContext()) return;
      const root = 60; // C4
      const notes = [0, 7, 12].map((s, i) => ({
        freq: _noteFreq(root + s),
        delay: i * 0.12,
      }));
      _arpeggio({ notes, type: 'sine', noteDur: 0.45, gain: 0.2, attack: 0.01, decay: 0.15, sustain: 0.4, release: 0.25 });
    } catch (e) {}
  },

  /** Frost nova — ice shatter (noise burst + high pings) */
  frostNova() {
    try {
      if (!_ensureContext()) return;
      _noiseBurst({ duration: 0.35, freq: 3500, Q: 0.8, gain: 0.28, type: 'highpass', attack: 0.005 });
      // Ice ping cluster
      const pingFreqs = [2800, 3600, 4200, 5000];
      for (let i = 0; i < pingFreqs.length; i++) {
        const now = _ac.currentTime + i * 0.04;
        _toneBlip({ freq: pingFreqs[i], type: 'sine', duration: 0.12, attack: 0.003, decay: 0.1, sustain: 0, release: 0.08, gain: 0.16, startTime: now });
      }
    } catch (e) {}
  },

  /** Demon death dissolve by type */
  demonDeath(type = 'shadowling') {
    try {
      if (!_ensureContext()) return;
      if (type === 'shadowling') {
        // Poof
        _noiseBurst({ duration: 0.25, freq: 400, Q: 1.0, gain: 0.22, type: 'bandpass', attack: 0.01 });
        _sweep({ startFreq: 600, endFreq: 100, duration: 0.3, type: 'sine', gain: 0.15 });
      } else if (type === 'frostimp') {
        // Shatter
        _noiseBurst({ duration: 0.2, freq: 4000, Q: 0.7, gain: 0.3, type: 'highpass', attack: 0.004 });
        _toneBlip({ freq: 3000, type: 'sine', duration: 0.1, attack: 0.003, decay: 0.1, sustain: 0, release: 0.08, gain: 0.2 });
      } else if (type === 'tidewraith') {
        // Splash
        _noiseBurst({ duration: 0.3, freq: 800, Q: 1.5, gain: 0.22, type: 'bandpass', attack: 0.01 });
        _toneBlip({ freq: 420, type: 'sine', duration: 0.15, attack: 0.01, decay: 0.1, sustain: 0, release: 0.08, gain: 0.18 });
      } else if (type === 'venomoni') {
        // Hiss
        _noiseBurst({ duration: 0.4, freq: 2200, Q: 1.8, gain: 0.25, type: 'bandpass', attack: 0.02 });
        _toneBlip({ freq: 200, type: 'sawtooth', duration: 0.3, attack: 0.02, decay: 0.2, sustain: 0, release: 0.1, gain: 0.2 });
      } else if (type === 'infernolord') {
        // Big explosion
        _noiseBurst({ duration: 0.7, freq: 100, Q: 0.5, gain: 0.35, type: 'lowpass', attack: 0.005 });
        _noiseBurst({ duration: 0.5, freq: 500, Q: 1.0, gain: 0.28, type: 'bandpass', attack: 0.01 });
        _sweep({ startFreq: 400, endFreq: 40, duration: 0.8, type: 'sawtooth', gain: 0.3 });
        _filteredSaw({ freq: 40, filterFreq: 300, duration: 0.6, gain: 0.25, attack: 0.01 });
      } else {
        _noiseBurst({ duration: 0.2, freq: 300, Q: 1.5, gain: 0.2, type: 'bandpass', attack: 0.01 });
      }
    } catch (e) {}
  },

  /** Wave banner — taiko-ish drum hit (low sine thump + noise slap) */
  waveBanner() {
    try {
      if (!_ensureContext()) return;
      // Low sine thump
      const now = _ac.currentTime;
      const osc = _ac.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(80, now);
      osc.frequency.exponentialRampToValueAtTime(30, now + 0.25);
      const env = _ac.createGain();
      env.gain.setValueAtTime(0.35, now);
      env.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
      osc.connect(env);
      env.connect(_sfxBus);
      osc.start(now);
      osc.stop(now + 0.4);
      // Noise slap for the 'crack'
      _noiseBurst({ duration: 0.08, freq: 2500, Q: 1.5, gain: 0.2, type: 'highpass', attack: 0.002 });
    } catch (e) {}
  },

  /** Quest complete — victory sting (gold pentatonic flourish) */
  questComplete() {
    try {
      if (!_ensureContext()) return;
      const root = 60; // C4
      // Ascending pentatonic across two octaves
      const intervals = [0, 2, 4, 7, 9, 12, 14, 16];
      const notes = intervals.map((s, i) => ({
        freq: _noteFreq(root + s),
        delay: i * 0.075,
      }));
      _arpeggio({ notes, type: 'sine', noteDur: 0.4, gain: 0.22, attack: 0.01, decay: 0.15, sustain: 0.4, release: 0.25 });
      // Final chord bloom
      const endDelay = (intervals.length - 1) * 0.075 + 0.2;
      [0, 4, 7, 12].forEach(s => {
        _toneBlip({ freq: _noteFreq(root + s + 12), type: 'sine', duration: 0.8, attack: 0.04, decay: 0.3, sustain: 0.5, release: 0.5, gain: 0.16, startTime: _ac.currentTime + endDelay });
      });
    } catch (e) {}
  },

  /** Menu navigate tick */
  menuTick() {
    try {
      if (!_ensureContext()) return;
      _toneBlip({ freq: 660, type: 'sine', duration: 0.04, attack: 0.003, decay: 0.04, sustain: 0, release: 0.02, gain: 0.12 });
    } catch (e) {}
  },

  /** Menu select chime */
  menuSelect() {
    try {
      if (!_ensureContext()) return;
      const root = 65; // F4
      const notes = [0, 4, 7].map((s, i) => ({
        freq: _noteFreq(root + s),
        delay: i * 0.06,
      }));
      _arpeggio({ notes, type: 'sine', noteDur: 0.25, gain: 0.18, attack: 0.01, decay: 0.08, sustain: 0.3, release: 0.15 });
    } catch (e) {}
  },

  /** Game over — somber low chord */
  gameOver() {
    try {
      if (!_ensureContext()) return;
      // Minor chord C2: C, Eb, G (MIDI 36, 39, 43)
      const chordNotes = [36, 39, 43];
      for (const n of chordNotes) {
        const now = _ac.currentTime;
        const osc = _ac.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = _noteFreq(n);
        const env = _ac.createGain();
        env.gain.setValueAtTime(0, now);
        env.gain.linearRampToValueAtTime(0.18, now + 0.1);
        env.gain.exponentialRampToValueAtTime(0.0001, now + 2.5);
        osc.connect(env);
        env.connect(_sfxBus);
        osc.start(now);
        osc.stop(now + 2.6);
      }
      // Descending drone
      _sweep({ startFreq: 120, endFreq: 50, duration: 2.0, type: 'sawtooth', gain: 0.18 });
    } catch (e) {}
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// MUSIC SCHEDULER
// ─────────────────────────────────────────────────────────────────────────────
// Generative ambient via lookahead scheduler.
// setInterval 200ms checks beat clock vs ctx.currentTime.
// ~70 BPM = beat = 60/70 ≈ 0.857s

const BEAT_SEC = 60 / 70;       // base seconds per beat (70 BPM)
const LOOKAHEAD = 0.5;          // schedule this far ahead (seconds)
const SCHEDULE_INTERVAL = 200;  // ms between scheduler ticks

// Effective beat length, shortened slightly per theme tempo AND by live intensity
// (combat speeds the pulse up to ~12% faster at peak threat). Bounded so the
// lookahead/beat-index math stays sane. Pure function of current state numbers —
// safe to call with no AudioContext.
function _beatSec() {
  const tm = _themeMusic();
  // intensity tightens tempo up to ~12%; ultimate adds a small extra push
  const intensityMult = 1 - 0.12 * _intensity - (_ultActive ? 0.04 : 0);
  return BEAT_SEC * (tm.beatMult || 1) * Math.max(0.82, intensityMult);
}

// Track which beats have been scheduled (avoid double-scheduling)
let _scheduledUpTo = 0; // audioCtx.currentTime up to which we've scheduled

// Koto-like pluck: triangle osc with fast decay + lowpass (zen layer)
function _kotoPluck(freq, time, vol = 0.18, bus = null) {
  if (!_ac) return;
  const osc = _ac.createOscillator();
  osc.type = 'triangle';
  osc.frequency.value = freq;

  const lp = _ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = freq * 4;
  lp.Q.value = 0.8;

  const env = _ac.createGain();
  env.gain.setValueAtTime(vol, time);
  env.gain.exponentialRampToValueAtTime(0.0001, time + 0.6);

  osc.connect(lp);
  lp.connect(env);
  env.connect(bus || _zenGain);
  osc.start(time);
  osc.stop(time + 0.65);
}

// Taiko pulse: sine thump that decays fast + noise transient
function _taikoBeat(time, vol = 0.22, bus = null) {
  if (!_ac) return;
  // Low sine thump
  const osc = _ac.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(70, time);
  osc.frequency.exponentialRampToValueAtTime(28, time + 0.18);
  const env = _ac.createGain();
  env.gain.setValueAtTime(vol, time);
  env.gain.exponentialRampToValueAtTime(0.0001, time + 0.28);
  osc.connect(env);
  env.connect(bus || _combatGain);
  osc.start(time);
  osc.stop(time + 0.3);
  // Noise transient crack
  const bufLen = Math.floor(_ac.sampleRate * 0.05);
  const buf = _ac.createBuffer(1, bufLen, _ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / bufLen);
  const src = _ac.createBufferSource(); src.buffer = buf;
  const nEnv = _ac.createGain();
  nEnv.gain.setValueAtTime(vol * 0.5, time);
  nEnv.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
  src.connect(nEnv);
  nEnv.connect(bus || _combatGain);
  src.start(time);
  src.stop(time + 0.06);
}

// Boss low drum: deeper, slower (~half the taiko rate)
function _bossDrum(time, vol = 0.28) {
  if (!_ac) return;
  const osc = _ac.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(50, time);
  osc.frequency.exponentialRampToValueAtTime(18, time + 0.3);
  const env = _ac.createGain();
  env.gain.setValueAtTime(vol, time);
  env.gain.exponentialRampToValueAtTime(0.0001, time + 0.4);
  osc.connect(env);
  env.connect(_bossGain);
  osc.start(time);
  osc.stop(time + 0.45);
}

// Root drone: slow, very quiet, continuous — recreated when layer changes
function _spawnZenDrone() {
  if (!_ac || !_zenGain) return null;
  const osc = _ac.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = _themeMusic().zenDroneHz; // theme root (C3 zen / D3 ice / G2 poison)
  const gain = _ac.createGain();
  gain.gain.value = 0.06;
  osc.connect(gain);
  gain.connect(_zenGain);
  osc.start(_ac.currentTime);
  // keep handles so a theme change can re-pitch the root (ramped, no pop)
  osc._droneGain = gain;
  return osc;
}

function _spawnBossDrone() {
  if (!_ac || !_bossGain) return null;
  const osc = _ac.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.value = _themeMusic().bossDroneHz; // theme-keyed minor root
  const lp = _ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 200;
  const gain = _ac.createGain();
  gain.gain.value = 0.08;
  osc.connect(lp);
  lp.connect(gain);
  gain.connect(_bossGain);
  osc.start(_ac.currentTime);
  osc._bossLp = lp;
  return osc;
}

// Fallback zen scale (theme 1). The active scale comes from _themeMusic().zenScale.
const ZEN_NOTES_MIDI = [48, 50, 52, 55, 57, 60, 62, 64, 67, 69]; // C3..A4 pentatonic

// How often to play a koto note (in beats). Sparse = zen feel.
// Probability rises with intensity so the melody gets busier as combat heats up,
// then thins back toward the sparse zen feel when the arena clears.
function _shouldPlayKoto(beatIndex) {
  // Deterministic pseudo-random based on beat index (so consistent each loop pass)
  const r = Math.sin(beatIndex * 127.1 + 3.14) * 43758.5453;
  const frac = r - Math.floor(r);
  // 0.30 calm → up to ~0.55 at peak intensity
  const thresh = 0.30 + 0.25 * _intensity;
  return frac < thresh;
}

// Beat-indexed note selection from the ACTIVE theme scale (cold/high vs dark/low).
function _zenNoteForBeat(beatIndex) {
  const scale = _themeMusic().zenScale || ZEN_NOTES_MIDI;
  const idx = Math.floor(Math.abs(Math.sin(beatIndex * 314.159) * 43758.5) % scale.length);
  return _noteFreq(scale[idx]);
}

// Cursor-based scheduler: a monotonic beat counter + a running time cursor advanced
// by the (variable) effective beat length. This lets tempo flex with intensity/theme
// without the absolute-time beat math jumping. _scheduledUpTo (the time cursor) lives
// in the outer scope and is initialised in _startScheduler.
let _beatCounter = 0;       // monotonic beat index since scheduler start

function _scheduleBeats(toTime) {
  if (!_ac) return;
  // Hard cap iterations so a long pause (large currentTime gap) can never spin.
  let guard = 0;
  while (_scheduledUpTo < toTime && guard < 256) {
    guard++;
    const beatTime = _scheduledUpTo;
    const beatIdx = _beatCounter;
    const tm = _themeMusic();
    const bs = _beatSec();

    // ── Zen melodic layer: theme-scale koto plucks ──
    if (_shouldPlayKoto(beatIdx)) {
      _kotoPluck(_zenNoteForBeat(beatIdx), beatTime, 0.16 * (tm.kotoVol || 1));
      // Occasional 2nd note (chord feel) — more likely under intensity.
      if (_shouldPlayKoto(beatIdx + 100)) {
        const scale = tm.zenScale || ZEN_NOTES_MIDI;
        const idx2 = Math.floor(Math.abs(Math.sin((beatIdx + 200) * 271.82) * 43758.5) % scale.length);
        _kotoPluck(_noteFreq(scale[idx2]), beatTime + 0.05, 0.10 * (tm.kotoVol || 1));
      }
    }

    // ── Combat percussion: taiko pulse every 2 beats; intensity adds the
    // off-beat ghost note (so light combat is a steady pulse, heavy combat
    // fills in). The _combatGain layer gain (set in _crossfadeTo) gates audibility. ──
    if (beatIdx % 2 === 0) {
      _taikoBeat(beatTime, 0.22);
      if (_intensity > 0.25) {
        _taikoBeat(beatTime + bs * 0.5, 0.10 + 0.06 * _intensity);
      }
    }

    // ── Boss percussion: deeper drum every 4 beats + a low minor tone. When the
    // boss is enraged / in a late phase, add an extra mid-bar hit for urgency. ──
    if (beatIdx % 4 === 0) {
      _bossDrum(beatTime, 0.28);
      const root = tm.bossScaleRoot || 36;
      const minorNote = MINOR_PENTATONIC[Math.floor(Math.abs(Math.sin(beatIdx * 0.77) * 43758) % MINOR_PENTATONIC.length)];
      _kotoPluck(_noteFreq(root + minorNote), beatTime, 0.14, _bossGain);
    } else if (_bossActive && (_bossEnraged || _bossPhase >= 2) && beatIdx % 2 === 0) {
      // urgency fill — only when a boss is genuinely escalating
      _bossDrum(beatTime, 0.20);
    }

    // advance cursor by the current (possibly flexed) beat length
    _scheduledUpTo += bs;
    _beatCounter++;
  }
  // If we somehow fell far behind (tab parked), jump the cursor forward so we
  // don't schedule a burst of stale beats.
  if (_scheduledUpTo < toTime) _scheduledUpTo = toTime;
}

function _tickScheduler() {
  if (!_ac) return;
  // Read live game state + ease the adaptive scalars FIRST, so this tick's
  // scheduling (tempo/density) and layer gains use fresh values.
  _updateAdaptiveState();

  const now = _ac.currentTime;
  const scheduleUpTo = now + LOOKAHEAD;
  _scheduleBeats(scheduleUpTo);

  // Layer crossfade logic — poll game state + drive continuous layer gains
  _updateMusicLayer();
}

// ── Read game state → compute raw intensity/tension targets → ease toward them ──
// Entirely numeric + null-safe: if gameState/players are missing (headless, menu)
// it just relaxes toward 0. Never touches WebAudio nodes here.
function _updateAdaptiveState() {
  const gs = gameCtx.gameState;

  // Mirror the active level theme (1 zen / 2 ice / 3 poison) for scale/timbre.
  _activeTheme = (gameCtx._activeTheme === 2 || gameCtx._activeTheme === 3)
    ? gameCtx._activeTheme : 1;

  let enemyN = 0;
  _bossActive = false; _bossPhase = 1; _bossEnraged = false;
  _ultActive = false;
  let lowHp = 0;

  if (gs) {
    const spirits = gs.spirits;
    if (spirits && spirits.length) {
      for (let i = 0; i < spirits.length; i++) {
        const s = spirits[i];
        if (!s || !s.alive) continue;
        enemyN++;
        if (s._isBoss) {
          _bossActive = true;
          if ((s.phase || 1) > _bossPhase) _bossPhase = s.phase || 1;
          if (s.enraged) _bossEnraged = true;
        }
      }
    }
    // Low-HP tension + ultimate swell from both players.
    const players = [gs.p1, gs.p2];
    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      if (!p || p.inactive) continue;
      if (p.ultimateActive) _ultActive = true;
      if (!p.isKO && p.maxHp > 0) {
        const frac = p.hp / p.maxHp;
        if (frac < 0.35) {
          // 0 at 35% HP → 1 at 0% HP (linear)
          const t = (0.35 - frac) / 0.35;
          if (t > lowHp) lowHp = t;
        }
      }
    }
  }

  // Raw intensity target: enemy density + boss escalation. Only count when actually
  // in a wave (avoid menu/intro residue from lingering arrays).
  const inWave = gs && typeof gs.state === 'string' && gs.state.indexOf('WAVE') === 0;
  if (inWave) {
    // density: ~6 enemies = full from the crowd term
    const density = Math.min(1, enemyN / 6);
    let it = density * 0.7;
    if (_bossActive) {
      // boss floors intensity high and climbs with phase/enrage
      const phaseBoost = 0.55 + 0.12 * (_bossPhase - 1) + (_bossEnraged ? 0.12 : 0);
      it = Math.max(it, Math.min(1, phaseBoost + density * 0.25));
    }
    _intensityTarget = Math.min(1, it);
  } else {
    _intensityTarget = 0; // menu/intro/complete/gameover → relax to calm
  }
  _tensionTarget = lowHp;

  // Ease (EWMA). Rise fast into danger, fall slower for a graceful calm-down.
  const upRate = 0.22, downRate = 0.06;
  _intensity += (_intensityTarget - _intensity) * (_intensityTarget > _intensity ? upRate : downRate);
  _tension   += (_tensionTarget   - _tension)   * (_tensionTarget   > _tension   ? 0.18 : 0.05);
  // clamp tiny residue to 0 so things fully settle
  if (_intensity < 0.001) _intensity = 0;
  if (_tension   < 0.001) _tension   = 0;
}

function _updateMusicLayer() {
  if (!_ac || !gameCtx.gameState) return;
  const gs = gameCtx.gameState.state;

  // Coarse layer target (drives drones + base mix). The continuous intensity
  // value then fine-tunes the combat layer gain on top of this.
  let wanted = 'zen';
  if (gs === 'MENU' || gs === 'INTRO' || gs === 'COMPLETE' || gs === 'GAMEOVER') {
    wanted = 'zen';
  } else if (_bossActive) {
    wanted = 'boss';
  } else if (typeof gs === 'string' && gs.indexOf('WAVE') === 0) {
    wanted = 'combat';
  }

  if (wanted !== _musicLayer) {
    _crossfadeTo(wanted);
    _musicLayer = wanted;
  }

  // Re-pitch persistent drones if the level theme changed (smooth glide, no pop).
  if (_activeTheme !== _lastTheme) {
    _repitchDronesForTheme();
    _lastTheme = _activeTheme;
  }

  // Optional recorded-music layer (crossfade ACE-Step tracks if present).
  _updateRecordedMusic();
  _smoothRecLoop();   // dip the gain across the loop seam so 30s tracks loop cleanly

  // Continuous per-tick fine-tune: even within 'combat', scale the combat layer by
  // live intensity so a near-cleared arena thins toward calm; ramp every tick.
  _applyContinuousMix();
  _applyTensionDrone();
}

// Pick the recorded-track key for the current state: boss overrides; else per-land.
function _wantedRecKey() {
  if (_bossActive) return 'boss';
  return 'theme' + (_activeTheme === 2 ? 2 : _activeTheme === 3 ? 3 : 1);
}

// Crossfade the optional recorded-music layer toward the wanted key. Fully guarded:
// no AudioContext, muted, or a missing file all no-op and leave procedural music alone.
function _updateRecordedMusic() {
  if (!_recEnabled || !_ac || _recDisabled) return;
  const key = _wantedRecKey();
  if (key === _recKey) return;          // already on the right track
  if (_recMissing[key]) {               // known-absent → ensure synth is full, bail
    if (!_recEl) _setSynthDuck(false);
    return;
  }
  const el = new Audio();
  el.loop = true; el.crossOrigin = 'anonymous'; el.preload = 'auto';
  el.src = `assets/music/${key}.mp3`;
  el.addEventListener('canplaythrough', () => {
    // A new wanted key may have superseded this one while loading.
    if (_wantedRecKey() !== key) { try { el.pause(); } catch {} return; }
    try {
      // PROPER CROSSFADE: each track gets its OWN gain node so the old can fade out
      // while the new fades in (the old code shared one gain → both played at the same
      // level then the old hard-cut, which is why boss transitions felt abrupt/weird).
      // Boss swaps get a slightly quicker, dramatic fade; land swaps are gentle.
      const FADE = (key === 'boss' || _recKey === 'boss') ? 1.8 : 2.6;
      const newGain = _ac.createGain();
      newGain.gain.value = 0;
      newGain.connect(_masterGain);
      const src = _ac.createMediaElementSource(el);
      src.connect(newGain);
      const t = _ac.currentTime;
      // Fade OUT the previous track on its own gain, then stop + disconnect it.
      if (_recEl && _recGain) {
        const oldEl = _recEl, oldGain = _recGain;
        try { oldGain.gain.cancelScheduledValues(t); oldGain.gain.setValueAtTime(oldGain.gain.value, t); oldGain.gain.linearRampToValueAtTime(0, t + FADE); } catch {}
        setTimeout(() => { try { oldEl.pause(); } catch {} try { oldGain.disconnect(); } catch {} }, (FADE + 0.25) * 1000);
      }
      // Fade IN the new track.
      newGain.gain.setValueAtTime(0, t);
      newGain.gain.linearRampToValueAtTime(0.62, t + FADE);
      _setSynthDuck(true);
      el.play().catch(() => {});
      _recEl = el; _recSrc = src; _recKey = key; _recGain = newGain;
      _recSettleAt = t + FADE;   // smooth-loop dip only takes over once the fade-in settles
    } catch (_) { /* MediaElementSource can throw if reused; ignore */ }
  }, { once: true });
  el.addEventListener('error', () => { _recMissing[key] = true; if (!_recEl) _setSynthDuck(false); }, { once: true });
  // If NO track ever loads (all missing), the first error marks it; nothing else changes.
}

// Duck (or restore) the procedural music bus so a recorded track can sit on top.
function _setSynthDuck(duck) {
  if (!_musicBus || !_ac) return;
  const t = _ac.currentTime;
  try {
    _musicBus.gain.cancelScheduledValues(t);
    _musicBus.gain.setValueAtTime(_musicBus.gain.value, t);
    _musicBus.gain.linearRampToValueAtTime(duck ? _SYNTH_DUCK : _SYNTH_FULL, t + 1.2);
  } catch {}
}

// Glide the persistent drone oscillators to the active theme's roots (called only
// when the theme actually changes). Each step is guarded + ramped → no clicks.
function _repitchDronesForTheme() {
  if (!_ac) return;
  const now = _ac.currentTime;
  const tm = _themeMusic();
  if (_zenDroneNode) {
    try {
      _zenDroneNode.frequency.cancelScheduledValues(now);
      _zenDroneNode.frequency.linearRampToValueAtTime(tm.zenDroneHz, now + 1.2);
    } catch {}
  }
  if (_bossDroneNode) {
    try {
      _bossDroneNode.frequency.cancelScheduledValues(now);
      _bossDroneNode.frequency.linearRampToValueAtTime(tm.bossDroneHz, now + 1.2);
    } catch {}
  }
  if (_tensionDroneOsc) {
    try {
      _tensionDroneOsc.frequency.cancelScheduledValues(now);
      _tensionDroneOsc.frequency.linearRampToValueAtTime(tm.tensionHz, now + 1.2);
    } catch {}
  }
  if (_tensionDroneOsc2) {
    try {
      _tensionDroneOsc2.frequency.cancelScheduledValues(now);
      _tensionDroneOsc2.frequency.linearRampToValueAtTime(tm.tensionHz, now + 1.2);
    } catch {}
  }
}

// Base layer mix per coarse layer. The continuous mix (_applyContinuousMix) then
// modulates the COMBAT layer by live intensity within these envelopes.
const _LAYER_BASE = {
  zen:    { zen: 1.0, combat: 0.0, boss: 0.0 },
  combat: { zen: 0.4, combat: 1.0, boss: 0.0 },
  boss:   { zen: 0.2, combat: 0.3, boss: 1.0 },
  none:   { zen: 0.0, combat: 0.0, boss: 0.0 },
};

function _crossfadeTo(layer) {
  if (!_ac) return;
  const now = _ac.currentTime;
  const RAMP = 1.5; // crossfade time in seconds

  const t = _LAYER_BASE[layer] || _LAYER_BASE.none;

  // Zen + boss layers ride the coarse base envelope here. The combat layer is left
  // to _applyContinuousMix (intensity-driven), so we don't fight its per-tick ramps.
  [
    [_zenGain,  t.zen],
    [_bossGain, t.boss],
  ].forEach(([g, val]) => {
    if (!g) return;
    g.gain.cancelScheduledValues(now);
    g.gain.setValueAtTime(g.gain.value, now);
    g.gain.linearRampToValueAtTime(val, now + RAMP);
  });

  // Start/stop drones as needed
  if (layer === 'zen' && !_zenDroneNode) {
    _zenDroneNode = _spawnZenDrone();
  }
  if (layer === 'boss' && !_bossDroneNode) {
    _bossDroneNode = _spawnBossDrone();
  }
  if (layer !== 'boss' && _bossDroneNode) {
    try { _bossDroneNode.stop(_ac.currentTime + RAMP); } catch {}
    _bossDroneNode = null;
  }
}

// ── Continuous per-tick mix: scale the combat percussion layer by live intensity,
// and apply the ultimate "swell" by lifting the whole music bus a touch. Short
// ramps (≈ scheduler interval) keep it smooth and pop-free. Fully null-safe. ──
function _applyContinuousMix() {
  if (!_ac) return;
  const now = _ac.currentTime;
  const R = 0.22; // ramp ≈ one scheduler tick, smooth

  // Combat layer audible only within combat/boss layers; its loudness tracks
  // intensity so a thinning arena fades the drums toward zen calm.
  if (_combatGain) {
    let target = 0;
    if (_musicLayer === 'combat') target = 0.25 + 0.75 * _intensity; // 0.25..1.0
    else if (_musicLayer === 'boss') target = 0.3 + 0.4 * _intensity; // under the boss bed
    // ultimate swell adds a little extra body
    if (_ultActive) target = Math.min(1.1, target + 0.1);
    _rampGain(_combatGain.gain, target, now, R);
  }

  // Ultimate swell: lift the master music bus ~18% while a hero's ultimate runs,
  // then settle back. Gives the super-state a musical bloom.
  if (_musicBus) {
    const target = _ultActive ? 0.72 : 0.55; // base music bus is 0.55
    _rampGain(_musicBus.gain, target, now, R);
  }
}

// ── Low-HP tension drone: a detuned low pair whose gain follows _tension. Created
// lazily on first need; if it can't be created (no context) it's just skipped. ──
function _applyTensionDrone() {
  if (!_ac || !_musicBus) return;
  const now = _ac.currentTime;

  if (_tension > 0.001) {
    if (!_tensionDroneOsc) _spawnTensionDrone();
    if (_tensionDroneGain) {
      // up to ~0.10 gain at full tension — subtle, sits under everything
      _rampGain(_tensionDroneGain.gain, 0.10 * _tension, now, 0.3);
    }
    // widen the detune (beating gets queasier) as tension climbs
    if (_tensionDroneOsc2) {
      try {
        _tensionDroneOsc2.detune.cancelScheduledValues(now);
        _tensionDroneOsc2.detune.linearRampToValueAtTime(_themeMusic().detune * (1 + _tension), now + 0.3);
      } catch {}
    }
  } else if (_tensionDroneGain) {
    _rampGain(_tensionDroneGain.gain, 0, now, 0.4);
  }
}

function _spawnTensionDrone() {
  if (!_ac || !_musicBus || _tensionDroneOsc) return;
  try {
    const tm = _themeMusic();
    const g = _ac.createGain();
    g.gain.value = 0;
    g.connect(_musicBus);
    const lp = _ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 220;
    lp.connect(g);
    // two slightly detuned saws → slow beating = unease
    const o1 = _ac.createOscillator();
    o1.type = 'sawtooth'; o1.frequency.value = tm.tensionHz;
    const o2 = _ac.createOscillator();
    o2.type = 'sawtooth'; o2.frequency.value = tm.tensionHz; o2.detune.value = tm.detune;
    o1.connect(lp); o2.connect(lp);
    o1.start(_ac.currentTime); o2.start(_ac.currentTime);
    _tensionDroneOsc = o1; _tensionDroneOsc2 = o2; _tensionDroneGain = g;
  } catch (e) { /* never break gameplay */ }
}

// Smooth gain ramp helper — cancels, anchors current value, ramps. Null-safe.
function _rampGain(param, target, now, ramp) {
  if (!param) return;
  try {
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(target, now + ramp);
  } catch (e) { /* ignore */ }
}

function _startScheduler() {
  // Guard: only one interval instance at a time
  if (_schedulerInterval !== null) {
    clearInterval(_schedulerInterval);
    _schedulerInterval = null;
  }

  if (!_ac) return;

  // Initialise the cursor-based scheduler state.
  _scheduledUpTo = _ac.currentTime;
  _beatCounter = 0;
  // Reset adaptive scalars so a fresh context starts calm.
  _intensity = 0; _intensityTarget = 0; _tension = 0; _tensionTarget = 0;
  _bossActive = false; _bossPhase = 1; _bossEnraged = false; _ultActive = false;
  _activeTheme = (gameCtx._activeTheme === 2 || gameCtx._activeTheme === 3) ? gameCtx._activeTheme : 1;
  _lastTheme = _activeTheme;

  // Spawn zen drone immediately
  _zenDroneNode = _spawnZenDrone();
  _musicLayer = 'zen';
  _crossfadeTo('zen');

  _schedulerInterval = setInterval(_tickScheduler, SCHEDULE_INTERVAL);
}

// Exposed for E2E verification: returns true if only one interval is running
export function schedulerSingleInstance() {
  return _schedulerInterval !== null;
}

// ── Adaptive-music introspection (debug/E2E; additive, read-only) ──────────────
// Returns the live adaptive scalars. Safe to call any time — all plain numbers,
// 0 when the context was never started (headless).
export function musicState() {
  return {
    intensity: _intensity,
    tension: _tension,
    layer: _musicLayer,
    bossActive: _bossActive,
    bossPhase: _bossPhase,
    bossEnraged: _bossEnraged,
    ultActive: _ultActive,
    theme: _activeTheme,
    running: _schedulerInterval !== null,
    recordedEnabled: _recEnabled,
    recordedKey: _recKey,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// INIT HOOK — called on first user gesture (keyboard or mouse in menu)
// ─────────────────────────────────────────────────────────────────────────────
export function initAudioOnGesture() {
  try {
    _ensureContext();
  } catch (e) { /* ignore */ }
}

// ─────────────────────────────────────────────────────────────────────────────
// AUDIO LABEL for menu ("AUDIO: ON" / "AUDIO: OFF")
// ─────────────────────────────────────────────────────────────────────────────
export function audioLabel() {
  return 'AUDIO: ' + (_muted ? 'OFF' : 'ON');
}
