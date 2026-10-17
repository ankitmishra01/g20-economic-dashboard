// Writes the static data shards served from the Vercel CDN (public/legacy/data/):
//   latest.json             every economy x indicator, latest actual value + year, coverage tiers
//   country/{ISO3}.json     one economy's annual series (projections kept separate)
//   indicator/{KEY}.json    one indicator's actual series for every economy
// The browser loads latest.json up front and the other shards on demand, so it never
// downloads the full table. Reads Supabase with the public read-only key; no secrets.
// Run: node sync/shards.js
const fs = require('fs');
const path = require('path');
const registry = require('../lib/registry.cjs');
const { buildShards } = require('../lib/shards-build.cjs');

const BASE = process.env.SUPABASE_URL || 'https://qozknjenyhewmkapsizk.supabase.co';
const KEY = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_8I4WpqENYtTkUNKzqfxkkQ_lrQKG3cG';
const PAGE = 1000;
const OUT = path.join(__dirname, '..', 'public', 'legacy', 'data');

async function fetchAll(table, select, order, filter = '') {
  const out = [];
  for (let offset = 0; ; offset += PAGE) {
    let page;
    for (let attempt = 1; ; attempt++) {
      try {
        const r = await fetch(`${BASE}/rest/v1/${table}?select=${select}${filter}${order ? `&order=${order}` : ''}`, {
          headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Range: `${offset}-${offset + PAGE - 1}` },
          signal: AbortSignal.timeout(30000),
        });
        if (!r.ok) throw new Error(`${table}: HTTP ${r.status}`);
        page = await r.json();
        break;
      } catch (e) {
        if (attempt >= 4) throw e;
        await new Promise((res) => setTimeout(res, 1000 * attempt));
      }
    }
    out.push(...page);
    if (page.length < PAGE) break;
  }
  return out;
}

function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file + '.tmp', JSON.stringify(obj));
  fs.renameSync(file + '.tmp', file);
}

function realtimeCountries() {
  try {
    const rt = JSON.parse(fs.readFileSync(path.join(OUT, 'realtime.json'), 'utf8'));
    return new Set(Object.keys(rt.policyRates?.values || {}));
  } catch { return new Set(); }
}

(async () => {
  const indicators = Object.keys(require('../lib/seed-helpers.cjs').GLOBAL_RANGES);
  // Registry economies plus the EU comparator (an aggregate the G20 view still shows).
  const countries = [...registry.countryIso3(), 'EUU'];
  const rows = await fetchAll('g20_economic_data', 'country_iso3,indicator_key,year,value,is_projection', 'country_iso3.asc,indicator_key.asc,year.asc');
  const quarterly = await fetchAll('g20_quarterly_data', 'country_iso3', 'country_iso3.asc,period.asc', '&indicator_key=eq.GDP_GROWTH');
  const economies = new Set(rows.map((r) => r.country_iso3));
  const minEconomies = Number(process.env.SHARDS_MIN_ECONOMIES || 150);
  if (economies.size < minEconomies) {
    throw new Error(`Refusing to write shards: only ${economies.size} economies in g20_economic_data (expected >= ${minEconomies}). Run the global structural refresh first, or set SHARDS_MIN_ECONOMIES for a G20-only build.`);
  }
  const latestActualYear = new Date().getUTCFullYear() - 1;
  const { latest, byCountry, byIndicator } = buildShards(rows, {
    generatedAt: new Date().toISOString(),
    latestActualYear,
    indicators,
    countries,
    quarterlyCountries: new Set(quarterly.map((r) => r.country_iso3)),
    highFrequencyCountries: realtimeCountries(),
  });
  fs.rmSync(path.join(OUT, 'country'), { recursive: true, force: true });
  fs.rmSync(path.join(OUT, 'indicator'), { recursive: true, force: true });
  writeJson(path.join(OUT, 'latest.json'), latest);
  for (const [iso3, shard] of Object.entries(byCountry)) writeJson(path.join(OUT, 'country', `${iso3}.json`), shard);
  for (const [key, shard] of Object.entries(byIndicator)) writeJson(path.join(OUT, 'indicator', `${key}.json`), shard);
  const tierCounts = Object.values(latest.tiers).reduce((a, t) => ((a[t] = (a[t] || 0) + 1), a), {});
  console.log(`Shards written: ${rows.length} rows, ${latest.countries} economies, ${Object.keys(byCountry).length} country shards, ${Object.keys(byIndicator).length} indicator shards, tiers ${JSON.stringify(tierCounts)}`);
})().catch((e) => { console.error(e.message || e); process.exit(1); });
