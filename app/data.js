// Frontend data layer — fetches World Bank + IMF data, merges into window.G20_DATA.
// All WB/IMF calls go through /api/wb and /api/imf (server-side proxy, 24h cache).

(function () {
  // Index structure: G20_DATA[iso3][indicatorKey][year] = value
  // Plus G20_DATA._latest[iso3][indicatorKey] = most recent value
  let _data = {};

  async function loadAllData() {
    const wbKeys = Object.entries(window.INDICATORS)
      .filter(([, v]) => v.wb)
      .map(([k]) => k);

    // Fetch all WB indicators in parallel
    const wbFetches = wbKeys.map(key =>
      fetch(`/api/wb?indicator=${window.INDICATORS[key].wb}`)
        .then(r => r.json())
        .then(json => ({ key, data: json.data || [] }))
        .catch(() => ({ key, data: [] }))
    );

    // Fetch IMF debt data
    const imfFetch = fetch('/api/imf?indicator=GGXWDG_NGDP')
      .then(r => r.json())
      .then(json => ({ key: 'DEBT_GDP', data: json.data || [] }))
      .catch(() => ({ key: 'DEBT_GDP', data: [] }));

    const results = await Promise.all([...wbFetches, imfFetch]);

    // Build nested index
    _data = {};
    for (const { key, data } of results) {
      for (const row of data) {
        const iso3 = row.country;
        if (!iso3) continue;
        if (!_data[iso3]) _data[iso3] = {};
        if (!_data[iso3][key]) _data[iso3][key] = {};
        _data[iso3][key][row.year] = row.value;
      }
    }

    // Build _latest: most recent non-null value per country per indicator
    _data._latest = {};
    for (const iso3 of Object.keys(_data)) {
      if (iso3 === '_latest') continue;
      _data._latest[iso3] = {};
      for (const key of Object.keys(_data[iso3])) {
        const years = Object.keys(_data[iso3][key]).map(Number).sort((a, b) => b - a);
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
    return _data;
  }

  // Get the latest value + year for a country + indicator.
  function getLatest(iso3, key) {
    return window.G20_DATA?._latest?.[iso3]?.[key] || null;
  }

  // Get time series [{year, value}] for a country + indicator, sorted ascending.
  function getSeries(iso3, key, fromYear) {
    const raw = window.G20_DATA?.[iso3]?.[key] || {};
    return Object.entries(raw)
      .map(([y, v]) => ({ year: parseInt(y, 10), value: v }))
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
      const gdp = getLatest(c.iso3, 'GDP');
      const gr  = getLatest(c.iso3, 'GDP_GROWTH');
      const inf = getLatest(c.iso3, 'INFLATION');
      const une = getLatest(c.iso3, 'UNEMPLOYMENT');
      const debt= getLatest(c.iso3, 'DEBT_GDP');
      if (!gdp && !gr) continue;
      const parts = [`${c.name}:`];
      if (gdp)  parts.push(`GDP $${(gdp.value/1e12).toFixed(2)}T (${gdp.year})`);
      if (gr)   parts.push(`growth ${gr.value.toFixed(1)}% (${gr.year})`);
      if (inf)  parts.push(`inflation ${inf.value.toFixed(1)}% (${inf.year})`);
      if (une)  parts.push(`unemployment ${une.value.toFixed(1)}% (${une.year})`);
      if (debt) parts.push(`debt/GDP ${debt.value.toFixed(0)}% (${debt.year})`);
      lines.push(parts.join(' | '));
    }
    return lines.join('\n');
  }

  window.G20Data = { loadAllData, getLatest, getSeries, getRanking, buildAgentContext };
})();
