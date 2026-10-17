const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { buildWhatChanged } = require('../lib/what-changed.cjs');
const RiskCore = require('../public/legacy/components/risk-core.js');
const Units = require('../public/legacy/components/units.js');
const ctxLib = require('../lib/agent-context.cjs');

const NOW = new Date('2026-10-16T12:00:00Z');
const registry = {
  countries: [
    { iso3: 'USA', name: 'United States' }, { iso3: 'BRA', name: 'Brazil' },
    { iso3: 'MEX', name: 'Mexico' }, { iso3: 'NGA', name: 'Nigeria' }, { iso3: 'ISL', name: 'Iceland' },
  ],
  collections: { g20: { members: [{ iso3: 'USA', name: 'United States' }, { iso3: 'BRA', name: 'Brazil' }, { iso3: 'MEX', name: 'Mexico' }, { iso3: 'EUU', name: 'European Union', aggregate: true }] } },
};
const latest = (overrides = {}) => ({
  generatedAt: 'x', latestActualYear: 2025,
  values: {
    USA: { GDP: [3e13, 2025], GDP_GROWTH: [2.0, 2025], INFLATION: [3.0, 2025], DEBT_GDP: [120, 2025] },
    NGA: { GDP: [2.9e11, 2025], GDP_GROWTH: [4.0, 2024], INFLATION: [23.0, 2025] },
    ISL: { GDP: [3e10, 2025], INFLATION: [4.0, 2025] },
    ...overrides,
  },
});
const realtime = (rates = {}, fx = {}, markets = {}) => ({
  generatedAt: 'y',
  markets,
  fx: { base: 'USD', date: '2026-10-16', source: 'ECB', values: fx, currencyByIso3: { USA: 'USD', MEX: 'MXN', BRA: 'BRL', NGA: 'NGN' } },
  policyRates: { source: 'BIS', values: rates },
});

test('what changed: a policy move since the last refresh is new and ranked above older moves', () => {
  const cur = realtime({
    USA: { rate: 4.125, date: '2026-10-15', lastChange: { from: 3.875, to: 4.125, after: '2026-09', change: 0.25 } },
    ISL: { rate: 8, date: '2026-10-13', lastChange: { from: 7.75, to: 8, after: '2026-08', change: 0.25 } },
  });
  const prev = realtime({ USA: { rate: 3.875, date: '2026-10-10' }, ISL: { rate: 8, date: '2026-10-10' } });
  const out = buildWhatChanged({ current: { latest: latest(), realtime: cur }, previous: { realtime: prev }, registry, now: NOW });
  const us = out.items.find((i) => i.id.startsWith('policy:USA'));
  const is = out.items.find((i) => i.id.startsWith('policy:ISL'));
  assert.ok(us && us.newSinceLastRefresh, 'US move detected against the previous file');
  assert.strictEqual(us.change, 0.25);
  assert.match(us.title, /Federal Reserve raised its policy rate by 25bp to 4.125%/);
  assert.ok(is && !is.newSinceLastRefresh, 'a recent but already-published move is listed, not marked new');
  assert.ok(out.items.indexOf(us) < out.items.indexOf(is), 'G20 + new outranks small + older');
});

test('what changed: FX thresholds (2% in a day or 5% in 30 days), euro reported once', () => {
  const fx = { MXN: { perUsd: 19, change1dPct: 0.4, change30dPct: 7.3 }, BRL: { perUsd: 5, change1dPct: -2.4, change30dPct: 1 }, NGN: { perUsd: 1500, change1dPct: 1, change30dPct: 4 } };
  const out = buildWhatChanged({ current: { latest: latest(), realtime: realtime({}, fx) }, registry, now: NOW });
  const ids = out.items.map((i) => i.id);
  assert.ok(ids.some((i) => i.startsWith('fx:MXN:30d')));
  assert.ok(ids.some((i) => i.startsWith('fx:BRL') && i.endsWith('1d')));
  assert.ok(!ids.some((i) => i.startsWith('fx:NGN')), 'below both thresholds');
  const mxn = out.items.find((i) => i.currency === 'MXN');
  assert.strictEqual(mxn.iso3, 'MEX');
  assert.match(mxn.title, /MXN weakened 7.3%/);
  const brl = out.items.find((i) => i.currency === 'BRL');
  assert.match(brl.title, /strengthened 2.4%/);
});

