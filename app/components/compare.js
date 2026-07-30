// Compare view — Direction B design

let _compareState = {
  selected: ['USA', 'CHN', 'IND', 'DEU'],
  indicator: 'GDP_GROWTH',
};

// Track active chart instances so we can destroy them before re-creating
let _lineChartInst = null;
let _barChartInst  = null;

// Indicators with sparse or no data in Supabase — shown dimmed in the selector
const SPARSE_INDICATORS = new Set(['GINI','RESEARCHERS','FISCAL_BAL','TAX_REVENUE','EDUC_EXP']);

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
        <button class="sec-head__tab ${indicator === key ? 'active' : ''}${SPARSE_INDICATORS.has(key) ? ' tab-sparse' : ''}"
          onclick="compareSetIndicator('${key}', this)"
          title="${SPARSE_INDICATORS.has(key) ? 'Limited G20 coverage' : ''}">
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

  // Register datalabels plugin once, before any chart is created this call.
  // ChartDataLabels 2.x + Chart.js 4.x: global registration must happen before
  // chart construction so beforeInit runs and initialises chart.$datalabels.
  // Without this, the plugin's beforeUpdate fires on uninitialised charts and
  // silently prevents bar animation, leaving bars stuck at the baseline.
  if (window.ChartDataLabels) Chart.register(window.ChartDataLabels);

  // Destroy previous instances so Chart.js doesn't throw "Canvas already in use"
  // when filter changes re-create canvases with the same IDs.
  if (_lineChartInst) { try { _lineChartInst.destroy(); } catch(_) {} _lineChartInst = null; }
  if (_barChartInst)  { try { _barChartInst.destroy();  } catch(_) {} _barChartInst  = null; }

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

  // No data for any selected country with this indicator
  if (years.length === 0) {
    const container = document.getElementById('compare-charts');
    if (container) container.innerHTML = `
      <div class="panel" style="margin-top:16px">
        <div class="panel__body" style="padding:52px 24px;display:flex;flex-direction:column;align-items:center;gap:14px;text-align:center">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-4)" stroke-width="1.2" stroke-linecap="round">
            <path d="M3 20V14l4-4 4 4 4-6 4 4v8H3z"/>
            <circle cx="19" cy="5" r="2.5" stroke="var(--neg)" stroke-width="1.4"/>
            <path d="M17.5 5h3M19 3.5v3" stroke="var(--neg)" stroke-width="1.4"/>
          </svg>
          <div>
            <div style="font-family:var(--font-mono);font-size:12px;color:var(--text-2);font-weight:600;margin-bottom:6px">
              No data for ${A.escapeText(meta?.label || indicator)}
            </div>
            <div style="font-family:var(--font-mono);font-size:11px;color:var(--text-4);line-height:1.6">
              Coverage is limited for this indicator across the selected economies.<br>
              Try <strong style="color:var(--text-3)">GDP Growth</strong>, <strong style="color:var(--text-3)">Inflation</strong>, or <strong style="color:var(--text-3)">Unemployment</strong> for full G20 data.
            </div>
          </div>
        </div>
      </div>`;
    return;
  }

  const COLORS = window.CATEGORICAL_PALETTE;

  const unit = meta?.unit ? ' ' + meta.unit : '';
  const TICK_OPTS = { font: { size: 10, family: "'Geist Mono', monospace" }, color: '#8A8A8A' };
  const TOOLTIP_STYLE = {
    backgroundColor: 'rgba(10,10,10,0.88)',
    titleColor: '#8A8A8A',
    bodyColor: '#F5F5F2',
    titleFont: { family: "'Geist Mono', monospace", size: 10 },
    bodyFont:  { family: "'Geist Mono', monospace", size: 11 },
    padding: 8,
    cornerRadius: 4,
  };

  const lineEl = document.getElementById('compare-line-chart');
  if (lineEl) {
    _lineChartInst = new Chart(lineEl.getContext('2d'), {
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
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'bottom', labels: { font: { size: 11, family: "'Geist Mono', monospace" }, padding: 14, color: '#525252' } },
          tooltip: {
            ...TOOLTIP_STYLE,
            callbacks: {
              title: ctx => `${ctx[0]?.label}`,
              label: ctx => `  ${ctx.dataset.label}: ${ctx.parsed.y != null ? ctx.parsed.y.toFixed(1) + unit : '—'}`,
            },
          },
          datalabels: { display: false },
        },
        scales: {
          x: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: TICK_OPTS },
          y: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { ...TICK_OPTS, callback: v => v.toFixed(1) + unit } },
        },
      },
    });
  }

  const barEl = document.getElementById('compare-bar-chart');
  if (barEl) {
    const latest = countries.map((c, i) => {
      const l = window.G20Data.getLatest(c.iso3, indicator);
      return { name: c.name, iso3: c.iso3, value: l?.value ?? null, year: l?.year ?? null, color: COLORS[i] };
    }).filter(d => d.value !== null);

    // G20 average reference line (excludes EUU aggregate)
    const g20Ranking = window.G20Data.getRanking(indicator).filter(c => c.iso3 !== 'EUU');
    const g20Avg = g20Ranking.length
      ? g20Ranking.reduce((s, c) => s + c.value, 0) / g20Ranking.length
      : null;

    const barDatasets = [{
      label: meta?.label || indicator,
      data: latest.map(d => d.value),
      backgroundColor: latest.map(d => d.color.replace('1)', '0.82)')),
      borderRadius: 4,
      datalabels: {
        anchor: 'end', align: 'top',
        formatter: v => v != null ? v.toFixed(1) + unit : '',
        font: { family: "'Geist Mono', monospace", size: 9, weight: '600' },
        color: '#383838',
        offset: 2,
        clip: false,
      },
    }];

    if (g20Avg !== null) {
      barDatasets.push({
        type: 'line',
        label: 'G20 avg',
        data: Array(latest.length).fill(g20Avg),
        borderColor: 'rgba(161,98,7,0.65)',
        borderDash: [5, 3],
        borderWidth: 1.5,
        pointRadius: 0,
        fill: false,
        datalabels: { display: false },
      });
    }

    _barChartInst = new Chart(barEl.getContext('2d'), {
      type: 'bar',
      data: {
        labels: latest.map(d => d.name),
        datasets: barDatasets,
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        layout: { padding: { top: 24 } },
        plugins: {
          legend: {
            display: g20Avg !== null,
            position: 'bottom',
            labels: {
              font: { size: 10, family: "'Geist Mono', monospace" },
              padding: 10,
              color: '#525252',
              filter: item => item.text !== (meta?.label || indicator),
            },
          },
          tooltip: {
            ...TOOLTIP_STYLE,
            callbacks: {
              title: ctx => ctx[0]?.label,
              label: ctx => ctx.dataset.label === 'G20 avg'
                ? `  G20 average: ${ctx.parsed.y.toFixed(1)}${unit}`
                : `  ${ctx.parsed.y.toFixed(1)}${unit} (${latest[ctx.dataIndex]?.year || '—'})`,
            },
          },
          datalabels: window.ChartDataLabels ? {} : { display: false },
        },
        scales: {
          x: { grid: { display: false }, ticks: TICK_OPTS },
          y: {
            beginAtZero: true,
            grace: '8%',
            grid: { color: 'rgba(0,0,0,0.04)' },
            ticks: { ...TICK_OPTS, callback: v => v.toFixed(1) + unit },
          },
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
  // Keep the panel meta label in sync with the selected indicator
  const metaEl = document.querySelector('.panel__head .panel__meta');
  if (metaEl) metaEl.textContent = INDICATORS[key]?.label || key;
  const charts = document.getElementById('compare-charts');
  if (charts) {
    charts.innerHTML = renderCompareChartHTML();
    setTimeout(mountCompareCharts, 100);
  }
};
