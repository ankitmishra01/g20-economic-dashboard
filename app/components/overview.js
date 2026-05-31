// Overview page — Direction B · Refined Terminal design

// ── Sparkline helper ──────────────────────────────────────────────────────────
function buildSparkPath(values, width, height, pad) {
  if (!values || values.length < 2) return '';
  pad = pad || 2;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = width - pad * 2;
  const h = height - pad * 2;
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * w;
    const y = pad + h - ((v - min) / range) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return 'M' + pts.join('L');
}

function sparkSVG(values, width, height, cls) {
  if (!values || values.length < 2) return '';
  width = width || 86;
  height = height || 22;
  cls = cls || '';
  const path = buildSparkPath(values, width, height);
  const last = values[values.length - 1];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pad = 2;
  const dotX = (width - pad).toFixed(1);
  const dotY = (pad + (height - pad * 2) - ((last - min) / range) * (height - pad * 2)).toFixed(1);
  return `<svg class="spark" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <path class="spark-line ${cls}" d="${path}"/>
    <circle class="dot" cx="${dotX}" cy="${dotY}" r="1.6"/>
  </svg>`;
}

function tileSpark(values, width, height, cls) {
  if (!values || values.length < 2) return '';
  width = width || 200;
  height = height || 30;
  cls = cls || '';
  const path = buildSparkPath(values, width, height);
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <path class="spark-line ${cls}" d="${path}"/>
  </svg>`;
}

// ── Flag image URL ─────────────────────────────────────────────────────────────
function flagURL(iso2) {
  return `https://flagcdn.com/${iso2.toLowerCase()}.svg`;
}

function flagBG(iso2) {
  return `background-image:url('${flagURL(iso2)}');background-size:cover;background-position:center;`;
}

