// AI Economy page — powered by AI Trajectory Index (github.com/ankitmishra01/ai-trajectory-index)

const AI_TRAJECTORY_URL = 'https://raw.githubusercontent.com/ankitmishra01/ai-trajectory-index/main/data/countries.json';

// IMF AI labour exposure: % of jobs highly exposed to AI displacement
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
// Functions, not constants: Chart.js option colors are static once a chart is
// created, so these must be re-resolved from CSS custom properties fresh at
// each mount — including a dark-mode-triggered remount.
function tick() { return { font: { ...MONO, size: 10 }, color: A.chartTheme().tick }; }
function chartGrid() { return A.chartTheme().grid; }
function tt() {
  const theme = A.chartTheme();
  return {
    backgroundColor: theme.tooltipBg,
    titleColor: theme.tooltipTitle, bodyColor: theme.tooltipBody,
    titleFont: { ...MONO, size: 10 }, bodyFont: { ...MONO, size: 11 },
    padding: 10, cornerRadius: 4,
  };
}

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
  <div class="ai-kpi-strip" style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px">
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

  <!-- G20 AI Landscape Editorial — injected async after data loads -->
  <div id="ai-editorial" class="ai-editorial-placeholder">
    <div style="height:4px;background:linear-gradient(90deg,var(--bg-3) 25%,var(--bg-2) 50%,var(--bg-3) 75%);background-size:200% 100%;border-radius:2px;animation:shimmer 1.4s infinite"></div>
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
    <div class="sec-head__title">Displacement Risk vs AI Readiness <span class="sec-head__sub">flag size = GDP per capita PPP · x = AI job exposure (IMF 2024) · y = AI readiness score</span></div>
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
    <a href="https://ai-trajectory-index.vercel.app" target="_blank" rel="noopener">AI Trajectory Index</a>,
    covering 186 countries scored across Infrastructure, Talent, Governance, Investment, and Economic Readiness.
    AI labour exposure (% jobs highly exposed) from IMF Working Paper "Artificial Intelligence and the Future of Work" (2024).
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
  renderAIEconomyEditorial(aiData, sorted);
}

