/* Mascot: a character that looks toward the pointer and reacts when poked.
   Vanilla port of page-mascot by Kamran Ahmed (MIT, https://github.com/nilbuild/page-mascot).
   Each character is two 3x3 sprite sheets: nine head directions and nine expressions. */
(() => {
  'use strict';
  const DIR = ['up-left', 'up', 'up-right', 'left', 'center', 'right', 'down-left', 'down', 'down-right'];
  const RX = ['blink', 'heart', 'sparkle', 'surprised', 'wink', 'bashful', 'sleepy', 'dizzy', 'delighted'];
  const CW = ['right', 'down-right', 'down', 'down-left', 'left', 'up-left', 'up', 'up-right']; // clockwise from the right
  const SECTOR = (Math.PI * 2) / CW.length, HYSTERESIS = 0.12, DEAD_ZONE = 70;
  const PAYOFFS = ['heart', 'sparkle', 'delighted'];
  const BOOP_PAYOFF = 120, BOOP_END = 560, SQUASH_MS = 420, DIZZY_AFTER = 4, DIZZY_WINDOW = 1600, DIZZY_END = 1100;
  const SQUASH = [
    { transform: 'scale(1, 1)', easing: 'ease-in' },
    { transform: 'scale(1.10, 0.86)', offset: 0.18, easing: 'ease-out' },
    { transform: 'scale(0.95, 1.08)', offset: 0.45, easing: 'ease-in-out' },
    { transform: 'scale(1.03, 0.97)', offset: 0.72, easing: 'ease-in-out' },
    { transform: 'scale(1, 1)' },
  ];
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
  const cell = (el, i) => { el.style.backgroundPosition = (i % 3) * 50 + '% ' + Math.floor(i / 3) * 50 + '%'; };

  // one pointer listener for every mascot on the page
  const all = new Set();
  let pointer = null, queued = false;
  if (fine) {
    addEventListener('pointermove', e => {
      pointer = { x: e.clientX, y: e.clientY };
      if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; all.forEach(m => m.aim(pointer)); }); }
    }, { passive: true });
  }

  function attach(btn, opts = {}) {
    btn.classList.add('mc');
    btn.innerHTML = '<span class="mc-sq"><span class="mc-d"></span><span class="mc-r"></span></span>';
    const sq = btn.firstChild, dEl = sq.children[0], rEl = sq.children[1];
    let dir = 'center', rx = null, sector = -1, timers = [];
    const boops = { n: 0, at: 0 };
    const paint = () => {
      cell(dEl, DIR.indexOf(dir)); cell(rEl, RX.indexOf(rx || 'blink'));
      dEl.style.opacity = rx ? 0 : 1; rEl.style.opacity = rx ? 1 : 0;
    };
    const api = {
      setSheets(d, r) { dEl.style.backgroundImage = 'url(' + d + ')'; rEl.style.backgroundImage = 'url(' + r + ')'; },
      aim(p) {
        const b = btn.getBoundingClientRect();
        if (b.bottom < 0 || b.top > innerHeight || !b.width) return;
        const dx = p.x - (b.left + b.width / 2), dy = p.y - (b.top + b.height / 2);
        if (Math.hypot(dx, dy) < DEAD_ZONE) { if (sector !== -1 || dir !== 'center') { sector = -1; dir = 'center'; paint(); } return; }
        const a = Math.atan2(dy, dx);
        if (sector !== -1 && Math.abs(wrap(a - sector * SECTOR)) < SECTOR / 2 + HYSTERESIS) return; // hold the sector near its edge
        sector = (Math.round(a / SECTOR) + CW.length) % CW.length;
        const next = CW[sector];
        if (next !== dir) { dir = next; paint(); }
      },
      react(name, ms) {
        timers.forEach(clearTimeout); timers = [];
        rx = name; paint();
        if (ms) timers.push(setTimeout(() => { rx = null; paint(); }, ms));
      },
      boop() {
        timers.forEach(clearTimeout); timers = [];
        const later = (ms, n) => timers.push(setTimeout(() => { rx = n; paint(); }, ms));
        const now = Date.now();
        boops.n = now - boops.at < DIZZY_WINDOW ? boops.n + 1 : 1; boops.at = now;
        if (boops.n >= DIZZY_AFTER) { boops.n = 0; rx = 'dizzy'; paint(); later(DIZZY_END, null); }
        else { rx = 'blink'; paint(); later(BOOP_PAYOFF, PAYOFFS[(boops.n - 1) % PAYOFFS.length]); later(BOOP_END, null); }
        if (!reduced()) sq.animate(SQUASH, { duration: SQUASH_MS, easing: 'linear' });
      },
      destroy() { all.delete(api); timers.forEach(clearTimeout); },
    };
    paint();
    all.add(api);
    if (opts.directions && opts.reactions) api.setSheets(opts.directions, opts.reactions);
    return api;
  }
  window.Mascot = { attach, DIR, RX };
})();
