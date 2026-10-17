#!/usr/bin/env node
// Global economic dashboard — Supabase data pipeline
// Fetches World Bank + IMF + OECD + FRED open data for every economy in the
// country registry (public/legacy/countries.json) and seeds Supabase.
// Run:      node sync/seed.js
// Dry run:  node sync/seed.js --dry-run   (no credentials needed, no writes;
//           validates the fetched rows and writes sync/report.json)
// Requires: Node 18+ (native fetch). No npm install needed.
// Credentials can be passed via env vars (used by GitHub Actions).

import { createRequire } from 'module';
import refreshUtils from './refresh-utils.js';

const require = createRequire(import.meta.url);
const registry = require('../lib/registry.cjs');
const H = require('../lib/seed-helpers.cjs');

const DRY_RUN = process.argv.includes('--dry-run');
const { requireServiceRoleKey, stampRows } = refreshUtils;
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qozknjenyhewmkapsizk.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = DRY_RUN ? null : requireServiceRoleKey();
const RUN_TIMESTAMP = new Date().toISOString();

// Latest year treated as observed data; later IMF years are projections.
const LATEST_ACTUAL_YEAR = new Date().getUTCFullYear() - 1;

// Every economy in the registry, plus the EU aggregate (a G20 member the
// dashboard shows as a comparator; World Bank publishes it as EUU).
const ALL_ISO3 = new Set([...registry.countryIso3(), 'EUU']);
const G20_ISO3 = registry.g20Iso3({ includeEU: true });

// Rows written in this run (dry run validates these instead of the database).
const FETCHED = new Map();
let HAS_PROJECTION_COLUMN = true;

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
  CO2_CAPITA:     'EN.GHG.CO2.PC.CE.AR5', // replaces archived EN.ATM.CO2E.PC (same values)
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

// G20 economies used for the strict coverage checks (EUU excluded: not in IMF).
const EXPECTED_COUNTRIES = registry.g20Iso3();

const YEARS = `2000:${LATEST_ACTUAL_YEAR}`;
const YEAR_END = String(LATEST_ACTUAL_YEAR);
const CHUNK_SIZE = 500;

// Plausible value ranges for every economy (lib/seed-helpers.cjs).
const RANGES = H.GLOBAL_RANGES;

// ── Helpers ──────────────────────────────────────────────────────────────────

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function upsert(inputRows) {
  // Drop implausible values (unit or source errors) before they reach the dashboard.
  const { kept: rows, dropped } = H.splitByRange(inputRows, RANGES);
  if (dropped.length) {
    const sample = dropped.slice(0, 3).map(r => `${r.country_iso3} ${r.year}=${r.value}`).join(', ');
    process.stdout.write(` (dropped ${dropped.length} out-of-range: ${sample}${dropped.length > 3 ? '…' : ''})`);
  }
  H.mergeRows(FETCHED, rows);
  if (DRY_RUN || !rows.length) return;
  const payload = HAS_PROJECTION_COLUMN
    ? rows.map(r => ({ ...r, is_projection: r.is_projection === true }))
    : rows.map(({ is_projection, ...r }) => r);
  const stampedRows = stampRows(payload, 'fetched_at', RUN_TIMESTAMP);
  for (const batch of chunk(stampedRows, CHUNK_SIZE)) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/g20_economic_data`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
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

// The is_projection column arrives with migration 20261017000000; until it is
// applied the seed still runs and simply omits the flag.
async function detectProjectionColumn() {
  if (DRY_RUN) return true;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/g20_economic_data?select=is_projection&limit=1`, {
    headers: { 'apikey': SUPABASE_SERVICE_ROLE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
  });
  if (r.ok) return true;
  console.log('::warning::g20_economic_data.is_projection is missing; apply the latest Supabase migration. Writing without the flag.');
  return false;
}

