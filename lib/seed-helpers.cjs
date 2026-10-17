'use strict';

// Pure helpers for sync/seed.js, kept here so they can be tested on fixtures.

// Plausible ranges for EVERY economy (not just the G20). A value outside its
// range is treated as a unit or source error and dropped before writing.
// Bounds are wide on purpose: micro-states, hyperinflation episodes, oil funds
// and financial centres produce real extremes. Life expectancy keeps a 30-year
// floor because sub-20 readings in the source are errors.
const GLOBAL_RANGES = Object.freeze({
  GDP:           [1e6,   60e12],
  GDP_GROWTH:    [-70,   150],   // Equatorial Guinea +110% in 2000
  INFLATION:     [-30,   1e9],   // Zimbabwe 2008 hyperinflation is real
  UNEMPLOYMENT:  [0,     80],
  CURRENT_ACC:   [-150,  350],   // Timor-Leste oil-fund years
  GDP_CAPITA:    [100,   300000],
  GDP_CAPITA_PPP:[200,   300000],
  CO2_CAPITA:    [0,     250],   // Palau (bunker fuels) is a World Bank series feature
  TRADE_GDP:     [0,     1000],  // entrepot economies
  EXPORTS_GDP:   [0,     600],
  POPULATION:    [5e3,   2e9],
  DEBT_GDP:      [0,     700],   // Liberia ~600% in 2003
  HEALTH_EXP:    [0,     30],
  RD_EXP:        [0,     8],
  GINI:          [15,    75],
  FISCAL_BAL:    [-80,   150],
  CAPITAL_FORM:  [-50,   100],
  MANUFACTURING: [0,     60],
  FDI_INFLOWS:   [-1500, 2500],  // financial centres (Cayman Islands, Liechtenstein)
  EDUC_EXP:      [0,     20],
  LIFE_EXPECT:   [30,    95],
  YOUTH_UNEMP:   [0,     90],
  FEMALE_LFP:    [1,     95],    // Yemen ~5%
  RESEARCHERS:   [0,     25000],
  TAX_REVENUE:   [0,     160],   // Timor-Leste counts petroleum revenue
});

// Core indicators that must cover the G20 for a refresh to count as healthy.
const CORE_INDICATORS = Object.freeze(['GDP', 'GDP_GROWTH', 'INFLATION', 'UNEMPLOYMENT', 'DEBT_GDP', 'CURRENT_ACC', 'POPULATION']);

function parseWorldBankRows(payload, indicatorKey, allowed) {
  if (!Array.isArray(payload) || payload.length < 2 || !Array.isArray(payload[1])) return [];
  return payload[1]
    .filter((d) => d && d.value !== null && d.value !== undefined)
    .map((d) => ({
      country_iso3: d.countryiso3code || d.country?.id,
      indicator_key: indicatorKey,
      year: parseInt(d.date, 10),
      value: Number(d.value),
      source: 'worldbank',
    }))
    .filter((d) => d.country_iso3 && allowed.has(d.country_iso3) && Number.isFinite(d.year) && Number.isFinite(d.value));
}

// IMF DataMapper returns { values: { CODE: { ISO3: { year: value } } } } for
// every economy and region it covers. Keep registry economies only.
// Years after latestActualYear are projections: kept only when keepProjections
// is set (debt paths), and always flagged is_projection.
function parseImfRows(json, code, indicatorKey, allowed, { latestActualYear, keepProjections = false, transform = null, source = 'imf_weo', fromYear = 2000 } = {}) {
  const values = json?.values?.[code] || {};
  const rows = [];
  for (const [iso3, years] of Object.entries(values)) {
    if (!allowed.has(iso3)) continue;
    for (const [yearStr, raw] of Object.entries(years || {})) {
      const year = parseInt(yearStr, 10);
      if (!Number.isFinite(year) || year < fromYear || raw === null || raw === undefined) continue;
      const isProjection = year > latestActualYear;
      if (isProjection && !keepProjections) continue;
      const value = transform ? transform(Number(raw)) : Number(raw);
      if (!Number.isFinite(value)) continue;
      rows.push({ country_iso3: iso3, indicator_key: indicatorKey, year, value, source, is_projection: isProjection });
    }
  }
  return rows;
}

