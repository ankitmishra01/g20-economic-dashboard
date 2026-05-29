#!/usr/bin/env node
// G20 Economic Dashboard — Supabase data pipeline
// Fetches World Bank + IMF open data and seeds into Supabase.
// Run: node sync/seed.js
// Requires: Node 18+ (native fetch). No npm install needed.
// Credentials can be passed via env vars (used by GitHub Actions).

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qozknjenyhewmkapsizk.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_8I4WpqENYtTkUNKzqfxkkQ_lrQKG3cG';

const G20_ISO3 = [
  'USA','GBR','CAN','DEU','FRA','ITA','JPN','AUS','KOR',
  'CHN','IND','BRA','MEX','ARG','RUS','SAU','ZAF','IDN','TUR','EUU',
];

// OECD member countries that are also G20 members
const OECD_G20 = ['AUS','CAN','DEU','FRA','GBR','ITA','JPN','KOR','MEX','TUR','USA'];
// Plus OECD key partners that have meaningful R&D/health data
const OECD_PARTNERS = ['CHN','IND','BRA','ARG','RUS','ZAF','IDN'];

const WB_INDICATORS = {
  // Core macro
  GDP:            'NY.GDP.MKTP.CD',
  GDP_GROWTH:     'NY.GDP.MKTP.KD.ZG',
  INFLATION:      'FP.CPI.TOTL.ZG',
  UNEMPLOYMENT:   'SL.UEM.TOTL.ZS',
  CURRENT_ACC:    'BN.CAB.XOKA.GD.ZS',
  GDP_CAPITA:     'NY.GDP.PCAP.CD',
  GDP_CAPITA_PPP: 'NY.GDP.PCAP.PP.CD',
  CO2_CAPITA:     'EN.ATM.CO2E.PC',
  TRADE_GDP:      'NE.TRD.GNFS.ZS',
  EXPORTS_GDP:    'NE.EXP.GNFS.ZS',
  CAPITAL_FORM:   'NE.GDI.TOTL.ZS',
  MANUFACTURING:  'NV.IND.MANF.ZS',
  POPULATION:     'SP.POP.TOTL',
  FDI_INFLOWS:    'BX.KLT.DINV.WD.GD.ZS',
  // Social & human development
  HEALTH_EXP:     'SH.XPD.CHEX.GD.ZS',  // Current health expenditure % GDP (WHO via WB)
  EDUC_EXP:       'SE.XPD.TOTL.GD.ZS',  // Government education expenditure % GDP
  LIFE_EXPECT:    'SP.DYN.LE00.IN',      // Life expectancy at birth (years)
  YOUTH_UNEMP:    'SL.UEM.1524.ZS',      // Youth (15–24) unemployment %
  FEMALE_LFP:     'SL.TLF.CACT.FE.ZS',  // Female labour force participation %
  RESEARCHERS:    'SP.POP.SCIE.RD.P6',   // Researchers per million people
  // Innovation & fiscal
  RD_EXP:         'GB.XPD.RSDV.GD.ZS',  // R&D expenditure % GDP (UNESCO; OECD overwrites)
  TAX_REVENUE:    'GC.TAX.TOTL.GD.ZS',  // Central government tax revenue % GDP
  GINI:           'SI.POV.GINI',          // Gini inequality index (World Bank)
};

// IMF countries (EUU not available in IMF DataMapper)
const IMF_COUNTRIES = [
  'USA','GBR','CAN','DEU','FRA','ITA','JPN','AUS','KOR',
  'CHN','IND','BRA','MEX','ARG','RUS','SAU','ZAF','IDN','TUR',
];

// EUU excluded from validation (not in IMF; fewer WB indicators)
const EXPECTED_COUNTRIES = [
  'USA','GBR','CAN','DEU','FRA','ITA','JPN','AUS','KOR',
  'CHN','IND','BRA','MEX','ARG','RUS','SAU','ZAF','IDN','TUR',
];

const YEARS = '2000:2025';
const YEAR_END = YEARS.split(':')[1];
const CHUNK_SIZE = 500;

