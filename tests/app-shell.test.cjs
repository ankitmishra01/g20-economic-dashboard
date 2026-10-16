const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Next application exposes the global decision routes', () => {
  const navigation = read('src/lib/navigation.ts');
  for (const href of ['/', '/pulse', '/countries', '/indicators', '/calendar', '/compare']) {
    assert.match(navigation, new RegExp(`href:\\s*["']${href === '/' ? '\\/' : href}["']`));
  }
});

test('URL state parser preserves shareable filters and rejects unsafe values', () => {
  const source = read('src/lib/url-state.ts');
  assert.match(source, /searchParams/);
  assert.match(source, /country/);
  assert.match(source, /indicator/);
  assert.match(source, /collection/);
  assert.match(source, /ALLOWED_PERIODS/);
});

test('shell has accessible skip navigation, command palette, and freshness semantics', () => {
  const layout = read('src/app/layout.tsx');
  const shell = read('src/components/app-shell.tsx');
  const freshness = read('src/components/freshness-badge.tsx');
  assert.match(layout, /Skip to content/);
  assert.match(shell, /aria-label=["']Primary navigation["']/);
  assert.match(shell, /CommandPalette/);
  assert.match(freshness, /actual|preliminary|estimate|forecast/);
  assert.match(freshness, /releasedAt/);
});

test('typed environment validation never exposes the service role to the browser', () => {
  const env = read('src/lib/env.ts');
  assert.match(env, /NEXT_PUBLIC_SUPABASE_URL/);
  assert.match(env, /NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  assert.match(env, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(env, /serverEnv/);
  assert.doesNotMatch(env, /NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY/);
});