// ── Main render ───────────────────────────────────────────────────────────────
function renderOverview() {
  const gdpRank    = window.G20Data.getRanking('GDP');
  const growthRank = window.G20Data.getRanking('GDP_GROWTH');
  const infRank    = window.G20Data.getRanking('INFLATION').sort((a,b) => b.value - a.value);
  const debtRank   = window.G20Data.getRanking('DEBT_GDP').sort((a,b) => b.value - a.value);
  const unempRank  = window.G20Data.getRanking('UNEMPLOYMENT');
  const caRank     = window.G20Data.getRanking('CURRENT_ACC');

  const nonEU = c => c.iso3 !== 'EUU';

  const totalGDP    = gdpRank.filter(nonEU).reduce((s, c) => s + (c.value || 0), 0);
  const growthVals  = growthRank.filter(nonEU).map(c => c.value);
  const medianGrowth = median(growthVals);
  const infVals      = infRank.filter(nonEU).map(c => c.value);
  const medianInf    = median(infVals);
  const expandingN   = growthVals.filter(v => v > 0).length;
  const topInf       = infRank.filter(nonEU)[0];
  const topDebt      = debtRank.filter(nonEU)[0];
  const debtFlags    = debtRank.filter(c => nonEU(c) && c.value > 100);

  // Build ranked table: by GDP descending (non-EU)
  const tableRows = gdpRank.filter(nonEU);

  // Inflation outliers (CPI > 8%)
  const cpiFlags   = infRank.filter(c => nonEU(c) && c.value > 8);
  // Contracting economies (growth < 0)
  const shrinkFlags = growthRank.filter(c => nonEU(c) && c.value < 0).sort((a,b) => a.value - b.value);

  const latestYear  = gdpRank[0]?.year || '2024';

  return `
<section class="hero">
  <div class="hero__inner">
    <div class="hero__row">
      <div>
        <div class="hero__eyebrow">
          <span class="tag"><span class="dot"></span>Live dataset</span>
          <span>G20 · ${tableRows.length} economies · 13 indicators · 2015–${latestYear}</span>
        </div>
        <h1 class="hero__title">
          G20 closed ${latestYear} with <span class="num-callout">${A.fmtSignedPct(medianGrowth)}</span> median real growth.<br>
          <span class="accent">Disinflation continues, yet debt levels persist.</span>
        </h1>
      </div>
      <div class="hero__filters">
        <button class="hero__filter active"><span class="lbl-mini">Period</span> Latest</button>
        <button class="hero__filter"><span class="lbl-mini">View</span> Levels</button>
        <button class="hero__filter"><span class="lbl-mini">Sort</span> GDP ↓</button>
      </div>
    </div>

    <div class="hero__stats">
      <div class="hero__stat">
        <div class="hero__stat-lbl">Aggregate GDP</div>
        <div class="hero__stat-val">${(totalGDP / 1e12).toFixed(1)}<span class="unit">USD tn</span></div>
        <div class="hero__stat-delta"><span class="delta-pos">${expandingN} of ${growthVals.length} expanding</span></div>
      </div>
      <div class="hero__stat">
        <div class="hero__stat-lbl">Median growth</div>
        <div class="hero__stat-val">${medianGrowth.toFixed(1)}<span class="unit">%</span></div>
        <div class="hero__stat-delta">
          <span class="${medianGrowth >= 2 ? 'delta-pos' : medianGrowth >= 0 ? 'delta-mute' : 'delta-neg'}">
            ${medianGrowth >= 0 ? '▲' : '▼'} YoY real GDP
          </span>
        </div>
      </div>
      <div class="hero__stat">
        <div class="hero__stat-lbl">Median CPI</div>
        <div class="hero__stat-val">${medianInf.toFixed(1)}<span class="unit">%</span></div>
        <div class="hero__stat-delta">
          <span class="${medianInf <= 4 ? 'delta-pos' : 'delta-warn'}">ex. outliers</span>
        </div>
      </div>
      <div class="hero__stat">
        <div class="hero__stat-lbl">Top CPI</div>
        <div class="hero__stat-val">${topInf ? topInf.value.toFixed(1) : '—'}<span class="unit">%</span></div>
        <div class="hero__stat-delta"><span class="delta-neg">${topInf?.name || '—'}</span></div>
      </div>
      <div class="hero__stat">
        <div class="hero__stat-lbl">Top debt/GDP</div>
        <div class="hero__stat-val">${topDebt ? topDebt.value.toFixed(0) : '—'}<span class="unit">%</span></div>
        <div class="hero__stat-delta"><span class="delta-warn">${topDebt?.name || '—'}</span></div>
      </div>
      <div class="hero__stat">
        <div class="hero__stat-lbl">Fiscal stress</div>
        <div class="hero__stat-val">${debtFlags.length}<span class="unit">flags</span></div>
        <div class="hero__stat-delta"><span class="delta-warn">debt &gt; 100% of GDP</span></div>
      </div>
    </div>
  </div>
</section>

<div class="page-body">

  <!-- KPI tiles -->
  <div class="sec-head">
    <div class="sec-head__title">Key indicators <span class="count">/ 5</span><span class="sec-head__sub">latest reads, 10y trend</span></div>
    <div class="sec-head__actions">
      <button class="sec-head__tab active" onclick="overviewFilterClass('all',this)" title="All G20 economies">All G20</button>
      <button class="sec-head__tab" onclick="overviewFilterClass('ae',this)" title="Advanced economies">AE</button>
      <button class="sec-head__tab" onclick="overviewFilterClass('em',this)" title="Emerging markets">EM</button>
    </div>
  </div>

  <div class="kpi-grid" id="kpi-grid">
    ${renderKPITiles(totalGDP, medianGrowth, medianInf, expandingN, growthVals.length, debtRank, latestYear)}
  </div>

  <!-- Bar charts -->
  <div class="sec-head">
    <div class="sec-head__title">GDP growth · CPI <span class="count">${latestYear}</span><span class="sec-head__sub">ranked, latest available</span></div>
    <div class="sec-head__actions">
      <button class="sec-head__tab active">Bars</button>
    </div>
  </div>

  <div class="row-2">
    <div class="panel">
      <div class="panel__head">
        <div><span class="panel__title">Real GDP growth</span><span class="panel__sub">% YoY · ${latestYear}</span></div>
        <div class="panel__meta">${growthRank.filter(nonEU).length} economies</div>
      </div>
      <div class="panel__body">
        ${renderGrowthBars(growthRank.filter(nonEU))}
      </div>
    </div>
    <div class="panel">
      <div class="panel__head">
        <div><span class="panel__title">Consumer prices</span><span class="panel__sub">% YoY · top 15</span></div>
        <div class="panel__meta">Highest first</div>
      </div>
      <div class="panel__body">
        ${renderInflationBars(infRank.filter(nonEU).slice(0, 15))}
      </div>
    </div>
  </div>

  <!-- Rankings table -->
  <div class="sec-head">
    <div class="sec-head__title">All economies <span class="count">/ ${tableRows.length}</span><span class="sec-head__sub">click row → country profile</span></div>
    <div class="sec-head__actions">
      <button class="sec-head__tab active" onclick="overviewSortTable('gdp',this)">By GDP</button>
      <button class="sec-head__tab" onclick="overviewSortTable('growth',this)">By growth</button>
      <button class="sec-head__tab" onclick="overviewSortTable('cpi',this)">By CPI</button>
    </div>
  </div>

  <div class="panel">
    <table class="rank-table">
      <thead>
        <tr>
          <th class="col-no">#</th>
          <th class="col-flag"></th>
          <th class="col-name">Economy</th>
          <th>GDP (USD tn)</th>
          <th>YoY growth</th>
          <th>CPI</th>
          <th>Unemp.</th>
          <th>Debt / GDP</th>
          <th>C/A · % GDP</th>
          <th>Risk</th>
          <th class="col-spark">10y GDP</th>
        </tr>
      </thead>
      <tbody id="rank-tbody">
        ${renderRankingRows(tableRows)}
      </tbody>
    </table>
  </div>

  <!-- Risk register -->
  <div class="sec-head">
    <div class="sec-head__title">Risk register <span class="count" id="risk-total">/ ${cpiFlags.length + shrinkFlags.length + debtFlags.length}</span><span class="sec-head__sub">automated flags · latest data</span></div>
    <div class="sec-head__actions">
      <button class="sec-head__tab active" onclick="overviewFilterRisk('all',this)">All</button>
      <button class="sec-head__tab" onclick="overviewFilterRisk('high',this)">High</button>
      <button class="sec-head__tab" onclick="overviewFilterRisk('medium',this)">Medium</button>
    </div>
  </div>

  <div class="row-3" id="risk-register-panels">
    <div class="panel" data-severity="high" id="risk-panel-cpi">
      <div class="panel__head">
        <div><span class="panel__title">Inflation outliers</span><span class="panel__sub">CPI &gt; 8%</span></div>
        <div class="panel__meta">${cpiFlags.length} flagged</div>
      </div>
      ${renderRiskRows(cpiFlags, c => `CPI &gt; 8% · ${c.region}`,
         c => `<span class="v-neg">${c.value.toFixed(1)}%</span>`, '% YoY')}
    </div>
    <div class="panel" data-severity="high" id="risk-panel-growth">
      <div class="panel__head">
        <div><span class="panel__title">Contracting</span><span class="panel__sub">real growth &lt; 0%</span></div>
        <div class="panel__meta">${shrinkFlags.length ? shrinkFlags.length + ' flagged' : 'clear'}</div>
      </div>
      ${shrinkFlags.length
        ? renderRiskRows(shrinkFlags, c => `Output contracted YoY · ${c.region}`,
            c => `<span class="v-neg">${c.value.toFixed(1)}%</span>`, 'GROWTH')
        : `<div class="risk-row"><div class="risk-row__main"><span class="risk-row__desc v-mute">No G20 economy contracting this quarter.</span></div><div></div></div>`}
    </div>
    <div class="panel" data-severity="medium" id="risk-panel-debt">
      <div class="panel__head">
        <div><span class="panel__title">Fiscal stress</span><span class="panel__sub">debt &gt; 100% GDP</span></div>
        <div class="panel__meta">${debtFlags.length} flagged</div>
      </div>
      ${renderRiskRows(debtFlags, c => `Gross debt above 100% of GDP · ${c.region}`,
         c => `<span class="v-warn">${c.value.toFixed(0)}%</span>`, 'OF GDP')}
    </div>
  </div>

  <!-- Global Outlook editorial -->
  ${renderGlobalOutlookComputed()}

  <!-- Data sources table -->
  <div class="sec-head" style="margin-top:24px">
    <div class="sec-head__title">Data sources</div>
  </div>
  <div class="panel" style="margin-bottom:20px">
    <div class="panel__body" style="padding:0">
      <div class="table-scroll"><table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead>
          <tr style="border-bottom:1px solid var(--rule)">
            <th style="padding:8px 14px;text-align:left;color:var(--text-3);font-weight:600;font-size:11px;letter-spacing:.03em">Indicator</th>
            <th style="padding:8px 14px;text-align:left;color:var(--text-3);font-weight:600;font-size:11px;letter-spacing:.03em">Source</th>
            <th style="padding:8px 14px;text-align:left;color:var(--text-3);font-weight:600;font-size:11px;letter-spacing:.03em">Coverage</th>
            <th style="padding:8px 14px;text-align:left;color:var(--text-3);font-weight:600;font-size:11px;letter-spacing:.03em">Frequency</th>
          </tr>
        </thead>
        <tbody>
          ${[
            ['GDP, GDP Growth, GDP per Capita', 'World Bank (NY.GDP.*)', '19/19 G20', 'Annual'],
            ['Inflation (CPI)', 'World Bank (FP.CPI.TOTL.ZG)', '19/19 G20', 'Annual'],
            ['Unemployment, Youth Unemployment', 'World Bank / ILO modelled', '19/19 G20', 'Annual'],
            ['Current Account Balance', 'World Bank (BN.CAB.XOKA.GD.ZS)', '19/19 G20', 'Annual'],
            ['Health Spending', 'World Bank / WHO (SH.XPD.CHEX.GD.ZS)', '19/19 G20', 'Annual'],
            ['Education Spending', 'World Bank / UNESCO (SE.XPD.TOTL.GD.ZS)', '19/19 G20', 'Annual'],
            ['Capital Formation, Exports, Manufacturing', 'World Bank National Accounts', '19/19 G20', 'Annual'],
            ['FDI Inflows', 'World Bank (BX.KLT.DINV.WD.GD.ZS)', '19/19 G20', 'Annual'],
            ['Tax Revenue', 'World Bank / IMF GFS (GC.TAX.TOTL.GD.ZS)', '18/19 G20', 'Annual'],
            ['Gross Government Debt', 'IMF World Economic Outlook (GGXWDG_NGDP)', '19/19 G20', 'Annual'],
            ['Government Fiscal Balance', 'IMF World Economic Outlook (GGXCNL_NGDP)', '19/19 G20', 'Annual'],
            ['R&D Expenditure', 'OECD MSTI / World Bank UNESCO (GB.XPD.RSDV.GD.ZS)', '19/19 G20', 'Annual'],
            ['CO₂ Emissions per Capita', 'World Bank / EDGAR (EN.GHG.CO2.PC.CE.AR5)', '19/19 G20', 'Annual'],
            ['Gini Coefficient', 'World Bank PovcalNet (SI.POV.GINI)', '18/19 G20', 'Periodic'],
            ['Population', 'World Bank (SP.POP.TOTL)', '19/19 G20', 'Annual'],
            ['Trade Openness', 'World Bank National Accounts (NE.TRD.GNFS.ZS)', '19/19 G20', 'Annual'],
          ].map(([ind, src, cov, freq]) => `
            <tr style="border-bottom:1px solid rgba(0,0,0,.04)">
              <td style="padding:7px 14px;color:var(--text-1)">${ind}</td>
              <td style="padding:7px 14px;color:var(--text-2);font-family:var(--font-mono);font-size:11px">${src}</td>
              <td style="padding:7px 14px;color:var(--text-3)">${cov}</td>
              <td style="padding:7px 14px;color:var(--text-3)">${freq}</td>
            </tr>
          `).join('')}
        </tbody>
      </table></div>
    </div>
  </div>

  <!-- Methodology -->
  <div class="methodology">
    <h4>About this dataset</h4>
    Latest reads at the publication cut-off (${latestYear}). All data sourced from official open APIs:
    <a href="https://data.worldbank.org" target="_blank" rel="noopener">World Bank Open Data</a> (CC BY 4.0) ·
    <a href="https://www.imf.org/external/datamapper" target="_blank" rel="noopener">IMF DataMapper</a> ·
    <a href="https://stats.oecd.org" target="_blank" rel="noopener">OECD MSTI</a>.
    Fiscal balance and government debt data include IMF projections capped at 2024.
    Series refreshed monthly via automated pipelines (GitHub Actions → Supabase).
  </div>

  <div class="page-foot">
    <span>g20.monitor · ${latestYear}</span>
    <span>World Bank · IMF · OECD</span>
  </div>

</div>`;
}

