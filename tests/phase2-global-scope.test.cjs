const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { buildShards } = require('../lib/shards-build.cjs');

const ROOT = path.join(__dirname, '..');
const LEGACY = path.join(ROOT, 'public', 'legacy');

// ── Shard builder ────────────────────────────────────────────────────────────
const rows = [
  { country_iso3: 'NGA', indicator_key: 'GDP_GROWTH', year: 2024, value: 3.4, is_projection: false },
  { country_iso3: 'NGA', indicator_key: 'GDP_GROWTH', year: 2025, value: 4.0, is_projection: false },
  { country_iso3: 'NGA', indicator_key: 'DEBT_GDP', year: 2025, value: 36.1, is_projection: false },
  { country_iso3: 'NGA', indicator_key: 'DEBT_GDP', year: 2026, value: 37.5, is_projection: true },
  { country_iso3: 'NGA', indicator_key: 'DEBT_GDP', year: 2030, value: 40.2, is_projection: false }, // year beyond latest actual
  { country_iso3: 'NGA', indicator_key: 'INFLATION', year: 2025, value: null, is_projection: false },
  { country_iso3: 'WLD', indicator_key: 'GDP_GROWTH', year: 2025, value: 3.1, is_projection: false }, // aggregate, not a country
  { country_iso3: 'KEN', indicator_key: 'GDP_GROWTH', year: 2025, value: 4.7, is_projection: false },
];
const opts = { generatedAt: '2026-10-17T00:00:00Z', latestActualYear: 2025, indicators: ['GDP_GROWTH', 'DEBT_GDP', 'INFLATION'], countries: ['NGA', 'KEN'] };

test('latest values are the most recent actual year and never a projection', () => {
  const { latest } = buildShards(rows, opts);
  assert.deepStrictEqual(latest.values.NGA.GDP_GROWTH, [4, 2025]);
  assert.deepStrictEqual(latest.values.NGA.DEBT_GDP, [36.1, 2025]);
  assert.strictEqual(latest.values.NGA.INFLATION, undefined, 'null values are skipped, never filled');
});

test('projections stay in the country shard only, flagged separately', () => {
  const { byCountry, byIndicator } = buildShards(rows, opts);
  assert.deepStrictEqual(byCountry.NGA.projections.DEBT_GDP, { 2026: 37.5, 2030: 40.2 });
  assert.deepStrictEqual(byCountry.NGA.series.DEBT_GDP, { 2025: 36.1 });
  assert.deepStrictEqual(byIndicator.DEBT_GDP.series.NGA, { 2025: 36.1 });
});

test('aggregates and unknown economies are excluded from every shard', () => {
  const { latest, byCountry, byIndicator } = buildShards(rows, opts);
  assert.ok(!('WLD' in latest.values));
  assert.ok(!('WLD' in byCountry));
  assert.ok(!('WLD' in byIndicator.GDP_GROWTH.series));
  assert.strictEqual(latest.countries, 2);
});

test('coverage tiers: quarterly or daily data is tier 1, sparse annual is tier 3', () => {
  const { latest } = buildShards(rows, { ...opts, highFrequencyCountries: new Set(['KEN']) });
  assert.strictEqual(latest.tiers.KEN, 1);
  assert.strictEqual(latest.tiers.NGA, 2, 'NGA reports 2 of 3 indicators (>= 60%)');
});

test('the builder requires the latest actual year', () => {
  assert.throws(() => buildShards(rows, { ...opts, latestActualYear: undefined }), /latestActualYear/);
});

// ── Scope (browser script run in a sandbox) ──────────────────────────────────
function loadScope({ search = '', stored = {} } = {}) {
  const store = { ...stored };
  const window = {};
  const ctx = {
    window, console,
    location: { search },
    URLSearchParams,
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
  };
  window.COUNTRY_REGISTRY = JSON.parse(fs.readFileSync(path.join(LEGACY, 'countries.json'), 'utf8'));
  vm.createContext(ctx);
  // config.js and scope.js share one global scope, like two <script> tags.
  vm.runInContext(fs.readFileSync(path.join(LEGACY, 'config.js'), 'utf8') + '\n' + fs.readFileSync(path.join(LEGACY, 'scope.js'), 'utf8'), ctx);
  return { ctx, window, store, G20: () => vm.runInContext('G20', ctx) };
}

