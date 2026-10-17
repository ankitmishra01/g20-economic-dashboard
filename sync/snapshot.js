// Writes public/legacy/data-snapshot.json: a static copy of the three Supabase tables the
// dashboard reads. public/legacy/data.js falls back to it when Supabase is unreachable
// (e.g. the free-tier project auto-pauses), so the site still renders.
// Uses the public read-only key; no secrets involved.
const fs = require('fs');
const path = require('path');
const { snapshotDestination } = require('../lib/project-paths.cjs');
// The snapshot mirrors what the dashboard reads: its G20 scope (incl. the EU),
// not every economy in the table.
const SCOPE = require('../lib/registry.cjs').g20Iso3({ includeEU: true });

const BASE = process.env.SUPABASE_URL || 'https://qozknjenyhewmkapsizk.supabase.co';
const KEY = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_8I4WpqENYtTkUNKzqfxkkQ_lrQKG3cG';
const PAGE = 1000;

async function fetchAll(table, select, order, filter = '') {
  const out = [];
  for (let offset = 0; ; offset += PAGE) {
    let page;
    for (let attempt = 1; ; attempt++) {
      try {
        const r = await fetch(`${BASE}/rest/v1/${table}?select=${select}${filter}${order ? `&order=${order}` : ''}`, {
          headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Range: `${offset}-${offset + PAGE - 1}` },
        });
        if (!r.ok) throw new Error(`${table}: HTTP ${r.status}`);
        page = await r.json();
        break;
      } catch (e) {
        if (attempt >= 4) throw e;
        await new Promise(res => setTimeout(res, 1000 * attempt));
      }
    }
    out.push(...page);
    if (page.length < PAGE) break;
  }
  return out;
}

(async () => {
  const annual = await fetchAll('g20_economic_data', 'country_iso3,indicator_key,year,value', 'year.asc', `&country_iso3=in.(${SCOPE.join(',')})`);
  const quarterly = await fetchAll('g20_quarterly_data', 'country_iso3,indicator_key,period,value', 'period.asc');
  const meta = await fetchAll('g20_indicators', '*');
  if (annual.length < 1000) throw new Error(`Refusing to write snapshot: only ${annual.length} annual rows`);
  const snap = {
    generatedAt: new Date().toISOString(),
    annual: annual.map(r => [r.country_iso3, r.indicator_key, r.year, r.value]),
    quarterly: quarterly.map(r => [r.country_iso3, r.indicator_key, r.period, r.value]),
    meta,
  };
  const file = snapshotDestination(__dirname);
  fs.writeFileSync(file + '.tmp', JSON.stringify(snap));
  fs.renameSync(file + '.tmp', file);
  console.log(`Snapshot written: ${annual.length} annual, ${quarterly.length} quarterly, ${meta.length} indicators`);
})().catch(e => { console.error(e); process.exit(1); });
