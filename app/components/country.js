// Country grid page + individual country profile page.

function renderCountries() {
  const ranking = window.G20Data.getRanking('GDP');

  return `
    <div class="page-head hc-enter">
      <div class="page-head__eyebrow">G20 Members</div>
      <h1 class="page-head__title">All Countries</h1>
      <p class="page-head__lede">Click any country to see its full economic profile with 10-year trend charts.</p>
    </div>

    <div class="country-grid">
      ${G20.map(c => {
        const gdp  = window.G20Data.getLatest(c.iso3, 'GDP');
        const gr   = window.G20Data.getLatest(c.iso3, 'GDP_GROWTH');
        const inf  = window.G20Data.getLatest(c.iso3, 'INFLATION');
        const une  = window.G20Data.getLatest(c.iso3, 'UNEMPLOYMENT');
        const growthColor = !gr?.value ? 'var(--fg-1)' :
                            gr.value >= 2 ? 'var(--g20-green)' :
                            gr.value < 0  ? 'var(--g20-red)'   : 'var(--fg-1)';
        return `
          <div class="co-card hc-enter" onclick="navTo('country/${c.iso3}')">
            <div class="co-card__head">
              <div class="co-flag">${c.flag}</div>
              <div class="co-meta">
                <div class="co-name">${A.escapeText(c.name)}</div>
                <div class="co-region">${A.escapeText(c.region)}</div>
              </div>
            </div>
            <div class="co-card__stats">
              <div class="co-stat">
                <div class="co-stat-label">GDP</div>
                <div class="co-stat-value">${A.fmtGDP(gdp?.value)}</div>
              </div>
              <div class="co-stat">
                <div class="co-stat-label">Growth</div>
                <div class="co-stat-value" style="color:${growthColor}">
                  ${A.fmtPct(gr?.value)}
                </div>
              </div>
              <div class="co-stat">
                <div class="co-stat-label">Inflation</div>
                <div class="co-stat-value ${inf?.value > 8 ? 'bad' : ''}">${A.fmtPct(inf?.value)}</div>
              </div>
              <div class="co-stat">
                <div class="co-stat-label">Unemployment</div>
                <div class="co-stat-value ${une?.value > 10 ? 'bad' : ''}">${A.fmtPct(une?.value)}</div>
              </div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderCountryProfile(iso3) {
  const country = G20.find(c => c.iso3 === iso3);
  if (!country) return `<div class="error-state">Country not found: ${A.escapeText(iso3)}</div>`;

  const gdp  = window.G20Data.getLatest(iso3, 'GDP');
  const gr   = window.G20Data.getLatest(iso3, 'GDP_GROWTH');
  const inf  = window.G20Data.getLatest(iso3, 'INFLATION');
  const une  = window.G20Data.getLatest(iso3, 'UNEMPLOYMENT');
  const debt = window.G20Data.getLatest(iso3, 'DEBT_GDP');
  const cap  = window.G20Data.getLatest(iso3, 'GDP_CAPITA');
  const co2  = window.G20Data.getLatest(iso3, 'CO2_CAPITA');
  const trade= window.G20Data.getLatest(iso3, 'TRADE_GDP');
  const pop  = window.G20Data.getLatest(iso3, 'POPULATION');

  const growthColor = !gr?.value ? 'rgba(240,244,248,0.8)' :
                      gr.value >= 2 ? '#4ade80' :
                      gr.value < 0  ? '#f87171' : 'rgba(240,244,248,0.8)';

  return `
    <button class="back-btn" onclick="navTo('countries')">
      ${A.icon('chevron_right', 13)} Back to all countries
    </button>

    <div class="profile-hero hc-enter">
      <div class="profile-flag">${country.flag}</div>
      <div class="profile-meta">
        <div class="profile-name">${A.escapeText(country.name)}</div>
        <div class="profile-region">${A.escapeText(country.region)}</div>
        <div class="profile-stats">
          <div>
            <div class="profile-stat-label">GDP</div>
            <div class="profile-stat-value">${A.fmtGDP(gdp?.value)}</div>
          </div>
          <div>
            <div class="profile-stat-label">Growth ${gr?.year || ''}</div>
            <div class="profile-stat-value" style="color:${growthColor}">${A.fmtPct(gr?.value)}</div>
          </div>
          <div>
            <div class="profile-stat-label">Inflation</div>
            <div class="profile-stat-value">${A.fmtPct(inf?.value)}</div>
          </div>
          ${pop ? `<div>
            <div class="profile-stat-label">Population</div>
            <div class="profile-stat-value">${A.fmtMillions(pop.value)}</div>
          </div>` : ''}
        </div>
      </div>
    </div>

    <div class="kpi-strip hc-enter">
      <div class="kpi-card">
        <div class="kpi-label">GDP per Capita</div>
        <div class="kpi-value">${A.fmtThousands(cap?.value)}</div>
        <div class="kpi-sub">${cap?.year || '—'}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Unemployment</div>
        <div class="kpi-value" style="color:${une?.value > 10 ? 'var(--g20-red)' : 'var(--fg-1)'}">
          ${A.fmtPct(une?.value)}
        </div>
        <div class="kpi-sub">${une?.year || '—'}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Govt Debt / GDP</div>
        <div class="kpi-value" style="color:${debt?.value > 120 ? 'var(--g20-red)' : debt?.value > 80 ? 'var(--g20-amber)' : 'var(--fg-1)'}">
          ${A.fmtPct(debt?.value)}
        </div>
        <div class="kpi-sub">${debt?.year || '—'}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Trade (% GDP)</div>
        <div class="kpi-value">${A.fmtPct(trade?.value)}</div>
        <div class="kpi-sub">${trade?.year || '—'}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">CO₂ per Capita</div>
        <div class="kpi-value">${A.fmtDecimal(co2?.value)}</div>
        <div class="kpi-sub">tonnes · ${co2?.year || '—'}</div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px" class="hc-enter">
      <div class="chart-card">
        <div class="chart-card__title">GDP — 10 Year Trend</div>
        <div class="chart-card__sub">USD current prices, World Bank</div>
        <div class="chart-wrap"><canvas id="profile-gdp-chart"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="chart-card__title">GDP Growth Rate</div>
        <div class="chart-card__sub">Annual % change</div>
        <div class="chart-wrap"><canvas id="profile-growth-chart"></canvas></div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px" class="hc-enter">
      <div class="chart-card">
        <div class="chart-card__title">Inflation (CPI)</div>
        <div class="chart-card__sub">Annual % change</div>
        <div class="chart-wrap"><canvas id="profile-inflation-chart"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="chart-card__title">Unemployment Rate</div>
        <div class="chart-card__sub">% of total labour force</div>
        <div class="chart-wrap"><canvas id="profile-unemployment-chart"></canvas></div>
      </div>
    </div>

    <script>
    (function() {
      const iso3 = '${iso3}';
      function mountProfileCharts() {
        if (!window.Chart) { setTimeout(mountProfileCharts, 200); return; }

        function lineChart(canvasId, key, color, label) {
          const el = document.getElementById(canvasId);
          if (!el) return;
          const series = window.G20Data.getSeries(iso3, key, 2010);
          if (!series.length) return;
          new Chart(el.getContext('2d'), {
            type: 'line',
            data: {
              labels: series.map(d => d.year),
              datasets: [{
                data: series.map(d => d.value),
                borderColor: color,
                backgroundColor: color.replace('1)', '0.08)'),
                borderWidth: 2, fill: true, tension: 0.3, pointRadius: 3,
                label: label,
              }],
            },
            options: {
              responsive: true, maintainAspectRatio: false,
              plugins: { legend: { display: false }, tooltip: { callbacks: {
                label: ctx => ' ' + ctx.parsed.y.toFixed(key === 'GDP' ? 2 : 1) + (key === 'GDP' ? ' USD' : '%'),
              }}},
              scales: {
                x: { grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { font: { size: 10 } } },
                y: { grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { font: { size: 10 },
                  callback: v => key === 'GDP' ? '$' + (v/1e12).toFixed(1) + 'T' : v.toFixed(1) + '%',
                }},
              },
            },
          });
        }

        lineChart('profile-gdp-chart',          'GDP',          'rgba(37,99,235,1)',   'GDP');
        lineChart('profile-growth-chart',        'GDP_GROWTH',   'rgba(34,197,94,1)',   'Growth %');
        lineChart('profile-inflation-chart',     'INFLATION',    'rgba(245,158,11,1)',  'Inflation %');
        lineChart('profile-unemployment-chart',  'UNEMPLOYMENT', 'rgba(239,68,68,1)',   'Unemployment %');
      }
      setTimeout(mountProfileCharts, 100);
    })();
    </script>
  `;
}
