// AI Economy page — powered by AI Trajectory Index (github.com/ankitmishra01/ai-trajectory-index)

const AI_TRAJECTORY_URL = 'https://raw.githubusercontent.com/ankitmishra01/ai-trajectory-index/main/data/countries.json';

// IMF AI Labor Exposure — % of jobs highly exposed to AI displacement
// Source: IMF Working Paper "Artificial Intelligence and the Future of Work" (2024)
const AI_LABOR_EXPOSURE = {
  'United States': 60, 'Canada': 57, 'United Kingdom': 55, 'Japan': 54,
  'France': 53, 'Australia': 53, 'Germany': 52, 'Italy': 50,
  'South Korea': 48, 'Russia': 42, 'China': 40, 'Argentina': 37,
  'Saudi Arabia': 36, 'Brazil': 35, 'Mexico': 32, 'Turkey': 30,
  'South Africa': 29, 'India': 28, 'Indonesia': 26,
};

const DIM_LABELS = {
  infrastructure:     'Infrastructure',
  talent:             'Talent',
  governance:         'Governance',
  investment:         'Investment',
  economic_readiness: 'Econ. Readiness',
};
const DIM_COLORS = {
  infrastructure:     'rgba(59,130,246,0.8)',
  talent:             'rgba(16,185,129,0.8)',
  governance:         'rgba(139,92,246,0.8)',
  investment:         'rgba(245,158,11,0.8)',
  economic_readiness: 'rgba(236,72,153,0.8)',
};
const MONO = { family: "'JetBrains Mono', 'Geist Mono', monospace" };
const TICK  = { font: { ...MONO, size: 10 }, color: '#8A8A8A' };
const TT    = {
  backgroundColor: 'rgba(10,10,10,0.9)',
  titleColor: '#8A8A8A', bodyColor: '#F5F5F2',
  titleFont: { ...MONO, size: 10 }, bodyFont: { ...MONO, size: 11 },
  padding: 10, cornerRadius: 4,
};

