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

module.exports = async function handler(req, res) {
  applyCors(req, res); // allow-listed origins only (lib/cors.cjs)
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=600');

  try {
    // Paginate to get all rows (Supabase default limit is 1000)
    const PAGE = 1000;
    const allRows = [];
    let offset = 0;
    while (true) {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/g20_economic_data?select=country_iso3,indicator_key,year,fetched_at&country_iso3=in.(${ALL_COUNTRIES.join(',')})`,
        {
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Range': `${offset}-${offset + PAGE - 1}`,
          },
          signal: AbortSignal.timeout(15000),
        }
      );
      if (!r.ok) throw new Error(`Supabase ${r.status}`);
      const page = await r.json();
      allRows.push(...page);
      if (page.length < PAGE) break;
      offset += PAGE;
    }

    return res.status(200).json(buildStatusPayload(allRows));
  } catch (e) {
    return res.status(500).json({ healthy: false, error: e.message });
  }
};

module.exports.buildStatusPayload = buildStatusPayload;