// ── KPI tiles ──────────────────────────────────────────────────────────────────
function renderKPITiles(totalGDP, medianGrowth, medianInf, expanding, total, debtRank, year) {
  // Build 10y series for global KPIs from USA + CHN as proxy
  const usaGDP  = window.G20Data.getSeries('USA', 'GDP', 2015).map(d => d.value / 1e12);
  const medianDebt = median(debtRank.filter(c => c.iso3 !== 'EUU').map(c => c.value));

  const tiles = [
    {
      lbl: 'Aggregate GDP', val: (totalGDP/1e12).toFixed(1), unit: 'USD tn',
      delta: `<span class="d-pos">${expanding} of ${total}</span> expanding`,
      series: usaGDP, cls: 'pos',
    },
    {
      lbl: 'Median growth', val: medianGrowth.toFixed(1), unit: '% YoY',
      delta: `<span class="${medianGrowth >= 2 ? 'd-pos' : medianGrowth >= 0 ? '' : 'd-neg'}">${medianGrowth >= 0 ? '▲' : '▼'} ${Math.abs(medianGrowth).toFixed(1)}%</span> ${year}`,
      series: window.G20Data.getSeries('USA', 'GDP_GROWTH', 2015).map(d => d.value),
      cls: medianGrowth >= 0 ? 'pos' : 'neg',
    },
    {
      lbl: 'Median CPI', val: medianInf.toFixed(1), unit: '%',
      delta: `<span class="${medianInf <= 4 ? 'd-pos' : 'd-warn'}">${medianInf <= 4 ? 'Moderate' : 'Elevated'}</span> ex. outliers`,
      series: window.G20Data.getSeries('DEU', 'INFLATION', 2015).map(d => d.value),
      cls: 'neg',
    },
    {
      lbl: 'Unemployment median', val: '—', unit: '%',
      delta: `<span class="d-pos">Latest available</span> cross-G20`,
      series: window.G20Data.getSeries('USA', 'UNEMPLOYMENT', 2015).map(d => d.value),
      cls: '',
      computeVal: () => {
        const r = window.G20Data.getRanking('UNEMPLOYMENT').filter(c => c.iso3 !== 'EUU');
        return median(r.map(c => c.value)).toFixed(1);
      },
    },
    {
      lbl: 'Debt/GDP median', val: medianDebt.toFixed(0), unit: '%',
      delta: `<span class="${medianDebt > 90 ? 'd-warn' : 'd-pos'}">Highest since WWII</span> era`,
      series: window.G20Data.getSeries('JPN', 'DEBT_GDP', 2015).map(d => d.value),
      cls: medianDebt > 90 ? 'neg' : 'pos',
    },
  ];

  return tiles.map(t => {
    const displayVal = t.computeVal ? t.computeVal() : t.val;
    const sparkHtml = t.series && t.series.length > 1
      ? tileSpark(t.series, 200, 30, t.cls)
      : '';
    const accentCls = t.cls === 'pos' ? 'kpi-pos' : t.cls === 'neg' ? 'kpi-neg' : '';
    return `
    <div class="kpi-tile${accentCls ? ' ' + accentCls : ''}">
      <div class="kpi-tile__head">
        <span class="kpi-tile__lbl">${t.lbl}</span>
      </div>
      <div class="kpi-tile__val">${displayVal}<span class="unit">${t.unit}</span></div>
      <div class="kpi-tile__delta">${t.delta}</div>
      <div class="kpi-tile__spark">${sparkHtml}</div>
    </div>`;
  }).join('');
}