test('what changed: new annual prints, revisions and risk-flag crossings need a previous file', () => {
  const prev = latest({ NGA: { GDP: [2.9e11, 2025], GDP_GROWTH: [3.1, 2023], INFLATION: [7.5, 2025] } });
  const cur = latest();
  const none = buildWhatChanged({ current: { latest: cur }, registry, now: NOW });
  assert.strictEqual(none.items.filter((i) => ['print', 'revision', 'flag'].includes(i.kind)).length, 0, 'no previous file, no data claims');
  const out = buildWhatChanged({ current: { latest: cur }, previous: { latest: prev }, registry, now: NOW });
  const print = out.items.find((i) => i.kind === 'print' && i.iso3 === 'NGA' && i.indicator === 'GDP_GROWTH');
  assert.ok(print, 'growth year advanced 2023 -> 2024');
  assert.strictEqual(print.year, 2024);
  const rev = out.items.find((i) => i.kind === 'revision' && i.iso3 === 'NGA' && i.indicator === 'INFLATION');
  assert.ok(rev, 'inflation 2025 revised 7.5 -> 23');
  const flag = out.items.find((i) => i.kind === 'flag' && i.iso3 === 'NGA' && i.flag === 'highInflation');
  assert.ok(flag && flag.direction === 'flagged');
});

test('what changed: earlier items carry for 14 days, are not marked new, and expire', () => {
  const carry = [
    { id: 'policy:XYZ:1', kind: 'policy', iso3: 'ISL', title: 'old', asOf: '2026-10-10', materiality: 2, newSinceLastRefresh: true },
    { id: 'policy:OLD:1', kind: 'policy', iso3: 'ISL', title: 'expired', asOf: '2026-09-20', materiality: 9 },
  ];
  const out = buildWhatChanged({ current: { latest: latest(), realtime: realtime() }, carry, registry, now: NOW });
  const kept = out.items.find((i) => i.id === 'policy:XYZ:1');
  assert.ok(kept && kept.newSinceLastRefresh === false && kept.materiality < 2);
  assert.ok(!out.items.some((i) => i.id === 'policy:OLD:1'));
});

test('what changed: every item has a title, as-of date and source', () => {
  const file = path.resolve(__dirname, '..', 'public/legacy/data/what-changed.json');
  const wc = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.ok(Array.isArray(wc.items));
  for (const i of wc.items) {
    assert.ok(i.title && i.asOf && i.source, `incomplete item ${i.id}`);
    assert.match(i.asOf, /^\d{4}-\d{2}-\d{2}$/);
  }
});

test('risk score: annual basis only, never a quarterly print', () => {
  const calls = [];
  const getAnnual = (iso3, key) => { calls.push(key); return { GDP_GROWTH: { value: -0.5, year: 2025 }, FISCAL_BAL: { value: -7, year: 2025 } }[key] || null; };
  const r = RiskCore.fragilityScore({ iso3: 'NGA', getAnnual, getSeries: () => [], now: NOW });
  assert.strictEqual(r.score, 45);
  assert.deepStrictEqual(r.signals, ['Contraction', 'Large fiscal deficit']);
  assert.ok(calls.includes('GDP_GROWTH') && calls.includes('INFLATION'));
});