// ── Data fetch ────────────────────────────────────────────────────────────────
async function loadAITrajectoryData() {
  if (window._aiTrajectoryData) return window._aiTrajectoryData;
  const r = await fetch(AI_TRAJECTORY_URL, { signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error('AI Trajectory fetch failed');
  const { countries } = await r.json();
  const G20_NAMES = new Set(window.G20.map(c => c.name));
  const g20Data = countries.filter(c => G20_NAMES.has(c.name));
  // Build lookup by name
  const byName = {};
  g20Data.forEach(c => { byName[c.name] = c; });
  window._aiTrajectoryData = byName;
  return byName;
}

// ── Render ────────────────────────────────────────────────────────────────────
function renderAIEconomy() {
  // Hero tiles use hardcoded exposure data (synchronous)
  const exposureVals = Object.values(AI_LABOR_EXPOSURE);
  const maxExposure = Math.max(...exposureVals);
  const maxExposureCountry = Object.entries(AI_LABOR_EXPOSURE).find(([,v]) => v === maxExposure)?.[0];
  const medianExposure = [...exposureVals].sort((a,b)=>a-b)[Math.floor(exposureVals.length/2)];

  return `
<div class="page-body">

  <div class="sec-head">
    <div class="sec-head__title">AI Economy <span class="count">G20</span><span class="sec-head__sub">AI readiness · trajectory · workforce displacement risk</span></div>
    <div class="sec-head__actions">
      <a href="https://ai-trajectory-index.vercel.app" target="_blank" rel="noopener" class="sec-head__tab" style="text-decoration:none">
        Full Index ↗
      </a>
    </div>
  </div>

  <!-- Hero KPI strip -->
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px">
    <div class="panel"><div class="panel__body" style="padding:14px 16px">
      <div class="kpi-tile__lbl">Top AI Score</div>
      <div class="kpi-tile__val" id="hero-top-score">—<span class="unit">/100</span></div>
      <div class="kpi-tile__delta" id="hero-top-name">Loading…</div>
    </div></div>
    <div class="panel"><div class="panel__body" style="padding:14px 16px">
      <div class="kpi-tile__lbl">Fastest Rising</div>
      <div class="kpi-tile__val" id="hero-traj-val">—<span class="unit">pts</span></div>
      <div class="kpi-tile__delta" id="hero-traj-name">by 2028</div>
    </div></div>
    <div class="panel"><div class="panel__body" style="padding:14px 16px">
      <div class="kpi-tile__lbl">G20 Median Score</div>
      <div class="kpi-tile__val" id="hero-median">—<span class="unit">/100</span></div>
      <div class="kpi-tile__delta">AI Trajectory Index</div>
    </div></div>
    <div class="panel"><div class="panel__body" style="padding:14px 16px">
      <div class="kpi-tile__lbl">Max Job Exposure</div>
      <div class="kpi-tile__val">${maxExposure}<span class="unit">%</span></div>
      <div class="kpi-tile__delta">${A.escapeText(maxExposureCountry)} · IMF 2024</div>
    </div></div>
  </div>

  <!-- Section 1: AI Readiness Rankings -->
  <div class="sec-head">
    <div class="sec-head__title">AI Readiness <span class="sec-head__sub">5 dimensions · Infrastructure · Talent · Governance · Investment · Econ. Readiness</span></div>
  </div>
  <div class="panel" style="margin-bottom:20px">
    <div class="panel__body" style="padding:16px 20px">
      <div style="position:relative;height:500px"><canvas id="ai-readiness-chart"></canvas></div>
    </div>
  </div>

  <!-- Section 2: 2028 Trajectory + Risers/Fallers -->
  <div class="sec-head">
    <div class="sec-head__title">2028 Trajectory <span class="sec-head__sub">projected score change from current</span></div>
  </div>
  <div class="row-2" style="margin-bottom:20px">
    <div class="panel">
      <div class="panel__body" style="padding:16px 20px">
        <div style="position:relative;height:380px"><canvas id="ai-trajectory-chart"></canvas></div>
      </div>
    </div>
    <div class="panel">
      <div class="panel__head">
        <div><span class="panel__title">Risers &amp; Fallers</span><span class="panel__sub">projected 2028 momentum</span></div>
      </div>
      <div class="panel__body" id="ai-trajectory-table" style="padding:0"></div>
    </div>
  </div>

  <!-- Section 3: Displacement vs Readiness (money shot) -->
  <div class="sec-head">
    <div class="sec-head__title">Displacement Risk vs AI Readiness <span class="sec-head__sub">bubble = GDP per capita PPP · x = AI job exposure (IMF 2024) · y = AI readiness score</span></div>
  </div>
  <div class="panel" style="margin-bottom:20px">
    <div class="panel__body" style="padding:16px 20px">
      <div style="position:relative;height:500px"><canvas id="ai-scatter-chart"></canvas></div>
    </div>
  </div>

  <!-- Section 4: AI Score vs GDP Growth -->
  <div class="sec-head">
    <div class="sec-head__title">AI Readiness vs GDP Growth <span class="sec-head__sub">does AI investment translate to growth?</span></div>
  </div>
  <div class="row-2" style="margin-bottom:20px">
    <div class="panel">
      <div class="panel__body" style="padding:16px 20px">
        <div style="position:relative;height:340px"><canvas id="ai-growth-chart"></canvas></div>
      </div>
    </div>
    <div class="panel">
      <div class="panel__head">
        <div><span class="panel__title">Risk Zone Analysis</span><span class="panel__sub">displacement × readiness × income</span></div>
      </div>
      <div class="panel__body" id="ai-risk-table" style="padding:0"></div>
    </div>
  </div>

  <div class="methodology">
    <h4>Data sources</h4>
    AI readiness scores and 2028 trajectory from
    <a href="https://ai-trajectory-index.vercel.app" target="_blank" rel="noopener">AI Trajectory Index</a>
    — 186 countries scored across Infrastructure, Talent, Governance, Investment, and Economic Readiness.
    AI labor exposure (% jobs highly exposed) from IMF Working Paper "Artificial Intelligence and the Future of Work" (2024).
    GDP growth and GDP per capita PPP from World Bank Open Data via Supabase.
  </div>

</div>`;
}

// ── Charts ────────────────────────────────────────────────────────────────────
async function mountAIEconomyCharts() {
  // Show loading state
  ['ai-readiness-chart','ai-trajectory-chart','ai-scatter-chart','ai-growth-chart'].forEach(id => {
    const canvas = document.getElementById(id);
    if (canvas) canvas.parentNode.style.opacity = '0.4';
  });

  let aiData;
  try {
    aiData = await loadAITrajectoryData();
  } catch (e) {
    ['ai-readiness-chart','ai-trajectory-chart','ai-scatter-chart','ai-growth-chart'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.parentNode.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-4);font-size:12px;font-family:var(--font-mono)">AI Trajectory data unavailable</div>';
    });
    return;
  }

  // Build sorted G20 list
  const nonEU = window.G20.filter(c => c.iso3 !== 'EUU');
  const sorted = nonEU
    .map(c => ({ ...c, ai: aiData[c.name] }))
    .filter(c => c.ai)
    .sort((a, b) => b.ai.total_score - a.ai.total_score);

  // Update hero tiles
  const topCountry = sorted[0];
  const fastestRising = [...sorted].sort((a,b) => b.ai.trajectory_score - a.ai.trajectory_score)[0];
  const scores = sorted.map(c => c.ai.total_score).sort((a,b)=>a-b);
  const medianScore = scores[Math.floor(scores.length/2)];

  document.getElementById('hero-top-score').innerHTML = `${topCountry.ai.total_score}<span class="unit">/100</span>`;
  document.getElementById('hero-top-name').textContent = topCountry.name;
  document.getElementById('hero-traj-val').innerHTML = `+${fastestRising.ai.trajectory_score}<span class="unit"> pts</span>`;
  document.getElementById('hero-traj-name').textContent = `${fastestRising.name} → ${fastestRising.ai.projected_score_2028}`;
  document.getElementById('hero-median').innerHTML = `${medianScore}<span class="unit">/100</span>`;

  // Restore opacity
  ['ai-readiness-chart','ai-trajectory-chart','ai-scatter-chart','ai-growth-chart'].forEach(id => {
    const canvas = document.getElementById(id);
    if (canvas) canvas.parentNode.style.opacity = '1';
  });

  mountReadinessChart(sorted);
  mountTrajectoryChart(sorted);
  mountScatterChart(sorted);
  mountGrowthChart(sorted);
  renderRiskTable(sorted);
  renderTrajectoryTable(sorted);
}

