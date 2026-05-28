// Orchestration: routing, nav, data loading, agent drawer, news ticker.

(function () {
  let _currentPage = 'overview';
  let _dataLoaded = false;

  // ── Boot ──────────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', async () => {
    renderSidebar();
    loadNewsTicker();

    try {
      await window.G20Data.loadAllData();
      _dataLoaded = true;
      document.getElementById('data-status').textContent = 'Live data loaded';
    } catch (e) {
      document.getElementById('data-status').textContent = 'Data load failed';
      console.error('Data load failed:', e);
    }

    // Route to page from URL hash, default overview.
    const hash = location.hash.replace('#', '') || 'overview';
    navTo(hash.startsWith('country/') ? hash : (NAV_ITEMS.find(n => n.id === hash) ? hash : 'overview'));

    window.addEventListener('hashchange', () => {
      const h = location.hash.replace('#', '');
      if (h) navTo(h);
    });

    Motion.initScrollAnimations();
    Motion.initCounters();
  });

  // ── Sidebar ───────────────────────────────────────────────────────────────
  function renderSidebar() {
    const nav = document.getElementById('sidebar-nav');
    nav.innerHTML = NAV_ITEMS.map(item => `
      <div class="sidebar-item ${item.id === _currentPage ? 'active' : ''}"
           data-page="${item.id}" onclick="navTo('${item.id}')">
        <span class="nav-icon">${A.icon(item.icon, 15)}</span>
        <span class="nav-label">${item.label}</span>
      </div>
    `).join('');
  }

  // ── Navigation ────────────────────────────────────────────────────────────
  window.navTo = function navTo(page) {
    const isCountry = page.startsWith('country/');
    const navPage = isCountry ? null : page;

    // Update sidebar active state
    document.querySelectorAll('.sidebar-item').forEach(el => {
      el.classList.toggle('active', el.dataset.page === navPage);
    });

    // Update topbar breadcrumb
    const label = isCountry
      ? (G20.find(c => c.iso3 === page.split('/')[1])?.name || page.split('/')[1])
      : (NAV_ITEMS.find(n => n.id === page)?.label || page);
    document.getElementById('topbar-page').textContent = label;

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

    // Re-init scroll animations for freshly rendered elements
    setTimeout(() => {
      Motion.initScrollAnimations();
      Motion.initCounters();
    }, 50);

    // Mount any charts in the new view
    setTimeout(() => mountPageCharts(page), 100);

    root.scrollTop = 0;
    window.scrollTo(0, 0);
  };

  // ── News ticker ───────────────────────────────────────────────────────────
  async function loadNewsTicker() {
    try {
      const r = await fetch('/api/news');
      const { articles = [] } = await r.json();
      const track = document.getElementById('news-ticker-track');
      if (!articles.length) { track.innerHTML = ''; return; }

      const items = articles.slice(0, 20).map(a => `
        <span class="news-ticker-item">
          <span class="news-ticker-source">${A.escapeText(a.source)}</span>
          <a href="${A.escapeAttr(a.link)}" target="_blank" rel="noopener noreferrer">
            ${A.escapeText(a.title)}
          </a>
        </span>
        <span class="news-ticker-sep">·</span>
      `).join('');
      // Duplicate for seamless looping
      track.innerHTML = items + items;
    } catch (e) {
      console.warn('News ticker failed:', e);
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

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const drawer = document.getElementById('agent-drawer');
      if (drawer.classList.contains('open')) window.toggleAgentDrawer();
    }
  });

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

    // User message
    body.innerHTML += `
      <div class="agent-msg user">
        <div class="agent-msg-label">You</div>
        <div class="agent-msg-text">${A.escapeText(question)}</div>
      </div>
    `;

    // Loading
    const loadingId = 'loading-' + Date.now();
    body.innerHTML += `
      <div class="agent-msg loading" id="${loadingId}">
        <div class="agent-msg-label">AI Analyst</div>
        <div class="agent-msg-text">Analysing data…</div>
      </div>
    `;
    body.scrollTop = body.scrollHeight;

    try {
      const context = window.G20Data ? window.G20Data.buildAgentContext() : '';
      const r = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, context }),
      });
      const { text, error } = await r.json();

      document.getElementById(loadingId)?.remove();
      body.innerHTML += `
        <div class="agent-msg">
          <div class="agent-msg-label">AI Analyst</div>
          <div class="agent-msg-text">${A.escapeText(text || error || 'No response')}</div>
        </div>
      `;
    } catch (e) {
      document.getElementById(loadingId)?.remove();
      body.innerHTML += `
        <div class="agent-msg">
          <div class="agent-msg-label">AI Analyst</div>
          <div class="agent-msg-text">Error: ${A.escapeText(e.message)}</div>
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
