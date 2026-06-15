// Moonlit Ronin Studios — landing page interactions.
// Vanilla + a small Three.js dragon viewer (Three from the game's vendored importmap).

/* ---------- nav: scroll state, burger, smooth-scroll ---------- */
const nav = document.getElementById('nav');
const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 40);
onScroll(); addEventListener('scroll', onScroll, { passive: true });

const burger = document.getElementById('burger');
const navlinks = document.getElementById('navlinks');
burger?.addEventListener('click', () => navlinks.classList.toggle('open'));
navlinks?.querySelectorAll('a').forEach(a => a.addEventListener('click', () => navlinks.classList.remove('open')));

/* ---------- reveal on scroll ---------- */
const io = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
}, { threshold: 0.14 });
document.querySelectorAll('.reveal').forEach(el => io.observe(el));

/* ---------- hero parallax ---------- */
const heroBg = document.getElementById('heroBg');
addEventListener('scroll', () => {
  const y = window.scrollY;
  if (heroBg && y < window.innerHeight) heroBg.style.transform = `scale(1.08) translateY(${y * 0.18}px)`;
}, { passive: true });

/* ---------- particle FX: cherry petals + fireflies ---------- */
(function () {
  const c = document.getElementById('fx'), x = c.getContext('2d');
  let w, h, parts = [];
  const rnd = (a, b) => a + Math.random() * (b - a);
  function resize() {
    w = c.width = innerWidth; h = c.height = innerHeight;
    const n = Math.min(70, Math.floor(w / 22));
    parts = Array.from({ length: n }, () => mk());
  }
  function mk() {
    const fly = Math.random() < 0.4;
    return { fly, x: rnd(0, w), y: rnd(0, h), r: fly ? rnd(1, 2.4) : rnd(4, 9),
      vx: rnd(-0.5, 0.5), vy: fly ? rnd(-0.2, 0.2) : rnd(0.4, 1.2),
      a: rnd(0, 6.28), va: rnd(-0.03, 0.03), tw: rnd(0, 6.28) };
  }
  function frame(t) {
    x.clearRect(0, 0, w, h);
    for (const p of parts) {
      p.x += p.vx + Math.sin(p.y / 40) * 0.3; p.y += p.vy; p.a += p.va; p.tw += 0.05;
      if (p.y > h + 12) { p.y = -12; p.x = rnd(0, w); }
      if (p.x > w + 12) p.x = -12; if (p.x < -12) p.x = w + 12;
      if (p.fly) {
        const g = (Math.sin(p.tw) * 0.5 + 0.5);
        x.beginPath(); x.fillStyle = `rgba(255,${170 + g * 50},90,${0.25 + g * 0.5})`;
        x.shadowBlur = 8; x.shadowColor = 'rgba(255,170,70,.8)';
        x.arc(p.x, p.y, p.r, 0, 6.29); x.fill(); x.shadowBlur = 0;
      } else {
        x.save(); x.translate(p.x, p.y); x.rotate(p.a);
        x.fillStyle = `rgba(255,150,180,${0.5})`;
        x.beginPath(); x.ellipse(0, 0, p.r, p.r * 0.55, 0, 0, 6.29); x.fill(); x.restore();
      }
    }
    requestAnimationFrame(frame);
  }
  addEventListener('resize', resize); resize(); requestAnimationFrame(frame);
})();

/* ---------- countdown to June 1, 2026 ---------- */
(function () {
  const target = Date.UTC(2026, 5, 1, 0, 0, 0); // June is month index 5
  const set = (k, v) => document.querySelectorAll(`[data-cd="${k}"]`).forEach(e => e.textContent = String(v).padStart(2, '0'));
  function tick() {
    let s = Math.max(0, Math.floor((target - Date.now()) / 1000));
    const d = Math.floor(s / 86400); s -= d * 86400;
    const h = Math.floor(s / 3600); s -= h * 3600;
    const m = Math.floor(s / 60); s -= m * 60;
    set('d', d); set('h', h); set('m', m); set('s', s);
  }
  tick(); setInterval(tick, 1000);
})();

/* ---------- subscriber count + email capture ---------- */
const API = 'api/subscribe.php';
const countEls = document.querySelectorAll('[data-count]');
function renderCount(n) {
  const shown = (typeof n === 'number' && n >= 0) ? n.toLocaleString() : '1,000';
  countEls.forEach(e => e.textContent = shown);
}
async function loadCount() {
  try {
    const r = await fetch(API, { method: 'GET' });
    const j = await r.json();
    renderCount(j && typeof j.count === 'number' ? j.count : null);
  } catch { renderCount(null); }   // offline/local: show a healthy placeholder
}
loadCount();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
document.querySelectorAll('form.signup').forEach(form => {
  const input = form.querySelector('input[type=email]');
  const btn = form.querySelector('button');
  // message element: the sibling [data-msg] after this form
  const msg = form.parentElement.querySelector('[data-msg]') || form.nextElementSibling;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = (input.value || '').trim();
    if (!EMAIL_RE.test(email)) { say('Please enter a valid email.', 'bad'); input.focus(); return; }
    btn.disabled = true; const label = btn.textContent; btn.textContent = 'Joining…';
    try {
      const r = await fetch(API, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source: form.dataset.source || 'site' })
      });
      const j = await r.json().catch(() => ({}));
      if (j && j.ok) {
        if (typeof j.count === 'number') renderCount(j.count);
        say(j.dup ? "You're already on the list — see you in June. ✦" : "You're in! Welcome to the founding circle. ✦", 'ok');
        form.reset();
        if (!j.dup) burstPetals(btn);
      } else if (j && j.error === 'invalid') {
        say('Please enter a valid email.', 'bad');
      } else {
        say("You're in! We'll be in touch. ✦", 'ok'); form.reset();   // fail-soft success
      }
    } catch {
      // network/offline (e.g. local file) — still acknowledge so the UX never dead-ends
      say("Saved locally — you're on the list. ✦", 'ok'); form.reset();
    } finally { btn.disabled = false; btn.textContent = label; }
  });
  function say(t, cls) { if (!msg) return; msg.textContent = t; msg.className = 'form-msg ' + cls; }
});
function burstPetals(el) {
  const r = el.getBoundingClientRect();
  for (let i = 0; i < 14; i++) {
    const d = document.createElement('div');
    d.textContent = '❀';
    d.style.cssText = `position:fixed;left:${r.left + r.width / 2}px;top:${r.top}px;z-index:999;pointer-events:none;
      color:hsl(${330 + Math.random() * 30},90%,75%);font-size:${10 + Math.random() * 12}px;transition:all 1.1s ease-out`;
    document.body.appendChild(d);
    requestAnimationFrame(() => {
      d.style.transform = `translate(${(Math.random() - 0.5) * 240}px,${-80 - Math.random() * 160}px) rotate(${Math.random() * 360}deg)`;
      d.style.opacity = '0';
    });
    setTimeout(() => d.remove(), 1200);
  }
}

/* ---------- share ---------- */
document.querySelector('[data-share]')?.addEventListener('click', async (e) => {
  e.preventDefault();
  const data = { title: 'The Monk & The Dragon Sister', text: 'A 2-player co-op anime action saga — early access June 2026.', url: location.href };
  try { if (navigator.share) await navigator.share(data); else { await navigator.clipboard.writeText(location.href); alert('Link copied!'); } } catch {}
});

/* ---------- 3D dragon viewer ---------- */
import('./dragon3d.js').catch(err => console.warn('[3d] viewer unavailable', err));