test('risk score: daily FX slide and policy hike shocks add signals where covered', () => {
  const rt = realtime(
    { MEX: { rate: 7.5, date: '2026-10-13', lastChange: { from: 6.5, to: 7.5, after: '2026-09', change: 1 } } },
    { MXN: { perUsd: 19, change1dPct: 0.2, change30dPct: 7.3 } });
  const r = RiskCore.fragilityScore({ iso3: 'MEX', getAnnual: () => null, getSeries: () => [], realtime: rt, now: NOW });
  assert.strictEqual(r.score, 14);
  assert.ok(r.signals.some((s) => /Currency down 7.3%/.test(s)));
  assert.ok(r.signals.some((s) => /hiked 100bp/.test(s)));
  assert.deepStrictEqual(RiskCore.realtimeSignal(rt, 'USA', 'FX_30D'), { value: 0, date: '2026-10-16' }, 'USD vs itself');
  assert.strictEqual(RiskCore.realtimeSignal(rt, 'NGA', 'POLICY_SHOCK'), null, 'not covered by BIS');
  const old = realtime({ MEX: { rate: 7.5, date: '2026-10-13', lastChange: { from: 6.5, to: 7.5, after: '2026-01', change: 1 } } });
  assert.strictEqual(RiskCore.realtimeSignal(old, 'MEX', 'POLICY_SHOCK', NOW).value, 0, 'a move months ago is not a shock');
});

test('GDP axis units: one unit per chart from the largest value', () => {
  const nga = Units.gdpAxisFormatter([2.5e11, 6.7e11]);
  assert.strictEqual(nga(6.7e11), '$670B');
  assert.strictEqual(nga(2.5e11), '$250B');
  const usa = Units.gdpAxisFormatter([1.8e13, 3.0e13]);
  assert.strictEqual(usa(3.0e13), '$30.0T');
  const small = Units.gdpAxisFormatter([4.4e9, 4.9e9]);
  assert.strictEqual(small(4.4e9), '$4.40B');
  assert.strictEqual(Units.gdpAxisFormatter([1.2e8])(1.2e8), '$120M');
  assert.strictEqual(nga(null), '—');
});

test('agent context: global scope from latest.json, actual values only, capped size', () => {
  const members = registry.countries;
  const ctx = ctxLib.buildLatestScopeContext(latest(), members, { label: 'Global', maxEconomies: 2 });
  assert.match(ctx, /Global latest annual snapshot \(3 economies with data/);
  assert.match(ctx, /Largest 2 economies by GDP:/);
  assert.match(ctx, /United States: \| GDP \$30.00T \(2025\)/);
  assert.match(ctx, /Nigeria: \| GDP \$0.29T/);
  assert.ok(!/Iceland:/.test(ctx), 'cut at maxEconomies');
});

test('agent context: country from latest.json plus shard history and realtime', () => {
  const shard = { series: { GDP_GROWTH: { 2020: -1.8, 2021: 3.6, 2025: 4.0, 2027: 4.4 } } };
  const ctx = ctxLib.buildLatestCountryContext(latest(), shard, { iso3: 'NGA', name: 'Nigeria' });
  assert.match(ctx, /Nigeria economic snapshot/);
  assert.match(ctx, /GDP_GROWTH history: 2020 -1.8, 2021 3.6, 2025 4.0/);
  assert.ok(!/2027/.test(ctx), 'projection years beyond the latest actual year are excluded');
  const rt = realtime({ BRA: { rate: 13.75, date: '2026-10-13', lastChange: { from: 14, to: 13.75, after: '2026-08', change: -0.25 } } },
    { BRL: { perUsd: 5.1, change1dPct: 0.1, change30dPct: -1.2 } },
    { VIX: { label: 'VIX', unit: 'index', value: 16.46, date: '2026-10-15', change: -0.41, source: 'Cboe via FRED' } });
  const r = ctxLib.buildRealtimeContext(rt, 'BRA');
  assert.match(r, /VIX: 16.46 index as of 2026-10-15/);
  assert.match(r, /Policy rate: 13.75% as of 2026-10-13; last move -25bp/);
  assert.match(r, /BRL per USD: 5.1 as of 2026-10-16/);
});

test('agent brief context: only computed items, filtered to scope', () => {
  const wc = { asOf: '2026-10-16', items: [
    { id: 'a', kind: 'policy', iso3: 'USA', title: 'Fed raised 25bp', asOf: '2026-10-15', source: 'BIS' },
    { id: 'b', kind: 'fx', iso3: 'NGA', title: 'NGN weakened', asOf: '2026-10-16', source: 'ECB' },
    { id: 'c', kind: 'market', iso3: null, title: 'VIX rose', asOf: '2026-10-15', source: 'FRED' },
  ] };
  const ctx = ctxLib.buildBriefContext(wc, (iso) => iso === 'USA');
  assert.match(ctx, /1\. Fed raised 25bp \[policy; as of 2026-10-15; source BIS\]/);
  assert.match(ctx, /VIX rose/, 'market items are global');
  assert.ok(!/NGN/.test(ctx));
  assert.strictEqual(ctxLib.buildBriefContext({ items: [] }), '');
});

test('workflows: committing jobs share one concurrency group and push with retry', () => {
  for (const f of ['snapshot-refresh.yml', 'realtime-refresh.yml', 'model-refresh.yml']) {
    const y = fs.readFileSync(path.resolve(__dirname, '..', '.github/workflows', f), 'utf8');
    assert.match(y, /group: data-commit/, `${f} concurrency`);
    assert.match(y, /push-with-retry\.sh/, `${f} retry push`);
    assert.ok(!/&& git push\)/.test(y), `${f} has no bare push`);
  }
  const rt = fs.readFileSync(path.resolve(__dirname, '..', '.github/workflows/realtime-refresh.yml'), 'utf8');
  assert.ok(rt.indexOf('--stash realtime') < rt.indexOf('node sync/realtime.js'), 'stash before regenerating');
  assert.ok(rt.indexOf('node sync/realtime.js') < rt.lastIndexOf('node sync/what-changed.js'), 'diff after regenerating');
});

