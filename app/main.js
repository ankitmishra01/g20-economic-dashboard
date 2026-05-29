// Orchestration: routing, nav, data loading, agent drawer, news strip.

(function () {
  let _currentPage = 'overview';
  let _dataLoaded = false;

  // ── Boot ──────────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', async () => {
    renderRail();
    updateLiveClock();
    setInterval(updateLiveClock, 60000);

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
      const shortcuts = { 'o': 'overview', 'c': 'countries', 'p': 'compare', 'f': 'flags', 'n': 'news' };
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
      home:   '<rect x="2" y="2" width="5" height="6" rx="0.6"/><rect x="9" y="2" width="5" height="9" rx="0.6"/><rect x="2" y="10" width="5" height="4" rx="0.6"/><rect x="9" y="13" width="5" height="1" rx="0.5"/>',
      users:  '<circle cx="8" cy="8" r="6"/><path d="M2 8h12M8 2c2 2 2 10 0 12M8 2c-2 2-2 10 0 12"/>',
      chart:  '<path d="M3 13V5l3-2v10M9 13V3l3 2v8M2 13h12"/>',
      flag:   '<path d="M3 14V3l8 2v5l-8-2"/>',
      inbox:  '<rect x="2" y="3" width="12" height="10" rx="1"/><path d="M2 6h12M5 9h6M5 11h4"/>',
    };
    return icons[icon] || icons.home;
  }

  // ── Navigation ────────────────────────────────────────────────────────────
  window.navTo = function navTo(page) {
    const isCountry = page.startsWith('country/');
    const navPage = isCountry ? null : page;

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
        case 'overview':  root.innerHTML = renderOverview();  break;
        case 'countries': root.innerHTML = renderCountries(); break;
        case 'compare':   root.innerHTML = renderCompare();   break;
        case 'flags':     root.innerHTML = renderFlags();     break;
        case 'news':      renderNewsPage(root);               break;
        default:          root.innerHTML = renderOverview();
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
      const context = window.G20Data ? window.G20Data.buildAgentContext() : '';
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
    if (page === 'overview') mountOverviewCharts();
    if (page === 'compare')  mountCompareCharts();
    if (page.startsWith('country/')) window.mountCountryProfileCharts(page.split('/')[1]);
  }
})();
