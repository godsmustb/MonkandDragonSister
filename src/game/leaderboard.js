// src/game/leaderboard.js — cross-device leaderboard client
// POST/GET ./api/leaderboard.php (PHP flat-file API on host).
// Falls back silently to localStorage when API is absent (python server, offline, file://).
// All network calls are try/catch + short timeout — ZERO console errors on failure.

import { recordScore as localRecord, loadHighScores as localLoad } from './lives.js';
import { API_ENABLED } from '../config.js';

const API_URL = './api/leaderboard.php';
const LS_NAME_KEY = 'mds_player_name';
const FETCH_TIMEOUT_MS = 4000;

// ── Did the last API call succeed? ─────────────────────────────────────────
let _apiReachable = false;

export function isOnlineLeaderboard() { return _apiReachable; }

// ── Player name persistence ────────────────────────────────────────────────
export function getPlayerName() {
  try { return localStorage.getItem(LS_NAME_KEY) || ''; } catch { return ''; }
}

export function setPlayerName(n) {
  const clean = String(n).trim().slice(0, 16);
  try { localStorage.setItem(LS_NAME_KEY, clean); } catch {}
  return clean;
}

// ── Fetch with timeout (returns null on any failure) ───────────────────────
async function _fetchWithTimeout(url, opts) {
  // Skip the network on localhost / file:// (no PHP) so we never trigger a 501
  // console error; callers fall back to localStorage. Live domain → enabled.
  if (!API_ENABLED) return null;
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(url, { ...opts, signal: ctrl.signal });
    clearTimeout(tid);
    if (!r.ok) return null;
    return await r.json();
  } catch {
    clearTimeout(tid);
    return null;
  }
}

// ── localStorage stage mirror ───────────────────────────────────────────────
// Each stage gets its own LS key so local-only players have a personal board.
const LS_STAGE_KEY = (s) => `mds_scores_stage${s}`;

function _localStageLoad(stage) {
  try {
    const raw = localStorage.getItem(LS_STAGE_KEY(stage));
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

function _localStageRecord(stage, name, score) {
  const list = _localStageLoad(stage);
  list.push({ name, score, date: new Date().toLocaleDateString() });
  list.sort((a, b) => b.score - a.score);
  const trimmed = list.slice(0, 15);
  try { localStorage.setItem(LS_STAGE_KEY(stage), JSON.stringify(trimmed)); } catch {}
  return trimmed;
}

// ── submitScore ─────────────────────────────────────────────────────────────
/**
 * Submit a score for the given stage. Always mirrors into localStorage.
 * Attempts to POST to the PHP API; on any failure silently falls back to local.
 * Returns a Promise<Array> of the stage's top entries (global if online, local otherwise).
 *
 * Stage mapping:
 *   1 = Quest/Level 1 complete
 *   2 = Quest/Level 2 complete
 *   3 = Quest/Level 3 complete
 *   9 = Endless mode
 *
 * @param {number} stage  1..3 or 9
 * @param {number} score  non-negative integer
 * @returns {Promise<Array>}
 */
export async function submitScore(stage, score) {
  const name = getPlayerName() || 'Anonymous';

  // Always mirror locally (includes endless via localRecord for stage 9)
  _localStageRecord(stage, name, score);
  // Also mirror to the generic endless LS key used by lives.js for stage 9
  if (stage === 9) {
    localRecord(score);
  }

  // Attempt API
  const result = await _fetchWithTimeout(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stage, name, score }),
  });

  if (result !== null && Array.isArray(result)) {
    _apiReachable = true;
    return result;
  }

  // Fallback to local
  _apiReachable = false;
  return _localStageLoad(stage);
}

// ── fetchLeaderboard ────────────────────────────────────────────────────────
/**
 * Fetch top entries for a stage from the PHP API.
 * Falls back to localStorage on any failure.
 *
 * @param {number} stage  1..3 or 9
 * @returns {Promise<Array>}
 */
export async function fetchLeaderboard(stage) {
  const result = await _fetchWithTimeout(`${API_URL}?stage=${stage}`, {
    method: 'GET',
  });

  if (result !== null && Array.isArray(result)) {
    _apiReachable = true;
    return result;
  }

  _apiReachable = false;
  return _localStageLoad(stage);
}

// ── Name-entry modal ────────────────────────────────────────────────────────
/**
 * If the player has no stored name, show a modal to enter one.
 * Resolves with the (possibly newly set) name once the user confirms or closes.
 * Pre-fills with whatever is stored so returning players can edit.
 *
 * Returns a Promise<string> that always resolves (never rejects).
 */