function mountReadinessChart(sorted) {
  const canvas = document.getElementById('ai-readiness-chart');
  if (!canvas) return;

  const labels = sorted.map(c => c.name);
  const dims = ['infrastructure', 'talent', 'governance', 'investment', 'economic_readiness'];

  new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: dims.map(dim => ({
        label: DIM_LABELS[dim],
        data: sorted.map(c => c.ai.scores[dim]?.score ?? 0),
        backgroundColor: DIM_COLORS[dim],
        borderRadius: 0,
      })),
    },
    options: {
      indexAxis: 'y',
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { color: '#8A8A8A', font: { ...MONO, size: 10 }, boxWidth: 12, padding: 10 } },
        tooltip: {
          ...TT,
          callbacks: {
            title: ctx => ctx[0]?.label,
            label: ctx => `  ${ctx.dataset.label}: ${ctx.parsed.x}/20`,
            footer: ctx => `  Total: ${ctx.reduce((s,c)=>s+c.parsed.x,0)}/100`,
          },
        },
        datalabels: { display: false },
      },
      scales: {
        x: { stacked: true, max: 100, grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { ...TICK, callback: v => v } },
        y: { stacked: true, grid: { display: false }, ticks: { ...TICK, font: { ...MONO, size: 10 } } },
      },
    },
  });
}

function mountTrajectoryChart(sorted) {
  const canvas = document.getElementById('ai-trajectory-chart');
  if (!canvas) return;

  const byTraj = [...sorted].sort((a, b) => b.ai.trajectory_score - a.ai.trajectory_score);

  new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: byTraj.map(c => c.name),
      datasets: [{
        data: byTraj.map(c => c.ai.projected_score_2028 - c.ai.total_score),
        backgroundColor: byTraj.map(c => c.ai.trajectory_score >= 0 ? 'rgba(52,211,153,0.8)' : 'rgba(248,113,113,0.8)'),
        borderRadius: 3,
        barThickness: 14,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          ...TT,
          callbacks: {
            title: ctx => ctx[0]?.label,
            label: ctx => [
              `  Now: ${byTraj[ctx[0].dataIndex].ai.total_score}/100`,
              `  2028: ${byTraj[ctx[0].dataIndex].ai.projected_score_2028}/100`,
              `  Change: ${ctx[0].parsed.x > 0 ? '+' : ''}${ctx[0].parsed.x.toFixed(0)} pts`,
            ],
          },
        },
        datalabels: { display: false },
      },
      scales: {
        x: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { ...TICK, callback: v => (v > 0 ? '+' : '') + v } },
        y: { grid: { display: false }, ticks: { ...TICK } },
      },
    },
  });
}