// ── Growth bar chart ───────────────────────────────────────────────────────────
function renderGrowthBars(rows) {
  const sorted = [...rows].sort((a, b) => b.value - a.value);
  const minVal = Math.min(...sorted.map(c => c.value));
  const maxVal = Math.max(...sorted.map(c => c.value));
  // Place zero proportionally: if all positive, zeroPct=0 (left edge = Y-axis).
  // If some negative, zeroPct = abs(min) / total_range * 100.
  const totalRange = maxVal - Math.min(0, minVal);
  const zeroPct = minVal < 0 ? (Math.abs(minVal) / (maxVal - minVal)) * 100 : 0;

  return `<div class="bar-chart">${sorted.map(c => {
    const pct = (Math.abs(c.value) / totalRange) * 100;
    const isNeg = c.value < 0;
    const left = isNeg ? (zeroPct - pct) : zeroPct;
    const cls = isNeg ? 'bar-neg' : (c.value >= 4 ? 'bar-pos' : '');
    const valCls = isNeg ? 'v-neg' : (c.value >= 4 ? 'v-pos' : '');
    const display = parseFloat(c.value.toFixed(1));
    const sign = display >= 0 ? '+' : '';
    return `
    <div class="bar-row">
      <div class="bar-row__label">
        <span class="bar-row__flag" style="${flagBG(c.code)}"></span>
        ${A.escapeText(c.name)}
      </div>
      <div class="bar-row__track">
        ${zeroPct > 0 ? `<div class="bar-row__zero" style="left:${zeroPct.toFixed(1)}%"></div>` : ''}
        <div class="bar-row__bar ${cls}" style="left:${left.toFixed(1)}%;width:${pct.toFixed(1)}%"></div>
      </div>
      <div class="bar-row__val ${valCls}">${sign}${display.toFixed(1)}%</div>
    </div>`;
  }).join('')}</div>`;
}