export function promptPlayerName() {
  return new Promise((resolve) => {
    const existing = getPlayerName();
    // Always show if empty; if already set, resolve immediately
    if (existing) { resolve(existing); return; }

    const overlay = document.createElement('div');
    overlay.id = 'name-entry-modal';
    overlay.style.cssText = `
      position:fixed;top:0;left:0;width:100%;height:100%;
      background:rgba(0,0,0,0.88);z-index:300;
      display:flex;flex-direction:column;
      align-items:center;justify-content:center;
      font-family:Georgia,serif;
    `;

    const box = document.createElement('div');
    box.style.cssText = `
      background:var(--panel-bg-solid);
      border:1px solid var(--border-strong);
      border-radius:var(--radius);padding:36px 40px;
      display:flex;flex-direction:column;align-items:center;gap:18px;
      min-width:min(340px,88vw);
    `;

    const h = document.createElement('h2');
    h.className = 'mds-heading';
    h.textContent = 'ENTER YOUR NAME';
    h.style.cssText = 'font-size:22px;letter-spacing:5px;margin:0;';

    const sub = document.createElement('p');
    sub.textContent = 'Your name will appear on the global leaderboard.';
    sub.style.cssText = 'color:var(--text-muted);font-size:11px;letter-spacing:1px;margin:0;text-align:center;';

    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 16;
    input.placeholder = 'Your name (max 16 chars)';
    input.value = existing;
    input.style.cssText = `
      background:rgba(10,8,6,0.8);
      border:1px solid var(--border-strong);
      border-radius:var(--radius-sm);
      color:var(--gold-soft);
      font-family:var(--font-display);
      font-size:16px;
      letter-spacing:2px;
      padding:10px 16px;
      text-align:center;
      outline:none;
      width:100%;
    `;

    const okBtn = document.createElement('div');
    okBtn.className = 'mds-btn';
    okBtn.textContent = 'OK';
    okBtn.style.cssText = 'font-size:15px;letter-spacing:5px;padding:10px 40px;';

    function _confirm() {
      const name = setPlayerName(input.value || 'Anonymous');
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      resolve(name);
    }

    okBtn.addEventListener('click', _confirm);
    input.addEventListener('keydown', (e) => {
      if (e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); _confirm(); }
      if (e.code === 'Escape') { e.preventDefault(); _confirm(); }
    });

    box.appendChild(h);
    box.appendChild(sub);
    box.appendChild(input);
    box.appendChild(okBtn);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    // Focus input after paint
    requestAnimationFrame(() => { input.focus(); input.select(); });
  });
}

// ── HIGH SCORES overlay ──────────────────────────────────────────────────────
/**
 * Show the full multi-stage leaderboard overlay.
 * Called from the main menu "HIGH SCORES" item.
 * onClose is called when the user dismisses (optional).
 */