function mountScatterChart(sorted) {
  const canvas = document.getElementById('ai-scatter-chart');
  if (!canvas) return;

  const REGION_COLORS_LOCAL = {
    'Americas':    { bg: 'rgba(59,130,246,0.75)',  border: '#3b82f6' },
    'Europe':      { bg: 'rgba(139,92,246,0.75)',  border: '#8b5cf6' },
    'Asia':        { bg: 'rgba(16,185,129,0.75)',  border: '#10b981' },
    'Middle East': { bg: 'rgba(245,158,11,0.75)',  border: '#f59e0b' },
    'Africa':      { bg: 'rgba(239,68,68,0.75)',   border: '#ef4444' },
  };

  const regions = [...new Set(sorted.map(c => c.region))];
  const datasets = regions.map(region => {
    const col = REGION_COLORS_LOCAL[region] || { bg: 'rgba(148,163,184,0.7)', border: '#94a3b8' };
    const countries = sorted.filter(c => c.region === region);
    return {
      label: region,
      data: countries.map(c => {
        const ppp = window.G20Data.getLatest(c.iso3, 'GDP_CAPITA_PPP');
        const r = ppp?.value ? Math.max(5, Math.min(26, Math.sqrt(ppp.value / 1000) * 0.9)) : 8;
        return {
          x: AI_LABOR_EXPOSURE[c.name] ?? 35,
          y: c.ai.total_score,
          r,
          _meta: { name: c.name, iso3: c.iso3, score: c.ai.total_score, exposure: AI_LABOR_EXPOSURE[c.name], ppp: ppp?.value },
        };
      }),
      backgroundColor: col.bg,
      borderColor: col.border,
      borderWidth: 1.5,
    };
  });

  // Quadrant thresholds (approximate G20 medians)
  const medExposure = 40;
  const medScore = 60;

  new Chart(canvas.getContext('2d'), {
    type: 'bubble',
    data: { datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { color: '#8A8A8A', font: { ...MONO, size: 10 }, boxWidth: 10, padding: 12 } },
        tooltip: {
          ...TT,
          callbacks: {
            title: ctx => ctx[0]?.raw?._meta?.name || '',
            label: ctx => {
              const m = ctx.raw._meta;
              return [
                `  AI Readiness: ${m.score}/100`,
                `  Job Exposure: ${m.exposure}%`,
                m.ppp ? `  PPP: $${Math.round(m.ppp/1000)}K` : '',
              ].filter(Boolean);
            },
          },
        },
        datalabels: { display: false },
      },
      scales: {
        x: {
          title: { display: true, text: 'AI Labor Exposure (% of jobs)', color: '#64748b', font: { ...MONO, size: 10 } },
          min: 20, max: 65,
          grid: { color: 'rgba(0,0,0,0.04)' },
          ticks: { ...TICK, callback: v => v + '%' },
        },
        y: {
          title: { display: true, text: 'AI Readiness Score', color: '#64748b', font: { ...MONO, size: 10 } },
          min: 35, max: 95,
          grid: { color: 'rgba(0,0,0,0.04)' },
          ticks: { ...TICK },
        },
      },
    },
    plugins: [{
      afterDraw(chart) {
        const ctx2 = chart.ctx;
        const { left, right, top, bottom } = chart.chartArea;
        const xScale = chart.scales.x;
        const yScale = chart.scales.y;
        const xMid = xScale.getPixelForValue(medExposure);
        const yMid = yScale.getPixelForValue(medScore);

        ctx2.save();

        // Quadrant backgrounds
        const zones = [
          { x1: xMid, x2: right,  y1: top,    y2: yMid,   color: 'rgba(52,211,153,0.05)',  label: 'Managed',       lx: (xMid+right)/2,  ly: top + 14 },
          { x1: left,  x2: xMid,  y1: top,    y2: yMid,   color: 'rgba(59,130,246,0.05)',  label: 'Insulated',     lx: (left+xMid)/2,   ly: top + 14 },
          { x1: xMid, x2: right,  y1: yMid,   y2: bottom, color: 'rgba(239,68,68,0.07)',   label: 'Risk Zone',     lx: (xMid+right)/2,  ly: bottom - 10 },
          { x1: left,  x2: xMid,  y1: yMid,   y2: bottom, color: 'rgba(245,158,11,0.05)',  label: 'Transitioning', lx: (left+xMid)/2,   ly: bottom - 10 },
        ];
        zones.forEach(z => {
          ctx2.fillStyle = z.color;
          ctx2.fillRect(z.x1, z.y1, z.x2 - z.x1, z.y2 - z.y1);
          ctx2.fillStyle = 'rgba(148,163,184,0.5)';
          ctx2.font = '9px JetBrains Mono, monospace';
          ctx2.textAlign = 'center';
          ctx2.fillText(z.label.toUpperCase(), z.lx, z.ly);
        });

        // Crosshair lines
        ctx2.setLineDash([4, 4]);
        ctx2.strokeStyle = 'rgba(148,163,184,0.3)';
        ctx2.lineWidth = 1;
        ctx2.beginPath(); ctx2.moveTo(xMid, top); ctx2.lineTo(xMid, bottom); ctx2.stroke();
        ctx2.beginPath(); ctx2.moveTo(left, yMid); ctx2.lineTo(right, yMid); ctx2.stroke();

        ctx2.restore();
      },
      afterDatasetsDraw(chart) {
        const ctx2 = chart.ctx;
        ctx2.save();
        ctx2.font = 'bold 9px JetBrains Mono, monospace';
        ctx2.fillStyle = '#F5F5F2';
        ctx2.textAlign = 'center';
        ctx2.textBaseline = 'middle';
        chart.data.datasets.forEach((ds, di) => {
          ds.data.forEach((pt, pi) => {
            const meta = chart.getDatasetMeta(di).data[pi];
            if (!meta) return;
            ctx2.fillText(pt._meta?.iso3 || '', meta.x, meta.y);
          });
        });
        ctx2.restore();
      },
    }],
  });
}

