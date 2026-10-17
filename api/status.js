// Data quality health endpoint.
// GET /api/status — returns row counts, latest year per indicator, missing countries.
// No auth needed — read-only, useful for debugging and monitoring.

const { applyCors } = require('../lib/cors.cjs');
const SUPABASE_URL = 'https://qozknjenyhewmkapsizk.supabase.co';
const SUPABASE_KEY = 'sb_publishable_8I4WpqENYtTkUNKzqfxkkQ_lrQKG3cG';
const { summarizeIndicators } = require('../lib/economic-domain.cjs');

// Status is reported for the dashboard's G20 economies (from the country registry).
const ALL_COUNTRIES = require('../lib/registry.cjs').g20Iso3();

function buildStatusPayload(allRows, options = {}) {
  const countries = options.countries || ALL_COUNTRIES;
  const now = options.now || new Date();
  const indicators = summarizeIndicators(allRows, { countries, now });
  let lastRefreshed = null;

  for (const row of allRows) {
    if (row.fetched_at && (!lastRefreshed || row.fetched_at > lastRefreshed)) lastRefreshed = row.fetched_at;
  }

  for (const indicator of Object.values(indicators)) {
    indicator.latestYear = indicator.latestObservedPeriod
      ? Number(String(indicator.latestObservedPeriod).slice(0, 4))
      : null;
    indicator.isStale = ['stale', 'failed', 'unavailable'].includes(indicator.freshness.state);
  }

  const allHealthy = Object.values(indicators).every(
    indicator => indicator.covered >= Math.min(17, countries.length)
      && !indicator.isStale
      && indicator.missing.length <= 2,
  );

  return {
    healthy: allHealthy,
    totalRows: allRows.length,
    lastRefreshed,
    indicators,
    checkedAt: now.toISOString(),
  };
}

const PAGE = 1000;
const BASE = `${SUPABASE_URL}/rest/v1/g20_economic_data?select=country_iso3,indicator_key,year,fetched_at`
  + `&country_iso3=in.(${ALL_COUNTRIES.join(',')})&is_projection=eq.false`
  + '&order=country_iso3.asc,indicator_key.asc,year.asc';
const HEADERS = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };

// Observed (non-projection) G20 rows. A stable order makes Range paging complete;
// the exact count lets every page be fetched in parallel instead of one by one.
async function fetchObservedRows(fetchImpl = fetch) {
  const head = await fetchImpl(BASE, {
    headers: { ...HEADERS, Range: '0-0', Prefer: 'count=exact' },
    signal: AbortSignal.timeout(15000),
  });
  if (!head.ok && head.status !== 206) throw new Error(`Supabase ${head.status}`);
  const total = Number((head.headers.get('content-range') || '').split('/')[1]);
  if (!Number.isFinite(total)) throw new Error('Supabase count unavailable');
  const pages = Math.ceil(total / PAGE);
  const results = await Promise.all(Array.from({ length: pages }, (_, i) => fetchImpl(BASE, {
    headers: { ...HEADERS, Range: `${i * PAGE}-${i * PAGE + PAGE - 1}` },
    signal: AbortSignal.timeout(15000),
  }).then((r) => {
    if (!r.ok) throw new Error(`Supabase ${r.status}`);
    return r.json();
  })));
  const rows = results.flat();
  if (rows.length !== total) throw new Error(`Supabase paging returned ${rows.length} of ${total} rows`);
  return rows;
}

module.exports = async function handler(req, res) {
  applyCors(req, res); // allow-listed origins only (lib/cors.cjs)
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=600');

  try {
    const allRows = await fetchObservedRows();
    return res.status(200).json(buildStatusPayload(allRows));
  } catch (e) {
    return res.status(500).json({ healthy: false, error: e.message });
  }
};

module.exports.buildStatusPayload = buildStatusPayload;
module.exports.fetchObservedRows = fetchObservedRows;
