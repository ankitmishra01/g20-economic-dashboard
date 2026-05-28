// Compare view — multi-select countries, pick indicator, render side-by-side charts.

let _compareState = {
  selected: ['USA', 'CHN', 'IND', 'DEU'],
  indicator: 'GDP_GROWTH',
};

function renderCompare() {
  const { selected, indicator } = _compareState;

  return `
    <div class="page-head hc-enter">
      <div class="page-head__eyebrow">Cross-Country Analysis</div>
      <h1 class="page-head__title">Compare Economies</h1>
      <p class="page-head__lede">Select up to 6 countries and an indicator to compare trends side by side.</p>
    </div>

    <div class="compare-controls hc-enter">
      <h3>Select countries (up to 6)</h3>
      <div class="country-picker">
        ${G20.map(c => `
          <button class="picker-pill ${selected.includes(c.iso3) ? 'selected' : ''}"
            onclick="compareToggleCountry('${c.iso3}', this)">
            <span class="pill-flag">${c.flag}</span>
            <span>${A.escapeText(c.name)}</span>
          </button>
        `).join('')}
      </div>

      <h3 style="margin-top:16px">Select indicator</h3>
      <div class="indicator-select">
        ${Object.entries(INDICATORS).map(([key, meta]) => `
          <button class="ind-pill ${indicator === key ? 'selected' : ''}"
            onclick="compareSetIndicator('${key}', this)">
            ${A.escapeText(meta.label)} ${meta.unit ? `(${meta.unit})` : ''}
          </button>
        `).join('')}
      </div>
    </div>

    <div id="compare-charts" class="hc-enter">
      ${renderCompareCharts()}
    </div>
  `;
}

function renderCompareCharts() {
  const { selected, indicator } = _compareState;
  if (!selected.length) return '<div class="error-state">Select at least one country above.</div>';

  return `
    <div class="chart-card">
      <div class="chart-card__title">${A.escapeText(INDICATORS[indicator]?.label || indicator)} — Trend Comparison</div>
      <div class="chart-card__sub">
        ${selected.map(iso3 => G20.find(c => c.iso3 === iso3)).filter(Boolean).map(c => `${c.flag} ${c.name}`).join(' · ')}
      </div>
      <div class="chart-wrap" style="height:340px">
        <canvas id="compare-line-chart"></canvas>
      </div>
    </div>

    <div class="chart-card" style="margin-top:20px">
      <div class="chart-card__title">Latest Value — ${A.escapeText(INDICATORS[indicator]?.label || indicator)}</div>
      <div class="chart-card__sub">Most recent data point per country</div>
      <div class="chart-wrap">
        <canvas id="compare-bar-chart"></canvas>
      </div>
    </div>
  `;
}

function mountCompareCharts() {
  if (!window.Chart) { setTimeout(mountCompareCharts, 200); return; }

  const { selected, indicator } = _compareState;
  const countries = selected.map(iso3 => G20.find(c => c.iso3 === iso3)).filter(Boolean);
  const meta = INDICATORS[indicator];

  // Gather all years across selected countries
  const allYears = new Set();
  const seriesMap = {};
  for (const c of countries) {
    const s = window.G20Data.getSeries(c.iso3, indicator, 2000);
    seriesMap[c.iso3] = s;
    s.forEach(d => allYears.add(d.year));
  }
  const years = Array.from(allYears).sort((a, b) => a - b);

  const COLORS = [
    'rgba(37,99,235,1)', 'rgba(239,68,68,1)', 'rgba(34,197,94,1)',
    'rgba(245,158,11,1)', 'rgba(168,85,247,1)', 'rgba(14,165,233,1)',
  ];

  // Line chart
  const lineEl = document.getElementById('compare-line-chart');
  if (lineEl) {
    new Chart(lineEl.getContext('2d'), {
      type: 'line',
      data: {
        labels: years,
        datasets: countries.map((c, i) => ({
          label: `${c.flag} ${c.name}`,
          data: years.map(yr => {
            const pt = seriesMap[c.iso3].find(d => d.year === yr);
            return pt ? pt.value : null;
          }),
          borderColor: COLORS[i],
          backgroundColor: COLORS[i].replace('1)', '0.08)'),
          borderWidth: 2, fill: false, tension: 0.3, pointRadius: 3,
          spanGaps: true,
        })),
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { font: { size: 11 }, padding: 14 } },
          tooltip: { callbacks: {
            label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y?.toFixed(1)}${meta?.unit || ''}`,
          }},
        },
        scales: {
          x: { grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { font: { size: 10 } } },
          y: { grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { font: { size: 10 } } },
        },
      },
    });
  }

  // Bar chart — latest values
  const barEl = document.getElementById('compare-bar-chart');
  if (barEl) {
    const latest = countries.map(c => {
      const l = window.G20Data.getLatest(c.iso3, indicator);
      return { name: `${c.flag} ${c.name}`, value: l?.value ?? null, year: l?.year };
    }).filter(d => d.value !== null);

    new Chart(barEl.getContext('2d'), {
      type: 'bar',
      data: {
        labels: latest.map(d => d.name),
        datasets: [{
          data: latest.map(d => d.value),
          backgroundColor: COLORS.slice(0, latest.length).map(c => c.replace('1)', '0.8)')),
          borderRadius: 6,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: {
          label: ctx => ` ${ctx.parsed.y?.toFixed(1)}${meta?.unit || ''}`,
        }}},
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 11 } } },
          y: { grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { font: { size: 10 } } },
        },
      },
    });
  }
}

window.compareToggleCountry = function (iso3, btn) {
  const idx = _compareState.selected.indexOf(iso3);
  if (idx >= 0) {
    _compareState.selected.splice(idx, 1);
    btn.classList.remove('selected');
  } else {
    if (_compareState.selected.length >= 6) return; // max 6
    _compareState.selected.push(iso3);
    btn.classList.add('selected');
  }
  const charts = document.getElementById('compare-charts');
  if (charts) {
    charts.innerHTML = renderCompareCharts();
    setTimeout(mountCompareCharts, 100);
  }
};

window.compareSetIndicator = function (key, btn) {
  _compareState.indicator = key;
  document.querySelectorAll('.ind-pill').forEach(el => el.classList.remove('selected'));
  btn.classList.add('selected');
  const charts = document.getElementById('compare-charts');
  if (charts) {
    charts.innerHTML = renderCompareCharts();
    setTimeout(mountCompareCharts, 100);
  }
};
