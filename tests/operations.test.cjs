const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('cron authorization rejects missing and incorrect bearer secrets', () => {
  const { authorizeCron } = require('../lib/cron-auth.cjs');
  assert.equal(authorizeCron(undefined, 'secret'), false);
  assert.equal(authorizeCron('Bearer wrong', 'secret'), false);
  assert.equal(authorizeCron('Bearer secret', 'secret'), true);
});

test('health contract reports freshness, row volume and job dimensions', () => {
  const source = read('src/app/api/v1/health/route.ts');
  for (const dimension of ['ageHours', 'rows', 'coverage', 'jobs']) assert.match(source, new RegExp(dimension));
});

test('operator runbook and source-specific schedules exist', () => {
  const runbook = read('docs/operations.md');
  for (const concept of ['market', 'release', 'structural', 'snapshot', 'brief', 'rollback']) assert.match(runbook, new RegExp(concept, 'i'));
  assert.ok(fs.existsSync(path.join(root, '.github/workflows/market-refresh.yml')));
  assert.ok(fs.existsSync(path.join(root, 'src/app/api/cron/briefs/route.ts')));
});
