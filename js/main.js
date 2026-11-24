(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const desktop = matchMedia('(min-width: 901px)');

  /* header: stronger shadow once the page has scrolled (sentinel, no scroll listener) */
  const hdr = $('#hdr');
  new IntersectionObserver(([e]) => hdr.classList.toggle('scrolled', !e.isIntersecting)).observe($('#top-sentinel'));

  /* mobile menu: full height panel, links arrive in reading order */
  const burger = $('#burger'), drawer = $('#drawer');
  const setDrawer = open => {
    drawer.classList.toggle('open', open);
    burger.setAttribute('aria-expanded', open);
    burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    document.body.style.overflow = open ? 'hidden' : '';
  };
  burger.addEventListener('click', () => setDrawer(!drawer.classList.contains('open')));
  $$('a', drawer).forEach(a => a.addEventListener('click', () => setDrawer(false)));
  addEventListener('keydown', e => { if (e.key === 'Escape') setDrawer(false); });
  desktop.addEventListener('change', e => { if (e.matches) setDrawer(false); });

  /* scroll reveal: once */
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  $$('.rv').forEach(el => io.observe(el));

  /* current section in the nav */
  const links = $$('.nav a');
  const so = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) links.forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#' + e.target.id));
  }), { rootMargin: '-40% 0px -55% 0px' });
  // sections without a nav link (faq, closing block) clear the highlight
  ['problem', 'platform', 'compare', 'workflow', 'impact', 'faq', 'cta'].forEach(id => { const s = $('#' + id); if (s) so.observe(s); });

  /* platform explorer: pinned on desktop, driven by sentinels instead of a scroll listener */
  const track = $('#explTrack'), pin = $('#explPin'), view = $('#view');
  const tabs = $$('.mod'), slides = $$('.view-slide'), cap = $('#capName');
  let cur = 0;
  const setMod = i => {
    if (i === cur || i < 0) return;
    cur = i;
    tabs.forEach((t, k) => { t.setAttribute('aria-selected', k === i); t.tabIndex = k === i ? 0 : -1; });
    slides.forEach((s, k) => s.classList.toggle('on', k === i));
    cap.textContent = $('h3', tabs[i]).textContent;
    view.dataset.c = tabs[i].dataset.c;
  };
  const range = () => track.offsetHeight - pin.offsetHeight;
  const sents = tabs.map(() => { const s = document.createElement('span'); s.className = 'sent'; s.setAttribute('aria-hidden', 'true'); track.append(s); return s; });
  const layout = () => {
    const n = tabs.length;
    if (!desktop.matches) { sents.forEach(s => { s.style.display = 'none'; }); return; }
    const H = track.offsetHeight, R = range();
    // viewport centre crosses a boundary when the track top sits at 96 - k*R/n
    const f = k => clamp((innerHeight / 2 - 96 + (k * R) / n) / H, 0, 1);
    sents.forEach((s, i) => {
      const a = i === 0 ? 0 : f(i), b = i === n - 1 ? 1 : f(i + 1);
      s.style.display = '';
      s.style.top = a * H + 'px';
      s.style.height = Math.max(4, (b - a) * H) + 'px';
    });
  };
  const eo = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) setMod(sents.indexOf(e.target)); }), { rootMargin: '-49% 0px -49% 0px' });
  sents.forEach(s => eo.observe(s));
  layout();
  addEventListener('resize', layout);
  desktop.addEventListener('change', layout);
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => {
      if (desktop.matches) {
        const top = scrollY + track.getBoundingClientRect().top - 96 + ((i + 0.5) / tabs.length) * range();
        scrollTo({ top, behavior: reduced ? 'auto' : 'smooth' });
      }
      setMod(i);
    });
    t.addEventListener('keydown', e => {
      const d = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
      if (!d) return;
      e.preventDefault();
      const n = (i + d + tabs.length) % tabs.length;
      tabs[n].focus(); tabs[n].click();
    });
  });

  /* workflow steps with photo crossfade */
  const steps = $$('.step'), imgs = $$('#wfVis img'), tag = $('#wfTag'), title = $('#wfTitle');
  const copy = [
    ['Step 01 · Linesheet to tech pack', 'Specifications, BOMs and references in one place'],
    ['Step 02 · Collaborate', 'Teams and vendors working on the same style'],
    ['Step 03 · Sampling', 'Every sample round tracked against the spec'],
    ['Step 04 · Analytics', 'Production status visible across every season'],
  ];
  let wf = 0, timer;
  const setStep = i => {
    wf = i;
    steps.forEach((s, k) => { s.setAttribute('aria-selected', k === i); s.tabIndex = k === i ? 0 : -1; });
    imgs.forEach((im, k) => im.classList.toggle('on', k === i));
    tag.textContent = copy[i][0]; title.textContent = copy[i][1];
  };
  const stop = () => clearInterval(timer);
  steps.forEach((s, i) => {
    s.addEventListener('click', () => { stop(); setStep(i); });
    s.addEventListener('keydown', e => {
      const d = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
      if (!d) return;
      e.preventDefault(); stop();
      const n = (i + d + steps.length) % steps.length;
      steps[n].focus(); setStep(n);
    });
  });
  if (!reduced) {
    new IntersectionObserver(es => es.forEach(e => {
      stop();
      if (e.isIntersecting) timer = setInterval(() => setStep((wf + 1) % steps.length), 6500);
    }), { threshold: 0.4 }).observe($('#wfVis'));
  }

  /* tagline reveal: words wake up one at a time as they cross the trigger line */
  const tl = $('#tagline');
  if (tl && !reduced) {
    const text = tl.textContent.trim();
    tl.setAttribute('aria-label', text);
    tl.textContent = '';
    // one line per sentence, so lines break where the thought breaks
    (text.match(/[^.]+\./g) || [text]).forEach(sentence => {
      const line = document.createElement('span');
      line.className = 'tl-line'; line.setAttribute('aria-hidden', 'true');
      sentence.trim().split(/\s+/).forEach((w, i, a) => {
        const s = document.createElement('span');
        s.className = 'w'; s.textContent = w;
        line.append(s, i < a.length - 1 ? ' ' : '');
      });
      tl.append(line);
    });
    tl.classList.add('js-words');
    const ws = $$('.w', tl);
    let row = null, n = 0; // stagger words that share a line
    ws.forEach(w => { if (w.offsetTop !== row) { row = w.offsetTop; n = 0; } w.style.transitionDelay = Math.min(n * 70, 560) + 'ms'; n++; });
    const wo = new IntersectionObserver(es => es.forEach(e => {
      const passed = e.rootBounds && e.boundingClientRect.top < e.rootBounds.top; // already scrolled past
      if (e.isIntersecting || passed) { e.target.classList.add('on'); wo.unobserve(e.target); }
    }), { rootMargin: '0px 0px -40% 0px' });
    ws.forEach(w => wo.observe(w));
  }

  /* footer year stays current */
  const yr = $('#year');
  if (yr) yr.textContent = new Date().getFullYear();

  /* demo request form: inline errors, a calm success panel, nothing sent without a valid form */
  const form = $('#demoForm');
  if (form) {
    const ok = $('#demoOk'), status = $('#demoStatus'), btn = $('button[type=submit]', form);
    const fields = ['name', 'email', 'company'].map(n => form.elements[n]);
    const msg = {
      name: 'Enter your full name.',
      company: 'Enter your company name.',
      email: 'Enter your work email.',
      emailBad: 'That email address looks incomplete. Use the format name@company.com.',
    };
    const emailOk = v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
    const say = (text, kind) => { status.textContent = text; status.dataset.kind = kind || ''; };
    const check = el => {
      const v = el.value.trim();
      const m = !v ? msg[el.name] : el.name === 'email' && !emailOk(v) ? msg.emailBad : '';
      $('#e-' + el.name).textContent = m;
      if (m) el.setAttribute('aria-invalid', 'true'); else el.removeAttribute('aria-invalid');
      return !m;
    };
    fields.forEach(el => {
      el.addEventListener('blur', () => { if (el.value || el.hasAttribute('aria-invalid')) check(el); });
      el.addEventListener('input', () => { if (el.hasAttribute('aria-invalid')) check(el); });
    });
    const done = (title, text) => {
      $('#demoOkTitle').textContent = title;
      $('#demoOkText').textContent = text;
      form.hidden = true; ok.hidden = false; ok.focus();
    };
    $('#demoAgain').addEventListener('click', () => { ok.hidden = true; form.hidden = false; say(''); fields[0].focus(); });
    form.addEventListener('submit', async e => {
      e.preventDefault();
      say('');
      const bad = fields.filter(el => !check(el));
      if (bad.length) {
        bad[0].focus();
        say('Check the highlighted ' + (bad.length === 1 ? 'field' : 'fields') + ' and try again.', 'error');
        return;
      }
      const d = Object.fromEntries([...new FormData(form)].map(([k, v]) => [k, String(v).trim()]));
      btn.disabled = true; btn.setAttribute('aria-busy', 'true');
      try {
        if (form.dataset.endpoint) {
          const r = await fetch(form.dataset.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(d) });
          if (!r.ok) throw new Error('HTTP ' + r.status);
          done('Request received', 'Thanks, ' + d.name.split(/\s+/)[0] + '. The Modozo team will write to ' + d.email + ' to arrange your demo.');
        } else {
          // no form service is connected yet, so the request goes out through the visitor's email app
          const body = 'Name: ' + d.name + '\nWork email: ' + d.email + '\nCompany: ' + d.company + '\n\n' + (d.message || '');
          location.href = 'mailto:contact@modozo.fashion?subject=' + encodeURIComponent('Modozo demo request from ' + d.company) + '&body=' + encodeURIComponent(body);
          done('Your request is ready to send', 'Your email app is opening with the details filled in. Send the message to finish booking your demo. If nothing opens, write to contact@modozo.fashion.');
        }
      } catch (err) {
        say('We couldn\u2019t send your request. Check your connection and try again, or write to contact@modozo.fashion.', 'error');
      } finally {
        btn.disabled = false; btn.removeAttribute('aria-busy');
      }
    });
  }
})();