// ── AI Economy Editorial ──────────────────────────────────────────────────────
function renderAIEconomyEditorial(aiData, g20sorted) {
  const el = document.getElementById('ai-editorial');
  if (!el) return;

  // Computed inputs
  const top5    = g20sorted.slice(0, 5);
  const bottom5 = g20sorted.slice(-5);
  const scores  = g20sorted.map(c => c.ai.total_score);
  const srtScores = [...scores].sort((a, b) => a - b);
  const medScore  = srtScores[Math.floor(srtScores.length / 2)];
  const top5avg   = Math.round(top5.reduce((s, c) => s + c.ai.total_score, 0) / top5.length);
  const bot5avg   = Math.round(bottom5.reduce((s, c) => s + c.ai.total_score, 0) / bottom5.length);
  const gap       = top5avg - bot5avg;

  const trajSorted = [...g20sorted].sort((a, b) => b.ai.trajectory_score - a.ai.trajectory_score);
  const top3Traj   = trajSorted.slice(0, 3);
  const watchList  = trajSorted.slice(-3).reverse();

  const riskZone = g20sorted.filter(c =>
    (AI_LABOR_EXPOSURE[c.name] ?? 35) >= 40 && c.ai.total_score < 60
  );

  const growthOutliers = g20sorted.filter(c => {
    const g = window.G20Data?.getLatest(c.iso3, 'GDP_GROWTH');
    return g && g.value > 4 && c.ai.total_score < 65;
  });

  // Paragraph 1 — The Divide
  const p1 = `The G20 AI landscape is bifurcated along familiar economic lines. The five leading economies (${top5.map(c => `<strong>${A.escapeText(c.name)}</strong>`).join(', ')}) average ${top5avg}/100 on the AI Trajectory Index, while the bottom five (${bottom5.map(c => A.escapeText(c.name)).join(', ')}) average just ${bot5avg}/100. That ${gap}-point gap reflects decades of divergent investment in digital infrastructure, STEM pipelines, and technology governance frameworks. The G20 median stands at ${medScore}/100, with ${g20sorted.filter(c => c.ai.total_score >= medScore).length} of 19 economies at or above that threshold.`;

  // Paragraph 2 — The Risk Zone
  let p2;
  if (riskZone.length === 0) {
    p2 = `The displacement risk analysis reveals no G20 economy in the danger quadrant, where high AI job exposure combines with low institutional readiness, at current trajectory. However, several emerging-market members sit close to the threshold. As AI adoption accelerates in services and light manufacturing through 2027, readiness investment will determine whether the G20's developing economies manage the workforce transition or absorb it as structural unemployment.`;
  } else {
    const rzNames = riskZone.map(c => `<strong>${A.escapeText(c.name)}</strong> (${AI_LABOR_EXPOSURE[c.name]}% exposure, ${c.ai.total_score}/100 readiness)`);
    p2 = `The displacement risk analysis flags ${riskZone.length} G20 ${riskZone.length === 1 ? 'economy' : 'economies'} in the risk quadrant, where AI job exposure exceeds 40% and readiness scores fall below 60: ${rzNames.join('; ')}. These economies face compressed timelines, with automation reaching their workforces faster than the institutional infrastructure needed to retrain and redeploy affected workers. Unless readiness investment accelerates materially before 2027, structural displacement rather than cyclical unemployment becomes the more likely outcome.`;
  }

  // Paragraph 3 — The Trajectory Story
  const p3Parts = top3Traj.map(c =>
    `<strong>${A.escapeText(c.name)}</strong> projects a gain of +${c.ai.trajectory_score} points to ${c.ai.projected_score_2028}/100 by 2028, driven by ${A.escapeText(c.ai.top_accelerator || c.ai.trajectory_label || 'strong policy momentum')}`
  );
  const p3 = `Three economies stand out on trajectory. ${p3Parts.join('. ')}. However, trajectory scores reflect policy commitments and investment pipelines not yet translated into measurable capability gain. The gap between declared AI strategy and observable progress typically runs 18 to 36 months.`;

  // Paragraph 4 — The Productivity Lag
  let p4;
  if (growthOutliers.length > 0) {
    const outlierText = growthOutliers.map(c => {
      const g = window.G20Data.getLatest(c.iso3, 'GDP_GROWTH');
      return `<strong>${A.escapeText(c.name)}</strong> (${g.value.toFixed(1)}% GDP growth at ${c.ai.total_score}/100 AI readiness)`;
    }).join(' and ');
    p4 = `Across the G20, AI readiness and near-term GDP growth show only a weak correlation, consistent with early-phase technology adoption where infrastructure build-out precedes productivity payoff. ${outlierText} illustrate the paradox: catch-up growth dynamics and demographic dividends can outpace readiness-driven productivity gains in the short run. The productive payoff of AI investment is likely to concentrate in the 2026 to 2030 window as adoption crosses the deployment threshold. First-mover advantage should accrue to ${top3Traj.slice(0, 2).map(c => A.escapeText(c.name)).join(' and ')}, whose current trajectory positions them to capture outsized productivity gains as frontier AI diffuses into enterprise operations.`;
  } else {
    p4 = `Across the G20, AI readiness and near-term GDP growth show only a weak positive correlation, consistent with early-phase technology diffusion where infrastructure build-out precedes measurable productivity payoff. Advanced economies with the highest AI scores are largely growing at 1% to 3%, while some emerging-market members with lower readiness scores are growing at 4% to 6%. The productive payoff of AI readiness is likely to concentrate in the 2026 to 2030 window as adoption crosses the enterprise deployment threshold. First-mover advantage should accrue to ${top3Traj.slice(0, 2).map(c => A.escapeText(c.name)).join(' and ')}, whose current trajectory positions them to capture outsized productivity gains once frontier AI diffuses into the broader economy.`;
  }

  // Sidebar
  const sidebarHTML = `
    <div class="ai-editorial-sidebar">
      <div class="ai-editorial-sidebar__hd">Rising Fast</div>
      ${trajSorted.slice(0, 5).map(c => `
        <div class="ai-editorial-sidebar__row">
          <span>${A.escapeText(c.name)}</span>
          <span class="ai-editorial-sidebar__score">${c.ai.total_score} → <span style="color:var(--status-stable-fg)">${c.ai.projected_score_2028}</span></span>
        </div>`).join('')}
      <div class="ai-editorial-sidebar__hd" style="margin-top:16px">Watch List</div>
      ${watchList.map(c => `
        <div class="ai-editorial-sidebar__row">
          <span>${A.escapeText(c.name)}</span>
          <span class="ai-editorial-sidebar__score" style="color:var(--text-3);font-size:10px;max-width:120px;text-align:right;line-height:1.3">${A.escapeText((c.ai.top_risk || '').substring(0, 48))}…</span>
        </div>`).join('')}
    </div>`;

  el.innerHTML = `
    <div class="sec-head">
      <div class="sec-head__title">G20 AI Landscape <span class="sec-head__sub">editorial · computed from AI Trajectory Index</span></div>
    </div>
    <div class="panel" style="margin-bottom:20px">
      <div class="panel__body" style="padding:20px 24px">
        <div class="ai-editorial-grid" style="display:grid;grid-template-columns:1fr 240px;gap:32px;align-items:start">
          <div>
            <p class="ai-editorial-p">${p1}</p>
            <p class="ai-editorial-p">${p2}</p>
            <p class="ai-editorial-p">${p3}</p>
            <p class="ai-editorial-p">${p4}</p>
          </div>
          ${sidebarHTML}
        </div>
      </div>
    </div>`;
}

