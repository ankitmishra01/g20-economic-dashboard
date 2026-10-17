'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const S = require('../lib/share-meta.cjs');

const root = path.join(__dirname, '..');
const registry = require('../public/legacy/countries.json');
const latest = {
  latestActualYear: 2025,
  values: {
    NGA: { GDP: [290e9, 2025], GDP_GROWTH: [4.0, 2025], INFLATION: [23.0, 2025], DEBT_GDP: [36.2, 2025], UNEMPLOYMENT: [3.1, 2025] },
    USA: { GDP: [30.9e12, 2025], GDP_GROWTH: [2.3, 2025], INFLATION: [2.7, 2025], DEBT_GDP: [124, 2025] },
    KEN: { GDP: [120e9, 2025], GDP_GROWTH: [5.0, 2025], INFLATION: [4.0, 2025] },
  },
};
const realtime = {
  policyRates: { values: { USA: { rate: 3.875, date: '2026-10-13', lastChange: { from: 3.625, to: 3.875, after: '2026-09', change: 0.25 } } } },
  fx: { date: '2026-10-16', currencyByIso3: { NGA: 'NGN', USA: 'USD' }, values: { NGN: { perUsd: 1530.2, change30dPct: 3.1 } } },
};
const aiIndex = { countries: { NGA: { total_score: 32, projected_score_2028: 35, trajectory_label: 'Positive', data_source: 'live', slug: 'nigeria' } } };

test('formatters: dollars, rates and short dates', () => {
  assert.strictEqual(S.fmtUsd(290e9), '$290B');
  assert.strictEqual(S.fmtUsd(30.9e12), '$30.9T');
  assert.strictEqual(S.fmtUsd(2.24e12), '$2.24T');
  assert.strictEqual(S.fmtPct(4, { signed: true }), '+4.0%');
  assert.strictEqual(S.fmtRate(3.875), '3.875%');
  assert.strictEqual(S.fmtRate(4.5), '4.5%');
  assert.strictEqual(S.shortDate('2026-10-13'), '13 Oct');
  assert.strictEqual(S.shortDate(null), null);
});

test('countryFacts assembles annual values, policy rate, FX and AI readiness', () => {
  const nga = S.countryFacts({ iso3: 'nga', latest, realtime, aiIndex, registry });
  assert.strictEqual(nga.iso3, 'NGA');
  assert.strictEqual(nga.name, 'Nigeria');
  assert.deepStrictEqual(nga.growth, { value: 4.0, year: 2025 });
  assert.strictEqual(nga.policyRate, null, 'no BIS rate for Nigeria');
  assert.strictEqual(nga.fx.currency, 'NGN');
  assert.strictEqual(nga.ai.score, 32);
  const usa = S.countryFacts({ iso3: 'USA', latest, realtime, aiIndex, registry });
  assert.strictEqual(usa.fx, null, 'no FX line for the dollar itself');
  assert.strictEqual(usa.policyRate.rate, 3.875);
  assert.strictEqual(S.countryFacts({ iso3: 'XXX', latest, registry }), null);
});

test('keyNumbers and countryMeta describe the economy with real figures', () => {
  const f = S.countryFacts({ iso3: 'USA', latest, realtime, aiIndex, registry });
  assert.strictEqual(S.keyNumbers(f), 'GDP $30.9T (2025), growth +2.3%, inflation 2.7%, debt 124% of GDP, policy rate 3.875%');
  const m = S.countryMeta(f, 'https://g20-gamma.vercel.app/');
  assert.strictEqual(m.url, 'https://g20-gamma.vercel.app/c/USA');
  assert.strictEqual(m.image, 'https://g20-gamma.vercel.app/og/c/USA');
  assert.strictEqual(m.target, 'https://g20-gamma.vercel.app/#country/USA');
  assert.match(m.title, /^United States: economy at a glance/);
});

