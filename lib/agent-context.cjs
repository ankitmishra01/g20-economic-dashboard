'use strict';

// Builds the Ask AI data context on the server from the published snapshot,
// so the model only ever sees numbers from our own dataset. The client sends a
// question plus an optional country or scope, never numbers.

const DEFAULT_COUNTRIES = require('./g20.cjs');

const SCOPE_INDICATORS = [
  ['GDP', (v) => `GDP $${(v / 1e12).toFixed(2)}T`],
  ['GDP_GROWTH', (v) => `growth ${v.toFixed(1)}%`],
  ['INFLATION', (v) => `inflation ${v.toFixed(1)}%`],
  ['UNEMPLOYMENT', (v) => `unemployment ${v.toFixed(1)}%`],
  ['DEBT_GDP', (v) => `debt/GDP ${v.toFixed(0)}%`],
  ['YOUTH_UNEMP', (v) => `youth unemp ${v.toFixed(1)}%`],
  ['EDUC_EXP', (v) => `education ${v.toFixed(1)}% GDP`],
  ['FISCAL_BAL', (v) => `fiscal balance ${v.toFixed(1)}% GDP`],
  ['TAX_REVENUE', (v) => `tax revenue ${v.toFixed(1)}% GDP`],
  ['EXPORTS_GDP', (v) => `exports ${v.toFixed(1)}% GDP`],
];

const COUNTRY_INDICATORS = ['GDP', 'GDP_GROWTH', 'INFLATION', 'UNEMPLOYMENT', 'DEBT_GDP',
  'FISCAL_BAL', 'CURRENT_ACC', 'GDP_CAPITA_PPP', 'YOUTH_UNEMP'];

function indexSnapshot(snapshot) {
  const annual = new Map();
  for (const [iso3, key, year, value] of snapshot?.annual || []) {
    if (value == null || !Number.isFinite(Number(value))) continue;
    const k = `${iso3}|${key}`;
    if (!annual.has(k)) annual.set(k, []);
    annual.get(k).push({ year: Number(year), value: Number(value) });
  }
  const quarterly = new Map();
  for (const [iso3, key, period, value] of snapshot?.quarterly || []) {
    if (!/^\d{4}Q[1-4]$/.test(String(period)) || value == null) continue;
    const k = `${iso3}|${key}`;
    if (!quarterly.has(k)) quarterly.set(k, []);
    quarterly.get(k).push({ period: String(period), value: Number(value) });
  }
  const meta = new Map((snapshot?.meta || []).map((m) => [m.key, m]));
  return { annual, quarterly, meta };
}

// Latest observed annual value. Years after maxActualYear are projections
// (IMF debt paths run to 2031) and are never returned as "latest".
function latestAnnual(index, iso3, key, maxActualYear) {
  const rows = index.annual.get(`${iso3}|${key}`) || [];
  let best = null;
  for (const r of rows) if (r.year <= maxActualYear && (!best || r.year > best.year)) best = r;
  return best;
}

function latestQuarter(index, iso3, key) {
  const rows = index.quarterly.get(`${iso3}|${key}`) || [];
  let best = null;
  for (const r of rows) if (!best || r.period > best.period) best = r;
  return best;
}

function defaultMaxActualYear(now = new Date()) {
  return now.getUTCFullYear() - 1;
}

function buildScopeContext(index, countries = DEFAULT_COUNTRIES, { maxActualYear = defaultMaxActualYear(), label = 'G20' } = {}) {
  const lines = [`${label} Latest Economic Snapshot:`];
  for (const c of countries) {
    const parts = [`${c.name}:`];
    for (const [key, fmt] of SCOPE_INDICATORS) {
      const d = latestAnnual(index, c.iso3, key, maxActualYear);
      if (d) parts.push(`${fmt(d.value)} (${d.year})`);
    }
    if (parts.length > 1) lines.push(parts.join(' | '));
  }
  return lines.join('\n');
}