export function showLeaderboardOverlay(onClose) {
  // Remove any existing instance
  const existing = document.getElementById('hs-overlay');
  if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

  const overlay = document.createElement('div');
  overlay.id = 'hs-overlay';
  overlay.className = 'mds-scrim';
  overlay.style.cssText = `
    background:var(--scrim);z-index:250;
    justify-content:flex-start;
    overflow-y:auto;
    padding:30px 16px 36px;
  `;

  const h = document.createElement('h2');
  h.className = 'mds-heading';
  h.textContent = 'HIGH SCORES';
  h.style.cssText = 'font-size:clamp(18px,2.5vw,26px);margin-bottom:4px;flex-shrink:0;';

  const statusEl = document.createElement('div');
  statusEl.id = 'hs-status';
  statusEl.style.cssText = 'font-size:11px;color:#666;letter-spacing:2px;margin-bottom:24px;text-align:center;flex-shrink:0;';
  statusEl.textContent = 'Loading…';

  const stages = [
    { id: 1, label: 'Stage 1', sub: 'Quest I — The Initial Compassion' },
    { id: 2, label: 'Stage 2', sub: 'Quest II — The Glacial Peaks' },
    { id: 3, label: 'Stage 3', sub: 'Quest III — The Venom Abyss' },
    { id: 9, label: 'Endless', sub: 'Survival Gauntlet' },
  ];

  const tabBar = document.createElement('div');
  tabBar.style.cssText = 'display:flex;gap:8px;margin-bottom:20px;flex-wrap:wrap;justify-content:center;flex-shrink:0;';

  const contentArea = document.createElement('div');
  contentArea.style.cssText = 'width:100%;max-width:480px;flex:1;';

  let activeStage = 1;

  function _makeTab(s) {
    const tab = document.createElement('div');
    tab.textContent = s.label;
    tab.dataset.stage = s.id;
    tab.style.cssText = `
      font-size:clamp(11px,1.4vw,14px);letter-spacing:3px;cursor:pointer;
      padding:7px 18px;border:1px solid var(--border);
      border-radius:var(--radius-sm);color:var(--text-muted);
      transition:color 0.15s,border-color 0.15s,background 0.15s;
      user-select:none;
    `;
    tab.addEventListener('click', () => _showStage(s.id));
    tab.addEventListener('mouseenter', () => {
      if (parseInt(tab.dataset.stage) !== activeStage) {
        tab.style.color = 'var(--gold-bright)';
        tab.style.borderColor = 'var(--border-strong)';
      }
    });
    tab.addEventListener('mouseleave', () => {
      if (parseInt(tab.dataset.stage) !== activeStage) {
        tab.style.color = 'var(--text-muted)';
        tab.style.borderColor = 'var(--border)';
        tab.style.background = 'transparent';
      }
    });
    return tab;
  }

  const tabs = {};
  stages.forEach(s => {
    const tab = _makeTab(s);
    tabBar.appendChild(tab);
    tabs[s.id] = tab;
  });

  function _setActiveTab(stageId) {
    Object.values(tabs).forEach(t => {
      const isActive = parseInt(t.dataset.stage) === stageId;
      t.style.color = isActive ? 'var(--gold-bright)' : 'var(--text-muted)';
      t.style.borderColor = isActive ? 'var(--border-strong)' : 'var(--border)';
      t.style.background = isActive ? 'rgba(var(--gold-rgb),0.10)' : 'transparent';
    });
  }

  function _buildTable(entries, highlightName, stageId) {
    const stageInfo = stages.find(s => s.id === stageId);
    contentArea.innerHTML = '';

    const subEl = document.createElement('div');
    subEl.textContent = stageInfo ? stageInfo.sub : '';
    subEl.style.cssText = 'color:var(--text-muted);font-size:11px;font-style:italic;letter-spacing:1px;margin-bottom:14px;text-align:center;';
    contentArea.appendChild(subEl);

    if (!entries || entries.length === 0) {
      const empty = document.createElement('div');
      empty.textContent = 'No scores yet. Be the first!';
      empty.style.cssText = 'color:var(--text-faint);font-size:13px;text-align:center;padding:30px 0;letter-spacing:1px;';
      contentArea.appendChild(empty);
      return;
    }

    const table = document.createElement('table');
    table.style.cssText = 'border-collapse:collapse;width:100%;min-width:min(400px,85vw);';

    const thead = document.createElement('thead');
    const hrow = document.createElement('tr');
    ['#', 'NAME', 'SCORE', 'DATE'].forEach(h => {
      const th = document.createElement('th');
      th.textContent = h;
      th.style.cssText = 'font-size:9px;letter-spacing:3px;color:#666;padding:4px 16px;text-align:center;border-bottom:1px solid rgba(var(--gold-rgb),0.2);';
      hrow.appendChild(th);
    });
    thead.appendChild(hrow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    entries.slice(0, 15).forEach((entry, i) => {
      const tr = document.createElement('tr');
      const isMe = highlightName && entry.name === highlightName;
      if (isMe) {
        tr.style.cssText = 'color:var(--gold-soft);text-shadow:0 0 8px rgba(var(--gold-rgb),0.6);';
      }

      const tdRank = document.createElement('td');
      tdRank.textContent = '#' + (i + 1);
      tdRank.style.cssText = 'color:#666;font-size:12px;padding:6px 16px;text-align:center;border-bottom:1px solid rgba(var(--gold-rgb),0.08);';

      const tdName = document.createElement('td');
      tdName.textContent = entry.name || '—';
      tdName.style.cssText = `color:${isMe ? 'var(--gold-soft)' : '#ccc'};font-size:14px;padding:6px 16px;text-align:center;border-bottom:1px solid rgba(var(--gold-rgb),0.08);`;

      const tdScore = document.createElement('td');
      tdScore.textContent = (entry.score || 0).toLocaleString() + (isMe ? ' ◀' : '');
      tdScore.style.cssText = `color:${isMe ? 'var(--gold-soft)' : 'var(--text-dim)'};font-size:14px;padding:6px 16px;text-align:center;border-bottom:1px solid rgba(var(--gold-rgb),0.08);`;

      const tdDate = document.createElement('td');
      tdDate.textContent = entry.date || '—';
      tdDate.style.cssText = 'color:var(--text-faint);font-size:10px;padding:6px 16px;text-align:center;border-bottom:1px solid rgba(var(--gold-rgb),0.08);';

      tr.appendChild(tdRank);
      tr.appendChild(tdName);
      tr.appendChild(tdScore);
      tr.appendChild(tdDate);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    contentArea.appendChild(table);
  }

  async function _showStage(stageId) {
    activeStage = stageId;
    _setActiveTab(stageId);
    contentArea.innerHTML = '<div style="color:var(--text-faint);font-size:13px;text-align:center;padding:30px 0;letter-spacing:1px;">Loading…</div>';

    const entries = await fetchLeaderboard(stageId);
    statusEl.textContent = _apiReachable ? '🌐 global' : '📋 local only';
    _buildTable(entries, getPlayerName(), stageId);
  }

  // Back button
  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:16px;margin-top:24px;flex-shrink:0;';

  const backBtn = document.createElement('div');
  backBtn.className = 'mds-btn';
  backBtn.textContent = 'BACK';
  backBtn.style.cssText = 'font-size:clamp(14px,1.8vw,18px);';

  function _close() {
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    document.removeEventListener('keydown', _keyHandler);
    if (typeof onClose === 'function') onClose();
  }

  backBtn.addEventListener('click', _close);
  btnRow.appendChild(backBtn);

  const _keyHandler = (e) => {
    if (e.code === 'Escape' || e.code === 'Backspace') {
      e.stopPropagation();
      _close();
    }
  };
  document.addEventListener('keydown', _keyHandler);

  overlay.appendChild(h);
  overlay.appendChild(statusEl);
  overlay.appendChild(tabBar);
  overlay.appendChild(contentArea);
  overlay.appendChild(btnRow);
  document.body.appendChild(overlay);

  // Load stage 1 initially
  _showStage(1);
}

// ── showStageLeaderboard — post-completion leaderboard ──────────────────────
/**
 * Show that stage's leaderboard after a score was submitted.
 * Renders inside a full-screen overlay with the CAN YOU BEAT #1? hook,
 * highlighting the player's own entry.
 *
 * @param {number}  stage    1..3 or 9
 * @param {number}  score    the just-submitted score
 * @param {Array}   entries  array returned from submitScore()
 * @param {string}  title    overlay heading
 * @param {Function} onClose optional callback
 */
export function showStageLeaderboard(stage, score, entries, title, onClose, onNext) {
  const existing = document.getElementById('stage-lb-overlay');
  if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

  const overlay = document.createElement('div');
  overlay.id = 'stage-lb-overlay';
  overlay.className = 'mds-scrim';
  overlay.style.cssText = `
    background:var(--scrim);z-index:260;
    animation:goFadeIn 0.6s ease-out forwards;
    overflow-y:auto;
    padding:30px 16px;
  `;

  const playerName = getPlayerName() || 'Anonymous';
  const top = entries && entries.length > 0 ? entries[0] : null;
  const rank1Score = top ? (top.score || 0) : score;
  const myRank = entries ? entries.findIndex(e => e.name === playerName && e.score === score) : -1;

  // Title
  const titleEl = document.createElement('div');
  titleEl.style.cssText = 'font-size:clamp(14px,2vw,20px);color:var(--gold-soft);letter-spacing:5px;text-shadow:var(--glow-gold);margin-bottom:4px;text-align:center;';
  titleEl.textContent = title || 'LEADERBOARD';

  // Online/offline badge
  const badge = document.createElement('div');
  badge.style.cssText = 'font-size:11px;color:#666;letter-spacing:2px;margin-bottom:18px;';
  badge.textContent = _apiReachable ? '🌐 global' : '📋 local only';

  // "Congratulations" if the player holds #1, else the "can you beat #1?" hook.
  const isFirst = (myRank === 0) || (score > 0 && score >= rank1Score);
  const catchEl = document.createElement('div');
  catchEl.style.cssText = 'font-size:clamp(18px,3vw,30px);color:' + (isFirst ? '#ffd24b' : 'var(--el-fire)') + ';letter-spacing:4px;text-shadow:0 0 30px rgba(255,160,0,0.8);margin-bottom:20px;font-style:italic;text-align:center;';
  catchEl.textContent = isFirst ? '🏆  CONGRATULATIONS — YOU’RE #1!' : ('CAN YOU BEAT #1?  ' + rank1Score.toLocaleString());

  // New high / top 15 indicator
  if (myRank >= 0) {
    const newHigh = document.createElement('div');
    newHigh.style.cssText = 'font-size:clamp(13px,1.8vw,18px);color:var(--el-fire);letter-spacing:4px;text-shadow:0 0 16px rgba(255,100,0,0.7);margin-bottom:20px;animation:ultPulse 0.8s ease-in-out infinite;text-align:center;';
    newHigh.textContent = myRank === 0 ? '★  NEW HIGH SCORE!  ★' : `★  RANK #${myRank + 1}!  ★`;
    overlay.appendChild(titleEl);
    overlay.appendChild(badge);
    overlay.appendChild(catchEl);
    overlay.appendChild(newHigh);
  } else {
    overlay.appendChild(titleEl);
    overlay.appendChild(badge);
    overlay.appendChild(catchEl);
  }

  // Table
  if (entries && entries.length > 0) {
    const table = document.createElement('table');
    table.style.cssText = 'border-collapse:collapse;margin-bottom:28px;min-width:min(420px,85vw);';
    const thead = document.createElement('thead');
    const hrow = document.createElement('tr');
    ['#', 'NAME', 'SCORE', 'DATE'].forEach(h => {
      const th = document.createElement('th');
      th.textContent = h;
      th.style.cssText = 'font-family:var(--font-ui);font-size:9px;letter-spacing:3px;color:var(--text-muted);padding:4px 16px;text-align:center;border-bottom:1px solid var(--border);';
      hrow.appendChild(th);
    });
    thead.appendChild(hrow);
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    entries.slice(0, 15).forEach((entry, i) => {
      const tr = document.createElement('tr');
      const isMe = entry.name === playerName && entry.score === score && i === myRank;
      if (isMe) tr.className = 'this-run';

      const tdRank  = document.createElement('td');
      tdRank.textContent = '#' + (i + 1);
      tdRank.style.cssText = 'color:var(--text-muted);font-size:12px;padding:6px 16px;text-align:center;border-bottom:1px solid rgba(var(--gold-rgb),0.1);';

      const tdName = document.createElement('td');
      tdName.textContent = entry.name || '—';
      tdName.style.cssText = `color:${isMe ? 'var(--gold-soft)' : '#ccc'};font-size:14px;padding:6px 16px;text-align:center;border-bottom:1px solid rgba(var(--gold-rgb),0.1);${isMe ? 'text-shadow:0 0 10px rgba(var(--gold-rgb),0.7);' : ''}`;

      const tdScore = document.createElement('td');
      tdScore.textContent = (entry.score || 0).toLocaleString() + (isMe ? ' ◀' : '');
      tdScore.style.cssText = `color:${isMe ? 'var(--gold-soft)' : '#ccc'};font-size:15px;padding:6px 16px;text-align:center;border-bottom:1px solid rgba(var(--gold-rgb),0.1);${isMe ? 'text-shadow:0 0 10px rgba(var(--gold-rgb),0.7);' : ''}`;

      const tdDate = document.createElement('td');
      tdDate.style.cssText = 'font-size:11px;color:var(--text-faint);padding:6px 16px;text-align:center;border-bottom:1px solid rgba(var(--gold-rgb),0.1);';
      tdDate.textContent = entry.date || '—';

      tr.appendChild(tdRank);
      tr.appendChild(tdName);
      tr.appendChild(tdScore);
      tr.appendChild(tdDate);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    overlay.appendChild(table);
  }

  // Buttons
  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:18px;flex-wrap:wrap;justify-content:center;';

  function _close() {
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    document.removeEventListener('keydown', _keyHandler);
    if (typeof onClose === 'function') onClose();
  }

  function _makeBtn(label, fn, primary) {
    const btn = document.createElement('div');
    btn.className = 'mds-btn';
    btn.textContent = label;
    btn.style.cssText = 'font-size:clamp(13px,1.6vw,17px);'
      + (primary ? 'color:#ffdd55;border-color:rgba(200,160,0,0.7);background:rgba(200,160,0,0.12);' : '');
    btn.addEventListener('click', fn);
    return btn;
  }

  // If a next level exists, offer it as the PRIMARY action right on this overlay —
  // the leaderboard sits on top of the complete screen (higher z-index), so without
  // this the complete screen's own NEXT LEVEL button is unreachable.
  if (typeof onNext === 'function') {
    btnRow.appendChild(_makeBtn('NEXT LEVEL ▶', () => { _close(); onNext(); }, true));
  }
  btnRow.appendChild(_makeBtn('CLOSE', _close));
  overlay.appendChild(btnRow);
  document.body.appendChild(overlay);

  const _keyHandler = (e) => {
    if (e.code === 'Escape' || e.code === 'Backspace') {
      e.stopPropagation(); _close();
    }
  };
  document.addEventListener('keydown', _keyHandler);
}
