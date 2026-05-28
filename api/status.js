// Data quality health endpoint.
// GET /api/status — returns row counts, latest year per indicator, missing countries.
// No auth needed — read-only, useful for debugging and monitoring.

const SUPABASE_URL = 'https://qozknjenyhewmkapsizk.supabase.co';
const SUPABASE_KEY = 'sb_publishable_8I4WpqENYtTkUNKzqfxkkQ_lrQKG3cG';

const ALL_COUNTRIES = [
  'USA','GBR','CAN','DEU','FRA','ITA','JPN','AUS','KOR',
  'CHN','IND','BRA','MEX','ARG','RUS','SAU','ZAF','IDN','TUR',
];

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=600');

  try {
    // Paginate to get all rows (Supabase default limit is 1000)
    const PAGE = 1000;
    const allRows = [];
    let offset = 0;
    while (true) {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/g20_economic_data?select=country_iso3,indicator_key,year,fetched_at`,
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

    // Aggregate: indMap[indicator][country] = latestYear
    const indMap = {};
    let lastRefreshed = null;
    for (const { country_iso3: c, indicator_key: k, year, fetched_at } of allRows) {
      if (!indMap[k]) indMap[k] = {};
      if (!indMap[k][c] || year > indMap[k][c]) indMap[k][c] = year;
      if (!lastRefreshed || fetched_at > lastRefreshed) lastRefreshed = fetched_at;
    }

    const indicators = {};
    for (const [k, countries] of Object.entries(indMap)) {
      const covered    = Object.keys(countries);
      const latestYear = Math.max(...Object.values(countries));
      indicators[k] = {
        covered:    covered.length,
        latestYear,
        missing:    ALL_COUNTRIES.filter(c => !countries[c]),
        isStale:    latestYear < 2021,
      };
    }

    const allHealthy = Object.values(indicators).every(
      i => i.covered >= 17 && !i.isStale && i.missing.length <= 2
    );

    return res.status(200).json({
      healthy: allHealthy,
      totalRows: allRows.length,
      lastRefreshed,
      indicators,
      checkedAt: new Date().toISOString(),
    });
  } catch (e) {
    return res.status(500).json({ healthy: false, error: e.message });
  }
};
