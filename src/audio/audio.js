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

const BEAT_SEC = 60 / 70;       // seconds per beat
const LOOKAHEAD = 0.5;          // schedule this far ahead (seconds)
const SCHEDULE_INTERVAL = 200;  // ms between scheduler ticks

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
  osc.frequency.value = 130.81; // C3 root
  const gain = _ac.createGain();
  gain.gain.value = 0.06;
  osc.connect(gain);
  gain.connect(_zenGain);
  osc.start(_ac.currentTime);
  return osc;
}

function _spawnBossDrone() {
  if (!_ac || !_bossGain) return null;
  const osc = _ac.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.value = 82.41; // E2 (minor shift for boss)
  const lp = _ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 200;
  const gain = _ac.createGain();
  gain.gain.value = 0.08;
  osc.connect(lp);
  lp.connect(gain);
  gain.connect(_bossGain);
  osc.start(_ac.currentTime);
  return osc;
}

// Pentatonic scale notes for zen layer (C3 pentatonic in MIDI)
const ZEN_NOTES_MIDI = [48, 50, 52, 55, 57, 60, 62, 64, 67, 69]; // C3..A4 pentatonic

// How often to play a koto note (in beats). Sparse = zen feel
// Every 2-4 beats randomly
function _shouldPlayKoto(beatIndex) {
  // Deterministic pseudo-random based on beat index (so consistent each loop pass)
  const r = Math.sin(beatIndex * 127.1 + 3.14) * 43758.5453;
  const frac = r - Math.floor(r);
  return frac < 0.30; // ~30% chance per beat
}

// Beat-indexed note selection
function _zenNoteForBeat(beatIndex) {
  const idx = Math.floor(Math.abs(Math.sin(beatIndex * 314.159) * 43758.5) % ZEN_NOTES_MIDI.length);
  return _noteFreq(ZEN_NOTES_MIDI[idx]);
}

// Track scheduled beat index (resets when AC context time resets — shouldn't happen)
let _scheduledBeatIdx = 0;

function _scheduleBeats(fromTime, toTime) {
  // Calculate which beats fall in [fromTime, toTime)
  // Beat N starts at: contextStartTime + N * BEAT_SEC
  // contextStartTime = 0 (we just use absolute audioCtx times)
  // beatIdx = floor(fromTime / BEAT_SEC)
  if (!_ac) return;

  let beatIdx = Math.floor(fromTime / BEAT_SEC);
  while (true) {
    const beatTime = beatIdx * BEAT_SEC;
    if (beatTime >= toTime) break;
    if (beatTime >= fromTime) {
      // Zen layer: sparse koto plucks + root drone
      if (_shouldPlayKoto(beatIdx)) {
        _kotoPluck(_zenNoteForBeat(beatIdx), beatTime, 0.16);
        // Occasional 2nd note (chord feel)
        if (_shouldPlayKoto(beatIdx + 100)) {
          const idx2 = Math.floor(Math.abs(Math.sin((beatIdx + 200) * 271.82) * 43758.5) % ZEN_NOTES_MIDI.length);
          _kotoPluck(_noteFreq(ZEN_NOTES_MIDI[idx2]), beatTime + 0.05, 0.10);
        }
      }

      // Combat layer: taiko pulse every 2 beats
      if (beatIdx % 2 === 0) {
        _taikoBeat(beatTime, 0.22);
        // Off-beat lighter hit
        _taikoBeat(beatTime + BEAT_SEC * 0.5, 0.14);
      }

      // Boss layer: deeper drum every 4 beats + minor drone notes
      if (beatIdx % 4 === 0) {
        _bossDrum(beatTime, 0.28);
        // Low minor tone
        const minorNote = MINOR_PENTATONIC[Math.floor(Math.abs(Math.sin(beatIdx * 0.77) * 43758) % MINOR_PENTATONIC.length)];
        _kotoPluck(_noteFreq(36 + minorNote), beatTime, 0.14, _bossGain);
      }
    }
    beatIdx++;
  }
  _scheduledBeatIdx = beatIdx;
}

function _tickScheduler() {
  if (!_ac) return;
  const now = _ac.currentTime;
  const scheduleUpTo = now + LOOKAHEAD;

  if (scheduleUpTo > _scheduledUpTo) {
    _scheduleBeats(_scheduledUpTo, scheduleUpTo);
    _scheduledUpTo = scheduleUpTo;
  }

  // Layer crossfade logic — poll game state
  _updateMusicLayer();
}

function _updateMusicLayer() {
  if (!_ac || !gameCtx.gameState) return;
  const gs = gameCtx.gameState.state;

  let wanted = 'zen';
  if (gs === 'MENU' || gs === 'INTRO' || gs === 'COMPLETE' || gs === 'GAMEOVER') {
    wanted = 'zen';
  } else if (gs === 'WAVE4' || gs === 'WAVE5') {
    wanted = 'boss';
  } else if (gs === 'WAVE1' || gs === 'WAVE2' || gs === 'WAVE3') {
    wanted = 'combat';
  }

  if (wanted !== _musicLayer) {
    _crossfadeTo(wanted);
    _musicLayer = wanted;
  }
}

function _crossfadeTo(layer) {
  if (!_ac) return;
  const now = _ac.currentTime;
  const RAMP = 1.5; // crossfade time in seconds

  const targets = {
    zen:    { zen: 1.0, combat: 0.0, boss: 0.0 },
    combat: { zen: 0.4, combat: 1.0, boss: 0.0 },
    boss:   { zen: 0.2, combat: 0.3, boss: 1.0 },
    none:   { zen: 0.0, combat: 0.0, boss: 0.0 },
  };

  const t = targets[layer] || targets.none;

  [
    [_zenGain,    t.zen],
    [_combatGain, t.combat],
    [_bossGain,   t.boss],
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

function _startScheduler() {
  // Guard: only one interval instance at a time
  if (_schedulerInterval !== null) {
    clearInterval(_schedulerInterval);
    _schedulerInterval = null;
  }

  if (!_ac) return;

  // Initialise the "scheduled up to" cursor just ahead of now
  _scheduledUpTo = _ac.currentTime;

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
