const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { paginate, mergeVintages, coverageSummary } = require('../lib/api-contract.cjs');

test('cursor pagination enforces limits and produces a stable next cursor', () => {
  const page = paginate([{ id: 1 }, { id: 2 }, { id: 3 }], { limit: 2, cursor: null });
  assert.deepEqual(page.data.map((row) => row.id), [1, 2]);
  assert.equal(page.meta.nextCursor, '2');
  assert.throws(() => paginate([], { limit: 501 }), /limit/i);
});

test('revision merging preserves vintages and removes exact duplicates', () => {
  const rows = mergeVintages([
    { series: 'GDP', country: 'USA', period: '2025', vintage: '2026-01-01', value: 2 },
    { series: 'GDP', country: 'USA', period: '2025', vintage: '2026-04-01', value: 2.1 },
    { series: 'GDP', country: 'USA', period: '2025', vintage: '2026-04-01', value: 2.1 },
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[1].value, 2.1);
});

test('coverage summary makes sparse country availability explicit', () => {
  assert.deepEqual(coverageSummary(['USA', 'CAN'], ['USA', 'CAN', 'MEX']), {
    available: 2, expected: 3, ratio: 2 / 3, missing: ['MEX'],
  });
});

test('versioned route handlers exist for the public intelligence contract', () => {
  const root = path.resolve(__dirname, '..', 'src/app/api/v1');
  for (const route of ['countries', 'collections', 'indicators', 'observations', 'releases', 'pulse', 'health']) {
    assert.ok(fs.existsSync(path.join(root, route, 'route.ts')), `${route} route missing`);
  }
});

test('ingestion adapters identify official sources and stale-preservation semantics', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'src/lib/ingestion/adapters.ts'), 'utf8');
  for (const provider of ['World Bank', 'OECD', 'IMF', 'ECB', 'FRED']) assert.match(source, new RegExp(provider));
  assert.match(source, /preserveLastValid/);
  assert.match(source, /jobRun/);
});