// ── Inflation bar chart ────────────────────────────────────────────────────────
function renderInflationBars(rows) {
  const maxVal = Math.max(...rows.map(c => c.value));
  return `<div class="bar-chart">${rows.map(c => {
    const pct = (c.value / maxVal) * 100;
    const cls = c.value > 8 ? 'bar-neg' : c.value > 4 ? 'bar-warn' : '';
    const valCls = c.value > 8 ? 'v-neg' : c.value > 4 ? 'v-warn' : '';
    return `
    <div class="bar-row">
      <div class="bar-row__label">
        <span class="bar-row__flag" style="${flagBG(c.code)}"></span>
        ${A.escapeText(c.name)}
      </div>
      <div class="bar-row__track">
        <div class="bar-row__bar ${cls}" style="left:0;width:${pct}%"></div>
      </div>
      <div class="bar-row__val ${valCls}">${c.value.toFixed(1)}%</div>
    </div>`;
  }).join('')}</div>`;
}

// ── Ranking table rows ─────────────────────────────────────────────────────────
function renderRankingRows(rows) {
  return rows.map((c, i) => {
    const growth = window.G20Data.getLatest(c.iso3, 'GDP_GROWTH');
    const inf    = window.G20Data.getLatest(c.iso3, 'INFLATION');
    const unemp  = window.G20Data.getLatest(c.iso3, 'UNEMPLOYMENT');
    const debt   = window.G20Data.getLatest(c.iso3, 'DEBT_GDP');
    const ca     = window.G20Data.getLatest(c.iso3, 'CURRENT_ACC');
    const gdpSeries = window.G20Data.getSeries(c.iso3, 'GDP', 2015).map(d => d.value);

    const gv = growth?.value;
    const iv = inf?.value;
    const dv = debt?.value;
    const cav = ca?.value;

    const growthCls = gv !== undefined ? (gv < 0 ? 'v-neg' : gv >= 4 ? 'v-pos' : '') : '';
    const infCls    = iv !== undefined ? (iv > 8 ? 'v-neg' : iv > 4 ? 'v-warn' : '') : '';
    const debtCls   = dv !== undefined ? (dv > 100 ? 'v-warn' : '') : '';
    const caCls     = cav !== undefined ? (cav < -2 ? 'v-warn' : '') : '';

    return `
    <tr onclick="navTo('country/${c.iso3}')" style="cursor:pointer">
      <td class="col-no">${String(i+1).padStart(2,'0')}</td>
      <td class="col-flag"><span class="flag-rect" style="${flagBG(c.code)}"></span></td>
      <td class="col-name">
        <div class="country-cell">${A.escapeText(c.name)}<span class="sub">${c.iso3}</span></div>
      </td>
      <td>${c.value ? (c.value/1e12).toFixed(2) : '—'}</td>
      <td class="${growthCls}">${gv !== undefined ? A.fmtSignedPct(gv) : '—'}</td>
      <td class="${infCls}">${iv !== undefined ? iv.toFixed(1) + '%' : '—'}</td>
      <td>${unemp?.value !== undefined ? unemp.value.toFixed(1) + '%' : '—'}</td>
      <td class="${debtCls}">${dv !== undefined ? dv.toFixed(0) + '%' : '—'}</td>
      <td class="${caCls}">${cav !== undefined ? A.fmtSignedPct(cav).slice(0, -1) : '—'}</td>
      <td>${window.computeRiskScore ? (() => { const r = window.computeRiskScore(c.iso3); return `<span class="risk-pill ${r.labelCls}" title="${r.signals.join(', ')}">${r.label}</span>`; })() : '—'}</td>
      <td class="col-spark">${sparkSVG(gdpSeries, 86, 22)}</td>
    </tr>`;
  }).join('');
}