test('scopes resolve like the dashboard and compute medians over members with data', () => {
  assert.strictEqual(S.resolveScope('global', registry).members.length, registry.countries.length);
  assert.ok(!S.resolveScope('g20', registry).members.includes('EUU'), 'the EU comparator is not a member economy');
  assert.strictEqual(S.resolveScope('region:SSF', registry).label, 'Sub-Saharan Africa');
  assert.strictEqual(S.resolveScope('region:NOPE', registry), null);
  const sf = S.scopeFacts({ scopeId: 'region:SSF', latest, registry });
  assert.strictEqual(sf.withData, 2);
  assert.strictEqual(sf.medianGrowth, 4.5);
  assert.strictEqual(sf.aggregateGdp, 410e9);
  const m = S.scopeMeta(sf, 'https://x');
  assert.strictEqual(m.url, 'https://x/s/region%3ASSF');
  assert.strictEqual(m.target, 'https://x/?scope=region%3ASSF');
  assert.strictEqual(S.scopeMeta(S.scopeFacts({ scopeId: 'global', latest, registry }), 'https://x').target, 'https://x/');
});

test('share HTML carries Open Graph + Twitter tags, escapes text and forwards people', () => {
  const html = S.renderShareHtml({ title: 'A & B <x>', description: 'd "q"', url: 'https://x/c/USA', image: 'https://x/og/c/USA', imageAlt: 'alt', target: 'https://x/#country/USA' });
  assert.match(html, /<title>A &amp; B &lt;x&gt;<\/title>/);
  assert.match(html, /property="og:image" content="https:\/\/x\/og\/c\/USA"/);
  assert.match(html, /name="twitter:card" content="summary_large_image"/);
  assert.match(html, /content="d &quot;q&quot;"/);
  assert.match(html, /http-equiv="refresh" content="0; url=https:\/\/x\/#country\/USA"/);
  assert.match(html, /location\.replace\("https:\/\/x\/#country\/USA"\)/);
});

test('preview cards hold at most eight stats with tones and dated sources', () => {
  const card = S.countryCard(S.countryFacts({ iso3: 'USA', latest, realtime, aiIndex, registry }));
  assert.ok(card.stats.length <= 8);
  assert.strictEqual(card.flagIso2, 'US');
  const pr = card.stats.find((x) => x.label === 'Policy rate');
  assert.deepStrictEqual([pr.value, pr.sub], ['3.875%', '+25bp · 13 Oct']);
  assert.strictEqual(card.stats.find((x) => x.label === 'Real growth').tone, 'pos');
  const ng = S.countryCard(S.countryFacts({ iso3: 'NGA', latest, realtime, aiIndex, registry }));
  assert.strictEqual(ng.stats.find((x) => x.label === 'Inflation').tone, 'neg');
  assert.strictEqual(ng.stats.find((x) => x.label === 'NGN per USD').tone, 'neg', 'a 3% slide is flagged');
  const sc = S.scopeCard(S.scopeFacts({ scopeId: 'global', latest, registry }));
  assert.strictEqual(sc.title, 'The world economy');
  assert.strictEqual(S.defaultCard().stats.length, 0);
  assert.ok(S.defaultCard(S.scopeFacts({ scopeId: 'global', latest, registry })).stats.length >= 4);
});

test('share routes, OG routes, robots, sitemap and favicon exist; the dashboard links them', async () => {
  for (const f of ['src/app/c/[iso3]/route.ts', 'src/app/s/[scope]/route.ts', 'src/app/og/c/[iso3]/route.tsx', 'src/app/og/s/[scope]/route.tsx', 'src/app/og/default/route.tsx', 'src/app/robots.ts', 'src/app/sitemap.ts', 'public/legacy/favicon.svg']) {
    assert.ok(fs.existsSync(path.join(root, f)), `${f} should exist`);
  }
  const { default: config } = await import(path.join(root, 'next.config.ts'));
  const fav = (await config.redirects()).find((r) => r.source === '/favicon.ico');
  assert.strictEqual(fav.destination, '/favicon.svg');
  const html = fs.readFileSync(path.join(root, 'public/legacy/index.html'), 'utf8');
  assert.match(html, /property="og:image" content="https:\/\/g20-gamma\.vercel\.app\/og\/default"/);
  assert.match(html, /<title>G20 Monitor · Global economic intelligence for 217 economies<\/title>/);
  assert.match(html, /id="share-btn"/);
  assert.match(html, /components\/share\.js/);
});
