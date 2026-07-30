// Orchestration: routing, nav, data loading, agent drawer, news strip.

(function () {
  let _currentPage = 'overview';
  let _dataLoaded = false;

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
    setInterval(updateLiveClock, 60000);

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

    try {
      await window.G20Data.loadAllData();
      _dataLoaded = true;
      document.getElementById('data-status').textContent = 'read-only · live';

      // Update period label from actual data
      const gdpRank = window.G20Data.getRanking('GDP');
      if (gdpRank[0]?.year) {
        document.getElementById('rail-period').textContent = `Q4·${gdpRank[0].year}`;
      }
    } catch (e) {
      document.getElementById('data-status').textContent = 'data error';
      console.error('Data load failed:', e);
    }

    // Route to page from URL hash, default overview.
    const hash = location.hash.replace('#', '') || 'overview';
    navTo(hash.startsWith('country/') ? hash : (NAV_ITEMS.find(n => n.id === hash) ? hash : 'overview'));

    window.addEventListener('hashchange', () => {
      const h = location.hash.replace('#', '');
      if (h) navTo(h);
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
      const shortcuts = { 'o': 'overview', 'c': 'countries', 'r': 'prosperity', 'a': 'ai-economy', 'p': 'compare', 'f': 'flags', 'n': 'news' };
      const target = shortcuts[e.key.toLowerCase()];
      if (target) navTo(target);
    });

    loadNewsStrip();
  });

  function updateLiveClock() {
    const el = document.getElementById('live-time');
    if (!el) return;
    const now = new Date();
    const hh = String(now.getUTCHours()).padStart(2, '0');
    const mm = String(now.getUTCMinutes()).padStart(2, '0');
    el.textContent = `Live · ${hh}:${mm} UTC`;
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
      sparkles: '<path d="M8 1l1.5 4L14 6.5 9.5 8 8 12 6.5 8 2 6.5 6.5 5z"/><path d="M13 1l.8 2 2 .8-2 .8L13 7l-.8-2.4-2-.8 2-.8z"/>',
    };
    return icons[icon] || icons.home;
  }

  // ── Navigation ────────────────────────────────────────────────────────────
  window.navTo = function navTo(page) {
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
      root.innerHTML = `<div class="loading-spinner"><div class="spinner"></div><span>Loading data…</span></div>`;
      return;
    }

    if (isCountry) {
      const iso3 = page.split('/')[1];
      root.innerHTML = renderCountryProfile(iso3);
    } else {
      switch (page) {
        case 'overview':    root.innerHTML = renderOverview();     break;
        case 'countries':   root.innerHTML = renderCountries();   break;
        case 'prosperity':  root.innerHTML = renderProsperity();  break;
        case 'ai-economy':  root.innerHTML = renderAIEconomy();   break;
        case 'compare':     root.innerHTML = renderCompare();     break;
        case 'flags':       root.innerHTML = renderFlags();       break;
        case 'news':        renderNewsPage(root);                 break;
        default:            root.innerHTML = renderOverview();
      }
    }

    root.scrollTop = 0;
    window.scrollTo(0, 0);

    // Mount charts after DOM is ready
    setTimeout(() => mountPageCharts(page), 100);
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

    // Try local insight engine first (no API key required)
    const localInsight = window.generateLocalInsight?.(question);
    if (localInsight) {
      document.getElementById(loadingId)?.remove();
      body.innerHTML += `
        <div class="agent-msg">
          <div class="agent-msg-label">Data Engine · G20</div>
          <div class="agent-msg-text">${localInsight}</div>
        </div>
      `;
      sendBtn.disabled = false;
      body.scrollTop = body.scrollHeight;
      return;
    }

    // Fall back to Claude API
    try {
      // Use country-enriched context (with news + projections) when on a country page
      const hash = location.hash.replace('#', '');
      const activeIso3 = hash.startsWith('country/') ? hash.split('/')[1] : null;
      const context = window.G20Data
        ? (activeIso3 ? window.G20Data.buildCountryContext(activeIso3) : window.G20Data.buildAgentContext())
        : '';
      const r = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, context }),
      });
      const data = await r.json();
      document.getElementById(loadingId)?.remove();

      if (data.error && data.error.includes('API key')) {
        body.innerHTML += `
          <div class="agent-msg">
            <div class="agent-msg-label">Data Engine</div>
            <div class="agent-msg-text">No AI API key is configured on this server. The data engine can answer questions about specific countries, rankings, fiscal health, growth trends, inflation, trade, and regional comparisons — try one of the suggested questions below, or ask about any G20 economy by name.</div>
          </div>
        `;
      } else {
        body.innerHTML += `
          <div class="agent-msg">
            <div class="agent-msg-label">AI Analyst</div>
            <div class="agent-msg-text">${A.escapeText(data.text || data.error || 'No response')}</div>
          </div>
        `;
      }
    } catch (e) {
      document.getElementById(loadingId)?.remove();
      body.innerHTML += `
        <div class="agent-msg">
          <div class="agent-msg-label">Data Engine</div>
          <div class="agent-msg-text">Could not reach the AI endpoint — but I can still answer data-driven questions from the live G20 dataset. Try asking about a specific country, ranking, or economic indicator.</div>
        </div>
      `;
    }

    sendBtn.disabled = false;
    body.scrollTop = body.scrollHeight;
  };

  // ── Chart mounting (deferred so canvas is in DOM) ─────────────────────────
  function mountPageCharts(page) {
    if (page === 'overview')    mountOverviewCharts();
    if (page === 'prosperity')  mountProsperityChart();
    if (page === 'ai-economy')  mountAIEconomyCharts();
    if (page === 'compare')     mountCompareCharts();
    if (page.startsWith('country/')) {
      const iso3 = page.split('/')[1];
      window.mountCountryProfileCharts(iso3);
      if (window.mountAIOutlookCard) window.mountAIOutlookCard(iso3);
    }
  }
})();
