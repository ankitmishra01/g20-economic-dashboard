const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// The structural refresh must not fail when the dormant normalized model rejects
// global rows (its countries table only holds the G20).
test('normalized fact sync failure is caught and reported as a warning', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'sync', 'seed.js'), 'utf8');
  const call = src.indexOf('await syncNormalizedFacts()');
  assert.ok(call > 0, 'seed.js still calls syncNormalizedFacts');
  const before = src.lastIndexOf('try {', call);
  const after = src.indexOf('catch (e)', call);
  assert.ok(before > 0 && call - before < 120, 'the call sits inside a try block');
  assert.ok(after > call && after - call < 300, 'a catch follows the call');
  assert.match(src.slice(after, after + 400), /::warning::Normalized fact sync skipped/);
});
