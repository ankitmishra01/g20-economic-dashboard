// Pre-programmed G20 insight engine — answers data questions without an API key.
// Reads from window.G20_DATA (loaded by data.js). Returns safe HTML strings.

(function () {
  // Inject table + insight styles once
  const style = document.createElement('style');
  style.textContent = `
    .ins-block { font-size: 13px; }
    .ins-ttl { font-weight: 700; font-size: 13px; color: var(--ink); margin: 0 0 6px; }
    .ins-p { font-size: 12.5px; color: var(--text-2); line-height: 1.65; margin: 0 0 10px; }
    .ins-tbl { width: 100%; border-collapse: collapse; font-size: 12px; margin: 0 0 10px; }
    .ins-tbl th { text-align: left; padding: 5px 8px; font-weight: 600; font-size: 11px;
                  color: var(--text-3); border-bottom: 1px solid var(--rule); letter-spacing: .03em; }
    .ins-tbl td { padding: 5px 8px; border-bottom: 1px solid rgba(0,0,0,.04); }
    .ins-tbl tr:last-child td { border-bottom: none; }
    .ins-tbl td:first-child { color: var(--text-3); }
    .ins-hi  { color: #C0392B; font-weight: 500; }
    .ins-lo  { color: #27AE60; font-weight: 500; }
    .ins-warn { color: #E8A236; font-weight: 500; }
    .ins-src { font-size: 10.5px; font-family: var(--font-mono); color: var(--text-4);
               border-top: 1px solid var(--rule); padding-top: 6px; margin-top: 4px; }
    .ins-badge { display: inline-block; font-size: 9.5px; font-family: var(--font-mono);
                 background: var(--bg-2); color: var(--text-3); border-radius: 3px;
                 padding: 1px 4px; margin-left: 4px; vertical-align: middle; }
    .src-tag { font-size: 9.5px; font-family: var(--font-mono); color: var(--text-4); opacity: .8; }
  `;
  document.head.appendChild(style);

  // ── Safe helpers ─────────────────────────────────────────────────────────────
  function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function pct(v, d = 1) { return v != null ? Number(v).toFixed(d) + '%' : '—'; }
  function money(v) { return v != null ? '$' + (Number(v) / 1e12).toFixed(2) + 'T' : '—'; }
  function num(v, d = 1) { return v != null ? Number(v).toFixed(d) : '—'; }
  function sign(v) { return v > 0 ? '+' : ''; }

  function getLatest(iso3, key) { return window.G20Data?.getLatest(iso3, key) || null; }
  function getRanking(key) { return window.G20Data?.getRanking(key)?.filter(c => c.iso3 !== 'EUU') || []; }
  function flag(iso3) { return window.G20?.find(c => c.iso3 === iso3)?.flag || ''; }
  function cname(iso3) { return window.G20?.find(c => c.iso3 === iso3)?.name || iso3; }

  function median(arr) {
    if (!arr.length) return null;
    const s = [...arr].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  // ── HTML builders ─────────────────────────────────────────────────────────────
  function wrap(title, content, sources) {
    return `<div class="ins-block">
      <div class="ins-ttl">${esc(title)}</div>
      ${content}
      <div class="ins-src">Source: ${esc(sources)} · World Bank Open Data · IMF DataMapper · OECD MSTI</div>
    </div>`;
  }

  function table(headers, rows) {
    const th = headers.map(h => `<th>${esc(h)}</th>`).join('');
    const tr = rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('');
    return `<table class="ins-tbl"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>`;
  }

  // ── Insight: Debt rankings ────────────────────────────────────────────────────
  function insightDebt() {
    const rank = getRanking('DEBT_GDP');
    if (!rank.length) return null;
    const vals = rank.map(c => c.value);
    const med = median(vals);
    const top3 = rank.slice(0, 3).map(c => `${esc(cname(c.iso3))} (${pct(c.value, 0)})`).join(', ');
    const under60 = rank.filter(c => c.value < 60).length;

    const rows = rank.map((c, i) => [
      `#${i + 1}`,
      `${flag(c.iso3)} ${esc(cname(c.iso3))}`,
      c.value > 100 ? `<span class="ins-hi">${pct(c.value, 0)}</span>` : pct(c.value, 0),
      c.year,
    ]);

    const p = `${top3} carry the heaviest debt loads in the G20. The G20 median is ${pct(med, 0)}; ${under60} economies are below the commonly cited 60% threshold. Sustained high debt raises refinancing risks, particularly when interest rates are elevated.`;
    return wrap('G20 Government Debt / GDP Rankings', `<p class="ins-p">${p}</p>` + table(['', 'Economy', 'Debt / GDP', 'Year'], rows), 'IMF DataMapper');
  }

  // ── Insight: GDP growth rankings ──────────────────────────────────────────────
  function insightGrowth() {
    const rank = getRanking('GDP_GROWTH');
    if (!rank.length) return null;
    const vals = rank.map(c => c.value);
    const med = median(vals);
    const fastest = rank[0];
    const slowest = rank[rank.length - 1];
    const negative = rank.filter(c => c.value < 0);

    const rows = rank.map((c, i) => {
      const cls = c.value < 0 ? 'ins-hi' : c.value >= 5 ? 'ins-lo' : '';
      return [
        `#${i + 1}`,
        `${flag(c.iso3)} ${esc(cname(c.iso3))}`,
        `<span class="${cls}">${sign(c.value)}${pct(c.value)}</span>`,
        c.year,
      ];
    });

    const negStr = negative.length ? ` ${negative.map(c => esc(cname(c.iso3))).join(', ')} ${negative.length > 1 ? 'are' : 'is'} in contraction.` : ' No G20 economies are currently contracting.';
    const p = `${esc(cname(fastest.iso3))} leads G20 growth at ${sign(fastest.value)}${pct(fastest.value)} (${fastest.year}). The G20 median is ${sign(med)}${pct(med)}.${negStr} ${esc(cname(slowest.iso3))} records the weakest growth at ${sign(slowest.value)}${pct(slowest.value)}.`;
    return wrap('G20 GDP Growth Rankings', `<p class="ins-p">${p}</p>` + table(['', 'Economy', 'Growth', 'Year'], rows), 'World Bank');
  }

  // ── Insight: Inflation ────────────────────────────────────────────────────────
  function insightInflation() {
    const rank = getRanking('INFLATION').sort((a, b) => b.value - a.value);
    if (!rank.length) return null;
    const vals = rank.map(c => c.value);
    const med = median(vals);
    const high = rank.filter(c => c.value > 8);
    const low  = rank.filter(c => c.value < 2);

    const rows = rank.map((c, i) => {
      const cls = c.value > 8 ? 'ins-hi' : c.value > 4 ? 'ins-warn' : c.value < 2 ? 'ins-lo' : '';
      return [
        `#${i + 1}`,
        `${flag(c.iso3)} ${esc(cname(c.iso3))}`,
        `<span class="${cls}">${pct(c.value)}</span>`,
        c.year,
      ];
    });

    const hiStr = high.length ? `${high.map(c => esc(cname(c.iso3))).join(', ')} ${high.length > 1 ? 'remain' : 'remains'} above the 8% threshold.` : 'No G20 economy currently exceeds 8% inflation.';
    const loStr = low.length ? ` ${low.map(c => esc(cname(c.iso3))).join(', ')} show sub-2% inflation, raising mild deflation concerns.` : '';
    const p = `G20 median CPI stands at ${pct(med)}. ${hiStr}${loStr}`;
    return wrap('G20 Inflation Snapshot', `<p class="ins-p">${p}</p>` + table(['', 'Economy', 'CPI Inflation', 'Year'], rows), 'World Bank');
  }

  // ── Insight: Recession risk ────────────────────────────────────────────────────
  function insightRecessionRisk() {
    const growthRank = getRanking('GDP_GROWTH');
    if (!growthRank.length) return null;

    const atrisk = growthRank.filter(c => c.value < 0);
    const slowing = growthRank.filter(c => c.value >= 0 && c.value < 1.5);
    const debt = getRanking('DEBT_GDP');
    const highDebt = debt.filter(c => c.value > 120);

    const rows = [];
    const flagged = new Set();
    for (const c of atrisk) {
      flagged.add(c.iso3);
      rows.push([
        `${flag(c.iso3)} ${esc(cname(c.iso3))}`,
        `<span class="ins-hi">${sign(c.value)}${pct(c.value)} (${c.year})</span>`,
        '<span class="ins-hi">Contraction</span>',
      ]);
    }
    for (const c of slowing) {
      if (!flagged.has(c.iso3)) {
        flagged.add(c.iso3);
        const debtVal = getLatest(c.iso3, 'DEBT_GDP');
        const risk = debtVal?.value > 100 ? 'Elevated' : 'Watch';
        rows.push([
          `${flag(c.iso3)} ${esc(cname(c.iso3))}`,
          `${sign(c.value)}${pct(c.value)} (${c.year})`,
          `<span class="ins-warn">${risk}</span>`,
        ]);
      }
    }

    if (!rows.length) {
      return wrap('Recession & Contraction Risk', `<p class="ins-p">No G20 economies are currently in contraction. All 19 non-EU members show positive GDP growth in the latest available data. The G20 median growth rate is ${pct(median(growthRank.map(c => c.value)))} — a broadly resilient backdrop, though several advanced economies are growing below long-run trend.</p>`, 'World Bank, IMF DataMapper');
    }

    const p = `${atrisk.length > 0 ? `${atrisk.length} G20 economy/economies are currently in contraction. ` : ''}${slowing.length} economies are growing below 1.5%, a common watch threshold. Economies with high debt loads face compounded risk when growth slows.`;
    return wrap('Recession & Contraction Risk', `<p class="ins-p">${p}</p>` + table(['Economy', 'Latest Growth', 'Assessment'], rows), 'World Bank, IMF DataMapper');
  }

  // ── Insight: Fiscal health ────────────────────────────────────────────────────
  function insightFiscal() {
    const debtRank = getRanking('DEBT_GDP');
    const fiscalRank = getRanking('FISCAL_BAL').sort((a, b) => a.value - b.value); // worst first
    const taxRank  = getRanking('TAX_REVENUE');

    const rows = debtRank.slice(0, 15).map(c => {
      const fiscal = getLatest(c.iso3, 'FISCAL_BAL');
      const tax    = getLatest(c.iso3, 'TAX_REVENUE');
      const fVal   = fiscal?.value;
      const fCls   = fVal != null ? (fVal < -6 ? 'ins-hi' : fVal < 0 ? 'ins-warn' : 'ins-lo') : '';
      return [
        `${flag(c.iso3)} ${esc(cname(c.iso3))}`,
        c.value > 100 ? `<span class="ins-hi">${pct(c.value, 0)}</span>` : pct(c.value, 0),
        fVal != null ? `<span class="${fCls}">${sign(fVal)}${pct(fVal)}</span>` : '—',
        tax?.value != null ? pct(tax.value) : '—',
      ];
    });

    const deficits = fiscalRank.filter(c => c.value < 0).length;
    const surplus  = fiscalRank.filter(c => c.value > 0).length;
    const worstFiscal = fiscalRank[0];
    const p = `${deficits} G20 economies are running fiscal deficits (government spending exceeds revenue); ${surplus} have surpluses. ${worstFiscal ? `${esc(cname(worstFiscal.iso3))} has the largest deficit at ${pct(worstFiscal.value)} of GDP (${worstFiscal.year}).` : ''} High debt + persistent deficits = structural vulnerability when interest rates rise.`;
    return wrap('G20 Fiscal Health Monitor', `<p class="ins-p">${p}</p>` + table(['Economy', 'Debt/GDP', 'Fiscal Balance', 'Tax Revenue'], rows), 'IMF DataMapper, World Bank');
  }

  // ── Insight: Youth unemployment ───────────────────────────────────────────────
  function insightYouthUnemp() {
    const rank = getRanking('YOUTH_UNEMP').sort((a, b) => b.value - a.value);
    if (!rank.length) return null;
    const vals = rank.map(c => c.value);
    const med = median(vals);
    const critical = rank.filter(c => c.value > 25);
    const adult = getRanking('UNEMPLOYMENT');

    const rows = rank.map((c, i) => {
      const adultVal = getLatest(c.iso3, 'UNEMPLOYMENT');
      const ratio = adultVal?.value ? (c.value / adultVal.value).toFixed(1) : '—';
      const cls = c.value > 25 ? 'ins-hi' : c.value > 15 ? 'ins-warn' : '';
      return [
        `#${i + 1}`,
        `${flag(c.iso3)} ${esc(cname(c.iso3))}`,
        `<span class="${cls}">${pct(c.value)}</span>`,
        adultVal?.value != null ? pct(adultVal.value) : '—',
        ratio + 'x',
        c.year,
      ];
    });

    const p = `G20 median youth unemployment is ${pct(med)}. ${critical.length > 0 ? `${critical.map(c => esc(cname(c.iso3))).join(', ')} exceed the 25% critical threshold, indicating significant structural barriers to youth employment.` : 'No G20 economy currently exceeds the 25% critical threshold.'} Youth unemployment typically runs 2-3× the adult rate; ratios above 3× signal skill mismatch or labour market rigidities.`;
    return wrap('Youth Unemployment Across G20', `<p class="ins-p">${p}</p>` + table(['', 'Economy', 'Youth Unemp.', 'Adult Unemp.', 'Ratio', 'Year'], rows), 'World Bank (ILO modelled estimates)');
  }

  // ── Insight: Trade & Investment ───────────────────────────────────────────────
  function insightTrade() {
    const exportRank = getRanking('EXPORTS_GDP').sort((a, b) => b.value - a.value);
    if (!exportRank.length) return null;

    const rows = exportRank.map(c => {
      const fdi  = getLatest(c.iso3, 'FDI_INFLOWS');
      const cap  = getLatest(c.iso3, 'CAPITAL_FORM');
      const fdiCls = fdi?.value < 0 ? 'ins-hi' : '';
      return [
        `${flag(c.iso3)} ${esc(cname(c.iso3))}`,
        pct(c.value),
        fdi?.value != null ? `<span class="${fdiCls}">${sign(fdi.value)}${pct(fdi.value)}</span>` : '—',
        cap?.value  != null ? pct(cap.value) : '—',
        c.year,
      ];
    });

    const top = exportRank[0];
    const fdiRank = getRanking('FDI_INFLOWS').sort((a, b) => b.value - a.value);
    const topFDI  = fdiRank[0];
    const p = `${esc(cname(top.iso3))} is the most export-oriented G20 economy at ${pct(top.value)} of GDP (${top.year}). ${topFDI ? `${esc(cname(topFDI.iso3))} attracts the most FDI relative to GDP at ${sign(topFDI.value)}${pct(topFDI.value)} (${topFDI.year}).` : ''} Export share reflects trade openness; capital formation shows investment appetite.`;
    return wrap('G20 Trade & Investment Overview', `<p class="ins-p">${p}</p>` + table(['Economy', 'Exports/GDP', 'FDI Inflows', 'Capital Formation', 'Year'], rows), 'World Bank');
  }

  // ── Insight: Country profile ──────────────────────────────────────────────────
  function insightCountry(iso3) {
    const country = window.G20?.find(c => c.iso3 === iso3);
    if (!country) return null;

    const get = key => getLatest(iso3, key);
    const gdp    = get('GDP');
    const gr     = get('GDP_GROWTH');
    const inf    = get('INFLATION');
    const une    = get('UNEMPLOYMENT');
    const debt   = get('DEBT_GDP');
    const fiscal = get('FISCAL_BAL');
    const cap    = get('GDP_CAPITA');
    const ca     = get('CURRENT_ACC');
    const health = get('HEALTH_EXP');
    const rd     = get('RD_EXP');
    const educ   = get('EDUC_EXP');
    const youth  = get('YOUTH_UNEMP');
    const tax    = get('TAX_REVENUE');
    const exp    = get('EXPORTS_GDP');
    const mfg    = get('MANUFACTURING');
    const fdi    = get('FDI_INFLOWS');
    const capfrm = get('CAPITAL_FORM');
    const gini   = get('GINI');

    const grCls  = gr?.value < 0 ? 'ins-hi' : gr?.value >= 4 ? 'ins-lo' : '';
    const infCls = inf?.value > 8 ? 'ins-hi' : inf?.value > 4 ? 'ins-warn' : '';
    const fiscCls = fiscal?.value < -6 ? 'ins-hi' : fiscal?.value < 0 ? 'ins-warn' : 'ins-lo';

    const rows = [
      ['GDP', gdp ? money(gdp.value) + ` (${gdp.year})` : '—', 'World Bank'],
      ['GDP per Capita', cap ? `$${Math.round(cap.value / 1000)}K (${cap.year})` : '—', 'World Bank'],
      ['GDP Growth', gr ? `<span class="${grCls}">${sign(gr.value)}${pct(gr.value)} (${gr.year})</span>` : '—', 'World Bank'],
      ['Inflation', inf ? `<span class="${infCls}">${pct(inf.value)} (${inf.year})</span>` : '—', 'World Bank'],
      ['Unemployment', une ? `${pct(une.value)} (${une.year})` : '—', 'World Bank'],
      ['Youth Unemployment', youth ? `${pct(youth.value)} (${youth.year})` : '—', 'World Bank'],
      ['Government Debt', debt ? `${pct(debt.value, 0)} of GDP (${debt.year})` : '—', 'IMF'],
      ['Fiscal Balance', fiscal ? `<span class="${fiscCls}">${sign(fiscal.value)}${pct(fiscal.value)} (${fiscal.year})</span>` : '—', 'IMF'],
      ['Tax Revenue', tax ? `${pct(tax.value)} of GDP (${tax.year})` : '—', 'World Bank'],
      ['Current Account', ca ? `${sign(ca.value)}${pct(ca.value)} GDP (${ca.year})` : '—', 'World Bank'],
      ['Exports', exp ? `${pct(exp.value)} of GDP (${exp.year})` : '—', 'World Bank'],
      ['Manufacturing', mfg ? `${pct(mfg.value)} of GDP (${mfg.year})` : '—', 'World Bank'],
      ['FDI Inflows', fdi ? `${sign(fdi.value)}${pct(fdi.value)} GDP (${fdi.year})` : '—', 'World Bank'],
      ['Capital Formation', capfrm ? `${pct(capfrm.value)} of GDP (${capfrm.year})` : '—', 'World Bank'],
      ['Health Spending', health ? `${pct(health.value)} of GDP (${health.year})` : '—', 'World Bank'],
      ['Education Spending', educ ? `${pct(educ.value)} of GDP (${educ.year})` : '—', 'World Bank'],
      ['R&D Spending', rd ? `${pct(rd.value)} of GDP (${rd.year})` : '—', 'OECD / World Bank'],
      ['Gini Coefficient', gini ? `${num(gini.value)} (${gini.year})` : '—', 'World Bank'],
    ].filter(r => r[1] !== '—');

    const tbl = `<table class="ins-tbl">
      <thead><tr><th>Indicator</th><th>Value</th><th>Source</th></tr></thead>
      <tbody>${rows.map(r => `<tr><td>${esc(r[0])}</td><td>${r[1]}</td><td><span class="src-tag">${esc(r[2])}</span></td></tr>`).join('')}</tbody>
    </table>`;

    // Auto-generated narrative sentences from live data
    const g20ex = (window.G20 || []).filter(c => c.iso3 !== 'EUU');
    const g20MedianGrowth  = median(g20ex.map(c => getLatest(c.iso3, 'GDP_GROWTH')?.value).filter(v => v != null));
    const g20MedianYouth   = median(g20ex.map(c => getLatest(c.iso3, 'YOUTH_UNEMP')?.value).filter(v => v != null));
    const g20MedianDebt    = median(g20ex.map(c => getLatest(c.iso3, 'DEBT_GDP')?.value).filter(v => v != null));

    const sentences = [];
    if (gr && g20MedianGrowth != null) {
      const vs = gr.value >= g20MedianGrowth ? 'above' : 'below';
      sentences.push(`${esc(country.name)} recorded ${sign(gr.value)}${pct(gr.value)} GDP growth in ${gr.year}, ${vs} the G20 median of ${sign(g20MedianGrowth)}${pct(g20MedianGrowth)}.`);
    }
    if (fiscal && debt) {
      const balDesc = fiscal.value > 0 ? `a surplus of ${pct(fiscal.value)}` : `a deficit of ${pct(Math.abs(fiscal.value))}`;
      const debtDesc = debt.value > g20MedianDebt ? 'above' : 'below';
      sentences.push(`The fiscal position shows ${balDesc} of GDP (${fiscal.year}) with government debt at ${pct(debt.value, 0)} of GDP — ${debtDesc} the G20 median of ${pct(g20MedianDebt, 0)}.`);
    }
    if (youth && g20MedianYouth != null) {
      const yDesc = youth.value > 25 ? `elevated at ${pct(youth.value)}` : youth.value > g20MedianYouth ? `${pct(youth.value)}, above the G20 median` : `${pct(youth.value)}, below the G20 median`;
      sentences.push(`Youth unemployment stands at ${yDesc} of ${pct(g20MedianYouth)} (${youth.year}).`);
    }

    const narrative = sentences.length
      ? `<p class="ins-p" style="margin-top:10px;padding-top:10px;border-top:1px solid var(--rule)">${sentences.join(' ')}</p>`
      : '';

    return wrap(
      `${country.flag} ${country.name} — Economic Profile`,
      tbl + narrative,
      'World Bank, IMF DataMapper, OECD'
    );
  }

  // ── Insight: Country comparison ───────────────────────────────────────────────
  function insightCompare(iso3s) {
    iso3s = iso3s.filter(c => window.G20?.find(x => x.iso3 === c));
    if (iso3s.length < 2) return null;
    const tops = iso3s.slice(0, 4);

    const indicators = [
      { key: 'GDP',          label: 'GDP',              fmt: v => money(v) },
      { key: 'GDP_GROWTH',   label: 'GDP Growth',       fmt: v => `${sign(v)}${pct(v)}` },
      { key: 'INFLATION',    label: 'Inflation',        fmt: v => pct(v) },
      { key: 'UNEMPLOYMENT', label: 'Unemployment',     fmt: v => pct(v) },
      { key: 'YOUTH_UNEMP',  label: 'Youth Unemp.',     fmt: v => pct(v) },
      { key: 'DEBT_GDP',     label: 'Govt Debt/GDP',    fmt: v => pct(v, 0) },
      { key: 'FISCAL_BAL',   label: 'Fiscal Balance',   fmt: v => `${sign(v)}${pct(v)}` },
      { key: 'GDP_CAPITA',   label: 'GDP per Capita',   fmt: v => `$${Math.round(v / 1000)}K` },
      { key: 'CURRENT_ACC',  label: 'Current Account',  fmt: v => `${sign(v)}${pct(v)}` },
      { key: 'EXPORTS_GDP',  label: 'Exports/GDP',      fmt: v => pct(v) },
      { key: 'HEALTH_EXP',   label: 'Health Spending',  fmt: v => pct(v) },
      { key: 'RD_EXP',       label: 'R&D Spending',     fmt: v => pct(v) },
      { key: 'EDUC_EXP',     label: 'Education',        fmt: v => pct(v) },
      { key: 'TAX_REVENUE',  label: 'Tax Revenue',      fmt: v => pct(v) },
      { key: 'GINI',         label: 'Gini Index',       fmt: v => num(v) },
    ];

    const hdrs = ['Indicator', ...tops.map(iso3 => {
      const c = window.G20?.find(x => x.iso3 === iso3);
      return c ? `${c.flag} ${c.name}` : iso3;
    })];

    const rows = indicators.map(ind => {
      const cells = tops.map(iso3 => {
        const d = getLatest(iso3, ind.key);
        return d?.value != null ? ind.fmt(d.value) : '—';
      });
      if (cells.every(c => c === '—')) return null;
      return [esc(ind.label), ...cells];
    }).filter(Boolean);

    return wrap(
      `Comparing: ${tops.map(i => esc(cname(i))).join(' vs ')}`,
      table(hdrs, rows),
      'World Bank, IMF DataMapper, OECD'
    );
  }

  // ── Insight: Regional breakdown ───────────────────────────────────────────────
  function insightRegional(region) {
    const countries = (window.G20 || []).filter(c => c.iso3 !== 'EUU' && c.region === region);
    if (!countries.length) return null;

    const keys = [
      { key: 'GDP_GROWTH', label: 'Growth', fmt: v => `${sign(v)}${pct(v)}` },
      { key: 'INFLATION',  label: 'CPI',   fmt: v => pct(v) },
      { key: 'DEBT_GDP',   label: 'Debt/GDP', fmt: v => pct(v, 0) },
      { key: 'UNEMPLOYMENT',label: 'Unemp.', fmt: v => pct(v) },
      { key: 'FISCAL_BAL', label: 'Fiscal Bal.', fmt: v => `${sign(v)}${pct(v)}` },
      { key: 'GDP_CAPITA', label: 'GDP/capita', fmt: v => `$${Math.round(v / 1000)}K` },
    ];

    const rows = countries.map(c => {
      const cells = keys.map(k => {
        const d = getLatest(c.iso3, k.key);
        return d?.value != null ? k.fmt(d.value) : '—';
      });
      return [`${c.flag} ${esc(c.name)}`, ...cells];
    });

    const gdpGrowths = countries.map(c => getLatest(c.iso3, 'GDP_GROWTH')?.value).filter(v => v != null);
    const avgGrowth = gdpGrowths.reduce((s, v) => s + v, 0) / gdpGrowths.length;
    const p = `${region} G20 members average ${sign(avgGrowth)}${pct(avgGrowth)} GDP growth. ${countries.length} economies shown.`;

    return wrap(
      `${region} — G20 Economic Snapshot`,
      `<p class="ins-p">${p}</p>` + table(['Economy', ...keys.map(k => k.label)], rows),
      'World Bank, IMF DataMapper'
    );
  }

  // ── Insight: G20 overview ─────────────────────────────────────────────────────
  function insightOverview() {
    const growthRank  = getRanking('GDP_GROWTH');
    const inflRank    = getRanking('INFLATION');
    const debtRank    = getRanking('DEBT_GDP');
    const fiscalRank  = getRanking('FISCAL_BAL');
    if (!growthRank.length) return null;

    const growthMed   = median(growthRank.map(c => c.value));
    const inflMed     = median(inflRank.map(c => c.value));
    const debtMed     = median(debtRank.map(c => c.value));
    const contracting = growthRank.filter(c => c.value < 0).length;
    const highInfl    = inflRank.filter(c => c.value > 8).length;
    const heavyDebt   = debtRank.filter(c => c.value > 100).length;
    const deficits    = fiscalRank.filter(c => c.value < 0).length;

    const rows = growthRank.map(c => {
      const inf  = getLatest(c.iso3, 'INFLATION');
      const debt = getLatest(c.iso3, 'DEBT_GDP');
      const fisc = getLatest(c.iso3, 'FISCAL_BAL');
      const grCls  = c.value < 0 ? 'ins-hi' : c.value >= 4 ? 'ins-lo' : '';
      const infCls = inf?.value > 8 ? 'ins-hi' : '';
      return [
        `${flag(c.iso3)} ${esc(cname(c.iso3))}`,
        `<span class="${grCls}">${sign(c.value)}${pct(c.value)}</span>`,
        inf?.value != null ? `<span class="${infCls}">${pct(inf.value)}</span>` : '—',
        debt?.value != null ? pct(debt.value, 0) : '—',
        fisc?.value != null ? `${sign(fisc.value)}${pct(fisc.value)}` : '—',
      ];
    });

    const p = `G20 median GDP growth: ${sign(growthMed)}${pct(growthMed)} · Median CPI: ${pct(inflMed)} · Median debt/GDP: ${pct(debtMed, 0)}. ${contracting} economies are contracting, ${highInfl} have above-8% inflation, ${heavyDebt} carry debt above 100% of GDP, and ${deficits} are running fiscal deficits.`;
    return wrap('G20 Economic Snapshot — All Economies', `<p class="ins-p">${p}</p>` + table(['Economy', 'Growth', 'CPI', 'Debt/GDP', 'Fiscal Bal.'], rows), 'World Bank, IMF DataMapper');
  }

  // ── Country name / alias map ──────────────────────────────────────────────────
  const ALIASES = {
    'united states': 'USA', 'usa': 'USA', 'u.s.': 'USA', 'america': 'USA', 'american': 'USA',
    'united kingdom': 'GBR', 'uk': 'GBR', 'britain': 'GBR', 'british': 'GBR', 'england': 'GBR',
    'germany': 'DEU', 'german': 'DEU', 'deutschland': 'DEU',
    'france': 'FRA', 'french': 'FRA',
    'italy': 'ITA', 'italian': 'ITA',
    'japan': 'JPN', 'japanese': 'JPN',
    'canada': 'CAN', 'canadian': 'CAN',
    'australia': 'AUS', 'australian': 'AUS',
    'south korea': 'KOR', 'korea': 'KOR', 'korean': 'KOR', 'rok': 'KOR',
    'china': 'CHN', 'chinese': 'CHN', 'prc': 'CHN',
    'india': 'IND', 'indian': 'IND',
    'brazil': 'BRA', 'brazilian': 'BRA',
    'mexico': 'MEX', 'mexican': 'MEX',
    'argentina': 'ARG', 'argentinian': 'ARG', 'argentine': 'ARG',
    'russia': 'RUS', 'russian': 'RUS',
    'saudi arabia': 'SAU', 'saudi': 'SAU', 'ksa': 'SAU',
    'south africa': 'ZAF', 'south african': 'ZAF',
    'indonesia': 'IDN', 'indonesian': 'IDN',
    'turkey': 'TUR', 'türkiye': 'TUR', 'turkish': 'TUR',
  };

  function detectCountries(q) {
    const lq = (' ' + q.toLowerCase() + ' ').replace(/[^a-zÀ-ÿ0-9 .]/g, ' ');
    const found = new Set();
    const sorted = Object.keys(ALIASES).sort((a, b) => b.length - a.length);
    for (const alias of sorted) {
      if (lq.includes(' ' + alias + ' ') || lq.includes(' ' + alias + ',') || lq.includes(alias + ' ')) {
        found.add(ALIASES[alias]);
      }
    }
    return [...found];
  }

  // ── Public API ────────────────────────────────────────────────────────────────
  window.generateLocalInsight = function (question) {
    if (!window.G20Data || !window.G20_DATA) return null;
    const q = question.toLowerCase();

    // Country-specific first (single country = profile; 2+ = comparison)
    const countries = detectCountries(question);
    if (countries.length === 1) return insightCountry(countries[0]);
    if (countries.length >= 2) return insightCompare(countries);

    // Thematic routing
    if (/\bdebt\b|indebted|sovereign debt|debt.to.gdp/.test(q)) return insightDebt();
    if (/recession|contract|negat.*growth|shrin/.test(q))        return insightRecessionRisk();
    if (/inflation|cpi|price.*(rise|level|pressur)/.test(q))      return insightInflation();
    if (/growth|fastest.*grow|slowest.*grow|gdp.*growth/.test(q)) return insightGrowth();
    if (/youth.*unem|young.*unem|unem.*youth|student.*job/.test(q)) return insightYouthUnemp();
    if (/fiscal|deficit|surplus|gov.*financ|gov.*spend|budget/.test(q)) return insightFiscal();
    if (/trade|export|fdi|foreign.*invest|capital.*form/.test(q)) return insightTrade();
    if (/asia|east.*asia|southeast.*asia/.test(q))  return insightRegional('Asia');
    if (/europ/.test(q))                             return insightRegional('Europe');
    if (/america|latin|south.*america/.test(q))      return insightRegional('Americas');
    if (/middle.east|gulf/.test(q))                  return insightRegional('Middle East');
    if (/africa/.test(q))                            return insightRegional('Africa');
    if (/overview|snapshot|summary|g20.*today|all.*economies|global/.test(q)) return insightOverview();

    // Short / generic fallback → full G20 overview
    if (q.split(/\s+/).length <= 5) return insightOverview();

    return null; // no pattern match — caller tries API
  };

  // ── Recession Risk Score ──────────────────────────────────────────────────────
  // Returns { score, label, labelCls, signals } for a given country ISO3.
  // Score is 0–100 (higher = more risk).
  window.computeRiskScore = function (iso3) {
    let score = 0;
    const signals = [];

    const growth  = getLatest(iso3, 'GDP_GROWTH');
    const fiscal  = getLatest(iso3, 'FISCAL_BAL');
    const debt    = getLatest(iso3, 'DEBT_GDP');
    const ca      = getLatest(iso3, 'CURRENT_ACC');
    const unemp   = getLatest(iso3, 'UNEMPLOYMENT');
    const inf     = getLatest(iso3, 'INFLATION');

    const gv = growth?.value;
    const fv = fiscal?.value;
    const dv = debt?.value;
    const cav = ca?.value;
    const uv = unemp?.value;
    const iv = inf?.value;

    if (gv != null) {
      if (gv < 0)        { score += 25; signals.push('Contraction'); }
      else if (gv < 1)   { score += 15; signals.push('Near-zero growth'); }
      else if (gv < 2)   { score += 7;  signals.push('Below-trend growth'); }

      // Check if growth is declining (compare to 2 years prior)
      const series = window.G20Data?.getSeries(iso3, 'GDP_GROWTH', 2020) || [];
      if (series.length >= 3) {
        const prev2 = series[series.length - 3]?.value;
        if (prev2 != null && gv < prev2 - 2) { score += 8; signals.push('Declining trend'); }
      }
    }

    if (fv != null) {
      if (fv < -6)   { score += 20; signals.push('Large fiscal deficit'); }
      else if (fv < -3) { score += 10; signals.push('Fiscal deficit'); }
    }

    if (dv != null) {
      if (dv > 120)  { score += 15; signals.push('Debt >120% GDP'); }
      else if (dv > 100) { score += 8; signals.push('Debt >100% GDP'); }
    }

    if (cav != null && cav < -4) { score += 10; signals.push('Current account deficit'); }
    if (uv  != null && uv > 8)   { score += 8;  signals.push('High unemployment'); }
    if (iv  != null && iv > 6)   { score += 7;  signals.push('Elevated inflation'); }

    score = Math.min(score, 100);

    let label, labelCls;
    if (score >= 50)      { label = 'High Risk';  labelCls = 'risk-high'; }
    else if (score >= 30) { label = 'Elevated';   labelCls = 'risk-elevated'; }
    else if (score >= 15) { label = 'Watch';      labelCls = 'risk-watch'; }
    else                  { label = 'Stable';     labelCls = 'risk-stable'; }

    return { score, label, labelCls, signals };
  };
})();