async function syncNormalizedFacts() {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/sync_normalized_from_legacy`, {
    method: 'POST',
    headers: { 'apikey': SUPABASE_SERVICE_ROLE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!response.ok) throw new Error(`normalized fact sync failed (${response.status}): ${await response.text()}`);
  return response.json();
}

// ── World Bank ────────────────────────────────────────────────────────────────

async function fetchWB(indicatorKey, wbCode) {
  // country/all returns every economy and aggregate; keep registry economies (+ EUU).
  const rows = [];
  for (let page = 1, pages = 1; page <= pages; page++) {
    const url = `https://api.worldbank.org/v2/country/all/indicator/${wbCode}?format=json&date=${YEARS}&per_page=20000&page=${page}`;
    const r = await fetchWithRetry(url, { headers: { 'User-Agent': 'G20Dashboard-Seed/1.0' } });
    if (!r.ok) throw new Error(`World Bank API ${r.status} for ${wbCode}`);
    const json = await r.json();
    if (!Array.isArray(json) || json.length < 2 || !json[1]) {
      if (page === 1) console.warn(`  ⚠ No data returned for ${indicatorKey}`);
      break;
    }
    pages = Number(json[0]?.pages) || 1;
    rows.push(...H.parseWorldBankRows(json, indicatorKey, ALL_ISO3).map(r => ({ ...r, is_projection: false })));
  }
  return rows;
}

// ── IMF World Economic Outlook (WEO) ─────────────────────────────────────────
// IMF WEO is compiled directly from national statistical offices — it is the most
// authoritative and timely multi-country source for macro indicators, with 2025
// estimates available from the April 2026 WEO release.

async function fetchIMFJson(code) {
  const url = `https://www.imf.org/external/datamapper/api/v1/${code}`;
  const r = await fetchWithRetry(url, {
    headers: { 'User-Agent': 'G20Dashboard-Seed/1.0', 'Accept': 'application/json' },
  });
  if (!r.ok) throw new Error(`IMF DataMapper ${r.status} for ${code}`);
  return r.json();
}

async function fetchIMFWEO(weoCode, indicatorKey, transform) {
  // Observed years only (WEO projections run several years ahead).
  return H.parseImfRows(await fetchIMFJson(weoCode), weoCode, indicatorKey, ALL_ISO3,
    { latestActualYear: LATEST_ACTUAL_YEAR, transform, source: 'imf_weo' });
}

// ── IMF DataMapper ────────────────────────────────────────────────────────────

async function fetchIMF() {
  // Debt paths keep IMF projections, flagged is_projection so they are never shown as latest.
  return H.parseImfRows(await fetchIMFJson('GGXWDG_NGDP'), 'GGXWDG_NGDP', 'DEBT_GDP', ALL_ISO3,
    { latestActualYear: LATEST_ACTUAL_YEAR, keepProjections: true, source: 'imf' });
}

// ── OECD ─────────────────────────────────────────────────────────────────────

// The OECD SDMX gateway rate-limits (429, roughly 20 queries/hour) and intermittently answers 5xx; World Bank/IMF
// calls also time out now and then. Retry before giving up, waiting much longer after a 429.
async function fetchWithRetry(url, options, attempts = 4) {
  let last;
  for (let i = 1; i <= attempts; i++) {
    try {
      const r = await fetch(url, { ...options, signal: AbortSignal.timeout(45000) });
      if (r.status < 500 && r.status !== 429) return r;
      last = new Error(`HTTP ${r.status}`);
      if (r.status === 429) { await new Promise(res => setTimeout(res, 30000 * i)); continue; }
    } catch (e) { last = e; }
    await new Promise(res => setTimeout(res, 1500 * i));
  }
  throw last;
}

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
  // Key order (DSD_MSTI): REF_AREA.FREQ.MEASURE.UNIT_MEASURE.PRICE_BASE.TRANSFORMATION
  // G = GERD, PT_B1GQ = % of GDP. The old 4-part key now returns HTTP 403 "expecting 6 key values".
  const url = `https://sdmx.oecd.org/public/rest/data/OECD.STI.STP,DSD_MSTI@DF_MSTI,1.0/${countries}.A.G.PT_B1GQ._Z._Z?startPeriod=2000&endPeriod=${YEAR_END}`;
  const r = await fetchWithRetry(url, {
    headers: { 'User-Agent': 'G20Dashboard-Seed/1.0', 'Accept': 'application/vnd.sdmx.data+json;version=2' },
  });
  if (!r.ok) throw new Error(`OECD MSTI API ${r.status}`);
  const json = await r.json();
  const rows = parseOECDSDMX(json, 'RD_EXP');
  if (!rows.length) throw new Error('OECD MSTI: no rows parsed — check dimension key');
  return rows;
}

// ── Validation ────────────────────────────────────────────────────────────────

