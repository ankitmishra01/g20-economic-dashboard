// Prosperity page — GDP per Capita PPP vs Growth bubble chart

const REGION_COLORS = {
  'Americas':    { bg: 'rgba(59,130,246,0.75)',  border: '#3b82f6' },
  'Europe':      { bg: 'rgba(139,92,246,0.75)',  border: '#8b5cf6' },
  'Asia':        { bg: 'rgba(16,185,129,0.75)',  border: '#10b981' },
  'Middle East': { bg: 'rgba(245,158,11,0.75)',  border: '#f59e0b' },
  'Africa':      { bg: 'rgba(239,68,68,0.75)',   border: '#ef4444' },
  // World Bank regions (wider scopes) reuse the same five hues plus two from the palette.
  'North America':                                      { bg: 'rgba(59,130,246,0.75)',  border: '#3b82f6' },
  'Latin America & Caribbean':                          { bg: 'rgba(30,64,175,0.75)',   border: '#1E40AF' },
  'Europe & Central Asia':                              { bg: 'rgba(139,92,246,0.75)',  border: '#8b5cf6' },
  'East Asia & Pacific':                                { bg: 'rgba(16,185,129,0.75)',  border: '#10b981' },
  'South Asia':                                         { bg: 'rgba(4,120,87,0.75)',    border: '#047857' },
  'Middle East, North Africa, Afghanistan & Pakistan':  { bg: 'rgba(245,158,11,0.75)',  border: '#f59e0b' },
  'Sub-Saharan Africa':                                 { bg: 'rgba(239,68,68,0.75)',   border: '#ef4444' },
};

// Growth is a multi-year average: one year is too noisy to describe a trajectory.
const PROS_GROWTH_TO = window.LATEST_ACTUAL_YEAR, PROS_GROWTH_FROM = PROS_GROWTH_TO - 2;
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