function mountGrowthChart(sorted) {
  const canvas = document.getElementById('ai-growth-chart');
  if (!canvas) return;

  const points = sorted.map(c => {
    const g = window.G20Data.getLatest(c.iso3, 'GDP_GROWTH');
    if (!g) return null;
    return { x: c.ai.total_score, y: g.value, _meta: { name: c.name, iso3: c.iso3, year: g.year } };
  }).filter(Boolean);

  // Linear regression
  const n = points.length;
  const sumX = points.reduce((s,p) => s + p.x, 0);
  const sumY = points.reduce((s,p) => s + p.y, 0);
  const sumXY = points.reduce((s,p) => s + p.x * p.y, 0);
  const sumX2 = points.reduce((s,p) => s + p.x * p.x, 0);
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  const xMin = Math.min(...points.map(p=>p.x)) - 2;
  const xMax = Math.max(...points.map(p=>p.x)) + 2;

  new Chart(canvas.getContext('2d'), {
    type: 'scatter',
    data: {
      datasets: [
        {
          label: 'G20 Countries',
          data: points,
          backgroundColor: 'rgba(10,10,10,0.75)',
          pointRadius: 6,
          pointHoverRadius: 8,
        },
        {
          label: 'Trend',
          data: [{ x: xMin, y: slope*xMin+intercept }, { x: xMax, y: slope*xMax+intercept }],
          type: 'line',
          borderColor: 'rgba(245,158,11,0.5)',
          borderDash: [5,3],
          borderWidth: 1.5,
          pointRadius: 0,
          fill: false,
        },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          ...TT,
          filter: item => item.datasetIndex === 0,
          callbacks: {
            title: ctx => ctx[0]?.raw?._meta?.name || '',
            label: ctx => [
              `  AI Readiness: ${ctx.parsed.x}/100`,
              `  GDP Growth: ${A.fmtSignedPct(ctx.parsed.y)} (${ctx.raw._meta?.year})`,
            ],
          },
        },
        datalabels: { display: false },
      },
      scales: {
        x: {
          title: { display: true, text: 'AI Readiness Score', color: '#64748b', font: { ...MONO, size: 10 } },
          grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { ...TICK },
        },
        y: {
          title: { display: true, text: 'GDP Growth Rate (%)', color: '#64748b', font: { ...MONO, size: 10 } },
          grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { ...TICK, callback: v => A.fmtSignedPct(v) },
        },
      },
    },
    plugins: [{
      afterDatasetsDraw(chart) {
        const ctx2 = chart.ctx;
        ctx2.save();
        ctx2.font = '9px JetBrains Mono, monospace';
        ctx2.fillStyle = '#8A8A8A';
        ctx2.textAlign = 'left';
        ctx2.textBaseline = 'middle';
        const ds = chart.getDatasetMeta(0);
        ds.data.forEach((pt, i) => {
          const d = points[i];
          if (!d) return;
          ctx2.fillText(d._meta.iso3, pt.x + 6, pt.y);
        });
        ctx2.restore();
      },
    }],
  });
}

