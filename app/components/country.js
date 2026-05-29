// Country grid page + individual country profile page.

function buildCountryCommentary(iso3, country, d) {
  const paras = [];

  // Para 1 — GDP & growth
  if (d.gdp?.value) {
    let p = `${country.flag} <strong>${A.escapeText(country.name)}</strong> recorded a GDP of <strong>${A.fmtGDP(d.gdp.value)}</strong> in <strong>${d.gdp.year}</strong>.`;
    if (d.gr?.value != null) {
      const g = d.gr.value;
      if (g >= 4)      p += ` The economy is expanding at a strong pace of <strong>${A.fmtPct(g)}</strong>.`;
      else if (g >= 2) p += ` Growth remains solid at <strong>${A.fmtPct(g)}</strong>.`;
      else if (g >= 0) p += ` Growth is modest at <strong>${A.fmtPct(g)}</strong>, reflecting a period of slower expansion.`;
      else             p += ` The economy contracted by <strong>${A.fmtPct(Math.abs(g))}</strong>, signalling a period of economic pressure.`;
    }
    paras.push(p);
  }

  // Para 2 — Inflation + unemployment
  if (d.inf?.value != null) {
    const inf = d.inf.value;
    let p = '';
    if (inf > 8)       p = `Inflation at <strong>${A.fmtPct(inf)}</strong> is running well above target levels and remains a key policy challenge.`;
    else if (inf > 4)  p = `Inflation at <strong>${A.fmtPct(inf)}</strong> is elevated relative to developed-economy benchmarks.`;
    else if (inf >= 2) p = `Inflation at <strong>${A.fmtPct(inf)}</strong> is broadly within target range.`;
    else               p = `Inflation at <strong>${A.fmtPct(inf)}</strong> is very low, creating limited room for conventional monetary easing.`;
    if (d.une?.value != null) {
      const u = d.une.value;
      p += ` The unemployment rate stands at <strong>${A.fmtPct(u)}</strong>`;
      if (u > 10)     p += ', with elevated unemployment remaining a structural concern.';
      else if (u < 4) p += ', reflecting a tight labour market by historical standards.';
      else            p += '.';
    }
    paras.push(p);
  }

  // Para 3 — Debt + external balance
  const ca = d.currentAcc;
  if (d.debt?.value != null || ca?.value != null) {
    let p = '';
    if (d.debt?.value != null) {
      const dv = d.debt.value;
      if (dv > 120)      p += `Government debt at <strong>${A.fmtPct(dv)}</strong> of GDP is high, constraining fiscal space for stimulus.`;
      else if (dv > 80)  p += `Debt at <strong>${A.fmtPct(dv)}</strong> of GDP is elevated, requiring sustained fiscal discipline.`;
      else               p += `Fiscal headroom is adequate with government debt at <strong>${A.fmtPct(dv)}</strong> of GDP.`;
    }
    if (ca?.value != null) {
      const cv = ca.value;
      if (p) p += ' ';
      if (cv < -5)     p += `The current account deficit of <strong>${A.fmtPct(Math.abs(cv))}</strong> of GDP indicates significant external imbalances.`;
      else if (cv > 3) p += `A current account surplus of <strong>${A.fmtPct(cv)}</strong> of GDP points to a net-saving economy with competitive export capacity.`;
      else if (cv < 0) p += `The current account deficit of <strong>${A.fmtPct(Math.abs(cv))}</strong> of GDP is within manageable bounds.`;
      else             p += `The current account surplus of <strong>${A.fmtPct(cv)}</strong> of GDP reflects balanced external trade.`;
    }
    if (p) paras.push(p);
  }

  // Para 4 — Structural indicators (only if ≥2 available)
  const structs = [d.cap, d.health, d.rd, d.gini].filter(x => x?.value != null);
  if (structs.length >= 2) {
    const parts = [];
    if (d.cap?.value != null) {
      const cv = d.cap.value;
      const bracket = cv > 40000 ? 'high-income' : cv > 12000 ? 'upper-middle-income' : 'middle-income';
      parts.push(`GDP per capita of <strong>${A.fmtThousands(cv)}</strong> places ${A.escapeText(country.name)} in the ${bracket} bracket`);
    }
    if (d.health?.value != null) {
      const hv = d.health.value;
      const note = hv > 8 ? 'reflects substantial public investment in health systems' : 'is below the OECD average of around 9%';
      parts.push(`health expenditure of <strong>${A.fmtPct(hv)}</strong> of GDP ${note}`);
    }
    if (d.rd?.value != null) {
      const rv = d.rd.value;
      const note = rv > 2.5 ? 'is above the G20 median, supporting innovation-led growth' : 'suggests room for deeper investment in knowledge-economy sectors';
      parts.push(`R&amp;D spending of <strong>${A.fmtPct(rv)}</strong> of GDP ${note}`);
    }
    if (d.gini?.value != null) {
      const gv = d.gini.value;
      const label = gv > 45 ? 'high income inequality that may constrain domestic consumption' : gv > 35 ? 'moderate inequality' : 'relatively equitable income distribution';
      parts.push(`a Gini index of <strong>${A.fmtDecimal(gv)}</strong> indicating ${label}`);
    }
    if (parts.length) {
      paras.push(parts.map((s, i) => {
        if (i === 0) return s.charAt(0).toUpperCase() + s.slice(1) + (parts.length === 1 ? '.' : '');
        if (i === parts.length - 1) return ' and ' + s + '.';
        return ', ' + s;
      }).join(''));
    }
  }

  if (!paras.length) return '';

  return `
    <div class="commentary-card chart-card hc-enter">
      <div class="commentary-card__label">Economic Analysis</div>
      <div class="commentary-card__body">
        ${paras.map(p => `<p class="commentary-card__para">${p}</p>`).join('')}
      </div>
    </div>
  `;
}

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

  const gdp    = window.G20Data.getLatest(iso3, 'GDP');
  const gr     = window.G20Data.getLatest(iso3, 'GDP_GROWTH');
  const inf    = window.G20Data.getLatest(iso3, 'INFLATION');
  const une    = window.G20Data.getLatest(iso3, 'UNEMPLOYMENT');
  const debt   = window.G20Data.getLatest(iso3, 'DEBT_GDP');
  const cap    = window.G20Data.getLatest(iso3, 'GDP_CAPITA');
  const co2    = window.G20Data.getLatest(iso3, 'CO2_CAPITA');
  const trade  = window.G20Data.getLatest(iso3, 'TRADE_GDP');
  const pop    = window.G20Data.getLatest(iso3, 'POPULATION');
  const health = window.G20Data.getLatest(iso3, 'HEALTH_EXP');
  const rd     = window.G20Data.getLatest(iso3, 'RD_EXP');
  const gini   = window.G20Data.getLatest(iso3, 'GINI');

  const growthColor = !gr?.value ? 'rgba(240,244,248,0.8)' :
                      gr.value >= 2 ? '#4ade80' :
                      gr.value < 0  ? '#f87171' : 'rgba(240,244,248,0.8)';

  const hasOECDCharts = health?.value || rd?.value;

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

    <div class="kpi-strip hc-enter" style="margin-top:-8px">
      <div class="kpi-card">
        <div class="kpi-label">Health Spending</div>
        <div class="kpi-value">${A.fmtPct(health?.value)}</div>
        <div class="kpi-sub">% GDP · ${health?.year || '—'} · WHO</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">R&amp;D Spending</div>
        <div class="kpi-value">${A.fmtPct(rd?.value)}</div>
        <div class="kpi-sub">% GDP · ${rd?.year || '—'} · OECD</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Gini Index</div>
        <div class="kpi-value" style="color:${gini?.value > 45 ? 'var(--g20-amber)' : 'var(--fg-1)'}">
          ${gini?.value ? A.fmtDecimal(gini.value) : '—'}
        </div>
        <div class="kpi-sub">${gini?.year || 'not available'} · World Bank</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Current Account</div>
        <div class="kpi-value" style="color:${(window.G20Data.getLatest(iso3,'CURRENT_ACC')?.value||0) < -5 ? 'var(--g20-red)' : 'var(--fg-1)'}">
          ${A.fmtPct(window.G20Data.getLatest(iso3,'CURRENT_ACC')?.value)}
        </div>
        <div class="kpi-sub">% GDP · ${window.G20Data.getLatest(iso3,'CURRENT_ACC')?.year || '—'}</div>
      </div>
    </div>

    ${buildCountryCommentary(iso3, country, {
      gdp, gr: gr, inf, une, debt, currentAcc: window.G20Data.getLatest(iso3, 'CURRENT_ACC'),
      cap, health, rd, gini
    })}

    <div class="chart-pair hc-enter">
      <div class="chart-card">
        <div class="chart-card__title">GDP — 10 Year Trend</div>
        <div class="chart-card__sub">USD current prices, World Bank</div>
        <div class="chart-wrap"><canvas id="profile-gdp-chart"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="chart-card__title">GDP Growth Rate</div>
        <div class="chart-card__sub">Annual % change, World Bank</div>
        <div class="chart-wrap"><canvas id="profile-growth-chart"></canvas></div>
      </div>
    </div>

    <div class="chart-pair hc-enter">
      <div class="chart-card">
        <div class="chart-card__title">Inflation (CPI)</div>
        <div class="chart-card__sub">Annual % change, World Bank</div>
        <div class="chart-wrap"><canvas id="profile-inflation-chart"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="chart-card__title">Unemployment Rate</div>
        <div class="chart-card__sub">% of total labour force, World Bank</div>
        <div class="chart-wrap"><canvas id="profile-unemployment-chart"></canvas></div>
      </div>
    </div>

    ${hasOECDCharts ? `
    <div class="chart-pair hc-enter">
      ${health?.value ? `
      <div class="chart-card">
        <div class="chart-card__title">Health Expenditure</div>
        <div class="chart-card__sub">% of GDP, WHO / World Bank</div>
        <div class="chart-wrap"><canvas id="profile-health-chart"></canvas></div>
      </div>` : '<div></div>'}
      ${rd?.value ? `
      <div class="chart-card">
        <div class="chart-card__title">R&amp;D Expenditure (GERD)</div>
        <div class="chart-card__sub">% of GDP, OECD MSTI</div>
        <div class="chart-wrap"><canvas id="profile-rd-chart"></canvas></div>
      </div>` : '<div></div>'}
    </div>` : ''}
  `;
}

// Charts are mounted by mountPageCharts in main.js — <script> inside innerHTML doesn't execute.
window.mountCountryProfileCharts = function(iso3) {
  function tryMount() {
    if (!window.Chart) { setTimeout(tryMount, 200); return; }

    function lineChart(canvasId, key, color, fmtFn) {
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
          }],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { callbacks: {
            label: ctx => ' ' + fmtFn(ctx.parsed.y),
          }}},
          scales: {
            x: { grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { font: { size: 10 } } },
            y: { grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { font: { size: 10 },
              callback: v => fmtFn(v),
            }},
          },
        },
      });
    }

    lineChart('profile-gdp-chart',          'GDP',          'rgba(37,99,235,1)',   v => '$' + (v/1e12).toFixed(2) + 'T');
    lineChart('profile-growth-chart',        'GDP_GROWTH',   'rgba(34,197,94,1)',   v => v.toFixed(1) + '%');
    lineChart('profile-inflation-chart',     'INFLATION',    'rgba(245,158,11,1)',  v => v.toFixed(1) + '%');
    lineChart('profile-unemployment-chart',  'UNEMPLOYMENT', 'rgba(239,68,68,1)',   v => v.toFixed(1) + '%');
    lineChart('profile-health-chart',        'HEALTH_EXP',   'rgba(16,185,129,1)',  v => v.toFixed(1) + '%');
    lineChart('profile-rd-chart',            'RD_EXP',       'rgba(139,92,246,1)',  v => v.toFixed(2) + '%');
  }
  tryMount();
};