function mountReadinessChart(sorted) {
  const canvas = document.getElementById('ai-readiness-chart');
  if (!canvas) return;

  const labels = sorted.map(c => c.name);
  const dims = ['infrastructure', 'talent', 'governance', 'investment', 'economic_readiness'];

  const existing = Chart.getChart(canvas); if (existing) existing.destroy();
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
        legend: { position: 'bottom', labels: { color: A.chartTheme().tick, font: { ...MONO, size: 10 }, boxWidth: 12, padding: 10 } },
        tooltip: {
          ...tt(),
          callbacks: {
            title: ctx => ctx[0]?.label,
            label: ctx => `  ${ctx.dataset.label}: ${ctx.parsed.x}/20`,
            footer: ctx => `  Total: ${ctx.reduce((s,c)=>s+c.parsed.x,0)}/100`,
          },
        },
        datalabels: { display: false },
      },
      scales: {
        x: { stacked: true, max: 100, grid: { color: chartGrid() }, ticks: { ...tick(), callback: v => v } },
        y: { stacked: true, grid: { display: false }, ticks: { ...tick(), font: { ...MONO, size: 10 } } },
      },
    },
  });
}

function mountTrajectoryChart(sorted) {
  const canvas = document.getElementById('ai-trajectory-chart');
  if (!canvas) return;

  const byTraj = [...sorted].sort((a, b) => b.ai.trajectory_score - a.ai.trajectory_score);

  const existing = Chart.getChart(canvas); if (existing) existing.destroy();
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
          ...tt(),
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
        x: { grid: { color: chartGrid() }, ticks: { ...tick(), callback: v => (v > 0 ? '+' : '') + v } },
        y: { grid: { display: false }, ticks: { ...tick() } },
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

  // Preload flag images (PNG raster — reliable in canvas, unlike SVG) so we can
  // draw country flags instead of plain bubbles. Cached on window across renders.
  preloadFlags(sorted);

  const regions = [...new Set(sorted.map(c => c.region))];
  const datasets = regions.map(region => {
    const col = REGION_COLORS_LOCAL[region] || { bg: 'rgba(148,163,184,0.7)', border: '#94a3b8' };
    const countries = sorted.filter(c => c.region === region);
    return {
      label: region,
      data: countries.map(c => {
        const ppp = window.G20Data.getLatest(c.iso3, 'GDP_CAPITA_PPP');
        // Flag width scales with PPP (keeps the "bubble = PPP" encoding); r is the
        // hover hit-radius, kept in step with the drawn flag so tooltips line up.
        const flagW = ppp?.value ? Math.max(22, Math.min(40, Math.sqrt(ppp.value / 1000) * 4.2)) : 24;
        return {
          x: AI_LABOR_EXPOSURE[c.name] ?? 35,
          y: c.ai.total_score,
          r: flagW / 2,
          _meta: { name: c.name, iso3: c.iso3, code: c.code, score: c.ai.total_score, exposure: AI_LABOR_EXPOSURE[c.name], ppp: ppp?.value, flagW },
        };
      }),
      // Bubble itself is invisible — the flag is drawn on top in afterDatasetsDraw.
      // Region colour is kept for the legend and the flag's border.
      backgroundColor: 'transparent',
      borderColor: col.border,
      borderWidth: 0,
    };
  });

  // Quadrant thresholds (approximate G20 medians)
  const medExposure = 40;
  const medScore = 60;

  const existing = Chart.getChart(canvas); if (existing) existing.destroy();
  const scatterChart = new Chart(canvas.getContext('2d'), {
    type: 'bubble',
    data: { datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { color: A.chartTheme().tick, font: { ...MONO, size: 10 }, boxWidth: 10, padding: 12 } },
        tooltip: {
          ...tt(),
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
          title: { display: true, text: 'AI Labour Exposure (% of jobs)', color: A.chartTheme().tick, font: { ...MONO, size: 10 } },
          min: 20, max: 65,
          grid: { color: chartGrid() },
          ticks: { ...tick(), callback: v => v + '%' },
        },
        y: {
          title: { display: true, text: 'AI Readiness Score', color: A.chartTheme().tick, font: { ...MONO, size: 10 } },
          min: 35, max: 95,
          grid: { color: chartGrid() },
          ticks: { ...tick() },
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
        const cache = window._flagImgCache || {};
        const txtColor = getComputedStyle(document.documentElement)
          .getPropertyValue('--text-2').trim() || '#383838';
        ctx2.save();
        chart.data.datasets.forEach((ds, di) => {
          ds.data.forEach((pt, pi) => {
            const meta = chart.getDatasetMeta(di).data[pi];
            if (!meta) return;
            const m = pt._meta || {};
            const w = m.flagW || 26;
            const h = w * 0.67;
            const x = meta.x - w / 2;
            const y = meta.y - h / 2;
            const img = cache[(m.code || '').toLowerCase()];

            if (img && img.complete && img.naturalWidth) {
              // Subtle shadow + flag + thin border for definition on any background
              ctx2.save();
              ctx2.shadowColor = 'rgba(0,0,0,0.25)';
              ctx2.shadowBlur = 3;
              ctx2.shadowOffsetY = 1;
              ctx2.drawImage(img, x, y, w, h);
              ctx2.restore();
              ctx2.strokeStyle = ds.borderColor || 'rgba(0,0,0,0.3)';
              ctx2.lineWidth = 1;
              ctx2.strokeRect(x, y, w, h);
            } else {
              // Fallback while image loads: small region-coloured dot
              ctx2.fillStyle = ds.borderColor || '#94a3b8';
              ctx2.beginPath();
              ctx2.arc(meta.x, meta.y, 5, 0, Math.PI * 2);
              ctx2.fill();
            }

            // ISO3 label beneath the flag
            ctx2.fillStyle = txtColor;
            ctx2.font = 'bold 9px JetBrains Mono, monospace';
            ctx2.textAlign = 'center';
            ctx2.textBaseline = 'top';
            ctx2.fillText(m.iso3 || '', meta.x, y + h + 2);
          });
        });
        ctx2.restore();
      },
    }],
  });

  // Flags load async — redraw once each lands so they pop in without a full remount.
  Object.values(window._flagImgCache || {}).forEach(img => {
    if (!img.complete) img.addEventListener('load', () => scatterChart.draw(), { once: true });
  });
}

