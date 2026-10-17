// News view — live wire: country + topic tagging, filters, search,
// ticking timestamps, 5-minute auto-refresh, "most mentioned" pulse.

(function (global) {
  const REFRESH_MS = 5 * 60 * 1000;
  const TICK_MS = 1000;

  // ── Country detection (G20 names, demonyms, capitals, central banks) ──────
  // Case-sensitive on purpose: headlines capitalise proper nouns, which keeps
  // "turkey" (food) or "us" (pronoun) from matching.
  // Terms are curated per G20 member in the country registry (countries.js).
  const COUNTRY_TERMS = Object.fromEntries(
    (window.COUNTRY_REGISTRY?.collections?.g20?.members || []).map(m => [m.iso3, m.newsTerms || [m.name]])
  );
  // Currency words like "real"/"rand"/"peso" are too ambiguous in lowercase;
  // only keep the unambiguous lowercase ones.
  const AMBIGUOUS = new Set(['real', 'rand', 'peso', 'lira', 'yen', 'yuan', 'rupee', 'renminbi', 'rouble', 'ruble']);
  const COUNTRY_RE = Object.entries(COUNTRY_TERMS).map(([iso3, terms]) => {
    const keep = terms.filter(t => !AMBIGUOUS.has(t) || ['yen', 'yuan', 'rupee', 'renminbi', 'rouble', 'ruble', 'lira'].includes(t));
    return { iso3, re: new RegExp(`(?:^|[^A-Za-z])(?:${keep.join('|')})(?![A-Za-z])`) };
  });

  // ── Topic rules ────────────────────────────────────────────────────────────
  const TOPICS = [
    { id: 'inflation', label: 'Inflation',      tone: 'neg',  re: /inflation|\bcpi\b|\bppi\b|deflation|disinflation|cost of living|price (?:rise|rises|increase|pressure)|prices/i },
    { id: 'rates',     label: 'Rates & CBs',    tone: 'info', re: /interest rate|rate (?:cut|cuts|hike|hikes|rise)|central bank|\bfed\b|federal reserve|\becb\b|bank of (?:england|japan|canada)|\bboe\b|\bboj\b|\brbi\b|monetary|tightening|easing|\byields?\b|\bbonds?\b|gilts?/i },
    { id: 'trade',     label: 'Trade & tariffs', tone: 'warn', re: /\btrade\b|tariff|export|import|sanction|supply chain|\bwto\b|customs|protectionis/i },
    { id: 'growth',    label: 'Growth & jobs',  tone: 'pos',  re: /\bgdp\b|growth|recession|slowdown|contraction|\boutput\b|\bjobs?\b|unemploy|labou?r market|payrolls?|hiring|layoffs?|productivity/i },
    { id: 'fiscal',    label: 'Fiscal & debt',  tone: 'text', re: /\bdebt\b|deficit|budget|fiscal|\btax(?:es|ation)?\b|borrowing|spending|\bimf\b|bailout|default/i },
    { id: 'energy',    label: 'Energy',         tone: 'warn', re: /\boil\b|\bgas\b|energy|\bfuel|opec|crude|electricity|renewable|climate|petrol|\blng\b/i },
    { id: 'tech',      label: 'AI & tech',      tone: 'info', re: /\bai\b|artificial intelligence|\bchips?\b|semiconductor|\btech\b|technology|nvidia|data cent|software|robot/i },
    { id: 'markets',   label: 'Markets & FX',   tone: 'text', re: /\bstocks?\b|\bshares\b|markets?\b|currenc|\bdollar\b|\bequit|investors?|s&p|nasdaq|ftse|sell-?off|rally/i },
  ];
  const TOPIC_BY_ID = Object.fromEntries(TOPICS.map(t => [t.id, t]));

  // ── Module state (survives re-renders; one instance at a time) ────────────
  const S = {
    root: null,
    articles: [],
    seen: null,          // Set of links from the previous fetch (for "new" badges)
    filter: { topic: null, country: null, source: null, q: '' },
    updatedAt: null,
    nextAt: null,
    status: 'idle',      // idle | loading | ok | error
    lastError: null,
    timer: null,
    loading: false,
    limit: 18,
  };

  const countryOf = iso3 => (global.G20 || []).find(c => c.iso3 === iso3);

  function safeUrl(u) {
    const s = String(u || '').trim().replace(/&amp;/g, '&');
    return /^https?:\/\//i.test(s) ? s : null;
  }

  function enrich(a) {
    const title = String(a.title || '').trim();
    const desc = String(a.description || '').trim();
    const text = title + ' ' + desc;
    const countries = COUNTRY_RE.filter(c => c.re.test(text)).map(c => c.iso3);
    const topics = TOPICS.filter(t => t.re.test(text)).map(t => t.id);
    const t = a.pubDate ? new Date(a.pubDate).getTime() : NaN;
    return {
      title, desc,
      source: String(a.source || 'Unknown'),
      url: safeUrl(a.link),
      ts: isNaN(t) ? null : t,
      countries, topics,
      key: safeUrl(a.link) || title,
      isNew: false,
    };
  }

  function relTime(ts) {
    if (!ts) return '';
    const s = Math.max(0, (Date.now() - ts) / 1000);
    if (s < 60) return 'just now';
    const m = Math.floor(s / 60);
    if (m < 60) return `${m} min ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} h ago`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d} d ago`;
    return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }
  const hhmm = ts => new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const absTime = ts => ts ? new Date(ts).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

  // ── Filtering ─────────────────────────────────────────────────────────────
  function applyFilters() {
    const { topic, country, source, q } = S.filter;
    const needle = q.trim().toLowerCase();
    return S.articles.filter(a =>
      (!topic || a.topics.includes(topic)) &&
      (!country || a.countries.includes(country)) &&
      (!source || a.source === source) &&
      (!needle || (a.title + ' ' + a.desc + ' ' + a.source).toLowerCase().includes(needle))
    );
  }

  function tally(list, key) {
    const m = new Map();
    list.forEach(a => a[key].forEach(k => m.set(k, (m.get(k) || 0) + 1)));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }

  // ── Render pieces ─────────────────────────────────────────────────────────
  function countryChips(a, max) {
    return a.countries.slice(0, max).map(iso3 => {
      const c = countryOf(iso3);
      if (!c) return '';
      return `<button type="button" class="nw-cc" data-nav="${A.escapeAttr(iso3)}" title="Open ${A.escapeAttr(c.name)} profile">` +
        `<span class="nw-cc__flag" aria-hidden="true">${A.escapeText(c.flag)}</span>${A.escapeText(c.name)}</button>`;
    }).join('');
  }

  function topicTags(a) {
    return a.topics.slice(0, 3).map(id => {
      const t = TOPIC_BY_ID[id];
      return `<button type="button" class="nw-tag nw-tone-${t.tone}" data-topic="${A.escapeAttr(id)}">${A.escapeText(t.label)}</button>`;
    }).join('');
  }

  function titleHtml(a) {
    const t = A.escapeText(a.title);
    return a.url
      ? `<a href="${A.escapeAttr(a.url)}" target="_blank" rel="noopener noreferrer">${t}</a>`
      : `<span>${t}</span>`;
  }

  function metaHtml(a) {
    const fresh = a.ts && Date.now() - a.ts < 3600e3;
    return `<div class="nw-meta">
      <span class="nw-src">${A.escapeText(a.source)}</span>
      ${a.ts ? `<span class="nw-time${fresh ? ' is-fresh' : ''}" data-ts="${a.ts}" title="${A.escapeAttr(absTime(a.ts))}">${A.escapeText(relTime(a.ts))}</span>` : ''}
      ${a.isNew ? '<span class="nw-new">New</span>' : ''}
    </div>`;
  }

  function tagsRow(a, maxCountries) {
    const c = countryChips(a, maxCountries), t = topicTags(a);
    return (c || t) ? `<div class="nw-tags">${c}${t}</div>` : '';
  }

  function trunc(s, n) { return s.length > n ? s.slice(0, n).replace(/\s+\S*$/, '') + '…' : s; }

  function feedHtml(list) {
    if (!list.length) {
      return `<div class="panel nw-empty">
        <div class="nw-empty__title">No headlines match these filters</div>
        <div class="nw-empty__sub">Try a different topic or country, or clear the search.</div>
        <button type="button" class="sec-head__tab" data-act="clear">Clear filters</button>
      </div>`;
    }
    const [lead, ...rest] = list;
    const seconds = rest.slice(0, 2);
    const others = rest.slice(2, S.limit);
    const hidden = rest.length - 2 - others.length;
    return `
      <article class="panel nw-lead">
        ${metaHtml(lead)}
        <h2 class="nw-lead__title">${titleHtml(lead)}</h2>
        ${lead.desc ? `<p class="nw-lead__desc">${A.escapeText(trunc(lead.desc, 240))}</p>` : ''}
        ${tagsRow(lead, 4)}
      </article>
      ${seconds.length ? `<div class="nw-second">${seconds.map(a => `
        <article class="panel nw-card">
          ${metaHtml(a)}
          <h3 class="nw-card__title">${titleHtml(a)}</h3>
          ${a.desc ? `<p class="nw-card__desc">${A.escapeText(trunc(a.desc, 140))}</p>` : ''}
          ${tagsRow(a, 3)}
        </article>`).join('')}</div>` : ''}
      ${others.length ? `<div class="panel nw-list">${others.map(a => `
        <article class="nw-row">
          ${metaHtml(a)}
          <div class="nw-row__title">${titleHtml(a)}</div>
          ${tagsRow(a, 3)}
        </article>`).join('')}</div>` : ''}
      ${hidden > 0 ? `<button type="button" class="sec-head__tab nw-more" data-act="more">Show ${Math.min(hidden, 20)} more of ${hidden}</button>` : ''}`;
  }

  function chipsHtml() {
    const f = S.filter;
    const topicCounts = new Map(tally(S.articles, 'topics'));
    const sources = tally(S.articles.map(a => ({ s: [a.source] })), 's');
    const topicBtns = TOPICS.filter(t => topicCounts.get(t.id)).map(t => `
      <button type="button" class="sec-head__tab nw-chip${f.topic === t.id ? ' active' : ''}" data-topic="${t.id}" aria-pressed="${f.topic === t.id}">
        <span class="nw-dot nw-tone-${t.tone}"></span>${A.escapeText(t.label)}<span class="nw-chip__n">${topicCounts.get(t.id)}</span>
      </button>`).join('');
    const srcBtns = sources.map(([s, n]) => `
      <button type="button" class="sec-head__tab nw-chip${f.source === s ? ' active' : ''}" data-source="${A.escapeAttr(s)}" aria-pressed="${f.source === s}">
        ${A.escapeText(s)}<span class="nw-chip__n">${n}</span>
      </button>`).join('');
    return `
      <div class="nw-chiprow"><span class="nw-chiprow__label">Topic</span>${topicBtns || '<span class="nw-muted">—</span>'}</div>
      <div class="nw-chiprow"><span class="nw-chiprow__label">Source</span>${srcBtns}</div>`;
  }

  function activeHtml(count) {
    const f = S.filter;
    const parts = [];
    if (f.country) { const c = countryOf(f.country); parts.push(`<button type="button" class="nw-active" data-country="${A.escapeAttr(f.country)}">${A.escapeText(c ? c.flag + ' ' + c.name : f.country)} ×</button>`); }
    if (f.topic) parts.push(`<button type="button" class="nw-active" data-topic="${A.escapeAttr(f.topic)}">${A.escapeText(TOPIC_BY_ID[f.topic].label)} ×</button>`);
    if (f.source) parts.push(`<button type="button" class="nw-active" data-source="${A.escapeAttr(f.source)}">${A.escapeText(f.source)} ×</button>`);
    if (f.q.trim()) parts.push(`<button type="button" class="nw-active" data-act="clear-q">“${A.escapeText(f.q.trim())}” ×</button>`);
    return `<span class="nw-resultcount"><b>${count}</b> of ${S.articles.length} headlines</span>` +
      (parts.length ? parts.join('') + `<button type="button" class="nw-clear" data-act="clear">Clear all</button>` : '');
  }

  function pulseHtml() {
    const countries = tally(S.articles, 'countries').slice(0, 8);
    const topics = tally(S.articles, 'topics');
    const maxC = countries.length ? countries[0][1] : 1;
    const maxT = topics.length ? topics[0][1] : 1;
    const freshCount = S.articles.filter(a => a.ts && Date.now() - a.ts < 3 * 3600e3).length;
    const cRows = countries.map(([iso3, n]) => {
      const c = countryOf(iso3); if (!c) return '';
      const on = S.filter.country === iso3;
      return `<button type="button" class="nw-bar${on ? ' active' : ''}" data-country="${A.escapeAttr(iso3)}" aria-pressed="${on}">
        <span class="nw-bar__label"><span aria-hidden="true">${A.escapeText(c.flag)}</span> ${A.escapeText(c.name)}</span>
        <span class="nw-bar__track"><span class="nw-bar__fill" style="width:${Math.round(n / maxC * 100)}%"></span></span>
        <span class="nw-bar__n">${n}</span>
      </button>`;
    }).join('');
    const tRows = topics.map(([id, n]) => {
      const t = TOPIC_BY_ID[id]; const on = S.filter.topic === id;
      return `<button type="button" class="nw-bar${on ? ' active' : ''}" data-topic="${A.escapeAttr(id)}" aria-pressed="${on}">
        <span class="nw-bar__label"><span class="nw-dot nw-tone-${t.tone}"></span>${A.escapeText(t.label)}</span>
        <span class="nw-bar__track"><span class="nw-bar__fill nw-fill-${t.tone}" style="width:${Math.round(n / maxT * 100)}%"></span></span>
        <span class="nw-bar__n">${n}</span>
      </button>`;
    }).join('');
    return `
      <div class="panel nw-pulse">
        <div class="panel__head"><div class="panel__title">Most mentioned this cycle</div></div>
        <div class="panel__body">
          <div class="nw-stats">
            <div><span class="nw-stats__n">${S.articles.length}</span><span class="nw-stats__l">headlines</span></div>
            <div><span class="nw-stats__n">${freshCount}</span><span class="nw-stats__l">last 3 h</span></div>
            <div><span class="nw-stats__n">${new Set(S.articles.flatMap(a => a.countries)).size}</span><span class="nw-stats__l">G20 members</span></div>
          </div>
          <div class="nw-pulse__h">Countries <span class="nw-muted">· click to filter</span></div>
          ${cRows || '<div class="nw-muted">No G20 members mentioned.</div>'}
          <div class="nw-pulse__h">Topics</div>
          ${tRows || '<div class="nw-muted">No topics detected.</div>'}
        </div>
      </div>`;
  }

  function statusHtml() {
    if (S.loading) return `<span class="nw-live is-loading"><span class="nw-live__dot"></span>Refreshing…</span>`;
    if (!S.updatedAt) return '';
    const left = Math.max(0, Math.round((S.nextAt - Date.now()) / 1000));
    const mm = Math.floor(left / 60), ss = String(left % 60).padStart(2, '0');
    const err = S.status === 'error' ? `<span class="nw-live__err" title="${A.escapeAttr(S.lastError || '')}">refresh failed</span> · ` : '';
    return `<span class="nw-live${S.status === 'error' ? ' is-error' : ''}"><span class="nw-live__dot"></span>` +
      `${err}Updated ${hhmm(S.updatedAt)} · next in <span class="num">${mm}:${ss}</span></span>`;
  }

  // ── Mount / update ────────────────────────────────────────────────────────
  function el(id) { return S.root && S.root.querySelector('#' + id); }

  function renderShell() {
    S.root.innerHTML = `
      <div class="page-body nw-page">
        <div class="sec-head">
          <div class="sec-head__title">News <span class="count" id="nw-count"></span><span class="sec-head__sub">live global-economy wire · tagged by G20 member and topic</span></div>
          <div class="sec-head__actions">
            <span id="nw-status" aria-live="polite"></span>
            <button type="button" class="sec-head__tab nw-refresh" data-act="refresh" aria-label="Refresh headlines">↻ Refresh</button>
          </div>
        </div>
        <div id="nw-body">
          <div class="loading-spinner"><div class="spinner"></div><span>Fetching headlines…</span></div>
        </div>
      </div>`;
  }

  function renderBody() {
    const body = el('nw-body');
    if (!body) return;
    if (!S.articles.length) {
      body.innerHTML = S.status === 'error'
        ? `<div class="panel nw-empty"><div class="nw-empty__title">Couldn’t load headlines</div>
             <div class="nw-empty__sub">${A.escapeText(S.lastError || 'The news feed is unavailable right now.')}</div>
             <button type="button" class="sec-head__tab" data-act="refresh">Try again</button></div>`
        : `<div class="panel nw-empty"><div class="nw-empty__title">No headlines right now</div>
             <div class="nw-empty__sub">The feeds returned nothing. We’ll check again automatically.</div></div>`;
      return;
    }
    if (!el('nw-feed')) {
      body.innerHTML = `
        <div class="nw-toolbar">
          <label class="nw-search">
            <span class="nw-search__icon" aria-hidden="true">⌕</span>
            <input id="nw-q" type="search" placeholder="Search headlines, e.g. tariffs, Fed, China…" autocomplete="off" aria-label="Search headlines">
          </label>
          <div id="nw-chips" class="nw-chips"></div>
        </div>
        <div id="nw-active" class="nw-activebar"></div>
        <div class="nw-grid">
          <div id="nw-feed" class="nw-feed"></div>
          <aside id="nw-pulse" class="nw-aside"></aside>
        </div>`;
      const q = el('nw-q');
      q.value = S.filter.q;
      q.addEventListener('input', () => { S.filter.q = q.value; S.limit = 18; renderFiltered(); });
    }
    el('nw-chips').innerHTML = chipsHtml();
    el('nw-pulse').innerHTML = pulseHtml();
    renderFiltered();
  }

  function renderFiltered() {
    const list = applyFilters();
    el('nw-feed').innerHTML = feedHtml(list);
    el('nw-active').innerHTML = activeHtml(list.length);
    const cnt = el('nw-count');
    if (cnt) cnt.textContent = `/ ${S.articles.length}`;
  }

  function rerenderAfterFilter() {
    el('nw-chips') && (el('nw-chips').innerHTML = chipsHtml());
    el('nw-pulse') && (el('nw-pulse').innerHTML = pulseHtml());
    const q = el('nw-q'); if (q && q.value !== S.filter.q) q.value = S.filter.q;
    renderFiltered();
  }

  function renderStatus() {
    const s = el('nw-status');
    if (s) s.innerHTML = statusHtml();
  }

  async function load() {
    if (S.loading) return;
    S.loading = true;
    renderStatus();
    try {
      const r = await fetch('/api/news', { cache: 'no-store' });
      if (!r.ok) throw new Error(`Feed returned HTTP ${r.status}`);
      const data = await r.json();
      const raw = Array.isArray(data && data.articles) ? data.articles : [];
      const next = raw.map(enrich).filter(a => a.title);
      if (S.seen) next.forEach(a => { a.isNew = !S.seen.has(a.key); });
      S.seen = new Set(next.map(a => a.key));
      S.articles = next;
      S.status = 'ok';
      S.lastError = null;
      S.updatedAt = Date.now();
      // Drop filters that no longer match anything (stale source/country)
      if (S.filter.source && !next.some(a => a.source === S.filter.source)) S.filter.source = null;
    } catch (e) {
      S.status = 'error';
      S.lastError = e && e.message ? e.message : String(e);
    } finally {
      S.loading = false;
      S.nextAt = Date.now() + REFRESH_MS;
      if (!S.root || !S.root.isConnected) return;
      renderBody();
      renderStatus();
    }
  }

  function stop() {
    if (S.timer) clearInterval(S.timer);
    S.timer = null;
  }

  function tick() {
    // Self-teardown when the user navigates away from the News page.
    if (!S.root || !S.root.isConnected || !S.root.querySelector('.nw-page')) { stop(); return; }
    renderStatus();
    S.root.querySelectorAll('.nw-time[data-ts]').forEach(n => {
      const ts = +n.dataset.ts;
      const txt = relTime(ts);
      if (n.textContent !== txt) n.textContent = txt;
      n.classList.toggle('is-fresh', Date.now() - ts < 3600e3);
    });
    if (!S.loading && S.nextAt && Date.now() >= S.nextAt && !document.hidden) load();
  }

  function onClick(e) {
    const t = e.target.closest('[data-nav],[data-topic],[data-country],[data-source],[data-act]');
    if (!t || !S.root.contains(t)) return;
    const d = t.dataset;
    if (d.nav) { e.preventDefault(); global.navTo && global.navTo('country/' + d.nav); return; }
    if (d.topic) S.filter.topic = S.filter.topic === d.topic ? null : d.topic;
    else if (d.country) S.filter.country = S.filter.country === d.country ? null : d.country;
    else if (d.source) S.filter.source = S.filter.source === d.source ? null : d.source;
    else if (d.act === 'refresh') { load(); return; }
    else if (d.act === 'clear') S.filter = { topic: null, country: null, source: null, q: '' };
    else if (d.act === 'clear-q') S.filter.q = '';
    else if (d.act === 'more') { S.limit += 20; renderFiltered(); return; }
    else return;
    S.limit = 18;
    rerenderAfterFilter();
  }

  function renderNewsPage(root) {
    stop();
    S.root = root;
    renderShell();
    // Listener lives on the page element so it disappears with the page.
    root.querySelector('.nw-page').addEventListener('click', onClick);
    // Reuse cached data for an instant paint when returning to the page.
    if (S.articles.length) { renderBody(); renderStatus(); }
    const stale = !S.updatedAt || Date.now() - S.updatedAt > 60 * 1000;
    if (stale) load();
    S.timer = setInterval(tick, TICK_MS);
  }

  global.renderNewsPage = renderNewsPage;
})(window);
