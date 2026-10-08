# Supabase Full Reconciliation Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reconcile the G20 dashboard repository, Supabase project `qozknjenyhewmkapsizk`, GitHub refresh workflow, and Vercel production deployment so public clients remain read-only, refresh writes are server-only, and refresh health is accurate and reproducible.

**Architecture:** Keep the existing static dashboard and PostgREST read path, but move every database mutation behind a required service-role credential used only by the refresh job. Establish a pulled Supabase migration baseline, apply a transactional read-only policy migration, and make refresh timestamps and source fallbacks explicit. Verify each boundary independently before releasing the same commit to GitHub and Vercel.

**Tech Stack:** Vanilla JavaScript, Node.js built-in test runner, Supabase CLI/PostgREST, GitHub Actions, Vercel CLI.

---

### Task 1: Add refresh security and timestamp contract tests

**Files:**
- Create: `tests/refresh-contract.test.cjs`
- Create: `sync/refresh-utils.js`

- [ ] **Step 1: Write the failing credential and timestamp tests**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
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
  assert.deepEqual(stamped, [{ country_iso3: 'CAN', year: 2025, fetched_at: '2026-09-15T12:00:00.000Z' }]);
  assert.deepEqual(rows, [{ country_iso3: 'CAN', year: 2025 }]);
});
```

- [ ] **Step 2: Run the test and verify it fails because the module does not exist**

Run: `node --test tests/refresh-contract.test.cjs`
Expected: FAIL with `Cannot find module '../sync/refresh-utils'`.

- [ ] **Step 3: Implement the smallest credential and timestamp helpers**

```js
'use strict';

function requireServiceRoleKey(env = process.env) {
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for database writes');
  if (key.startsWith('sb_publishable_')) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY cannot be a public client key');
  }
  return key;
}

function stampRows(rows, field, timestamp = new Date().toISOString()) {
  return rows.map((row) => ({ ...row, [field]: timestamp }));
}

module.exports = { requireServiceRoleKey, stampRows };
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `node --test tests/refresh-contract.test.cjs`
Expected: 4 tests pass.

- [ ] **Step 5: Commit the test seam**

```bash
git add tests/refresh-contract.test.cjs sync/refresh-utils.js
git commit -m "test: define secure refresh contracts"
```

### Task 2: Make refresh writes fail closed and update freshness timestamps

**Files:**
- Modify: `sync/seed.js`
- Modify: `sync/train-forecast.js`
- Modify: `.github/workflows/refresh.yml`
- Modify: `README.md`
- Test: `tests/refresh-contract.test.cjs`

- [ ] **Step 1: Add a failing source assertion for the seed entry point**

Extend `tests/refresh-contract.test.cjs` to read `sync/seed.js` and assert that it references `SUPABASE_SERVICE_ROLE_KEY`, contains no publishable fallback, and stamps annual, quarterly, and indicator payloads.

- [ ] **Step 2: Run the contract test and confirm the current implementation fails**

Run: `node --test tests/refresh-contract.test.cjs`
Expected: FAIL on the old `SUPABASE_KEY` and publishable fallback.

- [ ] **Step 3: Update the seed script**

Import `requireServiceRoleKey` and `stampRows`, initialize the write client with only `SUPABASE_SERVICE_ROLE_KEY`, compute one run timestamp, stamp annual and quarterly rows with `fetched_at`, and stamp indicator metadata with `updated_at` before upsert. Do not log the key.

- [ ] **Step 4: Separate workflow credentials by privilege**

Change the seed step to:

```yaml
env:
  SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
  SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
```

Keep forecast reads on `SUPABASE_PUBLISHABLE_KEY`; remove the ambiguous `SUPABASE_KEY` name. Add an early shell preflight that exits if the service-role secret is empty.

- [ ] **Step 5: Document the required secrets and trust boundary**

In `README.md`, document `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` for the refresh writer, and `SUPABASE_PUBLISHABLE_KEY` for read-only jobs. State that the service-role value must never be added to frontend or Vercel public variables.

- [ ] **Step 6: Run tests and a syntax check**

Run: `node --test tests/refresh-contract.test.cjs && node --check sync/seed.js && node --check sync/train-forecast.js`
Expected: all tests pass and both scripts parse.

- [ ] **Step 7: Commit the refresh hardening**

```bash
git add sync/seed.js sync/train-forecast.js .github/workflows/refresh.yml README.md tests/refresh-contract.test.cjs
git commit -m "fix: secure refresh writes and timestamps"
```

