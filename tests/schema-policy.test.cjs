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

test('global intelligence schema preserves provenance and vintages', () => {
  const sql = fs.readFileSync(path.join(ROOT, 'sync/schema.sql'), 'utf8');
  for (const table of ['countries', 'country_collections', 'collection_members', 'indicator_series', 'economic_releases', 'economic_observations', 'ingestion_job_runs']) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`, 'i'), `${table} table must exist`);
  }
  assert.match(sql, /observation_status[\s\S]+CHECK[\s\S]+'forecast'/i);
  assert.match(sql, /frequency[\s\S]+CHECK[\s\S]+'daily'/i);
  assert.match(sql, /UNIQUE\s*\(series_id, country_iso3, period, vintage_date\)/i);
  assert.match(sql, /released_at\s+TIMESTAMPTZ/i);
  assert.match(sql, /fetched_at\s+TIMESTAMPTZ/i);
});

test('personal workflow tables enforce owner-scoped RLS and delivery deduplication', () => {
  const sql = fs.readFileSync(path.join(ROOT, 'sync/schema.sql'), 'utf8');
  for (const table of ['profiles', 'watchlists', 'watchlist_items', 'alert_rules', 'brief_preferences', 'brief_deliveries']) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`, 'i'), `${table} table must exist`);
    assert.match(sql, new RegExp(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`, 'i'), `${table} must enable RLS`);
  }
  assert.match(sql, /auth\.uid\(\)\)\s*=\s*user_id/i);
  assert.match(sql, /UNIQUE\s+NULLS\s+NOT\s+DISTINCT\s*\(user_id, watchlist_id, period_start, cadence\)/i);
  assert.match(sql, /WITH \(security_invoker\s*=\s*true\)/i);
  assert.match(sql, /UNIQUE\s*\(id, user_id\)/i, 'watchlists must expose an owner-bound key');
  assert.match(sql, /FOREIGN KEY\s*\(watchlist_id, user_id\)\s*REFERENCES watchlists\s*\(id, user_id\)/i, 'child rows must reference a watchlist owned by the same user');
});

test('rollout seeds the global fact model and enables owner-scoped Realtime tables', () => {
  const migrations = fs.readdirSync(path.join(ROOT, 'supabase/migrations')).filter((file) => file.endsWith('.sql')).map((file) => fs.readFileSync(path.join(ROOT, 'supabase/migrations', file), 'utf8')).join('\n');
  assert.match(migrations, /INSERT INTO indicator_series/i);
  assert.match(migrations, /INSERT INTO economic_observations/i);
  assert.match(migrations, /supabase_realtime/i);
  assert.match(migrations, /watchlist_items/i);
});