test('agent handler: brief mode sends only the computed changes to the model and caches the answer', async () => {
  const sent = [];
  const realFetch = global.fetch;
  process.env.GEMINI_API_KEY = 'test-key';
  global.fetch = async (url, opts) => {
    sent.push(JSON.parse(opts.body));
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: 'Narrated.' }] } }] }) };
  };
  try {
    delete require.cache[require.resolve('../api/agent.js')];
    const handler = require('../api/agent.js');
    const call = (body) => new Promise((resolve) => {
      const res = { headers: {}, statusCode: 200, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.statusCode = c; return this; },
        json(o) { resolve({ status: this.statusCode, body: o }); }, end() { resolve({ status: this.statusCode }); } };
      handler({ method: 'POST', headers: { origin: 'http://localhost:3000', 'x-forwarded-for': `10.0.0.${Math.floor(Math.random() * 200)}` }, body }, res);
    });
    const first = await call({ mode: 'brief', scope: 'global' });
    assert.strictEqual(first.status, 200);
    assert.strictEqual(first.body.text, 'Narrated.');
    const prompt = sent[0].contents[0].parts[0].text;
    assert.match(prompt, /^What changed \(computed from the published data/);
    assert.match(prompt, /Use only the facts and figures in the list above/);
    assert.ok(!/Live data snapshot|Latest Economic Snapshot|latest annual snapshot/.test(prompt), 'no other data in the brief prompt');
    const second = await call({ mode: 'brief', scope: 'global' });
    assert.strictEqual(second.body.cached, true);
    assert.strictEqual(sent.length, 1, 'cached per data version and scope');
    const q = await call({ question: 'How is inflation?', country: 'NGA', scope: 'global' });
    assert.strictEqual(q.status, 200);
    const qPrompt = sent[1].contents[0].parts[0].text;
    assert.match(qPrompt, /Nigeria economic snapshot/);
    assert.match(qPrompt, /GDP_GROWTH history:/, 'country shard read from disk');
    assert.match(qPrompt, /Daily market reference data/);
  } finally {
    global.fetch = realFetch;
    delete process.env.GEMINI_API_KEY;
  }
});