// Preload G20 flag PNGs into a window-level cache, keyed by lowercase ISO2 code.
function preloadFlags(countries) {
  window._flagImgCache = window._flagImgCache || {};
  countries.forEach(c => {
    const code = (c.code || '').toLowerCase();
    if (code && !window._flagImgCache[code]) {
      const img = new Image();
      img.src = `https://flagcdn.com/w80/${code}.png`;
      window._flagImgCache[code] = img;
    }
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

  const existing = Chart.getChart(canvas); if (existing) existing.destroy();
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
          ...tt(),
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
          title: { display: true, text: 'AI Readiness Score', color: A.chartTheme().tick, font: { ...MONO, size: 10 } },
          grid: { color: chartGrid() }, ticks: { ...tick() },
        },
        y: {
          title: { display: true, text: 'GDP Growth Rate (%)', color: A.chartTheme().tick, font: { ...MONO, size: 10 } },
          grid: { color: chartGrid() }, ticks: { ...tick(), callback: v => A.fmtSignedPct(v) },
        },
      },
    },
    plugins: [{
      afterDatasetsDraw(chart) {
        const ctx2 = chart.ctx;
        ctx2.save();
        ctx2.font = '9px JetBrains Mono, monospace';
        ctx2.fillStyle = A.chartTheme().tick;
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
