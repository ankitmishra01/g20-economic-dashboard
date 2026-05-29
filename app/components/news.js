// News view — Direction B design

async function renderNewsPage(root) {
  root.innerHTML = `
    <div class="page-body">
      <div class="sec-head">
        <div class="sec-head__title">News<span class="sec-head__sub">global economy headlines</span></div>
      </div>
      <div class="loading-spinner"><div class="spinner"></div><span>Fetching headlines…</span></div>
    </div>`;

  try {
    const r = await fetch('/api/news');
    const { articles = [] } = await r.json();

    if (!articles.length) {
      root.innerHTML = `<div class="page-body"><div class="loading-spinner"><span>No articles available.</span></div></div>`;
      return;
    }

    const sources = ['All', ...new Set(articles.map(a => a.source))];

    function renderList(src) {
      const filtered = src === 'All' ? articles : articles.filter(a => a.source === src);
      return `<div class="panel news-list">` + filtered.map(a => {
        const date = a.pubDate
          ? new Date(a.pubDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
          : '';
        return `
          <div class="news-item">
            <div class="news-item__source">${A.escapeText(a.source)}</div>
            <div class="news-item__body">
              <div class="news-item__title">
                <a href="${A.escapeAttr(a.link)}" target="_blank" rel="noopener noreferrer">
                  ${A.escapeText(a.title)}
                </a>
              </div>
              ${a.description ? `<div class="news-item__meta">${A.escapeText(a.description.slice(0, 120))}${a.description.length > 120 ? '…' : ''}</div>` : ''}
              ${date ? `<div class="news-item__meta" style="margin-top:4px">${date}</div>` : ''}
            </div>
          </div>`;
      }).join('') + `</div>`;
    }

    const pillsHtml = sources.map(s => `
      <button class="sec-head__tab ${s === 'All' ? 'active' : ''}"
        onclick="newsFilterBy('${A.escapeAttr(s)}', this)">
        ${A.escapeText(s)}
      </button>
    `).join('');

    root.innerHTML = `
      <div class="page-body">
        <div class="sec-head">
          <div class="sec-head__title">News <span class="count">/ ${articles.length}</span><span class="sec-head__sub">global economy headlines</span></div>
          <div class="sec-head__actions" id="news-filter-pills">${pillsHtml}</div>
        </div>
        <div id="news-list-content">${renderList('All')}</div>
      </div>`;

    window.newsFilterBy = function (source, btn) {
      document.querySelectorAll('#news-filter-pills .sec-head__tab').forEach(el => el.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('news-list-content').innerHTML = renderList(source);
    };
  } catch (e) {
    root.innerHTML = `<div class="page-body"><div class="loading-spinner"><span>Failed to load news: ${A.escapeText(e.message)}</span></div></div>`;
  }
}
