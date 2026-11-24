/* Modozo assistant: a mascot above a chat launcher. It is rule based, not AI.
   Answers are read from the FAQ already on the page, plus contact details from the footer.
   Anything it cannot answer is handed to the team by email. Needs js/mascot.js. */
(() => {
  'use strict';
  if (!window.Mascot) return;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const SHEETS = { d: 'public/mascots/ballerina-directions.webp', r: 'public/mascots/ballerina-reactions.webp' };

  /* ───── what the assistant knows, taken from the page itself ───── */
  const faq = $$('.faq-row').map(r => ({ q: $('dt', r).textContent.trim(), a: $('dd', r).textContent.trim() }));
  if (!faq.length) return;
  const mailEl = $('.ftr a[href^="mailto:"]'), telEl = $('.ftr a[href^="tel:"]'), addrEl = $('.ftr address div span');
  const email = mailEl ? mailEl.getAttribute('href').replace('mailto:', '') : 'contact@modozo.fashion';
  const phone = telEl ? telEl.textContent.trim() : '';
  const phoneHref = telEl ? telEl.getAttribute('href') : '';
  const address = addrEl ? addrEl.textContent.trim() : '';
  // extra words that should lead to each FAQ answer, in the same order as the FAQ on the page
  const KEYS = [
    'modozo platform plm lifecycle software product overview',
    'manual automate automation extraction excel pdf retyping techpack spreadsheet time',
    'vendor supplier manufacturer factory collaborate share invite comment cost email',
    'sample production tracking track order status delay qa dispatch fabric cutting stitching measurement',
    'aligned sync version approval roles teams changes record history',
    'secure security data privacy access permission compliance hosting safe',
    'customer industry apparel brand manufacturer sourcing audience',
  ];
  const STOP = new Set('the and for with are does can how what who why when where you your our was will have has not but this that from about tell give get any there them they his her its into out use using'.split(' '));
  const stem = w => w.length > 4 && w.endsWith('ing') ? w.slice(0, -3) : w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w;
  const toks = s => new Set(s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(w => w.length > 2 && !STOP.has(w)).map(stem));
  const index = faq.map((f, i) => ({ q: toks(f.q), k: toks(KEYS[i] || ''), a: toks(f.a) }));
  const hits = (a, b) => { let n = 0; a.forEach(w => { if (b.has(w)) n++; }); return n; };
  const best = text => {
    const t = toks(text); let top = -1, score = 0;
    index.forEach((x, i) => { const s = 3 * hits(t, x.q) + 3 * hits(t, x.k) + hits(t, x.a); if (s > score) { score = s; top = i; } });
    return score >= 3 ? top : -1;
  };

  /* ───── interface ───── */
  const root = document.createElement('div');
  root.className = 'as';
  root.innerHTML =
    '<section class="as-panel" id="asPanel" role="dialog" aria-modal="false" aria-label="Ask Modozo">' +
      '<header class="as-head"><div><b>Ask Modozo</b><small>Instant answers from our FAQ</small></div>' +
      '<button type="button" class="as-x" aria-label="Close chat"><svg class="i" aria-hidden="true"><use href="#i-x"/></svg></button></header>' +
      '<div class="as-msgs" id="asMsgs" role="log" aria-live="polite" aria-relevant="additions"></div>' +
      '<div class="as-chips" id="asChips"></div>' +
      '<form class="as-form" id="asForm" autocomplete="off"><label class="sr" for="asInput">Your question</label>' +
      '<input id="asInput" type="text" maxlength="200" placeholder="Ask about tech packs, vendors, samples">' +
      '<button class="btn btn-primary as-send" type="submit" aria-label="Send question"><svg class="i" aria-hidden="true"><use href="#i-send"/></svg></button></form>' +
      '<p class="as-note">Not an AI. Answers come from this page. A person replies to anything else.</p>' +
    '</section>' +
    '<button class="as-mascot" type="button" aria-hidden="true" tabindex="-1"></button>' +
    '<button class="as-launch" type="button" aria-expanded="false" aria-controls="asPanel"><svg class="i" aria-hidden="true"><use href="#i-msg"/></svg><span>Ask Modozo</span></button>';
  document.body.append(root);
  const panel = $('#asPanel', root), msgs = $('#asMsgs', root), chips = $('#asChips', root), form = $('#asForm', root), input = $('#asInput', root);
  const launch = $('.as-launch', root), mascotBtn = $('.as-mascot', root), closeBtn = $('.as-x', root);
  const mascot = Mascot.attach(mascotBtn, { directions: SHEETS.d, reactions: SHEETS.r });

  const scrollDown = () => { msgs.scrollTop = msgs.scrollHeight; };
  const add = (role, text, actions) => {
    const d = document.createElement('div'); d.className = 'as-msg ' + role;
    const p = document.createElement('p'); p.textContent = text; d.append(p);
    if (actions && actions.length) {
      const box = document.createElement('div'); box.className = 'as-acts';
      actions.forEach(x => {
        const a = document.createElement('a'); a.className = 'as-act' + (x.primary ? ' primary' : ''); a.href = x.href; a.textContent = x.label;
        if (x.href.startsWith('#')) a.addEventListener('click', () => setOpen(false));
        box.append(a);
      });
      d.append(box);
    }
    msgs.append(d); scrollDown();
    return d;
  };
  const DEMO = { label: 'Book a demo', href: '#cta', primary: true };
  const mailTo = q => ({ label: 'Email the team', href: 'mailto:' + email + '?subject=' + encodeURIComponent('Question about Modozo') + (q ? '&body=' + encodeURIComponent(q) : '') });

  const reply = text => {
    const t = text.toLowerCase();
    if (/^(hi|hello|hey|good (morning|afternoon|evening))\b/.test(t)) return { text: 'Hello. Ask me about tech packs, vendors, samples, production or security, or pick a question below.', rx: 'delighted' };
    if (/\b(thanks|thank you|cheers)\b/.test(t)) return { text: 'You are welcome. If you would like to see Modozo with your own styles, book a demo.', actions: [DEMO], rx: 'heart' };
    if (/\b(email|mail|contact|reach|phone|call|number|address|office|location|talk to (a )?(person|human|someone))\b/.test(t)) {
      const acts = [mailTo()]; if (phoneHref) acts.push({ label: 'Call ' + phone, href: phoneHref });
      return { text: 'You can reach the team at ' + email + (phone ? ' or ' + phone : '') + '.' + (address ? ' The office is at ' + address + '.' : ''), actions: acts, rx: 'wink' };
    }
    if (/\b(pricing|prices?|how much|quote|plans?|trial|pilot|buy|purchase|sign ?up|get started|demo)\b/.test(t)) return { text: 'Pricing and trial terms are not on this page. The team shares them in a demo, or by email.', actions: [DEMO, mailTo(text)], rx: 'blink' };
    const i = best(text);
    if (i >= 0) return { text: faq[i].a, actions: [DEMO], rx: 'sparkle' };
    if (/\b(demo|trial|pilot|pricing|price|cost|quote|plan|buy|purchase|sign ?up|get started|book)\b/.test(t)) return { text: 'Pricing and trial terms are not on this page. The team shares them in a demo, or by email.', actions: [DEMO, mailTo(text)], rx: 'blink' };
    return { text: 'I can answer questions about the platform, vendors, samples, production and security. For anything else, the team can answer directly.', actions: [mailTo(text), DEMO], rx: 'bashful' };
  };

  let busy = false;
  const ask = text => {
    text = text.trim(); if (!text || busy) return;
    busy = true; chips.hidden = true;
    add('user', text);
    const typing = document.createElement('div'); typing.className = 'as-msg bot as-typing'; typing.setAttribute('aria-label', 'Typing'); typing.innerHTML = '<i></i><i></i><i></i>';
    msgs.append(typing); scrollDown();
    setTimeout(() => {
      typing.remove();
      const r = reply(text);
      add('bot', r.text, r.actions);
      mascot.react(r.rx, 1100);
      busy = false;
    }, reduced ? 0 : 520);
  };

  [0, 2, 3, 5].filter(i => faq[i]).forEach(i => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'as-chip'; b.textContent = faq[i].q;
    b.addEventListener('click', () => ask(faq[i].q)); chips.append(b);
  });
  form.addEventListener('submit', e => { e.preventDefault(); const v = input.value; input.value = ''; ask(v); });

  const setOpen = open => {
    root.classList.toggle('is-open', open);
    launch.setAttribute('aria-expanded', String(open));
    if (open) {
      if (!msgs.children.length) add('bot', 'Hello, I am the Modozo assistant. Ask about tech packs, vendors, samples, production or security, or pick a question below.');
      mascot.react('delighted', 900);
      setTimeout(() => input.focus({ preventScroll: true }), 60);
    } else if (root.contains(document.activeElement)) launch.focus();
  };
  launch.addEventListener('click', () => setOpen(!root.classList.contains('is-open')));
  mascotBtn.addEventListener('click', () => { mascot.boop(); setOpen(!root.classList.contains('is-open')); });
  closeBtn.addEventListener('click', () => setOpen(false));
  addEventListener('keydown', e => { if (e.key === 'Escape' && root.classList.contains('is-open')) setOpen(false); });
})();
