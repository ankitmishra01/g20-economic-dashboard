const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const root = path.resolve(__dirname, '..');

const { isAllowedOrigin, applyCors } = require('../lib/cors.cjs');
const { createRateLimiter } = require('../lib/rate-limit.cjs');
const ctx = require('../lib/agent-context.cjs');

function mockRes() {
  const r = { headers: {}, code: 0, body: null };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.end = () => r;
  r.setHeader = (k, v) => { r.headers[k] = v; };
  return r;
}

test('retired PR #11 routes redirect to the original dashboard', async () => {
  const { default: config } = await import(path.join(root, 'next.config.ts'));
  const redirects = await config.redirects();
  const sources = redirects.map((r) => r.source);
  for (const route of ['/pulse', '/countries', '/countries/:iso3', '/indicators', '/calendar', '/compare', '/account', '/sign-in', '/legacy', '/legacy/index.html']) {
    assert.ok(sources.includes(route), `${route} should redirect`);
  }
  for (const r of redirects) {
    assert.equal(r.destination, '/');
    assert.equal(r.permanent, false);
  }
});

test('retired scheduled jobs are manual-only', () => {
  for (const file of ['release-refresh.yml', 'market-refresh.yml']) {
    const yml = fs.readFileSync(path.join(root, '.github/workflows', file), 'utf8');
    assert.doesNotMatch(yml, /^\s*schedule:/m, `${file} must not run on a schedule`);
    assert.match(yml, /workflow_dispatch/);
  }
  const structural = fs.readFileSync(path.join(root, '.github/workflows/structural-refresh.yml'), 'utf8');
  assert.match(structural, /Verify the refresh really wrote to the database/);
  assert.match(structural, /gh issue create/);
});

test('origin allow-list accepts production, localhost and project previews only', () => {
  assert.equal(isAllowedOrigin('https://g20-gamma.vercel.app', {}), true);
  assert.equal(isAllowedOrigin('http://localhost:3000', {}), true);
  assert.equal(isAllowedOrigin('http://127.0.0.1:8811', {}), true);
  assert.equal(isAllowedOrigin('https://g20-abc123-ankitmishra01s-projects.vercel.app', {}), true);
  assert.equal(isAllowedOrigin('https://evil.example', {}), false);
  assert.equal(isAllowedOrigin('https://g20-gamma.vercel.app.evil.example', {}), false);
  assert.equal(isAllowedOrigin(undefined, {}), false);
  assert.equal(isAllowedOrigin('https://partner.example', { ALLOWED_ORIGINS: 'https://partner.example' }), true);
});

test('applyCors echoes allowed origins and never sends a wildcard', () => {
  const ok = mockRes();
  applyCors({ headers: { origin: 'https://g20-gamma.vercel.app' } }, ok, {});
  assert.equal(ok.headers['Access-Control-Allow-Origin'], 'https://g20-gamma.vercel.app');
  const bad = mockRes();
  applyCors({ headers: { origin: 'https://evil.example' } }, bad, {});
  assert.equal(bad.headers['Access-Control-Allow-Origin'], undefined);
});

test('rate limiter blocks bursts and resets after the window', () => {
  let t = 0;
  const check = createRateLimiter({ limit: 3, windowMs: 1000, now: () => t });
  assert.equal(check('a').allowed, true);
  assert.equal(check('a').allowed, true);
  assert.equal(check('a').allowed, true);
  assert.equal(check('a').allowed, false);
  assert.equal(check('b').allowed, true, 'limits are per client');
  t = 1000;
  assert.equal(check('a').allowed, true);
});

test('agent context uses only snapshot data and never treats projections as latest', () => {
  const snapshot = {
    annual: [['USA', 'DEBT_GDP', 2024, 120], ['USA', 'DEBT_GDP', 2025, 124], ['USA', 'DEBT_GDP', 2031, 140], ['USA', 'GDP', 2025, 30e12]],
    quarterly: [['USA', 'INFLATION', '2026Q2', 3.1], ['USA', 'INFLATION', '2026Q3', 3.4], ['USA', 'INFLATION', '1990', 9]],
    meta: [{ key: 'DEBT_GDP', label: 'Government Debt', unit: '% of GDP' }],
  };
  const index = ctx.indexSnapshot(snapshot);
  assert.deepEqual(ctx.latestAnnual(index, 'USA', 'DEBT_GDP', 2025), { year: 2025, value: 124 });
  assert.deepEqual(ctx.latestQuarter(index, 'USA', 'INFLATION'), { period: '2026Q3', value: 3.4 });
  const country = ctx.buildCountryContext(index, null, 'USA', [{ iso3: 'USA', name: 'United States' }], { maxActualYear: 2025 });
  assert.match(country, /Government Debt: 124\.00 % of GDP \(2025\)/);
  assert.doesNotMatch(country, /2031|140/);
  const scope = ctx.buildScopeContext(index, [{ iso3: 'USA', name: 'United States' }], { maxActualYear: 2025 });
  assert.match(scope, /GDP \$30\.00T \(2025\)/);
});

test('Ask AI rejects foreign origins and ignores client-supplied numbers', async () => {
  const handler = require('../api/agent.js');
  const evil = mockRes();
  await handler({ method: 'POST', headers: { origin: 'https://evil.example' }, body: { question: 'hi' } }, evil);
  assert.equal(evil.code, 403);

  const saved = { g: process.env.GEMINI_API_KEY, a: process.env.ANTHROPIC_API_KEY };
  delete process.env.GEMINI_API_KEY; delete process.env.ANTHROPIC_API_KEY;
  const ok = mockRes();
  await handler({ method: 'POST', headers: { origin: 'https://g20-gamma.vercel.app', 'x-forwarded-for': '9.9.9.9' }, body: { question: 'hi', context: 'GDP $999T' } }, ok);
  assert.equal(ok.code, 503);
  assert.equal(ok.body.code, 'NO_AI_KEY');
  if (saved.g) process.env.GEMINI_API_KEY = saved.g;
  if (saved.a) process.env.ANTHROPIC_API_KEY = saved.a;

  const source = fs.readFileSync(path.join(root, 'api/agent.js'), 'utf8');
  assert.doesNotMatch(source, /const \{ question, context \}/, 'the handler must not read a client context');
});
