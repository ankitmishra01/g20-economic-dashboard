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
