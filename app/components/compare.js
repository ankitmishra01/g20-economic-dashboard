// Compare view — Direction B design

let _compareState = {
  selected: ['USA', 'CHN', 'IND', 'DEU'],
  indicator: 'GDP_GROWTH',
};

function renderCompare() {
  const { selected, indicator } = _compareState;

  return `
<div class="page-body">
  <div class="sec-head">
    <div class="sec-head__title">Compare economies<span class="sec-head__sub">up to 6 countries</span></div>
  </div>

  <div class="panel" style="margin-bottom:16px">
    <div class="panel__head">
      <span class="panel__title">Countries</span>
      <span class="panel__meta">${selected.length} selected</span>
    </div>
    <div class="panel__body" style="display:flex;flex-wrap:wrap;gap:6px">
      ${G20.map(c => `
        <button class="sec-head__tab ${selected.includes(c.iso3) ? 'active' : ''}"
          onclick="compareToggleCountry('${c.iso3}', this)"
          style="display:inline-flex;align-items:center;gap:6px">
          <span style="display:inline-block;width:16px;height:11px;border-radius:2px;border:1px solid var(--rule);background-image:url('https://flagcdn.com/${c.code.toLowerCase()}.svg');background-size:cover;background-position:center;flex-shrink:0"></span>
          ${A.escapeText(c.name)}
        </button>
      `).join('')}
    </div>
  </div>

  <div class="panel" style="margin-bottom:24px">
    <div class="panel__head">
      <span class="panel__title">Indicator</span>
      <span class="panel__meta">${INDICATORS[indicator]?.label || indicator}</span>
    </div>
    <div class="panel__body" style="display:flex;flex-wrap:wrap;gap:6px">
      ${Object.entries(INDICATORS).map(([key, meta]) => `
        <button class="sec-head__tab ${indicator === key ? 'active' : ''}"
          onclick="compareSetIndicator('${key}', this)">
          ${A.escapeText(meta.label)}${meta.unit ? ' (' + meta.unit + ')' : ''}
        </button>
      `).join('')}
    </div>
  </div>

  <div id="compare-charts">
    ${renderCompareChartHTML()}
  </div>
</div>`;
}

function renderCompareChartHTML() {
  const { selected, indicator } = _compareState;
  if (!selected.length) return '<div class="loading-spinner"><span>Select at least one country above.</span></div>';

  const countries = selected.map(iso3 => G20.find(c => c.iso3 === iso3)).filter(Boolean);
  const meta = INDICATORS[indicator];

  return `
    <div class="panel" style="margin-bottom:16px">
      <div class="panel__head">
        <div>
          <span class="panel__title">${A.escapeText(meta?.label || indicator)} — Trend</span>
          <span class="panel__sub">${countries.map(c => c.name).join(' · ')}</span>
        </div>
      </div>
      <div class="panel__body" style="height:320px;position:relative">
        <canvas id="compare-line-chart"></canvas>
      </div>
    </div>
    <div class="panel">
      <div class="panel__head">
        <span class="panel__title">Latest value — ${A.escapeText(meta?.label || indicator)}</span>
        <span class="panel__meta">Most recent</span>
      </div>
      <div class="panel__body" style="height:220px;position:relative">
        <canvas id="compare-bar-chart"></canvas>
      </div>
    </div>`;
}

function mountCompareCharts() {
  if (!window.Chart) { setTimeout(mountCompareCharts, 200); return; }

  const { selected, indicator } = _compareState;
  const countries = selected.map(iso3 => G20.find(c => c.iso3 === iso3)).filter(Boolean);
  const meta = INDICATORS[indicator];

  const allYears = new Set();
  const seriesMap = {};
  for (const c of countries) {
    const s = window.G20Data.getSeries(c.iso3, indicator, 2000);
    seriesMap[c.iso3] = s;
    s.forEach(d => allYears.add(d.year));
  }
  const years = Array.from(allYears).sort((a, b) => a - b);

  const COLORS = [
    'rgba(10,10,10,1)', 'rgba(185,28,28,1)', 'rgba(4,120,87,1)',
    'rgba(161,98,7,1)', 'rgba(30,64,175,1)', 'rgba(109,40,217,1)',
  ];

  const TICK_OPTS = { font: { size: 10, family: "'Geist Mono', monospace" }, color: '#8A8A8A' };

  const lineEl = document.getElementById('compare-line-chart');
  if (lineEl) {
    new Chart(lineEl.getContext('2d'), {
      type: 'line',
      data: {
        labels: years,
        datasets: countries.map((c, i) => ({
          label: c.name,
          data: years.map(yr => {
            const pt = seriesMap[c.iso3].find(d => d.year === yr);
            return pt ? pt.value : null;
          }),
          borderColor: COLORS[i],
          backgroundColor: COLORS[i].replace('1)', '0.05)'),
          borderWidth: 1.5,
          fill: false,
          tension: 0.3,
          pointRadius: 2,
          spanGaps: true,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { font: { size: 11, family: "'Geist Mono', monospace" }, padding: 14, color: '#525252' } },
          tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y?.toFixed(1)}${meta?.unit || ''}` } },
        },
        scales: {
          x: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: TICK_OPTS },
          y: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: TICK_OPTS },
        },
      },
    });
  }

  const barEl = document.getElementById('compare-bar-chart');
  if (barEl) {
    const latest = countries.map((c, i) => {
      const l = window.G20Data.getLatest(c.iso3, indicator);
      return { name: c.name, value: l?.value ?? null, color: COLORS[i] };
    }).filter(d => d.value !== null);

    new Chart(barEl.getContext('2d'), {
      type: 'bar',
      data: {
        labels: latest.map(d => d.name),
        datasets: [{
          data: latest.map(d => d.value),
          backgroundColor: latest.map(d => d.color.replace('1)', '0.85)')),
          borderRadius: 4,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.y?.toFixed(1)}${meta?.unit || ''}` } },
        },
        scales: {
          x: { grid: { display: false }, ticks: TICK_OPTS },
          y: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: TICK_OPTS },
        },
      },
    });
  }
}

window.compareToggleCountry = function (iso3, btn) {
  const idx = _compareState.selected.indexOf(iso3);
  if (idx >= 0) {
    _compareState.selected.splice(idx, 1);
    btn.classList.remove('active');
  } else {
    if (_compareState.selected.length >= 6) return;
    _compareState.selected.push(iso3);
    btn.classList.add('active');
  }
  const charts = document.getElementById('compare-charts');
  if (charts) {
    charts.innerHTML = renderCompareChartHTML();
    setTimeout(mountCompareCharts, 100);
  }
};

window.compareSetIndicator = function (key, btn) {
  _compareState.indicator = key;
  document.querySelectorAll('[onclick^="compareSetIndicator"]').forEach(el => el.classList.remove('active'));
  btn.classList.add('active');
  const charts = document.getElementById('compare-charts');
  if (charts) {
    charts.innerHTML = renderCompareChartHTML();
    setTimeout(mountCompareCharts, 100);
  }
};
