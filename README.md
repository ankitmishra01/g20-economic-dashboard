# Global Economic Intelligence

A release-aware economic intelligence workspace for policy, strategy, and market decisions. The product expands the original G20 Economic Monitor into a global architecture while preserving the proven dashboard at [`/legacy/index.html`](https://g20-economic-dashboard.vercel.app/legacy/index.html).

The core promise is precise: official observations, estimates, and forecasts are never presented as the same thing. Every surfaced value carries a period, status, source, vintage, and coverage context.

## Product surfaces

| Route | Purpose |
|---|---|
| `/` | “What changed” decision brief plus auto-refreshing official market references |
| `/pulse` | Latest supported growth, inflation, labour, and fiscal signals |
| `/countries` | Country discovery with explicit coverage tiers |
| `/countries/[iso3]` | Country evidence, provenance, and observed status |
| `/indicators` | Definitions, cadence, sources, and coverage |
| `/calendar` | Release ledger and source cadence |
| `/compare` | URL-shareable cross-country comparisons with sparse-data warnings |
| `/account` | Owner-scoped watchlists, items, alerts, and brief preferences |
| `/legacy/index.html` | Preserved original G20 dashboard |

## Data coverage and freshness

Coverage is intentionally tiered. Tier 1 is the validated G20 baseline currently present in the static snapshot. The schema and versioned APIs support every country returned by official registries, but a country is promoted only after its source mappings pass validation. Missing series remain missing; the application does not fill them to make a ranking appear complete.

| Source | Typical cadence | Current use | Freshness language |
|---|---|---|---|
| World Bank | Annual | Structural and development indicators | Latest observed year |
| IMF | Semiannual / annual | Fiscal outlook and projections | Estimate or forecast when applicable |
| OECD / national statistics | Quarterly / monthly | Growth, prices, labour | Latest observed period |
| ECB | Daily | FX reference rates | Latest fixing |
| FRED | Daily / weekly | Benchmarks and term spread | Latest release |

The API returns coverage metadata and separates `actual`, `preliminary`, `estimate`, and `forecast`. Forecasts never advance the latest-observed date.

## Architecture

- Next.js 16 App Router, React 19, TypeScript, and server-rendered public routes.
- Supabase Postgres for countries, collections, series, releases, observation vintages, ingestion jobs, and private workflows.
- Row Level Security keeps public economic data read-only and user data owner-scoped.
- Versioned `/api/v1` routes read the normalized Supabase fact model first, provide bounded cursor pagination and explicit provenance, and fall back to the committed last-valid snapshot during database outages.
- A committed last-valid snapshot protects the public experience during source or database failures.
- GitHub Actions split structural, release-sensitive, model, snapshot, and weekday market/health work by cadence.
- Vercel runs the Next.js application and a protected brief schedule on Fluid Compute.

See [API reference](docs/api.md), [data dictionary](docs/data-dictionary.md), and [operations runbook](docs/operations.md).

## Local development

Requirements: Node.js 22 or newer and npm.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Quality commands:

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

Environment variables:

| Variable | Required | Use |
|---|---:|---|
| `SUPABASE_URL` | Production | Server-side project URL |
| `SUPABASE_PUBLISHABLE_KEY` | Production | Public/authenticated Supabase access |
| `SUPABASE_SERVICE_ROLE_KEY` | Refresh jobs only | Privileged ingestion; never exposed to the browser |
| `CRON_SECRET` | Scheduled jobs | Bearer protection for cron routes |
| `RESEND_API_KEY` | Optional | Real email delivery after marketplace provisioning |
| `BRIEF_EMAIL_ENABLED` | Optional | Must equal `true` to send email |

The `NEXT_PUBLIC_SUPABASE_*` equivalents are also supported. Accounts degrade safely when Supabase environment variables are absent; public data remains readable.

## Database

The canonical schema lives in `sync/schema.sql`; imperative migrations live in `supabase/migrations/`.

```bash
supabase link --project-ref <project-ref>
supabase db push --dry-run --include-all
supabase db push --include-all
supabase db lint --linked --level warning --fail-on error
```

The October 2026 migrations add global metadata, source releases, immutable vintages, ingestion runs, watchlists, alert rules and events, brief preferences, and idempotent delivery records. They backfill the normalized fact model from the validated legacy tables, expose a service-role-only legacy-to-normalized refresh function, and enable owner-filtered Realtime invalidation for personal workflows. Child workflow records use owner-bound composite foreign keys in addition to RLS.

## Versioned API

The public contract is available under `/api/v1`:

- `countries`, `collections`, and `indicators`
- `observations?country=USA,CAN&indicator=GDP_GROWTH&status=actual&limit=50`
- `releases`, `pulse`, `health`, and `market`

List endpoints return `{ data, meta }`, enforce a maximum page size of 500, and include `nextCursor` where another page exists. Invalid queries return a structured `INVALID_QUERY` response.

`GET /api/cron/ingest?indicator=GDP_GROWTH` is a `CRON_SECRET`-protected World Bank ingestion path. It validates official rows, preserves prior vintages, writes normalized observations in batches, and records success or failure in `ingestion_job_runs`.

`GET /api/v1/market` fetches ECB euro reference rates and the FRED US 10-year Treasury series from their official endpoints. The homepage checks it every five minutes, while clearly retaining the sources' daily/reference cadence rather than presenting the values as tick data.

## Personal workflows and email

Supabase magic links provide optional accounts. Watchlists, monitored countries or series, alert rules, and brief preferences derive ownership from `auth.getUser()` and never trust a submitted user ID. Owner-filtered Realtime events refresh the account workspace. Daily and weekly brief workers reserve idempotent delivery records, resolve current watchlist evidence, and retain evidence links.

Email is not mocked. Delivery remains `not_configured` unless a real Resend integration supplies `RESEND_API_KEY` and `BRIEF_EMAIL_ENABLED=true`. This keeps the public product useful without creating paid spend or implying delivery that did not happen.

## Deployment and rollback

`vercel.ts` configures the Next.js build, API cache policy, and daily protected brief invocation. Production deployment:

```bash
vercel --prod
```

Rollback by promoting the preceding Vercel deployment. Keep the additive Supabase migration in place and disable `BRIEF_EMAIL_ENABLED` if delivery is implicated. The legacy dashboard remains independently reachable throughout the rollout.

## Repository map

```text
src/app/                 Next.js routes and API handlers
src/lib/                 typed environment, repositories, ingestion contracts
public/legacy/           preserved original G20 dashboard and artifacts
supabase/migrations/     additive production schema migrations
sync/                    official-source refresh and model scripts
tests/                   Node contract and regression tests
docs/                    API, dictionary, operations, implementation plans
```

## Security and privacy

Public economic data requires no account. Personal email, watchlists, rules, preferences, and delivery history stay in owner-scoped Supabase tables. Service-role credentials are server-only. The application does not sell personal data or use private workflow data to train models.

## License

See [LICENSE](LICENSE).
