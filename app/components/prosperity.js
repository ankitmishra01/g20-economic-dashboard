// Prosperity page — GDP per Capita PPP vs Growth bubble chart

const REGION_COLORS = {
  'Americas':    { bg: 'rgba(59,130,246,0.75)',  border: '#3b82f6' },
  'Europe':      { bg: 'rgba(139,92,246,0.75)',  border: '#8b5cf6' },
  'Asia':        { bg: 'rgba(16,185,129,0.75)',  border: '#10b981' },
  'Middle East': { bg: 'rgba(245,158,11,0.75)',  border: '#f59e0b' },
  'Africa':      { bg: 'rgba(239,68,68,0.75)',   border: '#ef4444' },
};

function renderProsperity() {
  return `
<div class="page-body">
  <div class="sec-head">
    <div class="sec-head__title">Prosperity Map <span class="count">G20</span><span class="sec-head__sub">GDP per capita (PPP) vs growth rate · bubble size = population</span></div>
    <div class="sec-head__actions">
      <button class="sec-head__tab active">PPP</button>
      <button class="sec-head__tab" onclick="prosperityToggleX(this,'nominal')">Nominal</button>
    </div>
  </div>

  <div class="panel" style="margin-bottom:20px">
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
  <div class="row-2" style="margin-bottom:20px">
    <div class="panel">
      <div class="panel__head">
        <div><span class="panel__title">GDP per Capita PPP</span><span class="panel__sub">Int'l $ · highest first</span></div>
      </div>
      <div class="panel__body" id="ppp-bars"></div>
    </div>
    <div class="panel">
      <div class="panel__head">
        <div><span class="panel__title">Growth vs Income</span><span class="panel__sub">2024 · quadrant analysis</span></div>
      </div>
      <div class="panel__body" id="quadrant-table"></div>
    </div>
  </div>
</div>`;
}

function mountProsperityChart() {
  if (!window.Chart) { setTimeout(mountProsperityChart, 200); return; }
  const nonEU = c => c.iso3 !== 'EUU';

  // Build bubble data
  const data = window.G20.filter(nonEU).map(c => {
    const ppp    = window.G20Data.getLatest(c.iso3, 'GDP_CAPITA_PPP');
    const growth = window.G20Data.getLatest(c.iso3, 'GDP_GROWTH');
    const pop    = window.G20Data.getLatest(c.iso3, 'POPULATION');
    if (!ppp || !growth) return null;
    return {
      iso3: c.iso3, name: c.name, code: c.code, region: c.region,
      x: ppp.value,
      y: growth.value,
      r: pop?.value ? Math.max(5, Math.min(30, Math.sqrt(pop.value / 1e6) * 1.8)) : 8,
      ppp: ppp.value, growth: growth.value, pop: pop?.value, pppYear: ppp.year, growthYear: growth.year,
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

  const MONO = { family: 'JetBrains Mono, monospace' };
  const TICK  = { font: { ...MONO, size: 10 }, color: '#8A8A8A' };

  // Compute median growth for quadrant lines
  const allGrowth = data.map(d => d.y).sort((a, b) => a - b);
  const medGrowth = allGrowth[Math.floor(allGrowth.length / 2)];
  const medPPP    = 25000; // rough G20 PPP midpoint

  new Chart(canvas.getContext('2d'), {
    type: 'bubble',
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: '#8A8A8A', font: { ...MONO, size: 10 }, boxWidth: 10, padding: 12 },
        },
        tooltip: {
          backgroundColor: 'rgba(10,10,10,0.9)',
          titleColor: '#8A8A8A',
          bodyColor: '#F5F5F2',
          titleFont: { ...MONO, size: 10 },
          bodyFont:  { ...MONO, size: 11 },
          padding: 10,
          cornerRadius: 4,
          callbacks: {
            title: ctx => ctx[0]?.raw?._meta?.name || '',
            label: ctx => {
              const m = ctx.raw._meta;
              const lines = [
                `  PPP: $${Math.round(m.ppp / 1000)}K (${m.pppYear})`,
                `  Growth: ${A.fmtSignedPct(m.growth)} (${m.growthYear})`,
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
          title: { display: true, text: 'GDP per Capita PPP (Int\'l $)', color: '#64748b', font: { ...MONO, size: 10 } },
          grid: { color: 'rgba(0,0,0,0.04)' },
          ticks: { ...TICK, callback: v => '$' + (v / 1000).toFixed(0) + 'K' },
        },
        y: {
          title: { display: true, text: 'GDP Growth Rate (%)', color: '#64748b', font: { ...MONO, size: 10 } },
          grid: { color: 'rgba(0,0,0,0.04)' },
          ticks: { ...TICK, callback: v => A.fmtSignedPct(v) },
        },
      },
    },
    plugins: [{
      // Draw country name labels on each bubble
      afterDatasetsDraw(chart) {
        const ctx2 = chart.ctx;
        ctx2.save();
        ctx2.font = '9px JetBrains Mono, monospace';
        ctx2.fillStyle = '#F5F5F2';
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

  // PPP bars
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
    { label: 'High Income + Growth', cls: 'v-pos', test: d => d.ppp >= medPPP && d.y >= medGrowth },
    { label: 'Catching Up',          cls: '',       test: d => d.ppp < medPPP  && d.y >= medGrowth },
    { label: 'Stagnating',           cls: 'v-warn', test: d => d.ppp >= medPPP && d.y < medGrowth  },
    { label: 'Challenged',           cls: 'v-neg',  test: d => d.ppp < medPPP  && d.y < medGrowth  },
  ];
  document.getElementById('quadrant-table').innerHTML = quadrants.map(q => {
    const countries = data.filter(q.test);
    return `
    <div style="padding:10px 14px;border-bottom:1px solid var(--rule)">
      <div class="panel__title ${q.cls}" style="font-size:11px;margin-bottom:6px">${q.label}</div>
      <div style="font-size:12px;color:var(--text-2);line-height:1.6">${countries.map(d => A.escapeText(d.name)).join(' · ') || '—'}</div>
    </div>`;
  }).join('');
}

window.prosperityToggleX = function (btn, mode) {
  if (!window.Chart) return;
  document.querySelectorAll('.sec-head__tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  mountProsperityChart();
};
