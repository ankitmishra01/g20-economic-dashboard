// Analysis page — four classic macro relationships estimated live from the
// dashboard's own annual panel (World Bank WDI + IMF WEO, 2000 to latest).
// Every number on this page is computed in the browser from G20_DATA; nothing
// is hand-entered and no LLM is involved.

(function () {
  const START = 2000;
  const END = window.LATEST_ACTUAL_YEAR; // same cap as data.js (latest actual year)
  const DEBT_BASE = 2019;       // pre-pandemic anchor for the debt decomposition
  const COVID = new Set([2020, 2021]);
  // Gross-debt decompositions are not meaningful where most debt is FX-linked
  // and CPI runs far from the GDP deflator.
  const DEBT_EXCLUDE = { ARG: 'Argentina', TUR: 'Türkiye' };
  // China's unemployment series switches source (World Bank modelled → IMF) in
  // 2017, so that year's change is a splice, not a labour-market move. India's
  // splices modelled ILO estimates onto a survey-based series with a ~2 pp level
  // break in 2022, which no single-year drop can fix, so it is left out.
  const U_SPLICE = { CHN: [2017] };
  const OKUN_EXCLUDE = { IND: 'India' };

  let _okunExCovid = true;
  let _syncEra = 'ex';
  const _charts = {};

  // ── Helpers ───────────────────────────────────────────────────────────────
  const series = (iso3, key) => window.G20_DATA?.[iso3]?.[key] || {};
  const num = (v) => (v === null || v === undefined || Number.isNaN(+v) ? null : +v);
  const countries = () => window.G20.filter(c => c.iso3 !== 'EUU');
  const nameOf = (iso3) => window.G20.find(c => c.iso3 === iso3)?.name || iso3;
  const esc = (s) => A.escapeText(s);
  const f = (v, d = 1) => (v >= 0 ? '' : '−') + Math.abs(v).toFixed(d);
  const fs = (v, d = 1) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(d);

  // Ordinary least squares with a classical standard error on the slope.
  function ols(x, y) {
    const n = x.length;
    if (n < 3) return null;
    const mx = x.reduce((a, b) => a + b, 0) / n;
    const my = y.reduce((a, b) => a + b, 0) / n;
    let sxx = 0, sxy = 0, sst = 0;
    for (let i = 0; i < n; i++) {
      sxx += (x[i] - mx) ** 2;
      sxy += (x[i] - mx) * (y[i] - my);
      sst += (y[i] - my) ** 2;
    }
    if (!sxx || !sst) return null;
    const b = sxy / sxx, a = my - b * mx;
    let sse = 0;
    for (let i = 0; i < n; i++) sse += (y[i] - a - b * x[i]) ** 2;
    const se = Math.sqrt(sse / (n - 2) / sxx);
    return { a, b, se, t: b / se, r2: 1 - sse / sst, n };
  }

  function corr(x, y) {
    const n = x.length;
    const mx = x.reduce((a, b) => a + b, 0) / n;
    const my = y.reduce((a, b) => a + b, 0) / n;
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < n; i++) {
      sxy += (x[i] - mx) * (y[i] - my);
      sxx += (x[i] - mx) ** 2;
      syy += (y[i] - my) ** 2;
    }
    return sxy / Math.sqrt(sxx * syy);
  }

  // ── 1. Beta convergence ───────────────────────────────────────────────────
  // Real GDP per capita growth = (1+g)/(1+n) − 1 each year, compounded, where g
  // is real GDP growth and n population growth. Compared with the log of PPP
  // income in the start year.
  function computeConvergence() {
    const pts = [];
    for (const c of countries()) {
      const g = series(c.iso3, 'GDP_GROWTH'), p = series(c.iso3, 'POPULATION');
      const y0 = num(series(c.iso3, 'GDP_CAPITA_PPP')[START]);
      if (!y0) continue;
      let idx = 1, years = 0, ok = true;
      for (let y = START + 1; y <= END; y++) {
        const gy = num(g[y]), p1 = num(p[y]), p0 = num(p[y - 1]);
        if (gy === null || !p1 || !p0) { ok = false; break; }
        idx *= (1 + gy / 100) / (p1 / p0);
        years++;
      }
      if (!ok) continue;
      pts.push({ iso3: c.iso3, code: c.code, name: c.name, income: y0,
                 x: Math.log(y0), y: (Math.pow(idx, 1 / years) - 1) * 100,
                 multiple: idx });
    }
    const fit = ols(pts.map(p => p.x), pts.map(p => p.y));
    const T = END - START;
    // Implied speed of convergence λ from b = −(1 − e^(−λT)) / T (Barro & Sala-i-Martin).
    const lambda = fit && fit.b < 0 && 1 + fit.b / 100 * T > 0 ? -Math.log(1 + fit.b / 100 * T) / T : null;
    return { pts, fit, lambda, halfLife: lambda ? Math.log(2) / lambda : null, T };
  }

  // ── 2. Okun's law (difference form) ──────────────────────────────────────
  // Δu_t = a + b·g_t. b is the Okun coefficient; −a/b is the growth rate that
  // keeps unemployment stable (a rough read on potential growth).
  function computeOkun(exCovid) {
    const rows = [];
    for (const c of countries()) {
      if (OKUN_EXCLUDE[c.iso3]) continue;
      const g = series(c.iso3, 'GDP_GROWTH'), u = series(c.iso3, 'UNEMPLOYMENT');
      const x = [], y = [];
      for (let yr = START + 1; yr <= END; yr++) {
        if (exCovid && COVID.has(yr)) continue;
        if (U_SPLICE[c.iso3]?.includes(yr)) continue;
        const gy = num(g[yr]), u1 = num(u[yr]), u0 = num(u[yr - 1]);
        if (gy === null || u1 === null || u0 === null) continue;
        x.push(gy); y.push(u1 - u0);
      }
      const fit = ols(x, y);
      if (!fit) continue;
      const significant = Math.abs(fit.t) >= 2 && fit.b < 0;
      rows.push({ iso3: c.iso3, code: c.code, name: c.name, ...fit, significant,
                  stall: significant ? -fit.a / fit.b : null });
    }
    rows.sort((p, q) => p.b - q.b);
    return rows;
  }

  // ── 3. Debt dynamics decomposition ───────────────────────────────────────
  // d_t − d_{t−1} = −d_{t−1}·γ/(1+γ) − fb_t + sfa_t, with γ nominal growth
  // = (1+g)(1+π) − 1. The growth term splits into a real-growth part
  // −d_{t−1}·g/(1+γ) and an inflation remainder. fb is the overall balance
  // (so interest is inside "deficits"); sfa is whatever the identity leaves.
  function computeDebt() {
    const rows = [], skipped = [];
    for (const c of countries()) {
      if (DEBT_EXCLUDE[c.iso3]) continue;
      const d = series(c.iso3, 'DEBT_GDP'), fb = series(c.iso3, 'FISCAL_BAL');
      const g = series(c.iso3, 'GDP_GROWTH'), pi = series(c.iso3, 'INFLATION');
      let real = 0, infl = 0, def = 0, ok = num(d[DEBT_BASE]) !== null && num(d[END]) !== null;
      for (let y = DEBT_BASE + 1; ok && y <= END; y++) {
        const prev = num(d[y - 1]), gy = num(g[y]), py = num(pi[y]), by = num(fb[y]);
        if ([prev, gy, py, by].includes(null)) { ok = false; break; }
        const G = 1 + gy / 100, gamma = G * (1 + py / 100) - 1;
        const total = -prev * gamma / (1 + gamma);
        const r = -prev * (G - 1) / (1 + gamma);
        real += r; infl += total - r; def += -by;
      }
      if (!ok) { skipped.push(c.name); continue; }
      const change = d[END] - d[DEBT_BASE];
      rows.push({ iso3: c.iso3, code: c.code, name: c.name, start: d[DEBT_BASE], end: d[END],
                  change, real, infl, def, sfa: change - real - infl - def });
    }
    rows.sort((p, q) => q.change - p.change);
    return { rows, skipped };
  }

  // ── 4. Business-cycle synchronisation ────────────────────────────────────
  const ERAS = {
    ex:   { label: '2000–2025 excl. 2020–21', years: y => !COVID.has(y) },
    all:  { label: '2000–2025 incl. pandemic', years: () => true },
    pre:  { label: '2000–2007', years: y => y <= 2007 },
    post: { label: '2010–2019', years: y => y >= 2010 && y <= 2019 },
  };
  function computeSync(eraKey) {
    const era = ERAS[eraKey];
    const years = [];
    for (let y = START; y <= END; y++) if (era.years(y)) years.push(y);
    const list = countries().filter(c => years.every(y => num(series(c.iso3, 'GDP_GROWTH')[y]) !== null));
    const vec = c => years.map(y => +series(c.iso3, 'GDP_GROWTH')[y]);
    const M = list.map(a => list.map(b => (a === b ? 1 : corr(vec(a), vec(b)))));
    const avgRow = M.map((row, i) => (row.reduce((s, v) => s + v, 0) - 1) / (row.length - 1));
    const order = list.map((c, i) => i).sort((i, j) => avgRow[j] - avgRow[i]);
    let s = 0, k = 0;
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) { s += M[i][j]; k++; }
    return { list: order.map(i => list[i]), M: order.map(i => order.map(j => M[i][j])),
             avgRow: order.map(i => avgRow[i]), mean: s / k, years };
  }
  const syncMean = (key) => computeSync(key).mean;

  // ── Render ────────────────────────────────────────────────────────────────
  function finding(label, value, note) {
    return `<div class="an-stat"><div class="an-stat__lbl">${label}</div><div class="an-stat__val">${value}</div>${note ? `<div class="an-stat__note">${note}</div>` : ''}</div>`;
  }

  function renderConvergenceText(cv) {
    const { fit, lambda, halfLife, pts } = cv;
    if (!fit) return '<p>Not enough data.</p>';
    const fastest = [...pts].sort((a, b) => b.y - a.y)[0];
    const chn = pts.find(p => p.iso3 === 'CHN'), usa = pts.find(p => p.iso3 === 'USA');
    return `
      <div class="an-stats">
        ${finding('β coefficient', `${f(fit.b, 2)}`, `s.e. ${fit.se.toFixed(2)} · t = ${f(fit.t, 1)}`)}
        ${finding('R²', fit.r2.toFixed(2), `${fit.n} economies`)}
        ${finding('Convergence speed', lambda ? `${(lambda * 100).toFixed(1)}%/yr` : 'n/a', halfLife ? `half-life ≈ ${Math.round(halfLife)} years` : '')}
      </div>
      <p class="an-read">Economies that started poorer grew faster. A G20 economy with half the 2000 income of a peer grew
      about <b>${(Math.abs(fit.b) * Math.log(2)).toFixed(1)} points a year faster</b> in real per-capita terms over ${cv.T} years.
      The implied speed of ${lambda ? (lambda * 100).toFixed(1) : '–'}% a year sits close to the ~2% Barro and Sala-i-Martin found
      across US states and OECD economies.${chn && usa ? ` ${esc(chn.name)} multiplied real income per head ${chn.multiple.toFixed(1)}×, against ${usa.multiple.toFixed(1)}× for the ${esc(usa.name)}.` : ''}
      ${fastest ? `${esc(fastest.name)} was the fastest at ${fastest.y.toFixed(1)}% a year.` : ''}
      This is conditional on being in the G20, which already selects for economies that took off, so it overstates global convergence.</p>`;
  }

  function renderOkunTable(rows) {
    return `<div class="table-scroll"><table class="rank-table an-table">
      <thead><tr><th>Economy</th><th>Okun coefficient</th><th>95% interval</th><th>R²</th><th>Stall speed</th></tr></thead>
      <tbody>${rows.map(r => `<tr class="${r.significant ? '' : 'an-muted'}">
        <td>${esc(r.name)}</td>
        <td><b>${f(r.b, 2)}</b></td>
        <td>${f(r.b - 1.96 * r.se, 2)} to ${f(r.b + 1.96 * r.se, 2)}</td>
        <td>${r.r2.toFixed(2)}</td>
        <td>${r.stall !== null ? `${Math.abs(r.stall) < 0.05 ? '0.0' : f(r.stall)}%` : '<span title="Slope not significantly negative">not identified</span>'}</td>
      </tr>`).join('')}</tbody></table></div>`;
  }

  function renderOkunText(rows) {
    const sig = rows.filter(r => r.significant);
    const top = rows[0];
    const flat = rows.filter(r => !r.significant).map(r => r.name);
    const usa = rows.find(r => r.iso3 === 'USA');
    return `
      <p class="an-read">${top ? `${esc(top.name)} has the most cyclical labour market: each extra point of growth cuts unemployment by about
      <b>${Math.abs(top.b).toFixed(2)} points</b>.` : ''} ${usa && usa !== top ? `The ${esc(usa.name)} sits at ${f(usa.b, 2)}, close to Okun's original estimate.` : ''}
      In ${sig.length} of ${rows.length} economies the link is statistically clear.
      ${flat.length ? `It is not in ${esc(flat.join(', '))}. There, measured unemployment barely moves with output, which fits large informal sectors,
      labour hoarding, or adjustment through hours and wages rather than jobs.` : ''}
      “Stall speed” is the growth rate at which unemployment holds steady, a rough read on potential growth.</p>`;
  }

  function renderDebtText(debt) {
    const { rows } = debt;
    const sum = k => rows.reduce((s, r) => s + r[k], 0) / rows.length;
    const biggestInfl = [...rows].sort((a, b) => a.infl - b.infl)[0];
    const biggestRise = rows[0];
    return `
      <div class="an-stats">
        ${finding('Avg. change', `${fs(sum('change'))} pp`, `${DEBT_BASE} to ${END}`)}
        ${finding('From deficits', `${fs(sum('def'))} pp`, 'overall balance, incl. interest')}
        ${finding('Inflation erosion', `${fs(sum('infl'))} pp`, 'CPI as deflator proxy')}
        ${finding('Real growth', `${fs(sum('real'))} pp`, '')}
      </div>
      <p class="an-read">Since ${DEBT_BASE} the typical G20 government ran deficits worth about ${Math.abs(sum('def')).toFixed(0)} points of GDP,
      yet debt ratios rose by only ${sum('change').toFixed(0)}. The post-2021 price surge did much of the work: inflation shaved roughly
      <b>${Math.abs(sum('infl')).toFixed(0)} points</b> off the average ratio, more than real growth did.
      ${biggestInfl ? `${esc(biggestInfl.name)} gained most from it (${f(biggestInfl.infl, 0)} pp).` : ''}
      ${biggestRise ? `${esc(biggestRise.name)} saw the largest rise (${fs(biggestRise.change, 0)} pp).` : ''}
      That relief is a one-off. With inflation back near target, holding ratios flat now needs primary surpluses or growth above the interest rate.</p>`;
  }

  function heatColor(v) {
    // Diverging: negative → red, zero → neutral, positive → ink/blue
    const a = Math.min(1, Math.abs(v));
    return v >= 0 ? `rgba(30,64,175,${(0.08 + 0.72 * a).toFixed(2)})` : `rgba(185,28,28,${(0.08 + 0.72 * a).toFixed(2)})`;
  }

  function renderSync(eraKey) {
    const s = computeSync(eraKey);
    const head = s.list.map(c => `<th title="${A.escapeAttr(c.name)}">${c.iso3}</th>`).join('');
    const body = s.list.map((a, i) => `<tr><th title="${A.escapeAttr(a.name)}">${esc(a.name)}</th>${s.M[i].map((v, j) => {
      const strong = Math.abs(v) >= 0.6;
      return `<td style="background:${i === j ? 'transparent' : heatColor(v)};color:${strong && i !== j ? '#fff' : 'inherit'}" title="${A.escapeAttr(`${a.name} × ${s.list[j].name}: ${v.toFixed(2)}`)}">${i === j ? '' : v.toFixed(1)}</td>`;
    }).join('')}<td class="an-heat__avg">${s.avgRow[i].toFixed(2)}</td></tr>`).join('');
    return `<div class="table-scroll"><table class="an-heat" aria-label="Correlation of annual real GDP growth between G20 economies, ${ERAS[eraKey].label}">
      <thead><tr><th></th>${head}<th>Avg</th></tr></thead><tbody>${body}</tbody></table></div>`;
  }

  function renderSyncText() {
    const pre = syncMean('pre'), post = syncMean('post'), all = syncMean('all'), ex = syncMean('ex');
    const s = computeSync('ex');
    const least = s.list[s.list.length - 1], most = s.list[0];
    return `
      <div class="an-stats">
        ${finding('2000–07', pre.toFixed(2), 'avg. pairwise correlation')}
        ${finding('2010–19', post.toFixed(2), '')}
        ${finding('Full, ex-pandemic', ex.toFixed(2), '')}
        ${finding('Full, with 2020–21', all.toFixed(2), '')}
      </div>
      <p class="an-read">In normal years the G20 shares only part of its cycle (average correlation ${ex.toFixed(2)}). Including 2020–21 lifts that
      to ${all.toFixed(2)}, because one common shock hit everyone at once. Co-movement ${post < pre ? 'fell' : 'rose'} from ${pre.toFixed(2)} before the
      financial crisis to ${post.toFixed(2)} in the 2010s. ${esc(most.name)} moves most with the group. ${esc(least.name)} moves least, so its
      cycle is driven more by domestic and commodity factors than by the global one.</p>`;
  }

  window.renderAnalysis = function renderAnalysis() {
    const cv = computeConvergence();
    const okun = computeOkun(_okunExCovid);
    const debt = computeDebt();
    return `
<div class="page-body an-page">
  <div class="an-hero">
    <div class="an-hero__eyebrow">Econometric analysis · estimated live from the dashboard's data</div>
    <h1 class="an-hero__title">Four tests of how G20 economies work</h1>
    <p class="an-hero__sub">Each panel takes a textbook relationship, estimates it on ${START} to ${END} annual data from the World Bank and IMF,
    and reports the coefficient, its uncertainty, and what it means. The numbers recompute every time the data refreshes.</p>
    <nav class="an-toc">
      <a href="#an-conv" onclick="event.preventDefault();document.getElementById('an-conv').scrollIntoView({behavior:'smooth'})">1 · Convergence</a>
      <a href="#an-okun" onclick="event.preventDefault();document.getElementById('an-okun').scrollIntoView({behavior:'smooth'})">2 · Okun's law</a>
      <a href="#an-debt" onclick="event.preventDefault();document.getElementById('an-debt').scrollIntoView({behavior:'smooth'})">3 · Debt dynamics</a>
      <a href="#an-sync" onclick="event.preventDefault();document.getElementById('an-sync').scrollIntoView({behavior:'smooth'})">4 · Cycle synchronisation</a>
    </nav>
  </div>

  <section class="panel mb-20 an-section" id="an-conv">
    <div class="panel__head"><div><span class="panel__title">1 · Are poorer G20 economies catching up?</span>
      <span class="panel__sub">β-convergence · real GDP per capita growth ${START}–${END} vs ${START} income (PPP)</span></div></div>
    <div class="panel__body an-grid">
      <div class="an-chart" style="height:400px"><canvas id="an-conv-chart" role="img" aria-label="Scatter of average real GDP per capita growth against starting income, with fitted regression line"></canvas></div>
      <div class="an-text">${renderConvergenceText(cv)}</div>
    </div>
    <div class="an-method">Growth per head each year = (1 + real GDP growth) ÷ (1 + population growth) − 1, compounded over ${cv.T} years. OLS of that average on ln(${START} GDP per capita, PPP). Speed λ solves β = −(1 − e<sup>−λT</sup>)/T.</div>
  </section>

  <section class="panel mb-20 an-section" id="an-okun">
    <div class="panel__head"><div><span class="panel__title">2 · How much does growth move unemployment?</span>
      <span class="panel__sub">Okun's law · Δ unemployment rate = a + b × real GDP growth</span></div>
      <div class="sec-head__actions">
        <button class="sec-head__tab ${_okunExCovid ? 'active' : ''}" onclick="analysisOkun(true)">Excl. 2020–21</button>
        <button class="sec-head__tab ${_okunExCovid ? '' : 'active'}" onclick="analysisOkun(false)">All years</button>
      </div></div>
    <div class="panel__body">
      <div class="an-chart" style="height:320px"><canvas id="an-okun-chart" role="img" aria-label="Okun coefficient by economy with 95 percent confidence intervals"></canvas></div>
      <div class="an-text" id="an-okun-text">${renderOkunText(okun)}</div>
      <div id="an-okun-table">${renderOkunTable(okun)}</div>
    </div>
    <div class="an-method">One OLS regression per economy on annual data, ${START + 1}–${END}. Bars show the slope b; whiskers its 95% interval (±1.96 s.e.). Grey = not significantly negative (|t| &lt; 2). Stall speed = −a/b, shown only where b is identified. Pandemic years are excluded by default because furlough schemes broke the usual output-jobs link. China's 2017 source switch is dropped so the splice is not read as a labour-market move. India is left out: its series joins modelled ILO estimates to a survey-based measure with a level break of about 2 points in 2022.</div>
  </section>

  <section class="panel mb-20 an-section" id="an-debt">
    <div class="panel__head"><div><span class="panel__title">3 · What moved government debt since ${DEBT_BASE}?</span>
      <span class="panel__sub">Debt-dynamics decomposition · gross general government debt, % of GDP</span></div></div>
    <div class="panel__body">
      <div class="an-text">${renderDebtText(debt)}</div>
      <div class="an-chart" style="height:${Math.max(360, debt.rows.length * 26 + 80)}px"><canvas id="an-debt-chart" role="img" aria-label="Stacked contributions to the change in debt-to-GDP by economy: real growth, inflation, deficits and stock-flow adjustment"></canvas></div>
    </div>
    <div class="an-method">Identity: Δd = −d<sub>t−1</sub>·γ/(1+γ) − balance + residual, summed over ${DEBT_BASE + 1}–${END}. γ is nominal growth from real growth and CPI inflation (a proxy for the GDP deflator). The balance is the overall fiscal balance, so interest costs sit inside “deficits”. The residual (stock-flow adjustment) captures asset purchases, exchange-rate revaluation, and the gap between CPI and the deflator. ${Object.values(DEBT_EXCLUDE).join(' and ')} are left out: high inflation and FX-linked debt make the residual larger than the signal. ${debt.skipped.length ? `Missing data: ${esc(debt.skipped.join(', '))}.` : ''}</div>
  </section>

  <section class="panel mb-20 an-section" id="an-sync">
    <div class="panel__head"><div><span class="panel__title">4 · Do G20 economies share one business cycle?</span>
      <span class="panel__sub">Pairwise correlation of annual real GDP growth</span></div>
      <div class="sec-head__actions">
        ${Object.entries(ERAS).map(([k, e]) => `<button class="sec-head__tab ${k === _syncEra ? 'active' : ''}" onclick="analysisSync('${k}', this)">${e.label}</button>`).join('')}
      </div></div>
    <div class="panel__body">
      <div class="an-text">${renderSyncText()}</div>
      <div id="an-sync-heat">${renderSync(_syncEra)}</div>
    </div>
    <div class="an-method">Pearson correlation of annual real GDP growth for every pair of economies. Blue = move together, red = move apart. Sorted by average correlation with the rest of the group. Short eras (8–10 years) give noisy pairwise estimates, so read the averages, not single cells. India reports GDP by fiscal year (April to March), which shifts its timing and lowers its measured correlation with calendar-year economies.</div>
  </section>
</div>`;
  };

  // ── Charts ────────────────────────────────────────────────────────────────
  function baseOpts(t) {
    return {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        datalabels: { display: false },
        tooltip: { backgroundColor: t.tooltipBg, titleColor: t.tooltipTitle, bodyColor: t.tooltipBody, padding: 10 },
      },
    };
  }
  const MONO = { family: "'Geist Mono', ui-monospace, monospace", size: 11 };

  function mountConvergence(t) {
    const el = document.getElementById('an-conv-chart');
    if (!el) return;
    const { pts, fit } = computeConvergence();
    const xs = pts.map(p => p.income);
    const lo = Math.min(...xs) * 0.85, hi = Math.max(...xs) * 1.15;
    const line = fit ? [lo, hi].map(v => ({ x: v, y: fit.a + fit.b * Math.log(v) })) : [];
    const opts = baseOpts(t);
    opts.plugins.datalabels = {
      display: ctx => ctx.datasetIndex === 0,
      align: 'right', offset: 4, color: t.text2, font: { ...MONO, size: 10 },
      formatter: (v) => v.iso3,
    };
    opts.plugins.tooltip.callbacks = {
      label: ctx => ctx.datasetIndex === 0
        ? `${ctx.raw.name}: ${ctx.raw.y.toFixed(2)}%/yr from $${Math.round(ctx.raw.x).toLocaleString()} in ${START}`
        : `Fitted line: β = ${fit.b.toFixed(2)}`,
    };
    opts.scales = {
      x: { type: 'logarithmic', min: lo, max: hi, grid: { color: t.grid },
           ticks: { color: t.tick, font: MONO, callback: v => [1000, 2000, 5000, 10000, 20000, 50000].includes(v) ? `$${v / 1000}k` : '' },
           title: { display: true, text: `GDP per capita ${START}, PPP int'l $ (log scale)`, color: t.tick, font: MONO } },
      y: { grid: { color: t.grid }, ticks: { color: t.tick, font: MONO, callback: v => `${v}%` },
           title: { display: true, text: `Avg. real GDP per capita growth, ${START}–${END}`, color: t.tick, font: MONO } },
    };
    _charts.conv = new Chart(el, {
      type: 'scatter',
      data: { datasets: [
        { data: pts.map(p => ({ x: p.income, y: p.y, name: p.name, iso3: p.iso3 })),
          backgroundColor: 'rgba(30,64,175,0.75)', borderColor: '#1e40af', pointRadius: 5, pointHoverRadius: 7 },
        { type: 'line', data: line, borderColor: 'rgba(185,28,28,0.9)', borderWidth: 2, borderDash: [6, 4], pointRadius: 0, fill: false },
      ] },
      options: opts,
      plugins: window.ChartDataLabels ? [window.ChartDataLabels] : [],
    });
  }

  function mountOkun(t) {
    const el = document.getElementById('an-okun-chart');
    if (!el) return;
    const rows = computeOkun(_okunExCovid);
    const ink = getComputedStyle(document.documentElement).getPropertyValue('--text-1').trim() || '#0A0A0A';
    const whiskers = {
      id: 'anWhiskers',
      afterDatasetsDraw(chart) {
        const { ctx, scales: { x, y } } = chart;
        ctx.save();
        ctx.strokeStyle = ink; ctx.lineWidth = 1.2;
        rows.forEach((r, i) => {
          const cx = x.getPixelForValue(i);
          const y1 = y.getPixelForValue(r.b - 1.96 * r.se), y2 = y.getPixelForValue(r.b + 1.96 * r.se);
          ctx.beginPath(); ctx.moveTo(cx, y1); ctx.lineTo(cx, y2);
          ctx.moveTo(cx - 4, y1); ctx.lineTo(cx + 4, y1); ctx.moveTo(cx - 4, y2); ctx.lineTo(cx + 4, y2);
          ctx.stroke();
        });
        ctx.restore();
      },
    };
    const opts = baseOpts(t);
    opts.plugins.tooltip.callbacks = {
      label: ctx => {
        const r = rows[ctx.dataIndex];
        return [`b = ${r.b.toFixed(2)} (95%: ${(r.b - 1.96 * r.se).toFixed(2)} to ${(r.b + 1.96 * r.se).toFixed(2)})`,
                `R² = ${r.r2.toFixed(2)} · n = ${r.n}`,
                r.stall !== null ? `Stall speed ≈ ${r.stall.toFixed(1)}% growth` : 'Stall speed not identified'];
      },
    };
    opts.scales = {
      x: { grid: { display: false }, ticks: { color: t.tick, font: MONO } },
      y: { grid: { color: t.grid }, ticks: { color: t.tick, font: MONO },
           title: { display: true, text: 'pp change in unemployment per 1 pp of growth', color: t.tick, font: MONO } },
    };
    _charts.okun = new Chart(el, {
      type: 'bar',
      data: { labels: rows.map(r => r.iso3), datasets: [{
        data: rows.map(r => r.b),
        backgroundColor: rows.map(r => (r.significant ? 'rgba(30,64,175,0.8)' : 'rgba(140,140,140,0.45)')),
        borderRadius: 3, barPercentage: 0.7,
      }] },
      options: opts,
      plugins: [whiskers],
    });
  }

  function mountDebt(t) {
    const el = document.getElementById('an-debt-chart');
    if (!el) return;
    const { rows } = computeDebt();
    const opts = baseOpts(t);
    opts.indexAxis = 'y';
    opts.plugins.legend = { display: true, position: 'top', align: 'start',
      labels: { color: t.text2, font: MONO, boxWidth: 12, padding: 14 } };
    opts.plugins.tooltip.callbacks = {
      title: items => {
        const r = rows[items[0].dataIndex];
        return `${r.name}: ${r.start.toFixed(0)}% → ${r.end.toFixed(0)}% (${r.change >= 0 ? '+' : ''}${r.change.toFixed(1)} pp)`;
      },
      label: ctx => `${ctx.dataset.label}: ${ctx.raw >= 0 ? '+' : ''}${(+ctx.raw).toFixed(1)} pp`,
    };
    opts.scales = {
      x: { stacked: true, grid: { color: t.grid }, ticks: { color: t.tick, font: MONO, callback: v => `${v > 0 ? '+' : ''}${v}` },
           title: { display: true, text: `Contribution to change in debt/GDP, ${DEBT_BASE}–${END} (pp)`, color: t.tick, font: MONO } },
      y: { stacked: true, grid: { display: false }, ticks: { color: t.text2, font: MONO } },
    };
    const ink = getComputedStyle(document.documentElement).getPropertyValue('--text-1').trim() || '#0A0A0A';
    _charts.debt = new Chart(el, {
      data: {
        labels: rows.map(r => r.name),
        datasets: [
          { type: 'bar', label: 'Deficits', data: rows.map(r => r.def), backgroundColor: 'rgba(185,28,28,0.78)', stack: 's' },
          { type: 'bar', label: 'Inflation', data: rows.map(r => r.infl), backgroundColor: 'rgba(161,98,7,0.75)', stack: 's' },
          { type: 'bar', label: 'Real growth', data: rows.map(r => r.real), backgroundColor: 'rgba(4,120,87,0.75)', stack: 's' },
          { type: 'bar', label: 'Stock-flow residual', data: rows.map(r => r.sfa), backgroundColor: 'rgba(140,140,140,0.5)', stack: 's' },
          { type: 'scatter', label: 'Net change', data: rows.map((r, i) => ({ x: r.change, y: r.name })),
            backgroundColor: ink, borderColor: '#fff', borderWidth: 1.5, pointRadius: 6, pointStyle: 'rectRot' },
        ],
      },
      options: opts,
    });
  }

  window.mountAnalysisCharts = function mountAnalysisCharts() {
    if (!window.Chart) { setTimeout(mountAnalysisCharts, 200); return; }
    Object.keys(_charts).forEach(k => { try { _charts[k].destroy(); } catch (_) {} delete _charts[k]; });
    const t = A.chartTheme();
    mountConvergence(t);
    mountOkun(t);
    mountDebt(t);
  };

  window.analysisOkun = function analysisOkun(exCovid) {
    _okunExCovid = exCovid;
    const rows = computeOkun(exCovid);
    document.getElementById('an-okun-text').innerHTML = renderOkunText(rows);
    document.getElementById('an-okun-table').innerHTML = renderOkunTable(rows);
    document.querySelectorAll('#an-okun .sec-head__tab').forEach((b, i) => b.classList.toggle('active', (i === 0) === exCovid));
    if (_charts.okun) { try { _charts.okun.destroy(); } catch (_) {} }
    mountOkun(A.chartTheme());
  };

  window.analysisSync = function analysisSync(key, btn) {
    _syncEra = key;
    document.getElementById('an-sync-heat').innerHTML = renderSync(key);
    document.querySelectorAll('#an-sync .sec-head__tab').forEach(b => b.classList.toggle('active', b === btn));
  };

  // Exposed for tests
  window.G20Analysis = { ols, corr, computeConvergence, computeOkun, computeDebt, computeSync };
})();
