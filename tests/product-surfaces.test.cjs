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
  assert.match(source, /actual/i);
});

test('comparison is URL-shareable and reports sparse coverage', () => {
  const source = read('src/app/compare/page.tsx');
  assert.match(source, /searchParams/);
  assert.match(source, /missing|sparse/i);
  assert.match(source, /indicator/);
  assert.match(source, /row\.frequency === frequency/, 'comparison must not rank annual and quarterly observations together');
  assert.match(source, /name="frequency"/);
});

test('homepage coverage and releases come from the observation repository', () => {
  const source = read('src/app/page.tsx');
  assert.match(source, /observations\.filter/);
  assert.match(source, /new Set\(observations/);
  assert.doesNotMatch(source, /87%|Oct 24|Policy rate/);
});
