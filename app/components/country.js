// Country grid page + individual country profile page — Direction B design

// ── Countries grid ────────────────────────────────────────────────────────────
function renderCountries() {
  return `
    <div class="page-body">
      <div class="sec-head">
        <div class="sec-head__title">All economies <span class="count">/ ${G20.length}</span><span class="sec-head__sub">click to open profile</span></div>
      </div>
      <div class="country-grid">
        ${G20.map(c => {
          const gdp  = window.G20Data.getLatest(c.iso3, 'GDP');
          const gr   = window.G20Data.getLatest(c.iso3, 'GDP_GROWTH');
          const inf  = window.G20Data.getLatest(c.iso3, 'INFLATION');
          const une  = window.G20Data.getLatest(c.iso3, 'UNEMPLOYMENT');
          const gv   = gr?.value;
          const growthClass = gv === undefined ? '' : gv >= 2 ? 'good' : gv < 0 ? 'bad' : '';
          const infClass    = inf?.value > 8 ? 'bad' : inf?.value > 4 ? 'warn' : '';
          return `
            <div class="co-card" onclick="navTo('country/${c.iso3}')">
              <div class="co-card__head">
                <div class="co-flag" style="background-image:url('https://flagcdn.com/${c.code.toLowerCase()}.svg');background-size:cover;background-position:center;"></div>
                <div>
                  <div class="co-name">${A.escapeText(c.name)}</div>
                  <div class="co-region">${A.escapeText(c.region)}</div>
                </div>
              </div>
              <div class="co-card__stats">
                <div>
                  <div class="co-stat-label">GDP</div>
                  <div class="co-stat-value">${gdp?.value ? '$' + (gdp.value/1e12).toFixed(2) + 'T' : '—'}</div>
                </div>
                <div>
                  <div class="co-stat-label">Growth</div>
                  <div class="co-stat-value ${growthClass}">${gv !== undefined ? A.fmtSignedPct(gv) : '—'}</div>
                </div>
                <div>
                  <div class="co-stat-label">CPI</div>
                  <div class="co-stat-value ${infClass}">${inf?.value !== undefined ? inf.value.toFixed(1) + '%' : '—'}</div>
                </div>
                <div>
                  <div class="co-stat-label">Unemp.</div>
                  <div class="co-stat-value ${une?.value > 10 ? 'bad' : ''}">${une?.value !== undefined ? une.value.toFixed(1) + '%' : '—'}</div>
                </div>
              </div>
            </div>`;
        }).join('')}
      </div>
    </div>`;
}

// ── Country profile ───────────────────────────────────────────────────────────
function renderCountryProfile(iso3) {
  const country = G20.find(c => c.iso3 === iso3);
  if (!country) return `<div class="page-body"><div class="loading-spinner"><span>Country not found: ${A.escapeText(iso3)}</span></div></div>`;

  const gdp    = window.G20Data.getLatest(iso3, 'GDP');
  const gr     = window.G20Data.getLatest(iso3, 'GDP_GROWTH');
  const inf    = window.G20Data.getLatest(iso3, 'INFLATION');
  const une    = window.G20Data.getLatest(iso3, 'UNEMPLOYMENT');
  const debt   = window.G20Data.getLatest(iso3, 'DEBT_GDP');
  const cap    = window.G20Data.getLatest(iso3, 'GDP_CAPITA');
  const ca     = window.G20Data.getLatest(iso3, 'CURRENT_ACC');
  const health = window.G20Data.getLatest(iso3, 'HEALTH_EXP');
  const rd     = window.G20Data.getLatest(iso3, 'RD_EXP');
  const pop    = window.G20Data.getLatest(iso3, 'POPULATION');
  const youth  = window.G20Data.getLatest(iso3, 'YOUTH_UNEMP');
  const capfrm = window.G20Data.getLatest(iso3, 'CAPITAL_FORM');
  const fdi    = window.G20Data.getLatest(iso3, 'FDI_INFLOWS');
  const educ   = window.G20Data.getLatest(iso3, 'EDUC_EXP');
  const fiscal = window.G20Data.getLatest(iso3, 'FISCAL_BAL');
  const tax    = window.G20Data.getLatest(iso3, 'TAX_REVENUE');
  const exports_gdp = window.G20Data.getLatest(iso3, 'EXPORTS_GDP');
  const mfg    = window.G20Data.getLatest(iso3, 'MANUFACTURING');

  const gv = gr?.value;
  const iv = inf?.value;
  const dv = debt?.value;

  const growthCls = gv !== undefined ? (gv < 0 ? '#F08F8F' : gv >= 4 ? '#6FCBA8' : 'var(--text-on-ink)') : 'var(--text-on-ink)';

  const vintage = Math.max(
    gdp?.year || 0, gr?.year || 0, inf?.year || 0, une?.year || 0, debt?.year || 0
  );
  const commentaryDate = window.G20_COMMENTARY?.global?._generatedAt
    ? new Date(window.G20_COMMENTARY.global._generatedAt)
        .toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : null;

  // AI draft context for this country
  const contextSnippet = [
    gdp   ? `GDP: $${(gdp.value/1e12).toFixed(2)}T` : null,
    gv !== undefined ? `Growth: ${A.fmtSignedPct(gv)}` : null,
    iv !== undefined ? `Inflation: ${iv.toFixed(1)}%` : null,
    une?.value !== undefined ? `Unemployment: ${une.value.toFixed(1)}%` : null,
    dv !== undefined ? `Debt/GDP: ${dv.toFixed(0)}%` : null,
    youth?.value !== undefined ? `Youth Unemp: ${youth.value.toFixed(1)}%` : null,
    educ?.value  !== undefined ? `Education: ${educ.value.toFixed(1)}% GDP` : null,
    capfrm?.value !== undefined ? `Capital Formation: ${capfrm.value.toFixed(1)}% GDP` : null,
    fdi?.value   !== undefined ? `FDI Inflows: ${fdi.value.toFixed(1)}% GDP` : null,
    fiscal?.value !== undefined ? `Fiscal Balance: ${fiscal.value.toFixed(1)}% GDP` : null,
    tax?.value   !== undefined ? `Tax Revenue: ${tax.value.toFixed(1)}% GDP` : null,
    exports_gdp?.value !== undefined ? `Exports: ${exports_gdp.value.toFixed(1)}% GDP` : null,
    mfg?.value   !== undefined ? `Manufacturing: ${mfg.value.toFixed(1)}% GDP` : null,
  ].filter(Boolean).join(', ');

  return `
<section class="profile-hero">
  <div class="profile-hero__inner">
    <div class="profile-hero__flag" style="background-image:url('https://flagcdn.com/${country.code.toLowerCase()}.svg');"></div>
    <div class="profile-hero__meta">
      <div class="profile-hero__name">${A.escapeText(country.name)}</div>
      <div class="profile-hero__region">${A.escapeText(country.region)}</div>
      <div class="profile-hero__stats">
        ${gdp ? `<div><div class="profile-hero__stat-lbl">GDP</div><div class="profile-hero__stat-val">$${(gdp.value/1e12).toFixed(2)}T</div></div>` : ''}
        ${gv !== undefined ? `<div><div class="profile-hero__stat-lbl">Growth</div><div class="profile-hero__stat-val" style="color:${growthCls}">${A.fmtSignedPct(gv)}</div></div>` : ''}
        ${iv !== undefined ? `<div><div class="profile-hero__stat-lbl">CPI</div><div class="profile-hero__stat-val">${iv.toFixed(1)}%</div></div>` : ''}
        ${une?.value !== undefined ? `<div><div class="profile-hero__stat-lbl">Unemp.</div><div class="profile-hero__stat-val">${une.value.toFixed(1)}%</div></div>` : ''}
        ${dv !== undefined ? `<div><div class="profile-hero__stat-lbl">Debt/GDP</div><div class="profile-hero__stat-val" style="${dv > 100 ? 'color:#E8C063' : ''}">${dv.toFixed(0)}%</div></div>` : ''}
      </div>
      ${vintage || commentaryDate ? `<div style="font-family:var(--font-mono);font-size:10px;color:rgba(245,245,242,0.4);margin-top:10px">${vintage ? `Data ${vintage}` : ''}${vintage && commentaryDate ? ' · ' : ''}${commentaryDate ? `Analysis ${commentaryDate}` : ''}</div>` : ''}
    </div>
  </div>
</section>

<div class="page-body">

  ${renderCountryBrief(iso3, country, vintage, commentaryDate)}

  <div class="sec-head" style="margin-top:4px">
    <div class="sec-head__title">Key indicators</div>
  </div>
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;margin-bottom:20px">
    ${renderMiniKPI('GDP per Capita', cap?.value ? '$' + (cap.value/1000).toFixed(0) + 'K' : '—', cap?.year, '', 'WB')}
    ${renderMiniKPI('Current Acct', ca?.value !== undefined ? A.fmtSignedPct(ca.value).replace('%', '% GDP') : '—', ca?.year, ca?.value < -2 ? 'v-warn' : '', 'WB')}
    ${renderMiniKPI('Fiscal Balance', fiscal?.value !== undefined ? A.fmtSignedPct(fiscal.value).replace('%', '% GDP') : '—', fiscal?.year, fiscal?.value < -6 ? 'v-warn' : '', 'IMF')}
    ${renderMiniKPI('Tax Revenue', tax?.value !== undefined ? tax.value.toFixed(1) + '% GDP' : '—', tax?.year, '', 'WB')}
    ${renderMiniKPI('Health Spending', health?.value !== undefined ? health.value.toFixed(1) + '% GDP' : '—', health?.year, '', 'WB')}
    ${renderMiniKPI('R&D Spending', rd?.value !== undefined ? rd.value.toFixed(2) + '% GDP' : '—', rd?.year, '', 'OECD')}
    ${renderMiniKPI('Youth Unemp.', youth?.value !== undefined ? youth.value.toFixed(1) + '%' : '—', youth?.year, youth?.value > 25 ? 'v-warn' : '', 'WB')}
    ${renderMiniKPI('Education', educ?.value !== undefined ? educ.value.toFixed(1) + '% GDP' : '—', educ?.year, '', 'WB')}
  </div>

  <div class="sec-head" style="margin-top:4px">
    <div class="sec-head__title">vs G20 median</div>
  </div>
  <div class="panel" style="margin-bottom:20px">
    ${renderStanding(iso3)}
  </div>

  <button class="back-btn" onclick="navTo('countries')" style="margin-bottom:24px">
    ← Back to all countries
  </button>

</div>`;
}

