#!/usr/bin/env node
// test/analytics-summary.mjs
// Fetch and pretty-print the analytics summary from the PHP endpoint.
//
// Usage:
//   node test/analytics-summary.mjs
//   node test/analytics-summary.mjs http://yourdomain.com
//
// Defaults to http://localhost:8321 (the dev python server, which will
// return 404 — a clear signal PHP is needed on the live host).

import { createRequire } from 'module';

const BASE = process.argv[2] || 'http://localhost:8321';
const KEY  = 'mds_a7f3_report_k9';
const URL  = `${BASE}/api/analytics.php?summary=1&key=${KEY}`;

console.log(`\nFetching analytics summary from:\n  ${URL}\n`);

let data;
try {
  const resp = await fetch(URL, { signal: AbortSignal.timeout(8000) });
  if (!resp.ok) {
    console.error(`HTTP ${resp.status} — is the PHP server running at ${BASE}?`);
    process.exit(1);
  }
  data = await resp.json();
} catch (err) {
  if (err.name === 'TimeoutError' || err.name === 'AbortError') {
    console.error(`Timeout — server at ${BASE} did not respond within 8s.`);
  } else {
    console.error(`Network error: ${err.message}`);
    console.error(`  Is a PHP-capable server running at ${BASE}?`);
    console.error(`  (python -m http.server serves static files only, not PHP)`);
  }
  process.exit(1);
}

if (data.error) {
  console.error(`Error from server: ${data.error}`);
  process.exit(1);
}

// ── Pretty print ─────────────────────────────────────────────────────────────
const line = (label, value) => console.log(`  ${label.padEnd(30)} ${value}`);
const sep  = () => console.log('  ' + '─'.repeat(50));

console.log('╔══════════════════════════════════════════════════════╗');
console.log('║         MONK & DRAGON SISTER — ANALYTICS REPORT     ║');
console.log('╚══════════════════════════════════════════════════════╝\n');

console.log('OVERVIEW');
sep();
line('Total sessions',      data.total_sessions ?? '—');
line('Unique devices',      data.unique_devices  ?? '—');
line('Avg session length',  `${data.avg_session_duration_s ?? 0}s`);
line('Touch devices',       data.device_breakdown?.touch   ?? 0);
line('Desktop devices',     data.device_breakdown?.desktop ?? 0);

console.log('\nPROGRESSION FUNNEL  (sessions reaching stage:wave)');
sep();
const funnel = data.funnel || {};
if (Object.keys(funnel).length === 0) {
  console.log('  (no data yet)');
} else {
  for (const [key, count] of Object.entries(funnel)) {
    const [stage, wave] = key.split(':');
    line(`  Stage ${stage} · Wave ${wave}`, `${count} sessions`);
  }
}

console.log('\nDEATHS BY STAGE:WAVE');
sep();
const deaths = data.deaths || {};
if (Object.keys(deaths).length === 0) {
  console.log('  (no data yet)');
} else {
  for (const [key, count] of Object.entries(deaths)) {
    const [stage, wave] = key.split(':');
    line(`  Stage ${stage} · Wave ${wave}`, `${count} deaths`);
  }
}

console.log('\nLEVEL COMPLETIONS BY STAGE');
sep();
const comps = data.level_completions || {};
if (Object.keys(comps).length === 0) {
  console.log('  (no data yet)');
} else {
  for (const [stage, count] of Object.entries(comps)) {
    line(`  Stage ${stage}`, `${count} completions`);
  }
}

console.log('\nGAME OVERS BY STAGE:WAVE');
sep();
const govers = data.game_overs || {};
if (Object.keys(govers).length === 0) {
  console.log('  (no data yet)');
} else {
  for (const [key, count] of Object.entries(govers)) {
    const [stage, wave] = key.split(':');
    line(`  Stage ${stage} · Wave ${wave}`, `${count} game overs`);
  }
}

console.log('\n');
