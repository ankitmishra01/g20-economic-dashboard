const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { paginate, mergeVintages, coverageSummary } = require('../lib/api-contract.cjs');
const { runIngestionJob } = require('../lib/ingestion-pipeline.cjs');
const { collectPages } = require('../lib/paginated-source.cjs');
const { latestSourceVintages } = require('../lib/live-data.cjs');

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

test('ingestion persists accepted rows and closes the job log', async () => {
  const events = [];
  const result = await runIngestionJob({
    provider: 'World Bank',
    start: async () => { events.push('start'); return 'run-1'; },
    fetchRows: async () => [{ country: 'CAN', period: '2025', value: 1.7 }],
    persistRows: async (rows) => { events.push(`persist:${rows.length}`); return rows.length; },
    finish: async (_id, status, counts) => events.push(`finish:${status}:${counts.written}`),
  });
  assert.deepEqual(events, ['start', 'persist:1', 'finish:succeeded:1']);
  assert.equal(result.rowsWritten, 1);
});

test('versioned APIs prefer Supabase facts with a documented snapshot fallback', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'src/lib/live-repository.ts'), 'utf8');
  assert.match(source, /economic_observations/);
  assert.match(source, /indicator_series/);
  assert.match(source, /fallback/i);
});

test('Supabase fact reads continue until the final partial page', async () => {
  const pages = [[1, 2], [3, 4], [5]]; const calls = [];
  const rows = await collectPages(async (from, to) => { calls.push([from, to]); return pages.shift() ?? []; }, { pageSize: 2, maxRows: 10 });
  assert.deepEqual(rows, [1, 2, 3, 4, 5]);
  assert.deepEqual(calls, [[0, 1], [2, 3], [4, 5]]);
});

test('live fact deduplication preserves parallel official sources', () => {
  const rows = latestSourceVintages([
    { series_id: 'imf', country_iso3: 'CAN', period: '2025', vintage_date: '2026-04-01' },
    { series_id: 'wb', country_iso3: 'CAN', period: '2025', vintage_date: '2026-01-01' },
    { series_id: 'imf', country_iso3: 'CAN', period: '2025', vintage_date: '2026-10-01' },
  ]);
  assert.deepEqual(rows.map((row) => row.series_id), ['imf', 'wb']);
  assert.equal(rows[0].vintage_date, '2026-10-01');
});