// Wider scopes: filters so the chart stays readable (G20 keeps every economy labelled).
// State lives in the query string (pr_top, pr_reg, pr_inc, pr_q) so a view can be shared.
const PROS_TOPS = [20, 30, 50, 0]; // 0 = all
function prosReadFilters() {
  const q = new URLSearchParams(location.search);
  const top = q.has('pr_top') ? +q.get('pr_top') : 30;
  const list = k => (q.get(k) || '').split(',').map(x => x.trim()).filter(Boolean);
  return { top: PROS_TOPS.includes(top) ? top : 30, regions: new Set(list('pr_reg')), incomes: new Set(list('pr_inc')), q: q.get('pr_q') || '' };
}
let _prosFilter = prosReadFilters();
function prosWriteFilters() {
  const q = new URLSearchParams(location.search);
  const f = _prosFilter;
  const put = (k, v, def) => { if (v && v !== def) q.set(k, v); else q.delete(k); };
  put('pr_top', String(f.top), '30');
  put('pr_reg', [...f.regions].join(','), '');
  put('pr_inc', [...f.incomes].join(','), '');
  put('pr_q', f.q.trim(), '');
  const qs = q.toString();
  try { history.replaceState(null, '', `${location.pathname}${qs ? '?' + qs : ''}${location.hash}`); } catch (_) { /* file:// */ }
}
function prosMatches(name, q) {
  const terms = q.toLowerCase().split(',').map(t => t.trim()).filter(Boolean);
  return terms.length > 0 && terms.some(t => name.toLowerCase().includes(t));
}
function prosFmtMoney(v) { return v >= 10000 ? `$${Math.round(v / 1000)}K` : `$${(v / 1000).toFixed(1)}K`; }
function prosFilterBar() {
  const reg = window.COUNTRY_REGISTRY?.collections || {};
  const f = _prosFilter;
  const tab = (on, onclick, label, title = '') => `<button class="sec-head__tab${on ? ' active' : ''}" onclick="${onclick}"${title ? ` title="${A.escapeAttr(title)}"` : ''}>${A.escapeText(label)}</button>`;
  const short = n => n.replace(', Afghanistan & Pakistan', '').replace(' & Caribbean', '').replace(' & Central Asia', '').replace(' & Pacific', '');
  return `
  <div class="panel mb-20 pros-filters" id="pros-filters">
    <div class="panel__body">
      <div class="pros-filters__row"><span class="pros-filters__lbl">Show</span>
        ${PROS_TOPS.map(n => tab(f.top === n, `prosSetTop(${n})`, n ? `Top ${n} by GDP` : 'All')).join('')}
        <span class="filter-bar__count" id="pros-count"></span></div>
      <div class="pros-filters__row"><span class="pros-filters__lbl">Region</span>
        ${tab(f.regions.size === 0, `prosClear('regions')`, 'All')}
        ${(reg.regions || []).map(r => tab(f.regions.has(r.code), `prosToggle('regions','${r.code}')`, short(r.name), r.name)).join('')}</div>
      <div class="pros-filters__row"><span class="pros-filters__lbl">Income</span>
        ${tab(f.incomes.size === 0, `prosClear('incomes')`, 'All')}
        ${(reg.income || []).map(g => tab(f.incomes.has(g.code), `prosToggle('incomes','${g.code}')`, g.name.replace(' income', ''), g.name)).join('')}</div>
      <div class="pros-filters__row filter-bar" style="margin:0"><span class="pros-filters__lbl">Highlight</span>
        <input type="search" id="pros-q" value="${A.escapeAttr(f.q)}" placeholder="Name economies to label, e.g. Kenya, Peru, Viet Nam" oninput="prosSearch(this.value)" aria-label="Highlight economies"></div>
    </div>
  </div>`;
}
let _prosSearchTimer = null;
window.prosSetTop = function (n) { _prosFilter.top = n; prosWriteFilters(); prosRefresh(); };
window.prosToggle = function (kind, code) { const s = _prosFilter[kind]; s.has(code) ? s.delete(code) : s.add(code); prosWriteFilters(); prosRefresh(); };
window.prosClear = function (kind) { _prosFilter[kind].clear(); prosWriteFilters(); prosRefresh(); };
window.prosSearch = function (v) { clearTimeout(_prosSearchTimer); _prosSearchTimer = setTimeout(() => { _prosFilter.q = v; prosWriteFilters(); mountProsperityChart(_prosperityMode); }, 220); };
function prosRefresh() {
  const bar = document.getElementById('pros-filters');
  if (bar) { const focus = document.activeElement?.id; bar.outerHTML = prosFilterBar(); if (focus === 'pros-q') document.getElementById('pros-q')?.focus(); }
  mountProsperityChart(_prosperityMode);
}

function renderProsperity() {
  const inG20 = !window.Scope || Scope.isG20();
  return `
<div class="page-body">
  ${inG20 ? '' : renderWorldMapPanel('prosperity-map', 'GDP_CAPITA_PPP')}
  <div class="sec-head">
    <div class="sec-head__title">Prosperity Map <span class="count">${PEER_CAP()}</span><span class="sec-head__sub">How rich is each economy per person, and how fast is it growing?</span></div>
    <div class="sec-head__actions">
      <button class="sec-head__tab active" onclick="prosperityToggleX(this,'ppp')">PPP</button>
      <button class="sec-head__tab" onclick="prosperityToggleX(this,'nominal')">Nominal</button>
    </div>
  </div>

  ${inG20 ? '' : prosFilterBar()}
  <div class="pros-guide mb-20">
    <div><b>Across</b> income per person, adjusted for living costs (PPP). Further right = richer.</div>
    <div><b>Up</b> average real GDP growth over ${PROS_GROWTH_FROM}–${PROS_GROWTH_TO}. Higher = growing faster.</div>
    <div><b>Dashed lines</b> ${PEER()} medians, splitting the map into four groups.</div>
    <div><b>Bubble size</b> population.${inG20 ? '' : ' Grey dots are economies outside the current Top view; hover any dot for details.'}</div>
  </div>

  <div class="panel mb-20">
    <div class="panel__body" style="padding:16px 20px">
      <div class="prosperity-quadrants" id="prosperity-quadrants" style="position:relative;height:480px">
        <canvas id="prosperity-chart"></canvas>
      </div>
      <div class="prosperity-legend" id="prosperity-legend"></div>
      <div class="pros-offscale" id="pros-offscale"></div>
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
        <div><span class="panel__title">The four groups</span><span class="panel__sub">split at the ${PEER()} medians</span></div>
      </div>
      <div class="panel__body" id="quadrant-table"></div>
    </div>
  </div>
</div>`;
}

