'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { requireServiceRoleKey, stampRows } = require('../sync/refresh-utils');

test('rejects a missing service-role key', () => {
  assert.throws(() => requireServiceRoleKey({}), /SUPABASE_SERVICE_ROLE_KEY/);
});

test('rejects a publishable key', () => {
  assert.throws(
    () => requireServiceRoleKey({ SUPABASE_SERVICE_ROLE_KEY: 'sb_publishable_example' }),
    /public client key/
  );
});

test('accepts a server secret key', () => {
  assert.equal(
    requireServiceRoleKey({ SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_example' }),
    'sb_secret_example'
  );
});

test('stamps copied rows without mutating the input', () => {
  const rows = [{ country_iso3: 'CAN', year: 2025 }];
  const stamped = stampRows(rows, 'fetched_at', '2026-09-15T12:00:00.000Z');
  assert.deepEqual(stamped, [{
    country_iso3: 'CAN',
    year: 2025,
    fetched_at: '2026-09-15T12:00:00.000Z',
  }]);
  assert.deepEqual(rows, [{ country_iso3: 'CAN', year: 2025 }]);
});

test('seed requires a service-role key and stamps every write payload', () => {
  const source = fs.readFileSync(path.join(__dirname, '../sync/seed.js'), 'utf8');
  assert.match(source, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(source, /sb_publishable_/);
  assert.match(source, /stampRows\(rows, 'fetched_at', RUN_TIMESTAMP\)/);
  assert.match(source, /stampRows\(META, 'updated_at', RUN_TIMESTAMP\)/);
});

const seedSource = () => fs.readFileSync(path.join(__dirname, '../sync/seed.js'), 'utf8');

test('CO2 uses the current World Bank series, not the archived one', () => {
  const source = seedSource();
  assert.match(source, /CO2_CAPITA:\s+'EN\.GHG\.CO2\.PC\.CE\.AR5'/);
  assert.doesNotMatch(source, /'EN\.ATM\.CO2E\.PC'/);
});

test('OECD R&D query uses the six-part MSTI key', () => {
  assert.match(seedSource(), /\$\{countries\}\.A\.G\.PT_B1GQ\._Z\._Z\?startPeriod/);
});

test('quarterly GDP uses the current SDMX dataflow in one batched request', () => {
  const source = seedSource();
  assert.match(source, /DF_QNA_EXPENDITURE_GROWTH_G20/);
  assert.doesNotMatch(source, /stats\.oecd\.org\/SDMX-JSON/);
  assert.match(source, /OECD_QNA_COUNTRIES\.join\('\+'\)/);
});

test('FRED quarterly inflation is a year-on-year rate, never a CPI index level', () => {
  const source = seedSource();
  assert.match(source, /function yoyPercent/);
  assert.match(source, /add\('INFLATION',\s+quarterlyAverage\(yoyPercent\(/);
  assert.doesNotMatch(source, /A191RL1Q225SBEA/);
});

test('implausible quarterly values are rejected', () => {
  const source = seedSource();
  assert.match(source, /QUARTERLY_BOUNDS/);
  assert.match(source, /INFLATION: \[-10, 60\]/);
});

test('refresh workflow alerts on failure and verifies the write', () => {
  const wf = fs.readFileSync(path.join(__dirname, '../.github/workflows/refresh.yml'), 'utf8');
  assert.match(wf, /issues: write/);
  assert.match(wf, /if: failure\(\)/);
  assert.match(wf, /Verify the refresh really wrote to the database/);
});

test('front-end pages through the quarterly table instead of reading only the first 1,000 rows', () => {
  const data = fs.readFileSync(path.join(__dirname, '../app/data.js'), 'utf8');
  assert.match(data, /QPAGE/);
  assert.match(data, /'Range': `\$\{qoffset\}-\$\{qoffset \+ QPAGE - 1\}`/);
});