// ── Risk register rows ─────────────────────────────────────────────────────────
function renderRiskRows(items, descFn, valFn, sub) {
  if (!items.length) return '';
  return items.map(c => `
    <div class="risk-row" onclick="navTo('country/${c.iso3}')">
      <div class="risk-row__main">
        <span class="risk-row__country">
          <span class="flag-rect" style="${flagBG(c.code)}"></span>
          ${A.escapeText(c.name)}
        </span>
        <span class="risk-row__desc">${descFn(c)}</span>
      </div>
      <div class="risk-row__val">${valFn(c)}<span class="sub">${sub}</span></div>
    </div>`).join('');
}

// ── Global Outlook — live-computed from G20_DATA (auto-updates with monthly data refresh) ──
function renderGlobalOutlookComputed() {
  if (!window.G20Data) return '';
  const nonEU = c => c.iso3 !== 'EUU';

  const growthRank = window.G20Data.getRanking('GDP_GROWTH').filter(nonEU);
  const infRank    = window.G20Data.getRanking('INFLATION').filter(nonEU).sort((a,b) => b.value - a.value);
  const debtRank   = window.G20Data.getRanking('DEBT_GDP').filter(nonEU).sort((a,b) => b.value - a.value);

  if (!growthRank.length) return '';

  const medGrowth       = median(growthRank.map(c => c.value));
  const topGrowth       = growthRank[0];
  const contractingN    = growthRank.filter(c => c.value < 0).length;
  const medInf          = median(infRank.map(c => c.value));
  const highInflation   = infRank.filter(c => c.value > 8);
  const highDebtN       = debtRank.filter(c => c.value > 100).length;
  const topDebt         = debtRank[0];
  const latestYear      = growthRank[0]?.year || new Date().getFullYear() - 1;
  const topRisers       = growthRank.slice(0, 3);

  const sign = v => v >= 0 ? '+' : '';
  const pct  = (v, d=1) => `${parseFloat(v.toFixed(d))}%`;

  // Paragraph 1 — Economic Performance
  const p1 = `G20 economies recorded a median real GDP growth rate of <strong>${pct(medGrowth)}</strong> in <strong>${latestYear}</strong>, with <strong>${A.escapeText(topGrowth.name)}</strong> leading the group at <strong>${pct(topGrowth.value)}</strong>. ${contractingN > 0 ? `${contractingN} member ${contractingN === 1 ? 'economy' : 'economies'} contracted in the same period, reflecting the uneven distribution of momentum across the group.` : 'All G20 members recorded positive growth in the same period, reflecting broadly supportive global conditions.'}`;

  // Paragraph 2 — Inflation
  const highInflNames = highInflation.slice(0, 3).map(c => A.escapeText(c.name)).join(', ');
  const p2 = `Median consumer price inflation across the G20 stood at <strong>${pct(medInf)}</strong> in <strong>${latestYear}</strong>. ${highInflation.length > 0 ? `However, ${highInflNames} continue to face elevated price pressures well above the group average, complicating monetary policy normalisation and compressing real household incomes.` : 'Inflationary pressures are broadly contained across the group, supporting the case for a gradual easing of monetary policy in major economies.'}`;

  // Paragraph 3 — Fiscal
  const p3 = `Fiscal sustainability remains a structural concern across the G20. <strong>${highDebtN}</strong> member ${highDebtN === 1 ? 'economy' : 'economies'} carried government debt above 100% of GDP${topDebt ? `, led by <strong>${A.escapeText(topDebt.name)}</strong> at <strong>${parseFloat(topDebt.value.toFixed(0))}%</strong>` : ''}. Unless consolidation efforts accelerate, rising debt-service costs will progressively crowd out the discretionary investment needed in infrastructure, healthcare, and education.`;

  // Paragraph 4 — Outlook (prescriptive close)
  const p4 = `The near-term outlook is shaped by the interaction of three structural forces: the pace of disinflation, the trajectory of public debt, and the uneven diffusion of productivity-enhancing technology investment across member economies. The G20's strongest-growing economies in <strong>${latestYear}</strong>, including <strong>${topRisers.map(c => A.escapeText(c.name)).join(', ')}</strong>, need to sustain investment in physical and digital infrastructure to convert cyclical momentum into durable structural gains. Economies facing fiscal consolidation pressures should prioritise reforms that protect growth-enabling public spending while credibly narrowing deficits over the medium term.`;

  // Key risks — derived from live threshold breaches
  const keyRisks = [];
  if (highInflation.length > 0) keyRisks.push(`Persistent inflation above 8% in ${highInflation.length} ${highInflation.length === 1 ? 'economy' : 'economies'}, limiting the scope for monetary policy easing`);
  if (contractingN > 0) keyRisks.push(`Economic contraction in ${contractingN} G20 ${contractingN === 1 ? 'economy' : 'economies'}, signalling structural rather than cyclical weakness`);
  if (highDebtN > 3) keyRisks.push(`Elevated sovereign debt above 100% of GDP in ${highDebtN} economies, constraining counter-cyclical fiscal capacity`);
  keyRisks.push('Geopolitical economic fragmentation and tariff escalation weighing on global trade and investment flows');
  keyRisks.push('Divergent monetary policy cycles creating exchange rate volatility and capital flow disruption for emerging-market members');

  // Upside factors — top growers
  const upsides = [
    `${A.escapeText(topGrowth.name)}'s ${pct(topGrowth.value)} growth rate demonstrates that strong domestic demand and structural reform can sustain above-trend expansion`,
    'Disinflation across most advanced G20 economies is creating space for gradual monetary easing, which should support investment and consumption',
    'AI and digital infrastructure investment is generating productivity gains in leading economies that could broaden across the group over the 2026 to 2030 period',
  ];

  const listItem = (text, color) => `
    <li style="display:flex;gap:8px;align-items:baseline;margin-bottom:8px;font-size:12px;line-height:1.5;color:var(--text-2)">
      <span style="color:${color};flex-shrink:0;font-size:10px">▲</span>
      ${text}
    </li>`;

  return `
  <div class="sec-head">
    <div class="sec-head__title">G20 Outlook<span class="sec-head__sub">${latestYear} · computed from live World Bank and IMF data</span></div>
  </div>

  <div class="panel" style="margin-bottom:24px">
    <div class="panel__body" style="padding:20px 24px">
      <div style="display:grid;grid-template-columns:1fr 260px;gap:32px;align-items:start">

        <div>
          ${[p1, p2, p3, p4].map(p => `<p style="margin:0 0 14px;line-height:1.7;font-size:13px;color:var(--text-2)">${p}</p>`).join('')}
        </div>

        <div style="border-left:1px solid var(--rule);padding-left:20px">
          <div style="font-family:var(--font-mono);font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-4);margin-bottom:10px">Key risks</div>
          <ul style="margin:0 0 20px;padding:0;list-style:none">
            ${keyRisks.map(r => listItem(r, 'var(--neg)')).join('')}
          </ul>
          <div style="font-family:var(--font-mono);font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-4);margin-bottom:10px">Upside factors</div>
          <ul style="margin:0;padding:0;list-style:none">
            ${upsides.map(r => listItem(r, 'var(--pos)')).join('')}
          </ul>
        </div>

      </div>
    </div>
  </div>`;
}

