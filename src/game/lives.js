// src/game/lives.js — Team lives, KO handling, GAME OVER
import { ctx } from '../state.js';
import { updateHUD, showToast, showPlayerToast } from '../ui/hud.js';
import { clearAllFx } from '../combat/projectiles.js';
import { sfx } from '../audio/audio.js';

// ── Leaderboard helpers (localStorage) ────────────────────────────────────
const LS_KEY = 'mds_highscores';

/** Load the sorted high-score list (up to 10 entries). Returns [] on any error. */
export function loadHighScores() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr;
  } catch (_) { return []; }
}

/** Push a new score entry, keep top 10 sorted desc. Returns updated list. */
export function recordScore(score) {
  const list = loadHighScores();
  const cycle = (ctx.gameState && ctx.gameState.endlessCycle) || 0;
  list.push({ score, cycle, date: new Date().toLocaleDateString() });
  list.sort((a, b) => b.score - a.score);
  const trimmed = list.slice(0, 10);
  try { localStorage.setItem(LS_KEY, JSON.stringify(trimmed)); } catch (_) {}
  return trimmed;
}

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
  showPlayerToast(player.id, `Respawned at the shrine! ${ctx.gameState.lives} lives remain.`);
  updateHUD();
}

// ── GAME OVER ─────────────────────────────────────────────────────────────
export function triggerGameOver() {
  if (ctx.gameState.state === 'GAMEOVER') return;
  ctx.gameState.state = 'GAMEOVER';
  clearAllFx();
  try { sfx.gameOver(); } catch {}
  // Analytics: game_over (fail-silent dynamic import)
  import('./analytics.js').then(m => m.track('game_over', {
    stage:   ctx.gameState.level || 1,
    wave:    ctx.gameState.wave  || 0,
    score:   ctx.gameState.score || 0,
    endless: !!ctx.gameState._endless,
  })).catch(() => {});

  // Stop all spirits from acting
  ctx.gameState.spirits.forEach(s => { s.alive = false; });

  if (ctx.gameState._endless) {
    _showArcadeLeaderboard();
  } else {
    _showGameOverScreen();
  }
}

// ── Arcade Leaderboard (endless-only game-over) ────────────────────────────
function _showArcadeLeaderboard() {
  const score = (ctx.gameState && ctx.gameState.score) || 0;
  const cycle = (ctx.gameState && ctx.gameState.endlessCycle) || 0;

  // Record locally immediately (preserves existing behaviour)
  const table = recordScore(score);

  // Attempt global submit + show enriched overlay; fall back to local overlay on any error.
  import('./leaderboard.js').then(async lb => {
    // Prompt for name if not yet set (silent no-op if already stored)
    await lb.promptPlayerName().catch(() => {});
    // Submit to global board (stage 9 = Endless); returns top entries
    const entries = await lb.submitScore(9, score).catch(() => null);
    if (entries && entries.length > 0) {
      // Show the global leaderboard overlay (it overlays on top of #arcade-leaderboard)
      lb.showStageLeaderboard(9, score, entries, 'ENDLESS MODE — BEST SCORES', () => {
        // After the user closes the leaderboard overlay, the #arcade-leaderboard
        // buttons (PLAY AGAIN / MAIN MENU) are still built below for convenience.
      });
    }
    // Always also build the existing #arcade-leaderboard UI beneath (for PLAY AGAIN btn)
    _buildLocalArcadeUI(score, cycle, table);
  }).catch(() => {
    // leaderboard.js failed to import (should never happen, but be safe)
    _buildLocalArcadeUI(score, cycle, table);
  });
}