function mountProsperityChart(mode) {
  if (!window.Chart) { setTimeout(() => mountProsperityChart(mode), 200); return; }
  if (!mode && document.getElementById('prosperity-map') && window.mountWorldMap) window.mountWorldMap('prosperity-map');
  if (mode) _prosperityMode = mode;
  const isNominal = _prosperityMode === 'nominal';
  const metricKey = isNominal ? 'GDP_CAPITA' : 'GDP_CAPITA_PPP';
  const axisLabel = isNominal ? 'GDP per Capita (Nominal US$)' : "GDP per Capita PPP (Int'l $)";
  const tipLabel  = isNominal ? 'GDP/capita' : 'PPP';

  // Destroy previous chart so Chart.js doesn't throw "Canvas already in use" on toggle
  if (_prosperityChartInst) { try { _prosperityChartInst.destroy(); } catch (_) {} _prosperityChartInst = null; }

  const nonEU = c => c.iso3 !== 'EUU';

  // Build bubble data
  const inG20 = !window.Scope || Scope.isG20();
  const f = _prosFilter;
  const all = window.G20.filter(nonEU).map(c => {
    const inc    = window.G20Data.getLatest(c.iso3, metricKey, { annualOnly: true });
    const g = avgGrowth(c.iso3);
    const growth = g === null ? null : { value: g, year: `${PROS_GROWTH_FROM}–${String(PROS_GROWTH_TO).slice(2)} avg` };
    const pop    = window.G20Data.getLatest(c.iso3, 'POPULATION', { annualOnly: true });
    const gdp    = window.G20Data.getLatest(c.iso3, 'GDP', { annualOnly: true });
    if (!inc || !growth) return null;
    return {
      iso3: c.iso3, name: c.name, code: c.code, region: c.region, regionCode: c.regionCode, incomeCode: c.incomeCode,
      x: inc.value, y: growth.value, gdp: gdp?.value || 0,
      ppp: inc.value, growth: growth.value, pop: pop?.value, pppYear: inc.year, growthYear: growth.year,
    };
  }).filter(Boolean);

  // Filters (wider scopes only): region / income narrow the pool; Top-N by GDP picks the
  // coloured, labelled economies; the rest of the pool stays as grey context dots.
  const pool = inG20 ? all : all.filter(d => (!f.regions.size || f.regions.has(d.regionCode)) && (!f.incomes.size || f.incomes.has(d.incomeCode)));
  const byGdp = [...pool].sort((a, b) => b.gdp - a.gdp);
  const topSet = new Set((inG20 || !f.top ? byGdp : byGdp.slice(0, f.top)).map(d => d.iso3));
  const hl = new Set(inG20 ? [] : pool.filter(d => prosMatches(d.name, f.q)).map(d => d.iso3));
  const labelSet = inG20 ? new Set(pool.map(d => d.iso3))
    : new Set([...byGdp.filter(d => topSet.has(d.iso3)).slice(0, 30).map(d => d.iso3), ...hl]);
  const maxPop = Math.max(1, ...pool.map(d => d.pop || 0));
  for (const d of pool) {
    d.focus = topSet.has(d.iso3) || hl.has(d.iso3);
    d.r = inG20 ? (d.pop ? Math.max(5, Math.min(30, Math.sqrt(d.pop / 1e6) * 1.8)) : 8)
      : d.focus ? 3.5 + 18 * Math.sqrt((d.pop || 0) / maxPop) : 2.5;
  }
  const data = pool;

  // Robust growth axis for wide scopes: a few extreme averages (e.g. Guyana's oil boom)
  // would otherwise squash everyone else. Off-scale points sit on the edge, marked, and
  // are listed under the chart with their true values.
  const ys = pool.map(d => d.y).sort((a, b) => a - b);
  const pq = q => ys.length ? ys[Math.min(ys.length - 1, Math.max(0, Math.round(q * (ys.length - 1))))] : 0;
  const yLo = inG20 ? null : Math.floor(Math.min(pq(0.02), -1) - 1);
  const yHi = inG20 ? null : Math.ceil(Math.max(pq(0.98), 4) + 1);
  for (const d of pool) {
    d.off = !inG20 && (d.y < yLo || d.y > yHi) ? (d.y > yHi ? 'up' : 'down') : null;
    d.yDraw = d.off === 'up' ? yHi - 0.25 : d.off === 'down' ? yLo + 0.25 : d.y;
  }
  const offList = pool.filter(d => d.off).sort((a, b) => b.y - a.y);
  const offEl = document.getElementById('pros-offscale');
  if (offEl) offEl.innerHTML = offList.length
    ? `Off the growth scale (shown on the edge, ▲/▼): ${offList.map(d => `${A.escapeText(d.name)} <b>${A.fmtSignedPct(d.y)}</b>`).join(' · ')}`
    : '';
  const countEl = document.getElementById('pros-count');
  const extra = [...hl].filter(i => !topSet.has(i)).length;
  const econ = n => `${n} ${n === 1 ? 'economy' : 'economies'}`;
  if (countEl) countEl.textContent = !f.top || pool.length <= f.top
    ? `showing all ${econ(pool.length)}`
    : `showing top ${Math.min(f.top, pool.length)}${extra ? ` + ${extra} highlighted` : ''} of ${econ(pool.length)}`;

  // Group by region for datasets (focus economies); grey context dots last
  const focus = data.filter(d => d.focus);
  const regions = [...new Set(focus.map(d => d.region))];
  const datasets = regions.map(region => {
    const col = REGION_COLORS[region] || { bg: 'rgba(148,163,184,0.7)', border: '#94a3b8' };
    return {
      label: region,
      data: focus.filter(d => d.region === region).map(d => ({ x: d.x, y: d.yDraw, r: d.r, _meta: d })),
      backgroundColor: inG20 ? col.bg : col.bg.replace('0.75)', '0.6)'),
      borderColor: col.border,
      borderWidth: hl.size ? 1 : 1.5,
      order: 1,
    };
  });
  const rest = data.filter(d => !d.focus);
  if (rest.length) datasets.push({
    label: `Other economies (${rest.length})`,
    data: rest.map(d => ({ x: d.x, y: d.yDraw, r: d.r, _meta: d })),
    backgroundColor: 'rgba(148,163,184,0.35)', borderColor: 'rgba(148,163,184,0.6)', borderWidth: 0.5, order: 2,
  });
  if (!data.length) {
    const box = document.getElementById('prosperity-quadrants');
    if (box) box.innerHTML = '<div class="worldmap-status" style="position:static;padding:40px">No economies match these filters.</div><canvas id="prosperity-chart" hidden></canvas>';
    ['ppp-bars', 'quadrant-table'].forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = '<div class="worldmap-status" style="position:static;padding:20px">No economies match these filters.</div>'; });
    return;
  }
  { const box = document.getElementById('prosperity-quadrants'); if (box && !document.getElementById('prosperity-chart')?.isConnected) box.innerHTML = '<canvas id="prosperity-chart"></canvas>'; }
  { const cv = document.getElementById('prosperity-chart'); if (cv && cv.hidden) { cv.closest('#prosperity-quadrants').innerHTML = '<canvas id="prosperity-chart"></canvas>'; } }

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
                `  ${tipLabel}: ${prosFmtMoney(m.ppp)} (${m.pppYear})`,
                `  Growth: ${A.fmtSignedPct(m.growth)} a year (${m.growthYear})${m.off ? ' · off scale' : ''}`,
                `  ${m.region}`,
              ];
              if (m.pop) lines.push(`  Pop: ${(m.pop / 1e6).toFixed(0)}M`);
              return lines;
            },
          },
        },
        annotation: undefined,
      },
      scales: {
        x: inG20 ? {
          title: { display: true, text: axisLabel, color: theme.tick, font: { ...MONO, size: 10 } },
          grid: { color: theme.grid },
          ticks: { ...TICK, callback: v => '$' + (v / 1000).toFixed(0) + 'K' },
        } : {
          type: 'logarithmic',
          min: Math.max(200, Math.min(...data.map(d => d.x)) * 0.8),
          max: Math.max(...data.map(d => d.x)) * 1.25,
          title: { display: true, text: `${axisLabel} · log scale`, color: theme.tick, font: { ...MONO, size: 10 } },
          grid: { color: theme.grid },
          afterBuildTicks: axis => {
            axis.ticks = [500, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000]
              .filter(v => v >= axis.min && v <= axis.max).map(value => ({ value }));
          },
          ticks: { ...TICK, callback: v => v >= 1000 ? '$' + (v / 1000) + 'K' : '$' + v },
        },
        y: {
          ...(inG20 ? {} : { min: yLo, max: yHi }),
          grace: inG20 ? '18%' : 0,
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
        c2.fillText(`${PEER_CAP()} median ${A.fmtSignedPct(medGrowth)}`, a.left + 8, my - 3);
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
            const m = pt._meta;
            if (!m || !labelSet.has(m.iso3)) return;
            const name = (m.off === 'up' ? '▲' : m.off === 'down' ? '▼' : '') + m.iso3;
            if (inG20) { ctx2.fillText(name, meta.x, meta.y); return; }
            // Wide scopes: label beside the bubble so small dots stay readable
            ctx2.save();
            ctx2.textAlign = 'left';
            ctx2.fillStyle = hl.has(m.iso3) ? theme.text1 || theme.tooltipBody : theme.text2 || theme.tick;
            ctx2.font = hl.has(m.iso3) ? '600 10px JetBrains Mono, monospace' : '9px JetBrains Mono, monospace';
            ctx2.fillText(name, meta.x + (pt.r || 3) + 3, meta.y);
            ctx2.restore();
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

  // Wider scopes rank the top 25 here; every economy is on the map and bubble chart.
  const pppAll = [...data].sort((a, b) => b.ppp - a.ppp);
  const pppRanked = (!window.Scope || Scope.isG20()) ? pppAll : pppAll.slice(0, 25);
  if (subEl && pppRanked.length < pppAll.length) subEl.textContent += ` · top ${pppRanked.length} of ${pppAll.length}`;
  const maxPPP = pppRanked[0].ppp;
  document.getElementById('ppp-bars').innerHTML = `<div class="bar-chart">${pppRanked.map(d => {
    const pct = (d.ppp / maxPPP) * 100;
    const col = REGION_COLORS[d.region]?.border || '#94a3b8';
    return `
    <div class="bar-row">
      <div class="bar-row__label" title="${A.escapeAttr(d.name)}">
        <span class="bar-row__flag" style="background-image:url('https://flagcdn.com/${d.code.toLowerCase()}.svg');background-size:cover;background-position:center;"></span>
        <span class="bar-row__name">${A.escapeText(d.name)}</span>
      </div>
      <div class="bar-row__track">
        <div class="bar-row__bar" style="left:0;width:${pct}%;background:${col};opacity:.8"></div>
      </div>
      <div class="bar-row__val">${prosFmtMoney(d.ppp)}</div>
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
      <div style="font-size:12px;color:var(--text-2);line-height:1.6">${(() => {
        // Wider scopes list the 12 fastest-growing per group; the bubble chart shows all.
        const cap = (!window.Scope || Scope.isG20()) ? Infinity : 12;
        const sorted = countries.sort((a, b) => b.y - a.y);
        const shown = sorted.slice(0, cap).map(d => `${A.escapeText(d.name)} <span style="font-family:var(--font-mono);font-size:10.5px;color:var(--text-3)">${A.fmtSignedPct(d.y)}</span>`).join(' · ');
        return (shown || '—') + (sorted.length > cap ? ` <span style="font-family:var(--font-mono);font-size:10.5px;color:var(--text-3)">+${sorted.length - cap} more</span>` : '');
      })()}</div>
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
