// Prosperity page — GDP per Capita PPP vs Growth bubble chart

const REGION_COLORS = {
  'Americas':    { bg: 'rgba(59,130,246,0.75)',  border: '#3b82f6' },
  'Europe':      { bg: 'rgba(139,92,246,0.75)',  border: '#8b5cf6' },
  'Asia':        { bg: 'rgba(16,185,129,0.75)',  border: '#10b981' },
  'Middle East': { bg: 'rgba(245,158,11,0.75)',  border: '#f59e0b' },
  'Africa':      { bg: 'rgba(239,68,68,0.75)',   border: '#ef4444' },
};

// Growth is a multi-year average: one year is too noisy to describe a trajectory.
const PROS_GROWTH_FROM = 2023, PROS_GROWTH_TO = 2025;
function avgGrowth(iso3) {
  const s = window.G20_DATA?.[iso3]?.GDP_GROWTH || {};
  const vals = [];
  for (let y = PROS_GROWTH_FROM; y <= PROS_GROWTH_TO; y++) if (s[y] !== null && s[y] !== undefined) vals.push(+s[y]);
  return vals.length === PROS_GROWTH_TO - PROS_GROWTH_FROM + 1 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

// Current x-axis metric: 'ppp' (GDP_CAPITA_PPP) or 'nominal' (GDP_CAPITA)
let _prosperityMode = 'ppp';
// Tracked chart instance so we can destroy before re-creating on toggle
let _prosperityChartInst = null;

function renderProsperity() {
  return `
<div class="page-body">
  <div class="sec-head">
    <div class="sec-head__title">Prosperity Map <span class="count">G20</span><span class="sec-head__sub">How rich is each economy per person, and how fast is it growing?</span></div>
    <div class="sec-head__actions">
      <button class="sec-head__tab active" onclick="prosperityToggleX(this,'ppp')">PPP</button>
      <button class="sec-head__tab" onclick="prosperityToggleX(this,'nominal')">Nominal</button>
    </div>
  </div>

  <div class="pros-guide mb-20">
    <div><b>Across</b> income per person, adjusted for living costs (PPP). Further right = richer.</div>
    <div><b>Up</b> average real GDP growth over ${PROS_GROWTH_FROM}–${PROS_GROWTH_TO}. Higher = growing faster.</div>
    <div><b>Dashed lines</b> G20 medians, splitting the map into four groups.</div>
    <div><b>Bubble size</b> population.</div>
  </div>

  <div class="panel mb-20">
    <div class="panel__body" style="padding:16px 20px">
      <div class="prosperity-quadrants" id="prosperity-quadrants" style="position:relative;height:480px">
        <canvas id="prosperity-chart"></canvas>
      </div>
      <div class="prosperity-legend" id="prosperity-legend"></div>
    </div>
  </div>

  <div class="sec-head">
    <div class="sec-head__title">Per-Capita Rankings <span class="sec-head__sub">PPP-adjusted · latest available</span></div>
  </div>
  <div class="row-2 mb-20">
    <div class="panel">
      <div class="panel__head">
        <div><span class="panel__title" id="pcap-title">GDP per Capita PPP</span><span class="panel__sub" id="pcap-sub">Int'l $ · highest first</span></div>
      </div>
      <div class="panel__body" id="ppp-bars"></div>
    </div>
    <div class="panel">
      <div class="panel__head">
        <div><span class="panel__title">The four groups</span><span class="panel__sub">split at the G20 medians</span></div>
      </div>
      <div class="panel__body" id="quadrant-table"></div>
    </div>
  </div>
</div>`;
}

function mountProsperityChart(mode) {
  if (!window.Chart) { setTimeout(() => mountProsperityChart(mode), 200); return; }
  if (mode) _prosperityMode = mode;
  const isNominal = _prosperityMode === 'nominal';
  const metricKey = isNominal ? 'GDP_CAPITA' : 'GDP_CAPITA_PPP';
  const axisLabel = isNominal ? 'GDP per Capita (Nominal US$)' : "GDP per Capita PPP (Int'l $)";
  const tipLabel  = isNominal ? 'GDP/capita' : 'PPP';

  // Destroy previous chart so Chart.js doesn't throw "Canvas already in use" on toggle
  if (_prosperityChartInst) { try { _prosperityChartInst.destroy(); } catch (_) {} _prosperityChartInst = null; }

  const nonEU = c => c.iso3 !== 'EUU';

  // Build bubble data
  const data = window.G20.filter(nonEU).map(c => {
    const inc    = window.G20Data.getLatest(c.iso3, metricKey, { annualOnly: true });
    const g = avgGrowth(c.iso3);
    const growth = g === null ? null : { value: g, year: `${PROS_GROWTH_FROM}–${String(PROS_GROWTH_TO).slice(2)} avg` };
    const pop    = window.G20Data.getLatest(c.iso3, 'POPULATION', { annualOnly: true });
    if (!inc || !growth) return null;
    return {
      iso3: c.iso3, name: c.name, code: c.code, region: c.region,
      x: inc.value,
      y: growth.value,
      r: pop?.value ? Math.max(5, Math.min(30, Math.sqrt(pop.value / 1e6) * 1.8)) : 8,
      ppp: inc.value, growth: growth.value, pop: pop?.value, pppYear: inc.year, growthYear: growth.year,
    };
  }).filter(Boolean);

  // Group by region for datasets
  const regions = [...new Set(data.map(d => d.region))];
  const datasets = regions.map(region => {
    const col = REGION_COLORS[region] || { bg: 'rgba(148,163,184,0.7)', border: '#94a3b8' };
    return {
      label: region,
      data: data.filter(d => d.region === region).map(d => ({ x: d.x, y: d.y, r: d.r, _meta: d })),
      backgroundColor: col.bg,
      borderColor: col.border,
      borderWidth: 1.5,
    };
  });

  const canvas = document.getElementById('prosperity-chart');
  if (!canvas) return;

  const theme = A.chartTheme();
  const MONO = { family: 'JetBrains Mono, monospace' };
  const TICK  = { font: { ...MONO, size: 10 }, color: theme.tick };

  // Compute median growth + median income for quadrant lines (median adapts to the
  // active metric so quadrants stay meaningful whether PPP or nominal is selected)
  const allGrowth = data.map(d => d.y).sort((a, b) => a - b);
  const mid = (arr) => arr.length % 2 ? arr[(arr.length - 1) / 2] : (arr[arr.length / 2 - 1] + arr[arr.length / 2]) / 2;
  const medGrowth = mid(allGrowth);
  const allInc    = data.map(d => d.x).sort((a, b) => a - b);
  const medPPP    = mid(allInc);

  _prosperityChartInst = new Chart(canvas.getContext('2d'), {
    type: 'bubble',
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        datalabels: { display: false },
        legend: {
          position: 'bottom',
          labels: { color: theme.tick, font: { ...MONO, size: 10 }, boxWidth: 10, padding: 12 },
        },
        tooltip: {
          backgroundColor: theme.tooltipBg,
          titleColor: theme.tooltipTitle,
          bodyColor: theme.tooltipBody,
          titleFont: { ...MONO, size: 10 },
          bodyFont:  { ...MONO, size: 11 },
          padding: 10,
          cornerRadius: 4,
          callbacks: {
            title: ctx => ctx[0]?.raw?._meta?.name || '',
            label: ctx => {
              const m = ctx.raw._meta;
              const lines = [
                `  ${tipLabel}: $${Math.round(m.ppp / 1000)}K (${m.pppYear})`,
                `  Growth: ${A.fmtSignedPct(m.growth)} a year (${m.growthYear})`,
              ];
              if (m.pop) lines.push(`  Pop: ${(m.pop / 1e6).toFixed(0)}M`);
              return lines;
            },
          },
        },
        annotation: undefined,
      },
      scales: {
        x: {
          title: { display: true, text: axisLabel, color: theme.tick, font: { ...MONO, size: 10 } },
          grid: { color: theme.grid },
          ticks: { ...TICK, callback: v => '$' + (v / 1000).toFixed(0) + 'K' },
        },
        y: {
          grace: '18%',
          title: { display: true, text: `Avg. real GDP growth ${PROS_GROWTH_FROM}–${PROS_GROWTH_TO} (%)`, color: theme.tick, font: { ...MONO, size: 10 } },
          grid: { color: theme.grid },
          ticks: { ...TICK, callback: v => A.fmtSignedPct(v) },
        },
      },
    },
    plugins: [{
      // G20 median crosshair and quadrant names, drawn under the bubbles
      beforeDatasetsDraw(chart) {
        const { ctx: c2, chartArea: a, scales: { x, y } } = chart;
        const mx = x.getPixelForValue(medPPP), my = y.getPixelForValue(medGrowth);
        c2.save();
        c2.strokeStyle = theme.tick; c2.lineWidth = 1; c2.setLineDash([5, 4]);
        c2.beginPath(); c2.moveTo(mx, a.top); c2.lineTo(mx, a.bottom); c2.moveTo(a.left, my); c2.lineTo(a.right, my); c2.stroke();
        c2.setLineDash([]);
        c2.font = '600 11px Inter Tight, system-ui, sans-serif';
        c2.fillStyle = theme.text2; c2.globalAlpha = 0.75;
        c2.textBaseline = 'top'; c2.textAlign = 'left';
        c2.fillText('CATCHING UP · poorer, growing faster', a.left + 8, a.top + 6);
        c2.textAlign = 'right';
        c2.fillText('RICH AND GROWING', a.right - 8, a.top + 6);
        c2.textBaseline = 'bottom';
        c2.fillText('RICH, SLOW-GROWING', a.right - 8, a.bottom - 6);
        c2.textAlign = 'left';
        c2.fillText('FALLING BEHIND · poorer, growing slower', a.left + 8, a.bottom - 6);
        c2.globalAlpha = 1; c2.font = '10px JetBrains Mono, monospace'; c2.fillStyle = theme.tick;
        c2.textAlign = 'left'; c2.textBaseline = 'bottom';
        c2.fillText(`G20 median ${A.fmtSignedPct(medGrowth)}`, a.left + 8, my - 3);
        c2.textBaseline = 'top';
        c2.fillText(`median $${Math.round(medPPP / 1000)}K`, mx + 4, a.top + 24);
        c2.restore();
      },
    }, {
      // Draw country name labels on each bubble
      afterDatasetsDraw(chart) {
        const ctx2 = chart.ctx;
        ctx2.save();
        ctx2.font = '9px JetBrains Mono, monospace';
        // Fixed on purpose: drawn on top of colored bubble fills, not the page
        // background, so it doesn't need to track the light/dark theme.
        ctx2.fillStyle = theme.tooltipBody;
        ctx2.textAlign = 'center';
        ctx2.textBaseline = 'middle';
        chart.data.datasets.forEach((ds, di) => {
          ds.data.forEach((pt, pi) => {
            const meta = chart.getDatasetMeta(di).data[pi];
            if (!meta) return;
            const name = pt._meta?.iso3 || '';
            ctx2.fillText(name, meta.x, meta.y);
          });
        });
        ctx2.restore();
      },
    }],
  });

  // Per-capita bars (reflect active metric)
  const titleEl = document.getElementById('pcap-title');
  const subEl   = document.getElementById('pcap-sub');
  if (titleEl) titleEl.textContent = isNominal ? 'GDP per Capita (Nominal)' : 'GDP per Capita PPP';
  if (subEl)   subEl.textContent   = isNominal ? 'US$ · highest first' : "Int'l $ · highest first";

  const pppRanked = [...data].sort((a, b) => b.ppp - a.ppp);
  const maxPPP = pppRanked[0].ppp;
  document.getElementById('ppp-bars').innerHTML = `<div class="bar-chart">${pppRanked.map(d => {
    const pct = (d.ppp / maxPPP) * 100;
    const col = REGION_COLORS[d.region]?.border || '#94a3b8';
    return `
    <div class="bar-row">
      <div class="bar-row__label">
        <span class="bar-row__flag" style="background-image:url('https://flagcdn.com/${d.code.toLowerCase()}.svg');background-size:cover;background-position:center;"></span>
        ${A.escapeText(d.name)}
      </div>
      <div class="bar-row__track">
        <div class="bar-row__bar" style="left:0;width:${pct}%;background:${col};opacity:.8"></div>
      </div>
      <div class="bar-row__val">$${Math.round(d.ppp / 1000)}K</div>
    </div>`;
  }).join('')}</div>`;

  // Quadrant analysis table
  const quadrants = [
    { label: 'Rich and growing',   cls: 'v-pos',  desc: 'Above-median income and above-median growth.', test: d => d.ppp >= medPPP && d.y >= medGrowth },
    { label: 'Catching up',        cls: '',       desc: 'Poorer, but growing faster than the median, so the income gap is closing.', test: d => d.ppp < medPPP  && d.y >= medGrowth },
    { label: 'Rich, slow-growing', cls: 'v-warn', desc: 'High income but below-median growth, typical of ageing advanced economies.', test: d => d.ppp >= medPPP && d.y < medGrowth  },
    { label: 'Falling behind',     cls: 'v-neg',  desc: 'Below-median income and growth, so the gap with richer peers is widening.', test: d => d.ppp < medPPP  && d.y < medGrowth  },
  ];
  document.getElementById('quadrant-table').innerHTML = quadrants.map(q => {
    const countries = data.filter(q.test);
    return `
    <div style="padding:10px 14px;border-bottom:1px solid var(--rule)">
      <div class="panel__title ${q.cls}" style="font-size:11px;margin-bottom:2px">${q.label}</div>
      <div style="font-size:11.5px;color:var(--text-3);margin-bottom:6px">${q.desc}</div>
      <div style="font-size:12px;color:var(--text-2);line-height:1.6">${countries.sort((a, b) => b.y - a.y).map(d => `${A.escapeText(d.name)} <span style="font-family:var(--font-mono);font-size:10.5px;color:var(--text-3)">${A.fmtSignedPct(d.y)}</span>`).join(' · ') || '—'}</div>
    </div>`;
  }).join('');
}

window.prosperityToggleX = function (btn, mode) {
  if (!window.Chart) return;
  // Scope the active-state reset to this toggle group only
  const group = btn.closest('.sec-head__actions') || document;
  group.querySelectorAll('.sec-head__tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  mountProsperityChart(mode);
};
