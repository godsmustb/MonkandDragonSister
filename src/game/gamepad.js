// src/game/gamepad.js — wired/wireless gamepad support (Gamepad API).
// Reuses the existing input model: movement + held actions (block) synthesize
// ctx.keys[boundCode] so isDown() works unchanged; press actions fire through the
// injected dispatch (same path as keyboard). Keyboard still works alongside.
//
// Standard mapping (Xbox/PlayStation 'standard' layout):
//   Left stick / D-pad → move      A → attack    B → dodge     X → block(held)
//   Y → heavy   LB → shield/transform   RB → jump   RT → ultimate
//   LT → heal/special   Back → lock-on   Start → pause
import { ctx } from '../state.js';

let _dispatch = null;             // (playerId, action) — injected by main.js (avoid cycle)
let _togglePause = null;
export function setGamepadHooks(dispatch, togglePause) { _dispatch = dispatch; _togglePause = togglePause; }

// Per-player press-action mapping (button index → action name).
const PRESS = {
  1: { 0: 'attack', 1: 'dodge', 3: 'heavy', 4: 'shield',    5: 'jump', 7: 'ultimate', 6: 'heal',    8: 'lockon' },
  2: { 0: 'attack', 1: 'dodge', 3: 'heavy', 4: 'transform', 5: 'jump', 7: 'ultimate', 6: 'special', 8: 'lockon' },
};
const DEADZONE = 0.4;
const _prev = {};   // gamepad index → previous pressed-button booleans

// Set/clear a player's bound key for an action so isDown()/movement see it.
function _setActionKey(who, action, on) {
  const codes = ctx.bindings && ctx.bindings[who] && ctx.bindings[who][action];
  if (!codes || !codes.length) return;
  ctx.keys[codes[0]] = !!on;
}

// Which player does a given gamepad drive? Pad 0 → P1, pad 1 → P2; in 1P solo,
// pad 0 drives whichever hero the player chose.
function _playerForPad(padIndex) {
  if (ctx.mode === '1p') return ctx.soloChar === 'sister' ? 2 : 1;
  return padIndex === 0 ? 1 : 2;
}

export function pollGamepads() {
  if (!ctx.gamepadEnabled) return;
  let pads;
  try { pads = navigator.getGamepads ? navigator.getGamepads() : []; } catch { return; }
  if (!pads) return;
  for (let i = 0; i < pads.length; i++) {
    const gp = pads[i];
    if (!gp || !gp.connected) continue;
    const playerId = _playerForPad(i);
    const who = 'p' + playerId;

    // Start (button 9) → pause toggle — handled in ALL states (incl. to unpause).
    {
      const prev0 = _prev[i] || (_prev[i] = {});
      const nowStart = !!(gp.buttons[9] && gp.buttons[9].pressed);
      if (nowStart && !prev0._start) { try { _togglePause && _togglePause(); } catch (_) {} }
      prev0._start = nowStart;
    }

    // Movement + actions only during live gameplay (not menus / paused / intro).
    const st = ctx.gameState && ctx.gameState.state;
    const live = !ctx.gameState._paused && typeof st === 'string' && st.indexOf('WAVE') === 0 && !ctx.onboardingActive;
    if (!live) continue;

    // ── Movement: left stick + d-pad → bound up/down/left/right keys ──
    const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
    const dpadUp = gp.buttons[12] && gp.buttons[12].pressed;
    const dpadDn = gp.buttons[13] && gp.buttons[13].pressed;
    const dpadL  = gp.buttons[14] && gp.buttons[14].pressed;
    const dpadR  = gp.buttons[15] && gp.buttons[15].pressed;
    _setActionKey(who, 'up',    ay < -DEADZONE || dpadUp);
    _setActionKey(who, 'down',  ay >  DEADZONE || dpadDn);
    _setActionKey(who, 'left',  ax < -DEADZONE || dpadL);
    _setActionKey(who, 'right', ax >  DEADZONE || dpadR);

    // ── Held: block (X, button 2) ──
    _setActionKey(who, 'block', gp.buttons[2] && gp.buttons[2].pressed);

    // ── Press edges: actions + pause ──
    const prev = _prev[i] || (_prev[i] = {});
    const edge = (b) => { const now = !!(gp.buttons[b] && gp.buttons[b].pressed); const was = !!prev[b]; prev[b] = now; return now && !was; };
    const map = PRESS[playerId] || PRESS[1];
    for (const b in map) { if (edge(+b)) { try { _dispatch && _dispatch(playerId, map[b]); } catch (_) {} } }
  }
}

// Are any gamepads currently connected?
export function gamepadsConnected() {
  try { const p = navigator.getGamepads ? navigator.getGamepads() : []; return [...p].filter(g => g && g.connected).length; }
  catch { return 0; }
}
