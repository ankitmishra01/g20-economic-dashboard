'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

function assertReadOnlyPolicy(sql, label) {
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/i, `${label} must enable RLS`);
  assert.match(sql, /TO anon, authenticated/i, `${label} must scope public reads`);
  assert.match(sql, /GRANT SELECT/i, `${label} must explicitly grant reads`);
  assert.match(sql, /REVOKE[\s\S]*(INSERT|UPDATE|DELETE)/i, `${label} must revoke writes`);
  assert.doesNotMatch(
    sql,
    /CREATE POLICY[^;]+FOR (INSERT|UPDATE|DELETE)/is,
    `${label} must not create public write policies`
  );
}

test('canonical schema exposes read-only policies', () => {
  const sql = fs.readFileSync(path.join(ROOT, 'sync/schema.sql'), 'utf8');
  assertReadOnlyPolicy(sql, 'sync/schema.sql');
});

test('restriction migration enforces read-only public access', () => {
  const migrationDir = path.join(ROOT, 'supabase/migrations');
  const migrationName = fs.readdirSync(migrationDir)
    .find((name) => name.endsWith('_restrict_public_writes.sql'));
  assert.ok(migrationName, 'restrict_public_writes migration must exist');
  const sql = fs.readFileSync(path.join(migrationDir, migrationName), 'utf8');
  assertReadOnlyPolicy(sql, migrationName);
});
