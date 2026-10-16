const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseEcbDailyXml, parseFredCsv } = require('../lib/market-data.cjs');

test('ECB daily reference XML becomes dated FX observations', () => {
  const xml = `<Cube><Cube time="2026-10-15"><Cube currency="USD" rate="1.1624"/><Cube currency="GBP" rate="0.8671"/></Cube></Cube>`;
  assert.deepEqual(parseEcbDailyXml(xml), { date: '2026-10-15', rates: { USD: 1.1624, GBP: 0.8671 } });
});

test('FRED parser selects the latest non-missing observation', () => {
  assert.deepEqual(parseFredCsv('DATE,DGS10\n2026-10-14,4.03\n2026-10-15,.\n2026-10-16,4.07\n'), { date: '2026-10-16', value: 4.07 });
});

test('homepage exposes an honestly labelled auto-refreshing market rail', () => {
  const root = path.resolve(__dirname, '..');
  const home = fs.readFileSync(path.join(root, 'src/app/page.tsx'), 'utf8');
  const component = fs.readFileSync(path.join(root, 'src/components/live-market-rail.tsx'), 'utf8');
  assert.match(home, /LiveMarketRail/);
  assert.match(component, /Official daily reference data/);
  assert.match(component, /300_000/);
  assert.ok(fs.existsSync(path.join(root, 'src/app/api/v1/market/route.ts')));
});