### Task 3: Capture the live Supabase baseline and backups

**Files:**
- Create: `supabase/config.toml` through `supabase init`
- Create: `supabase/migrations/<generated_timestamp>_remote_baseline.sql` through `supabase db pull remote_baseline`
- Do not commit: temporary database backups

- [ ] **Step 1: Authenticate and link the exact project**

Run:

```bash
supabase login
supabase init
supabase link --project-ref qozknjenyhewmkapsizk
supabase projects list
```

Expected: the linked project reference is exactly `qozknjenyhewmkapsizk`.

- [ ] **Step 2: Create private pre-change backups outside the repository**

Create a `mktemp -d` directory, then run:

```bash
supabase db dump --linked --schema public --file <temporary-directory>/schema.sql
supabase db dump --linked --schema public --data-only --use-copy --file <temporary-directory>/data.sql
```

Record the temporary backup path in the execution notes without committing it or exposing database credentials.

- [ ] **Step 3: Pull and inspect the remote migration baseline**

Run:

```bash
supabase db pull remote_baseline --linked
supabase migration list --linked
```

Inspect the generated SQL for the three dashboard tables, RLS state, policies, grants, functions, and triggers. Confirm it describes live state before making policy edits.

- [ ] **Step 4: Commit the reproducible baseline**

```bash
git add supabase/config.toml supabase/migrations
git commit -m "chore: capture Supabase schema baseline"
```

### Task 4: Convert exposed tables to public-read/server-write access

**Files:**
- Modify: `sync/schema.sql`
- Create: `supabase/migrations/<generated_timestamp>_restrict_public_writes.sql` via `supabase migration new restrict_public_writes`
- Create: `tests/schema-policy.test.cjs`

- [ ] **Step 1: Write a failing schema-policy test**

Create a test that reads `sync/schema.sql` and the generated restriction migration and requires:

```js
assert.match(sql, /ENABLE ROW LEVEL SECURITY/i);
assert.match(sql, /TO anon, authenticated/i);
assert.match(sql, /GRANT SELECT/i);
assert.match(sql, /REVOKE (INSERT|UPDATE|DELETE)/i);
assert.doesNotMatch(sql, /CREATE POLICY[^;]+FOR (INSERT|UPDATE|DELETE)/is);
```

- [ ] **Step 2: Run it against the current schema and confirm failure**

Run: `node --test tests/schema-policy.test.cjs`
Expected: FAIL because public insert/update policies exist.

- [ ] **Step 3: Generate the migration filename through the CLI**

Run: `supabase migration new restrict_public_writes`

Edit the emitted migration so one transaction drops every public write policy on `g20_economic_data`, `g20_quarterly_data`, and `g20_indicators`; revokes `INSERT`, `UPDATE`, `DELETE`, and `TRUNCATE` from `anon` and `authenticated`; enables RLS; replaces read policies with `FOR SELECT TO anon, authenticated USING (true)`; and explicitly grants `SELECT`.

- [ ] **Step 4: Bring the canonical bootstrap schema into agreement**

Apply the same grants and policies to `sync/schema.sql`. Preserve the current columns, constraints, primary keys, and indexes.

- [ ] **Step 5: Run local policy tests and database advisors before applying**

Run:

```bash
node --test tests/schema-policy.test.cjs
supabase db advisors --linked --output json
supabase db push --linked --dry-run
```

Expected: tests pass; dry run shows only intended policy/grant changes; no unresolved critical in-scope advisor finding.

- [ ] **Step 6: Provision GitHub secrets without printing them**

Retrieve the project API key through the authenticated Supabase CLI, select the service-role/secret value without echoing it, and pipe it directly to:

```bash
gh secret set SUPABASE_SERVICE_ROLE_KEY --repo <resolved-owner>/<resolved-repository>
```

Set `SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_URL` the same way if missing. Verify only secret names with `gh secret list`; never print secret values.

- [ ] **Step 7: Apply and verify the migration**

Run: `supabase db push --linked`

Use the publishable key to confirm an anonymous `GET` succeeds. Attempt a valid synthetic `POST` using a reserved probe identifier and require HTTP 401/403. If a row is unexpectedly inserted, stop the release and remove only that synthetic probe using the service-role client; do not modify economic observations.

- [ ] **Step 8: Commit the access-control migration**

```bash
git add sync/schema.sql supabase/migrations tests/schema-policy.test.cjs
git commit -m "security: make dashboard tables read only"
```

