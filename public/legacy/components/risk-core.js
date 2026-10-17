// Pure risk logic shared by the browser (window.RiskCore) and the tests (require).
// - fragilityScore: the 0-100 fundamentals fragility score used on country profiles
//   and the Overview table. Every annual signal is read on ONE basis (annual), so a
//   quarterly print in one economy is never compared with an annual value in another.
//   Two daily market signals are added when data/realtime.json covers the economy.
// - realtimeSignal: FX depreciation over 30 days and recent policy-rate shocks, used
//   by the Risk flags matrix as two extra columns.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RiskCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const FX_SLIDE_PCT = 5;          // currency down 5%+ against the USD over 30 days
  const POLICY_SHOCK_BP = 50;      // a single move of 50bp+ ...
  const POLICY_SHOCK_MONTHS = 3;   // ... within the last three months

  function monthIndex(ym) {
    const m = /^(\d{4})-(\d{2})/.exec(ym || '');
    return m ? Number(m[1]) * 12 + Number(m[2]) - 1 : null;
  }

  // Realtime values for the Risk flags matrix.
  //   FX_30D:       % change of local currency per USD over 30 days (positive = weaker)
  //   POLICY_SHOCK: size in bp of the latest policy move if it was recent, else 0
  function realtimeSignal(rt, iso3, key, now = new Date()) {
    if (!rt) return null;
    if (key === 'FX_30D') {
      const ccy = rt.fx?.currencyByIso3?.[iso3];
      if (!ccy) return null;
      if (ccy === 'USD') return { value: 0, date: rt.fx.date };
      const x = rt.fx?.values?.[ccy];
      return x && Number.isFinite(x.change30dPct) ? { value: x.change30dPct, date: rt.fx.date, currency: ccy } : null;
    }
    if (key === 'POLICY_SHOCK') {
      const pr = rt.policyRates?.values?.[iso3];
      if (!pr) return null;
      const lc = pr.lastChange;
      const nowM = now.getUTCFullYear() * 12 + now.getUTCMonth();
      const recent = lc && monthIndex(lc.after) != null && nowM - monthIndex(lc.after) <= POLICY_SHOCK_MONTHS;
      return { value: recent ? Math.round(Math.abs(lc.change) * 100) : 0, date: pr.date, direction: recent ? (lc.change > 0 ? 'hike' : 'cut') : null };
    }
    return null;
  }

  // getAnnual(iso3, key) -> { value, year } | null   (annual basis only)
  // getSeries(iso3, key) -> [{ year, value }] annual, ascending
  function fragilityScore({ getAnnual, getSeries, realtime = null, iso3, now = new Date() }) {
    let score = 0;
    const signals = [];
    const v = (key) => { const d = getAnnual(iso3, key); return d && Number.isFinite(d.value) ? d.value : null; };

    const gv = v('GDP_GROWTH');
    const fv = v('FISCAL_BAL');
    const dv = v('DEBT_GDP');
    const cav = v('CURRENT_ACC');
    const uv = v('UNEMPLOYMENT');
    const iv = v('INFLATION');

    if (gv != null) {
      if (gv < 0)      { score += 25; signals.push('Contraction'); }
      else if (gv < 1) { score += 15; signals.push('Near-zero growth'); }
      else if (gv < 2) { score += 7;  signals.push('Below-trend growth'); }
      const series = (getSeries ? getSeries(iso3, 'GDP_GROWTH') : []) || [];
      if (series.length >= 3) {
        const prev2 = series[series.length - 3]?.value;
        if (prev2 != null && gv < prev2 - 2) { score += 8; signals.push('Declining trend'); }
      }
    }
    if (fv != null) {
      if (fv < -6)      { score += 20; signals.push('Large fiscal deficit'); }
      else if (fv < -3) { score += 10; signals.push('Fiscal deficit'); }
    }
    if (dv != null) {
      if (dv > 120)      { score += 15; signals.push('Debt >120% GDP'); }
      else if (dv > 100) { score += 8;  signals.push('Debt >100% GDP'); }
    }
    if (cav != null && cav < -4) { score += 10; signals.push('Current account deficit'); }
    if (uv != null && uv > 8)    { score += 8;  signals.push('High unemployment'); }
    if (iv != null && iv > 6)    { score += 7;  signals.push('Elevated inflation'); }

    // Daily market signals (only where data/realtime.json covers the economy).
    const fx = realtimeSignal(realtime, iso3, 'FX_30D', now);
    if (fx && fx.value >= FX_SLIDE_PCT) { score += 8; signals.push(`Currency down ${fx.value.toFixed(1)}% in 30 days`); }
    const ps = realtimeSignal(realtime, iso3, 'POLICY_SHOCK', now);
    if (ps && ps.value >= POLICY_SHOCK_BP && ps.direction === 'hike') { score += 6; signals.push(`Policy rate hiked ${ps.value}bp recently`); }

    score = Math.min(score, 100);
    let label; let labelCls;
    if (score >= 50)      { label = 'High Risk'; labelCls = 'risk-high'; }
    else if (score >= 30) { label = 'Elevated';  labelCls = 'risk-elevated'; }
    else if (score >= 15) { label = 'Watch';     labelCls = 'risk-watch'; }
    else                  { label = 'Stable';    labelCls = 'risk-stable'; }
    return { score, label, labelCls, signals };
  }

  return { fragilityScore, realtimeSignal, FX_SLIDE_PCT, POLICY_SHOCK_BP, POLICY_SHOCK_MONTHS };
});