function _buildLocalArcadeUI(score, cycle, table) {
  const top5  = table.slice(0, 5);
  const rank1Score = top5.length > 0 ? top5[0].score : score;
  const thisRunIdx = top5.findIndex(e => e.score === score && e.cycle === cycle);

  const overlay = document.getElementById('arcade-leaderboard');
  if (!overlay) {
    _showGameOverScreen();
    return;
  }

  // Build content
  overlay.innerHTML = '';
  overlay.style.display = 'flex';

  const title = document.createElement('div');
  title.className = 'arcade-title';
  title.textContent = 'ENDLESS MODE — BEST SCORES';
  overlay.appendChild(title);

  const catchPhrase = document.createElement('div');
  catchPhrase.className = 'arcade-catchphrase';
  const isFirst = (thisRunIdx === 0) || (score > 0 && score >= rank1Score);
  catchPhrase.textContent = isFirst ? '🏆  CONGRATULATIONS — YOU’RE #1!' : ('CAN YOU BEAT #1?  ' + rank1Score.toLocaleString());
  overlay.appendChild(catchPhrase);

  if (thisRunIdx >= 0) {
    const newHigh = document.createElement('div');
    newHigh.className = 'new-high';
    newHigh.textContent = thisRunIdx === 0 ? '★  NEW HIGH SCORE!  ★' : '★  TOP 5!  ★';
    overlay.appendChild(newHigh);
  }

  // Table
  const table_ = document.createElement('table');
  table_.className = 'arcade-table';
  const thead = document.createElement('thead');
  const hrow  = document.createElement('tr');
  ['#', 'SCORE', 'CYCLE', 'DATE'].forEach(h => {
    const th = document.createElement('th'); th.textContent = h; hrow.appendChild(th);
  });
  thead.appendChild(hrow);
  table_.appendChild(thead);

  const tbody = document.createElement('tbody');
  top5.forEach((entry, i) => {
    const tr = document.createElement('tr');
    if (i === thisRunIdx) tr.className = 'this-run';
    const tdRank  = document.createElement('td'); tdRank.className = 'rank';
    tdRank.textContent = '#' + (i + 1);
    const tdScore = document.createElement('td');
    tdScore.textContent = entry.score.toLocaleString() + (i === thisRunIdx ? ' ◀' : '');
    const tdCycle = document.createElement('td');
    tdCycle.textContent = 'Cyc ' + entry.cycle;
    const tdDate  = document.createElement('td');
    tdDate.style.fontSize = '11px';
    tdDate.style.color = '#777';
    tdDate.textContent = entry.date || '—';
    tr.appendChild(tdRank); tr.appendChild(tdScore);
    tr.appendChild(tdCycle); tr.appendChild(tdDate);
    tbody.appendChild(tr);
  });
  table_.appendChild(tbody);
  overlay.appendChild(table_);

  // Buttons
  const btnRow = document.createElement('div');
  btnRow.className = 'arcade-btns';

  const btnAgain = _makeArcadeBtn('PLAY AGAIN', () => {
    overlay.style.display = 'none';
    // Also close the global leaderboard overlay if it is open
    const lb = document.getElementById('stage-lb-overlay');
    if (lb && lb.parentNode) lb.parentNode.removeChild(lb);
    // Restart endless fresh — reset lives + score then call startEndless
    ctx.gameState.lives = MAX_LIVES;
    ctx.gameState.score = 0;
    initLives(); // re-draw lives HUD
    import('./quest.js').then(m => m.startEndless()).catch(() => { location.reload(); });
  });

  const btnMenu = _makeArcadeBtn('MAIN MENU', () => {
    location.reload();
  });

  btnRow.appendChild(btnAgain);
  btnRow.appendChild(btnMenu);
  overlay.appendChild(btnRow);
}

