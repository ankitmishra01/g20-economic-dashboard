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

  const ALL_INDICATORS = [...Object.keys(WB_INDICATORS), 'DEBT_GDP'];
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

    const staleMark = latestYear < 2021 ? ' ⚠ STALE'   : '';
    const missMark  = missing.length > 2 ? ` ⚠ MISSING: ${missing.slice(0,4).join(',')}${missing.length > 4 ? '…' : ''}` : '';
    const rangeMark = outOfRange.length  ? ` ⚠ OUT-OF-RANGE: ${outOfRange.join(',')}` : '';
    console.log(`  ${ind.padEnd(14)} covered:${String(covered.length).padStart(2)}/19  latest:${latestYear || '—'}${staleMark}${missMark}${rangeMark}`);

    if (missing.length > 2)    issues.push(`${ind}: missing ${missing.join(', ')}`);
    if (latestYear < 2021)     issues.push(`${ind}: latest year ${latestYear} — stale`);
    if (outOfRange.length > 0) issues.push(`${ind}: out-of-range for ${outOfRange.join(', ')}`);
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

  await validate();

  if (failures > 0) process.exit(1); // signal failure to GitHub Actions
}

main().catch(err => {
  console.error('\n✗ Fatal error:', err.message);
  process.exit(1);
});
