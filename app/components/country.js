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
                  <div class="co-stat-value ${growthClass}">${gv !== undefined ? (gv >= 0 ? '+' : '') + gv.toFixed(1) + '%' : '—'}</div>
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
    gv !== undefined ? `Growth: ${gv >= 0?'+':''}${gv.toFixed(1)}%` : null,
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
        ${gv !== undefined ? `<div><div class="profile-hero__stat-lbl">Growth</div><div class="profile-hero__stat-val" style="color:${growthCls}">${gv >= 0?'+':''}${gv.toFixed(1)}%</div></div>` : ''}
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
    ${renderMiniKPI('Current Acct', ca?.value !== undefined ? (ca.value >= 0 ? '+' : '') + ca.value.toFixed(1) + '% GDP' : '—', ca?.year, ca?.value < -2 ? 'v-warn' : '', 'WB')}
    ${renderMiniKPI('Fiscal Balance', fiscal?.value !== undefined ? (fiscal.value >= 0 ? '+' : '') + fiscal.value.toFixed(1) + '% GDP' : '—', fiscal?.year, fiscal?.value < -6 ? 'v-warn' : '', 'IMF')}
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
    gr     ? { label: 'GDP Growth',   val: (gr.value >= 0 ? '+' : '') + gr.value.toFixed(1) + '%', yr: gr.year,
               cls: gr.value < 0 ? 'color:#C0392B' : gr.value >= 4 ? 'color:#27AE60' : '' } : null,
    inf    ? { label: 'Inflation',    val: inf.value.toFixed(1) + '%',    yr: inf.year,
               cls: inf.value > 8 ? 'color:#C0392B' : inf.value > 4 ? 'color:#E8A236' : '' } : null,
    une    ? { label: 'Unemployment', val: une.value.toFixed(1) + '%',    yr: une.year }    : null,
    debt   ? { label: 'Debt / GDP',   val: debt.value.toFixed(0) + '%',   yr: debt.year,
               cls: debt.value > 100 ? 'color:#E8A236' : '' } : null,
    fiscal ? { label: 'Fiscal Bal.',  val: (fiscal.value >= 0 ? '+' : '') + fiscal.value.toFixed(1) + '%', yr: fiscal.year,
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
      <span class="country-brief__source">World Bank · IMF DataMapper · OECD</span>
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

// ── Load saved notes on mount ─────────────────────────────────────────────────
function loadSavedNotes(iso3) {
  const headline = document.getElementById('brief-headline');
  if (!headline) return;

  // 1. Check for user-saved edits in localStorage
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

  // 2. Pre-generated commentary from commentary.js
  const cc = window.G20_COMMENTARY?.countries?.[iso3];
  if (cc?.sections && cc.sections.length) {
    headline.textContent = cc.headline || '—';
    cc.sections.forEach((s, i) => {
      const p = document.getElementById(`brief-body-${i}`);
      if (p) p.textContent = s.body;
    });
  } else if (cc?.paragraphs && cc.paragraphs.length) {
    headline.textContent = cc.headline || '—';
    cc.paragraphs.forEach((text, i) => {
      const p = document.getElementById(`brief-body-${i}`);
      if (p) p.textContent = text;
    });
  } else {
    headline.textContent = '—';
    for (let i = 0; i < 5; i++) {
      const p = document.getElementById(`brief-body-${i}`);
      if (p) p.textContent = 'Analysis will be available after the next data refresh.';
    }
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

    const OPTS = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ' ' + ctx.parsed.y.toLocaleString() } },
      },
      scales: {
        x: {
          grid: { color: 'rgba(0,0,0,0.04)' },
          ticks: { font: { size: 10, family: "'Geist Mono', monospace" }, color: '#8A8A8A', maxTicksLimit: 6 },
        },
        y: {
          grid: { color: 'rgba(0,0,0,0.04)' },
          ticks: { font: { size: 10, family: "'Geist Mono', monospace" }, color: '#8A8A8A', maxTicksLimit: 5 },
        },
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
          plugins: { ...OPTS.plugins, tooltip: { callbacks: { label: ctx => ' ' + (fmtFn ? fmtFn(ctx.parsed.y) : ctx.parsed.y.toFixed(2)) } } },
        },
      });
    }

    lineChart('profile-gdp-chart',        'GDP',          'rgba(10,10,10,0.8)',  v => '$' + (v/1e12).toFixed(2) + 'T');
    lineChart('profile-unemp-chart',      'UNEMPLOYMENT', 'rgba(161,98,7,1)',    v => v.toFixed(1) + '%');
    lineChart('profile-inflation-chart',  'INFLATION',    'rgba(185,28,28,1)',   v => v.toFixed(1) + '%');
    lineChart('profile-debt-chart',       'DEBT_GDP',     'rgba(91,33,182,1)',   v => v.toFixed(0) + '%');
    lineChart('profile-ca-chart',         'CURRENT_ACC',  'rgba(30,64,175,1)',   v => (v >= 0 ? '+' : '') + v.toFixed(1) + '%');
    lineChart('profile-growth-chart',     'GDP_GROWTH',   'rgba(4,120,87,1)',    v => (v >= 0 ? '+' : '') + v.toFixed(1) + '%');
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
