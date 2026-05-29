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
  GDP:          'NY.GDP.MKTP.CD',
  GDP_GROWTH:   'NY.GDP.MKTP.KD.ZG',
  INFLATION:    'FP.CPI.TOTL.ZG',
  UNEMPLOYMENT: 'SL.UEM.TOTL.ZS',
  CURRENT_ACC:  'BN.CAB.XOKA.GD.ZS',
  GDP_CAPITA:   'NY.GDP.PCAP.CD',
  CO2_CAPITA:   'EN.GHG.CO2.PC.CE.AR5',  // archived: was EN.ATM.CO2E.PC
  TRADE_GDP:    'NE.TRD.GNFS.ZS',
  POPULATION:   'SP.POP.TOTL',
  HEALTH_EXP:   'SH.XPD.CHEX.GD.ZS',   // Current health expenditure % GDP (WHO via WB)
  RD_EXP:       'GB.XPD.RSDV.GD.ZS',   // R&D expenditure % GDP (UNESCO via WB; OECD overwrites)
  GINI:         'SI.POV.GINI',           // Gini inequality index (World Bank)
  YOUTH_UNEMP:  'SL.UEM.1524.ZS',        // Youth unemployment rate (15–24), %
  CAPITAL_FORM: 'NE.GDI.TOTL.ZS',        // Gross capital formation % GDP
  FDI_INFLOWS:  'BX.KLT.DINV.WD.GD.ZS', // FDI net inflows % GDP
  EDUC_EXP:     'SE.XPD.TOTL.GD.ZS',    // Govt education expenditure % GDP
  EXPORTS_GDP:  'NE.EXP.GNFS.ZS',        // Exports of goods & services % GDP
  TAX_REVENUE:  'GC.TAX.TOTL.GD.ZS',    // Tax revenue % GDP
  MANUFACTURING:'NV.IND.MANF.ZS',        // Manufacturing value added % GDP
  LIFE_EXPECT:  'SP.DYN.LE00.IN',        // Life expectancy at birth (years)
  FEMALE_LFP:   'SL.TLF.CACT.FE.ZS',   // Female labour force participation (%)
  GDP_CAPITA_PPP: 'NY.GDP.PCAP.PP.CD',  // GDP per capita PPP (current intl $)
  RESEARCHERS:  'SP.POP.SCIE.RD.P6',    // Researchers in R&D per million people (WB; OECD overrides for members)
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

const YEARS = '2000:2024';
const CHUNK_SIZE = 500;