// ── Mini KPI card ─────────────────────────────────────────────────────────────
function renderMiniKPI(label, value, year, cls, source) {
  const srcHtml = source ? ` <span class="src-tag">${source}</span>` : '';
  return `
    <div class="panel">
      <div class="panel__body" style="padding:12px 14px">
        <div class="kpi-tile__lbl">${label}</div>
        <div class="kpi-tile__val ${cls || ''}" style="font-size:18px;margin-top:6px">${value}</div>
        <div class="kpi-tile__delta">${year || '—'}${srcHtml}</div>
      </div>
    </div>`;
}

// ── Standing chart (vs G20 median) ───────────────────────────────────────────
function renderStanding(iso3) {
  const keys = [
    { key: 'GDP_GROWTH',   label: 'Growth',        unit: '%',     factor: 1 },
    { key: 'INFLATION',    label: 'Inflation',     unit: '%',     factor: 1 },
    { key: 'UNEMPLOYMENT', label: 'Unemp.',        unit: '%',     factor: 1 },
    { key: 'DEBT_GDP',     label: 'Govt Debt',     unit: '%',     factor: 1 },
    { key: 'FISCAL_BAL',   label: 'Fiscal Bal.',   unit: '% GDP', factor: 1 },
    { key: 'HEALTH_EXP',   label: 'Health',        unit: '% GDP', factor: 1 },
    { key: 'YOUTH_UNEMP',  label: 'Youth Unemp.',  unit: '%',     factor: 1 },
    { key: 'CAPITAL_FORM', label: 'Investment',    unit: '% GDP', factor: 1 },
    { key: 'EDUC_EXP',     label: 'Education',     unit: '% GDP', factor: 1 },
    { key: 'EXPORTS_GDP',  label: 'Exports',       unit: '% GDP', factor: 1 },
    { key: 'TAX_REVENUE',  label: 'Tax Revenue',   unit: '% GDP', factor: 1 },
  ];

  const rows = keys.map(({ key, label, unit }) => {
    const rank = window.G20Data.getRanking(key).filter(c => c.iso3 !== 'EUU');
    if (!rank.length) return null;
    const vals = rank.map(c => c.value);
    const med = median(vals);
    const countryVal = window.G20Data.getLatest(iso3, key)?.value;
    if (countryVal === undefined || countryVal === null) return null;
    const maxVal = Math.max(...vals);
    const pctCountry = (countryVal / maxVal) * 100;
    const pctMedian  = (med / maxVal) * 100;
    return { label, unit, countryVal, med, pctCountry, pctMedian };
  }).filter(Boolean);

  if (!rows.length) return '<div class="panel__body"><span style="color:var(--text-3);font-size:12px">Insufficient data</span></div>';

  return `
    <div class="standing-grid">
      ${rows.map(r => `
        <div class="standing-row">
          <div class="standing-lbl">${r.label}</div>
          <div class="standing-bars">
            <div class="standing-bar-wrap">
              <div class="standing-bar-fill standing-bar-country" style="width:${Math.max(r.pctCountry, 2).toFixed(1)}%"></div>
            </div>
            <div class="standing-bar-wrap">
              <div class="standing-bar-fill standing-bar-median" style="width:${Math.max(r.pctMedian, 2).toFixed(1)}%"></div>
            </div>
          </div>
          <div class="standing-val">${r.countryVal.toFixed(1)}${r.unit}</div>
        </div>`).join('')}
    </div>
    <div class="standing-legend">
      <span class="standing-legend-dot" style="background:var(--ink)"></span> This country
      <span class="standing-legend-dot" style="background:var(--text-4)"></span> G20 median
    </div>`;
}

// ── Key facts strip (shown above analysis sections) ───────────────────────────
function renderKeyFacts(iso3) {
  const get = key => window.G20Data.getLatest(iso3, key);
  const gdp    = get('GDP');
  const gr     = get('GDP_GROWTH');
  const inf    = get('INFLATION');
  const une    = get('UNEMPLOYMENT');
  const debt   = get('DEBT_GDP');
  const fiscal = get('FISCAL_BAL');
  const cap    = get('GDP_CAPITA');
  const life   = get('LIFE_EXPECT');

  const items = [
    gdp    ? { label: 'GDP',          val: '$' + (gdp.value/1e12).toFixed(2) + 'T',   yr: gdp.year }    : null,
    gr     ? { label: 'GDP Growth',   val: A.fmtSignedPct(gr.value), yr: gr.year,
               cls: gr.value < 0 ? 'color:#C0392B' : gr.value >= 4 ? 'color:#27AE60' : '' } : null,
    inf    ? { label: 'Inflation',    val: inf.value.toFixed(1) + '%',    yr: inf.year,
               cls: inf.value > 8 ? 'color:#C0392B' : inf.value > 4 ? 'color:#E8A236' : '' } : null,
    une    ? { label: 'Unemployment', val: une.value.toFixed(1) + '%',    yr: une.year }    : null,
    debt   ? { label: 'Debt / GDP',   val: debt.value.toFixed(0) + '%',   yr: debt.year,
               cls: debt.value > 100 ? 'color:#E8A236' : '' } : null,
    fiscal ? { label: 'Fiscal Bal.',  val: A.fmtSignedPct(fiscal.value), yr: fiscal.year,
               cls: fiscal.value < -6 ? 'color:#C0392B' : fiscal.value < 0 ? 'color:#E8A236' : 'color:#27AE60' } : null,
    cap    ? { label: 'GDP / Capita', val: '$' + Math.round(cap.value/1000) + 'K',     yr: cap.year }    : null,
    life   ? { label: 'Life Expect.', val: life.value.toFixed(1) + ' yrs',              yr: life.year }   : null,
  ].filter(Boolean);

  if (!items.length) return '';
  return `<div class="brief-kf">${items.map(it => `
    <div class="brief-kf__row">
      <span class="brief-kf__lbl">${it.label}</span>
      <span class="brief-kf__val" style="${it.cls || ''}">${it.val}</span>
      <span class="brief-kf__yr">${it.yr}</span>
    </div>`).join('')}</div>`;
}

