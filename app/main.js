// Orchestration: routing, nav, data loading, agent drawer, news strip.

(function () {
  let _currentPage = 'overview';
  let _dataLoaded = false;
  let _dataFailed = false;

  // ── Dark mode ──────────────────────────────────────────────────────────────
  window.toggleDarkMode = function () {
    const html = document.getElementById('html-root');
    const isDark = html.getAttribute('data-theme') === 'dark';
    if (isDark) {
      html.removeAttribute('data-theme');
      localStorage.removeItem('g20-theme');
    } else {
      html.setAttribute('data-theme', 'dark');
      localStorage.setItem('g20-theme', 'dark');
    }
    remountChartsForTheme();
  };

  // Chart.js option colors are read once at chart-creation time, so a CSS-only
  // theme flip doesn't touch already-mounted charts — remount whatever's on
  // screen so they pick up the new tokens. Uses location.hash directly
  // (rather than _currentPage) since _currentPage is only updated for
  // non-country pages. Deliberately skips mountAIOutlookCard: it's an HTML
  // card, not a canvas, and re-invoking it on every toggle would be pointless
  // extra work for a widget that doesn't need to re-render for theme.
  //
  // Wrapped in requestAnimationFrame: creating a Chart.js instance in the same
  // tick as the data-theme attribute flip measures the canvas before the
  // browser has settled the new theme's layout/paint, which produces a chart
  // that reports correct dimensions but never actually paints a first frame
  // (confirmed via canvas pixel sampling — a manual .update() after the fact
  // does draw correctly). Deferring one frame gives layout time to settle.
  function remountChartsForTheme() {
    if (!_dataLoaded) return;
    requestAnimationFrame(() => {
      // Skip the entrance animation on a theme-triggered remount — the data
      // isn't changing, only the colors, so animating bubbles/bars in from
      // zero on every toggle just adds a flash of an empty chart for no
      // benefit (also sidesteps relying on a run of animation frames landing
      // correctly right as the browser is mid-repaint from the theme flip).
      const prevAnimation = window.Chart ? Chart.defaults.animation : undefined;
      if (window.Chart) Chart.defaults.animation = false;
      const page = location.hash.replace('#', '') || 'overview';
      if (page.startsWith('country/')) {
        window.mountCountryProfileCharts(page.split('/')[1]);
      } else {
        mountPageCharts(page);
      }
      // mountAIEconomyCharts is async (awaits cached trajectory data before
      // creating its charts), so restoring on the next microtask would win
      // the race against its chart creation. A short timeout is well clear
      // of that either way.
      if (window.Chart) setTimeout(() => { Chart.defaults.animation = prevAnimation; }, 50);

      // A freshly (re)created Chart.js instance sometimes reports the right
      // canvas size but skips its first real paint — confirmed by sampling
      // canvas pixel data: content was correct, it just never made it to
      // screen until something nudged a resize. Dispatching `resize` one more
      // frame later reliably forces that repaint.
      requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
    });
  }

  // ── Mobile menu ────────────────────────────────────────────────────────────
  window.toggleMobileMenu = function () {
    const rail = document.getElementById('rail');
    const backdrop = document.getElementById('rail-backdrop');
    const isOpen = rail.classList.toggle('open');
    backdrop.classList.toggle('open', isOpen);
  };

  // ── Boot ──────────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', async () => {
    renderRail();
    updateLiveClock();
    loadRefreshStamp();

    // Show skeleton while data loads
    const root = document.getElementById('page-root');
    root.innerHTML = `
      <div style="padding:24px">
        <div class="skel skel-hero"></div>
        <div class="skel-row">
          <div class="skel skel-tile"></div>
          <div class="skel skel-tile"></div>
          <div class="skel skel-tile"></div>
          <div class="skel skel-tile"></div>
          <div class="skel skel-tile"></div>
        </div>
        <div class="skel skel-panel"></div>
        <div class="skel skel-panel" style="height:200px"></div>
      </div>`;

    // OECD total growth (static file refreshed with the data); optional, never blocks the app
    fetch('oecd-aggregate.json').then(r => r.ok ? r.json() : null).then(j => { if (j) window.OECD_AGG = j; }).catch(() => {});

    try {
      await window.G20Data.loadAllData();
      _dataLoaded = true;
      document.getElementById('data-status').textContent = window.G20_SNAPSHOT_AT ? 'offline snapshot' : 'read-only · live';

      // Update period label from actual data
      const gdpRank = window.G20Data.getRanking('GDP');
      if (gdpRank[0]?.year) {
        document.getElementById('rail-period').textContent = `${gdpRank[0].year}`;
      }
    } catch (e) {
      _dataFailed = true;
      document.getElementById('data-status').textContent = 'data error';
      console.error('Data load failed:', e);
    }

    // Route to page from URL hash, default overview.
    const hash = location.hash.replace('#', '') || 'overview';
    navTo(hash.startsWith('country/') ? hash : (NAV_ITEMS.find(n => n.id === hash) ? hash : 'overview'));

    window.addEventListener('hashchange', () => {
      const h = location.hash.replace('#', '');
      if (h && h !== _lastRoute) navTo(h);
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'Escape') {
        const drawer = document.getElementById('agent-drawer');
        if (drawer.classList.contains('open')) toggleAgentDrawer();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const shortcuts = { 'o': 'overview', 'u': 'projections', 'l': 'analysis', 'c': 'countries', 'r': 'prosperity', 'a': 'ai-economy', 'p': 'compare', 'f': 'flags', 'n': 'news' };
      const target = shortcuts[e.key.toLowerCase()];
      if (target) navTo(target);
    });

    loadNewsStrip();
  });

  // Shows when the dataset was last refreshed (from /api/status), not the wall clock.
  function updateLiveClock() {
    const el = document.getElementById('live-time');
    if (!el) return;
    const iso = window._dataRefreshedAt;
    el.textContent = iso ? `Data refreshed ${iso.slice(0, 10)}` : 'Live data';
  }

  async function loadRefreshStamp() {
    try {
      const r = await fetch('/api/status', { cache: 'no-cache' });
      const d = await r.json();
      if (d && d.lastRefreshed) { window._dataRefreshedAt = d.lastRefreshed; updateLiveClock(); }
    } catch (e) { /* status is optional; keep the default label */ }
  }

  // ── Rail ──────────────────────────────────────────────────────────────────
  function renderRail() {
    const nav = document.getElementById('rail-nav');
    nav.innerHTML = NAV_ITEMS.map(item => `
      <div class="rail__item ${item.id === _currentPage ? 'active' : ''}"
           data-page="${item.id}" onclick="navTo('${item.id}')">
        <svg class="ic" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4">
          ${navIcon(item.icon)}
        </svg>
        ${item.label}
        ${item.key ? `<span class="kbd">${item.key}</span>` : ''}
      </div>
    `).join('');
  }

  function navIcon(icon) {
    const icons = {
      home:     '<rect x="2" y="2" width="5" height="6" rx="0.6"/><rect x="9" y="2" width="5" height="9" rx="0.6"/><rect x="2" y="10" width="5" height="4" rx="0.6"/><rect x="9" y="13" width="5" height="1" rx="0.5"/>',
      users:    '<circle cx="8" cy="8" r="6"/><path d="M2 8h12M8 2c2 2 2 10 0 12M8 2c-2 2-2 10 0 12"/>',
      chart:    '<path d="M3 13V5l3-2v10M9 13V3l3 2v8M2 13h12"/>',
      flag:     '<path d="M3 14V3l8 2v5l-8-2"/>',
      inbox:    '<rect x="2" y="3" width="12" height="10" rx="1"/><path d="M2 6h12M5 9h6M5 11h4"/>',
      globe:    '<circle cx="8" cy="8" r="6"/><path d="M2 8h12M8 2c0 4 2 6 0 12M8 2c0 4-2 6 0 12"/>',
      info:     '<circle cx="8" cy="8" r="6"/><path d="M8 7.5v4M8 5v.01"/>',
      sparkles: '<path d="M8 1l1.5 4L14 6.5 9.5 8 8 12 6.5 8 2 6.5 6.5 5z"/><path d="M13 1l.8 2 2 .8-2 .8L13 7l-.8-2.4-2-.8 2-.8z"/>',
    };
    return icons[icon] || icons.home;
  }

  // ── Navigation ────────────────────────────────────────────────────────────
  let _lastRoute = null;
  let _mountTimer = null;
  window.navTo = function navTo(page) {
    _lastRoute = page;
    const isCountry = page.startsWith('country/');
    const navPage = isCountry ? null : page;

    // Close mobile rail on navigation
    const rail = document.getElementById('rail');
    const backdrop = document.getElementById('rail-backdrop');
    if (rail && rail.classList.contains('open')) {
      rail.classList.remove('open');
      backdrop && backdrop.classList.remove('open');
    }

    // Update rail active state
    document.querySelectorAll('.rail__item').forEach(el => {
      el.classList.toggle('active', el.dataset.page === navPage);
    });

    // Update crumbs
    const label = isCountry
      ? (G20.find(c => c.iso3 === page.split('/')[1])?.name || page.split('/')[1])
      : (NAV_ITEMS.find(n => n.id === page)?.label || page);
    document.getElementById('crumb-page').textContent = label;

    if (!isCountry) _currentPage = page;
    location.hash = page;

    const root = document.getElementById('page-root');
    if (!_dataLoaded && page !== 'news') {
      root.innerHTML = _dataFailed
        ? `<div class="loading-spinner" style="flex-direction:column;gap:12px;text-align:center">
             <strong>Data temporarily unavailable</strong>
             <span>The live database could not be reached. This is usually brief.</span>
             <button class="ask-btn" onclick="location.reload()">Retry</button>
           </div>`
        : `<div class="loading-spinner"><div class="spinner"></div><span>Loading data…</span></div>`;
      return;
    }

    // Release the previous page's charts before their canvases are replaced
    if (window.Chart) Object.values(Chart.instances).forEach(c => c.destroy());

    if (isCountry) {
      const iso3 = page.split('/')[1];
      root.innerHTML = renderCountryProfile(iso3);
    } else {
      switch (page) {
        case 'overview':    root.innerHTML = renderOverview();     break;
        case 'projections': root.innerHTML = renderProjections();  break;
        case 'analysis':    root.innerHTML = renderAnalysis();     break;
        case 'countries':   root.innerHTML = renderCountries();   break;
        case 'prosperity':  root.innerHTML = renderProsperity();  break;
        case 'ai-economy':  root.innerHTML = renderAIEconomy();   break;
        case 'compare':     root.innerHTML = renderCompare();     break;
        case 'flags':       root.innerHTML = renderFlags();       break;
        case 'news':        renderNewsPage(root);                 break;
        case 'about':       root.innerHTML = renderAbout();       break;
        default:            root.innerHTML = renderOverview();
      }
    }

    root.scrollTop = 0;
    window.scrollTo(0, 0);

    // Mount charts after DOM is ready
    clearTimeout(_mountTimer);
    _mountTimer = setTimeout(() => mountPageCharts(page), 100);
  };

  // ── News strip ────────────────────────────────────────────────────────────
  async function loadNewsStrip() {
    try {
      const r = await fetch('/api/news');
      const { articles = [] } = await r.json();
      // Cache globally so country profiles can filter headlines by country name
      window._cachedNews = articles;
      const track = document.getElementById('news-strip-track');
      if (!articles.length) return;

      const items = articles.slice(0, 20).map(a => `
        <span class="news-strip__item">
          <span class="news-strip__src">${A.escapeText(a.source)}</span>
          <a href="${A.escapeAttr(a.link)}" target="_blank" rel="noopener noreferrer">
            ${A.escapeText(a.title)}
          </a>
        </span>
      `).join('<span style="opacity:.3;margin:0 8px">·</span>');
      // Duplicate for seamless looping
      track.innerHTML = items + items;
    } catch (e) {
      console.warn('News strip failed:', e);
    }
  }

  // ── Agent drawer ──────────────────────────────────────────────────────────
  window.toggleAgentDrawer = function () {
    const drawer = document.getElementById('agent-drawer');
    const backdrop = document.getElementById('agent-drawer-backdrop');
    const isOpen = drawer.classList.toggle('open');
    backdrop.classList.toggle('open', isOpen);
    if (isOpen) document.getElementById('agent-input').focus();
  };

  window.askSuggested = function (btn) {
    const input = document.getElementById('agent-input');
    input.value = btn.textContent.trim();
    sendAgentQuestion();
  };

  window.sendAgentQuestion = async function () {
    const input = document.getElementById('agent-input');
    const sendBtn = document.getElementById('agent-send');
    const question = input.value.trim();
    if (!question) return;

    input.value = '';
    sendBtn.disabled = true;

    const body = document.getElementById('agent-body');
    body.innerHTML += `
      <div class="agent-msg user">
        <div class="agent-msg-label">You</div>
        <div class="agent-msg-text">${A.escapeText(question)}</div>
      </div>
    `;

    const loadingId = 'loading-' + Date.now();
    body.innerHTML += `
      <div class="agent-msg loading" id="${loadingId}">
        <div class="agent-msg-label">Data Engine</div>
        <div class="agent-msg-text">Analysing G20 data…</div>
      </div>
    `;
    body.scrollTop = body.scrollHeight;

    const addMsg = (label, html) => {
      body.innerHTML += `
        <div class="agent-msg">
          <div class="agent-msg-label">${label}</div>
          <div class="agent-msg-text">${html}</div>
        </div>`;
    };
    const showLocal = (insight) => {
      document.getElementById(loadingId)?.remove();
      addMsg('Data Engine · G20', insight);
    };

    // Open-ended questions (why / what if / scenarios) go to the AI analyst first.
    // Everything else is answered by the local data engine, which needs no API key.
    const asksProjection = /\b(project(?:ed|ion)?|forecast|outlook|uncertain|range)\b/i.test(question);
    if (asksProjection && window.loadProjectionData) { try { await window.loadProjectionData(); } catch (_) {} }
    const projectionInsight = asksProjection ? window.generateProjectionInsight?.(question) : null;
    const wantsAI = /\b(why|what if|explain|spillovers?|derail|implications?|scenario|could|would|should)\b/i.test(question);
    const localInsight = projectionInsight || (wantsAI ? null : window.generateLocalInsight?.(question));
    if (localInsight) {
      showLocal(localInsight);
      sendBtn.disabled = false;
      body.scrollTop = body.scrollHeight;
      return;
    }

    // AI analyst (Gemini free tier or Claude, whichever key the server has)
    const friendlyFallback = (reason) => {
      document.getElementById(loadingId)?.remove();
      // If the AI is unavailable, still try to answer from the data engine.
      const fallback = window.generateLocalInsight?.(question);
      if (fallback) { addMsg('Data Engine · G20', fallback); return; }
      addMsg('Data Engine', `${reason} The data engine can still answer questions about specific countries, rankings, fiscal health, growth, inflation, trade and regional comparisons. Try asking about a G20 economy by name.`);
    };
    try {
      // Use country-enriched context (with news + projections) when on a country page
      const hash = location.hash.replace('#', '');
      const activeIso3 = hash.startsWith('country/') ? hash.split('/')[1] : null;
      const context = window.G20Data
        ? (activeIso3 ? window.G20Data.buildCountryContext(activeIso3) : window.G20Data.buildAgentContext())
        : '';
      const projectionContext = window.projectionContext?.(question) || '';
      const r = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, context: [context, projectionContext].filter(Boolean).join('\n\n') }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.text) {
        console.warn('AI analyst unavailable:', r.status, data.code, data.error);
        if (data.code === 'NO_AI_KEY') friendlyFallback('The AI analyst is not switched on for this deployment.');
        else if (r.status === 429) friendlyFallback('The AI analyst is busy right now (rate limit). Please try again in a minute.');
        else friendlyFallback('The AI analyst could not answer this time.');
      } else {
        document.getElementById(loadingId)?.remove();
        const modelTag = data.model ? ` · ${A.escapeText(data.model)}` : '';
        addMsg(`AI Analyst${modelTag}`, A.escapeText(data.text));
      }
    } catch (e) {
      friendlyFallback('Could not reach the AI endpoint.');
    }

    sendBtn.disabled = false;
    body.scrollTop = body.scrollHeight;
  };

  // ── Present mode: larger text and charts for screen sharing ────────────────
  function applyPresentMode(on) {
    document.documentElement.classList.toggle('present', on);
    const btn = document.getElementById('present-btn');
    if (btn) btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    try { localStorage.setItem('g20-present', on ? '1' : '0'); } catch (e) { /* storage may be blocked */ }
    window.dispatchEvent(new Event('resize')); // let Chart.js re-measure its canvases
  }
  window.togglePresentMode = function () { applyPresentMode(!document.documentElement.classList.contains('present')); };
  (function initPresentMode() {
    let on = /[?&]present\b/.test(location.search);
    try { if (!on) on = localStorage.getItem('g20-present') === '1'; } catch (e) { /* ignore */ }
    if (on) document.addEventListener('DOMContentLoaded', () => applyPresentMode(true));
  })();

  // ── Chart mounting (deferred so canvas is in DOM) ─────────────────────────
  function mountPageCharts(page) {
    if (page === 'overview')    { mountOverviewCharts(); if (window.mountProjectionSummary) window.mountProjectionSummary(); }
    if (page === 'projections') mountProjections();
    if (page === 'analysis')    mountAnalysisCharts();
    if (page === 'about' && window.mountProjectionMethodology) window.mountProjectionMethodology();
    if (page === 'prosperity')  mountProsperityChart();
    if (page === 'ai-economy')  mountAIEconomyCharts();
    if (page === 'compare')     mountCompareCharts();
    if (page.startsWith('country/')) {
      const iso3 = page.split('/')[1];
      window.mountCountryProfileCharts(iso3);
      if (window.mountProjectionSummary) window.mountProjectionSummary(iso3);
      if (window.mountAIOutlookCard) window.mountAIOutlookCard(iso3);
    }
  }
})();
