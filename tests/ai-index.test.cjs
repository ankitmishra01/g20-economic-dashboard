const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { buildAiIndex, buildAiDetails } = require('../lib/ai-index-build.cjs');
const { buildAiIndexContext } = require('../lib/agent-context.cjs');

const sample = {
  last_updated: '2026-10-17T15:55:22.456Z', using_live_data: true,
  coverage: { live_indicator_share: 74.5, countries_live: 185, countries_total: 186 },
  countries: [
    { iso3: 'VNM', slug: 'vietnam', name: 'Vietnam', region: 'Asia-Pacific', total_score: 48, projected_score_2028: 54, trajectory_score: 4, trajectory_label: 'Positive',
      scores: { infrastructure: { score: 10, reasons: ['5G rollout'] }, talent: { score: 9 } }, data_source: 'live', coverage: { label: 'High', fallbackShare: 0.1 } },
    { iso3: 'ARE', slug: 'uae', name: 'UAE', total_score: 70, projected_score_2028: 76, scores: {}, data_source: 'live' },
    { name: 'No Code', total_score: 10 },
    { iso3: 'TWN', slug: 'taiwan', name: 'Taiwan', total_score: 80, scores: {} },
  ],
};

test('ai index is keyed by ISO3, skips records without ISO3, and counts registry matches', () => {
  const out = buildAiIndex(sample, { source: 'api', sourceUrl: 'x', registryIso3: new Set(['VNM', 'ARE']) });
  assert.deepStrictEqual(Object.keys(out.countries).sort(), ['ARE', 'TWN', 'VNM']);
  assert.strictEqual(out.counts.skippedWithoutIso3, 1);
  assert.strictEqual(out.counts.inRegistry, 2);
  assert.deepStrictEqual(out.counts.notInRegistry, ['TWN']);
  assert.strictEqual(out.countries.VNM.scores.infrastructure.score, 10);
  assert.strictEqual(out.countries.VNM.scores.infrastructure.reasons, undefined, 'reasons stay out of the shared index');
  assert.strictEqual(out.asOf, '2026-10-17T15:55:22.456Z');
  assert.strictEqual(out.coverage.live_indicator_share, 74.5);
});

test('per-economy details carry only published reasons', () => {
  const d = buildAiDetails(sample);
  assert.deepStrictEqual(d.VNM, { reasons: { infrastructure: ['5G rollout'] } });
  assert.strictEqual(d.ARE, undefined);
});

test('Ask AI context states the score, basis and date for one economy', () => {
  const idx = buildAiIndex(sample, { source: 'api', sourceUrl: 'x' });
  const ctx = buildAiIndexContext(idx, 'VNM');
  assert.match(ctx, /AI Trajectory Index, live score as of 2026-10-17/);
  assert.match(ctx, /Total 48\/100; projected 54\/100 by 2028; trajectory Positive \(4\)/);
  assert.strictEqual(buildAiIndexContext(idx, 'ZZZ'), '');
});

test('committed ai-index.json matches registry economies by ISO3 (no name matching)', () => {
  const file = path.join(__dirname, '..', 'public', 'legacy', 'data', 'ai-index.json');
  const idx = JSON.parse(fs.readFileSync(file, 'utf8'));
  const reg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public', 'legacy', 'countries.json'), 'utf8'));
  const iso = new Set(reg.countries.map((c) => c.iso3));
  for (const k of ['NGA', 'VNM', 'ARE', 'TUR', 'EGY', 'IRN', 'CZE', 'KOR']) assert.ok(idx.countries[k], `${k} present`);
  const matched = Object.keys(idx.countries).filter((k) => iso.has(k)).length;
  assert.ok(matched >= 180, `matched ${matched}`);
});