// ── OECD-style country brief panel ───────────────────────────────────────────
function renderCountryBrief(iso3, country, vintage, commentaryDate) {
  const vintageStr = [
    vintage ? `Data ${vintage}` : '',
    commentaryDate ? `Analysis ${commentaryDate}` : '',
  ].filter(Boolean).join(' · ');

  const sections = [
    { id: 0, heading: 'Economic Performance',        chartTitle: 'GDP (USD)',            chartSub: '2015–latest · WB',   canvasId: 'profile-gdp-chart',        dual: false },
    { id: 1, heading: 'Labour Market & Prices',      chartTitle: 'Unemployment %',       chartSub: 'WB',                 canvasId: 'profile-unemp-chart',       dual: true,
      chart2Title: 'CPI Inflation %',  chart2Sub: 'WB', canvas2Id: 'profile-inflation-chart' },
    { id: 2, heading: 'Fiscal Position',             chartTitle: 'Govt Debt / GDP %',   chartSub: 'IMF',                canvasId: 'profile-debt-chart',        dual: false },
    { id: 3, heading: 'External Sector & Investment',chartTitle: 'Current Account % GDP',chartSub: 'WB',                canvasId: 'profile-ca-chart',          dual: false },
    { id: 4, heading: 'Outlook & Key Risks',         chartTitle: 'GDP Growth %',         chartSub: 'Annual · WB',        canvasId: 'profile-growth-chart',      dual: false },
  ];

  const sectionRows = sections.map(s => {
    const chartPanel = s.dual ? `
      <div class="chart-panel chart-panel--mini">
        <div class="chart-panel__head">
          <span class="chart-panel__title">${s.chartTitle}</span>
          <span class="chart-panel__sub">${s.chartSub}</span>
        </div>
        <div class="chart-panel__body"><canvas id="${s.canvasId}"></canvas></div>
      </div>
      <div class="chart-panel chart-panel--mini" style="margin-top:8px">
        <div class="chart-panel__head">
          <span class="chart-panel__title">${s.chart2Title}</span>
          <span class="chart-panel__sub">${s.chart2Sub}</span>
        </div>
        <div class="chart-panel__body"><canvas id="${s.canvas2Id}"></canvas></div>
      </div>` : `
      <div class="chart-panel">
        <div class="chart-panel__head">
          <span class="chart-panel__title">${s.chartTitle}</span>
          <span class="chart-panel__sub">${s.chartSub}</span>
        </div>
        <div class="chart-panel__body"><canvas id="${s.canvasId}"></canvas></div>
      </div>`;

    return `
    <div class="country-section-row" id="csrow-${s.id}">
      <div class="country-section__text">
        <div class="brief-section__hd">${s.heading}</div>
        <p class="brief-section__body" id="brief-body-${s.id}">Loading…</p>
      </div>
      <div class="country-section__chart">${chartPanel}</div>
    </div>`;
  }).join('');

  return `
  <div class="country-brief" id="country-brief">
    <div class="country-brief__head">
      <div>
        <div class="country-brief__headline" id="brief-headline">—</div>
        <div class="country-brief__vintage">${A.escapeText(vintageStr)}</div>
      </div>
      <div class="country-brief__actions">
        <button class="analyst-btn" onclick="saveBrief('${iso3}')">Save edits</button>
      </div>
    </div>

    ${renderKeyFacts(iso3)}

    ${sectionRows}

    <div class="country-brief__foot">
      <div class="brief-methodology">
        <div class="brief-method__title">Data vintage — IMF World Economic Outlook April 2026</div>
        <div class="brief-method__grid">
          ${[
            ['GDP',         'World Bank'],
            ['GDP_GROWTH',  'OECD/IMF WEO'],
            ['INFLATION',   'IMF WEO'],
            ['UNEMPLOYMENT','IMF WEO'],
            ['DEBT_GDP',    'IMF'],
            ['FISCAL_BAL',  'IMF WEO'],
            ['CURRENT_ACC', 'IMF WEO'],
            ['HEALTH_EXP',  'WB/WHO'],
            ['RD_EXP',      'OECD MSTI'],
            ['TRADE_GDP',   'World Bank'],
          ].map(([key, src]) => {
            const d = window.G20Data.getLatest(iso3, key);
            if (!d) return '';
            const label = d.period && d.period.length > 4
              ? `<span class="period-badge">${d.period.substring(4)} ${d.period.substring(0,4)}</span>`
              : d.year;
            return `<span class="m-ind">${key.replace('_',' ')}</span><span class="m-src">${src}</span><span class="m-yr">${label}</span>`;
          }).filter(Boolean).join('')}
        </div>
        <div class="brief-method__note">Sources: IMF WEO Apr 2026 · World Bank Open Data CC BY 4.0 · OECD MSTI · Refreshed monthly via automated pipeline.</div>
      </div>
    </div>
  </div>`;
}

// ── Analyst commentary block ──────────────────────────────────────────────────
function renderAnalystBlock(iso3, countryName, contextSnippet, title, blockId) {
  blockId = blockId || 'main';
  const storageKey = `country:${iso3}:narrative:${blockId}`;
  const saved = '';

  return `
    <div class="analyst-block" id="analyst-block-${blockId}">
      <div class="analyst-block__head">
        <span class="analyst-block__title">${title || 'Analyst note'}</span>
        <div class="analyst-block__actions">
          <button class="analyst-btn" onclick="draftAnalysis('${iso3}', '${blockId}', '${A.escapeAttr(contextSnippet)}')">Draft with AI</button>
          <button class="analyst-btn" onclick="editAnalysis('${blockId}')">Edit</button>
          <button class="analyst-btn primary" onclick="saveAnalysis('${blockId}', '${iso3}')">Save</button>
        </div>
      </div>
      <div class="analyst-body" id="analyst-body-${blockId}">
        <div class="analyst-empty">No note yet. Click <b>Draft with AI</b> for a starting point, or <b>Edit</b> to write your own.</div>
      </div>
      <div class="analyst-foot">
        <span id="analyst-status-${blockId}">Not saved</span>
        <span>${countryName}</span>
      </div>
    </div>`;
}

// ── Placement switcher ────────────────────────────────────────────────────────
window.switchPlacement = function(mode, btn) {
  document.querySelectorAll('.placement-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');

  const lead   = document.getElementById('analyst-lead');
  const side   = document.getElementById('analyst-side');
  const inlineNote = document.getElementById('inline-note-gdp');
  const layout = document.getElementById('profile-layout');

  if (mode === 'lead') {
    if (lead) lead.style.display = '';
    if (side) side.style.display = 'none';
    if (inlineNote) inlineNote.style.display = 'none';
    if (layout) layout.style.gridTemplateColumns = '1fr auto';
  } else if (mode === 'side') {
    if (lead) lead.style.display = 'none';
    if (side) side.style.display = '';
    if (inlineNote) inlineNote.style.display = 'none';
    if (layout) layout.style.gridTemplateColumns = '1fr 280px';
  } else if (mode === 'inline') {
    if (lead) lead.style.display = 'none';
    if (side) side.style.display = 'none';
    if (inlineNote) inlineNote.style.display = '';
    if (layout) layout.style.gridTemplateColumns = '1fr';
  }
};

// ── Analyst actions ───────────────────────────────────────────────────────────
window.editAnalysis = function(blockId) {
  const body = document.getElementById(`analyst-body-${blockId}`);
  if (!body) return;
  const current = body.querySelector('.analyst-saved, .analyst-draft, .analyst-empty');
  const text = current ? (current.textContent || '') : '';
  body.innerHTML = `<textarea class="analyst-textarea" id="analyst-textarea-${blockId}" placeholder="Write your analysis here…">${A.escapeText(text.trim())}</textarea>`;
  document.getElementById(`analyst-textarea-${blockId}`)?.focus();
};

window.saveAnalysis = function(blockId, iso3) {
  const textarea = document.getElementById(`analyst-textarea-${blockId}`);
  const body = document.getElementById(`analyst-body-${blockId}`);
  const status = document.getElementById(`analyst-status-${blockId}`);
  if (!body) return;

  const text = textarea ? textarea.value.trim() : (body.querySelector('.analyst-saved, .analyst-draft')?.textContent?.trim() || '');
  if (!text) return;

  const storageKey = `country:${iso3}:narrative:${blockId}`;
  try { localStorage.setItem(storageKey, text); } catch(e) {}

  body.innerHTML = `<div class="analyst-saved">${A.escapeText(text)}</div>`;
  if (status) status.textContent = 'Saved · ' + new Date().toLocaleTimeString();
};

