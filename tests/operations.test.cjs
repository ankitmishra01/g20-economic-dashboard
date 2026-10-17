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

test('refresh scheduling separates release, structural, model, snapshot, and market jobs', () => {
  const workflows = fs.readdirSync(path.join(root, '.github/workflows')).join('\n');
  for (const job of ['release', 'structural', 'model', 'snapshot', 'market']) assert.match(workflows, new RegExp(job, 'i'));
});

test('scheduled model refresh persists generated artifacts', () => {
  const workflow = read('.github/workflows/model-refresh.yml');
  assert.match(workflow, /contents: write/);
  for (const artifact of ['term-spread.js', 'forecast-model.js', 'forecast-history.json', 'projections.json', 'projection-history.json']) assert.match(workflow, new RegExp(artifact.replace('.', '\\.')));
  // Pushes go through the shared retry script (rebases onto concurrent refresh commits).
  assert.match(workflow, /push-with-retry\.sh/);
  assert.match(read('.github/scripts/push-with-retry.sh'), /git pull --rebase[\s\S]*git push/);
});
