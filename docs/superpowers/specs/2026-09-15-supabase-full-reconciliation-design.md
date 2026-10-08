# Supabase Full Reconciliation Design

## Objective

Bring Supabase project `qozknjenyhewmkapsizk`, the G20 data-refresh pipeline, the GitHub repository, and the deployed dashboard into a verified, secure, reproducible state. The work must preserve public read access while removing anonymous write access and must not interrupt the monthly refresh.

## Current State

- The live database contains 12,231 annual rows and reports healthy coverage across 25 indicators.
- The September 1, 2026 workflow completed and wrote annual, quarterly, and indicator metadata.
- `fetched_at` incorrectly reports July 24 because upserts do not update that column.
- The September refresh retained fallback values after the World Bank CO2 source returned no rows and the OECD R&D request returned HTTP 422.
- Local `sync/schema.sql` grants unrestricted insert and update access to public clients on all three exposed tables.
- The project has no committed Supabase migration history, so schema drift cannot be audited reliably.

## Approach

Use a migration-led reconciliation. First authenticate and link the CLI, capture a backup and the remote schema, and verify the current GitHub secret can be replaced safely. Then apply a reviewed migration that makes exposed tables read-only for `anon` and `authenticated`, update the refresh code to use a server-only service-role secret, repair refresh timestamps and source adapters, run advisors, execute a full refresh, and verify the deployed application.

This is preferred over a data-only refresh because a data-only run would leave anonymous writes and schema drift unresolved. Rebuilding the database is rejected because it adds unnecessary migration and outage risk.

## Components

### 1. Repository and Supabase baseline

- Work from `origin/main` on `supabase-full-reconciliation`.
- Authenticate the Supabase CLI and link only project `qozknjenyhewmkapsizk`.
- Take a schema-only and data backup before permissions change.
- Pull the live schema into a committed migration baseline.
- Record migration status so future changes are reproducible.

### 2. Access control

- Preserve public `SELECT` access to the economic, quarterly, and indicator metadata tables.
- Drop public insert/update policies.
- Explicitly revoke write privileges from `anon` and `authenticated`.
- Keep RLS enabled on every exposed table.
- Use `TO anon, authenticated` for public-read policies.
- Keep refresh writes server-side through a service-role key stored only in GitHub Actions and local protected environments.
- Never expose the service-role key in frontend files, logs, artifacts, or Vercel public variables.

### 3. Refresh correctness

- Rename the workflow credential to `SUPABASE_SERVICE_ROLE_KEY` so its privilege is explicit.
- Make seed scripts fail closed when the server-only key is absent.
- Set `fetched_at` on every annual and quarterly upsert and `updated_at` on indicator metadata upserts.
- Ensure the status endpoint reports the latest successful refresh rather than the original insertion date.
- Update the World Bank CO2 adapter if a current replacement series is available; otherwise retain the last valid values and report the fallback explicitly.
- Repair the OECD MSTI request against the current endpoint/schema. If the source remains unavailable, retain the World Bank fallback and expose that status in the validation report.
- Preserve existing primary keys and merge semantics so refreshes remain idempotent.

### 4. Validation and observability

- Add automated source-contract tests for write-key handling, timestamp updates, and read-only schema policies.
- Run the Supabase database advisors and resolve applicable security findings.
- Run a full refresh and require zero fatal source failures.
- Validate row counts, 20-member coverage, latest years, quarterly periods, metadata rows, and refresh timestamps directly against the remote project.
- Verify an anonymous read succeeds and anonymous insert/update attempts are rejected without changing data.
- Update the committed validation report with the successful run.

### 5. Release

- Commit changes in focused units on the reconciliation branch.
- Push the branch and land it only after tests and remote verification pass.
- Deploy the associated G20 Vercel project to production.
- Verify the live dashboard, `/api/status`, and representative Supabase reads.

## Failure Handling and Rollback

- Do not revoke anonymous writes until the service-role refresh path succeeds in a non-destructive probe.
- Apply permission changes in a transaction.
- If the refresh fails after migration, restore the prior policies from the rollback SQL and investigate before retrying.
- Keep the pre-change database backup until the live dashboard and next scheduled refresh are verified.
- Do not overwrite or delete existing economic observations as part of reconciliation.

## Acceptance Criteria

- Remote schema and migrations agree.
- `anon` and `authenticated` can read but cannot insert, update, or delete exposed data.
- The GitHub refresh uses a protected service-role secret and completes successfully.
- Refresh timestamps reflect the September reconciliation run.
- Source fallbacks are explicit and no longer silently reported as fully refreshed.
- Supabase security advisors show no unresolved critical findings in scope.
- The live dashboard and `/api/status` return healthy responses after deployment.
- Repository, GitHub, Supabase, and Vercel states all point to the same released revision.