function buildCountryContext(index, projections, iso3, countries = DEFAULT_COUNTRIES, { maxActualYear = defaultMaxActualYear() } = {}) {
  const country = countries.find((c) => c.iso3 === iso3);
  if (!country) return '';
  const lines = [`${country.name} Economic Snapshot:`];
  for (const key of COUNTRY_INDICATORS) {
    const label = index.meta.get(key)?.label || key;
    const unit = index.meta.get(key)?.unit || '';
    const a = latestAnnual(index, iso3, key, maxActualYear);
    if (a) lines.push(`  ${label}: ${a.value.toFixed(2)} ${unit} (${a.year})`);
    const q = latestQuarter(index, iso3, key);
    if (q) lines.push(`  ${label}, latest quarter: ${q.value.toFixed(2)} ${unit} (${q.period})`);
  }
  const proj = (projections?.projections || []).filter((p) => p.iso3 === iso3 && p.horizon <= 2);
  if (proj.length) {
    lines.push(`  Model projections (vintage ${projections.dataVintage || 'unknown'}; 80% band p10 to p90; not certainty):`);
    for (const p of proj) lines.push(`    ${p.indicator} ${p.year}: ${p.point} (p10 ${p.p10}, p90 ${p.p90})`);
  }
  return lines.join('\n');
}

// ── Global scope, realtime and "What changed" context (Phase 4) ─────────────
// latest = public/legacy/data/latest.json  { latestActualYear, values: { ISO3: { KEY: [value, year] } } }
// Only actual (non-projected) annual values are published there, so nothing here can
// present an IMF projection as the latest figure.

const fmtGdp = (v) => (Math.abs(v) >= 1e11 ? `$${(v / 1e12).toFixed(2)}T` : Math.abs(v) >= 1e9 ? `$${(v / 1e9).toFixed(1)}B` : `$${(v / 1e6).toFixed(0)}M`);
const LATEST_SCOPE_INDICATORS = [
  ['GDP', (v) => `GDP ${fmtGdp(v)}`],
  ['GDP_GROWTH', (v) => `growth ${v.toFixed(1)}%`],
  ['INFLATION', (v) => `inflation ${v.toFixed(1)}%`],
  ['UNEMPLOYMENT', (v) => `unemployment ${v.toFixed(1)}%`],
  ['DEBT_GDP', (v) => `debt/GDP ${v.toFixed(0)}%`],
  ['FISCAL_BAL', (v) => `fiscal balance ${v.toFixed(1)}% GDP`],
  ['CURRENT_ACC', (v) => `current account ${v.toFixed(1)}% GDP`],
];
const LATEST_COUNTRY_INDICATORS = ['GDP', 'GDP_GROWTH', 'INFLATION', 'UNEMPLOYMENT', 'DEBT_GDP', 'FISCAL_BAL',
  'CURRENT_ACC', 'GDP_CAPITA_PPP', 'YOUTH_UNEMP', 'TRADE_GDP', 'FDI_INFLOWS', 'POPULATION'];

