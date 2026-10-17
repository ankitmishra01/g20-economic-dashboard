const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');

const { buildRegistry, G20_MEMBERS, isAggregate } = require('../lib/registry-build.cjs');
const H = require('../lib/seed-helpers.cjs');
const registry = require('../lib/registry.cjs');

const ORIGINAL_G20 = [
  ['US', 'USA', 'United States', 'Americas'], ['GB', 'GBR', 'United Kingdom', 'Europe'], ['CA', 'CAN', 'Canada', 'Americas'],
  ['DE', 'DEU', 'Germany', 'Europe'], ['FR', 'FRA', 'France', 'Europe'], ['IT', 'ITA', 'Italy', 'Europe'],
  ['JP', 'JPN', 'Japan', 'Asia'], ['AU', 'AUS', 'Australia', 'Asia'], ['KR', 'KOR', 'South Korea', 'Asia'],
  ['CN', 'CHN', 'China', 'Asia'], ['IN', 'IND', 'India', 'Asia'], ['BR', 'BRA', 'Brazil', 'Americas'],
  ['MX', 'MEX', 'Mexico', 'Americas'], ['AR', 'ARG', 'Argentina', 'Americas'], ['RU', 'RUS', 'Russia', 'Europe'],
  ['SA', 'SAU', 'Saudi Arabia', 'Middle East'], ['ZA', 'ZAF', 'South Africa', 'Africa'], ['ID', 'IDN', 'Indonesia', 'Asia'],
  ['TR', 'TUR', 'Turkey', 'Europe'], ['EU', 'EUU', 'European Union', 'Europe'],
];

function wbCountry(id, name, regionId = 'SSF', income = 'LIC') {
  return { id, iso2Code: id.slice(0, 2), name, region: { id: regionId, value: regionId === 'NA' ? 'Aggregates' : `Region ${regionId}` },
    incomeLevel: { id: income, value: `Income ${income}` }, capitalCity: 'Capital', longitude: '1.5', latitude: '2.5' };
}

test('registry excludes World Bank aggregates and requires every G20 member', () => {
  const rows = [wbCountry('WLD', 'World', 'NA'), wbCountry('HIC', 'High income', 'NA')];
  for (const m of G20_MEMBERS.filter((x) => !x.aggregate)) rows.push(wbCountry(m.iso3, m.name, 'EAS', 'HIC'));
  for (let i = 0; i < 140; i++) rows.push(wbCountry(`Q${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(65 + Math.floor(i / 26))}`, `Country ${i}`));
  const reg = buildRegistry(rows, { generatedAt: 'fixed' });
  assert.equal(reg.countries.some((c) => c.iso3 === 'WLD' || c.iso3 === 'HIC'), false);
  assert.deepEqual(reg.aggregates.map((a) => a.iso3).sort(), ['HIC', 'WLD']);
  assert.equal(reg.countries.length, 159);
  assert.ok(reg.collections.regions.find((r) => r.code === 'SSF').members.length >= 140);
  assert.equal(isAggregate({ region: { id: 'NA' } }), true);
  assert.throws(() => buildRegistry(rows.filter((r) => r.id !== 'BRA')), /missing G20 members: BRA/);
  assert.throws(() => buildRegistry(rows.slice(0, 30)), /refusing to write|missing/);
});

test('generated registry covers ~200+ economies with the G20 unchanged', () => {
  assert.ok(registry.countries.length >= 200, `${registry.countries.length} countries`);
  assert.equal(registry.countries.some((c) => ['WLD', 'EUU', 'HIC', 'SSF'].includes(c.iso3)), false);
  assert.deepEqual(registry.g20Members.map((m) => [m.iso2, m.iso3, m.name, m.region]), ORIGINAL_G20);
  assert.deepEqual(registry.g20Iso3(), ORIGINAL_G20.slice(0, 19).map((r) => r[1]));
  assert.deepEqual(registry.advancedIso3(), ['USA', 'GBR', 'CAN', 'DEU', 'FRA', 'ITA', 'JPN', 'AUS', 'KOR']);
  assert.deepEqual(registry.commodityExporterIso3().sort(), ['AUS', 'BRA', 'CAN', 'IDN', 'RUS', 'SAU', 'ZAF']);
});

test('browser config derives the same G20 list, flags and sets from countries.js', () => {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'public/legacy/countries.js'), 'utf8'), sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'public/legacy/config.js'), 'utf8'), sandbox);
  const g20 = sandbox.window.G20;
  assert.deepEqual(JSON.parse(JSON.stringify(g20.map((c) => [c.code, c.iso3, c.name, c.region]))), ORIGINAL_G20); // cross-realm arrays
  assert.equal(g20[0].flag, '🇺🇸');
  assert.equal(g20[19].flag, '🇪🇺');
  assert.equal(sandbox.window.LATEST_ACTUAL_YEAR, new Date().getFullYear() - 1);
  assert.equal(sandbox.window.COUNTRY_SETS.advanced.has('KOR'), true);
  assert.equal(sandbox.window.COUNTRY_SETS.commodityExporters.has('SAU'), true);
});

