// Writes public/legacy/data/realtime.json: the daily market layer shown in the header strip
// and on country profiles. Keyless official sources only:
//   BIS central bank policy rates (daily + monthly end of period, SDMX CSV)
//   ECB euro foreign exchange reference rates (last 90 days, XML) -> FX vs USD
//   FRED daily series: US 10-year Treasury, Brent, WTI, broad dollar index, VIX
// Each source is independent: a failed source is reported and the previous file's
// section is kept, so one outage never blanks the strip. Exits 1 only if every source fails.
// Run: node sync/realtime.js
const fs = require('fs');
const path = require('path');
const registry = require('../lib/registry.cjs');
const R = require('../lib/realtime-build.cjs');

const OUT = path.join(__dirname, '..', 'public', 'legacy', 'data', 'realtime.json');
const UA = { 'User-Agent': 'G20Dashboard-Realtime/1.0 (+https://g20-gamma.vercel.app)' };

async function text(url, attempts = 3) {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(45000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.text();
    } catch (e) {
      if (i >= attempts) throw new Error(`${new URL(url).host}: ${e.message}`);
      await new Promise((res) => setTimeout(res, 1500 * i));
    }
  }
}

const FRED = [
  ['US10Y', 'DGS10', 'US 10Y', '%', 'U.S. Treasury via FRED (DGS10)'],
  ['BRENT', 'DCOILBRENTEU', 'Brent', 'USD/bbl', 'EIA via FRED (DCOILBRENTEU)'],
  ['WTI', 'DCOILWTICO', 'WTI', 'USD/bbl', 'EIA via FRED (DCOILWTICO)'],
  ['USD_BROAD', 'DTWEXBGS', 'Broad dollar', 'index', 'Federal Reserve via FRED (DTWEXBGS)', 'weekly'],
  ['VIX', 'VIXCLS', 'VIX', 'index', 'Cboe via FRED (VIXCLS)'],
];

(async () => {
  const now = new Date();
  let previous = {};
  try { previous = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch { /* first run */ }
  const out = { schemaVersion: 1, generatedAt: now.toISOString(), note: 'Official daily reference data, not tick-by-tick prices.', markets: {}, fx: previous.fx || null, policyRates: previous.policyRates || null, errors: [] };
  const since = new Date(now.getTime() - 40 * 864e5).toISOString().slice(0, 10);

  // FRED daily series (each independent).
  await Promise.all(FRED.map(async ([key, id, label, unit, source, cadence = 'daily']) => {
    try {
      const rows = R.parseFredSeries(await text(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}&cosd=${since}`));
      const entry = R.marketEntry(key, label, unit, rows, source, now, cadence);
      if (!entry) throw new Error('no value in range');
      out.markets[key] = entry;
    } catch (e) {
      out.errors.push(`FRED ${id}: ${e.message}`);
      if (previous.markets?.[key]) out.markets[key] = { ...previous.markets[key], carriedOver: true };
    }
  }));

  // ECB FX (90-day history gives 1-day and 30-day moves).
  try {
    out.fx = R.buildFx(R.parseEcbHistory(await text('https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml')), now);
  } catch (e) { out.errors.push(`ECB FX: ${e.message}`); }

  // BIS policy rates: one request each for daily (latest) and monthly (last moves).
  try {
    const iso2to3 = Object.fromEntries(registry.countries.map((c) => [c.iso2, c.iso3]));
    const daily = R.parseBisCsv(await text('https://stats.bis.org/api/v1/data/WS_CBPOL/D.?lastNObservations=1&format=csv'));
    const monthly = R.parseBisCsv(await text('https://stats.bis.org/api/v1/data/WS_CBPOL/M.?lastNObservations=36&format=csv'));
    out.policyRates = R.buildPolicyRates(daily, monthly, iso2to3, now);
  } catch (e) { out.errors.push(`BIS policy rates: ${e.message}`); }

  const got = Object.keys(out.markets).filter((k) => !out.markets[k].carriedOver).length + (out.errors.some((e) => e.startsWith('ECB')) ? 0 : 1) + (out.errors.some((e) => e.startsWith('BIS')) ? 0 : 1);
  if (!got) { console.error('Every real-time source failed:\n  ' + out.errors.join('\n  ')); process.exit(1); }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT + '.tmp', JSON.stringify(out, null, 1));
  fs.renameSync(OUT + '.tmp', OUT);
  const rates = Object.keys(out.policyRates?.values || {}).length;
  console.log(`Realtime written: ${Object.keys(out.markets).length} market series, ${Object.keys(out.fx?.values || {}).length} currencies (ECB ${out.fx?.date}), ${rates} economies with a policy rate (BIS ${out.policyRates?.date})`);
  if (out.errors.length) console.log(`::warning::Some real-time sources failed: ${out.errors.join('; ')}`);
})().catch((e) => { console.error(e.message || e); process.exit(1); });