window.draftAnalysis = async function(iso3, blockId, context) {
  const body = document.getElementById(`analyst-body-${blockId}`);
  const status = document.getElementById(`analyst-status-${blockId}`);
  if (!body) return;

  body.innerHTML = `<div class="analyst-draft">Drafting analysis…</div>`;

  const country = G20.find(c => c.iso3 === iso3);
  const prompt = `You are an institutional economic analyst. Write a concise 3-4 sentence analyst note for ${country?.name || iso3} based on these latest indicators: ${context}. Focus on key trends, risks, and outlook. Write in a professional, neutral tone suitable for an OECD-style economic brief.`;

  try {
    const r = await fetch('/api/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: prompt,
        context: context,
      }),
    });
    const { text, error } = await r.json();
    const draft = text || error || fallbackDraft(iso3, context);
    body.innerHTML = `<div class="analyst-draft">${A.escapeText(draft)}</div>`;
    if (status) status.textContent = 'AI draft · click Save to keep';
  } catch (e) {
    const draft = fallbackDraft(iso3, context);
    body.innerHTML = `<div class="analyst-draft">${A.escapeText(draft)}</div>`;
    if (status) status.textContent = 'Offline draft';
  }
};

function fallbackDraft(iso3, context) {
  const country = G20.find(c => c.iso3 === iso3);
  return `${country?.name || iso3} — ${context}. The economy shows mixed signals consistent with broader G20 trends. Further monitoring of fiscal trajectory and external balance is warranted.`;
}

