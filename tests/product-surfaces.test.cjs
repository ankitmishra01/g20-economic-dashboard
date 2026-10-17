const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('decision routes render evidence rather than placeholder surfaces', () => {
  for (const route of ['pulse', 'countries', 'indicators', 'calendar', 'compare']) {
    const source = read(`src/app/${route}/page.tsx`);
    assert.doesNotMatch(source, /RoutePlaceholder/);
    assert.match(source, /PageHeader/);
  }
});

test('country detail exposes provenance, coverage and observed status', () => {
  const source = read('src/app/countries/[iso3]/page.tsx');
  assert.match(source, /notFound/);
  assert.match(source, /source/i);
  assert.match(source, /coverage/i);
  assert.match(source, /row\.status/);
});

test('comparison is URL-shareable and reports sparse coverage', () => {
  const source = read('src/app/compare/page.tsx');
  assert.match(source, /searchParams/);
  assert.match(source, /missing|sparse/i);
  assert.match(source, /indicator/);
  assert.match(source, /row\.frequency === frequency/, 'comparison must not rank annual and quarterly observations together');
  assert.match(source, /name="frequency"/);
  assert.match(source, /observedObservations/, 'default comparison must exclude estimates and forecasts');
});

test('the dashboard is served at the site root, not behind a /legacy URL', async () => {
  const path = require('node:path');
  const { default: config } = await import(path.join(__dirname, '..', 'next.config.ts'));
  const { beforeFiles, fallback } = await config.rewrites();
  assert.deepEqual(beforeFiles, [{ source: '/', destination: '/legacy/index.html' }]);
  assert.deepEqual(fallback, [{ source: '/:path*', destination: '/legacy/:path*' }]);
});

test('pulse surfaces calculate latest periods from observed values only', () => {
  assert.match(read('src/app/pulse/page.tsx'), /observedObservations/);
  assert.match(read('src/app/api/v1/pulse/route.ts'), /observedObservations/);
});

test('public decision surfaces use the live Supabase repository', () => {
  for (const route of ['pulse/page.tsx', 'countries/page.tsx', 'compare/page.tsx', 'calendar/page.tsx', 'indicators/page.tsx']) {
    assert.match(read(`src/app/${route}`), /@\/lib\/live-repository/);
  }
  const layout = read('src/app/layout.tsx');
  assert.match(layout, /PublicRealtimeRefresh/);
});

test('live country tiers derive from validated collection membership', () => {
  const source = read('src/lib/live-repository.ts');
  assert.match(source, /collection_members\(collection_slug\)/);
  assert.match(source, /isG20 \? 1 : 3/);
});
