// Risk flags view — summary, country × risk heat-matrix, detailed flag list.
//
// Flag thresholds come from FLAGS_CONFIG (config.js). This view adds only
// presentation metadata (column order, units, a non-flag "watch" band and a
// one-line rationale). Every macro comparison uses the annual series
// (getLatest(..., { annualOnly: true })) so economies are compared on the
// same basis; the year of every value is shown. Two daily market columns
// (currency slide, policy-rate shock) come from data/realtime.json and show
// their as-of date. Wider scopes group the matrix by World Bank region.

const FLAG_DIMENSIONS = [
  { id: 'negativeGrowth',    short: 'Real GDP growth',  unit: '%',     signed: true,  watch: 1,
    why: 'Real output is shrinking: recession risk, falling revenues and rising unemployment typically follow.' },
  { id: 'highInflation',     short: 'CPI inflation',    unit: '%',     signed: false, watch: 5,
    why: 'Erodes real incomes and savings and usually forces tighter monetary policy.' },
  { id: 'highUnemploy',      short: 'Unemployment',     unit: '%',     signed: false, watch: 7,
    why: 'Signals sustained labour-market slack, weighing on demand and public finances.' },
  { id: 'highYouthUnemp',    short: 'Youth unemp. 15-24', unit: '%',   signed: false, watch: 18,
    why: 'Long spells out of work at entry scar lifetime earnings and productivity.' },
  { id: 'highDebt',          short: 'Govt gross debt',  unit: '% GDP',    signed: false, watch: 90,
    why: 'Raises refinancing and interest-cost risk and narrows room to respond to shocks.' },
  { id: 'fiscalDeficit',     short: 'Fiscal balance',   unit: '% GDP',    signed: true,  watch: -4,
    why: 'A deficit this wide adds to debt quickly unless nominal growth outpaces interest rates.' },
  { id: 'currentAccDeficit', short: 'Current account',  unit: '% GDP', signed: true,  watch: -3,
    why: 'Large external financing need leaves the economy exposed to capital-flow reversals.' },
  { id: 'fxSlide',           short: 'FX vs USD, 30d',   unit: '%',     signed: true,  watch: 3, daily: true,
    why: 'A fast slide against the dollar raises imported inflation and the cost of dollar debt.' },
  { id: 'policyShock',       short: 'Policy move',      unit: 'bp',    signed: false, watch: 50, daily: true,
    why: 'A large recent rate hike tightens financing conditions quickly and signals stress the central bank is fighting.' },
];

const FLAG_SEV = {
  high:   { label: 'High',   weight: 3, order: 0 },
  medium: { label: 'Medium', weight: 2, order: 1 },
  low:    { label: 'Low',    weight: 1, order: 2 },
};

function flagFmt(v, dim) {
  const s = dim.unit === 'bp' ? v.toFixed(0) : v.toFixed(1);
  return dim.signed && v > 0 ? `+${s}` : s.replace('-', '−');
}
function flagThreshText(cfg, dim, t = cfg.threshold) {
  // 'above' flags at >= threshold; 'below' flags strictly under it.
  const op = cfg.dir === 'above' ? '≥' : '<';
  const n = String(t).replace('-', '−');
  return `${op} ${n}${dim.unit === '%' ? '%' : dim.unit === 'bp' ? 'bp' : '% of GDP'}`;
}
function flagUnitShort(dim) { return dim.unit === '%' ? '%' : dim.unit === 'bp' ? 'bp' : '% GDP'; }
function flagDay(iso) {
  const d = iso ? new Date(`${iso}T00:00:00Z`) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : '';
}

