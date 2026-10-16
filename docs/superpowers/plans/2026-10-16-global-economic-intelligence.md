# Global Economic Intelligence Implementation Plan

**Spec:** Approved 2026-10-16 transformation plan in the project conversation.

## Global constraints

- Preserve the existing G20 dashboard until each replacement route reaches data and visual parity.
- Use test-first development for every behavior change.
- Keep observed, estimated, and forecast values distinct in storage and presentation.
- Use source-appropriate freshness; never market quarterly or annual macro data as intraday.
- Keep all public economic data anonymously readable and all user data owner-scoped with RLS.
- Prefer free official sources and free service tiers; do not introduce paid spend.
- Deploy production after verified implementation because this is a deployed-site change.

## Task 1: Frequency-aware trust contract

**Produces:** Shared observation/freshness helpers and corrected status behavior.

1. Add failing tests for actual-versus-forecast freshness, release/fetch timestamps, and stale-state labels.
2. Add a reusable domain module for observation status and source-appropriate freshness.
3. Refactor `/api/status` to exclude forecasts from latest-observed coverage and report frequency-aware states.
4. Update the existing UI status copy to show observation period and status rather than one generic “live” label.
5. Run the complete Node test suite and commit.

## Task 2: Global metadata and secure schema

**Consumes:** Task 1 observation contract.
**Produces:** Global country/collection/series/release/observation and user-workflow schema.

1. Add failing schema tests for global metadata, vintages, releases, job runs, watchlists, alerts, briefs, and RLS.
2. Add an imperative Supabase migration plus canonical schema documentation.
3. Add security-invoker public views and owner-scoped authenticated policies.
4. Add indexes and constraints for global queries, idempotent ingestion, and delivery deduplication.
5. Run schema tests, advisors where available, the full suite, and commit.

## Task 3: Next.js application shell

**Consumes:** Task 1 domain helpers and Task 2 schema types.
**Produces:** Incremental Next.js App Router shell alongside the legacy application.

1. Add failing component and route-contract tests for global navigation, URL state, accessibility, and freshness badges.
2. Add pinned Next.js 16, React 19, TypeScript, Supabase, charting, and test dependencies with a committed lockfile.
3. Build the editorial/utilitarian application shell, responsive navigation, command palette, loading/error boundaries, and legacy-route bridge.
4. Add typed server-side data clients and environment validation.
5. Run tests, lint, typecheck, build, and commit.

## Task 4: Versioned global APIs and ingestion adapters

**Consumes:** Tasks 1-2 contracts.
**Produces:** `/api/v1` country, collection, indicator, observation, release, pulse, and health interfaces.

1. Add failing route and adapter tests for pagination, sparse coverage, forecast separation, source failures, duplicates, and revisions.
2. Implement typed repositories and route handlers with cursor pagination and query limits.
3. Add metadata-driven World Bank global annual ingestion and adapters for OECD, IMF, ECB FX, FRED benchmarks, and existing news.
4. Add idempotent job-run logging, validation, stale preservation, and static snapshot generation.
5. Run tests, typecheck, build, and commit.

## Task 5: Decision-intelligence product surfaces

**Consumes:** Task 4 APIs.
**Produces:** What Changed, Pulse, Countries, Indicators, Calendar, Compare, and country-detail routes.

1. Add failing interaction tests for filters, URL sharing, sparse data, loading, partial failure, and keyboard navigation.
2. Build the What Changed homepage with releases, market moves, risk changes, revisions, and upcoming events.
3. Build global discovery, collection filters, coverage tiers, indicator pages, release calendar, and comparison views.
4. Add background refresh and Supabase Realtime invalidation without full-page rerenders.
5. Run component tests, accessibility checks, typecheck, build, and commit.

## Task 6: Authentication, watchlists, alerts, and briefs

**Consumes:** Task 2 user schema and Task 4 facts API.
**Produces:** Optional Supabase magic-link accounts and recurring workflows.

1. Add failing auth/RLS/repository tests for ownership and anonymous public access.
2. Add Supabase magic-link authentication and authenticated account routes.
3. Add watchlist and alert CRUD with optimistic UI and server-side authorization.
4. Add deterministic daily/weekly brief generation, evidence links, delivery records, and Resend integration behind feature flags.
5. Run tests, typecheck, build, and commit.

## Task 7: Scheduling, observability, and operations

**Consumes:** Tasks 4 and 6 jobs.
**Produces:** Source-appropriate schedules, monitoring, and runbooks.

1. Add failing workflow-contract tests for cadence, failure alerts, job logs, and protected cron endpoints.
2. Split workflows into market, release, structural, model, snapshot, and brief schedules.
3. Add health metrics for source freshness, coverage drops, row deltas, job duration, and delivery failure.
4. Add Checkly-ready synthetic probes and an operator runbook without requiring paid monitoring.
5. Run the full verification matrix and commit.

## Task 8: Migration, performance, documentation, and deployment

**Consumes:** All prior tasks.
**Produces:** Production-ready rollout with rollback path.

1. Add performance and end-to-end tests for public and authenticated critical paths.
2. Migrate Vercel configuration to `vercel.ts`, retain legacy fallback routes, and document rollback.
3. Update README, data dictionary, API docs, source cadence table, privacy notes, and contributor instructions.
4. Run tests, lint, typecheck, production build, security checks, and visual QA at desktop and 390 px.
5. Run a fresh whole-branch review, fix Critical/Important findings test-first, commit, and deploy with `vercel --prod`.

## Review focus

- Forecasts accidentally represented as actuals.
- Uneven country coverage hidden by global rankings.
- RLS ownership bypasses or exposed service credentials.
- Partial refreshes deleting or replacing valid values.
- Revisions overwritten instead of preserved as vintages.
- Client hydration, URL-state, keyboard, mobile, and stale-cache failures.
- Free-tier schedules or integrations that silently exceed limits.
