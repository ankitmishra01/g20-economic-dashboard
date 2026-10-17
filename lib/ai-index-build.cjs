'use strict';
// Builds public/legacy/data/ai-index.json from the AI Trajectory Index (ATI) scores
// (https://ai-trajectory-index.vercel.app/api/scores, or the repo's data/countries.json).
// Keyed by ISO3 so the dashboard never matches economies by display name.
// Only fields published by ATI are copied; nothing is derived or invented.

const DIMS = ['infrastructure', 'talent', 'governance', 'investment', 'economic_readiness'];
const ISO3 = /^[A-Z]{3}$/;
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

function slimCountry(c) {
  const scores = {};
  for (const d of DIMS) {
    const dim = c.scores && c.scores[d];
    const s = num(dim && dim.score);
    if (s == null) continue;
    scores[d] = { score: s };
  }
  const cov = c.coverage && typeof c.coverage === 'object' ? c.coverage : null;
  return {
    name: str(c.name),
    slug: str(c.slug) || str(c.id),
    region: str(c.region),
    total_score: num(c.total_score),
    projected_score_2028: num(c.projected_score_2028),
    trajectory_score: num(c.trajectory_score),
    trajectory_label: str(c.trajectory_label),
    top_accelerator: str(c.top_accelerator),
    top_risk: str(c.top_risk),
    scores,
    // 'live' = scored from fetched official indicators; 'fallback'/'static' = ATI's published baseline.
    data_source: str(c.data_source) || 'baseline',
    coverage_label: cov ? str(cov.label) : null,
    fallback_share: cov ? num(cov.fallbackShare) : null,
    wb_data_year: num(c.wb_data_year),
  };
}

/**
 * @param {object} json  ATI /api/scores body ({countries, last_updated, coverage, sources}) or countries.json ({countries})
 * @param {{source:'api'|'static', sourceUrl:string, now?:Date, registryIso3?:Set<string>}} opts
 */
function buildAiIndex(json, opts) {
  const list = Array.isArray(json && json.countries) ? json.countries : [];
  const countries = {};
  const skipped = [];
  for (const c of list) {
    const iso3 = typeof c.iso3 === 'string' ? c.iso3.toUpperCase() : '';
    if (!ISO3.test(iso3)) { skipped.push(str(c.name) || '(unnamed)'); continue; }
    const row = slimCountry(c);
    if (row.total_score == null) { skipped.push(row.name || iso3); continue; }
    countries[iso3] = row;
  }
  const iso3s = Object.keys(countries);
  const reg = opts.registryIso3 || null;
  return {
    schemaVersion: 1,
    generatedAt: (opts.now || new Date()).toISOString(),
    source: opts.source,
    sourceUrl: opts.sourceUrl,
    indexUrl: 'https://ai-trajectory-index.vercel.app',
    asOf: str(json && json.last_updated) || null,
    usingLiveData: json && typeof json.using_live_data === 'boolean' ? json.using_live_data : opts.source === 'api',
    coverage: json && json.coverage && typeof json.coverage === 'object' ? {
      live_indicator_share: num(json.coverage.live_indicator_share),
      countries_live: num(json.coverage.countries_live),
      countries_total: num(json.coverage.countries_total),
    } : null,
    counts: {
      economies: iso3s.length,
      skippedWithoutIso3: skipped.length,
      inRegistry: reg ? iso3s.filter((i) => reg.has(i)).length : null,
      notInRegistry: reg ? iso3s.filter((i) => !reg.has(i)) : null,
    },
    countries,
  };
}

// Per-economy detail (the pillar reasons ATI publishes), written to data/ai-index/{ISO3}.json
// so the shared index stays small and profiles load only their own reasons.
function buildAiDetails(json) {
  const out = {};
  for (const c of (Array.isArray(json && json.countries) ? json.countries : [])) {
    const iso3 = typeof c.iso3 === 'string' ? c.iso3.toUpperCase() : '';
    if (!ISO3.test(iso3)) continue;
    const reasons = {};
    for (const d of DIMS) {
      const r = c.scores && c.scores[d] && Array.isArray(c.scores[d].reasons) ? c.scores[d].reasons : [];
      const clean = r.filter((x) => typeof x === 'string' && x.trim()).slice(0, 4);
      if (clean.length) reasons[d] = clean;
    }
    if (Object.keys(reasons).length) out[iso3] = { reasons };
  }
  return out;
}

module.exports = { buildAiIndex, buildAiDetails, slimCountry, DIMS };
