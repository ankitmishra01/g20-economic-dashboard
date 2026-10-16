const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildBrief } = require('../lib/briefs.cjs');

test('brief generation is deterministic and carries evidence links', () => {
  const input = [{ country: 'CAN', indicator: 'GDP_GROWTH', period: '2026Q2', value: 1.4, source: 'OECD', sourceUrl: 'https://data-explorer.oecd.org/' }];
  const one = buildBrief(input, { cadence: 'weekly', periodStart: '2026-10-12' });
  const two = buildBrief(input, { cadence: 'weekly', periodStart: '2026-10-12' });
  assert.deepEqual(one, two);
  assert.match(one.subject, /Weekly/);
  assert.equal(one.evidence[0].url, input[0].sourceUrl);
});

test('auth and account routes are wired to Supabase magic links', () => {
  const root = path.resolve(__dirname, '..');
  const signIn = fs.readFileSync(path.join(root, 'src/app/sign-in/actions.ts'), 'utf8');
  const callback = fs.readFileSync(path.join(root, 'src/app/auth/callback/route.ts'), 'utf8');
  assert.match(signIn, /signInWithOtp/);
  assert.match(callback, /exchangeCodeForSession/);
});

test('watchlist mutations are owner-derived and never accept user_id from form input', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'src/app/account/actions.ts'), 'utf8');
  assert.match(source, /getUser/);
  assert.match(source, /user\.id/);
  assert.doesNotMatch(source, /formData\.get\(["']user_id/);
});

test('email delivery remains disabled unless the real integration is configured', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'src/lib/delivery.ts'), 'utf8');
  assert.match(source, /RESEND_API_KEY/);
  assert.match(source, /BRIEF_EMAIL_ENABLED/);
  assert.match(source, /not_configured/);
});
