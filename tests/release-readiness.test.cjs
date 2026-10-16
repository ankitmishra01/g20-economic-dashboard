const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Vercel config uses Next.js, cache policy, and a protected brief schedule', () => {
  const config = read('vercel.ts');
  assert.match(config, /framework:\s*["']nextjs/);
  assert.match(config, /api\/cron\/briefs/);
  assert.match(config, /cacheControl/);
  assert.equal(fs.existsSync(path.join(root, 'vercel.json')), false);
});

test('Vercel source uploads exclude local build output', () => {
  const ignore = fs.readFileSync(path.join(root, '.vercelignore'), 'utf8');
  assert.match(ignore, /^\.next\/?$/m);
});

test('README documents setup, Supabase, data truth, legacy route, and rollback', () => {
  const readme = read('README.md');
  for (const term of ['Supabase', 'actual', 'forecast', '/legacy/index.html', 'npm run build', 'Rollback']) assert.match(readme, new RegExp(term, 'i'));
});

test('global registry expands beyond the G20 while labeling tiered coverage', () => {
  const repository = read('src/lib/repository.ts');
  assert.match(repository, /api\.worldbank\.org\/v2\/country/);
  assert.match(repository, /coverageTier/);
  assert.match(repository, /rows\.length > 150/);
});