async function loadDatabaseRows() {
  const PAGE = 1000;
  const select = HAS_PROJECTION_COLUMN ? 'country_iso3,indicator_key,year,value,is_projection' : 'country_iso3,indicator_key,year,value';
  const allRows = [];
  for (let offset = 0; ; offset += PAGE) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/g20_economic_data?select=${select}&order=country_iso3.asc,indicator_key.asc,year.asc`, {
      headers: { 'apikey': SUPABASE_SERVICE_ROLE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, 'Range': `${offset}-${offset + PAGE - 1}` },
    });
    if (!r.ok) throw new Error(`validation read failed (${r.status})`);
    const page = await r.json();
    allRows.push(...page.map(row => ({ ...row, is_projection: row.is_projection === true || (!HAS_PROJECTION_COLUMN && row.year > LATEST_ACTUAL_YEAR) })));
    if (page.length < PAGE) break;
  }
  return allRows;
}

// Returns the number of hard errors (missing or stale core G20 coverage).
async function validate(extra = {}) {
  console.log(`\n── Data Quality Report${DRY_RUN ? ' (dry run: fetched rows, nothing written)' : ''} ──────────────`);
  const rows = DRY_RUN ? [...FETCHED.values()] : await loadDatabaseRows();
  const indicators = [...Object.keys(WB_INDICATORS), 'DEBT_GDP', 'FISCAL_BAL'];
  const result = H.summarize(rows, { indicators, g20: EXPECTED_COUNTRIES, latestActualYear: LATEST_ACTUAL_YEAR });
  const tiers = H.coverageTiers(rows, extra.quarterlyCountries || new Set(), indicators.length);
  const tierCounts = Object.values(tiers).reduce((acc, t) => { acc[t] = (acc[t] || 0) + 1; return acc; }, {});

  for (const [ind, r] of Object.entries(result.indicators)) {
    const miss = r.g20Missing.length ? ` ⚠ G20 missing: ${r.g20Missing.slice(0, 4).join(',')}${r.g20Missing.length > 4 ? '…' : ''}` : '';
    console.log(`  ${ind.padEnd(14)} rows:${String(r.rows).padStart(6)}  countries:${String(r.countriesCovered).padStart(3)}  G20:${String(r.g20Covered).padStart(2)}/${EXPECTED_COUNTRIES.length}  latest:${r.latestYear || '—'}${miss}`);
  }
  const projections = rows.filter(r => r.is_projection).length;
  console.log(`\n  Rows: ${rows.length.toLocaleString()} (${projections.toLocaleString()} flagged as projections) · economies with data: ${result.countries} · tiers ${JSON.stringify(tierCounts)}`);
  result.warnings.forEach(w => console.log(`  ⚠ ${w}`));
  result.hardErrors.forEach(e => console.log(`::error::${e}`));
  if (!result.hardErrors.length) console.log('  ✓ Core G20 coverage is complete and current.');

  try {
    const fs = await import('fs');
    fs.writeFileSync(new URL('./report.json', import.meta.url).pathname, JSON.stringify({
      generatedAt: new Date().toISOString(),
      dryRun: DRY_RUN,
      latestActualYear: LATEST_ACTUAL_YEAR,
      totalRows: rows.length,
      projectionRows: projections,
      economiesWithData: result.countries,
      registryEconomies: ALL_ISO3.size,
      tierCounts,
      indicators: result.indicators,
      warnings: result.warnings,
      hardErrors: result.hardErrors,
      quarterlyRows: extra.quarterlyRows ?? null,
    }, null, 2));
  } catch (_) { /* non-fatal if running in an env without fs write access */ }
  return result.hardErrors.length;
}

// ── Quarterly data pipeline ───────────────────────────────────────────────────

// Plausible bounds for quarterly series. A value outside these is a unit error (for example a CPI index level
// stored as a percentage) and must never reach the dashboard.
const QUARTERLY_BOUNDS = { GDP_GROWTH: [-35, 35], INFLATION: [-10, 60], UNEMPLOYMENT: [0, 40] };

function rejectImplausibleQuarterly(rows) {
  const ok = [];
  for (const row of rows) {
    const [lo, hi] = QUARTERLY_BOUNDS[row.indicator_key] || [-Infinity, Infinity];
    if (row.value < lo || row.value > hi) {
      console.log(`  ⚠ dropped implausible ${row.country_iso3} ${row.indicator_key} ${row.period}: ${row.value}`);
      continue;
    }
    ok.push(row);
  }
  return ok;
}

async function upsertQuarterly(allRows) {
  const rows = rejectImplausibleQuarterly(allRows);
  if (DRY_RUN || !rows.length) return;
  const stampedRows = stampRows(rows, 'fetched_at', RUN_TIMESTAMP);
  for (const batch of chunk(stampedRows, CHUNK_SIZE)) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/g20_quarterly_data`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
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
// The legacy stats.oecd.org QNA endpoint redirects (HTTP 301) and no longer serves data, so this uses the
// current SDMX dataflow DF_QNA_EXPENDITURE_GROWTH_G20.
// Key: FREQ.ADJUSTMENT.REF_AREA.SECTOR.COUNTERPART_SECTOR.TRANSACTION.INSTR_ASSET.ACTIVITY.EXPENDITURE.UNIT_MEASURE.PRICE_BASE.TRANSFORMATION.TABLE_IDENTIFIER
// = Q.Y.<iso3>+<iso3>.S1.S1.B1GQ._Z._Z._Z.PC.L.GY.T0102  (GDP, seasonally adjusted, % change on same quarter a year earlier)
// The OECD gateway allows only a few requests per hour per IP (HTTP 429), so all countries go in ONE request.
// G20 OECD members that have quarterly national accounts data
const OECD_QNA_COUNTRIES = ['AUS', 'CAN', 'GBR', 'DEU', 'FRA', 'ITA', 'JPN', 'KOR', 'MEX', 'TUR', 'USA'];

async function fetchAllOECDQuarterly(startPeriod = '2018-Q1') {
  const key = `Q.Y.${OECD_QNA_COUNTRIES.join('+')}.S1.S1.B1GQ._Z._Z._Z.PC.L.GY.T0102`;
  const url = `https://sdmx.oecd.org/public/rest/data/OECD.SDD.NAD,DSD_NAMAIN1@DF_QNA_EXPENDITURE_GROWTH_G20,1.1/${key}?startPeriod=${startPeriod}&dimensionAtObservation=AllDimensions`;
  const r = await fetchWithRetry(url, {
    headers: { 'User-Agent': 'G20Dashboard-Seed/1.0', 'Accept': 'application/vnd.sdmx.data+json;version=2' },
  });
  if (!r.ok) throw new Error(`OECD QNA ${r.status}`);

  const json = await r.json();
  const structs = json?.data?.structures?.[0];
  const obs     = json?.data?.dataSets?.[0]?.observations;
  if (!structs || !obs) throw new Error('OECD QNA: no data returned');

  // With dimensionAtObservation=AllDimensions every observation key is 'i:j:...' over the observation dimensions.
  const odims = structs.dimensions?.observation || [];
  const tIdx  = odims.findIndex(x => x.id === 'TIME_PERIOD');
  const aIdx  = odims.findIndex(x => x.id === 'REF_AREA');
  if (tIdx < 0 || aIdx < 0) throw new Error('OECD QNA: missing TIME_PERIOD/REF_AREA dimension');

  const rows = [];
  for (const [obsKey, obsArr] of Object.entries(obs)) {
    const parts  = obsKey.split(':');
    const iso3   = odims[aIdx].values[parseInt(parts[aIdx])]?.id;
    const period = oecd2period(odims[tIdx].values[parseInt(parts[tIdx])]?.id);
    const value  = Array.isArray(obsArr) ? obsArr[0] : obsArr;
    if (!iso3 || !period || value === null || isNaN(Number(value))) continue;
    rows.push({ country_iso3: iso3, indicator_key: 'GDP_GROWTH', period, value: Number(value), source: 'oecd_qna' });
  }
  return rows;
}

// FRED (St. Louis Fed) — USA quarterly data via the keyless fredgraph CSV endpoint (no API key needed, so the
// monthly GitHub Action refreshes it too). Stored values must be comparable with the annual series:
//   INFLATION    = year-on-year % change in CPI, quarterly average (NOT the CPI index level)
//   UNEMPLOYMENT = unemployment rate %, quarterly average
// GDP growth is not taken from FRED: its annualised quarter-on-quarter rate is a different measure from the
// year-on-year rate used everywhere else, so USA GDP_GROWTH comes from the OECD quarterly series instead.
async function fetchFREDSeries(id) {
  const r = await fetch(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}&cosd=2016-01-01`, {
    headers: { 'User-Agent': 'G20Dashboard-Seed/1.0' },
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) throw new Error(`FRED ${id} ${r.status}`);
  const lines = (await r.text()).trim().split('\n').slice(1);
  return lines.map(l => l.split(',')).filter(([d, v]) => d && v && v !== '.' && !isNaN(parseFloat(v)))
    .map(([d, v]) => ({ date: d, value: parseFloat(v) }));
}

function quarterlyAverage(points) {
  const qMap = {};
  for (const { date, value } of points) {
    const [yr, mo] = date.split('-').map(Number);
    const period = `${yr}Q${Math.ceil(mo / 3)}`;
    (qMap[period] = qMap[period] || []).push(value);
  }
  return qMap;
}

function yoyPercent(points) {
  // points are monthly, ascending; compare with the same month a year earlier
  const byMonth = new Map(points.map(p => [p.date.slice(0, 7), p.value]));
  const out = [];
  for (const { date, value } of points) {
    const [yr, mo] = date.split('-');
    const prev = byMonth.get(`${Number(yr) - 1}-${mo}`);
    if (prev) out.push({ date, value: (value / prev - 1) * 100 });
  }
  return out;
}

async function fetchFREDQuarterly() {
  const rows = [];
  const add = (key, qMap) => {
    for (const [period, vals] of Object.entries(qMap)) {
      // a partial quarter (fewer than 3 months) would be a flash estimate, so only keep complete quarters
      if (vals.length < 3) continue;
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      rows.push({ country_iso3: 'USA', indicator_key: key, period, value: Math.round(avg * 100) / 100, source: 'fred' });
    }
  };
  add('INFLATION',    quarterlyAverage(yoyPercent(await fetchFREDSeries('CPIAUCSL'))));
  add('UNEMPLOYMENT', quarterlyAverage(await fetchFREDSeries('UNRATE')));
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
    { key: 'FISCAL_BAL',     label: 'Fiscal Balance',              unit: '% of GDP', description: 'General government net lending / borrowing as % of GDP',                    source_name: 'IMF WEO',        source_code: 'GGXCNL_NGDP',         source_url: 'https://www.imf.org/en/Publications/WEO',                   coverage_note: '19/19 G20 economies' },
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
    { key: 'CO2_CAPITA',     label: 'CO₂ per Capita',              unit: 't/capita', description: 'CO₂ emissions per capita (metric tonnes)',                                  source_name: 'World Bank',     source_code: 'EN.GHG.CO2.PC.CE.AR5',       source_url: 'https://data.worldbank.org/indicator/EN.GHG.CO2.PC.CE.AR5',       coverage_note: '18/19 G20 economies' },
    { key: 'POPULATION',     label: 'Population',                  unit: 'count',    description: 'Total population',                                                           source_name: 'World Bank',     source_code: 'SP.POP.TOTL',          source_url: 'https://data.worldbank.org/indicator/SP.POP.TOTL',          coverage_note: '19/19 G20 economies' },
    { key: 'RESEARCHERS',    label: 'Researchers per Million',     unit: '/million', description: 'Researchers in R&D per million people',                                       source_name: 'World Bank',     source_code: 'SP.POP.SCIE.RD.P6',   source_url: 'https://data.worldbank.org/indicator/SP.POP.SCIE.RD.P6',   coverage_note: '15/19 G20 economies' },
  ];

  process.stdout.write(`Seeding g20_indicators metadata (${META.length} rows)…`);
  const stampedMetadata = stampRows(META, 'updated_at', RUN_TIMESTAMP);
  for (const batch of chunk(stampedMetadata, 50)) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/g20_indicators`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
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
  console.log(`Global economic dashboard — Supabase seed script${DRY_RUN ? ' (DRY RUN: no writes)' : ''}`);
  console.log(`Target: ${DRY_RUN ? '(none)' : SUPABASE_URL}`);
  console.log(`Economies: ${ALL_ISO3.size} (registry + EU) | G20 checks: ${EXPECTED_COUNTRIES.length} | Years: ${YEARS}\n`);
  HAS_PROJECTION_COLUMN = await detectProjectionColumn();
  let quarterlyRows = 0;
  const quarterlyCountries = new Set();

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
    console.log(`::warning::OECD R&D refresh failed: ${e.message}; World Bank values kept`);
    // Non-fatal: WB R&D data already upserted above
  }

  // IMF WEO — overwrites WB values with more current data, adds latest-year estimates.
  // Each WEO indicator is sourced from national statistical offices via IMF.
  const IMF_WEO_INDICATORS = [
    { weo: 'NGDP_RPCH',    key: 'GDP_GROWTH',   label: 'Real GDP growth %'                              },
    { weo: 'PCPIPCH',      key: 'INFLATION',    label: 'CPI avg %'                                      },
    { weo: 'LUR',          key: 'UNEMPLOYMENT', label: 'Unemployment rate'                               },
    // General government net lending/borrowing (overall fiscal balance), % of GDP.
    { weo: 'GGXCNL_NGDP', key: 'FISCAL_BAL',   label: 'Fiscal balance % GDP'                           },
    { weo: 'BCA_NGDPD',   key: 'CURRENT_ACC',  label: 'Current account % GDP'                          },
    { weo: 'NGDPDPC',     key: 'GDP_CAPITA',   label: 'GDP per capita USD'                              },
    // WEO provides GDP in USD (billions) and population (millions), including latest-year estimates
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
  process.stdout.write('Fetching quarterly GDP_GROWTH (OECD QNA, 11 G20 OECD members, one request):\n');
  try {
    const rows = await fetchAllOECDQuarterly();
    if (rows.length) {
      process.stdout.write(`  → ${rows.length} quarterly rows → upserting…`);
      await upsertQuarterly(rows);
      quarterlyRows += rows.length; rows.forEach(r => quarterlyCountries.add(r.country_iso3));
      console.log(' ✓');
    } else {
      console.log('  ⚠ No quarterly rows returned (g20_quarterly_data table may not exist yet)');
    }
  } catch (e) {
    console.log(`  ✗ OECD quarterly: ${e.message}`);
    console.log(`::warning::OECD quarterly GDP refresh failed: ${e.message}; previous quarterly values kept`);
    console.log('  → Run the schema.sql migration in Supabase to create g20_quarterly_data table.');
  }

  {
    process.stdout.write('Fetching USA quarterly data (FRED, keyless)…');
    try {
      const rows = await fetchFREDQuarterly();
      process.stdout.write(` ${rows.length} rows → upserting…`);
      await upsertQuarterly(rows);
      quarterlyRows += rows.length; rows.forEach(r => quarterlyCountries.add(r.country_iso3));
      console.log(' ✓');
    } catch (e) {
      console.log(` ✗ ${e.message} (OECD data retained)`);
      console.log(`::warning::FRED quarterly refresh failed: ${e.message}`);
    }
  }

  const hardErrors = await validate({ quarterlyRows, quarterlyCountries });

  if (DRY_RUN) {
    console.log('\nDry run complete: nothing was written. Report: sync/report.json');
    if (failures > 0 || hardErrors > 0) process.exit(1);
    return;
  }

  // Seed indicator metadata table (non-fatal if g20_indicators table not yet created)
  try {
    await seedIndicatorMetadata();
  } catch (e) {
    console.log(`  ⚠ g20_indicators metadata skipped: ${e.message}`);
    console.log('  → Run the schema.sql migration in Supabase to create the table.');
  }

  // The normalized fact model (PR #11) is dormant: its countries table only holds the
  // G20, so global rows fail its foreign keys. The legacy tables above are the system
  // of record, so a failed normalized sync is a warning, never a failed refresh.
  process.stdout.write('Synchronizing normalized fact model…');
  try {
    const normalized = await syncNormalizedFacts();
    console.log(` ${Number(normalized.observations ?? 0).toLocaleString()} observations ✓`);
  } catch (e) {
    console.log(` skipped (${e.message.slice(0, 160)})`);
    console.log(`::warning::Normalized fact sync skipped (dormant model): ${e.message.slice(0, 160)}`);
  }

  if (failures > 0 || hardErrors > 0) process.exit(1); // signal failure to GitHub Actions
}

main().catch(err => {
  console.error('\n✗ Fatal error:', err.message);
  process.exit(1);
});