function _makeArcadeBtn(label, fn) {
  const btn = document.createElement('div');
  btn.textContent = label;
  btn.style.cssText = `
    font-family:Georgia,serif;font-size:clamp(13px,1.6vw,17px);
    letter-spacing:4px;color:#888;cursor:pointer;
    padding:10px 24px;border:1px solid rgba(200,160,0,0.4);
    border-radius:4px;
    transition:color 0.15s,border-color 0.15s,background 0.15s;
    user-select:none;
  `;
  btn.addEventListener('mouseenter', () => {
    btn.style.color = '#ffdd55';
    btn.style.borderColor = 'rgba(200,160,0,0.8)';
    btn.style.background = 'rgba(200,160,0,0.08)';
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.color = '#888';
    btn.style.borderColor = 'rgba(200,160,0,0.4)';
    btn.style.background = 'transparent';
  });
  btn.addEventListener('click', fn);
  return btn;
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
// Genshin-style: canvas-drawn lotus chips in a translucent panel.
let _livesEl = null;

function _ensureLivesEl() {
  if (_livesEl && _livesEl.parentNode) return;
  _livesEl = document.getElementById('lives-hud');
  if (!_livesEl) {
    // Fallback: create if not in DOM
    _livesEl = document.createElement('div');
    _livesEl.id = 'lives-hud';
    _livesEl.style.cssText = `
      position:fixed;top:7px;left:50%;transform:translateX(-50%);
      z-index:30;display:flex;gap:5px;align-items:center;
      pointer-events:none;
    `;
    const gc = document.getElementById('game-container');
    if (gc) gc.appendChild(_livesEl);
  }
}

function _drawLotusIcon(canvas, active) {
  const s = canvas.width;
  const c = canvas.getContext('2d');
  c.clearRect(0,0,s,s);
  // Background pill
  c.fillStyle = active ? 'rgba(200,160,0,0.18)' : 'rgba(40,30,10,0.55)';
  c.beginPath(); c.arc(s/2,s/2,s/2,0,Math.PI*2); c.fill();
  // Border
  c.strokeStyle = active ? '#c8a000' : 'rgba(100,80,20,0.35)';
  c.lineWidth = 1.5;
  c.beginPath(); c.arc(s/2,s/2,s/2-1,0,Math.PI*2); c.stroke();
  // Lotus petals (4-petal)
  const col = active ? '#f0d882' : 'rgba(120,100,40,0.5)';
  c.fillStyle = col;
  if (active) { c.shadowColor = '#e8c86a'; c.shadowBlur = 4; }
  for (let a=0;a<4;a++) {
    c.save(); c.translate(s/2,s/2); c.rotate(a*Math.PI/2);
    c.beginPath(); c.ellipse(0,-s*0.26,s*0.09,s*0.18,0,0,Math.PI*2); c.fill();
    c.restore();
  }
  c.shadowBlur=0;
  // Center dot
  c.fillStyle = active ? '#fff8d0' : 'rgba(120,100,40,0.4)';
  c.beginPath(); c.arc(s/2,s/2,s*0.10,0,Math.PI*2); c.fill();
}

// Cache the canvas elements to avoid rebuilding every frame
let _livesCacheCount = -1;

export function _updateLivesHUD() {
  _ensureLivesEl();
  const lives = (ctx.gameState && ctx.gameState.lives != null) ? ctx.gameState.lives : MAX_LIVES;

  // Build once with MAX_LIVES children, then toggle active/inactive
  if (_livesEl.children.length !== MAX_LIVES) {
    _livesEl.innerHTML = '';
    _livesCacheCount = -1; // force redraw
    for (let i = 0; i < MAX_LIVES; i++) {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'width:22px;height:22px;transition:opacity 0.3s;';
      const cv = document.createElement('canvas');
      cv.width = 22; cv.height = 22;
      cv.style.cssText = 'width:22px;height:22px;display:block;';
      wrap.appendChild(cv);
      _livesEl.appendChild(wrap);
    }
  }

  if (lives !== _livesCacheCount) {
    _livesCacheCount = lives;
    Array.from(_livesEl.children).forEach((wrap, i) => {
      const cv = wrap.querySelector('canvas');
      const active = i < lives;
      if (cv) _drawLotusIcon(cv, active);
      wrap.style.opacity = active ? '1' : '0.3';
    });
  }
}

// Export for debug API
export function getLives() {
  return (ctx.gameState && ctx.gameState.lives != null) ? ctx.gameState.lives : MAX_LIVES;
}