// Plausible value ranges for sanity checking
const RANGES = {
  GDP:          [1e8,   45e12],  // $100M – $45T (USA 2025 ~$30T; allow headroom)
  GDP_GROWTH:   [-30,   30],     // % — COVID dip was ~-10% for most; Argentina/Russia edge cases
  INFLATION:    [-5,    400],    // Argentina hit ~290% in 2023
  UNEMPLOYMENT: [0,     40],
  CURRENT_ACC:  [-35,   35],     // % of GDP
  GDP_CAPITA:   [500,   110000],
  CO2_CAPITA:   [0,     25],     // tonnes; Australia/Saudi ~15, USA ~14
  TRADE_GDP:    [0,     200],    // % of GDP; G20 none over 100 except Saudi ~60
  POPULATION:   [1e6,   2e9],
  DEBT_GDP:     [0,     350],    // % of GDP; Japan ~260%, some others high
  HEALTH_EXP:   [1,     25],    // % GDP; USA ~17%, most OECD ~8-12%
  RD_EXP:       [0,     7],     // % GDP; Korea ~4.9%, most 1-3%
  GINI:         [20,    70],    // 0-100 index; ZAF ~63, DEN ~28
  FISCAL_BAL:   [-30,   20],   // % GDP net lending/borrowing; most -10 to +5
  GDP_CAPITA_PPP:[500, 130000], // PPP-adjusted; LUX >100K, G20 range 5K-90K
  EXPORTS_GDP:  [5,    80],    // % GDP; SAU ~40%, KOR ~44%, CHN ~20%
  CAPITAL_FORM: [10,   50],    // % GDP; typical range 15-35%
  MANUFACTURING:[5,    40],    // % GDP; CHN ~28%, SAU ~10%, USA ~11%
  FDI_INFLOWS:  [-5,   20],    // % GDP; volatile; can be negative (repatriation)
  EDUC_EXP:     [1,    10],    // % GDP; typical 4-7%
  LIFE_EXPECT:  [55,   90],    // years; ZAF ~64, JPN ~84
  YOUTH_UNEMP:  [3,    60],    // %; ZAF ~55%, SAU ~30%, JPN ~4%
  FEMALE_LFP:   [15,   80],    // %; SAU ~20%, ZAF~47%, CHN ~60%, CAN ~61%
  RESEARCHERS:  [0,   10000],  // per million; KOR ~8500, SAU ~300
  TAX_REVENUE:  [5,    50],    // % GDP; most 15-40%
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function upsert(rows) {
  if (!rows.length) return;
  for (const batch of chunk(rows, CHUNK_SIZE)) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/g20_economic_data`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify(batch),
    });
    if (!r.ok) {
      const text = await r.text();
      throw new Error(`Supabase upsert failed (${r.status}): ${text}`);
    }
  }
}

// ── World Bank ────────────────────────────────────────────────────────────────

async function fetchWB(indicatorKey, wbCode) {
  const countries = G20_ISO3.join(';');
  const url = `https://api.worldbank.org/v2/country/${countries}/indicator/${wbCode}?format=json&date=${YEARS}&per_page=2000`;

  const r = await fetch(url, {
    headers: { 'User-Agent': 'G20Dashboard-Seed/1.0' },
    signal: AbortSignal.timeout(45000),
  });
  if (!r.ok) throw new Error(`World Bank API ${r.status} for ${wbCode}`);

  const json = await r.json();
  if (!Array.isArray(json) || json.length < 2 || !json[1]) {
    console.warn(`  ⚠ No data returned for ${indicatorKey}`);
    return [];
  }

  return json[1]
    .filter(d => d.value !== null && d.value !== undefined)
    .map(d => ({
      country_iso3:  d.countryiso3code || d.country?.id,
      indicator_key: indicatorKey,
      year:          parseInt(d.date, 10),
      value:         d.value,
      source:        'worldbank',
    }))
    .filter(d => d.country_iso3 && G20_ISO3.includes(d.country_iso3));
}

// ── IMF World Economic Outlook (WEO) ─────────────────────────────────────────
// IMF WEO is compiled directly from national statistical offices — it is the most
// authoritative and timely multi-country source for macro indicators, with 2025
// estimates available from the April 2026 WEO release.

async function fetchIMFWEO(weoCode, indicatorKey, transform) {
  const url = `https://www.imf.org/external/datamapper/api/v1/${weoCode}`;
  const r = await fetch(url, {
    headers: { 'User-Agent': 'G20Dashboard-Seed/1.0', 'Accept': 'application/json' },
    signal: AbortSignal.timeout(45000),
  });
  if (!r.ok) throw new Error(`IMF WEO ${r.status} for ${weoCode}`);

  const json = await r.json();
  const values = json?.values?.[weoCode] || {};
  const yearCap = parseInt(YEAR_END, 10); // exclude forward projections (WEO goes to 2030)

  const rows = [];
  for (const [imfCode, years] of Object.entries(values)) {
    if (!IMF_COUNTRIES.includes(imfCode)) continue;
    for (const [yearStr, value] of Object.entries(years)) {
      const year = parseInt(yearStr, 10);
      if (year < 2000 || year > yearCap || value === null || value === undefined) continue;
      const finalValue = transform ? transform(value) : value;
      rows.push({
        country_iso3:  imfCode,
        indicator_key: indicatorKey,
        year,
        value:         finalValue,
        source:        'imf_weo',
      });
    }
  }
  return rows;
}

// ── IMF DataMapper ────────────────────────────────────────────────────────────

async function fetchIMF() {
  const url = 'https://www.imf.org/external/datamapper/api/v1/GGXWDG_NGDP';
  const r = await fetch(url, {
    headers: { 'User-Agent': 'G20Dashboard-Seed/1.0', 'Accept': 'application/json' },
    signal: AbortSignal.timeout(45000),
  });
  if (!r.ok) throw new Error(`IMF API ${r.status}`);

  const json = await r.json();
  const values = json?.values?.GGXWDG_NGDP || {};

  const rows = [];
  for (const [imfCode, years] of Object.entries(values)) {
    if (!IMF_COUNTRIES.includes(imfCode)) continue;
    for (const [yearStr, value] of Object.entries(years)) {
      const year = parseInt(yearStr, 10);
      if (year < 2000 || value === null || value === undefined) continue;
      rows.push({
        country_iso3:  imfCode,
        indicator_key: 'DEBT_GDP',
        year,
        value,
        source: 'imf',
      });
    }
  }
  return rows;
}

// ── OECD ─────────────────────────────────────────────────────────────────────

function parseOECDSDMX(json, indicatorKey) {
  const structure = json?.data?.structures?.[0];
  const dataSet   = json?.data?.dataSets?.[0];
  if (!structure || !dataSet) return [];

  const seriesDims = structure.dimensions?.series || [];
  const obsDims    = structure.dimensions?.observation || [];

  const areaIdx    = seriesDims.findIndex(d => d.id === 'REF_AREA');
  if (areaIdx === -1) return [];
  const areaValues = seriesDims[areaIdx].values;

  const timeDim    = obsDims.find(d => d.id === 'TIME_PERIOD');
  const timeValues = timeDim?.values || [];

  const rows = [];
  for (const [seriesKey, seriesData] of Object.entries(dataSet.series || {})) {
    const parts = seriesKey.split(':');
    const iso3  = areaValues[parseInt(parts[areaIdx])]?.id;
    if (!iso3 || !G20_ISO3.includes(iso3)) continue;

    for (const [obsIdx, obsArr] of Object.entries(seriesData.observations || {})) {
      const value = Array.isArray(obsArr) ? obsArr[0] : obsArr;
      const year  = parseInt(timeValues[parseInt(obsIdx)]?.id, 10);
      if (!year || value === null || value === undefined || isNaN(Number(value))) continue;
      rows.push({ country_iso3: iso3, indicator_key: indicatorKey, year, value: Number(value), source: 'oecd' });
    }
  }
  return rows;
}

async function fetchOECDRD() {
  // OECD MSTI — Gross domestic expenditure on R&D (GERD) as % of GDP.
  // Overwrites WB R&D data for OECD members; non-members keep WB values.
  const countries = [...OECD_G20, ...OECD_PARTNERS].join('+');
  const url = `https://sdmx.oecd.org/public/rest/data/OECD.STI.STP,DSD_MSTI@DF_MSTI,1.0/A.${countries}.GERD.PT_B1GQ?format=jsondata&startPeriod=2000&endPeriod=${YEAR_END}`;
  const r = await fetch(url, {
    headers: { 'User-Agent': 'G20Dashboard-Seed/1.0', 'Accept': 'application/json' },
    signal: AbortSignal.timeout(45000),
  });
  if (!r.ok) throw new Error(`OECD MSTI API ${r.status}`);
  const json = await r.json();
  const rows = parseOECDSDMX(json, 'RD_EXP');
  if (!rows.length) throw new Error('OECD MSTI: no rows parsed — check dimension key');
  return rows;
}

// ── Validation ────────────────────────────────────────────────────────────────

async function validate() {
  console.log('\n── Data Quality Report ──────────────────────────');

  // Fetch all rows to validate (paginated)
  const PAGE = 1000;
  const allRows = [];
  let offset = 0;
  while (true) {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/g20_economic_data?select=country_iso3,indicator_key,year,value`,
      {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Range': `${offset}-${offset + PAGE - 1}`,
        },
      }
    );
    const page = await r.json();
    allRows.push(...page);
    if (page.length < PAGE) break;
    offset += PAGE;
  }

  // Build summary: summary[indicator][country] = { latestYear, latestValue }
  const summary = {};
  for (const { country_iso3: c, indicator_key: k, year, value } of allRows) {
    if (!summary[k]) summary[k] = {};
    if (!summary[k][c] || year > summary[k][c].latestYear) {
      summary[k][c] = { latestYear: year, latestValue: value };
    }
  }

  const ALL_INDICATORS = [...Object.keys(WB_INDICATORS), 'DEBT_GDP', 'FISCAL_BAL'];
  const issues = [];

  const report = { generatedAt: new Date().toISOString(), totalRows: allRows.length, indicators: {} };

  for (const ind of ALL_INDICATORS) {
    const indData = summary[ind] || {};
    const covered    = EXPECTED_COUNTRIES.filter(c => indData[c]);
    const missing    = EXPECTED_COUNTRIES.filter(c => !indData[c]);
    const latestYear = covered.length ? Math.max(...covered.map(c => indData[c].latestYear)) : 0;
    const [lo, hi]   = RANGES[ind] || [-Infinity, Infinity];

    const outOfRange = covered.filter(c => {
      const v = indData[c].latestValue;
      return v < lo || v > hi;
    });

    report.indicators[ind] = { covered: covered.length, missing, latestYear, outOfRange };

    // GINI is survey-based and only published every few years — relax thresholds
    const staleYear    = ind === 'GINI' ? 2015 : 2021;
    const minCoverage  = ind === 'GINI' ? 10   : 2;     // allow sparser coverage
    const staleMark = latestYear < staleYear ? ' ⚠ STALE'   : '';
    const missMark  = missing.length > minCoverage ? ` ⚠ MISSING: ${missing.slice(0,4).join(',')}${missing.length > 4 ? '…' : ''}` : '';
    const rangeMark = outOfRange.length  ? ` ⚠ OUT-OF-RANGE: ${outOfRange.join(',')}` : '';
    console.log(`  ${ind.padEnd(14)} covered:${String(covered.length).padStart(2)}/19  latest:${latestYear || '—'}${staleMark}${missMark}${rangeMark}`);

    if (missing.length > minCoverage) issues.push(`${ind}: missing ${missing.join(', ')}`);
    if (latestYear < staleYear)       issues.push(`${ind}: latest year ${latestYear} — stale`);
    if (outOfRange.length > 0)        issues.push(`${ind}: out-of-range for ${outOfRange.join(', ')}`);
  }

  console.log(`\n  Total rows in Supabase: ${allRows.length.toLocaleString()}`);

  if (issues.length) {
    console.log(`\n  ${issues.length} issue(s) found:`);
    issues.forEach(i => console.log(`    ⚠ ${i}`));
  } else {
    console.log('\n  ✓ All indicators look healthy — good coverage, no stale or out-of-range data.');
  }

  // Write report.json for GitHub Actions artifact
  try {
    const fs = await import('fs');
    fs.writeFileSync(
      new URL('./report.json', import.meta.url).pathname,
      JSON.stringify({ ...report, issues }, null, 2)
    );
  } catch (_) { /* non-fatal if running in an env without fs write access */ }
}

// ── Quarterly data pipeline ───────────────────────────────────────────────────

async function upsertQuarterly(rows) {
  if (!rows.length) return;
  for (const batch of chunk(rows, CHUNK_SIZE)) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/g20_quarterly_data`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify(batch),
    });
    if (!r.ok) {
      const text = await r.text();
      throw new Error(`g20_quarterly_data upsert failed (${r.status}): ${text}`);
    }
  }
}