const median = (xs) => {
  const a = xs.filter(Number.isFinite).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

// Scope context from latest.json. Large scopes list the biggest economies (by GDP)
// plus scope medians, so the context stays within the prompt budget.
function buildLatestScopeContext(latest, members, { label = 'Global', maxEconomies = 60 } = {}) {
  const values = latest?.values || {};
  const rows = members.map((m) => ({ ...m, v: values[m.iso3] || {} })).filter((m) => Object.keys(m.v).length);
  rows.sort((a, b) => (b.v.GDP?.[0] || 0) - (a.v.GDP?.[0] || 0));
  const lines = [`${label} latest annual snapshot (${rows.length} economies with data; actual values only, latest year ${latest?.latestActualYear || 'n/a'}):`];
  const med = (key) => median(rows.map((r) => r.v[key]?.[0]));
  const medParts = [['GDP_GROWTH', 'growth', '%'], ['INFLATION', 'inflation', '%'], ['UNEMPLOYMENT', 'unemployment', '%'], ['DEBT_GDP', 'debt/GDP', '%']]
    .map(([k, l, u]) => { const x = med(k); return x == null ? null : `${l} ${x.toFixed(1)}${u}`; }).filter(Boolean);
  if (medParts.length) lines.push(`Scope medians: ${medParts.join(' | ')}`);
  if (rows.length > maxEconomies) lines.push(`Largest ${maxEconomies} economies by GDP:`);
  for (const r of rows.slice(0, maxEconomies)) {
    const parts = [`${r.name}:`];
    for (const [key, fmt] of LATEST_SCOPE_INDICATORS) {
      const d = r.v[key];
      if (d && Number.isFinite(d[0])) parts.push(`${fmt(d[0])} (${d[1]})`);
    }
    if (parts.length > 1) lines.push(parts.join(' | '));
  }
  return lines.join('\n');
}

// One economy from latest.json plus, when supplied, its recent annual series (country shard).
function buildLatestCountryContext(latest, shard, country, { years = 6 } = {}) {
  const v = latest?.values?.[country.iso3];
  if (!v) return '';
  const lines = [`${country.name} economic snapshot (latest actual annual values):`];
  for (const key of LATEST_COUNTRY_INDICATORS) {
    const d = v[key];
    if (!d || !Number.isFinite(d[0])) continue;
    lines.push(`  ${key}: ${key === 'GDP' ? fmtGdp(d[0]) : Number(d[0]).toFixed(2)} (${d[1]})`);
  }
  const maxYear = latest?.latestActualYear || 9999;
  for (const key of ['GDP_GROWTH', 'INFLATION', 'DEBT_GDP']) {
    const series = shard?.series?.[key];
    if (!series) continue;
    const pts = Object.entries(series).map(([y, x]) => [Number(y), Number(x)]).filter(([y, x]) => y <= maxYear && Number.isFinite(x)).sort((a, b) => a[0] - b[0]).slice(-years);
    if (pts.length > 1) lines.push(`  ${key} history: ${pts.map(([y, x]) => `${y} ${x.toFixed(1)}`).join(', ')}`);
  }
  return lines.join('\n');
}

// Daily market layer: markets always, plus policy rate and FX for one economy when given.
function buildRealtimeContext(realtime, iso3 = null) {
  if (!realtime) return '';
  const lines = ['Daily market reference data (official daily series, not tick prices):'];
  for (const m of Object.values(realtime.markets || {})) {
    if (m && Number.isFinite(m.value)) lines.push(`  ${m.label}: ${m.value} ${m.unit} as of ${m.date}${m.change != null ? ` (change ${m.change})` : ''}; source ${m.source}`);
  }
  if (iso3) {
    const pr = realtime.policyRates?.values?.[iso3];
    if (pr) {
      const lc = pr.lastChange;
      lines.push(`  Policy rate: ${pr.rate}% as of ${pr.date}${lc ? `; last move ${lc.change > 0 ? '+' : ''}${Math.round(lc.change * 100)}bp from ${lc.from}% (after ${lc.after})` : ''}; source BIS`);
    }
    const ccy = realtime.fx?.currencyByIso3?.[iso3];
    const fx = ccy && ccy !== 'USD' ? realtime.fx?.values?.[ccy] : null;
    if (fx) lines.push(`  ${ccy} per USD: ${fx.perUsd} as of ${realtime.fx.date} (1 day ${fx.change1dPct}%, 30 days ${fx.change30dPct}%; positive = ${ccy} weaker); source ECB`);
  }
  return lines.join('\n');
}

// Facts for the "What changed" narration: only the computed items, nothing else.
function buildBriefContext(whatChanged, inScope = null, { limit = 8 } = {}) {
  const items = (whatChanged?.items || []).filter((i) => !inScope || !i.iso3 || inScope(i.iso3)).slice(0, limit);
  if (!items.length) return '';
  const lines = [`What changed (computed from the published data, as of ${whatChanged.asOf}):`];
  items.forEach((i, n) => lines.push(`${n + 1}. ${i.title} [${i.kind}; as of ${i.asOf}; source ${i.source}]`));
  return lines.join('\n');
}

module.exports = {
  indexSnapshot, latestAnnual, latestQuarter, buildScopeContext, buildCountryContext,
  defaultMaxActualYear, SCOPE_INDICATORS, COUNTRY_INDICATORS,
  buildLatestScopeContext, buildLatestCountryContext, buildRealtimeContext, buildBriefContext, fmtGdp,
};
