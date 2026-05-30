// Frontend data layer — reads G20 economic data from Supabase.
// One REST call fetches the entire dataset; much faster than live WB/IMF API calls.

const SUPABASE_URL = 'https://qozknjenyhewmkapsizk.supabase.co';
const SUPABASE_KEY = 'sb_publishable_8I4WpqENYtTkUNKzqfxkkQ_lrQKG3cG';

(function () {
  // Index structure: G20_DATA[iso3][indicatorKey][year] = value
  // Plus G20_DATA._latest[iso3][indicatorKey] = most recent value
  let _data = {};

  async function loadAllData() {
    // Supabase default page size is 1000 rows — paginate until all rows are fetched.
    const PAGE = 1000;
    const rows = [];
    let offset = 0;
    while (true) {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/g20_economic_data?select=country_iso3,indicator_key,year,value&order=year.asc`,
        {
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Range': `${offset}-${offset + PAGE - 1}`,
          },
        }
      );
      if (!r.ok) throw new Error(`Supabase fetch failed: ${r.status}`);
      const page = await r.json();
      rows.push(...page);
      if (page.length < PAGE) break; // last page
      offset += PAGE;
    }

    // Build nested index
    _data = {};
    for (const row of rows) {
      const { country_iso3: iso3, indicator_key: key, year, value } = row;
      if (!iso3 || !key) continue;
      if (!_data[iso3]) _data[iso3] = {};
      if (!_data[iso3][key]) _data[iso3][key] = {};
      _data[iso3][key][year] = value;
    }

    // Build _latest: most recent non-null value per country per indicator,
    // capped at 2025 so IMF forward projections (2026+) don't appear as current data.
    const LATEST_YEAR_CAP = 2025;
    _data._latest = {};
    for (const iso3 of Object.keys(_data)) {
      if (iso3 === '_latest') continue;
      _data._latest[iso3] = {};
      for (const key of Object.keys(_data[iso3])) {
        const years = Object.keys(_data[iso3][key])
          .map(Number)
          .filter(y => y <= LATEST_YEAR_CAP)
          .sort((a, b) => b - a);
        for (const yr of years) {
          const v = _data[iso3][key][yr];
          if (v !== null && v !== undefined && !isNaN(v)) {
            _data._latest[iso3][key] = { value: v, year: yr };
            break;
          }
        }
      }
    }

    window.G20_DATA = _data;

    // Load quarterly data from g20_quarterly_data table (non-blocking; graceful fallback)
    try {
      const qr = await fetch(
        `${SUPABASE_URL}/rest/v1/g20_quarterly_data?select=country_iso3,indicator_key,period,value&order=period.asc`,
        { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
      );
      if (qr.ok) {
        const qrows = await qr.json();
        window.G20_QDATA = buildQuarterlyIndex(Array.isArray(qrows) ? qrows : []);
      }
    } catch (_) { /* quarterly table may not exist yet — no-op */ }

    // Load indicator metadata (non-blocking; graceful fallback)
    try {
      const mr = await fetch(
        `${SUPABASE_URL}/rest/v1/g20_indicators?select=*`,
        { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
      );
      if (mr.ok) {
        const meta = await mr.json();
        window.G20_INDICATOR_META = Array.isArray(meta) ? meta : [];
      }
    } catch (_) {}

    return _data;
  }

  // Build quarterly data index from flat row array.
  // Index: _qdata[iso3][key][period] = value
  // _qlatest[iso3][key] = { value, period } for most recent period
  function buildQuarterlyIndex(rows) {
    const idx = {};
    const latest = {};
    for (const { country_iso3: iso3, indicator_key: key, period, value } of rows) {
      if (!iso3 || !key || !period) continue;
      if (!idx[iso3]) idx[iso3] = {};
      if (!idx[iso3][key]) idx[iso3][key] = {};
      idx[iso3][key][period] = value;
      if (!latest[iso3]) latest[iso3] = {};
      if (!latest[iso3][key] || period > latest[iso3][key].period) {
        latest[iso3][key] = { value, period };
      }
    }
    idx._qlatest = latest;
    return idx;
  }

  // Get the latest value for a country + indicator.
  // Prefers quarterly data from g20_quarterly_data when it is more recent than annual data.
  // Returns { value, year, period? } where period is set (e.g. '2026Q1') when quarterly data wins.
  function getLatest(iso3, key) {
    const qLatest = window.G20_QDATA?._qlatest?.[iso3]?.[key];
    const aLatest = window.G20_DATA?._latest?.[iso3]?.[key];

    if (!qLatest && !aLatest) return null;
    if (!qLatest) return aLatest;
    if (!aLatest) return { value: qLatest.value, year: parseInt(qLatest.period, 10), period: qLatest.period, isQuarterly: true };

    // Quarterly wins if its year is more recent, or same year but has a quarter suffix
    const qYear = parseInt(qLatest.period, 10);
    if (qYear > aLatest.year || (qYear === aLatest.year && qLatest.period.length > 4)) {
      return { value: qLatest.value, year: qYear, period: qLatest.period, isQuarterly: true };
    }
    return aLatest;
  }

  // Get quarterly time series [{period, year, value}] sorted ascending.
  function getQuarterlySeries(iso3, key, fromPeriod) {
    const raw = window.G20_QDATA?.[iso3]?.[key] || {};
    return Object.entries(raw)
      .map(([p, v]) => ({ period: p, year: parseInt(p, 10), value: v }))
      .filter(d => !fromPeriod || d.period >= fromPeriod)
      .sort((a, b) => a.period.localeCompare(b.period));
  }

  // Get time series [{year, value}] for a country + indicator, sorted ascending.
  function getSeries(iso3, key, fromYear) {
    const raw = window.G20_DATA?.[iso3]?.[key] || {};
    return Object.entries(raw)
      .map(([y, v]) => ({ year: parseInt(y, 10), value: v }))
      .filter(d => d.value !== null && !isNaN(d.value) && (!fromYear || d.year >= fromYear) && d.year <= 2025)
      .sort((a, b) => a.year - b.year);
  }

  // Get historical + IMF forecast series [{year, value, isProjection}].
  // Historical years ≤ 2025 are flagged isProjection: false; 2026+ are IMF forecasts.
  function getSeriesWithProjections(iso3, key, fromYear) {
    const raw = window.G20_DATA?.[iso3]?.[key] || {};
    return Object.entries(raw)
      .map(([y, v]) => ({ year: parseInt(y, 10), value: v, isProjection: parseInt(y, 10) > 2025 }))
      .filter(d => d.value !== null && !isNaN(d.value) && (!fromYear || d.year >= fromYear))
      .sort((a, b) => a.year - b.year);
  }

  // Get latest values for all G20 countries for one indicator, sorted desc by value.
  function getRanking(key) {
    return window.G20
      .map(c => {
        const l = getLatest(c.iso3, key);
        return { ...c, value: l?.value ?? null, year: l?.year ?? null };
      })
      .filter(c => c.value !== null)
      .sort((a, b) => b.value - a.value);
  }

  // Build a plain-text data context for the AI agent (top-level snapshot).
  function buildAgentContext() {
    if (!window.G20_DATA) return '';
    const lines = ['G20 Latest Economic Snapshot:'];
    for (const c of window.G20) {
      const gdp   = getLatest(c.iso3, 'GDP');
      const gr    = getLatest(c.iso3, 'GDP_GROWTH');
      const inf   = getLatest(c.iso3, 'INFLATION');
      const une   = getLatest(c.iso3, 'UNEMPLOYMENT');
      const debt  = getLatest(c.iso3, 'DEBT_GDP');
      const youth = getLatest(c.iso3, 'YOUTH_UNEMP');
      const educ  = getLatest(c.iso3, 'EDUC_EXP');
      if (!gdp && !gr) continue;
      const parts = [`${c.name}:`];
      if (gdp)   parts.push(`GDP $${(gdp.value/1e12).toFixed(2)}T (${gdp.year})`);
      if (gr)    parts.push(`growth ${gr.value.toFixed(1)}% (${gr.year})`);
      if (inf)   parts.push(`inflation ${inf.value.toFixed(1)}% (${inf.year})`);
      if (une)   parts.push(`unemployment ${une.value.toFixed(1)}% (${une.year})`);
      if (debt)  parts.push(`debt/GDP ${debt.value.toFixed(0)}% (${debt.year})`);
      if (youth) parts.push(`youth unemp ${youth.value.toFixed(1)}% (${youth.year})`);
      if (educ)  parts.push(`education ${educ.value.toFixed(1)}% GDP (${educ.year})`);
      const fisc = getLatest(c.iso3, 'FISCAL_BAL');
      const tax  = getLatest(c.iso3, 'TAX_REVENUE');
      const exp  = getLatest(c.iso3, 'EXPORTS_GDP');
      if (fisc) parts.push(`fiscal balance ${fisc.value.toFixed(1)}% GDP (${fisc.year})`);
      if (tax)  parts.push(`tax revenue ${tax.value.toFixed(1)}% GDP (${tax.year})`);
      if (exp)  parts.push(`exports ${exp.value.toFixed(1)}% GDP (${exp.year})`);
      lines.push(parts.join(' | '));
    }
    return lines.join('\n');
  }

  // Get metadata (label, source, unit, description) for an indicator key.
  function getIndicatorMeta(key) {
    return window.G20_INDICATOR_META?.find(m => m.key === key) || null;
  }

  // Build enriched context for a single country AI query, including relevant news headlines.
  function buildCountryContext(iso3) {
    const country = window.G20?.find(c => c.iso3 === iso3);
    if (!country) return '';

    const indicators = ['GDP', 'GDP_GROWTH', 'INFLATION', 'UNEMPLOYMENT', 'DEBT_GDP',
                        'FISCAL_BAL', 'CURRENT_ACC', 'GDP_CAPITA_PPP', 'YOUTH_UNEMP'];
    const lines = [`${country.name} Economic Snapshot:`];
    for (const key of indicators) {
      const d = getLatest(iso3, key);
      if (!d) continue;
      const label = window.INDICATORS?.[key]?.label || key;
      const unit  = window.INDICATORS?.[key]?.unit || '';
      lines.push(`  ${label}: ${d.value.toFixed(2)} ${unit} (${d.year})`);
    }

    // IMF projections for GDP growth
    const projSeries = getSeriesWithProjections(iso3, 'GDP_GROWTH', 2023)
      .filter(d => d.isProjection).slice(0, 3);
    if (projSeries.length) {
      lines.push('  IMF Forecast (GDP growth):');
      projSeries.forEach(d => lines.push(`    ${d.year}: ${d.value.toFixed(1)}%`));
    }

    // Recession risk score
    if (window.computeRiskScore) {
      const risk = window.computeRiskScore(iso3);
      lines.push(`  Recession risk score: ${risk.score}/100 (${risk.label}) — ${risk.signals.join(', ') || 'no flags'}`);
    }

    // Recent news headlines for this country
    const allNews = window._cachedNews || [];
    const countryNews = allNews
      .filter(a => a.title && a.title.toLowerCase().includes(country.name.toLowerCase()))
      .slice(0, 3);
    if (countryNews.length) {
      lines.push('  Recent headlines:');
      countryNews.forEach(a => lines.push(`    - ${a.title} (${a.source})`));
    }

    return lines.join('\n');
  }

  window.G20Data = { loadAllData, getLatest, getSeries, getSeriesWithProjections, getRanking, buildAgentContext, buildCountryContext, getIndicatorMeta, getQuarterlySeries };
})();