function renderTrajectoryTable(sorted) {
  const el = document.getElementById('ai-trajectory-table');
  if (!el) return;

  const byTraj = [...sorted].sort((a,b) => b.ai.trajectory_score - a.ai.trajectory_score);
  const risers  = byTraj.slice(0, 5);
  const fallers = byTraj.slice(-3).reverse();

  el.innerHTML = `
    <div style="padding:10px 14px;border-bottom:1px solid var(--rule)">
      <div class="panel__title v-pos" style="font-size:11px;margin-bottom:8px">Top Risers</div>
      ${risers.map(c => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;font-size:12px;border-bottom:1px solid rgba(0,0,0,.04)">
          <span style="color:var(--text-2)">${A.escapeText(c.name)}</span>
          <span style="font-family:var(--font-mono);font-size:11px">
            ${c.ai.total_score} → <span style="color:#34d399">${c.ai.projected_score_2028}</span>
            <span style="color:var(--text-4);margin-left:4px">(+${c.ai.trajectory_score})</span>
          </span>
        </div>`).join('')}
    </div>
    <div style="padding:10px 14px">
      <div class="panel__title v-neg" style="font-size:11px;margin-bottom:8px">Watch List</div>
      ${fallers.map(c => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;font-size:12px;border-bottom:1px solid rgba(0,0,0,.04)">
          <span style="color:var(--text-2)">${A.escapeText(c.name)}</span>
          <span style="font-family:var(--font-mono);font-size:11px">
            ${c.ai.total_score} → <span style="color:#F87171">${c.ai.projected_score_2028}</span>
            <span style="color:var(--text-4);margin-left:4px">(${c.ai.trajectory_score > 0 ? '+' : ''}${c.ai.trajectory_score})</span>
          </span>
        </div>`).join('')}
    </div>`;
}

function renderRiskTable(sorted) {
  const el = document.getElementById('ai-risk-table');
  if (!el) return;

  const classified = sorted.map(c => {
    const exp = AI_LABOR_EXPOSURE[c.name] ?? 35;
    const score = c.ai.total_score;
    let zone, cls;
    if (exp >= 40 && score < 60)       { zone = 'Risk Zone';     cls = 'ai-risk-zone'; }
    else if (exp >= 40 && score >= 60)  { zone = 'Managed';       cls = 'ai-risk-managed'; }
    else if (exp < 40 && score >= 60)   { zone = 'Insulated';     cls = 'ai-risk-insulated'; }
    else                                { zone = 'Transitioning'; cls = 'ai-risk-transitioning'; }
    return { ...c, exp, score, zone, cls };
  }).sort((a,b) => {
    const order = ['Risk Zone','Transitioning','Managed','Insulated'];
    return order.indexOf(a.zone) - order.indexOf(b.zone);
  });

  el.innerHTML = classified.map(c => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 14px;border-bottom:1px solid var(--rule)">
      <span style="font-size:12px;color:var(--text-2)">${A.escapeText(c.name)}</span>
      <div style="display:flex;align-items:center;gap:10px">
        <span style="font-family:var(--font-mono);font-size:10px;color:var(--text-4)">${c.exp}% exp · ${c.score}/100</span>
        <span class="ai-risk-badge ${c.cls}">${c.zone}</span>
      </div>
    </div>`).join('');
}