test('default scope is Global (every registry economy)', () => {
  const { window, G20 } = loadScope();
  assert.strictEqual(window.Scope.id(), 'global');
  assert.strictEqual(G20().length, window.COUNTRY_REGISTRY.countries.length);
});

test('G20 scope keeps its original order, with the EU comparator', () => {
  const { window, G20 } = loadScope();
  window.Scope.set('g20');
  assert.strictEqual(window.Scope.id(), 'g20');
  assert.strictEqual(G20().length, 20);
  assert.strictEqual(G20()[0].iso3, 'USA');
  assert.ok(G20().some((c) => c.iso3 === 'EUU'));
  assert.strictEqual(window.PEER(), 'G20');
  assert.strictEqual(window.PEER_IN(), 'G20');
});

test('global scope covers every registry economy and reassigns the shared G20 binding', () => {
  const { window, G20 } = loadScope();
  window.Scope.set('global');
  assert.strictEqual(G20().length, window.COUNTRY_REGISTRY.countries.length);
  assert.strictEqual(window.G20, G20());
  assert.ok(!G20().some((c) => c.iso3 === 'WLD'), 'aggregates are never in scope');
  assert.strictEqual(window.PEER(), 'world');
  assert.strictEqual(window.PEER_IN(), 'the world');
});

test('region and income scopes are subsets of the registry; scope persists and reads from ?scope=', () => {
  const { window, G20, store } = loadScope();
  window.Scope.set('region:SSF');
  assert.ok(G20().length > 40 && G20().every((c) => c.regionCode === 'SSF'));
  assert.strictEqual(JSON.parse(store['gei-scope-v2']), 'region:SSF');
  const viaUrl = loadScope({ search: '?scope=income:LIC' });
  assert.strictEqual(viaUrl.window.Scope.id(), 'income:LIC');
  assert.ok(viaUrl.G20().every((c) => c.incomeCode === 'LIC'));
  const bogus = loadScope({ search: '?scope=nope' });
  assert.strictEqual(bogus.window.Scope.id(), 'global');
});

test('watchlist scope follows toggles and ignores unknown codes', () => {
  const { window, G20 } = loadScope({ stored: { 'g20-watchlist': JSON.stringify(['NGA', 'ZZZ']) } });
  window.Scope.set('watchlist');
  assert.strictEqual(JSON.stringify(G20().map((c) => c.iso3)), '["NGA"]');
  window.Scope.toggleWatch('KEN');
  assert.strictEqual(JSON.stringify(G20().map((c) => c.iso3)), '["NGA","KEN"]');
  assert.strictEqual(window.Scope.isWatched('KEN'), true);
});

// ── Shards on disk match the format the browser expects ──────────────────────
test('committed latest.json covers the registry with actual-only values', () => {
  const file = path.join(LEGACY, 'data', 'latest.json');
  const latest = JSON.parse(fs.readFileSync(file, 'utf8'));
  const registry = JSON.parse(fs.readFileSync(path.join(LEGACY, 'countries.json'), 'utf8'));
  assert.strictEqual(latest.schemaVersion, 1);
  assert.ok(latest.countries >= 150, `expected a global shard, got ${latest.countries} economies`);
  const known = new Set([...registry.countries.map((c) => c.iso3), 'EUU']);
  for (const [iso3, vals] of Object.entries(latest.values)) {
    assert.ok(known.has(iso3), `${iso3} is not a registry economy`);
    for (const [, [value, year]] of Object.entries(vals)) {
      assert.ok(Number.isFinite(value));
      assert.ok(year <= latest.latestActualYear, `${iso3} has a value after the latest actual year`);
    }
  }
});
