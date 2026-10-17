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

module.exports = {
  indexSnapshot, latestAnnual, latestQuarter, buildScopeContext, buildCountryContext,
  defaultMaxActualYear, SCOPE_INDICATORS, COUNTRY_INDICATORS,
};
