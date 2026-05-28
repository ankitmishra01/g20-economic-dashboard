// News view — renders full news grid from /api/news.

async function renderNewsPage(root) {
  root.innerHTML = `
    <div class="page-head hc-enter">
      <div class="page-head__eyebrow">Economic News</div>
      <h1 class="page-head__title">Global Economy News</h1>
      <p class="page-head__lede">Latest headlines from BBC Business, Reuters, FT, and the IMF.</p>
    </div>
    <div class="loading-spinner"><div class="spinner"></div><span>Fetching headlines…</span></div>
  `;

  try {
    const r = await fetch('/api/news');
    const { articles = [] } = await r.json();

    if (!articles.length) {
      root.querySelector('.loading-spinner').outerHTML = '<div class="error-state">No articles available.</div>';
      return;
    }

    // Build source filter pills
    const sources = ['All', ...new Set(articles.map(a => a.source))];
    let activeSource = 'All';

    function renderGrid(src) {
      const filtered = src === 'All' ? articles : articles.filter(a => a.source === src);
      return filtered.map(a => {
        const date = a.pubDate ? new Date(a.pubDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
        return `
          <div class="news-card hc-enter">
            <div class="news-card__source">${A.escapeText(a.source)}</div>
            <div class="news-card__title">
              <a href="${A.escapeAttr(a.link)}" target="_blank" rel="noopener noreferrer">
                ${A.escapeText(a.title)}
              </a>
            </div>
            ${a.description ? `<div class="news-card__desc">${A.escapeText(a.description)}</div>` : ''}
            ${date ? `<div class="news-card__date">${date}</div>` : ''}
          </div>
        `;
      }).join('');
    }

    const pillsHtml = sources.map(s => `
      <button class="picker-pill ${s === 'All' ? 'selected' : ''}"
        onclick="newsFilterBy('${A.escapeAttr(s)}', this)">
        ${A.escapeText(s)}
      </button>
    `).join('');

    root.innerHTML = `
      <div class="page-head hc-enter">
        <div class="page-head__eyebrow">Economic News</div>
        <h1 class="page-head__title">Global Economy News</h1>
        <p class="page-head__lede">Latest headlines from BBC Business, Reuters, FT, and the IMF.</p>
      </div>
      <div class="country-picker hc-enter" id="news-filter-pills">${pillsHtml}</div>
      <div class="news-grid" id="news-grid-content">${renderGrid('All')}</div>
    `;

    window.newsFilterBy = function (source, btn) {
      document.querySelectorAll('#news-filter-pills .picker-pill').forEach(el => el.classList.remove('selected'));
      btn.classList.add('selected');
      document.getElementById('news-grid-content').innerHTML = renderGrid(source);
      setTimeout(() => Motion.initScrollAnimations(), 50);
    };

    setTimeout(() => Motion.initScrollAnimations(), 50);
  } catch (e) {
    root.innerHTML = `<div class="error-state">Failed to load news: ${A.escapeText(e.message)}</div>`;
  }
}