// Plausible value ranges for sanity checking
const RANGES = {
  GDP:          [1e8,   30e12],  // $100M – $30T
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
  YOUTH_UNEMP:  [0,     65],
  CAPITAL_FORM: [10,    50],
  FDI_INFLOWS:  [-10,   25],
  EDUC_EXP:     [0,     12],
  EXPORTS_GDP:  [5,    100],   // % GDP; Saudi ~42%, Germany ~47%, China ~20%
  TAX_REVENUE:  [5,     45],   // % GDP; Scandinavian ~40-45%, China ~7% (state-owned squeeze)
  MANUFACTURING:[2,     45],   // % GDP; China ~27%, Germany ~20%, USA ~11%
  FISCAL_BAL:   [-30,   10],   // % GDP (negative = deficit)
  RESEARCHERS:  [50,  12000],  // per million people; Korea ~8000, Germany ~5000, India ~250
  LIFE_EXPECT:  [50,    90],   // years
  FEMALE_LFP:   [20,    80],   // %
  GDP_CAPITA_PPP: [2000, 130000], // current intl $ PPP
  PRODUCTIVITY: [30,   200],   // GDP per hour worked index (OECD, 2015=100)
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

// ── IMF DataMapper ────────────────────────────────────────────────────────────

async function fetchIMFDataset(imfCode, indicatorKey) {
  const url = `https://www.imf.org/external/datamapper/api/v1/${imfCode}`;
  const r = await fetch(url, {
    headers: { 'User-Agent': 'G20Dashboard-Seed/1.0', 'Accept': 'application/json' },
    signal: AbortSignal.timeout(45000),
  });
  if (!r.ok) throw new Error(`IMF API ${r.status} for ${imfCode}`);

  const json = await r.json();
  const values = json?.values?.[imfCode] || {};

  const rows = [];
  for (const [imfCode2, years] of Object.entries(values)) {
    if (!IMF_COUNTRIES.includes(imfCode2)) continue;
    for (const [yearStr, value] of Object.entries(years)) {
      const year = parseInt(yearStr, 10);
      if (year < 2000 || value === null || value === undefined) continue;
      rows.push({ country_iso3: imfCode2, indicator_key: indicatorKey, year, value, source: 'imf' });
    }
  }
  return rows;
}

async function fetchIMF() {
  return fetchIMFDataset('GGXWDG_NGDP', 'DEBT_GDP');
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

// Fetch one OECD MSTI measure per-country to avoid API response-size limits.
// Dimension order (new API): REF_AREA.FREQ.MEASURE.UNIT_MEASURE.PRICE_BASE.TRANSFORMATION
async function fetchOECDMSTICountry(country, measure, unit, indicatorKey) {
  const url = `https://sdmx.oecd.org/public/rest/data/OECD.STI.STP,DSD_MSTI@DF_MSTI,1.0/${country}.A.${measure}.${unit}._Z._Z?format=jsondata&startPeriod=2000&endPeriod=2023`;
  const r = await fetch(url, {
    headers: { 'User-Agent': 'G20Dashboard-Seed/1.0', 'Accept': 'application/json' },
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) return [];
  const json = await r.json();
  return parseOECDSDMX(json, indicatorKey);
}

async function fetchOECDRD() {
  // OECD MSTI — Gross domestic expenditure on R&D (GERD) as % of GDP.
  // Fetch per-country: batch API hits a response-size ceiling and returns sparse data.
  const allRows = [];
  for (const country of [...OECD_G20, ...OECD_PARTNERS]) {
    try {
      const rows = await fetchOECDMSTICountry(country, 'G', 'PT_B1GQ', 'RD_EXP');
      allRows.push(...rows);
      await new Promise(r => setTimeout(r, 150));
    } catch (_) {}
  }
  if (!allRows.length) throw new Error('OECD MSTI: no rows parsed');
  return allRows;
}

async function fetchOECDResearchers() {
  // OECD MSTI — R&D researchers per 1,000 employment (OECD G20 members only).
  const allRows = [];
  for (const country of OECD_G20) {
    try {
      const rows = await fetchOECDMSTICountry(country, 'T_RS', '10P3EMP', 'RESEARCHERS');
      allRows.push(...rows);
      await new Promise(r => setTimeout(r, 150));
    } catch (_) {}
  }
  return allRows; // non-fatal if empty
}

// OECD Labour Productivity (GDP per hour worked, volume index) — non-fatal.
// Dataset: OECD.SDD.NAD,DSD_PDB@DF_PDB_LV  — different endpoint from MSTI, fresh rate-limit quota.
// Only available for OECD G20 members.
async function fetchOECDProductivity() {
  const allRows = [];
  for (const country of OECD_G20) {
    try {
      const url = `https://sdmx.oecd.org/public/rest/data/OECD.SDD.NAD,DSD_PDB@DF_PDB_LV,1.0/${country}.A.T_GDPHRS_V.USD_PPP._T.IDX?format=jsondata&startPeriod=2000&endPeriod=2023`;
      const r = await fetch(url, {
        headers: { 'User-Agent': 'G20Dashboard-Seed/1.0', 'Accept': 'application/json' },
        signal: AbortSignal.timeout(30000),
      });
      if (r.ok) {
        const json = await r.json();
        allRows.push(...parseOECDSDMX(json, 'PRODUCTIVITY'));
      }
      await new Promise(r => setTimeout(r, 200));
    } catch (_) {}
  }
  return allRows; // non-fatal if empty
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
  // Cap at 2024 to prevent IMF multi-year forecasts (through 2031) appearing as current data.
  const LATEST_YEAR_CAP = 2024;
  const summary = {};
  for (const { country_iso3: c, indicator_key: k, year, value } of allRows) {
    if (year > LATEST_YEAR_CAP) continue;
    if (!summary[k]) summary[k] = {};
    if (!summary[k][c] || year > summary[k][c].latestYear) {
      summary[k][c] = { latestYear: year, latestValue: value };
    }
  }

  const ALL_INDICATORS = [...Object.keys(WB_INDICATORS), 'DEBT_GDP', 'FISCAL_BAL', 'PRODUCTIVITY'];
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

    // GINI is survey-based (sparse); PRODUCTIVITY is experimental OECD-only — relax thresholds
    const staleYear    = (ind === 'GINI' || ind === 'PRODUCTIVITY') ? 2010 : 2021;
    const minCoverage  = (ind === 'GINI' || ind === 'PRODUCTIVITY') ? 0    : 2;
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

  return summary;
}

// ── Commentary Generation ─────────────────────────────────────────────────────

const COMMENTARY_COUNTRIES = [
  { iso3: 'USA', name: 'United States' },
  { iso3: 'GBR', name: 'United Kingdom' },
  { iso3: 'CAN', name: 'Canada' },
  { iso3: 'DEU', name: 'Germany' },
  { iso3: 'FRA', name: 'France' },
  { iso3: 'ITA', name: 'Italy' },
  { iso3: 'JPN', name: 'Japan' },
  { iso3: 'AUS', name: 'Australia' },
  { iso3: 'KOR', name: 'South Korea' },
  { iso3: 'CHN', name: 'China' },
  { iso3: 'IND', name: 'India' },
  { iso3: 'BRA', name: 'Brazil' },
  { iso3: 'MEX', name: 'Mexico' },
  { iso3: 'ARG', name: 'Argentina' },
  { iso3: 'RUS', name: 'Russia' },
  { iso3: 'SAU', name: 'Saudi Arabia' },
  { iso3: 'ZAF', name: 'South Africa' },
  { iso3: 'IDN', name: 'Indonesia' },
  { iso3: 'TUR', name: 'Turkey' },
];

function buildDataTable(summary) {
  const fmt = (v, unit) => v !== undefined && v !== null ? `${typeof v === 'number' && v >= 1e9 ? '$' + (v/1e12).toFixed(2) + 'T' : v.toFixed(1)}${unit ? ' ' + unit : ''}` : 'N/A';
  const get = (summary, key, iso3) => summary[key]?.[iso3];

  return COMMENTARY_COUNTRIES.map(({ iso3, name }) => {
    const gdp    = get(summary, 'GDP',            iso3);
    const gr     = get(summary, 'GDP_GROWTH',    iso3);
    const inf    = get(summary, 'INFLATION',     iso3);
    const une    = get(summary, 'UNEMPLOYMENT',  iso3);
    const debt   = get(summary, 'DEBT_GDP',      iso3);
    const cacc   = get(summary, 'CURRENT_ACC',   iso3);
    const gdppc  = get(summary, 'GDP_CAPITA',    iso3);
    const health = get(summary, 'HEALTH_EXP',    iso3);
    const rd     = get(summary, 'RD_EXP',        iso3);
    const gini   = get(summary, 'GINI',          iso3);
    const youth  = get(summary, 'YOUTH_UNEMP',   iso3);
    const capfrm = get(summary, 'CAPITAL_FORM',  iso3);
    const fdi    = get(summary, 'FDI_INFLOWS',   iso3);
    const educ   = get(summary, 'EDUC_EXP',      iso3);
    const fiscal = get(summary, 'FISCAL_BAL',    iso3);
    const life   = get(summary, 'LIFE_EXPECT',   iso3);
    const flfp   = get(summary, 'FEMALE_LFP',    iso3);
    const gdpPPP = get(summary, 'GDP_CAPITA_PPP',iso3);
    const research= get(summary, 'RESEARCHERS',  iso3);

    const gdpStr    = gdp      ? `$${(gdp.latestValue/1e12).toFixed(2)}T (${gdp.latestYear})` : 'N/A';
    const grStr     = gr      ? `${gr.latestValue >= 0 ? '+' : ''}${gr.latestValue.toFixed(1)}% (${gr.latestYear})` : 'N/A';
    const infStr    = inf     ? `${inf.latestValue.toFixed(1)}% (${inf.latestYear})` : 'N/A';
    const uneStr    = une     ? `${une.latestValue.toFixed(1)}% (${une.latestYear})` : 'N/A';
    const debtStr   = debt    ? `${debt.latestValue.toFixed(0)}% (${debt.latestYear})` : 'N/A';
    const fiscStr   = fiscal  ? `${fiscal.latestValue >= 0 ? '+' : ''}${fiscal.latestValue.toFixed(1)}% GDP (${fiscal.latestYear})` : 'N/A';
    const caccStr   = cacc    ? `${cacc.latestValue >= 0 ? '+' : ''}${cacc.latestValue.toFixed(1)}% GDP (${cacc.latestYear})` : 'N/A';
    const gdppcStr  = gdppc   ? `$${Math.round(gdppc.latestValue).toLocaleString()} (${gdppc.latestYear})` : 'N/A';
    const gdpPPPStr = gdpPPP  ? `$${Math.round(gdpPPP.latestValue).toLocaleString()} PPP (${gdpPPP.latestYear})` : 'N/A';
    const hlthStr   = health  ? `${health.latestValue.toFixed(1)}% GDP (${health.latestYear})` : 'N/A';
    const rdStr     = rd      ? `${rd.latestValue.toFixed(2)}% GDP (${rd.latestYear})` : 'N/A';
    const giniStr   = gini    ? `${gini.latestValue.toFixed(1)} (${gini.latestYear})` : 'N/A';
    const youthStr  = youth   ? `${youth.latestValue.toFixed(1)}% (${youth.latestYear})` : 'N/A';
    const capfStr   = capfrm  ? `${capfrm.latestValue.toFixed(1)}% GDP (${capfrm.latestYear})` : 'N/A';
    const fdiStr    = fdi     ? `${fdi.latestValue >= 0 ? '+' : ''}${fdi.latestValue.toFixed(2)}% GDP (${fdi.latestYear})` : 'N/A';
    const educStr   = educ    ? `${educ.latestValue.toFixed(1)}% GDP (${educ.latestYear})` : 'N/A';
    const lifeStr   = life    ? `${life.latestValue.toFixed(1)} yrs (${life.latestYear})` : 'N/A';
    const flfpStr   = flfp    ? `${flfp.latestValue.toFixed(1)}% (${flfp.latestYear})` : 'N/A';
    const resStr    = research ? `${Math.round(research.latestValue)}/mn (${research.latestYear})` : 'N/A';

    return [
      `## ${name} (${iso3})`,
      `GDP: ${gdpStr} | Growth: ${grStr} | Inflation: ${infStr}`,
      `Unemployment: ${uneStr} | Youth Unemp: ${youthStr} | Debt/GDP: ${debtStr} | Fiscal Balance: ${fiscStr}`,
      `GDP/Capita: ${gdppcStr} | GDP/Capita PPP: ${gdpPPPStr} | Current Account: ${caccStr}`,
      `Health: ${hlthStr} | R&D: ${rdStr} | Education: ${educStr} | Researchers: ${resStr}`,
      `Capital Formation: ${capfStr} | FDI Inflows: ${fdiStr} | Gini: ${giniStr}`,
      `Life Expectancy: ${lifeStr} | Female Labour Participation: ${flfpStr}`,
    ].join('\n');
  }).join('\n\n');
}

async function generateCommentary(summary) {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('\n  ⚠ ANTHROPIC_API_KEY not set — skipping commentary regeneration.');
    return;
  }

  console.log('\n── Generating Commentary ────────────────────────');
  const dataTable = buildDataTable(summary);
  const currentYear = new Date().getFullYear();

  const prompt = `You are writing in the voice of Ankit Mishra, a Forbes contributor who covers global economic policy. Ankit's writing style is characterised by:

VOICE & TONE:
- Open each section with a strong, data-anchored statement that immediately establishes the economic narrative — e.g. "The United States delivered 2.8% real GDP growth in 2024, exceeding the G20 median of 3.1% for the third consecutive year."
- Use "However" to pivot from a strength or positive framing to a complication, tension, or counterpoint — this is a signature move.
- Use "Moreover" to stack a second concern or add supporting evidence.
- Conditional risk framing: "Unless [X] is addressed, [country] will struggle to [Y]" — risks are consequences of inaction, not abstract threats.
- Close the Outlook section with a forward-looking prescription: what the economy "needs to," "should," or "will need to" do. Be specific and action-oriented.
- Tone is measured and analytical — neither alarmist nor cheerleading. Acknowledge both strengths and vulnerabilities with equal rigour.

DATA STYLE:
- Use precise numbers, not rounded approximations: "7.8%" not "nearly 8%", "declined from 36% in 2007 to 27% in 2019" not "fell significantly."
- Always contextualise figures against the G20 average, a regional peer, or a historical trajectory — e.g. "exceeding the G20 median of X%" or "a decline from Y% in 2010."
- Weave data naturally into sentences — data is part of the narrative, not a footnote.
- Use historical comparisons to show direction and momentum.

FORMAT:
- 5–7 sentences per section body. Each sentence carries one clear idea.
- No bullet points, no markdown, no em-dashes used as list separators.
- Flowing, readable prose — the style of a serious magazine feature, not a technical IMF report.

---

Generate commentary for all 19 G20 non-EU economies using the data table below. Return ONLY valid JSON (no code fences, no preamble, no trailing text):

{
  "global": {
    "title": "G20 Economic Outlook — ${currentYear} Assessment",
    "cutoff": "Data as of [Month Year of most recent data point]",
    "paragraphs": ["paragraph 1", "paragraph 2", "paragraph 3", "paragraph 4", "paragraph 5"],
    "keyRisks": ["risk 1", "risk 2", "risk 3", "risk 4", "risk 5"],
    "upside": ["upside factor 1", "upside factor 2", "upside factor 3", "upside factor 4"]
  },
  "countries": {
    "USA": {
      "headline": "max 12 words capturing this economy's defining challenge or opportunity",
      "sections": [
        { "heading": "Economic Performance",        "body": "160-200 words" },
        { "heading": "Labour Market & Prices",       "body": "160-200 words" },
        { "heading": "Fiscal Position",              "body": "160-200 words" },
        { "heading": "External Sector & Investment", "body": "160-200 words" },
        { "heading": "Outlook & Key Risks",          "body": "160-200 words" }
      ]
    }
  }
}

Section guidance (apply to every country, 160-200 words each):
  "Economic Performance"         — Open with GDP size and growth rate vs G20 median. Compare growth to 1-2 named regional peers. Cover sector drivers, investment, and productivity trajectory. Use "However" if growth masks a structural weakness. Name the economy's largest sector and its contribution.
  "Labour Market & Prices"       — Open with unemployment and inflation levels vs G20 median. Reference the youth-to-adult unemployment ratio. Cite female labour force participation vs G20 average. Use "However" to flag sticky inflation or labour market rigidities. Comment on wage growth and real income trends.
  "Fiscal Position"              — Open with government debt as % of GDP vs the G20 median and state whether debt is on a rising or falling trajectory. Cover the fiscal balance, the largest spending category, and revenue adequacy. Reference health, education, and R&D spending. Use "Unless" to frame the consolidation challenge.
  "External Sector & Investment" — Open with the current account position and what drives it. Compare export orientation (exports as % of GDP) to the G20 median. Note whether FDI inflows are rising or falling. Cover capital formation and manufacturing competitiveness. Contextualise against G20 peers and name a comparable economy.
  "Outlook & Key Risks"          — Open with the near-term growth outlook. Name 2 specific structural priorities with data. Name 2 specific downside risks. Cite a comparable country that has addressed a similar challenge. Close with a prescriptive sentence naming the single most urgent policy action.

Additional rules:
- Global paragraphs: ~130 words each, contextualise G20 aggregate trends with specific country examples
- keyRisks and upside: short sharp phrases, under 12 words each
- Include ALL 19 non-EU countries: USA, GBR, CAN, DEU, FRA, ITA, JPN, AUS, KOR, CHN, IND, BRA, MEX, ARG, RUS, SAU, ZAF, IDN, TUR
- Do NOT use markdown formatting (no **, no ##, no bullet dashes) inside any string values
- Cite data years in parentheses when referencing a specific data point, e.g. "(2024)"

DATA TABLE:
${dataTable}`;

  let parsed;
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 16000,
        system: 'You are writing in the voice of Ankit Mishra, a Forbes contributor covering global economic policy. Your style: open with a strong data anchor, use "However" to pivot to complications, benchmark numbers against G20 averages or peer economies, frame risks as consequences of inaction ("Unless X, the economy will struggle to Y"), and close each Outlook section with a prescriptive forward-looking recommendation. Write flowing magazine prose — precise, analytical, and accessible. No markdown, no bullet points, no jargon-heavy IMF register.',
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.log(`  ⚠ Anthropic API error (${resp.status}): ${errText.slice(0, 200)} — skipping.`);
      return;
    }

    const data = await resp.json();
    const raw = data?.content?.[0]?.text || '';
    parsed = JSON.parse(raw);
  } catch (e) {
    console.log(`  ⚠ Commentary generation failed: ${e.message} — skipping.`);
    return;
  }

  const countryKeys = Object.keys(parsed?.countries || {});
  if (countryKeys.length < 16) {
    console.log(`  ⚠ Only ${countryKeys.length}/19 countries in response — skipping to preserve existing file.`);
    return;
  }
  // Verify at least one country has the new sections schema
  const hasSections = countryKeys.some(k => Array.isArray(parsed.countries[k]?.sections));
  if (!hasSections) {
    console.log(`  ⚠ Response uses old paragraphs schema instead of sections — skipping.`);
    return;
  }

  parsed.global._generatedAt = new Date().toISOString();
  parsed.global.cutoff = `Data as of ${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`;

  const fileContent = [
    `// AUTO-GENERATED by sync/seed.js — ${parsed.global._generatedAt}`,
    `// Do not edit manually. Regenerated on each monthly data refresh.`,
    `// Data: World Bank, IMF, OECD via Supabase. Commentary: Claude Sonnet.\n`,
    `window.G20_COMMENTARY = ${JSON.stringify(parsed, null, 2)};`,
  ].join('\n');

  try {
    const fs = await import('fs');
    const outPath = new URL('../app/components/commentary.js', import.meta.url).pathname;
    fs.writeFileSync(outPath, fileContent, 'utf8');
    console.log(`  ✓ commentary.js written (${countryKeys.length} countries, generated ${parsed.global._generatedAt})`);
  } catch (e) {
    console.log(`  ⚠ Could not write commentary.js: ${e.message}`);
  }
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

  // OECD R&D (MSTI) — overwrites WB R&D for OECD members (per-country fetch to avoid API size limits)
  process.stdout.write(`Fetching RD_EXP  (OECD MSTI GERD % GDP, per-country)…`);
  try {
    const rows = await fetchOECDRD();
    process.stdout.write(` ${rows.length} rows → upserting…`);
    await upsert(rows);
    totalRows += rows.length;
    console.log(` ✓`);
  } catch (e) {
    console.log(` ✗ ${e.message} (WB fallback retained)`);
  }

  // OECD Labour Productivity — GDP per hour worked (non-fatal; OECD G20 members only)
  process.stdout.write(`Fetching PRODUCTIVITY (OECD PDB, OECD G20 members)…`);
  try {
    const rows = await fetchOECDProductivity();
    if (rows.length) {
      process.stdout.write(` ${rows.length} rows → upserting…`);
      await upsert(rows);
      totalRows += rows.length;
      console.log(` ✓`);
    } else {
      console.log(` ⚠ no data (API may be rate-limited or dataset key changed; skipped)`);
    }
  } catch (e) {
    console.log(` ✗ ${e.message} (skipped — non-fatal)`);
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

  // IMF government fiscal balance (net lending / borrowing % GDP)
  process.stdout.write(`Fetching FISCAL_BAL (IMF GGXCNL_NGDP)…`);
  try {
    const rows = await fetchIMFDataset('GGXCNL_NGDP', 'FISCAL_BAL');
    process.stdout.write(` ${rows.length} rows → upserting…`);
    await upsert(rows);
    totalRows += rows.length;
    console.log(` ✓`);
  } catch (e) {
    console.log(` ✗ ${e.message}`);
    failures++;
  }

  console.log(`\n✓ Seeded ${totalRows.toLocaleString()} rows (${failures} failure(s)).`);

  const summary = await validate();
  await generateCommentary(summary);

  if (failures > 0) process.exit(1); // signal failure to GitHub Actions
}

main().catch(err => {
  console.error('\n✗ Fatal error:', err.message);
  process.exit(1);
});
