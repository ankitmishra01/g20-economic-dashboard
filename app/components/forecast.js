// Forecast inference — pure JS. The model/data produce every number; the UI narrates.
// No LLM, no API key.
//
//  • computeGrowthForecast(iso3, overrides) — 1-yr ridge GDP-growth forecast (window.G20_MODEL)
//  • computeYieldCurve(iso3)                — descriptive term-spread read (window.G20_TERM_SPREAD)
//  • renderForecastStrip(iso3)              — country "Near-term outlook" panel
//  • scenario simulator                     — shock inputs, watch the growth forecast move
//  • renderTrackRecord(mountId)             — growth-forecast backtest panel
//
// Honest scope: we show the yield-curve term spread as a DESCRIPTIVE, literature-backed
// indicator (an inverted curve has preceded past recessions), NOT a model-implied
// probability — the annual-data recession model's out-of-sample skill is weak (AUC ~0.58),
// so fundamentals fragility (window.computeRiskScore) is the actual risk gauge.
//
// overrides = { GROWTH:+1, INFLATION:+2, FISCAL_BAL:-2, DEBT_GDP:+5 } are additive deltas
// on the current fundamentals, used by the scenario simulator.

(function () {
  const FUND = ['GROWTH', 'MOMENTUM', 'FISCAL_BAL', 'DEBT_GDP', 'CURRENT_ACC', 'UNEMPLOYMENT', 'INFLATION'];

  // Most recent year with all fundamentals (from Supabase via G20Data). Term spread is
  // read separately from the committed static asset window.G20_TERM_SPREAD.
  function baseFeatures(iso3) {
    const D = window.G20Data; if (!D) return null;
    const ser = {};
    for (const k of ['GDP_GROWTH', 'FISCAL_BAL', 'DEBT_GDP', 'CURRENT_ACC', 'UNEMPLOYMENT', 'INFLATION']) {
      const m = {}; (D.getSeries(iso3, k, 2000) || []).forEach(d => { m[d.year] = d.value; });
      ser[k] = m;
    }
    const g = ser.GDP_GROWTH;
    const years = Object.keys(g).map(Number).sort((a, b) => b - a);
    for (const t of years) {
      const fund = [g[t], g[t] - g[t - 2], ser.FISCAL_BAL[t], ser.DEBT_GDP[t], ser.CURRENT_ACC[t], ser.UNEMPLOYMENT[t], ser.INFLATION[t]];
      if (fund.every(v => v != null && !Number.isNaN(v))) {
        const TS = window.G20_TERM_SPREAD && window.G20_TERM_SPREAD[iso3];
        let termSpread = null, tsYear = null;
        if (TS) {
          if (TS[t] != null) { termSpread = TS[t]; tsYear = t; }
          else { const ty = Object.keys(TS).map(Number).sort((a, b) => b - a)[0]; if (ty != null) { termSpread = TS[ty]; tsYear = ty; } }
        }
        return { baseYear: t, fund, termSpread, tsYear };
      }
    }
    return null;
  }

  function withOverrides(base, ov) {
    const fund = base.fund.slice();
    if (ov) { FUND.forEach((name, i) => { if (ov[name] != null) fund[i] += ov[name]; }); if (ov.GROWTH != null) fund[1] += ov.GROWTH; }
    return fund;
  }
  function linear(model, vec) {
    let z = model.intercept;
    for (let j = 0; j < vec.length; j++) z += model.coef[j] * ((vec[j] - model.mu[j]) / (model.sigma[j] || 1));
    return z;
  }

  window.computeGrowthForecast = function (iso3, overrides) {
    const M = window.G20_MODEL; const b = baseFeatures(iso3);
    if (!M || !b) return null;
    return {
      baseYear: b.baseYear, targetYear: b.baseYear + 1,
      modelForecast: linear(M.growth, withOverrides(b, overrides)),
      latestActual: b.fund[0],
      rmse: M.meta?.growthRMSE ?? null,
      beatsPersistence: M.meta?.growthBeatsPersistence ?? null,
    };
  };

  // Descriptive yield-curve read (no probability). Covered = term spread exists.
  window.computeYieldCurve = function (iso3) {
    const b = baseFeatures(iso3);
    if (!b || b.termSpread == null) return { covered: false };
    const s = b.termSpread;
    const label = s <= -0.25 ? 'inverted' : s < 0.5 ? 'flat' : 'positively sloped';
    return { covered: true, spread: s, year: b.tsYear, label,
      color: s <= -0.25 ? 'var(--neg)' : s < 0.5 ? 'var(--warn)' : 'var(--pos)' };
  };

  const fmtPct = v => (v == null ? '—' : (v >= 0 ? '+' : '') + v.toFixed(1) + '%');
  const fmtTs = v => (v == null ? '—' : (v >= 0 ? '+' : '') + v.toFixed(2) + 'pp');
  const fragColor = s => s >= 50 ? 'var(--neg)' : s >= 30 ? 'var(--warn)' : s >= 15 ? '#A16207' : 'var(--pos)';

  // ── Country "Near-term outlook" panel ──────────────────────────────────────────
  window.renderForecastStrip = function (iso3) {
    const f = window.computeGrowthForecast(iso3);
    const yc = window.computeYieldCurve(iso3);
    const frag = window.computeRiskScore ? window.computeRiskScore(iso3) : null;
    if (!f && !frag) return '';
    const M = window.G20_MODEL;

    const cell = (label, value, sub, color) => `
      <div style="flex:1;min-width:128px">
        <div class="kpi-tile__lbl">${label}</div>
        <div class="kpi-tile__val" style="font-size:20px;margin-top:6px;color:${color || 'var(--text-1)'}">${value}</div>
        <div class="kpi-tile__delta">${sub}</div>
      </div>`;

    const growthCell = f ? cell('Growth forecast', fmtPct(f.modelForecast),
      `${f.targetYear} · ridge ±${f.rmse}pp`, f.modelForecast < 0 ? 'var(--neg)' : f.modelForecast >= 4 ? 'var(--pos)' : 'var(--text-1)') : '';
    const actualCell = f ? cell('Latest actual', fmtPct(f.latestActual), `${f.baseYear} · persistence base`) : '';
    const fragCell = frag ? cell('Fundamentals fragility', `${frag.score}<span class="unit" style="font-size:12px">/100</span>`,
      `${frag.label}${frag.signals.length ? ' · ' + frag.signals.slice(0, 2).join(' · ') : ''}`, fragColor(frag.score)) : '';
    const ycCell = yc.covered ? cell('Yield curve (10y−3m)', fmtTs(yc.spread), `${yc.label} · ${yc.year}`, yc.color) : '';

    const ycNote = yc.covered
      ? `The yield-curve term spread is a <strong>descriptive</strong> indicator: an inverted curve has preceded past
         downturns (the US curve inverted ahead of 2008), but on annual data we make no calibrated probability claim, so
         fundamentals fragility is the risk gauge.`
      : `No keyless yield-curve series for this economy; fundamentals fragility is the risk gauge.`;

    return `
  <div class="sec-head" style="margin-top:4px">
    <div class="sec-head__title">Near-term outlook <span class="sec-head__sub">1-yr growth forecast · fragility · scenario test</span></div>
  </div>
  <div class="panel" style="margin-bottom:8px">
    <div class="panel__body" style="display:flex;gap:24px;flex-wrap:wrap">
      ${growthCell}${actualCell}${fragCell}${ycCell}
    </div>
  </div>
  ${renderScenario(iso3)}
  <div style="font-family:var(--font-mono);font-size:10px;color:var(--text-4);line-height:1.6;margin:8px 0 20px">
    Growth forecast beats a naive persistence baseline by ${M?.meta?.growthBeatsPersistence ?? '—'}pp out-of-sample
    (leave-one-year-out). ${ycNote} Trained on the 2000–2025 World Bank / IMF / FRED panel; every figure is
    model- or data-generated, never LLM-written.
  </div>`;
  };

  // ── Scenario simulator (drives the growth forecast) ────────────────────────────
  let _scenario = {}; let _scenarioIso = null;
  const SHOCKS = [
    { key: 'GROWTH',     label: 'Growth',      step: 1, unit: 'pp', min: -6, max: 6 },
    { key: 'INFLATION',  label: 'Inflation',   step: 1, unit: 'pp', min: -5, max: 10 },
    { key: 'FISCAL_BAL', label: 'Fiscal bal.', step: 1, unit: 'pp', min: -8, max: 5 },
    { key: 'DEBT_GDP',   label: 'Debt/GDP',    step: 5, unit: 'pp', min: -30, max: 50 },
  ];

  function renderScenario(iso3) {
    _scenario = {}; _scenarioIso = iso3;
    const steppers = SHOCKS.map(s => `
      <div style="display:flex;align-items:center;gap:8px;font-family:var(--font-mono);font-size:11px">
        <span style="width:78px;color:var(--text-3)">${s.label}</span>
        <button class="sec-head__tab" style="padding:2px 8px" onclick="scenarioStep('${s.key}',${-s.step},${s.min},${s.max})">−</button>
        <span id="sc-${s.key}" style="width:46px;text-align:center;color:var(--text-1)">0${s.unit}</span>
        <button class="sec-head__tab" style="padding:2px 8px" onclick="scenarioStep('${s.key}',${s.step},${s.min},${s.max})">+</button>
      </div>`).join('');
    return `
  <div class="panel" style="margin-bottom:8px">
    <div class="panel__head"><span class="panel__title">Scenario test</span><span class="panel__meta">shock inputs · live</span></div>
    <div class="panel__body scenario-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:16px 28px;align-items:start">
      <div style="display:flex;flex-direction:column;gap:8px">
        ${steppers}
        <button class="sec-head__tab" style="margin-top:4px;align-self:flex-start" onclick="scenarioReset()">Reset</button>
      </div>
      <div id="scenario-out" style="font-size:12.5px;line-height:1.6;color:var(--text-2)">${scenarioNarrative(iso3)}</div>
    </div>
  </div>`;
  }
  function scenarioNarrative(iso3) {
    const ov = Object.keys(_scenario).length ? _scenario : null;
    const baseG = window.computeGrowthForecast(iso3);
    const newG = window.computeGrowthForecast(iso3, ov);
    if (!newG) return '';
    const line = `1-year growth forecast <strong>${fmtPct(baseG.modelForecast)}</strong>` +
      (ov ? ` → <strong style="color:${newG.modelForecast < baseG.modelForecast ? 'var(--neg)' : 'var(--pos)'}">${fmtPct(newG.modelForecast)}</strong>` : '');
    const hint = ov ? '' : `<br><span style="color:var(--text-4);font-size:11px">Shock the inputs to see the growth forecast move.</span>`;
    return line + hint;
  }
  window.scenarioStep = function (key, delta, min, max) {
    const cur = (_scenario[key] || 0) + delta;
    _scenario[key] = Math.max(min, Math.min(max, +cur.toFixed(2)));
    if (Math.abs(_scenario[key]) < 1e-9) delete _scenario[key];
    const sh = SHOCKS.find(s => s.key === key); const el = document.getElementById('sc-' + key);
    if (el) { const v = _scenario[key] || 0; el.textContent = (v > 0 ? '+' : '') + v + sh.unit; }
    const out = document.getElementById('scenario-out'); if (out && _scenarioIso) out.innerHTML = scenarioNarrative(_scenarioIso);
  };
  window.scenarioReset = function () {
    _scenario = {};
    SHOCKS.forEach(s => { const el = document.getElementById('sc-' + s.key); if (el) el.textContent = '0' + s.unit; });
    const out = document.getElementById('scenario-out'); if (out && _scenarioIso) out.innerHTML = scenarioNarrative(_scenarioIso);
  };

  // ── Track record (growth-forecast backtest) ────────────────────────────────────
  window.renderTrackRecord = function (mountId) {
    const el = document.getElementById(mountId); if (!el) return;
    const M = window.G20_MODEL;
    const bt = ((M && M.backtest) || []).filter(b => b.growthRMSE != null);
    if (!bt.length) { el.innerHTML = '<div class="panel__body" style="color:var(--text-4);font-size:12px">Track record unavailable.</div>'; return; }
    const avgRMSE = bt.reduce((s, b) => s + b.growthRMSE, 0) / bt.length;
    const persist = M?.meta?.growthPersistenceRMSE ?? null;
    el.innerHTML = `
      <div class="panel__head"><span class="panel__title">Forecast track record</span><span class="panel__meta">out-of-sample backtest</span></div>
      <div class="panel__body">
        <div style="display:flex;gap:28px;flex-wrap:wrap;margin-bottom:14px">
          <div><div class="kpi-tile__lbl">Growth RMSE</div><div class="kpi-tile__val" style="font-size:20px">${avgRMSE.toFixed(2)}<span class="unit" style="font-size:12px">pp</span></div><div class="kpi-tile__delta">1-year-ahead, out-of-sample</div></div>
          <div><div class="kpi-tile__lbl">Persistence baseline</div><div class="kpi-tile__val" style="font-size:20px">${persist != null ? persist.toFixed(2) : '—'}<span class="unit" style="font-size:12px">pp</span></div><div class="kpi-tile__delta">naive "next = latest"</div></div>
          <div><div class="kpi-tile__lbl">Model edge</div><div class="kpi-tile__val" style="font-size:20px;color:var(--pos)">${persist != null ? '−' + (persist - avgRMSE).toFixed(2) : '—'}<span class="unit" style="font-size:12px">pp</span></div><div class="kpi-tile__delta">lower error than persistence</div></div>
        </div>
        <div style="font-family:var(--font-mono);font-size:10px;color:var(--text-4);line-height:1.6">
          Leave-one-year-out backtest of the 1-year growth forecast over ${bt.length} years
          (${bt[0]?.forecastYear}–${bt[bt.length - 1]?.forecastYear}), versus a persistence baseline.
          The live forecast log grows each month for a forward record.
        </div>
      </div>`;
  };
})();
