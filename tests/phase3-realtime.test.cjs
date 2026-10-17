const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const R = require('../lib/realtime-build.cjs');

const NOW = new Date('2026-10-16T12:00:00Z');

test('FRED series: skips missing values and keeps order', () => {
  const rows = R.parseFredSeries('observation_date,DGS10\n2026-10-13,4.10\n2026-10-14,.\n2026-10-15,4.01\n');
  assert.deepStrictEqual(rows, [{ date: '2026-10-13', value: 4.1 }, { date: '2026-10-15', value: 4.01 }]);
  assert.throws(() => R.parseFredSeries('observation_date,DGS10\n2026-10-14,.\n'), /no observations/);
});

test('market entry: change vs previous observation, freshness, and out-of-range values dropped', () => {
  const e = R.marketEntry('VIX', 'VIX', 'index', [{ date: '2026-10-14', value: 16.87 }, { date: '2026-10-15', value: 16.46 }, { date: '2026-10-16', value: 999 }], 'Cboe via FRED', NOW);
  assert.strictEqual(e.value, 16.46, 'an implausible 999 is dropped, not used');
  assert.strictEqual(e.previous, 16.87);
  assert.strictEqual(e.change, -0.41);
  assert.strictEqual(e.freshness, 'current');
  assert.strictEqual(R.marketEntry('VIX', 'VIX', 'index', [{ date: '2026-10-15', value: 999 }], 'x', NOW), null);
  const weekly = R.marketEntry('USD_BROAD', 'Broad dollar', 'index', [{ date: '2026-10-09', value: 121.6 }], 'Fed', NOW, 'weekly');
  assert.strictEqual(weekly.freshness, 'current', 'a weekly series 7 days old is still current');
});

test('BIS CSV: quoted titles with commas, per-area series sorted', () => {
  const csv = [
    'FREQ,REF_AREA,UNIT_MEASURE,TITLE,TIME_PERIOD,OBS_VALUE',
    'M,US,368,"Central bank policy rates, United States",2026-09,3.875',
    'M,US,368,"Central bank policy rates, United States",2026-08,3.625',
    'M,XM,368,"Euro area, ECB",2026-09,2.5',
    'M,BR,368,"Brazil",2026-09,',
  ].join('\n');
  const s = R.parseBisCsv(csv);
  assert.deepStrictEqual(s.US.map((r) => r.period), ['2026-08', '2026-09']);
  assert.strictEqual(s.XM[0].value, 2.5);
  assert.ok(!('BR' in s), 'empty observations are skipped');
});

test('policy rates: latest daily value, last move from the monthly series, euro area mapped to members', () => {
  const daily = { US: [{ period: '2026-10-13', value: 3.875 }], XM: [{ period: '2026-10-13', value: 2.5 }], ZZ: [{ period: '2026-10-13', value: 500 }] };
  const monthly = { US: [{ period: '2026-07', value: 3.625 }, { period: '2026-08', value: 3.625 }, { period: '2026-09', value: 3.875 }], XM: [{ period: '2026-09', value: 2.5 }] };
  const p = R.buildPolicyRates(daily, monthly, { US: 'USA' }, NOW);
  assert.strictEqual(p.values.USA.rate, 3.875);
  assert.deepStrictEqual(p.values.USA.lastChange, { from: 3.625, to: 3.875, after: '2026-08', change: 0.25 });
  assert.strictEqual(p.values.DEU.rate, 2.5);
  assert.strictEqual(p.values.DEU.euroArea, true);
  assert.strictEqual(p.values.DEU.lastChange, null, 'no move found in the window');
  assert.ok(!Object.values(p.values).some((v) => v.rate === 500), 'out-of-range rates are dropped');
  assert.ok(R.EURO_AREA.includes('BGR'), 'Bulgaria joined the euro area on 1 January 2026');
});

test('ECB history → FX per USD with 1-day and 30-day moves', () => {
  const xml = `<Cube>
    <Cube time="2026-09-16"><Cube currency="USD" rate="1.10"/><Cube currency="JPY" rate="165.0"/></Cube>
    <Cube time="2026-10-15"><Cube currency="USD" rate="1.12"/><Cube currency="JPY" rate="176.0"/></Cube>
    <Cube time="2026-10-16"><Cube currency="USD" rate="1.125"/><Cube currency="JPY" rate="177.75"/></Cube>
  </Cube>`;
  const days = R.parseEcbHistory(xml);
  assert.deepStrictEqual(days.map((d) => d.date), ['2026-09-16', '2026-10-15', '2026-10-16']);
  const fx = R.buildFx(days, NOW);
  assert.strictEqual(fx.date, '2026-10-16');
  assert.strictEqual(fx.values.JPY.perUsd, 158);              // 177.75 / 1.125
  assert.strictEqual(fx.values.EUR.perUsd, 0.8889);           // 1 / 1.125
  assert.strictEqual(fx.values.JPY.change30dPct, 5.33);        // vs 150.0 a month earlier: yen weakened
  assert.strictEqual(fx.currencyByIso3.DEU, 'EUR');
  assert.strictEqual(fx.currencyByIso3.HKG, 'HKD');
});

test('committed realtime.json has dated values from official sources', () => {
  const rt = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public', 'legacy', 'data', 'realtime.json'), 'utf8'));
  assert.strictEqual(rt.schemaVersion, 1);
  for (const m of Object.values(rt.markets)) {
    assert.match(m.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(Number.isFinite(m.value));
    assert.ok(m.source);
  }
  assert.ok(Object.keys(rt.policyRates.values).length >= 30, 'BIS covers 30+ economies');
  assert.ok(Object.keys(rt.fx.values).length >= 20, 'ECB covers 20+ currencies');
});
