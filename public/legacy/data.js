// Frontend data layer — reads G20 economic data from Supabase.
// One REST call fetches the entire dataset; much faster than live WB/IMF API calls.

const SUPABASE_URL = 'https://qozknjenyhewmkapsizk.supabase.co';
const SUPABASE_KEY = 'sb_publishable_8I4WpqENYtTkUNKzqfxkkQ_lrQKG3cG';

(function () {
  // Index structure: G20_DATA[iso3][indicatorKey][year] = value
  // Plus G20_DATA._latest[iso3][indicatorKey] = most recent value
  let _data = {};

  // Wider scopes render straight from the static shards (they hold the G20's annual
  // series too), so the first view never waits on the paginated Supabase read; the G20
  // annual, quarterly and metadata load continues in the background. The G20 scope
  // loads exactly as before.
  let _g20Full = false;
  async function loadAllData() {
    if (window.Scope && !Scope.isG20()) {
      const shard = await loadLatestShard();
      if (shard && shard.values) {
        _data = { _latest: {} };
        window.G20_DATA = _data;
        mergeLatestShard(shard, { overwriteG20: true });
        window.G20_BACKGROUND_LOAD = loadG20FromSupabase({ background: true })
          .catch(err => console.warn('Background G20 load failed; shards remain in use:', err));
        return _data;
      }
    }
    // G20 scope: render from the static snapshot (complete G20 annual + quarterly +
    // metadata, regenerated on every refresh and served from the CDN), then refresh the
    // values from Supabase in the background. Falls back to Supabase if the snapshot fails.
    try {
      const d = await loadG20FromSupabase({ preferSnapshot: true });
      window.G20_BACKGROUND_REFRESH = refreshG20FromSupabase()
        .catch(err => {
          console.warn('Background Supabase refresh skipped; snapshot remains in use:', err);
          window.G20_SNAPSHOT_AT = window.G20_SNAPSHOT_FIRST_AT;
          const el = document.getElementById('data-status');
          if (el) el.textContent = 'offline snapshot';
        });
      return d;
    } catch (err) {
      console.warn('Snapshot unavailable, loading from Supabase:', err);
      return loadG20FromSupabase();
    }
  }

  // Pull the G20 rows from Supabase after first paint and overwrite any value that
  // changed since the snapshot was built; recompute the latest reads for those economies.
  async function refreshG20FromSupabase() {
    const scopeIso3 = (window.G20_MEMBERS || []).map(c => c.iso3);
    if (!scopeIso3.length) return;
    const base = `${SUPABASE_URL}/rest/v1/g20_economic_data?select=country_iso3,indicator_key,year,value&country_iso3=in.(${scopeIso3.join(',')})&order=year.asc,country_iso3.asc,indicator_key.asc`;
    const headers = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };
    const rows = [];
    for (let offset = 0; ; offset += 1000) {
      const r = await fetch(base, { signal: AbortSignal.timeout(15000), headers: { ...headers, Range: `${offset}-${offset + 999}` } });
      if (!r.ok) throw new Error(`Supabase fetch failed: ${r.status}`);
      const page = await r.json();
      rows.push(...page);
      if (page.length < 1000) break;
    }
    let changed = 0;
    for (const { country_iso3: iso3, indicator_key: key, year, value } of rows) {
      if (!iso3 || !key || value === null || value === undefined) continue;
      if (!_data[iso3]) _data[iso3] = {};
      const cur = _data[iso3][key] || (_data[iso3][key] = {});
      if (cur[year] !== value) { cur[year] = value; changed++; }
    }
    if (changed) computeLatest(scopeIso3);
    window.G20_SUPABASE_REFRESHED = { at: new Date().toISOString(), changed };
  }

  // Most recent non-null actual value per economy per indicator (projections excluded).
  function computeLatest(isoList) {
    const cap = window.LATEST_ACTUAL_YEAR;
    _data._latest = _data._latest || {};
    for (const iso3 of isoList) {
      if (!_data[iso3]) continue;
      _data._latest[iso3] = _data._latest[iso3] || {};
      for (const key of Object.keys(_data[iso3])) {
        const years = Object.keys(_data[iso3][key]).map(Number).filter(y => y <= cap).sort((a, b) => b - a);
        for (const yr of years) {
          const v = _data[iso3][key][yr];
          if (v !== null && v !== undefined && !isNaN(v)) { _data._latest[iso3][key] = { value: v, year: yr }; break; }
        }
      }
    }
  }

  async function loadG20FromSupabase({ background = false, preferSnapshot = false } = {}) {
    // Supabase default page size is 1000 rows — paginate until all rows are fetched.
    // If Supabase is unreachable (free tier auto-pauses), fall back to the static snapshot.
    let rows = [];
    let snapshot = null;
    // Only fetch the countries the dashboard shows. The table now holds every
    // economy in the registry, so an unfiltered read would download them all.
    // Always the G20 (incl. the EU), whatever scope is selected: other economies come
    // from the static shards (data/latest.json up front, series on demand).
    const scopeIso3 = (window.G20_MEMBERS || window.G20 || []).map(c => c.iso3).join(',');
    const latestShard = background ? null : loadLatestShard();
    try {
      if (preferSnapshot) throw Object.assign(new Error('snapshot first'), { snapshotFirst: true });
      const PAGE = 1000;
      let offset = 0;
      while (true) {
        const r = await fetch(
          `${SUPABASE_URL}/rest/v1/g20_economic_data?select=country_iso3,indicator_key,year,value&country_iso3=in.(${scopeIso3})&order=year.asc,country_iso3.asc,indicator_key.asc`,
          {
            signal: AbortSignal.timeout(8000),
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
    } catch (err) {
      if (!err.snapshotFirst) console.warn('Supabase unavailable, using static snapshot:', err);
      const sr = await fetch('data-snapshot.json');
      if (!sr.ok) throw err;
      snapshot = await sr.json();
      rows = snapshot.annual.map(([country_iso3, indicator_key, year, value]) => ({ country_iso3, indicator_key, year, value }));
      // Only label the page "offline snapshot" when Supabase actually failed; the
      // snapshot-first path is the normal fast start and is refreshed in the background.
      if (err.snapshotFirst) window.G20_SNAPSHOT_FIRST_AT = snapshot.generatedAt;
      else window.G20_SNAPSHOT_AT = snapshot.generatedAt;
    }

    if (background) {
      // Shards already rendered the page: fill in any G20 years they lack, keep the rest.
      for (const { country_iso3: iso3, indicator_key: key, year, value } of rows) {
        if (iso3 && key) mergeSeries(iso3, key, { [year]: value });
      }
      _g20Full = true;
      if (snapshot) {
        window.G20_QDATA = buildQuarterlyIndex(snapshot.quarterly.map(([country_iso3, indicator_key, period, value]) => ({ country_iso3, indicator_key, period, value })));
        window.G20_INDICATOR_META = snapshot.meta || [];
        return _data;
      }
      await loadQuarterlyAndMeta();
      return _data;
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
    // capped at the latest actual year so IMF forward projections never appear as current data.
    const LATEST_YEAR_CAP = window.LATEST_ACTUAL_YEAR;
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
    _g20Full = true;
    await mergeLatestShard(await latestShard);

    if (snapshot) {
      window.G20_QDATA = buildQuarterlyIndex(snapshot.quarterly.map(([country_iso3, indicator_key, period, value]) => ({ country_iso3, indicator_key, period, value })));
      window.G20_INDICATOR_META = snapshot.meta || [];
      return _data;
    }

    await loadQuarterlyAndMeta();
    return _data;
  }

  async function loadQuarterlyAndMeta() {
    // Load quarterly data from g20_quarterly_data table (non-blocking; graceful fallback)
    try {
      // Paginate: Supabase caps a single response at 1000 rows and the table has several thousand.
      const qrows = [];
      for (let offset = 0; ; offset += 1000) {
        const qr = await fetch(
          `${SUPABASE_URL}/rest/v1/g20_quarterly_data?select=country_iso3,indicator_key,period,value&order=period.asc,country_iso3.asc,indicator_key.asc`,
          { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Range': `${offset}-${offset + 999}` } }
        );
        if (!qr.ok) throw new Error(`quarterly fetch failed: ${qr.status}`);
        const page = await qr.json();
        if (Array.isArray(page)) qrows.push(...page);
        if (!Array.isArray(page) || page.length < 1000) break;
      }
      window.G20_QDATA = buildQuarterlyIndex(qrows);
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

  }

  // ── Static shards (global scope) ──────────────────────────────────────────
  // data/latest.json      every economy x indicator: [value, year] (latest actual only)
  // data/indicator/K.json one indicator's actual series for every economy
  // data/country/ISO.json one economy's series (+ IMF projections, kept separate)
  const SHARD_BASE = 'data/';
  const _loadedIndicators = new Set();
  const _loadedCountries = new Set();
  const _inflight = new Map();

  function loadLatestShard() {
    return fetch(SHARD_BASE + 'latest.json').then(r => r.ok ? r.json() : null).catch(() => null);
  }

  // G20 values already come from Supabase; the shard fills every other economy
  // (and, when rendering from shards first, the G20 too).
  function mergeLatestShard(shard, { overwriteG20 = false } = {}) {
    if (!shard || !shard.values) return;
    window.COVERAGE_TIERS = shard.tiers || {};
    window.SHARDS_GENERATED_AT = shard.generatedAt;
    const g20 = new Set((window.G20_MEMBERS || []).map(c => c.iso3));
    for (const [iso3, vals] of Object.entries(shard.values)) {
      if (!overwriteG20 && g20.has(iso3) && _data._latest[iso3]) continue;
      _data._latest[iso3] = _data._latest[iso3] || {};
      for (const [key, [value, year]] of Object.entries(vals)) {
        if (year <= window.LATEST_ACTUAL_YEAR) _data._latest[iso3][key] = { value, year };
      }
    }
  }

  function mergeSeries(iso3, key, series) {
    if (!_data[iso3]) _data[iso3] = {};
    const cur = _data[iso3][key] || (_data[iso3][key] = {});
    for (const [y, v] of Object.entries(series)) if (cur[y] === undefined) cur[y] = v;
  }

  function once(id, fn) {
    if (!_inflight.has(id)) _inflight.set(id, fn().catch(e => { _inflight.delete(id); throw e; }));
    return _inflight.get(id);
  }

  // Load indicator shards (all economies' actual series) for the given keys.
  function ensureIndicators(keys) {
    const need = keys.filter(k => !_loadedIndicators.has(k) && window.INDICATORS?.[k]);
    return Promise.all(need.map(k => once('i:' + k, async () => {
      const r = await fetch(`${SHARD_BASE}indicator/${k}.json`);
      if (!r.ok) throw new Error(`indicator shard ${k}: ${r.status}`);
      const shard = await r.json();
      for (const [iso3, series] of Object.entries(shard.series || {})) mergeSeries(iso3, k, series);
      _loadedIndicators.add(k);
    })));
  }

  // Load one economy's full series, including IMF projections (years > latest actual).
  function ensureCountry(iso3) {
    if (_loadedCountries.has(iso3)) return Promise.resolve();
    if (_g20Full && (window.G20_MEMBERS || []).some(c => c.iso3 === iso3) && _data[iso3]) { _loadedCountries.add(iso3); return Promise.resolve(); }
    return once('c:' + iso3, async () => {
      const r = await fetch(`${SHARD_BASE}country/${iso3}.json`);
      if (!r.ok) throw new Error(`country shard ${iso3}: ${r.status}`);
      const shard = await r.json();
      for (const [key, series] of Object.entries(shard.series || {})) mergeSeries(iso3, key, series);
      for (const [key, series] of Object.entries(shard.projections || {})) mergeSeries(iso3, key, series);
      _loadedCountries.add(iso3);
    });
  }

  // Series each page needs across the whole scope (latest values are already loaded).
  const PAGE_INDICATORS = {
    overview: ['GDP', 'GDP_GROWTH', 'INFLATION', 'UNEMPLOYMENT', 'DEBT_GDP', 'CURRENT_ACC'],
    analysis: ['GDP_CAPITA_PPP', 'GDP_GROWTH', 'UNEMPLOYMENT', 'DEBT_GDP', 'FISCAL_BAL', 'GDP', 'INFLATION'],
    prosperity: ['GDP_CAPITA_PPP', 'GDP_CAPITA', 'GDP_GROWTH', 'POPULATION'],
    compare: null, // the selected indicator only (see pendingFor)
    flags: [],
    countries: [],
  };

  // Resolves once the data a page needs for the current scope is loaded. Returns null
  // when nothing is missing (render immediately), else a promise.
  function pendingFor(page) {
    // Booted from shards in a wider scope and switched back to the G20: wait for the
    // background G20 load (quarterly data, metadata) before rendering G20 pages.
    if (window.Scope?.isG20?.() && !_g20Full && window.G20_BACKGROUND_LOAD) return window.G20_BACKGROUND_LOAD.then(() => {});
    if (window.Scope?.isG20?.() && !page.startsWith('country/')) return null;
    if (page.startsWith('country/')) {
      const iso3 = page.split('/')[1];
      return _loadedCountries.has(iso3) || (_g20Full && (window.G20_MEMBERS || []).some(c => c.iso3 === iso3) && _data[iso3])
        ? null : ensureCountry(iso3);
    }
    const wanted = page === 'compare' ? [window.compareSelectedIndicator?.() || 'GDP_GROWTH', 'GDP'] : (PAGE_INDICATORS[page] || []);
    const keys = wanted.filter(k => !_loadedIndicators.has(k));
    return keys.length ? ensureIndicators(keys) : null;
  }

  const getTier = (iso3) => window.COVERAGE_TIERS?.[iso3] ?? null;

  // Build quarterly data index from flat row array.
  // Index: _qdata[iso3][key][period] = value
  // _qlatest[iso3][key] = { value, period } for most recent period
  function buildQuarterlyIndex(rows) {
    const idx = {};
    const latest = {};
    for (const { country_iso3: iso3, indicator_key: key, period, value } of rows) {
      if (!iso3 || !key || !period || value == null) continue;
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
  // Pass { annualOnly: true } for cross-country comparisons: quarterly vintages differ by country,
  // so rankings and G20 medians must use one consistent annual year.
  function getLatest(iso3, key, { annualOnly = false } = {}) {
    const qLatest = annualOnly ? null : window.G20_QDATA?._qlatest?.[iso3]?.[key];
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
      .filter(d => d.value !== null && !isNaN(d.value) && (!fromYear || d.year >= fromYear) && d.year <= window.LATEST_ACTUAL_YEAR)
      .sort((a, b) => a.year - b.year);
  }

  // Get historical + IMF forecast series [{year, value, isProjection}].
  // Years up to LATEST_ACTUAL_YEAR are flagged isProjection: false; later years are IMF forecasts.
  function getSeriesWithProjections(iso3, key, fromYear) {
    const raw = window.G20_DATA?.[iso3]?.[key] || {};
    return Object.entries(raw)
      .map(([y, v]) => ({ year: parseInt(y, 10), value: v, isProjection: parseInt(y, 10) > window.LATEST_ACTUAL_YEAR }))
      .filter(d => d.value !== null && !isNaN(d.value) && (!fromYear || d.year >= fromYear))
      .sort((a, b) => a.year - b.year);
  }

  // Get latest values for all G20 countries for one indicator, sorted desc by value.
  function getRanking(key) {
    return window.G20
      .map(c => {
        const l = getLatest(c.iso3, key, { annualOnly: true });
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
      const gdp   = getLatest(c.iso3, 'GDP', { annualOnly: true });
      const gr    = getLatest(c.iso3, 'GDP_GROWTH', { annualOnly: true });
      const inf   = getLatest(c.iso3, 'INFLATION', { annualOnly: true });
      const une   = getLatest(c.iso3, 'UNEMPLOYMENT', { annualOnly: true });
      const debt  = getLatest(c.iso3, 'DEBT_GDP', { annualOnly: true });
      const youth = getLatest(c.iso3, 'YOUTH_UNEMP', { annualOnly: true });
      const educ  = getLatest(c.iso3, 'EDUC_EXP', { annualOnly: true });
      if (!gdp && !gr) continue;
      const parts = [`${c.name}:`];
      if (gdp)   parts.push(`GDP ${window.A ? A.fmtGDPScaled(gdp.value) : `$${(gdp.value/1e12).toFixed(2)}T`} (${gdp.year})`);
      if (gr)    parts.push(`growth ${gr.value.toFixed(1)}% (${gr.year})`);
      if (inf)   parts.push(`inflation ${inf.value.toFixed(1)}% (${inf.year})`);
      if (une)   parts.push(`unemployment ${une.value.toFixed(1)}% (${une.year})`);
      if (debt)  parts.push(`debt/GDP ${debt.value.toFixed(0)}% (${debt.year})`);
      if (youth) parts.push(`youth unemp ${youth.value.toFixed(1)}% (${youth.year})`);
      if (educ)  parts.push(`education ${educ.value.toFixed(1)}% GDP (${educ.year})`);
      const fisc = getLatest(c.iso3, 'FISCAL_BAL', { annualOnly: true });
      const tax  = getLatest(c.iso3, 'TAX_REVENUE', { annualOnly: true });
      const exp  = getLatest(c.iso3, 'EXPORTS_GDP', { annualOnly: true });
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
    const country = window.G20?.find(c => c.iso3 === iso3) || window.findEconomy?.(iso3);
    if (!country) return '';

    const indicators = ['GDP', 'GDP_GROWTH', 'INFLATION', 'UNEMPLOYMENT', 'DEBT_GDP',
                        'FISCAL_BAL', 'CURRENT_ACC', 'GDP_CAPITA_PPP', 'YOUTH_UNEMP'];
    const lines = [`${country.name} Economic Snapshot:`];
    for (const key of indicators) {
      const d = getLatest(iso3, key);
      if (!d) continue;
      const label = window.INDICATORS?.[key]?.label || key;
      const unit  = window.INDICATORS?.[key]?.unit || '';
      lines.push(`  ${label}: ${d.value.toFixed(2)} ${unit} (${d.period || d.year})`);
    }

    // IMF projections for GDP growth
    const projSeries = getSeriesWithProjections(iso3, 'GDP_GROWTH', 2023)
      .filter(d => d.isProjection).slice(0, 3);
    if (projSeries.length) {
      lines.push('  IMF Forecast (GDP growth):');
      projSeries.forEach(d => lines.push(`    ${d.year}: ${d.value.toFixed(1)}%`));
    }

    // Fundamentals fragility score (descriptive vulnerability, not a recession forecast)
    if (window.computeRiskScore) {
      const risk = window.computeRiskScore(iso3);
      lines.push(`  Fundamentals fragility score: ${risk.score}/100 (${risk.label}; descriptive exposure, not a recession forecast), signals: ${risk.signals.join(', ') || 'none'}`);
    }

    // Model growth forecast (1-year-ahead) alongside the IMF projection
    if (window.computeGrowthForecast) {
      const fc = window.computeGrowthForecast(iso3);
      if (fc) {
        lines.push(`  Model growth forecast (${fc.targetYear}): ${fc.modelForecast >= 0 ? '+' : ''}${fc.modelForecast.toFixed(1)}%` +
          (fc.imfForecast != null ? ` vs IMF ${fc.imfForecast >= 0 ? '+' : ''}${fc.imfForecast.toFixed(1)}% (${fc.imfYear})` : '') +
          ` [ridge model, RMSE ±${fc.rmse}pp; cite both, do not present as certainty]`);
      }
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

  window.G20Data = { loadAllData, getLatest, getSeries, getSeriesWithProjections, getRanking, buildAgentContext, buildCountryContext, getIndicatorMeta, getQuarterlySeries,
    ensureIndicators, ensureCountry, pendingFor, getTier };
})();