// Convert '2026-Q1' → '2026Q1'
function oecd2period(str) {
  return str ? str.replace('-Q', 'Q') : null;
}

// Fetch quarterly GDP growth (year-on-year, seasonally adjusted) from OECD National Accounts.
// Uses the OECD.Stat SDMX-JSON API (QNA dataset, B1_GE.GPSA = GDP YoY SA).
// Filters for: TRANSFORMATION=GY, TRANSACTION=B1GQ, ADJUSTMENT=Y
async function fetchOECDQNA(iso3, startPeriod = '2018-Q1') {
  const url = `https://stats.oecd.org/SDMX-JSON/data/QNA/${iso3}.B1_GE.GPSA.Q/all?startTime=${startPeriod}`;
  const r = await fetch(url, {
    headers: { 'User-Agent': 'G20Dashboard-Seed/1.0', 'Accept': 'application/json' },
    signal: AbortSignal.timeout(45000),
  });
  if (!r.ok) throw new Error(`OECD QNA ${r.status} for ${iso3}`);

  const json = await r.json();
  const data    = json?.data;
  const structs = data?.structures?.[0];
  const ds      = data?.dataSets?.[0];
  if (!structs || !ds) throw new Error(`OECD QNA: no data for ${iso3}`);

  const sdims = structs.dimensions?.series || [];
  const odims = structs.dimensions?.observation || [];

  const trIdx  = sdims.findIndex(x => x.id === 'TRANSFORMATION');
  const txIdx  = sdims.findIndex(x => x.id === 'TRANSACTION');
  const adjIdx = sdims.findIndex(x => x.id === 'ADJUSTMENT');
  if (trIdx < 0 || txIdx < 0 || adjIdx < 0) throw new Error(`OECD QNA: missing dims for ${iso3}`);

  const gyIdx   = sdims[trIdx].values.findIndex(v => v.id === 'GY');
  const b1gqIdx = sdims[txIdx].values.findIndex(v => v.id === 'B1GQ');
  const yIdx    = sdims[adjIdx].values.findIndex(v => v.id === 'Y');

  const td = odims.find(x => x.id === 'TIME_PERIOD');
  if (!td) throw new Error(`OECD QNA: no TIME_PERIOD for ${iso3}`);
  const tv = td.values;

  // Deduplicate by period — multiple series may match the filter; keep first non-null value per period
  const seen = new Map();
  for (const [sk, sv] of Object.entries(ds.series || {})) {
    const parts = sk.split(':').map(Number);
    if (parts[trIdx] !== gyIdx || parts[txIdx] !== b1gqIdx || parts[adjIdx] !== yIdx) continue;
    for (const [obsKey, obsArr] of Object.entries(sv.observations || {})) {
      const period = oecd2period(tv[parseInt(obsKey)]?.id);
      const value  = Array.isArray(obsArr) ? obsArr[0] : obsArr;
      if (!period || value === null || isNaN(Number(value))) continue;
      if (!seen.has(period)) seen.set(period, Number(value));
    }
  }
  return Array.from(seen.entries()).map(([period, value]) => ({
    country_iso3: iso3, indicator_key: 'GDP_GROWTH', period, value, source: 'oecd_qna',
  }));
}