function splitByRange(rows, ranges = GLOBAL_RANGES) {
  const kept = [];
  const dropped = [];
  for (const row of rows) {
    const [lo, hi] = ranges[row.indicator_key] || [-Infinity, Infinity];
    (row.value < lo || row.value > hi ? dropped : kept).push(row);
  }
  return { kept, dropped };
}

// Later writes overwrite earlier ones for the same key, mirroring the upsert
// order of the seed (World Bank first, then OECD and IMF overwrite).
function mergeRows(target, rows) {
  for (const r of rows) target.set(`${r.country_iso3}|${r.indicator_key}|${r.year}`, r);
  return target;
}

// Summarises a set of annual rows and separates hard errors (fail the run)
// from warnings (reported only).
function summarize(rows, { indicators, g20, latestActualYear, staleBefore = latestActualYear - 4 }) {
  const latest = {};
  const countriesSeen = new Set();
  const rowsPerIndicator = {};
  for (const r of rows) {
    if (r.is_projection) continue;
    countriesSeen.add(r.country_iso3);
    rowsPerIndicator[r.indicator_key] = (rowsPerIndicator[r.indicator_key] || 0) + 1;
    const k = r.indicator_key;
    if (!latest[k]) latest[k] = {};
    if (!latest[k][r.country_iso3] || r.year > latest[k][r.country_iso3]) latest[k][r.country_iso3] = r.year;
  }
  const report = {};
  const hardErrors = [];
  const warnings = [];
  for (const ind of indicators) {
    const byCountry = latest[ind] || {};
    const g20Missing = g20.filter((c) => byCountry[c] === undefined);
    const g20Latest = g20.map((c) => byCountry[c]).filter((y) => y !== undefined);
    const latestYear = g20Latest.length ? Math.max(...g20Latest) : 0;
    report[ind] = {
      rows: rowsPerIndicator[ind] || 0,
      countriesCovered: Object.keys(byCountry).length,
      g20Covered: g20.length - g20Missing.length,
      g20Missing,
      latestYear,
    };
    const core = CORE_INDICATORS.includes(ind);
    if (core && g20Missing.length > 2) hardErrors.push(`${ind}: G20 coverage missing ${g20Missing.join(', ')}`);
    else if (g20Missing.length > (ind === 'GINI' ? 10 : 2)) warnings.push(`${ind}: G20 coverage missing ${g20Missing.join(', ')}`);
    if (core && latestYear && latestYear < staleBefore) hardErrors.push(`${ind}: latest G20 year ${latestYear} is stale`);
  }
  return { indicators: report, countries: countriesSeen.size, hardErrors, warnings };
}

// Coverage tier per country for display badges (refined in Phase 2/3 when
// monthly and daily sources arrive): 1 = quarterly data present,
// 2 = broad annual coverage, 3 = sparse annual coverage.
function coverageTiers(rows, quarterlyCountries = new Set(), indicatorCount = 25) {
  const perCountry = {};
  for (const r of rows) {
    if (r.is_projection) continue;
    (perCountry[r.country_iso3] ||= new Set()).add(r.indicator_key);
  }
  const tiers = {};
  for (const [iso3, set] of Object.entries(perCountry)) {
    tiers[iso3] = quarterlyCountries.has(iso3) ? 1 : set.size >= Math.ceil(indicatorCount * 0.6) ? 2 : 3;
  }
  return tiers;
}

module.exports = { GLOBAL_RANGES, CORE_INDICATORS, parseWorldBankRows, parseImfRows, splitByRange, mergeRows, summarize, coverageTiers };
