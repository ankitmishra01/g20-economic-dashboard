'use strict';

// Pure builder for the static data shards the dashboard reads in global scope.
// Input rows mirror g20_economic_data: { country_iso3, indicator_key, year, value, is_projection }.
// Output (all plain JSON, written by sync/shards.js):
//   latest            -> public/legacy/data/latest.json      every economy x indicator, latest ACTUAL
//   byCountry[ISO3]   -> public/legacy/data/country/ISO3.json full annual series incl. projections
//   byIndicator[KEY]  -> public/legacy/data/indicator/KEY.json actual series for every economy
// Projections (is_projection, or a year after latestActualYear) never become a "latest" value.

const { coverageTiers } = require('./seed-helpers.cjs');

const compact = (v) => Number(Number(v).toPrecision(6));

function isActual(row, latestActualYear) {
  return !row.is_projection && Number(row.year) <= latestActualYear;
}

function buildShards(rows, { generatedAt, latestActualYear, indicators, countries, quarterlyCountries = new Set(), highFrequencyCountries = new Set() }) {
  if (!Number.isInteger(latestActualYear)) throw new Error('latestActualYear is required');
  const allowed = new Set(countries);
  const keys = new Set(indicators);
  const byCountry = {};
  const byIndicator = {};
  const latestValues = {};

  for (const row of rows) {
    const iso3 = row.country_iso3;
    const key = row.indicator_key;
    const year = Number(row.year);
    const value = Number(row.value);
    if (!allowed.has(iso3) || !keys.has(key) || !Number.isFinite(year) || row.value === null || !Number.isFinite(value)) continue;
    const actual = isActual(row, latestActualYear);

    const c = (byCountry[iso3] ||= { iso3, generatedAt, latestActualYear, series: {}, projections: {} });
    const bucket = actual ? c.series : c.projections;
    (bucket[key] ||= {})[year] = compact(value);

    if (!actual) continue;
    const ind = (byIndicator[key] ||= { key, generatedAt, latestActualYear, series: {} });
    (ind.series[iso3] ||= {})[year] = compact(value);

    const cur = (latestValues[iso3] ||= {})[key];
    if (!cur || year > cur[1]) latestValues[iso3][key] = [compact(value), year];
  }

  const tierInput = rows.filter((r) => allowed.has(r.country_iso3) && isActual(r, latestActualYear));
  const tiers = coverageTiers(tierInput, new Set([...quarterlyCountries, ...highFrequencyCountries]), indicators.length);

  const latest = {
    schemaVersion: 1,
    generatedAt,
    latestActualYear,
    indicators: [...keys],
    countries: Object.keys(latestValues).length,
    tiers,
    values: latestValues,
  };
  return { latest, byCountry, byIndicator };
}

module.exports = { buildShards, isActual };
