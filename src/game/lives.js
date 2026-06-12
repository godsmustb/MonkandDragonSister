// src/game/lives.js — Team lives, KO handling, GAME OVER
import { ctx } from '../state.js';
import { updateHUD, showToast } from '../ui/hud.js';
import { clearAllFx } from '../combat/projectiles.js';

// ── Constants ─────────────────────────────────────────────────────────────
export const MAX_LIVES       = 3;
export const KO_REVIVE_WINDOW = 10;   // seconds partner has to revive
export const RESPAWN_HP_PCT  = 0.60;  // fraction of maxHp on shrine respawn
export const RESPAWN_IFRAMES = 2.0;   // seconds of invulnerability on respawn

// ── Initialise lives on gameState ─────────────────────────────────────────
export function initLives() {
  ctx.gameState.lives = MAX_LIVES;
  _updateLivesHUD();
}

// ── Consume one team life ──────────────────────────────────────────────────
export function consumeLife(respawnPlayer) {
  if (ctx.gameState.lives <= 0) return; // already game over
  // Guard: don't consume if state is already GAMEOVER
  if (ctx.gameState.state === 'GAMEOVER') return;

  ctx.gameState.lives -= 1;
  _updateLivesHUD();

  if (ctx.gameState.lives <= 0) {
    triggerGameOver();
    return;
  }

  // Respawn player at shrine (null = both-KO case handled by caller)
  if (respawnPlayer) {
    _respawnAtShrine(respawnPlayer);
  } else {
    // Show generic message
    const livesLeft = ctx.gameState.lives;
    showToast(`Revived at shrine! ${livesLeft} ${livesLeft === 1 ? 'life' : 'lives'} remaining.`);
  }
}

// ── Respawn one player at shrine ──────────────────────────────────────────
function _respawnAtShrine(player) {
  player.isKO    = false;
  player._koTimer = 0;
  player.hp       = Math.round(player.maxHp * RESPAWN_HP_PCT);
  player._iframes = RESPAWN_IFRAMES;
  player.pos.set(0, 0, 5);
  const cm = player.currentMesh && player.currentMesh();
  if (cm) cm.position.copy(player.pos);
  showToast(`P${player.id} respawned at the shrine! ${ctx.gameState.lives} lives remain.`);
  updateHUD();
}

// ── GAME OVER ─────────────────────────────────────────────────────────────
export function triggerGameOver() {
  if (ctx.gameState.state === 'GAMEOVER') return;
  ctx.gameState.state = 'GAMEOVER';
  clearAllFx();

  // Stop all spirits from acting
  ctx.gameState.spirits.forEach(s => { s.alive = false; });

  _showGameOverScreen();
}

function _showGameOverScreen() {
  // Dim overlay
  const overlay = document.createElement('div');
  overlay.id = 'gameover-screen';
  overlay.style.cssText = `
    position:fixed;top:0;left:0;width:100%;height:100%;
    background:rgba(0,0,0,0.88);
    z-index:200;
    display:flex;flex-direction:column;
    align-items:center;justify-content:center;
    font-family:Georgia,serif;
    animation:goFadeIn 0.8s ease-out forwards;
  `;

  // Lives icons (empty)
  const livesRow = document.createElement('div');
  livesRow.style.cssText = 'font-size:28px;margin-bottom:20px;opacity:0.5;letter-spacing:12px;';
  livesRow.textContent = '☽☽☽'; // all gone

  const title = document.createElement('h1');
  title.textContent = 'GAME OVER';
  title.style.cssText = `
    font-size:60px;color:#cc2222;
    text-shadow:0 0 40px rgba(200,0,0,0.9),0 0 80px rgba(200,0,0,0.5);
    margin-bottom:16px;letter-spacing:8px;
  `;

  const sub = document.createElement('p');
  sub.textContent = 'The sanctuary has fallen…';
  sub.style.cssText = 'font-size:18px;color:#aaa;font-style:italic;margin-bottom:40px;';

  const hint = document.createElement('p');
  hint.textContent = 'Press any key or click to return to menu';
  hint.style.cssText = 'font-size:13px;color:#666;';

  overlay.appendChild(livesRow);
  overlay.appendChild(title);
  overlay.appendChild(sub);
  overlay.appendChild(hint);
  document.body.appendChild(overlay);

  // Add fade-in keyframe
  if (!document.getElementById('_goStyle')) {
    const s = document.createElement('style');
    s.id = '_goStyle';
    s.textContent = `@keyframes goFadeIn{from{opacity:0;}to{opacity:1;}}`;
    document.head.appendChild(s);
  }

  // After 4 s or key press → back to menu
  const _goTimeout = setTimeout(_returnToMenu, 4000);
  const _goKey = () => { clearTimeout(_goTimeout); _returnToMenu(); };
  document.addEventListener('keydown', _goKey, { once: true });
  overlay.addEventListener('click', _goKey, { once: true });
}

function _returnToMenu() {
  // Simplest reliable approach: full reload (menu is boot state now)
  location.reload();
}

// ── Lives HUD (lotus icons, top-center) ───────────────────────────────────
let _livesEl = null;

function _ensureLivesEl() {
  if (_livesEl && _livesEl.parentNode) return;
  _livesEl = document.createElement('div');
  _livesEl.id = 'lives-hud';
  _livesEl.style.cssText = `
    position:fixed;top:6px;left:50%;transform:translateX(-50%);
    z-index:30;display:flex;gap:6px;align-items:center;
    pointer-events:none;
  `;
  document.getElementById('game-container').appendChild(_livesEl);
}

export function _updateLivesHUD() {
  _ensureLivesEl();
  const lives = (ctx.gameState && ctx.gameState.lives != null) ? ctx.gameState.lives : MAX_LIVES;
  _livesEl.innerHTML = '';
  for (let i = 0; i < MAX_LIVES; i++) {
    const icon = document.createElement('span');
    icon.style.cssText = `font-size:18px;opacity:${i < lives ? '1' : '0.2'};`;
    icon.textContent = '✿'; // lotus
    _livesEl.appendChild(icon);
  }
}

// Export for debug API
export function getLives() {
  return (ctx.gameState && ctx.gameState.lives != null) ? ctx.gameState.lives : MAX_LIVES;
}