// ── Data-driven commentary generator ─────────────────────────────────────────
function generateBriefContent(iso3) {
  // EUU is a 27-member aggregate, not a single sovereign — provide bloc-level framing
  if (iso3 === 'EUU') {
    return {
      headline: 'European Union — aggregate economic profile of 27 member states',
      sections: [
        'The European Union represents the combined economic output of 27 member states, functioning as a single-market aggregate within G20 frameworks. GDP and growth figures reflect euro area-wide averages and should be interpreted as bloc-level indicators rather than a single sovereign\'s performance.',
        'Inflation and labour market conditions in the EU aggregate mask substantial divergence across member states — from near-full employment in Germany and the Netherlands to structurally elevated unemployment across southern member economies. The ECB\'s single monetary policy must navigate this heterogeneity.',
        'EU fiscal data aggregates 27 sovereign governments operating under the Stability and Growth Pact framework, which targets deficits below 3% of GDP and debt below 60% — thresholds that multiple member states have exceeded and that are subject to ongoing reform.',
        'As the world\'s largest trading bloc, the EU\'s external position is shaped by Germany\'s manufacturing export surplus, the energy import dependency of southern and eastern member states, and the ongoing reorientation of supply chains away from Russia following the 2022 energy crisis.',
        'The EU\'s medium-term outlook centres on the twin transitions — digital and green — under the European Green Deal and industrial competitiveness agenda. Structural headwinds include demographic ageing, energy security costs, and competitive pressure from US and Chinese industrial policy in strategic technology sectors.',
      ],
    };
  }

  const L  = (key) => window.G20Data.getLatest(iso3, key);
  const S  = (key, n = 5) => {
    const latest = L(key);
    if (!latest) return [];
    return window.G20Data.getSeries(iso3, key, latest.year - n);
  };
  const avg5 = (key) => {
    const s = S(key, 5);
    if (!s.length) return null;
    return s.reduce((a, d) => a + d.value, 0) / s.length;
  };
  const trendDir = (key, n = 4) => {
    const s = S(key, n);
    if (s.length < 2) return null;
    const delta = s[s.length - 1].value - s[0].value;
    if (Math.abs(delta) < 0.3) return 'stable';
    return delta > 0 ? 'rising' : 'falling';
  };
  const peakOf = (key, n = 8) => {
    const s = S(key, n);
    if (!s.length) return null;
    return s.reduce((m, d) => d.value > m.value ? d : m, s[0]);
  };
  const g20Rank = (key) => {
    const r = window.G20Data.getRanking(key).filter(c => c.iso3 !== 'EUU');
    const i = r.findIndex(c => c.iso3 === iso3);
    return i >= 0 ? { rank: i + 1, total: r.length } : null;
  };
  const g20Avg = (key) => {
    const r = window.G20Data.getRanking(key).filter(c => c.iso3 !== 'EUU');
    if (!r.length) return null;
    return r.reduce((s, c) => s + c.value, 0) / r.length;
  };
  const g20Median = (key) => {
    const r = window.G20Data.getRanking(key).filter(c => c.iso3 !== 'EUU');
    if (!r.length) return null;
    const vals = r.map(c => c.value).sort((a, b) => a - b);
    const m = Math.floor(vals.length / 2);
    return vals.length % 2 ? vals[m] : (vals[m - 1] + vals[m]) / 2;
  };
  // Format a data point's period for prose: '2026Q1' → 'Q1 2026', year number → string year
  const periodLabel = (d) => {
    if (!d) return '—';
    if (d.period && d.period.length > 4) {
      const yr = d.period.substring(0, 4);
      const q  = d.period.substring(4); // 'Q1', 'Q2', etc.
      return `${q} ${yr}`;
    }
    return String(d.year || '—');
  };
  const ordinal = (n) => {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  const country = G20.find(c => c.iso3 === iso3);
  const name    = country?.name || iso3;

  const gdp    = L('GDP');          const gr     = L('GDP_GROWTH');
  const cap    = L('GDP_CAPITA');   const capPPP = L('GDP_CAPITA_PPP');
  const capfrm = L('CAPITAL_FORM'); const mfg    = L('MANUFACTURING');
  const inf    = L('INFLATION');    const une    = L('UNEMPLOYMENT');
  const youth  = L('YOUTH_UNEMP'); const flf    = L('FEMALE_LFP');
  const debt   = L('DEBT_GDP');     const fbal   = L('FISCAL_BAL');
  const tax    = L('TAX_REVENUE'); const health  = L('HEALTH_EXP');
  const educ   = L('EDUC_EXP');
  const trade  = L('TRADE_GDP');    const exports_gdp = L('EXPORTS_GDP');
  const ca     = L('CURRENT_ACC'); const fdi    = L('FDI_INFLOWS');
  const gini   = L('GINI');         const rd     = L('RD_EXP');
  const life   = L('LIFE_EXPECT'); const researchers = L('RESEARCHERS');

  const gv        = gr?.value;
  const g20GrAvg  = g20Avg('GDP_GROWTH');

  // ── Headline — punchy editorial sentence, not a data ticker ─────────────────
  let headline = name;
  if (inf?.value != null && inf.value > 50) {
    headline = trendDir('INFLATION') === 'falling'
      ? `${name}: stabilisation underway as inflation decelerates from ${inf.value.toFixed(0)}%`
      : `${name}: macroeconomic emergency — inflation at ${inf.value.toFixed(0)}% demands urgent policy response`;
  } else if (gv != null && gv < 0 && trendDir('GDP_GROWTH') === 'falling') {
    headline = `${name}: contraction deepens as structural headwinds outweigh policy support`;
  } else if (gv != null && gv < 0) {
    headline = `${name}: economic contraction as cyclical and structural pressures converge`;
  } else if (gv != null && gv >= 5) {
    const grRank = g20Rank('GDP_GROWTH');
    headline = grRank?.rank <= 3
      ? `${name} leads the G20 with ${gv.toFixed(1)}% growth — but structural development gaps require attention`
      : `${name}'s ${gv.toFixed(1)}% expansion outpaces G20 peers as investment and reform dividends materialise`;
  } else if (debt?.value != null && debt.value > 100 && gv != null && gv < 2) {
    headline = `${name}: below-trend growth and elevated debt constrain the government's fiscal manoeuvre room`;
  } else if (une?.value != null && une.value > 15) {
    headline = `${name}'s structural unemployment crisis casts a shadow over ${gv != null ? gv.toFixed(1) + '%' : 'moderate'} growth`;
  } else if (gv != null && g20GrAvg != null) {
    const diff = gv - g20GrAvg;
    const rel  = Math.abs(diff) < 0.4 ? 'broadly in line with G20 peers'
               : diff > 0 ? `outperforming the G20 average of ${g20GrAvg.toFixed(1)}%`
                           : `below the G20 average of ${g20GrAvg.toFixed(1)}%`;
    headline = `${name}: ${gv >= 0 ? '+' : ''}${gv.toFixed(1)}% growth — ${rel}${gdp?.value ? `, $${(gdp.value/1e12).toFixed(2)}T economy` : ''}`;
  } else if (gdp?.value) {
    headline = `${name}: $${(gdp.value/1e12).toFixed(2)}T economy`;
  }

  // ── Section 0 — Economic Performance ────────────────────────────────────────
  const sec0 = [];

  if (gdp?.value) {
    const gdpRank = g20Rank('GDP');
    if (gv != null) {
      const grDiff = g20GrAvg != null ? gv - g20GrAvg : null;
      const grRel  = grDiff == null ? '' :
        Math.abs(grDiff) < 0.4 ? ', in line with the G20 average' :
        grDiff > 0 ? `, above the G20 average of <strong>${g20GrAvg.toFixed(1)}%</strong>` :
                     `, below the G20 average of <strong>${g20GrAvg.toFixed(1)}%</strong>`;
      let lead = `<strong>${name}</strong>'s <strong>$${(gdp.value/1e12).toFixed(2)}T</strong> economy`;
      if (gdpRank) lead += ` — the G20's <strong>${ordinal(gdpRank.rank)}-largest</strong> —`;
      lead += gv < 0
        ? ` contracted <strong>${Math.abs(gv).toFixed(1)}%</strong> in <strong>${periodLabel(gr)}</strong>${grRel}.`
        : ` expanded <strong>${gv.toFixed(1)}%</strong> in <strong>${periodLabel(gr)}</strong>${grRel}.`;
      // Transparency note when driving data is quarterly (flash estimate)
      if (gr.isQuarterly) {
        const annual = window.G20Data.getLatest ? null : null; // annual fallback shown separately
        lead += ` <span style="font-size:0.92em;opacity:0.7">(${periodLabel(gr)} preliminary estimate — year-on-year, seasonally adjusted; source: OECD QNA)</span>`;
      }
      sec0.push(lead);
    } else {
      let lead = `<strong>${name}</strong> recorded a GDP of <strong>$${(gdp.value/1e12).toFixed(2)}T</strong>`;
      if (gdpRank) lead += `, the <strong>${ordinal(gdpRank.rank)}-largest</strong> economy in the G20`;
      sec0.push(lead + '.');
    }
  }

  if (gv != null) {
    const grTrend = trendDir('GDP_GROWTH');
    const a5 = avg5('GDP_GROWTH');
    if (a5 != null && grTrend === 'falling' && gv > a5 + 0.5) {
      sec0.push(`However, the 5-year average growth rate of <strong>${a5.toFixed(1)}%</strong> signals a <strong>decelerating trajectory</strong> — the current pace may not reflect the underlying structural trend.`);
    } else if (a5 != null && grTrend === 'rising' && gv < a5 - 0.5) {
      sec0.push(`However, with a 5-year growth average of <strong>${a5.toFixed(1)}%</strong>, the underlying trajectory is <strong>accelerating</strong>, suggesting the headline figure understates the economy's structural momentum.`);
    } else if (grTrend === 'falling' && gv < 0) {
      sec0.push(`Moreover, the multi-year contraction trend underscores that current weakness is <strong>structural rather than cyclical</strong>, requiring deeper reform beyond near-term stabilisation measures.`);
    }
  }

  const capToUse = capPPP || cap;
  if (capToUse?.value) {
    const bracket    = capToUse.value > 40000 ? 'high-income' : capToUse.value > 12000 ? 'upper-middle-income' : 'middle-income';
    const g20capMed  = g20Median('GDP_CAPITA');
    let s = `At <strong>$${Math.round(capToUse.value/1000)}K</strong> per capita${capPPP ? ' in PPP terms' : ''}`;
    if (g20capMed != null) {
      s += `, ${capToUse.value > g20capMed * 1.1 ? 'well above' : capToUse.value < g20capMed * 0.9 ? 'below' : 'near'} the G20 median of <strong>$${Math.round(g20capMed/1000)}K</strong>`;
    }
    s += `, ${name} sits firmly in the <strong>${bracket}</strong> bracket`;
    s += capToUse.value > 40000 ? ', reflecting a mature, productivity-intensive economy.' :
         capToUse.value > 12000 ? ', with significant scope for further convergence toward advanced-economy income levels.' :
                                   ', with substantial catch-up potential relative to higher-income G20 peers.';
    sec0.push(s);
  }

  if (capfrm?.value) {
    const avgCapfrm = g20Avg('CAPITAL_FORM');
    const ctrend    = trendDir('CAPITAL_FORM');
    let s = `Fixed capital formation at <strong>${capfrm.value.toFixed(1)}% of GDP</strong>`;
    if (avgCapfrm != null) {
      const diff = capfrm.value - avgCapfrm;
      s += ` compares ${Math.abs(diff) < 1 ? 'broadly in line with' : diff > 0 ? 'favourably with' : 'unfavourably with'} the G20 average of <strong>${avgCapfrm.toFixed(1)}%</strong>`;
    }
    s += ctrend === 'rising' ? ', suggesting an <strong>expanding investment cycle</strong>.' :
         ctrend === 'falling' ? ', with a declining trend that warrants monitoring for longer-term growth implications.' : '.';
    sec0.push(s);
  }

  if (mfg?.value) {
    const mfgTrend = trendDir('MANUFACTURING');
    let s = `Manufacturing contributes <strong>${mfg.value.toFixed(1)}% of GDP</strong>`;
    s += mfg.value > 20 ? ', reflecting a heavily <strong>industrial growth model</strong>' :
         mfg.value > 12 ? ', consistent with a balanced <strong>mixed economy</strong>' :
                           ', indicative of a predominantly <strong>services-led</strong> growth structure';
    s += mfgTrend === 'falling' ? '; the declining share points to ongoing structural deindustrialisation.' :
         mfgTrend === 'rising'  ? '; the rising share reflects deliberate industrial policy to deepen manufacturing capacity.' : '.';
    sec0.push(s);
  }

  // ── Section 1 — Labour Market & Prices ──────────────────────────────────────
  const sec1 = [];

  if (inf?.value != null) {
    const infMed  = g20Median('INFLATION');
    const infDiff = infMed != null ? inf.value - infMed : null;
    const relToMed = infDiff == null ? '' :
      Math.abs(infDiff) < 0.5 ? ', broadly in line with the G20 median' :
      infDiff > 0 ? `, above the G20 median of <strong>${infMed.toFixed(1)}%</strong>` :
                    `, below the G20 median of <strong>${infMed.toFixed(1)}%</strong>`;
    const infClassify = inf.value > 15 ? '<strong>severe</strong> — well beyond price stability parameters' :
                        inf.value > 8  ? '<strong>elevated</strong>, complicating monetary policy normalisation' :
                        inf.value > 4  ? '<strong>above-target</strong>, warranting sustained policy vigilance' :
                        inf.value >= 2 ? '<strong>broadly on-target</strong>, consistent with price stability' :
                                          '<strong>below target</strong>, raising disinflationary risk';
    sec1.push(`Consumer price inflation of <strong>${inf.value.toFixed(1)}%</strong> in <strong>${periodLabel(inf)}</strong>${relToMed} — a price environment that is ${infClassify}.`);

    const pk       = peakOf('INFLATION', 8);
    const infTrend = trendDir('INFLATION');
    if (pk && pk.year !== inf.year && pk.value > inf.value + 3) {
      sec1.push(`However, inflation has retreated from a peak of <strong>${pk.value.toFixed(1)}%</strong> in <strong>${pk.year}</strong>, and the disinflation trajectory is clearly established — though services-sector price stickiness warrants continued monitoring before declaring victory.`);
    } else if (infTrend === 'rising' && inf.value > 3) {
      const oldS   = S('INFLATION', 4);
      const baseVal = oldS.length >= 2 ? oldS[0] : null;
      sec1.push(`However, the upward inflation trend${baseVal ? ` from <strong>${baseVal.value.toFixed(1)}%</strong> in <strong>${baseVal.year}</strong>` : ''} signals that price pressures are <strong>building</strong>, which may constrain the scope for monetary policy easing and compress real household incomes.`);
    } else if (inf.value < 1 && infTrend !== 'rising') {
      sec1.push(`However, near-zero inflation raises the risk of a <strong>deflationary dynamic</strong> — a persistent decline in price expectations that depresses investment and consumption and is difficult to reverse once entrenched.`);
    }
  }

  if (une?.value != null) {
    const uneAvg   = g20Avg('UNEMPLOYMENT');
    const uneTrend = trendDir('UNEMPLOYMENT');
    const uneRel   = uneAvg != null
      ? (Math.abs(une.value - uneAvg) < 0.5 ? 'comparable with the G20 average'
        : une.value < uneAvg ? `below the G20 average of <strong>${uneAvg.toFixed(1)}%</strong>`
                              : `above the G20 average of <strong>${uneAvg.toFixed(1)}%</strong>`)
      : null;
    const uneClassify = une.value > 10 ? 'signals <strong>structural labour market challenges</strong> that aggregate demand stimulus alone cannot resolve' :
                        une.value < 4  ? 'indicates a <strong>tight labour market</strong> by historical standards, supporting wage growth but risking inflationary wage-price dynamics' :
                                          'sits within the <strong>normal cyclical range</strong>, suggesting a broadly balanced labour market';
    let uneS = `The labour market`;
    if (uneRel) {
      uneS += `${uneTrend === 'falling' ? ', with unemployment improving to' : uneTrend === 'rising' ? ', with unemployment deteriorating to' : ' records'} <strong>${une.value.toFixed(1)}%</strong> — ${uneRel} —`;
    } else {
      uneS += ` records unemployment of <strong>${une.value.toFixed(1)}%</strong> —`;
    }
    uneS += ` ${uneClassify}.`;
    sec1.push(uneS);
  }

  if (youth?.value != null && une?.value != null) {
    const ratio = youth.value / une.value;
    if (ratio > 2) {
      sec1.push(`Moreover, youth unemployment at <strong>${youth.value.toFixed(1)}%</strong> — <strong>${ratio.toFixed(1)} times</strong> the headline rate — exposes structural barriers to entry-level employment that the aggregate figure masks, pointing to mismatches between educational outputs and labour market demand.`);
    } else {
      sec1.push(`Youth unemployment at <strong>${youth.value.toFixed(1)}%</strong> tracks broadly in line with the headline rate, suggesting that labour market conditions are relatively equitable across age cohorts.`);
    }
  }

  if (flf?.value != null) {
    const flfRank = g20Rank('FEMALE_LFP');
    const flfAvg  = g20Avg('FEMALE_LFP');
    let s = `Female labour force participation at <strong>${flf.value.toFixed(1)}%</strong>`;
    if (flfRank?.rank <= 5)  s += ` — among the highest in the G20 —`;
    else if (flfRank?.rank > 15) s += ` — among the lowest in the G20 —`;
    if (flfAvg != null) s += ` compares with a G20 average of <strong>${flfAvg.toFixed(1)}%</strong>`;
    s += flf.value >= (flfAvg || 60)
      ? ', reflecting an inclusive labour market that draws on the full productive capacity of the working-age population.'
      : ', representing a significant <strong>untapped productivity reservoir</strong> — closing this gap would meaningfully expand the economy\'s supply-side potential.';
    sec1.push(s);
  }

  // ── Section 2 — Fiscal Position ─────────────────────────────────────────────
  const sec2 = [];

  if (debt?.value != null) {
    const debtAvg   = g20Avg('DEBT_GDP');
    const debtRank  = g20Rank('DEBT_GDP');
    const debtTrend = trendDir('DEBT_GDP');
    const debtOldS  = S('DEBT_GDP', 5);
    const debtOld   = debtOldS.length >= 2 ? debtOldS[0] : null;

    let debtLead = `Government debt stood at <strong>${debt.value.toFixed(0)}% of GDP</strong> in <strong>${periodLabel(debt)}</strong>`;
    if (debtAvg != null) debtLead += ` — against a G20 average of <strong>${debtAvg.toFixed(0)}%</strong> —`;
    if (debtRank)         debtLead += ` ranking <strong>${ordinal(debtRank.rank)}-highest</strong> in the G20`;
    sec2.push(debtLead + '.');

    if (debtOld && debtTrend !== 'stable') {
      const dir = debtTrend === 'rising' ? 'risen' : 'fallen';
      const imp = debtTrend === 'rising'
        ? 'raising questions about medium-term debt sustainability and debt-service costs in a higher-for-longer rate environment'
        : 'indicating that a fiscal consolidation path is underway, gradually restoring debt-service flexibility';
      sec2.push(`However, debt has <strong>${dir}</strong> from <strong>${debtOld.value.toFixed(0)}%</strong> in <strong>${debtOld.year}</strong>, ${imp}.`);
    }

    sec2.push(
      debt.value > 120 ? `At this level, debt <strong>significantly constrains fiscal space</strong> — high debt-service costs limit the government's capacity for counter-cyclical investment and leave little buffer for unforeseen shocks.` :
      debt.value > 80  ? `Elevated debt in the 80–120% range <strong>requires sustained fiscal discipline</strong> to prevent crowding-out of private investment and avoid a structural deterioration in sovereign creditworthiness.` :
                          `With debt below 80% of GDP, the sovereign retains <strong>adequate fiscal headroom</strong> to respond to cyclical downturns or invest in structural priorities without placing debt sustainability at risk.`
    );
  }

  if (fbal?.value != null) {
    const fbalClassify = fbal.value > -3 ? '<strong>within prudent bounds</strong>, consistent with a stable medium-term fiscal trajectory' :
                         fbal.value > -6 ? '<strong>manageable</strong>, though the deficit trajectory warrants monitoring to prevent sustained debt accumulation' :
                                            '<strong>concerning</strong> — at this level, the deficit risks becoming self-reinforcing as debt-service costs rise';
    sec2.push(`The fiscal balance of <strong>${A.fmtSignedPct(fbal.value).replace('%', '% of GDP')}</strong> is ${fbalClassify}.`);
  }

  if ((debt?.value != null && debt.value > 80) || (fbal?.value != null && fbal.value < -4)) {
    const action = debt?.value > 80 && fbal?.value < -4
      ? 'narrows the fiscal deficit and arrests the debt trajectory'
      : debt?.value > 80 ? 'stabilises the debt trajectory through a credible medium-term fiscal framework'
                         : 'narrows the deficit toward the -3% prudential threshold';
    const consequence = debt?.value > 120
      ? 'rising interest costs will increasingly crowd out the discretionary spending needed for infrastructure, health, and education investment'
      : 'fiscal flexibility will erode at precisely the moment counter-cyclical capacity is most needed';
    sec2.push(`Unless ${name} ${action}, ${consequence}.`);
  }

  if (tax?.value != null || health?.value != null || educ?.value != null) {
    const parts = [];
    if (tax?.value != null) {
      const taxAvg = g20Avg('TAX_REVENUE');
      let t = `Revenue mobilisation at <strong>${tax.value.toFixed(1)}% of GDP</strong>`;
      if (taxAvg != null) t += ` (G20 avg: <strong>${taxAvg.toFixed(1)}%</strong>)`;
      t += tax.value > 25 ? ' reflects a deep tax base supporting substantial public investment' : ' suggests scope to broaden the tax base and reduce reliance on deficit financing';
      parts.push(t);
    }
    if (health?.value != null && educ?.value != null) {
      const combined = health.value + educ.value;
      parts.push(`health and education spending combined at <strong>${combined.toFixed(1)}% of GDP</strong> characterises the social investment stance as ${combined > 12 ? '<strong>substantial</strong>' : combined > 8 ? '<strong>moderate</strong>' : '<strong>restrained</strong>'}`);
    } else if (health?.value != null) {
      const hAvg = g20Avg('HEALTH_EXP');
      parts.push(`health expenditure at <strong>${health.value.toFixed(1)}% of GDP</strong>${hAvg != null ? ` (G20 avg: <strong>${hAvg.toFixed(1)}%</strong>)` : ''}`);
    }
    if (parts.length) sec2.push(parts.join('; ') + '.');
  }

  // ── Section 3 — External Sector & Investment ─────────────────────────────────
  const sec3 = [];

  if (trade?.value != null) {
    const tradeAvg  = g20Avg('TRADE_GDP');
    const openClass = trade.value > 80 ? 'among the <strong>most open</strong> economies in the G20' :
                      trade.value > 40 ? 'an <strong>open economy</strong> with significant global trade integration' :
                                          'a <strong>predominantly domestically-oriented</strong> economy';
    let s = `Trade accounts for <strong>${trade.value.toFixed(1)}% of GDP</strong>`;
    if (tradeAvg != null) s += ` (G20 average: <strong>${tradeAvg.toFixed(1)}%</strong>)`;
    s += `, placing ${name} among ${openClass}.`;
    sec3.push(s);
  }

  if (exports_gdp?.value != null && trade?.value != null) {
    const exportShare = (exports_gdp.value / trade.value * 100).toFixed(0);
    sec3.push(`Exports represent <strong>${exports_gdp.value.toFixed(1)}% of GDP</strong>, accounting for roughly <strong>${exportShare}%</strong> of total trade flows — ${exports_gdp.value > 30 ? 'a high export dependency that amplifies exposure to external demand conditions and trading-partner policy changes' : 'a balanced trade structure that limits vulnerability to any single external market'}.`);
  }

  if (ca?.value != null) {
    const caTrend   = trendDir('CURRENT_ACC');
    const caClassify = ca.value < -5 ? 'signals <strong>significant external imbalances</strong> that must be financed by sustained capital inflows' :
                       ca.value < -2 ? 'reflects a <strong>manageable external deficit</strong> within normal financing parameters' :
                       ca.value > 5  ? 'characterises a <strong>net-saving economy</strong> with structural export surpluses and competitive external capacity' :
                       ca.value > 0  ? 'indicates a <strong>balanced-to-positive external position</strong>' :
                                        'reflects near-balance in the external account';
    let s = `However, the current account balance of <strong>${A.fmtSignedPct(ca.value).replace('%', '% of GDP')}</strong> ${caClassify}`;
    if (caTrend && caTrend !== 'stable') {
      s += `, and the ${caTrend === 'rising' ? 'improving' : 'deteriorating'} trend over the past four years ${caTrend === 'rising' ? 'points to a strengthening external position' : 'warrants close monitoring'}`;
    }
    sec3.push(s + '.');
  }

  if (fdi?.value != null) {
    const fdiAvg = g20Avg('FDI_INFLOWS');
    let s = `FDI inflows at <strong>${fdi.value.toFixed(1)}% of GDP</strong>`;
    if (fdiAvg != null) s += ` (G20 avg: <strong>${fdiAvg.toFixed(1)}%</strong>)`;
    s += fdi.value > 3 ? ' demonstrate strong <strong>investment attractiveness</strong>, reflecting confidence in the regulatory environment and growth prospects.' :
         fdi.value > 1 ? ' reflect moderate foreign investor engagement, with scope to improve through regulatory reform and infrastructure investment.' :
                          ' remain subdued, potentially reflecting constraints in the business environment or elevated perceived country risk.';
    sec3.push(s);
  }

  if (ca?.value != null && ca.value < -4) {
    sec3.push(`Moreover, the sustained current account deficit creates a structural dependency on capital inflows that exposes ${name} to the risk of <strong>sudden stop events</strong> — periods of rapid capital outflow that can trigger sharp currency depreciation and financial instability.`);
  } else if (trade?.value != null && trade.value > 80) {
    sec3.push(`Moreover, high trade openness amplifies ${name}'s exposure to external demand shocks, tariff escalation, and global supply chain disruption — risks that have become increasingly material in the current environment of geopolitical economic fragmentation.`);
  }

  // ── Section 4 — Outlook & Key Risks ─────────────────────────────────────────
  const sec4 = [];

  if (gv != null) {
    const grTrend   = trendDir('GDP_GROWTH');
    const a5        = avg5('GDP_GROWTH');
    const outlookQ  = gv >= 3 ? 'positive' : gv >= 1 ? 'mixed' : gv >= 0 ? 'fragile' : 'challenging';
    let outlookS = `The near-term outlook is <strong>${outlookQ}</strong>: `;
    outlookS += gv < 0 ? `the economy is <strong>contracting</strong>` : `growth of <strong>${gv.toFixed(1)}%</strong> `;
    if (g20GrAvg != null && gv >= 0) {
      const diff = gv - g20GrAvg;
      outlookS += Math.abs(diff) < 0.4 ? 'is tracking broadly in line with G20 peers'
               : diff > 0 ? `outpaces the G20 average of <strong>${g20GrAvg.toFixed(1)}%</strong>`
                           : `trails the G20 average of <strong>${g20GrAvg.toFixed(1)}%</strong>`;
    }
    if (grTrend && a5 != null) {
      outlookS += `, with the 5-year trajectory ${grTrend === 'falling' ? '<strong>decelerating</strong>' : grTrend === 'rising' ? '<strong>accelerating</strong>' : '<strong>stable</strong>'} around a ${a5.toFixed(1)}% trend`;
    }
    sec4.push(outlookS + '.');
  }

  const risks = [];
  if (inf?.value  != null && inf.value  > 15)  risks.push({ tier: 3, label: 'hyperinflationary conditions',      detail: `inflation at <strong>${inf.value.toFixed(1)}%</strong>` });
  if (gv          != null && gv          < -2)  risks.push({ tier: 3, label: 'severe economic contraction',       detail: `GDP declining <strong>${Math.abs(gv).toFixed(1)}%</strong>` });
  if (une?.value  != null && une.value   > 20)  risks.push({ tier: 3, label: 'structural unemployment crisis',    detail: `<strong>${une.value.toFixed(1)}%</strong> unemployed` });
  if (inf?.value  != null && inf.value   > 5 && inf.value <= 15) risks.push({ tier: 2, label: 'elevated inflation',          detail: `<strong>${inf.value.toFixed(1)}%</strong> — above price stability threshold` });
  if (debt?.value != null && debt.value  > 100) risks.push({ tier: 2, label: 'high sovereign debt',              detail: `<strong>${debt.value.toFixed(0)}% of GDP</strong>` });
  if (fbal?.value != null && fbal.value  < -5)  risks.push({ tier: 2, label: 'a wide fiscal deficit',             detail: `<strong>${fbal.value.toFixed(1)}% of GDP</strong>` });
  if (ca?.value   != null && ca.value    < -4)  risks.push({ tier: 2, label: 'a persistent current account deficit', detail: `<strong>${ca.value.toFixed(1)}% of GDP</strong>` });
  if (une?.value  != null && une.value   > 8 && une.value <= 20) risks.push({ tier: 1, label: 'above-average unemployment', detail: `<strong>${une.value.toFixed(1)}%</strong>` });
  if (gv          != null && gv          < 0 && gv >= -2)        risks.push({ tier: 1, label: 'economic contraction',        detail: `GDP down <strong>${Math.abs(gv).toFixed(1)}%</strong>` });
  risks.sort((a, b) => b.tier - a.tier);
  const topRisks = risks.slice(0, 3);

  if (topRisks.length >= 2) {
    let riskS = `The most significant near-term risks are ${topRisks[0].label} (${topRisks[0].detail}) and ${topRisks[1].label} (${topRisks[1].detail}).`;
    if (topRisks[2]) riskS += ` ${topRisks[2].label.charAt(0).toUpperCase() + topRisks[2].label.slice(1)} (${topRisks[2].detail}) adds a further layer of structural concern.`;
    sec4.push(riskS);
  } else if (topRisks.length === 1) {
    sec4.push(`The primary near-term risk is ${topRisks[0].label} — ${topRisks[0].detail} — which, if unaddressed, could weigh on investment confidence and medium-term growth prospects.`);
  }

  if (rd?.value != null) {
    const rdAvg = g20Avg('RD_EXP');
    const rdPos = rd.value > 3   ? `at the <strong>innovation frontier</strong>, competing directly with the world's most advanced knowledge economies` :
                  rd.value > 2   ? `with <strong>solid knowledge-economy foundations</strong>` :
                  rd.value > 1   ? `<strong>building knowledge-economy capacity</strong>, with room to intensify investment` :
                                    `with a <strong>resource-intensive growth model</strong> that would benefit from deeper knowledge-economy investment`;
    let rdS = `R&amp;D investment at <strong>${rd.value.toFixed(2)}% of GDP</strong>`;
    if (rdAvg != null) rdS += ` (G20 avg: <strong>${rdAvg.toFixed(2)}%</strong>)`;
    rdS += ` positions ${name} ${rdPos}`;
    if (researchers?.value != null) rdS += `, supported by <strong>${Math.round(researchers.value).toLocaleString()}</strong> researchers per million population`;
    rdS += '.';
    if (rd.value < 1.5 && gv != null && gv > 3) {
      rdS += ` However, sustaining rapid growth without commensurate knowledge-sector investment risks creating a structural productivity ceiling that limits the economy's long-term potential.`;
    }
    sec4.push(rdS);
  }

  if (gini?.value != null) {
    const giniAvg = g20Avg('GINI');
    const giniPos = gini.value > 45 ? '<strong>severe income inequality</strong> — a structural challenge that constrains domestic consumption breadth, limits intergenerational mobility, and can undermine long-term social cohesion' :
                    gini.value > 35 ? '<strong>moderate inequality</strong> that warrants sustained policy attention to ensure the benefits of growth are broadly shared' :
                                       'a <strong>relatively equitable income distribution</strong> that supports durable consumption-led growth';
    let giniS = `Income inequality — a Gini coefficient of <strong>${gini.value.toFixed(1)}</strong>`;
    if (giniAvg != null) giniS += ` against a G20 average of <strong>${giniAvg.toFixed(1)}</strong>`;
    giniS += ` — reflects ${giniPos}.`;
    if (gini.value > 40) giniS += ` Unless ${name} actively addresses distributional imbalances through progressive fiscal policy and targeted social investment, high inequality will continue to limit the breadth and durability of economic expansion.`;
    sec4.push(giniS);
  }

  if (life?.value != null) {
    const lifeRank = g20Rank('LIFE_EXPECT');
    let s = `Life expectancy of <strong>${life.value.toFixed(1)} years</strong>`;
    if (lifeRank?.rank <= 5)  s += ' — among the highest in the G20 —';
    else if (lifeRank?.rank > 15) s += ' — among the lowest in the G20 —';
    s += ' reflects the cumulative outcomes of healthcare access, nutrition, and living standards — a key indicator of the quality of growth alongside its quantity.';
    sec4.push(s);
  }

  const noData = 'Comprehensive indicator data for this reporting period is limited.';
  return {
    headline,
    sections: [
      sec0.join(' ') || noData,
      sec1.join(' ') || noData,
      sec2.join(' ') || noData,
      sec3.join(' ') || noData,
      sec4.join(' ') || noData,
    ],
  };
}

// ── Load saved notes on mount ─────────────────────────────────────────────────
function loadSavedNotes(iso3) {
  const headline = document.getElementById('brief-headline');
  if (!headline) return;

  // 1. User-saved edits always win
  try {
    const savedJson = localStorage.getItem(`country:${iso3}:brief`);
    if (savedJson) {
      const saved = JSON.parse(savedJson);
      if (saved.headline) headline.textContent = saved.headline;
      (saved.sections || []).forEach((text, i) => {
        const p = document.getElementById(`brief-body-${i}`);
        if (p) p.textContent = text;
      });
      return;
    }
  } catch(e) {}

  // 2. Live data-driven prose (PRIMARY — always fires when data is available)
  const brief = generateBriefContent(iso3);
  if (brief && brief.sections.some(s => s && s !== '—')) {
    headline.innerHTML = brief.headline;
    brief.sections.forEach((html, i) => {
      const p = document.getElementById(`brief-body-${i}`);
      if (p) p.innerHTML = html;
    });
    return;
  }

  // 3. Static pre-written fallback (only when live data is unavailable)
  const cc = window.G20_COMMENTARY?.countries?.[iso3];
  if (cc?.sections?.length) {
    headline.textContent = cc.headline || '—';
    cc.sections.forEach((s, i) => {
      const p = document.getElementById(`brief-body-${i}`);
      if (p) p.textContent = s.body;
    });
  } else if (cc?.paragraphs?.length) {
    headline.textContent = cc.headline || '—';
    cc.paragraphs.forEach((text, i) => {
      const p = document.getElementById(`brief-body-${i}`);
      if (p) p.textContent = text;
    });
  }
}

// ── Brief panel save ─────────────────────────────────────────────────────────
window.saveBrief = function(iso3) {
  const headline = document.getElementById('brief-headline');
  const sections = [];
  for (let i = 0; i < 5; i++) {
    const p = document.getElementById(`brief-body-${i}`);
    if (p) sections.push(p.textContent);
  }
  try {
    localStorage.setItem(`country:${iso3}:brief`, JSON.stringify({
      headline: headline?.textContent || '',
      sections,
      savedAt: new Date().toISOString(),
    }));
    const btn = document.querySelector('.country-brief__actions .analyst-btn');
    if (btn) { btn.textContent = 'Saved ✓'; setTimeout(() => { btn.textContent = 'Save edits'; }, 2000); }
  } catch(e) {}
};

// ── Chart.js trend charts ─────────────────────────────────────────────────────
window.mountCountryProfileCharts = function(iso3) {
  function tryMount() {
    if (!window.Chart) { setTimeout(tryMount, 200); return; }

    loadSavedNotes(iso3);

    const MONO = { family: "'Geist Mono', monospace" };
    const TICK_OPTS = { font: { ...MONO, size: 10 }, color: '#8A8A8A' };
    const TOOLTIP_BASE = {
      backgroundColor: 'rgba(10,10,10,0.88)',
      titleColor: '#8A8A8A',
      bodyColor: '#F5F5F2',
      titleFont: { ...MONO, size: 10 },
      bodyFont:  { ...MONO, size: 11 },
      padding: 8,
      cornerRadius: 4,
    };

    const OPTS = {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: { ...TOOLTIP_BASE },
        datalabels: { display: false },
      },
      scales: {
        x: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { ...TICK_OPTS, maxTicksLimit: 6 } },
        y: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { ...TICK_OPTS, maxTicksLimit: 5 } },
      },
      elements: { point: { radius: 2, hoverRadius: 4 }, line: { tension: 0.3, borderWidth: 1.5 } },
    };

    function lineChart(canvasId, key, color, fmtFn) {
      const canvas = document.getElementById(canvasId);
      if (!canvas) return;
      const series = window.G20Data.getSeries(iso3, key, 2015);
      if (!series.length) { canvas.parentNode.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-4);font-family:var(--font-mono);font-size:11px">No data</div>'; return; }
      new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
          labels: series.map(d => d.year),
          datasets: [{
            data: series.map(d => d.value),
            borderColor: color,
            backgroundColor: color.replace('1)', '0.06)'),
            fill: true,
          }],
        },
        options: {
          ...OPTS,
          plugins: {
            ...OPTS.plugins,
            tooltip: {
              ...TOOLTIP_BASE,
              callbacks: {
                title: ctx => `${ctx[0]?.label}`,
                label: ctx => `  ${fmtFn ? fmtFn(ctx.parsed.y) : ctx.parsed.y.toFixed(2)}`,
              },
            },
          },
          scales: {
            ...OPTS.scales,
            y: { ...OPTS.scales.y, ticks: { ...OPTS.scales.y.ticks, callback: fmtFn } },
          },
        },
      });
    }

    lineChart('profile-gdp-chart',        'GDP',          'rgba(10,10,10,0.8)',  v => '$' + (v/1e12).toFixed(2) + 'T');
    lineChart('profile-unemp-chart',      'UNEMPLOYMENT', 'rgba(161,98,7,1)',    v => v.toFixed(1) + '%');
    lineChart('profile-inflation-chart',  'INFLATION',    'rgba(185,28,28,1)',   v => v.toFixed(1) + '%');
    lineChart('profile-debt-chart',       'DEBT_GDP',     'rgba(91,33,182,1)',   v => v.toFixed(0) + '%');
    lineChart('profile-ca-chart',         'CURRENT_ACC',  'rgba(30,64,175,1)',   v => A.fmtSignedPct(v));
    lineChart('profile-growth-chart',     'GDP_GROWTH',   'rgba(4,120,87,1)',    v => A.fmtSignedPct(v));
  }
  tryMount();
};

// ── Utility ───────────────────────────────────────────────────────────────────
function median(arr) {
  if (!arr || !arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
