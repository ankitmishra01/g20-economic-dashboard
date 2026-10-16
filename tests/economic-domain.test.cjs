'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  classifySnapshotObservation,
  classifyFreshness,
  formatObservationLabel,
  summarizeIndicators,
} = require('../lib/economic-domain.cjs');

test('IMF WEO estimates and future projections are never labeled as actuals', () => {
  const context = { generatedAt: '2026-10-16T00:00:00Z', frequency: 'annual' };
  assert.equal(classifySnapshotObservation({ source: 'IMF WEO', period: '2024', ...context }), 'actual');
  assert.equal(classifySnapshotObservation({ source: 'IMF WEO', period: '2025', ...context }), 'estimate');
  assert.equal(classifySnapshotObservation({ source: 'IMF WEO', period: '2027', ...context }), 'forecast');
  assert.equal(classifySnapshotObservation({ source: 'World Bank', period: '2027', ...context }), 'forecast');
});
const statusHandler = require('../api/status.js');

test('forecast years never advance latest observed coverage', () => {
  const rows = [
    { country_iso3: 'USA', indicator_key: 'DEBT_GDP', year: 2025, fetched_at: '2026-10-14T00:00:00Z' },
    { country_iso3: 'USA', indicator_key: 'DEBT_GDP', year: 2031, fetched_at: '2026-10-14T00:00:00Z' },
    { country_iso3: 'CAN', indicator_key: 'DEBT_GDP', year: 2024, fetched_at: '2026-10-14T00:00:00Z' },
  ];

  const result = summarizeIndicators(rows, {
    countries: ['USA', 'CAN'],
    now: new Date('2026-10-16T00:00:00Z'),
  });

  assert.equal(result.DEBT_GDP.latestObservedPeriod, '2025');
  assert.equal(result.DEBT_GDP.latestForecastPeriod, '2031');
  assert.equal(result.DEBT_GDP.covered, 2);
});

test('explicit release and fetch timestamps produce source-appropriate freshness', () => {
  assert.deepEqual(
    classifyFreshness({
      frequency: 'daily',
      releasedAt: '2026-10-15T16:00:00Z',
      fetchedAt: '2026-10-15T16:05:00Z',
    }, new Date('2026-10-16T12:00:00Z')),
    { state: 'current', ageHours: 20, basis: 'release' },
  );

  assert.equal(
    classifyFreshness({
      frequency: 'monthly',
      releasedAt: '2026-07-01T00:00:00Z',
      fetchedAt: '2026-10-15T00:00:00Z',
    }, new Date('2026-10-16T00:00:00Z')).state,
    'stale',
  );
});

test('observation labels distinguish actual, preliminary, estimate, and forecast values', () => {
  assert.equal(formatObservationLabel({ period: '2026-Q2', status: 'preliminary' }), '2026 Q2 · preliminary');
  assert.equal(formatObservationLabel({ period: '2026-09', status: 'actual' }), 'September 2026 · official release');
  assert.equal(formatObservationLabel({ period: '2027', status: 'estimate' }), '2027 · estimate');
  assert.equal(formatObservationLabel({ period: '2031', status: 'forecast' }), '2031 · forecast');
});

test('status payload exposes observed and forecast periods without conflating them', () => {
  const payload = statusHandler.buildStatusPayload([
    { country_iso3: 'USA', indicator_key: 'DEBT_GDP', year: 2025, fetched_at: '2026-10-14T00:00:00Z' },
    { country_iso3: 'USA', indicator_key: 'DEBT_GDP', year: 2031, fetched_at: '2026-10-14T00:00:00Z' },
  ], {
    countries: ['USA'],
    now: new Date('2026-10-16T00:00:00Z'),
  });

  assert.equal(payload.indicators.DEBT_GDP.latestYear, 2025);
  assert.equal(payload.indicators.DEBT_GDP.latestObservedPeriod, '2025');
  assert.equal(payload.indicators.DEBT_GDP.latestForecastPeriod, '2031');
  assert.equal(payload.indicators.DEBT_GDP.freshness.state, 'current');
  assert.equal(payload.lastRefreshed, '2026-10-14T00:00:00Z');
});
