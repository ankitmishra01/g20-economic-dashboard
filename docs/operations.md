# Operations runbook

The system separates update cadence by economic meaning. Market and public-health probes run every six hours on weekdays. Release-aware adapters should run after verified source releases. Structural World Bank and IMF panels continue on the monthly workflow. Model artifacts and the static snapshot are rebuilt only after source validation succeeds. Brief delivery is a protected, idempotent job and remains disabled until the real email integration is configured.

## Failure response

1. Check `/api/v1/health` for snapshot age, row count, country coverage, and job state.
2. Inspect `ingestion_job_runs` for duration, row delta, validation errors, and the source URL.
3. Never delete or replace the last valid observations after a partial source failure.
4. Re-run the relevant market, release, structural, model, snapshot, or brief job independently.
5. Open an incident when country coverage drops or delivery failures increase.

## Protected jobs

Call `/api/cron/ingest?indicator=GDP_GROWTH` with `Authorization: Bearer $CRON_SECRET` to run an allow-listed World Bank backfill. The adapter creates an `ingestion_job_runs` row before fetching, writes immutable daily vintages without deleting the last valid data, and closes the run as succeeded or failed. The daily `/api/cron/briefs` job processes only preferences due for the current UTC hour and relies on the delivery uniqueness constraint to prevent duplicate email.

## Synthetic probes

The free GitHub workflow checks the public health and pulse endpoints. It is also Checkly-ready: configure GET checks for `/`, `/api/v1/health`, `/countries/USA`, and `/legacy/index.html`, expecting HTTP 200 and an observed-only marker in the API response.

## Rollback

Promote the preceding Vercel deployment, then keep `/legacy/index.html` available. Database migrations are additive; do not drop the new tables during a frontend rollback. Disable `BRIEF_EMAIL_ENABLED` before investigating delivery failures.
