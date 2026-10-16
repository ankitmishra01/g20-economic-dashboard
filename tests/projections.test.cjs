'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const trainer = require('../sync/train-projections.js');

const INDICATORS = ['GDP_GROWTH', 'INFLATION', 'UNEMPLOYMENT', 'DEBT_GDP', 'FISCAL_BAL', 'CURRENT_ACC'];

function fixturePanel() {
  const countries = ['AAA', 'BBB', 'CCC'];
  const panel = {};
  for (const [ci, iso3] of countries.entries()) {
    panel[iso3] = {};
    for (const [ki, key] of INDICATORS.entries()) {
      panel[iso3][key] = {};
      for (let year = 1995; year <= 2025; year++) {
        const trend = key === 'DEBT_GDP' ? 40 + ci * 8 + (year - 1995) * 0.4
          : key === 'FISCAL_BAL' ? -2 - ci * 0.2
          : key === 'GDP_GROWTH' ? 2.5 + ci * 0.3
          : key === 'INFLATION' ? 2 + ci * 0.2
          : key === 'UNEMPLOYMENT' ? 5 + ci * 0.4
          : 1 - ci * 0.3;
        panel[iso3][key][year] = trend + Math.sin((year + ki + ci) / 3) * 0.35;
      }
    }
    panel[iso3].TRADE_GDP = Object.fromEntries(Array.from({ length: 31 }, (_, i) => [1995 + i, 50 + ci * 10]));
  }
  return panel;
}

test('trainer is deterministic for a fixed panel and date', () => {
  const options = { countries: ['AAA', 'BBB', 'CCC'], generatedDate: '2026-10-12', minTrainYear: 1995, firstBacktestOrigin: 2008 };
  assert.deepEqual(trainer.trainProjectionEngine(fixturePanel(), options), trainer.trainProjectionEngine(fixturePanel(), options));
});

test('zero scenario shock reproduces the baseline exactly', () => {
  const base = { GDP_GROWTH: 2.4, INFLATION: 2.1, UNEMPLOYMENT: 5.2, DEBT_GDP: 70, FISCAL_BAL: -3, CURRENT_ACC: 1 };
  assert.deepEqual(trainer.applyScenario(base, { slowdown: 0, commodity: 0, ratesBp: 0, aiProductivity: 0 }, {}), base);
});

test('shipped projection artifact has the versioned schema and finite ordered intervals', () => {
  const file = path.join(ROOT, 'public/legacy/projections.json');
  assert.ok(fs.existsSync(file), 'public/legacy/projections.json must exist');
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(data.schemaVersion, 1);
  assert.match(data.generatedDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(data.dataVintage, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(data.indicators, INDICATORS);
  assert.equal(data.horizons.length, 5);
  assert.ok(data.projections.length >= 19 * INDICATORS.length * 5);
  for (const row of data.projections) {
    for (const field of ['point', 'p10', 'p25', 'p75', 'p90']) assert.ok(Number.isFinite(row[field]), `${field} must be finite`);
    assert.ok(row.p10 <= row.p25 && row.p25 <= row.point && row.point <= row.p75 && row.p75 <= row.p90);
    assert.ok(row.isProjection);
  }
});

test('no skill fits explicitly use the naive baseline', () => {
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/legacy/projections.json'), 'utf8'));
  for (const row of data.backtest.filter(r => r.noSkill)) {
    assert.equal(row.shippedMethod, 'naive last value baseline');
    assert.match(row.status, /no skill/i);
  }
});

test('debt path follows the documented debt dynamics identity', () => {
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/legacy/projections.json'), 'utf8'));
  const by = new Map(data.projections.map(r => [`${r.iso3}|${r.indicator}|${r.year}`, r]));
  for (const row of data.projections.filter(r => r.indicator === 'DEBT_GDP' && r.identity)) {
    const prior = row.horizon === 1 ? row.identity.startDebt : by.get(`${row.iso3}|DEBT_GDP|${row.year - 1}`).point;
    const growth = by.get(`${row.iso3}|GDP_GROWTH|${row.year}`).point / 100;
    const fiscal = by.get(`${row.iso3}|FISCAL_BAL|${row.year}`).point;
    const expected = prior * (1 + row.identity.interestRate / 100) / (1 + growth) - fiscal;
    assert.ok(Math.abs(row.point - expected) <= 0.06, `${row.iso3} ${row.year} debt identity`);
  }
});

test('workflow retrains and commits projection artifacts', () => {
  const workflow = fs.readFileSync(path.join(ROOT, '.github/workflows/refresh.yml'), 'utf8');
  assert.match(workflow, /node sync\/train-projections\.js/);
  assert.match(workflow, /public\/legacy\/projections\.json/);
  assert.match(workflow, /public\/legacy\/projection-history\.json/);
});
