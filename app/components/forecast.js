// Forecast inference — pure JS over window.G20_MODEL (generated offline by
// sync/train-forecast.js). The model produces every number; the UI narrates them.
// No LLM, no API key.
//
//  • computeGrowthForecast(iso3, overrides)      — 1-yr ridge GDP-growth forecast
//  • computeRecessionProbability(iso3, overrides)— 1-yr logistic, yield-curve covered
//      economies only; cyclical AUC ~0.78 (all-period 0.64 — COVID is unpredictable)
//  • renderForecastStrip(iso3)                   — country "Near-term outlook" panel
//  • scenario simulator                          — shock inputs, watch it move live
//  • renderTrackRecord()                         — historical backtest panel
//
// overrides = { GROWTH:+1, TERM_SPREAD:-1, INFLATION:+2, FISCAL_BAL:-2, DEBT_GDP:+5 }
// are additive deltas on the current features (used by the scenario simulator).

(function () {
  const FUND = ['GROWTH', 'MOMENTUM', 'FISCAL_BAL', 'DEBT_GDP', 'CURRENT_ACC', 'UNEMPLOYMENT', 'INFLATION'];

  // Most recent year with all fundamentals; term spread from the same/last year.
  function baseFeatures(iso3) {
    const D = window.G20Data; if (!D) return null;
    const ser = {};
    for (const k of ['GDP_GROWTH', 'FISCAL_BAL', 'DEBT_GDP', 'CURRENT_ACC', 'UNEMPLOYMENT', 'INFLATION', 'TERM_SPREAD']) {
      const m = {}; (D.getSeries(iso3, k, 2000) || []).forEach(d => { m[d.year] = d.value; });
      ser[k] = m;
    }
    const g = ser.GDP_GROWTH;
    const years = Object.keys(g).map(Number).sort((a, b) => b - a);
    for (const t of years) {
      const fund = [g[t], g[t] - g[t - 2], ser.FISCAL_BAL[t], ser.DEBT_GDP[t], ser.CURRENT_ACC[t], ser.UNEMPLOYMENT[t], ser.INFLATION[t]];
      if (fund.every(v => v != null && !Number.isNaN(v))) {
        // term spread: same year if present, else most recent available
        let ts = ser.TERM_SPREAD[t];
        if (ts == null) {
          const ty = Object.keys(ser.TERM_SPREAD).map(Number).sort((a, b) => b - a)[0];
          ts = ty != null ? ser.TERM_SPREAD[ty] : null;
        }
        return { baseYear: t, fund, termSpread: ts != null ? ts : null };
      }
    }
    return null;
  }

  // Apply additive overrides (by feature name) to a copy of the feature set.
  function withOverrides(base, ov) {
    if (!ov) return { fund: base.fund.slice(), termSpread: base.termSpread };
    const fund = base.fund.slice();
    FUND.forEach((name, i) => { if (ov[name] != null) fund[i] += ov[name]; });
    // momentum tracks a growth shock so the curve stays internally consistent
    if (ov.GROWTH != null) fund[1] += ov.GROWTH;
    let ts = base.termSpread;
    if (ts != null && ov.TERM_SPREAD != null) ts += ov.TERM_SPREAD;
    return { fund, termSpread: ts };
  }

  const sigmoid = z => 1 / (1 + Math.exp(-z));
  function linear(model, vec) {
    let z = model.intercept;
    for (let j = 0; j < vec.length; j++) z += model.coef[j] * ((vec[j] - model.mu[j]) / (model.sigma[j] || 1));
    return z;
  }

  window.computeGrowthForecast = function (iso3, overrides) {
    const M = window.G20_MODEL; const b = baseFeatures(iso3);
    if (!M || !b) return null;
    const f = withOverrides(b, overrides);
    return {
      baseYear: b.baseYear, targetYear: b.baseYear + 1,
      modelForecast: linear(M.growth, f.fund),
      latestActual: b.fund[0],
      rmse: M.meta?.growthRMSE ?? null,
      beatsPersistence: M.meta?.growthBeatsPersistence ?? null,
    };
  };

  // Recession probability for yield-curve-covered economies; else { covered:false }.
  window.computeRecessionProbability = function (iso3, overrides) {
    const M = window.G20_MODEL; const b = baseFeatures(iso3);
    if (!M || !b) return { covered: false };
    const covered = (M.recession.covered || []).includes(iso3) && b.termSpread != null;
    if (!covered) return { covered: false, termSpread: b.termSpread };
    const f = withOverrides(b, overrides);
    const vec = [...f.fund, f.termSpread];
    return {
      covered: true,
      probability: sigmoid(linear(M.recession, vec)),
      termSpread: f.termSpread,
      auc: M.recession.auc, aucCyclical: M.recession.aucCyclical ?? M.meta?.recAUCCyclical,
    };
  };

  function band(p) {
    return p >= 0.5 ? { label: 'High', color: 'var(--neg)' }
      : p >= 0.3 ? { label: 'Elevated', color: 'var(--warn)' }
      : p >= 0.15 ? { label: 'Watch', color: '#A16207' }
      : { label: 'Low', color: 'var(--pos)' };
  }
  const fmtPct = v => (v == null ? '—' : (v >= 0 ? '+' : '') + v.toFixed(1) + '%');
  const fmtTs = v => (v == null ? '—' : (v >= 0 ? '+' : '') + v.toFixed(2) + 'pp');

  // ── Country "Near-term outlook" panel ──────────────────────────────────────────
  window.renderForecastStrip = function (iso3) {
    const f = window.computeGrowthForecast(iso3);
    const rec = window.computeRecessionProbability(iso3);
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

    let recCell, discl;
    if (rec.covered) {
      const bd = band(rec.probability);
      recCell = cell('Recession probability', `${Math.round(rec.probability * 100)}%`,
        `${bd.label} · yield curve ${fmtTs(rec.termSpread)}`, bd.color);
      discl = `Recession probability: 1-year-ahead logistic driven by the yield-curve term spread (10y minus 3m).
        Predicts <strong>cyclical</strong> recessions at AUC ${rec.aucCyclical} out-of-sample; the all-period figure
        (${rec.auc}) is lower because no curve-based model can foresee exogenous shocks such as the 2020 pandemic.`;
    } else {
      recCell = frag ? cell('Fundamentals fragility', `${frag.score}<span class="unit" style="font-size:12px">/100</span>`,
        `${frag.label} · yield-curve data n/a`,
        frag.score >= 50 ? 'var(--neg)' : frag.score >= 30 ? 'var(--warn)' : 'var(--pos)') : '';
      discl = `This economy has no keyless yield-curve series, so we show the descriptive
        <strong>fundamentals fragility</strong> index (exposure if a shock hits), not a recession probability.`;
    }

    return `
  <div class="sec-head" style="margin-top:4px">
    <div class="sec-head__title">Near-term outlook <span class="sec-head__sub">1-yr forecast · recession risk · scenario test</span></div>
  </div>
  <div class="panel" style="margin-bottom:8px">
    <div class="panel__body" style="display:flex;gap:24px;flex-wrap:wrap">
      ${growthCell}${actualCell}${recCell}
    </div>
  </div>
  ${renderScenario(iso3)}
  <div style="font-family:var(--font-mono);font-size:10px;color:var(--text-4);line-height:1.6;margin:8px 0 20px">
    Growth forecast beats a naive persistence baseline by ${M?.meta?.growthBeatsPersistence ?? '—'}pp out-of-sample
    (leave-one-year-out). ${discl} Models trained on the 2000–2025 World Bank / IMF / FRED panel; every figure is
    model-generated, never LLM-written.
  </div>`;
  };

  // ── Scenario simulator ─────────────────────────────────────────────────────────
  // Module-level shock state, keyed by feature name (additive deltas).
  let _scenario = {};
  let _scenarioIso = null;

  const SHOCKS = [
    { key: 'TERM_SPREAD', label: 'Yield curve', step: 0.5, unit: 'pp', min: -3, max: 3 },
    { key: 'GROWTH',      label: 'Growth',      step: 1,   unit: 'pp', min: -6, max: 6 },
    { key: 'INFLATION',   label: 'Inflation',   step: 1,   unit: 'pp', min: -5, max: 10 },
    { key: 'FISCAL_BAL',  label: 'Fiscal bal.', step: 1,   unit: 'pp', min: -8, max: 5 },
    { key: 'DEBT_GDP',    label: 'Debt/GDP',    step: 5,   unit: 'pp', min: -30, max: 50 },
  ];

  function renderScenario(iso3) {
    _scenario = {}; _scenarioIso = iso3;
    const covered = window.computeRecessionProbability(iso3).covered;
    const steppers = SHOCKS
      .filter(s => s.key !== 'TERM_SPREAD' || covered) // term-spread shock only where it applies
      .map(s => `
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
    const newG  = window.computeGrowthForecast(iso3, ov);
    const baseR = window.computeRecessionProbability(iso3);
    const newR  = window.computeRecessionProbability(iso3, ov);
    if (!newG) return '';

    const gLine = `Growth forecast <strong>${fmtPct(baseG.modelForecast)}</strong>` +
      (ov ? ` → <strong style="color:${newG.modelForecast < baseG.modelForecast ? 'var(--neg)' : 'var(--pos)'}">${fmtPct(newG.modelForecast)}</strong>` : '');

    let rLine = '';
    if (baseR.covered) {
      const bp = Math.round(baseR.probability * 100), np = Math.round(newR.probability * 100);
      rLine = `<br>Recession probability <strong>${bp}%</strong>` +
        (ov ? ` → <strong style="color:${np > bp ? 'var(--neg)' : 'var(--pos)'}">${np}%</strong>` : '');
    }
    const hint = ov ? '' : `<br><span style="color:var(--text-4);font-size:11px">Adjust the inputs to see the forecast and recession risk move.</span>`;
    return gLine + rLine + hint;
  }

  window.scenarioStep = function (key, delta, min, max) {
    const cur = (_scenario[key] || 0) + delta;
    _scenario[key] = Math.max(min, Math.min(max, +cur.toFixed(2)));
    if (Math.abs(_scenario[key]) < 1e-9) delete _scenario[key];
    const sh = SHOCKS.find(s => s.key === key);
    const el = document.getElementById('sc-' + key);
    if (el) { const v = _scenario[key] || 0; el.textContent = (v > 0 ? '+' : '') + v + sh.unit; }
    const out = document.getElementById('scenario-out');
    if (out && _scenarioIso) out.innerHTML = scenarioNarrative(_scenarioIso);
  };
  window.scenarioReset = function () {
    _scenario = {};
    SHOCKS.forEach(s => { const el = document.getElementById('sc-' + s.key); if (el) el.textContent = '0' + s.unit; });
    const out = document.getElementById('scenario-out');
    if (out && _scenarioIso) out.innerHTML = scenarioNarrative(_scenarioIso);
  };

  // ── Track record (historical backtest) ─────────────────────────────────────────
  window.renderTrackRecord = function (mountId) {
    const el = document.getElementById(mountId); if (!el) return;
    const M = window.G20_MODEL;
    const bt = ((M && M.backtest) || []).filter(b => b.growthRMSE != null);
    if (!bt.length) { el.innerHTML = '<div class="panel__body" style="color:var(--text-4);font-size:12px">Track record unavailable.</div>'; return; }
    const avgRMSE = bt.length ? (bt.reduce((s, b) => s + b.growthRMSE, 0) / bt.length) : null;
    const totalRec = bt.reduce((s, b) => s + (b.recessions || 0), 0);
    const totalHit = bt.reduce((s, b) => s + (b.recHits || 0), 0);

    el.innerHTML = `
      <div class="panel__head"><span class="panel__title">Forecast track record</span>
        <span class="panel__meta">out-of-sample backtest</span></div>
      <div class="panel__body">
        <div style="display:flex;gap:28px;flex-wrap:wrap;margin-bottom:14px">
          <div><div class="kpi-tile__lbl">Growth RMSE</div><div class="kpi-tile__val" style="font-size:20px">${avgRMSE ? avgRMSE.toFixed(2) : '—'}<span class="unit" style="font-size:12px">pp</span></div><div class="kpi-tile__delta">vs persistence ${M?.meta?.growthPersistenceRMSE ?? '—'}pp</div></div>
          <div><div class="kpi-tile__lbl">Recession hit rate</div><div class="kpi-tile__val" style="font-size:20px">${totalRec ? Math.round(100 * totalHit / totalRec) : 0}%</div><div class="kpi-tile__delta">${totalHit}/${totalRec} cyclical downturns flagged</div></div>
          <div><div class="kpi-tile__lbl">Recession AUC</div><div class="kpi-tile__val" style="font-size:20px">${M?.recession?.aucCyclical ?? '—'}</div><div class="kpi-tile__delta">cyclical · ${M?.recession?.auc ?? '—'} all-period</div></div>
        </div>
        <div style="font-family:var(--font-mono);font-size:10px;color:var(--text-4);line-height:1.6">
          Leave-one-year-out backtest over ${bt.length} forecast years (${bt[0]?.forecastYear}–${bt[bt.length - 1]?.forecastYear}).
          Recession hit rate counts actual cyclical downturns the yield-curve model flagged (prob &gt; 50%) the year before.
          The live forecast log grows each month for a forward track record.
        </div>
      </div>`;
  };
})();
