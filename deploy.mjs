// deploy.mjs — one-command FTP deploy of the game to a static/PHP host (Hostinger).
// Usage:  node deploy.mjs            (uploads index.html + src/ + api/ + vendor/)
//         node deploy.mjs --only=src,index.html   (partial)
// Requires deploy.config.json (gitignored — copy deploy.config.example.json).
import { Client } from 'basic-ftp';
import fs from 'node:fs';

const CFG = 'deploy.config.json';
if (!fs.existsSync(CFG)) {
  console.error(`\n  Missing ${CFG}.\n  Copy deploy.config.example.json -> ${CFG} and fill in your Hostinger FTP details\n  (Hostinger panel -> Files -> FTP Accounts gives host/username/password).\n`);
  process.exit(1);
}
const cfg = JSON.parse(fs.readFileSync(CFG, 'utf8'));
for (const k of ['host', 'user', 'password']) {
  if (!cfg[k]) { console.error(`deploy.config.json is missing "${k}".`); process.exit(1); }
}

const remoteRoot   = (cfg.remoteRoot || '/public_html').replace(/\/+$/, '') || '/';
const uploadVendor = cfg.uploadVendor !== false;            // default true
const onlyArg      = process.argv.slice(2).find(a => a.startsWith('--only='));
const only         = onlyArg ? onlyArg.slice(7).split(',').map(s => s.trim()) : null;

const FILES = ['index.html', '.htaccess'];   // .htaccess = cache policy so deploys load immediately
const DIRS  = ['src', 'api', 'assets', 'studio'];   // assets/=GLB heroes · studio/=company landing page
if (uploadVendor) DIRS.push('vendor');

const client = new Client(30000);
client.ftp.verbose = false;
let count = 0;
client.trackProgress(info => { if (info.type === 'upload') { count++; if (count % 12 === 0) process.stdout.write('.'); } });

try {
  console.log(`Connecting to ${cfg.host}:${cfg.port || 21} as ${cfg.user} (secure=${!!cfg.secure})…`);
  await client.access({
    host: cfg.host, port: cfg.port || 21, user: cfg.user, password: cfg.password,
    secure: !!cfg.secure,
    secureOptions: cfg.secure ? { rejectUnauthorized: false } : undefined,
  });
  await client.ensureDir(remoteRoot);   // create + cd into the web root
  console.log('Connected. Deploying to', remoteRoot);

  for (const f of FILES) {
    if (only && !only.includes(f)) continue;
    if (!fs.existsSync(f)) continue;
    await client.uploadFrom(f, f);
    console.log('  ↑', f);
  }
  for (const d of DIRS) {
    if (only && !only.includes(d)) continue;
    if (!fs.existsSync(d)) continue;
    process.stdout.write('  ↑ ' + d + '/ ');
    await client.uploadFromDir(d, d);
    process.stdout.write('done\n');
  }
  client.trackProgress();
  console.log(`\n✓ Deploy complete (${count} files uploaded).`);
} catch (e) {
  console.error('\n✗ Deploy FAILED:', e && e.message);
  process.exit(1);
} finally {
  client.close();
}