// G20 OECD members that have quarterly national accounts data
const OECD_QNA_COUNTRIES = ['AUS', 'CAN', 'GBR', 'DEU', 'FRA', 'ITA', 'JPN', 'KOR', 'MEX', 'TUR', 'USA'];

async function fetchAllOECDQuarterly() {
  const allRows = [];
  for (const iso3 of OECD_QNA_COUNTRIES) {
    process.stdout.write(`  ${iso3}…`);
    try {
      const rows = await fetchOECDQNA(iso3);
      allRows.push(...rows);
      process.stdout.write(`${rows.length}q `);
    } catch (e) {
      process.stdout.write(`✗ `);
    }
    await new Promise(r => setTimeout(r, 300));
  }
  console.log('');
  return allRows;
}

// FRED (St. Louis Fed) — USA quarterly data, requires free API key
// Set process.env.FRED_API_KEY to enable. Key available at fred.stlouisfed.org
async function fetchFREDQuarterly(apiKey) {
  const SERIES = [
    { id: 'A191RL1Q225SBEA', key: 'GDP_GROWTH'  }, // Real GDP % change annualized
    { id: 'CPIAUCSL',        key: 'INFLATION'   }, // CPI monthly → Q average
    { id: 'UNRATE',          key: 'UNEMPLOYMENT'}, // Unemployment monthly → Q average
  ];
  const rows = [];
  for (const s of SERIES) {
    try {
      const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${s.id}&api_key=${apiKey}&file_type=json&observation_start=2018-01-01&sort_order=asc`;
      const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (!r.ok) continue;
      const json = await r.json();
      // Group observations into quarterly averages
      const qMap = {};
      for (const obs of (json?.observations || [])) {
        if (!obs.date || obs.value === '.') continue;
        const [yr, mo] = obs.date.split('-').map(Number);
        const period = `${yr}Q${Math.ceil(mo / 3)}`;
        if (!qMap[period]) qMap[period] = [];
        qMap[period].push(parseFloat(obs.value));
      }
      for (const [period, vals] of Object.entries(qMap)) {
        const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
        rows.push({ country_iso3: 'USA', indicator_key: s.key, period, value: avg, source: 'fred' });
      }
    } catch (_) {}
  }
  return rows;
}

// ── Indicator metadata ────────────────────────────────────────────────────────

async function seedIndicatorMetadata() {
  const META = [
    { key: 'GDP',            label: 'GDP',                         unit: 'USD',      description: 'Gross Domestic Product at current market prices',                             source_name: 'World Bank',     source_code: 'NY.GDP.MKTP.CD',       source_url: 'https://data.worldbank.org/indicator/NY.GDP.MKTP.CD',       coverage_note: '19/19 G20 economies' },
    { key: 'GDP_GROWTH',     label: 'Real GDP Growth',             unit: '%',        description: 'Annual real GDP growth rate (constant prices)',                                source_name: 'IMF WEO',        source_code: 'NGDP_RPCH',            source_url: 'https://www.imf.org/en/Publications/WEO',                   coverage_note: '19/19 G20 economies' },
    { key: 'INFLATION',      label: 'Inflation',                   unit: '%',        description: 'Average consumer prices, annual % change',                                    source_name: 'IMF WEO',        source_code: 'PCPIPCH',              source_url: 'https://www.imf.org/en/Publications/WEO',                   coverage_note: '19/19 G20 economies' },
    { key: 'UNEMPLOYMENT',   label: 'Unemployment Rate',           unit: '%',        description: 'Unemployment as % of total labour force (ILO modelled)',                     source_name: 'IMF WEO',        source_code: 'LUR',                  source_url: 'https://www.imf.org/en/Publications/WEO',                   coverage_note: '19/19 G20 economies' },
    { key: 'DEBT_GDP',       label: 'Government Debt',             unit: '% of GDP', description: 'General government gross debt as % of GDP',                                  source_name: 'IMF DataMapper', source_code: 'GGXWDG_NGDP',         source_url: 'https://www.imf.org/external/datamapper',                  coverage_note: '19/19 G20 economies' },
    { key: 'FISCAL_BAL',     label: 'Fiscal Balance',              unit: '% of GDP', description: 'General government net lending / borrowing as % of GDP',                    source_name: 'IMF WEO',        source_code: 'GGXONLB_NGDP',        source_url: 'https://www.imf.org/en/Publications/WEO',                   coverage_note: '19/19 G20 economies' },
    { key: 'CURRENT_ACC',    label: 'Current Account Balance',     unit: '% of GDP', description: 'Current account balance as % of GDP',                                        source_name: 'IMF WEO',        source_code: 'BCA_NGDPD',           source_url: 'https://www.imf.org/en/Publications/WEO',                   coverage_note: '19/19 G20 economies' },
    { key: 'GDP_CAPITA',     label: 'GDP per Capita',              unit: 'USD',      description: 'GDP per capita at current market prices (USD)',                               source_name: 'IMF WEO',        source_code: 'NGDPDPC',             source_url: 'https://www.imf.org/en/Publications/WEO',                   coverage_note: '19/19 G20 economies' },
    { key: 'GDP_CAPITA_PPP', label: 'GDP per Capita (PPP)',        unit: 'USD',      description: 'GDP per capita, PPP — current international $',                              source_name: 'World Bank',     source_code: 'NY.GDP.PCAP.PP.CD',    source_url: 'https://data.worldbank.org/indicator/NY.GDP.PCAP.PP.CD',    coverage_note: '19/19 G20 economies' },
    { key: 'TRADE_GDP',      label: 'Trade (% of GDP)',            unit: '% of GDP', description: 'Trade (exports + imports of goods & services) as % of GDP',                 source_name: 'World Bank',     source_code: 'NE.TRD.GNFS.ZS',      source_url: 'https://data.worldbank.org/indicator/NE.TRD.GNFS.ZS',      coverage_note: '19/19 G20 economies' },
    { key: 'EXPORTS_GDP',    label: 'Exports (% of GDP)',          unit: '% of GDP', description: 'Exports of goods and services as % of GDP',                                  source_name: 'World Bank',     source_code: 'NE.EXP.GNFS.ZS',      source_url: 'https://data.worldbank.org/indicator/NE.EXP.GNFS.ZS',      coverage_note: '19/19 G20 economies' },
    { key: 'CAPITAL_FORM',   label: 'Gross Capital Formation',     unit: '% of GDP', description: 'Gross fixed capital formation as % of GDP',                                  source_name: 'World Bank',     source_code: 'NE.GDI.TOTL.ZS',      source_url: 'https://data.worldbank.org/indicator/NE.GDI.TOTL.ZS',      coverage_note: '19/19 G20 economies' },
    { key: 'FDI_INFLOWS',    label: 'FDI Inflows (% of GDP)',      unit: '% of GDP', description: 'Foreign direct investment, net inflows as % of GDP',                         source_name: 'World Bank',     source_code: 'BX.KLT.DINV.WD.GD.ZS',source_url: 'https://data.worldbank.org/indicator/BX.KLT.DINV.WD.GD.ZS',coverage_note: '19/19 G20 economies' },
    { key: 'MANUFACTURING',  label: 'Manufacturing (% of GDP)',    unit: '% of GDP', description: 'Manufacturing value added as % of GDP',                                      source_name: 'World Bank',     source_code: 'NV.IND.MANF.ZS',      source_url: 'https://data.worldbank.org/indicator/NV.IND.MANF.ZS',      coverage_note: '18/19 G20 economies' },
    { key: 'HEALTH_EXP',     label: 'Health Expenditure',          unit: '% of GDP', description: 'Current health expenditure as % of GDP (WHO via World Bank)',                source_name: 'World Bank/WHO', source_code: 'SH.XPD.CHEX.GD.ZS',   source_url: 'https://data.worldbank.org/indicator/SH.XPD.CHEX.GD.ZS',   coverage_note: '19/19 G20 economies' },
    { key: 'EDUC_EXP',       label: 'Education Expenditure',       unit: '% of GDP', description: 'Government expenditure on education as % of GDP',                           source_name: 'World Bank',     source_code: 'SE.XPD.TOTL.GD.ZS',   source_url: 'https://data.worldbank.org/indicator/SE.XPD.TOTL.GD.ZS',   coverage_note: '17/19 G20 economies' },
    { key: 'RD_EXP',         label: 'R&D Expenditure',             unit: '% of GDP', description: 'Gross domestic R&D expenditure (GERD) as % of GDP',                         source_name: 'OECD MSTI',      source_code: 'GERD.PT_B1GQ',         source_url: 'https://stats.oecd.org/index.aspx?DataSetCode=MSTI_PUB',   coverage_note: '18/19 G20 economies' },
    { key: 'GINI',           label: 'Gini Coefficient',            unit: '0–100',    description: 'Income inequality index (0 = perfect equality; 100 = maximal inequality)',  source_name: 'World Bank',     source_code: 'SI.POV.GINI',          source_url: 'https://data.worldbank.org/indicator/SI.POV.GINI',          coverage_note: '18/19 G20 economies — survey-based, irregular frequency' },
    { key: 'TAX_REVENUE',    label: 'Tax Revenue (% of GDP)',       unit: '% of GDP', description: 'Central government tax revenue as % of GDP',                                source_name: 'World Bank',     source_code: 'GC.TAX.TOTL.GD.ZS',   source_url: 'https://data.worldbank.org/indicator/GC.TAX.TOTL.GD.ZS',   coverage_note: '17/19 G20 economies' },
    { key: 'YOUTH_UNEMP',    label: 'Youth Unemployment',          unit: '%',        description: 'Youth (15–24) unemployment as % of youth labour force',                     source_name: 'World Bank',     source_code: 'SL.UEM.1524.ZS',       source_url: 'https://data.worldbank.org/indicator/SL.UEM.1524.ZS',       coverage_note: '18/19 G20 economies' },
    { key: 'FEMALE_LFP',     label: 'Female Labour Participation', unit: '%',        description: 'Female labour force participation rate, % of female population aged 15+',  source_name: 'World Bank',     source_code: 'SL.TLF.CACT.FE.ZS',   source_url: 'https://data.worldbank.org/indicator/SL.TLF.CACT.FE.ZS',   coverage_note: '19/19 G20 economies' },
    { key: 'LIFE_EXPECT',    label: 'Life Expectancy',             unit: 'years',    description: 'Life expectancy at birth, total population (years)',                         source_name: 'World Bank',     source_code: 'SP.DYN.LE00.IN',       source_url: 'https://data.worldbank.org/indicator/SP.DYN.LE00.IN',       coverage_note: '19/19 G20 economies' },
    { key: 'CO2_CAPITA',     label: 'CO₂ per Capita',              unit: 't/capita', description: 'CO₂ emissions per capita (metric tonnes)',                                  source_name: 'World Bank',     source_code: 'EN.ATM.CO2E.PC',       source_url: 'https://data.worldbank.org/indicator/EN.ATM.CO2E.PC',       coverage_note: '18/19 G20 economies' },
    { key: 'POPULATION',     label: 'Population',                  unit: 'count',    description: 'Total population',                                                           source_name: 'World Bank',     source_code: 'SP.POP.TOTL',          source_url: 'https://data.worldbank.org/indicator/SP.POP.TOTL',          coverage_note: '19/19 G20 economies' },
    { key: 'RESEARCHERS',    label: 'Researchers per Million',     unit: '/million', description: 'Researchers in R&D per million people',                                       source_name: 'World Bank',     source_code: 'SP.POP.SCIE.RD.P6',   source_url: 'https://data.worldbank.org/indicator/SP.POP.SCIE.RD.P6',   coverage_note: '15/19 G20 economies' },
  ];

  process.stdout.write(`Seeding g20_indicators metadata (${META.length} rows)…`);
  for (const batch of chunk(META, 50)) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/g20_indicators`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify(batch),
    });
    if (!r.ok) {
      const text = await r.text();
      throw new Error(`g20_indicators upsert failed (${r.status}): ${text}`);
    }
  }
  console.log(` ✓`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('G20 Dashboard — Supabase seed script');
  console.log(`Target: ${SUPABASE_URL}`);
  console.log(`Countries: ${G20_ISO3.length} | Years: ${YEARS}\n`);

  let totalRows = 0;
  let failures  = 0;

  // World Bank indicators
  for (const [key, code] of Object.entries(WB_INDICATORS)) {
    process.stdout.write(`Fetching ${key} (${code})…`);
    try {
      const rows = await fetchWB(key, code);
      process.stdout.write(` ${rows.length} rows → upserting…`);
      await upsert(rows);
      totalRows += rows.length;
      console.log(` ✓`);
    } catch (e) {
      console.log(` ✗ ${e.message}`);
      failures++;
    }
    await new Promise(r => setTimeout(r, 600)); // respect WB rate limit
  }

  // OECD R&D (MSTI) — overwrites WB R&D data for OECD member countries
  process.stdout.write(`Fetching RD_EXP  (OECD MSTI GERD % GDP)…`);
  try {
    const rows = await fetchOECDRD();
    process.stdout.write(` ${rows.length} rows → upserting…`);
    await upsert(rows);
    totalRows += rows.length;
    console.log(` ✓`);
  } catch (e) {
    console.log(` ✗ ${e.message} (WB fallback retained)`);
    // Non-fatal: WB R&D data already upserted above
  }

  // IMF WEO — overwrites WB values with more current data, adds 2025 estimates.
  // Each WEO indicator is sourced from national statistical offices via IMF.
  const IMF_WEO_INDICATORS = [
    { weo: 'NGDP_RPCH',    key: 'GDP_GROWTH',   label: 'Real GDP growth %'                              },
    { weo: 'PCPIPCH',      key: 'INFLATION',    label: 'CPI avg %'                                      },
    { weo: 'LUR',          key: 'UNEMPLOYMENT', label: 'Unemployment rate'                               },
    // FISCAL_BAL (GGXONLB_NGDP) is NOT available via the DataMapper API — the existing
    // database rows (source='imf') were seeded by an earlier pipeline version and remain valid.
    { weo: 'BCA_NGDPD',   key: 'CURRENT_ACC',  label: 'Current account % GDP'                          },
    { weo: 'NGDPDPC',     key: 'GDP_CAPITA',   label: 'GDP per capita USD'                              },
    // WEO provides GDP in USD (billions) and population (millions) — 2025 estimates
    { weo: 'NGDPD', key: 'GDP',        label: 'GDP USD billions',      transform: v => v * 1e9 },
    { weo: 'LP',    key: 'POPULATION', label: 'Population (millions)', transform: v => v * 1e6 },
  ];
  for (const { weo, key, label, transform } of IMF_WEO_INDICATORS) {
    process.stdout.write(`Fetching ${key.padEnd(12)} (IMF WEO ${weo})…`);
    try {
      const rows = await fetchIMFWEO(weo, key, transform);
      process.stdout.write(` ${rows.length} rows → upserting…`);
      await upsert(rows);
      totalRows += rows.length;
      console.log(` ✓`);
    } catch (e) {
      console.log(` ✗ ${e.message} (WB fallback retained)`);
    }
    await new Promise(r => setTimeout(r, 400));
  }

  // IMF debt / GDP
  process.stdout.write(`Fetching DEBT_GDP (IMF GGXWDG_NGDP)…`);
  try {
    const rows = await fetchIMF();
    process.stdout.write(` ${rows.length} rows → upserting…`);
    await upsert(rows);
    totalRows += rows.length;
    console.log(` ✓`);
  } catch (e) {
    console.log(` ✗ ${e.message}`);
    failures++;
  }

  console.log(`\n✓ Seeded ${totalRows.toLocaleString()} rows (${failures} failure(s)).`);

  // ── Quarterly data (g20_quarterly_data table) ────────────────────────────────
  console.log('\n── Quarterly data pipeline ──────────────────────────────────');
  process.stdout.write('Fetching quarterly GDP_GROWTH (OECD QNA — 11 G20 OECD members):\n');
  try {
    const rows = await fetchAllOECDQuarterly();
    if (rows.length) {
      process.stdout.write(`  → ${rows.length} quarterly rows → upserting…`);
      await upsertQuarterly(rows);
      console.log(' ✓');
    } else {
      console.log('  ⚠ No quarterly rows returned (g20_quarterly_data table may not exist yet)');
    }
  } catch (e) {
    console.log(`  ✗ OECD quarterly: ${e.message}`);
    console.log('  → Run the schema.sql migration in Supabase to create g20_quarterly_data table.');
  }

  if (process.env.FRED_API_KEY) {
    process.stdout.write('Fetching USA quarterly data (FRED)…');
    try {
      const rows = await fetchFREDQuarterly(process.env.FRED_API_KEY);
      process.stdout.write(` ${rows.length} rows → upserting…`);
      await upsertQuarterly(rows);
      console.log(' ✓');
    } catch (e) {
      console.log(` ✗ ${e.message} (OECD data retained)`);
    }
  }

  await validate();

  // Seed indicator metadata table (non-fatal if g20_indicators table not yet created)
  try {
    await seedIndicatorMetadata();
  } catch (e) {
    console.log(`  ⚠ g20_indicators metadata skipped: ${e.message}`);
    console.log('  → Run the schema.sql migration in Supabase to create the table.');
  }

  if (failures > 0) process.exit(1); // signal failure to GitHub Actions
}

main().catch(err => {
  console.error('\n✗ Fatal error:', err.message);
  process.exit(1);
});
