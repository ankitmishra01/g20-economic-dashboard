const test = require('node:test');
const assert = require('node:assert');
const { fetchObservedRows } = require('../api/status.js');
const { age, LIMITS } = require('../sync/probe.js');

function fakeFetch(total) {
  const calls = [];
  const rows = Array.from({ length: total }, (_, i) => ({ country_iso3: 'USA', indicator_key: 'GDP', year: i }));
  const impl = async (url, opts) => {
    calls.push({ url, range: opts.headers.Range, prefer: opts.headers.Prefer });
    const [a, b] = opts.headers.Range.split('-').map(Number);
    return {
      ok: true, status: 206,
      headers: { get: (k) => (k === 'content-range' ? `${a}-${b}/${total}` : null) },
      json: async () => rows.slice(a, b + 1),
    };
  };
  return { impl, calls };
}

test('status paging is ordered, excludes projections, and returns every row', async () => {
  const { impl, calls } = fakeFetch(2500);
  const rows = await fetchObservedRows(impl);
  assert.strictEqual(rows.length, 2500);
  assert.ok(calls.every((c) => /order=country_iso3\.asc/.test(c.url) && /is_projection=eq\.false/.test(c.url)));
  assert.strictEqual(calls[0].prefer, 'count=exact');
  assert.deepStrictEqual(calls.slice(1).map((c) => c.range), ['0-999', '1000-1999', '2000-2999']);
});

test('probe age helper treats missing timestamps as infinitely old', () => {
  const now = Date.parse('2026-10-17T00:00:00Z');
  assert.ok(age('2026-10-16T00:00:00Z', now) < LIMITS.realtime);
  assert.strictEqual(age(undefined, now), Infinity);
});

const { isAllowedOrigin } = require('../lib/cors.cjs');
test('only this project\'s previews are allowed, not any g20-git-* project', () => {
  assert.strictEqual(isAllowedOrigin('https://g20-git-feature-x-ankitmishra01s-projects.vercel.app', {}), true);
  assert.strictEqual(isAllowedOrigin('https://g20-git-anything.vercel.app', {}), false);
  assert.strictEqual(isAllowedOrigin('https://g20-git-x-otherteam.vercel.app', {}), false);
});

const { buildBrief, worldMedians } = require('../lib/briefs-build.cjs');
test('briefs state figures with years, skip stale values, and rank the largest economy plainly', () => {
  const values = {
    AAA: { GDP: [3e13, 2025], GDP_GROWTH: [2.0, 2025], INFLATION: [3.0, 2025], DEBT_GDP: [110, 2025], MANUFACTURING: [10, 2011] },
    BBB: { GDP: [1e12, 2025], GDP_GROWTH: [5.0, 2025] },
  };
  const b = buildBrief({ iso3: 'AAA', name: 'Alpha', values, shard: null, medians: worldMedians(values), generatedAt: '2026-10-17', latestActualYear: 2025 });
  assert.match(b.sections[0], /the world's largest of 2 measured/);
  assert.match(b.sections[0], /\+2\.0% in 2025/);
  assert.doesNotMatch(b.sections[0], /Manufacturing/);
  assert.match(b.sections[2], /110% of GDP \(2025\), a very high level/);
  assert.strictEqual(b.asOf, 2025);
});

test('middleware only runs on the retired /api/v1 routes and answers 410', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'src/proxy.ts'), 'utf8');
  assert.match(src, /matcher: \["\/api\/v1\/:path\*"\]/);
  assert.match(src, /status: 410/);
  assert.doesNotMatch(src, /getClaims/);
});
