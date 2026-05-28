#!/usr/bin/env node
// G20 Economic Dashboard — Supabase data pipeline
// Fetches World Bank + IMF open data and seeds into Supabase.
// Run: node sync/seed.js
// Requires: Node 18+ (native fetch). No npm install needed.

const SUPABASE_URL = 'https://qozknjenyhewmkapsizk.supabase.co';
const SUPABASE_KEY = 'sb_publishable_8I4WpqENYtTkUNKzqfxkkQ_lrQKG3cG';

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

const YEARS = '2000:2024'; // CO2 data only available to ~2021; WB handles missing years gracefully
const CHUNK_SIZE = 500;

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
    signal: AbortSignal.timeout(30000),
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
    signal: AbortSignal.timeout(30000),
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

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('G20 Dashboard — Supabase seed script');
  console.log(`Target: ${SUPABASE_URL}`);
  console.log(`Countries: ${G20_ISO3.length} | Years: ${YEARS}\n`);

  let totalRows = 0;

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
    }
    // Respect World Bank rate limit
    await new Promise(r => setTimeout(r, 500));
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
  }

  console.log(`\n✓ Done — ${totalRows.toLocaleString()} rows seeded into Supabase.`);
  console.log(`\nVerify at: ${SUPABASE_URL.replace('https://', 'https://app.supabase.com/project/').replace('.supabase.co', '')}/editor`);
}

main().catch(err => {
  console.error('\n✗ Fatal error:', err.message);
  process.exit(1);
});
