#!/usr/bin/env node
// Term-spread (yield-curve) ingestion — KEYLESS FRED CSV (no API key required).
//
// The slope of the yield curve (10-year minus short-term rate) is the single
// best-documented recession leading indicator. We compute an annual term spread
// per economy from two OECD-via-FRED monthly series, downloaded through the
// public CSV endpoint (no key), and upsert it as indicator_key='TERM_SPREAD'
// into g20_economic_data so it joins the training panel and the frontend.
//
//   10-year govt yield : IRLTLT01<CC>M156N
//   3-month rate       : IR3TIB01<CC>M156N   (3-month interbank — textbook short leg)
//   term spread (pp)   : annual_avg(10y) - annual_avg(3m)
//
// Coverage (keyless): the advanced G20 + a few. Big EMs (IND, CHN, BRA, IDN,
// SAU, ARG, TUR) have no keyless series and fall back to fundamentals fragility.
//
// Run:  node sync/fetch-term-spread.js
//       node sync/fetch-term-spread.js --dry   (print, do not upsert)

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qozknjenyhewmkapsizk.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_8I4WpqENYtTkUNKzqfxkkQ_lrQKG3cG';
const DRY = process.argv.includes('--dry');

// iso3 -> FRED 2-letter country code (OECD series use ISO-2-ish codes)
const FRED_CC = {
  USA: 'US', DEU: 'DE', GBR: 'GB', CAN: 'CA', JPN: 'JP', KOR: 'KR',
  MEX: 'MX', AUS: 'AU', ITA: 'IT', FRA: 'FR', ZAF: 'ZA', RUS: 'RU',
};
const START = '2000-01-01';

const sleep = ms => new Promise(res => setTimeout(res, ms));

async function fredCsv(seriesId) {
  const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${seriesId}&cosd=${START}`;
  let text = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(45000) });
      if (r.status === 404) return null;
      if (r.ok) {
        const body = await r.text();
        // FRED returns a "Loading..." HTML stub on a cold first hit — retry.
        if (body && !body.startsWith('Loading') && body.includes(',')) { text = body; break; }
      }
    } catch (_) { /* timeout/network — fall through to retry */ }
    await sleep(1500 * (attempt + 1));
  }
  if (!text) return null;

  // Rows: DATE,VALUE  — '.' marks missing
  const byYear = {};
  for (const line of text.trim().split('\n').slice(1)) {
    const [date, val] = line.split(',');
    if (!date || val == null || val === '.' || val === '') continue;
    const v = parseFloat(val);
    if (Number.isNaN(v)) continue;
    const year = +date.slice(0, 4);
    (byYear[year] ||= []).push(v);
  }
  // annual mean
  const out = {};
  for (const [y, arr] of Object.entries(byYear)) out[+y] = arr.reduce((a, b) => a + b, 0) / arr.length;
  return out;
}

async function upsert(rows) {
  // Chunked upsert, mirrors sync/seed.js upsert()
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const r = await fetch(`${SUPABASE_URL}/rest/v1/g20_economic_data`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify(chunk),
    });
    if (!r.ok) throw new Error(`Supabase upsert failed (${r.status}): ${await r.text()}`);
  }
}

(async () => {
  const rows = [];
  const covered = [];
  for (const [iso3, cc] of Object.entries(FRED_CC)) {
    const long  = await fredCsv(`IRLTLT01${cc}M156N`);
    const short = await fredCsv(`IR3TIB01${cc}M156N`);
    if (!long || !short) { console.log(`${iso3}: missing series, skipped`); continue; }
    let n = 0, latest = null;
    for (const y of Object.keys(long).map(Number).sort((a, b) => a - b)) {
      if (short[y] == null || y < 2000 || y > 2025) continue;
      const spread = +(long[y] - short[y]).toFixed(3);
      rows.push({ country_iso3: iso3, indicator_key: 'TERM_SPREAD', year: y, value: spread, source: 'fred' });
      n++; latest = { y, spread };
    }
    covered.push(iso3);
    console.log(`${iso3}: ${n} years  | latest ${latest?.y}: ${latest?.spread >= 0 ? '+' : ''}${latest?.spread}pp${latest?.spread < 0 ? '  (inverted)' : ''}`);
  }
  console.log(`\nCovered economies (${covered.length}): ${covered.join(', ')}`);
  console.log(`Total rows: ${rows.length}`);
  if (DRY) { console.log('\n--dry: not upserting.'); return; }
  await upsert(rows);
  console.log('Upserted TERM_SPREAD to g20_economic_data.');
})().catch(e => { console.error(e); process.exit(1); });