// ── Utility ────────────────────────────────────────────────────────────────────
function median(arr) {
  if (!arr || !arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// ── Global Outlook editorial ───────────────────────────────────────────────────
function renderGlobalOutlook() {
  const g = window.G20_COMMENTARY?.global;
  if (!g) return '';

  return `
  <div class="sec-head">
    <div class="sec-head__title">${A.escapeText(g.title)}<span class="sec-head__sub">${A.escapeText(g.cutoff)}</span></div>
  </div>

  <div class="panel" style="margin-bottom:24px">
    <div class="panel__body" style="padding:20px 24px">
      <div style="display:grid;grid-template-columns:1fr 260px;gap:32px;align-items:start">

        <div>
          ${g.paragraphs.map(p => `<p style="margin:0 0 14px;line-height:1.7;font-size:13px;color:var(--text-2)">${A.escapeText(p)}</p>`).join('')}
        </div>

        <div style="border-left:1px solid var(--rule);padding-left:20px">
          <div style="font-family:var(--font-mono);font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-4);margin-bottom:10px">Key risks</div>
          <ul style="margin:0 0 20px;padding:0;list-style:none">
            ${g.keyRisks.map(r => `
              <li style="display:flex;gap:8px;align-items:baseline;margin-bottom:8px;font-size:12px;line-height:1.5;color:var(--text-2)">
                <span style="color:var(--neg);flex-shrink:0;font-size:10px">▲</span>
                ${A.escapeText(r)}
              </li>`).join('')}
          </ul>
          <div style="font-family:var(--font-mono);font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-4);margin-bottom:10px">Upside factors</div>
          <ul style="margin:0;padding:0;list-style:none">
            ${g.upside.map(r => `
              <li style="display:flex;gap:8px;align-items:baseline;margin-bottom:8px;font-size:12px;line-height:1.5;color:var(--text-2)">
                <span style="color:var(--pos);flex-shrink:0;font-size:10px">▲</span>
                ${A.escapeText(r)}
              </li>`).join('')}
          </ul>
        </div>

      </div>
    </div>
  </div>`;
}

// mountOverviewCharts is called by main.js after render — no chart.js needed now (pure CSS bars)
function mountOverviewCharts() {
  // No Chart.js charts on overview page — all CSS bars
}

// ── Ranking table sort ────────────────────────────────────────────────────────
window.overviewSortTable = function(mode, btn) {
  document.querySelectorAll('[onclick^="overviewSortTable"]').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const nonEU = c => c.iso3 !== 'EUU';
  const gdpRank    = window.G20Data.getRanking('GDP').filter(nonEU);
  const growthRank = window.G20Data.getRanking('GDP_GROWTH').filter(nonEU);
  const infRank    = window.G20Data.getRanking('INFLATION').filter(nonEU).sort((a,b) => b.value - a.value);
  const rows = mode === 'growth' ? growthRank : mode === 'cpi' ? infRank : gdpRank;
  const tbody = document.getElementById('rank-tbody');
  if (tbody) tbody.innerHTML = renderRankingRows(rows);
};

// ── KPI group filter: All G20 / Advanced / Emerging ───────────────────────────
// Advanced economies within the G20 (IMF classification); the rest are emerging.
const AE_SET = new Set(['USA','GBR','CAN','DEU','FRA','ITA','JPN','AUS','KOR']);
window.overviewFilterClass = function(group, btn) {
  document.querySelectorAll('[onclick^="overviewFilterClass"]').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const nonEU = c => c.iso3 !== 'EUU';
  const inGroup = c => group === 'all' ? true : group === 'ae' ? AE_SET.has(c.iso3) : !AE_SET.has(c.iso3);
  const filt = arr => arr.filter(nonEU).filter(inGroup);

  const gdpRank    = filt(window.G20Data.getRanking('GDP'));
  const growthRank = filt(window.G20Data.getRanking('GDP_GROWTH'));
  const infRank    = filt(window.G20Data.getRanking('INFLATION'));
  const debtRank   = filt(window.G20Data.getRanking('DEBT_GDP')).sort((a, b) => b.value - a.value);

  const totalGDP     = gdpRank.reduce((s, c) => s + (c.value || 0), 0);
  const growthVals   = growthRank.map(c => c.value);
  const medianGrowth = median(growthVals);
  const medianInf    = median(infRank.map(c => c.value));
  const expandingN   = growthVals.filter(v => v > 0).length;
  const latestYear   = gdpRank[0]?.year || '2024';

  const grid = document.getElementById('kpi-grid');
  if (grid) grid.innerHTML = renderKPITiles(totalGDP, medianGrowth, medianInf, expandingN, growthVals.length, debtRank, latestYear);
};

// ── Risk register severity filter ─────────────────────────────────────────────
window.overviewFilterRisk = function(severity, btn) {
  document.querySelectorAll('[onclick^="overviewFilterRisk"]').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('#risk-register-panels .panel[data-severity]').forEach(el => {
    el.style.display = (severity === 'all' || el.dataset.severity === severity) ? '' : 'none';
  });
};