test('World Bank parsing keeps registry economies only', () => {
  const payload = [{ pages: 1 }, [
    { countryiso3code: 'NGA', date: '2024', value: 3.1 },
    { countryiso3code: 'WLD', date: '2024', value: 2.7 },
    { countryiso3code: 'KEN', date: '2024', value: null },
  ]];
  const rows = H.parseWorldBankRows(payload, 'GDP_GROWTH', new Set(['NGA', 'KEN']));
  assert.deepEqual(rows, [{ country_iso3: 'NGA', indicator_key: 'GDP_GROWTH', year: 2024, value: 3.1, source: 'worldbank' }]);
});

test('IMF parsing flags projections and drops them unless asked to keep', () => {
  const json = { values: { GGXWDG_NGDP: { NGA: { 2024: 50, 2025: 52, 2026: 54 }, WEOWORLD: { 2025: 90 } } } };
  const allowed = new Set(['NGA']);
  const kept = H.parseImfRows(json, 'GGXWDG_NGDP', 'DEBT_GDP', allowed, { latestActualYear: 2025, keepProjections: true, source: 'imf' });
  assert.deepEqual(kept.map((r) => [r.year, r.is_projection]), [[2024, false], [2025, false], [2026, true]]);
  const observed = H.parseImfRows(json, 'GGXWDG_NGDP', 'DEBT_GDP', allowed, { latestActualYear: 2025 });
  assert.deepEqual(observed.map((r) => r.year), [2024, 2025]);
  assert.equal(observed.every((r) => r.is_projection === false), true);
  const scaled = H.parseImfRows({ values: { NGDPD: { NGA: { 2025: 2 } } } }, 'NGDPD', 'GDP', allowed, { latestActualYear: 2025, transform: (v) => v * 1e9 });
  assert.equal(scaled[0].value, 2e9);
});

test('range filter drops unit errors but keeps real extremes', () => {
  const { kept, dropped } = H.splitByRange([
    { indicator_key: 'INFLATION', value: 290 },          // Argentina 2023
    { indicator_key: 'DEBT_GDP', value: 468 },           // Liberia 2000
    { indicator_key: 'LIFE_EXPECT', value: 14.7 },       // source error
    { indicator_key: 'UNEMPLOYMENT', value: 332.4 },     // index level stored as a rate
  ]);
  assert.equal(kept.length, 2);
  assert.deepEqual(dropped.map((r) => r.indicator_key), ['LIFE_EXPECT', 'UNEMPLOYMENT']);
});

test('summary fails hard on missing or stale core G20 coverage and ignores projections', () => {
  const g20 = ['USA', 'CHN', 'IND', 'BRA'];
  const rows = [];
  for (const c of g20) rows.push({ country_iso3: c, indicator_key: 'GDP', year: 2025, value: 1 });
  rows.push({ country_iso3: 'USA', indicator_key: 'DEBT_GDP', year: 2031, value: 140, is_projection: true });
  rows.push({ country_iso3: 'NGA', indicator_key: 'GDP', year: 2025, value: 1 });
  const ok = H.summarize(rows, { indicators: ['GDP'], g20, latestActualYear: 2025 });
  assert.deepEqual(ok.hardErrors, []);
  assert.equal(ok.indicators.GDP.countriesCovered, 5);
  assert.equal(ok.countries, 5);
  const bad = H.summarize(rows, { indicators: ['GDP', 'DEBT_GDP'], g20, latestActualYear: 2025 });
  assert.match(bad.hardErrors.join(';'), /DEBT_GDP: G20 coverage missing USA, CHN, IND, BRA/);
  const stale = H.summarize(g20.map((c) => ({ country_iso3: c, indicator_key: 'GDP', year: 2015, value: 1 })), { indicators: ['GDP'], g20, latestActualYear: 2025 });
  assert.match(stale.hardErrors.join(';'), /stale/);
});

test('coverage tiers rank quarterly, broad annual and sparse annual coverage', () => {
  const rows = [];
  for (let i = 0; i < 20; i++) rows.push({ country_iso3: 'NGA', indicator_key: `K${i}`, year: 2024, value: 1 });
  rows.push({ country_iso3: 'TUV', indicator_key: 'GDP', year: 2024, value: 1 });
  rows.push({ country_iso3: 'USA', indicator_key: 'GDP', year: 2024, value: 1 });
  assert.deepEqual(H.coverageTiers(rows, new Set(['USA']), 25), { NGA: 2, TUV: 3, USA: 1 });
});

test('no hardcoded G20 lists or 2025 caps remain in the pipeline and dashboard', () => {
  const files = ['sync/seed.js', 'sync/train-forecast.js', 'sync/train-projections.js', 'api/status.js', 'public/legacy/data.js',
    'public/legacy/components/analysis.js', 'public/legacy/components/overview.js', 'public/legacy/components/projections.js', 'public/legacy/components/news.js'];
  for (const f of files) {
    const src = fs.readFileSync(path.join(root, f), 'utf8');
    assert.doesNotMatch(src, /'USA',\s*'GBR',\s*'CAN'/, `${f} still hardcodes the G20 list`);
    assert.doesNotMatch(src, /(<=|>)\s*2025\b|LATEST_YEAR_CAP\s*=\s*2025|END\s*=\s*2025|'2000:2025'/, `${f} still caps at 2025`);
  }
});