function renderFlags() {
  const dims = FLAG_DIMENSIONS
    .map(d => {
      const cfg = FLAGS_CONFIG[d.id];
      const src = cfg && window.INDICATORS?.[cfg.key]?.source;
      // The refresh overwrites these World Bank series with IMF WEO where the IMF publishes them.
      const imfFirst = ['GDP_GROWTH', 'INFLATION', 'UNEMPLOYMENT', 'CURRENT_ACC'].includes(cfg?.key);
      if (cfg?.realtime) return { ...d, cfg, source: cfg.key === 'FX_30D' ? 'ECB reference rates (daily)' : 'BIS policy rates (daily)' };
      return { ...d, cfg, source: imfFirst ? 'IMF WEO / World Bank' : src === 'IMF' ? 'IMF WEO' : src === 'WB' ? 'World Bank' : (src || '—') };
    })
    .filter(d => d.cfg);

  // ── Evaluate every economy × dimension on the annual basis ───────────────
  const yearCounts = {};
  const rt = window.REALTIME || null;
  // The daily columns need data/realtime.json; re-render once it has loaded.
  if (!rt && window.loadRealtime) window.loadRealtime().then(j => { if (j && location.hash === '#flags') window.navTo('flags'); });
  const rows = G20.map(country => {
    const cells = dims.map(dim => {
      const latest = dim.cfg.realtime
        ? (window.RiskCore && rt ? window.RiskCore.realtimeSignal(rt, country.iso3, dim.cfg.key) : null)
        : window.G20Data.getLatest(country.iso3, dim.cfg.key, { annualOnly: true });
      if (!latest || latest.value == null || !isFinite(latest.value)) return { dim, missing: true };
      const v = latest.value;
      const { threshold: t, dir } = dim.cfg;
      // Strict '<' for downside thresholds so 0.0% growth is not called a contraction.
      const breached = dir === 'above' ? v >= t : v < t;
      const watch = !breached && (dir === 'above' ? v >= dim.watch : v < dim.watch);
      if (!dim.cfg.realtime) yearCounts[latest.year] = (yearCounts[latest.year] || 0) + 1;
      return {
        dim, value: v, year: dim.cfg.realtime ? flagDay(latest.date) : latest.year, daily: !!dim.cfg.realtime,
        state: breached ? dim.cfg.severity : watch ? 'watch' : 'ok',
        breached,
        gap: Math.abs(v - t),
      };
    });
    const flags = cells.filter(c => c.breached);
    const score = flags.reduce((s, c) => s + FLAG_SEV[c.dim.cfg.severity].weight, 0);
    const worst = flags.length ? flags.map(c => c.dim.cfg.severity).sort((a, b) => FLAG_SEV[a].order - FLAG_SEV[b].order)[0] : null;
    return { country, cells, flags, score, worst };
  });

  rows.sort((a, b) =>
    b.score - a.score ||
    (a.worst ? FLAG_SEV[a.worst].order : 9) - (b.worst ? FLAG_SEV[b.worst].order : 9) ||
    b.cells.filter(c => c.state === 'watch').length - a.cells.filter(c => c.state === 'watch').length ||
    a.country.name.localeCompare(b.country.name));

  const refYear = Object.entries(yearCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';
  const allFlags = rows.flatMap(r => r.flags.map(c => ({ ...c, country: r.country })));
  const bySev = sev => allFlags.filter(f => f.dim.cfg.severity === sev);
  const flaggedRows = rows.filter(r => r.flags.length);
  const clearRows = rows.filter(r => !r.flags.length);
  const topRows = flaggedRows.slice(0, 3);

  const flagImg = c => `<span class="flag-rect fx-flagimg" aria-hidden="true" style="background-image:url('https://flagcdn.com/${A.escapeAttr(c.code.toLowerCase())}.svg')"></span>`;

  // ── Summary strip ─────────────────────────────────────────────────────────
  const sevTile = sev => {
    const list = bySev(sev);
    const dimsHit = [...new Set(list.map(f => f.dim.short))];
    return `
      <div class="fx-tile fx-tile--${sev}">
        <div class="fx-tile__lbl"><span class="fx-dot fx-dot--${sev}"></span>${FLAG_SEV[sev].label} severity</div>
        <div class="fx-tile__val">${list.length}<span class="fx-tile__unit">flag${list.length === 1 ? '' : 's'}</span></div>
        <div class="fx-tile__sub">${dimsHit.length ? A.escapeText(dimsHit.join(' · ')) : 'None triggered'}</div>
      </div>`;
  };

  const summary = `
  <div class="fx-summary">
    <div class="fx-tile fx-tile--lead">
      <div class="fx-tile__lbl">Flags triggered</div>
      <div class="fx-tile__val">${allFlags.length}<span class="fx-tile__unit">across ${flaggedRows.length} of ${G20.length} economies</span></div>
      <div class="fx-tile__sub">${clearRows.length} economies clear of all ${dims.length} thresholds</div>
    </div>
    ${sevTile('high')}${sevTile('medium')}${sevTile('low')}
    <div class="fx-tile fx-tile--top">
      <div class="fx-tile__lbl">Most exposed</div>
      <ol class="fx-top">
        ${topRows.map(r => `
          <li class="fx-top__row" ${A.navRowAttrs(r.country.iso3, r.country.name)}>
            ${flagImg(r.country)}
            <span class="fx-top__name">${A.escapeText(r.country.name)}</span>
            <span class="fx-top__n">${r.flags.length} flag${r.flags.length === 1 ? '' : 's'}</span>
          </li>`).join('')}
      </ol>
    </div>
  </div>`;

  // ── Heat-matrix ───────────────────────────────────────────────────────────
  const cellHtml = c => {
    if (c.missing) return `<td class="fx-cell fx-cell--na" title="${A.escapeAttr(c.dim.short)}: no data">n/a</td>`;
    const tip = `${c.dim.short}: ${flagFmt(c.value, c.dim)}${flagUnitShort(c.dim)} (${c.year}). ` +
      `Flag ${flagThreshText(c.dim.cfg, c.dim)}` +
      (c.state === 'watch' ? `; watch ${flagThreshText(c.dim.cfg, c.dim, c.dim.watch)}` : '');
    const yr = !c.daily && String(c.year) !== String(refYear) ? `<sup class="fx-cell__yr">${c.year}</sup>` : '';
    return `<td class="fx-cell fx-cell--${c.state}" title="${A.escapeAttr(tip)}">${flagFmt(c.value, c.dim)}${yr}</td>`;
  };

  const rowHtml = (r, divider) => `
            <tr class="fx-row${r.flags.length ? '' : ' fx-row--clear'}${divider ? ' fx-row--divider' : ''}" ${A.navRowAttrs(r.country.iso3, r.country.name)}>
              <th scope="row" class="fx-matrix__country">${flagImg(r.country)}<span>${A.escapeText(r.country.name)}</span></th>
              ${r.cells.map(cellHtml).join('')}
              <td class="fx-matrix__score">${r.flags.length
                ? `<span class="fx-score fx-score--${r.worst}">${r.flags.length}</span>`
                : '<span class="fx-score fx-score--none">0</span>'}</td>
            </tr>`;
  // Wider scopes: group by World Bank region (most-flagged region first), same row styles.
  const groupByRegion = window.Scope && !Scope.isG20();
  let matrixBody;
  if (groupByRegion) {
    const regions = new Map();
    for (const r of rows) {
      const reg = r.country.wbRegion || r.country.region || 'Other';
      if (!regions.has(reg)) regions.set(reg, []);
      regions.get(reg).push(r);
    }
    matrixBody = [...regions.entries()]
      .sort((a, b) => b[1].reduce((n, r) => n + r.flags.length, 0) - a[1].reduce((n, r) => n + r.flags.length, 0) || a[0].localeCompare(b[0]))
      .map(([reg, list]) => `
            <tr class="fx-row fx-row--divider" style="cursor:default">
              <th scope="colgroup" class="fx-matrix__country" colspan="${dims.length + 2}"><span class="fx-th__name">${A.escapeText(reg)}</span><span class="fx-th__unit">${list.filter(r => r.flags.length).length} of ${list.length} economies flagged · ${list.reduce((n, r) => n + r.flags.length, 0)} flags</span></th>
            </tr>${list.map(r => rowHtml(r, false)).join('')}`).join('');
  } else {
    matrixBody = rows.map((r, i) => rowHtml(r, i === flaggedRows.length && i > 0)).join('');
  }

  const matrix = `
  <div class="panel fx-panel">
    <div class="panel__head">
      <div><span class="panel__title">Risk matrix</span><span class="panel__sub">${G20.length} economies × ${dims.length} indicators · annual, ${refYear} · FX and policy daily</span></div>
      <span class="panel__meta fx-hide-sm">${groupByRegion ? 'grouped by region · ' : ''}sorted by severity-weighted flags</span>
    </div>
    <div class="table-scroll fx-scroll${groupByRegion ? ' fx-scroll--tall' : ''}">
      <table class="fx-matrix">
        <thead>
          <tr>
            <th class="fx-matrix__country" scope="col">Economy</th>
            ${dims.map(d => `
              <th scope="col" title="${A.escapeAttr(`${d.short}, ${d.unit}. Source: ${d.source}`)}">
                <span class="fx-th__name">${A.escapeText(d.short)}</span>
                <span class="fx-th__unit">${A.escapeText(d.unit)}</span>
                <span class="fx-th__thr fx-th__thr--${d.cfg.severity}">flag ${flagThreshText(d.cfg, d).replace(' of GDP', '')}</span>
              </th>`).join('')}
            <th scope="col" class="fx-matrix__score">Flags</th>
          </tr>
        </thead>
        <tbody>
          ${matrixBody}
        </tbody>
      </table>
    </div>
    <div class="fx-legend">
      <span class="fx-legend__item"><span class="fx-swatch fx-cell--high"></span>High-severity flag</span>
      <span class="fx-legend__item"><span class="fx-swatch fx-cell--medium"></span>Medium-severity flag</span>
      <span class="fx-legend__item"><span class="fx-swatch fx-cell--low"></span>Low-severity flag</span>
      <span class="fx-legend__item"><span class="fx-swatch fx-cell--watch"></span>Watch (near threshold, not a flag)</span>
      <span class="fx-legend__item"><span class="fx-swatch fx-cell--ok"></span>Within range</span>
    </div>
    <div class="fx-thresholds">
      ${dims.map(d => `
        <div class="fx-thr">
          <span class="fx-thr__name">${A.escapeText(d.short)}</span>
          <span class="fx-thr__rule"><span class="fx-dot fx-dot--${d.cfg.severity}"></span>${FLAG_SEV[d.cfg.severity].label}: ${flagThreshText(d.cfg, d)}</span>
          <span class="fx-thr__watch">Watch: ${flagThreshText(d.cfg, d, d.watch)}</span>
          <span class="fx-thr__src">${A.escapeText(d.source)}</span>
        </div>`).join('')}
    </div>
    <div class="fx-note">
      Latest annual observation up to ${refYear}; a superscript marks any value from another year. IMF fiscal and debt figures for the latest year are WEO estimates.
      Hover a cell for value, year and threshold; select a row to open the country profile. n/a: series not published for that economy.
    </div>
  </div>`;

  // ── Detailed list grouped by severity ─────────────────────────────────────
  const group = sev => {
    const list = bySev(sev).sort((a, b) => b.gap / Math.max(1, Math.abs(b.dim.cfg.threshold)) - a.gap / Math.max(1, Math.abs(a.dim.cfg.threshold)));
    if (!list.length) return '';
    return `
    <div class="panel fx-group">
      <div class="panel__head">
        <div><span class="fx-dot fx-dot--${sev}"></span><span class="panel__title">${FLAG_SEV[sev].label} severity</span><span class="panel__sub">${list.length} flag${list.length === 1 ? '' : 's'}</span></div>
      </div>
      <div class="fx-list">
        <div class="fx-item fx-item--head" aria-hidden="true">
          <span>Economy</span><span>Indicator</span><span class="fx-r">Value</span><span class="fx-r">Threshold</span><span class="fx-r">Year</span><span>Why it matters</span>
        </div>
        ${list.map((f, i) => `
          <div class="fx-item${groupByRegion && i >= 10 ? ' fx-item--more' : ''}" ${A.navRowAttrs(f.country.iso3, f.country.name)}>
            <span class="fx-item__country">${flagImg(f.country)}<span class="fx-item__name">${A.escapeText(f.country.name)}</span></span>
            <span class="fx-item__ind">${A.escapeText(f.dim.short)} <span class="fx-item__unit">(${A.escapeText(f.dim.unit)})</span></span>
            <span class="fx-r fx-item__val fx-val--${sev}">${flagFmt(f.value, f.dim)}${f.dim.unit === 'bp' ? 'bp' : '%'}<span class="fx-item__gap">${f.gap.toFixed(f.dim.unit === 'bp' ? 0 : 1)} ${f.dim.unit === 'bp' ? 'bp' : 'pp'} ${f.dim.cfg.dir === 'above' ? 'above' : 'below'}</span></span>
            <span class="fx-r fx-item__thr">${flagThreshText(f.dim.cfg, f.dim).replace(' of GDP', ' GDP')}</span>
            <span class="fx-r fx-item__yr">${f.year}</span>
            <span class="fx-item__why">${A.escapeText(f.dim.why)}</span>
          </div>`).join('')}
      </div>
      ${groupByRegion && list.length > 10 ? `<div class="co-more"><button class="pill-btn" onclick="this.closest('.fx-group').classList.add('fx-group--all');this.parentElement.remove()">Show all ${list.length} ${FLAG_SEV[sev].label.toLowerCase()}-severity flags</button></div>` : ''}
    </div>`;
  };

  return `
<div class="page-body fx-page">
  <div class="sec-head">
    <div class="sec-head__title">Risk flags <span class="count">/ ${allFlags.length}</span><span class="sec-head__sub">${dims.filter(d => !d.daily).length} macro thresholds on annual data · ${refYear} · ${dims.filter(d => d.daily).length} daily market signals</span></div>
    <div class="sec-head__actions">
      <span class="fx-meta">${flaggedRows.length} flagged · ${clearRows.length} clear</span>
    </div>
  </div>

  ${summary}

  <div class="sec-head"><div class="sec-head__title">Country × risk matrix<span class="sec-head__sub">value shown in each cell, coloured by severity</span></div></div>
  ${matrix}

  <div class="sec-head"><div class="sec-head__title">Flag detail <span class="count">/ ${allFlags.length}</span><span class="sec-head__sub">grouped by severity · largest breach relative to threshold first${groupByRegion ? ' · top 10 per severity, expand for all' : ''}</span></div></div>
  ${allFlags.length ? `${group('high')}${group('medium')}${group('low')}` : `<div class="panel"><div class="panel__body fx-empty">No thresholds breached in the latest annual data.</div></div>`}
</div>`;
}
