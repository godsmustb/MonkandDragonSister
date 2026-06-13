// src/game/analytics.js — anonymous gameplay analytics client
// Privacy-respecting: random anonymous device ID only (no PII, no fingerprinting).
// Fail-silent on all network errors — the game works identically offline / on a
// python server with no PHP backend. ZERO console errors on 404/network failure.

import { ctx } from '../state.js';
import { API_ENABLED } from '../config.js';

const API_URL          = './api/analytics.php';
const LS_DEVICE_KEY    = 'mds_device_id';
const FLUSH_THRESHOLD  = 8;       // auto-flush when queue reaches this size
const FLUSH_INTERVAL   = 20000;   // periodic flush every 20s (ms)
const FETCH_TIMEOUT    = 5000;    // abort analytics POST after 5s

const _sessionStart = Date.now();
let _queue  = [];
let _flushing = false;

// ── Anonymous device ID ───────────────────────────────────────────────────────
// 16 random bytes → 32-char hex string, stored in localStorage.
// Never contains any personal data or fingerprint data.
export function getDeviceId() {
  try {
    const stored = localStorage.getItem(LS_DEVICE_KEY);
    if (stored && /^[a-f0-9]{32}$/.test(stored)) return stored;
    // Generate new ID
    const buf = new Uint8Array(16);
    crypto.getRandomValues(buf);
    const id = Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('');
    try { localStorage.setItem(LS_DEVICE_KEY, id); } catch (_) {}
    return id;
  } catch (_) {
    // localStorage unavailable (private browsing, etc.) — return a session-only id
    if (!getDeviceId._fallback) {
      const buf = new Uint8Array(16);
      crypto.getRandomValues(buf);
      getDeviceId._fallback = Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('');
    }
    return getDeviceId._fallback;
  }
}

// ── track(type, props) ────────────────────────────────────────────────────────
// Push an event onto the queue and auto-flush if threshold reached.
export function track(type, props = {}) {
  try {
    const ev = { type, t: Date.now(), ...props };
    _queue.push(ev);
    if (_queue.length >= FLUSH_THRESHOLD) {
      flush();
    }
  } catch (_) {
    // Never throw
  }
}

// ── flush() ───────────────────────────────────────────────────────────────────
// POST all queued events. Clears queue on success. Fully silent on any failure.
export async function flush() {
  // On localhost / file:// there is no PHP backend — POSTing there makes the
  // browser log a 501 console error JS can't suppress. Drop the queue locally.
  if (!API_ENABLED) { _queue.length = 0; return; }
  if (_flushing || _queue.length === 0) return;
  _flushing = true;
  const batch = _queue.slice();
  _queue = [];

  try {
    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
    const resp = await fetch(API_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ deviceId: getDeviceId(), events: batch }),
      signal:  ctrl.signal,
    });
    clearTimeout(tid);
    // Silently ignore non-ok responses (404 from python server, etc.)
    if (!resp.ok) {
      // Put events back for next flush attempt (up to a soft cap to avoid unbounded growth)
      if (_queue.length + batch.length < 200) _queue = batch.concat(_queue);
    }
    // If response is ok we discard batch (already cleared above)
  } catch (_) {
    // Network error, abort, no PHP — silently restore batch for next attempt
    try {
      if (_queue.length + batch.length < 200) _queue = batch.concat(_queue);
    } catch (_) {}
  } finally {
    _flushing = false;
  }
}

// ── Session lifecycle ─────────────────────────────────────────────────────────
// session_start — emitted once on module load (first import).
function _emitSessionStart() {
  try {
    const touch = !!(
      (ctx && ctx.gameState) // prefer ctx.mode after boot
        ? false               // will be updated via _patchStartWithMode() below
        : window.matchMedia && window.matchMedia('(pointer: coarse)').matches
    );
    track('session_start', {
      ua:    navigator.userAgent.slice(0, 120),
      w:     screen.width,
      h:     screen.height,
      touch: !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches),
      mode:  (ctx && ctx.mode) || '2p',
    });
  } catch (_) {}
}

// Patch session_start with the real mode once main.js sets ctx.mode (very early).
// Called by main.js after ctx.mode is set. Re-emits the session_start with mode.
export function patchSessionMode(mode) {
  try {
    // Update the queued session_start if it hasn't flushed yet.
    const ev = _queue.find(e => e.type === 'session_start');
    if (ev) ev.mode = mode;
  } catch (_) {}
}

// session_end — emitted on page hide / visibility hidden
function _emitSessionEnd() {
  try {
    const duration = Math.round((Date.now() - _sessionStart) / 1000);
    track('session_end', { duration });
    flush(); // best-effort synchronous-ish flush (sendBeacon not needed for analytics)
  } catch (_) {}
}

// ── Lifecycle event wiring ────────────────────────────────────────────────────
try {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') _emitSessionEnd();
  });
  window.addEventListener('pagehide', _emitSessionEnd);
} catch (_) {}

// ── Periodic flush (every 20s) — uses setInterval (telemetry, not game-state FX) ──
try {
  setInterval(() => { flush(); }, FLUSH_INTERVAL);
} catch (_) {}

// ── Emit session_start immediately ───────────────────────────────────────────
_emitSessionStart();
