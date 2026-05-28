// Overview page — G20 aggregate stats + GDP growth ranking + top/bottom 5.

function renderOverview() {
  const ranking = window.G20Data.getRanking('GDP_GROWTH');
  const gdpRank  = window.G20Data.getRanking('GDP');
  const infRank  = window.G20Data.getRanking('INFLATION');

  // Aggregate stats
  const totalGDP = gdpRank.reduce((s, c) => s + (c.value || 0), 0);
  const avgGrowth = ranking.length
    ? ranking.reduce((s, c) => s + (c.value || 0), 0) / ranking.length
    : null;
  const avgInflation = infRank.length
    ? infRank.reduce((s, c) => s + (c.value || 0), 0) / infRank.length
    : null;
  const growingCount = ranking.filter(c => c.value > 0).length;

  const kpiYear = ranking[0]?.year || '';

  return `
    <div class="page-head hc-enter">
      <div class="page-head__eyebrow">Live Data — World Bank &amp; IMF</div>
      <h1 class="page-head__title">G20 Economic Overview</h1>
      <p class="page-head__lede">
        Real-time economic indicators for the 20 largest economies, covering ${kpiYear || 'recent years'}.
        Data refreshed daily from World Bank Open Data and IMF DataMapper.
      </p>
    </div>

    <div class="kpi-strip hc-enter">
      <div class="kpi-card">
        <div class="kpi-label">G20 Total GDP</div>
        <div class="kpi-value">${A.fmtGDP(totalGDP)}</div>
        <div class="kpi-sub">Combined output</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Avg GDP Growth</div>
        <div class="kpi-value" style="color:${avgGrowth >= 0 ? 'var(--g20-green)' : 'var(--g20-red)'}">
          ${A.fmtPct(avgGrowth)}
        </div>
        <div class="kpi-sub">${kpiYear || '—'} average</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Avg Inflation</div>
        <div class="kpi-value" style="color:${avgInflation > 4 ? 'var(--g20-amber)' : 'var(--g20-green)'}">
          ${A.fmtPct(avgInflation)}
        </div>
        <div class="kpi-sub">CPI year-on-year</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Expanding</div>
        <div class="kpi-value">${growingCount}</div>
        <div class="kpi-sub">of ${ranking.length} economies growing</div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px" class="hc-enter">
      <div class="chart-card">
        <div class="chart-card__title">GDP Growth Rate — ${kpiYear}</div>
        <div class="chart-card__sub">Annual % change, ranked by latest data</div>
        <div class="chart-wrap">
          <canvas id="overview-growth-chart"></canvas>
        </div>
      </div>
      <div class="chart-card">
        <div class="chart-card__title">Inflation Rate — ${kpiYear}</div>
        <div class="chart-card__sub">CPI annual % change</div>
        <div class="chart-wrap">
          <canvas id="overview-inflation-chart"></canvas>
        </div>
      </div>
    </div>

    <div class="section-divider hc-enter">
      <span class="section-divider-label">GDP Growth Ranking</span>
    </div>

    <div class="chart-card hc-enter" style="padding:0;overflow:hidden">
      <table class="ranking-table" id="growth-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Country</th>
            <th>GDP Growth</th>
            <th>Inflation</th>
            <th>GDP</th>
          </tr>
        </thead>
        <tbody>
          ${ranking.map((c, i) => {
            const inf  = window.G20Data.getLatest(c.iso3, 'INFLATION');
            const gdp  = window.G20Data.getLatest(c.iso3, 'GDP');
            const goodGrowth = c.value >= 2;
            const badGrowth  = c.value < 0;
            return `
              <tr onclick="navTo('country/${c.iso3}')">
                <td><span class="rank-num">${i + 1}</span></td>
                <td>
                  <div class="rank-country">
                    <span class="rank-flag">${c.flag}</span>
                    <span class="rank-name">${A.escapeText(c.name)}</span>
                  </div>
                </td>
                <td>
                  <span style="font-weight:700;color:${badGrowth ? 'var(--g20-red)' : goodGrowth ? 'var(--g20-green)' : 'var(--fg-1)'}">
                    ${A.fmtPct(c.value)}
                  </span>
                </td>
                <td>${A.fmtPct(inf?.value)}</td>
                <td>${A.fmtGDP(gdp?.value)}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function mountOverviewCharts() {
  const growthRanking = window.G20Data.getRanking('GDP_GROWTH').slice(0, 15);
  const infRanking    = window.G20Data.getRanking('INFLATION')
    .sort((a, b) => b.value - a.value).slice(0, 15);

  const growthCanvas = document.getElementById('overview-growth-chart');
  const inflCanvas   = document.getElementById('overview-inflation-chart');
  if (!growthCanvas || !inflCanvas || !window.Chart) return;

  const CHART_DEFAULTS = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { callbacks: {
      label: ctx => ` ${ctx.parsed.x.toFixed(1)}%`
    }}},
    scales: {
      x: { grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { font: { size: 10 } } },
      y: { ticks: { font: { size: 10 } }, grid: { display: false } },
    },
    indexAxis: 'y',
  };

  new Chart(growthCanvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: growthRanking.map(c => `${c.flag} ${c.name}`),
      datasets: [{
        data: growthRanking.map(c => c.value),
        backgroundColor: growthRanking.map(c => c.value >= 0 ? 'rgba(34,197,94,0.7)' : 'rgba(239,68,68,0.7)'),
        borderRadius: 4,
      }],
    },
    options: { ...CHART_DEFAULTS },
  });

  new Chart(inflCanvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: infRanking.map(c => `${c.flag} ${c.name}`),
      datasets: [{
        data: infRanking.map(c => c.value),
        backgroundColor: infRanking.map(c =>
          c.value > 8 ? 'rgba(239,68,68,0.7)' :
          c.value > 4 ? 'rgba(245,158,11,0.7)' :
          'rgba(14,165,233,0.7)'
        ),
        borderRadius: 4,
      }],
    },
    options: { ...CHART_DEFAULTS },
  });
}
