// src/game/juice.js — game-feel "juice" time-scale manager.
//
// Owns ctx.timeScale (default 1). Two effects scale simulation time while
// REAL-TIME rendering keeps running:
//   • HITSTOP   — a very short impact freeze (~70-90ms) on heavy/boss hits.
//   • SLOW-MO   — a cinematic boss-death ramp to ~0.35× for ~1.3s, eased back.
//
// CRITICAL CORRECTNESS:
//   - updateJuice(realDt) is driven by WALL-CLOCK dt (never the scaled dt), so
//     a freeze always ends and timeScale ALWAYS returns to exactly 1.
//   - animate() multiplies the SIM dt by ctx.timeScale; render is untouched.
//   - Wave/quest advancement uses real setTimeout (see quest.js) — NOT sim dt —
//     so scaling can never deadlock a playthrough.
//   - Hitstop is hard-capped + cooldown'd so rapid hits can't stack into a long
//     pause; slow-mo only fires on boss death.
import { ctx } from '../state.js';

// ── Tunables ──────────────────────────────────────────────────────────────
const HITSTOP_MAX      = 0.09;  // hard cap on any single hitstop (s)
const HITSTOP_COOLDOWN = 0.06;  // min real time between hitstops (s)
const HITSTOP_SCALE    = 0.0;   // sim time-scale while frozen (≈ paused)

const SLOWMO_SCALE     = 0.35;  // target time-scale at the depth of boss slow-mo
const SLOWMO_HOLD      = 0.55;  // seconds held at full slow-mo
const SLOWMO_EASE_OUT  = 0.85;  // seconds easing back from SLOWMO_SCALE → 1

// ── State (module-local; ctx.timeScale is the public read) ──────────────────
const _state = {
  hitstop: 0,       // remaining hitstop time (real seconds)
  hitstopCd: 0,     // cooldown gate before another hitstop is allowed
  slowmo: 0,        // remaining slow-mo time (real seconds), 0 = inactive
};

/**
 * Request an impact freeze. Duration is clamped to HITSTOP_MAX and ignored if
 * the cooldown gate is still closed (prevents rapid heavy hits from stacking
 * into a long, E2E-breaking pause). Safe to spam.
 */
export function triggerHitstop(duration = 0.07) {
  if (_state.hitstopCd > 0) return;
  const d = Math.min(Math.max(0, duration), HITSTOP_MAX);
  if (d <= 0) return;
  // Take the longer of any in-flight freeze and this request, still capped.
  _state.hitstop = Math.min(HITSTOP_MAX, Math.max(_state.hitstop, d));
  _state.hitstopCd = HITSTOP_COOLDOWN;
}

/**
 * Begin the cinematic boss-death slow-mo ramp. Idempotent-ish: a fresh call
 * restarts the ramp (multiple bosses dying near-simultaneously just re-arm it).
 */
export function triggerBossSlowmo() {
  _state.slowmo = SLOWMO_HOLD + SLOWMO_EASE_OUT;
}

/**
 * Advance the juice manager by REAL (wall-clock) dt and recompute ctx.timeScale.
 * Returns the new timeScale. Hitstop wins over slow-mo (a heavy hit landing
 * during a boss death still reads as a freeze, then resumes the slow-mo).
 */
export function updateJuice(realDt) {
  // Cooldown always ticks on real time.
  if (_state.hitstopCd > 0) _state.hitstopCd = Math.max(0, _state.hitstopCd - realDt);

  // Hitstop has priority: while active the sim is (near-)frozen.
  if (_state.hitstop > 0) {
    _state.hitstop = Math.max(0, _state.hitstop - realDt);
    ctx.timeScale = HITSTOP_SCALE;
    return ctx.timeScale;
  }

  // Slow-mo ramp.
  if (_state.slowmo > 0) {
    _state.slowmo = Math.max(0, _state.slowmo - realDt);
    if (_state.slowmo > SLOWMO_EASE_OUT) {
      // Hold phase — full slow-mo.
      ctx.timeScale = SLOWMO_SCALE;
    } else {
      // Ease back SLOWMO_SCALE → 1 over the final SLOWMO_EASE_OUT seconds.
      const k = SLOWMO_EASE_OUT > 0 ? (1 - _state.slowmo / SLOWMO_EASE_OUT) : 1;
      ctx.timeScale = SLOWMO_SCALE + (1 - SLOWMO_SCALE) * Math.min(1, Math.max(0, k));
    }
    if (_state.slowmo <= 0) ctx.timeScale = 1;
    return ctx.timeScale;
  }

  // Nothing active — guarantee an exact restore (no drift).
  ctx.timeScale = 1;
  return ctx.timeScale;
}

/** True while the simulation is hard-frozen by a hitstop. */
export function isHitstopActive() { return _state.hitstop > 0; }

/** Reset all juice state (used on wave transitions / hard restarts). */
export function resetJuice() {
  _state.hitstop = 0;
  _state.hitstopCd = 0;
  _state.slowmo = 0;
  ctx.timeScale = 1;
}
