// Forecast inference — pure JS, reads coefficients from window.G20_MODEL
// (generated offline by sync/train-forecast.js). The model produces the numbers;
// the UI only reads and narrates them. No LLM is involved in the figures.
//
// Honest scope (v1):
//   • computeGrowthForecast(iso3) — 1-year-ahead GDP growth (ridge model), shown
//     alongside the IMF projection, never instead of it.
//   • The fundamentals "fragility" score (window.computeRiskScore) is a DESCRIPTIVE
//     vulnerability measure, not a recession forecast. A genuinely predictive
//     recession probability needs leading indicators (yield-curve spread, PMIs) —
//     a planned follow-up. We do not surface the experimental recession logit here
//     because its out-of-sample skill (CV AUC ~0.54) is no better than chance.

(function () {
  const FEATURE_KEYS = ['GDP_GROWTH', null /*momentum, derived*/, 'FISCAL_BAL', 'DEBT_GDP', 'CURRENT_ACC', 'UNEMPLOYMENT', 'INFLATION'];

  // Find the most recent year where all level-features and growth_{t-2} exist,
  // mirroring the training-time feature construction in sync/train-forecast.js.
  function buildFeatures(iso3) {
    const D = window.G20Data;
    if (!D) return null;
    const series = {};
    for (const k of ['GDP_GROWTH', 'FISCAL_BAL', 'DEBT_GDP', 'CURRENT_ACC', 'UNEMPLOYMENT', 'INFLATION']) {
      const map = {};
      (D.getSeries(iso3, k, 2000) || []).forEach(d => { map[d.year] = d.value; });
      series[k] = map;
    }
    const g = series.GDP_GROWTH;
    const years = Object.keys(g).map(Number).sort((a, b) => b - a);
    for (const t of years) {
      const growth = g[t], growth2 = g[t - 2];
      const fiscal = series.FISCAL_BAL[t], debt = series.DEBT_GDP[t],
            ca = series.CURRENT_ACC[t], unemp = series.UNEMPLOYMENT[t], inf = series.INFLATION[t];
      if ([growth, growth2, fiscal, debt, ca, unemp, inf].every(v => v != null && !Number.isNaN(v))) {
        return { baseYear: t, x: [growth, growth - growth2, fiscal, debt, ca, unemp, inf] };
      }
    }
    return null;
  }

  function applyLinear(model, x) {
    // standardise then dot with coef + intercept
    let z = model.intercept;
    for (let j = 0; j < x.length; j++) {
      const xs = (x[j] - model.mu[j]) / (model.sigma[j] || 1);
      z += model.coef[j] * xs;
    }
    return z;
  }

  // 1-year-ahead GDP growth forecast (ridge model) with transparent baselines.
  window.computeGrowthForecast = function (iso3) {
    const M = window.G20_MODEL;
    const feat = buildFeatures(iso3);
    if (!M || !feat) return null;
    const targetYear = feat.baseYear + 1;
    const modelForecast = applyLinear(M.growth, feat.x);
    const latestActual = feat.x[0]; // growth at baseYear (the persistence baseline)

    // IMF projection for the same year, if the data ever carries one (growth has
    // none today; only DEBT_GDP has the WEO forward path). Shown when present.
    let imfForecast = null, imfYear = null;
    const proj = (window.G20Data.getSeriesWithProjections(iso3, 'GDP_GROWTH', feat.baseYear) || [])
      .filter(d => d.year > feat.baseYear);
    if (proj.length) { imfForecast = proj[0].value; imfYear = proj[0].year; }

    return {
      baseYear: feat.baseYear,
      targetYear,
      modelForecast,
      latestActual,
      imfForecast,
      imfYear,
      rmse: M.meta?.growthRMSE ?? null,
      beatsPersistence: M.meta?.growthBeatsPersistence ?? null,
    };
  };

  // Compact "near-term outlook" panel for the country profile.
  window.renderForecastStrip = function (iso3) {
    const f = window.computeGrowthForecast(iso3);
    const frag = window.computeRiskScore ? window.computeRiskScore(iso3) : null;
    if (!f && !frag) return '';

    const fmt = v => (v == null ? '—' : (v >= 0 ? '+' : '') + v.toFixed(1) + '%');
    const fragColor = !frag ? 'var(--text-3)'
      : frag.score >= 50 ? 'var(--neg)' : frag.score >= 30 ? 'var(--warn)'
      : frag.score >= 15 ? '#A16207' : 'var(--pos)';

    const cell = (label, value, sub, color) => `
      <div style="flex:1;min-width:120px">
        <div class="kpi-tile__lbl">${label}</div>
        <div class="kpi-tile__val" style="font-size:20px;margin-top:6px;color:${color || 'var(--text-1)'}">${value}</div>
        <div class="kpi-tile__delta">${sub}</div>
      </div>`;

    const modelCell = f ? cell(
      `Model growth forecast`,
      fmt(f.modelForecast),
      `${f.targetYear} · ridge model${f.rmse ? ` · ±${f.rmse}pp` : ''}`,
      f.modelForecast < 0 ? 'var(--neg)' : f.modelForecast >= 4 ? 'var(--pos)' : 'var(--text-1)'
    ) : '';
    const actualCell = f ? cell(
      `Latest actual`,
      fmt(f.latestActual),
      `${f.baseYear} · persistence baseline`
    ) : '';
    const imfCell = f && f.imfForecast != null ? cell(
      `IMF projection`,
      fmt(f.imfForecast),
      `${f.imfYear} · World Economic Outlook`
    ) : '';
    const fragCell = frag ? cell(
      `Fundamentals fragility`,
      `${frag.score}<span class="unit" style="font-size:12px">/100</span>`,
      frag.signals.length ? frag.signals.slice(0, 3).join(' · ') : 'no flags',
      fragColor
    ) : '';

    const beat = window.G20_MODEL?.meta?.growthBeatsPersistence;
    return `
  <div class="sec-head" style="margin-top:4px">
    <div class="sec-head__title">Near-term outlook <span class="sec-head__sub">1-year growth forecast · fundamentals fragility</span></div>
  </div>
  <div class="panel" style="margin-bottom:8px">
    <div class="panel__body" style="display:flex;gap:24px;flex-wrap:wrap">
      ${modelCell}${actualCell}${imfCell}${fragCell}
    </div>
  </div>
  <div style="font-family:var(--font-mono);font-size:10px;color:var(--text-4);line-height:1.6;margin-bottom:20px">
    Growth forecast: ridge regression, 1 year ahead, trained on the 2000–2025 World Bank / IMF panel.
    Out-of-sample (leave-one-year-out) RMSE ${window.G20_MODEL?.meta?.growthRMSE ?? '—'}pp, which beats a
    naive persistence baseline by ${beat != null ? beat : '—'}pp. Fragility is a descriptive measure of how
    exposed current fundamentals are to a shock, not a recession forecast. IMF growth projections and
    yield-curve leading indicators are planned data additions.
  </div>`;
  };
})();
