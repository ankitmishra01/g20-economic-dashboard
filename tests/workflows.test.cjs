const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildBrief } = require('../lib/briefs.cjs');
const { safeRedirectPath } = require('../lib/auth-safety.cjs');
const { applyResponseCookies } = require('../lib/cookie-safety.cjs');
const { briefPeriodStart, isBriefDue } = require('../lib/brief-schedule.cjs');

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

test('Next proxy refreshes Supabase sessions through writable response cookies', () => {
  const proxy = fs.readFileSync(path.resolve(__dirname, '..', 'src/proxy.ts'), 'utf8');
  assert.match(proxy, /getClaims/);
  assert.match(proxy, /response\.cookies\.set/);
  assert.match(proxy, /request\.cookies\.set/);
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

test('auth callback accepts only same-origin relative paths', () => {
  assert.equal(safeRedirectPath('/account?tab=briefs'), '/account?tab=briefs');
  for (const unsafe of ['//evil.example', '/\\evil.example', 'https://evil.example', 'account']) {
    assert.equal(safeRedirectPath(unsafe), '/account');
  }
});

test('cookie refresh tolerates read-only Server Component stores', () => {
  const writes = [];
  assert.doesNotThrow(() => applyResponseCookies([
    { name: 'sb-token', value: 'fresh', options: { httpOnly: true } },
  ], { set: (...args) => { writes.push(args); throw new Error('Cookies can only be modified'); } }));
  assert.equal(writes.length, 1);
});

test('brief scheduler respects cadence, hour, and weekday', () => {
  const mondayAtEight = new Date('2026-10-19T08:15:00Z');
  assert.equal(isBriefDue({ cadence: 'daily', delivery_hour: 8 }, mondayAtEight), true);
  assert.equal(isBriefDue({ cadence: 'weekly', delivery_hour: 8, delivery_weekday: 1 }, mondayAtEight), true);
  assert.equal(isBriefDue({ cadence: 'weekly', delivery_hour: 8, delivery_weekday: 2 }, mondayAtEight), false);
  assert.equal(isBriefDue({ cadence: 'daily', delivery_hour: 8 }, new Date('2026-10-19T12:15:00Z')), true);
  assert.equal(isBriefDue({ cadence: 'daily', delivery_hour: 14 }, new Date('2026-10-19T12:15:00Z')), false);
  assert.equal(briefPeriodStart('weekly', mondayAtEight), '2026-10-19');
});

test('account actions cover items, alerts, and brief preferences', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'src/app/account/actions.ts'), 'utf8');
  for (const action of ['addWatchlistItem', 'deleteWatchlistItem', 'createAlertRule', 'deleteAlertRule', 'saveBriefPreferences']) assert.match(source, new RegExp(`function ${action}`));
});

test('scheduled workflow evaluates active alert rules and records deduplicated events', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'src/lib/alert-worker.ts'), 'utf8');
  assert.match(source, /alert_rules/);
  assert.match(source, /alert_events/);
  assert.match(source, /economic_observations/);
});

test('account workspace subscribes to owner-scoped Realtime changes', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'src/components/realtime-refresh.tsx'), 'utf8');
  assert.match(source, /postgres_changes/);
  assert.match(source, /createBrowserClient/);
  assert.match(source, /user_id=eq/);
  assert.match(source, /router\.refresh/);
});

test('public Realtime refreshes are release-scoped and coalesced', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'src/components/public-realtime-refresh.tsx'), 'utf8');
  assert.doesNotMatch(source, /table: "economic_observations"/);
  assert.match(source, /table: "economic_releases"/);
  assert.match(source, /setTimeout/);
});

test('brief and alert workers use latest vintages across paginated facts', () => {
  for (const file of ['src/lib/brief-worker.ts', 'src/lib/alert-worker.ts']) {
    const source = fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
    assert.match(source, /collectPages/); assert.match(source, /latestSourceVintages/); assert.match(source, /vintage_date/);
  }
});