### Task 5: Make upstream fallbacks visible and diagnose stale adapters

**Files:**
- Modify: `sync/seed.js`
- Modify: `sync/validate.js`
- Modify: `sync/validation-report.json`
- Create: `tests/source-status.test.cjs`

- [ ] **Step 1: Add failing tests for explicit fallback status**

Extract a small pure helper that records each source as `fresh`, `fallback`, or `failed`. Test that zero-row CO2 responses and OECD HTTP 422 responses produce `fallback`, preserve existing valid data, and appear in the validation result instead of being counted as fresh.

- [ ] **Step 2: Run the source-status tests and confirm failure**

Run: `node --test tests/source-status.test.cjs`
Expected: FAIL until source statuses are represented.

- [ ] **Step 3: Check current official source contracts**

Query the current World Bank indicator catalog for the CO2 series and the current OECD Data Explorer/SDMX structure for MSTI R&D. If an official replacement endpoint returns valid G20 rows, update the adapter and fixture. If not, retain the existing fallback but emit its source, reason, and retained-through date in the validation report.

- [ ] **Step 4: Implement structured source results**

Make each affected adapter return rows plus status metadata. Treat an empty response or schema/HTTP incompatibility as a visible fallback, never as a silently successful refresh. Preserve zero-fatal-failure behavior when a validated fallback exists.

- [ ] **Step 5: Run source and full local contract tests**

Run: `node --test tests/*.test.cjs`
Expected: all tests pass.

- [ ] **Step 6: Commit source observability changes**

```bash
git add sync/seed.js sync/validate.js sync/validation-report.json tests/source-status.test.cjs
git commit -m "fix: expose refresh source fallbacks"
```

### Task 6: Execute and verify a full remote refresh

**Files:**
- Modify: `sync/validation-report.json`

- [ ] **Step 1: Push the reconciliation branch**

Run: `git push -u origin supabase-full-reconciliation`

- [ ] **Step 2: Trigger the refresh workflow on this branch**

Run:

```bash
gh workflow run refresh.yml --ref supabase-full-reconciliation
gh run list --workflow refresh.yml --branch supabase-full-reconciliation --limit 1
gh run watch <run-id> --exit-status
```

Expected: workflow succeeds using `SUPABASE_SERVICE_ROLE_KEY` and no credential appears in logs.

- [ ] **Step 3: Verify remote data invariants**

Query the remote project through read-only REST and require:

- 25 indicator metadata rows.
- Expected G20 member coverage for populated series.
- At least the existing 12,231 unique annual observations unless the validation report explicitly explains a source-driven change.
- Quarterly observations remain populated.
- Maximum `fetched_at` and metadata `updated_at` match the reconciliation run.
- Duplicate primary-key counts are zero.
- Every fallback is named and dated in the validation report.

- [ ] **Step 4: Re-run access and advisor checks**

Run `supabase db advisors --linked --output json`, anonymous read, and anonymous write-rejection probes again. Verify `supabase migration list --linked` agrees locally and remotely.

- [ ] **Step 5: Commit the generated validation evidence**

```bash
git add sync/validation-report.json
git commit -m "chore: record reconciled data validation"
git push
```

### Task 7: Land, deploy, and perform production canary checks

**Files:**
- No additional source files expected

- [ ] **Step 1: Review the complete branch diff**

Run:

```bash
git diff --check origin/main...HEAD
git status --short
node --test tests/*.test.cjs
```

Confirm there are no secrets, temporary dumps, unrelated files, or hidden publishable write paths in the diff.

- [ ] **Step 2: Create and merge the pull request**

Create a PR summarizing security, migration, refresh correctness, and validation evidence. Wait for required checks, then merge without bypassing protections.

- [ ] **Step 3: Deploy the released revision to the linked Vercel project**

From the updated main branch run: `vercel --prod`

Record the production URL and deployment revision. Do not attach or modify `sophrosynesystems.org`; this plan affects only the G20 dashboard deployment.

- [ ] **Step 4: Verify production**

Check the live dashboard and `/api/status`. Require HTTP 200, `healthy: true`, the expected row and indicator counts, and a `lastRefreshed` value from this reconciliation run. Exercise representative chart/filter reads and confirm no browser request contains the service-role key.

- [ ] **Step 5: Report final state and retained backup location**

Report the merged commit, GitHub Actions run, Supabase migration state, advisors result, Vercel deployment, live endpoint checks, and any intentionally retained source fallback. Keep the pre-change backup until the next scheduled refresh succeeds.
