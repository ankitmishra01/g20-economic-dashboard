# G20 Economic Monitor

A live economic intelligence dashboard for the G20, combining 25 macroeconomic indicators, country profiles, risk flags, AI readiness analysis, and an honestly validated five year projection engine.

**Production:** [g20-gamma.vercel.app](https://g20-gamma.vercel.app)

**Projection outlook:** [g20-gamma.vercel.app/#projections](https://g20-gamma.vercel.app/#projections)

![Production](https://img.shields.io/badge/status-production-047857)
![Data refresh](https://img.shields.io/badge/data%20refresh-monthly-1E40AF)
![Projection horizons](https://img.shields.io/badge/projection%20horizons-1%20to%205%20years-B91C1C)
![Runtime](https://img.shields.io/badge/browser-vanilla%20JavaScript-0A0A0A)

## Contents

- [What the dashboard does](#what-the-dashboard-does)
- [Pages and keyboard shortcuts](#pages-and-keyboard-shortcuts)
- [Projection engine](#projection-engine)
- [Current backtest results](#current-backtest-results)
- [Scenario layer](#scenario-layer)
- [Ask AI and numerical safety](#ask-ai-and-numerical-safety)
- [Data sources and coverage](#data-sources-and-coverage)
- [Architecture and data flow](#architecture-and-data-flow)
- [Run and operate the project](#run-and-operate-the-project)
- [Testing and validation](#testing-and-validation)
- [Automation and deployment](#automation-and-deployment)
- [API reference](#api-reference)
- [Generated artifact reference](#generated-artifact-reference)
- [Project structure](#project-structure)
- [Security model](#security-model)
- [Known limits](#known-limits)
- [Troubleshooting](#troubleshooting)

## What the dashboard does

The monitor gives policy, risk and strategy teams one place to compare G20 economies without manually reconciling World Bank, IMF, OECD and FRED datasets.

It provides:

- 25 macroeconomic indicators for the 19 G20 countries and the European Union
- quarterly growth and inflation readings where reliable public series are available
- country profiles with current readings, historical trends and source labels
- G20 rankings and rule based macroeconomic risk flags
- AI readiness and workforce exposure analysis using the companion AI Trajectory Index
- one to five year projections for six headline indicators
- empirical 50% and 80% projection ranges
- rolling origin backtests against a naive baseline
- four transparent illustrative scenarios
- a local facts engine for exact questions
- an optional LLM analyst for explanation, with numerical guardrails
- monthly automated data refresh, validation and model retraining

The project is deliberately conservative. A candidate that fails to beat the naive last value baseline is not presented as skilled. The output records `no skill, showing baseline`, and the UI explains that result in plain English.

### Why it exists

G20 data is distributed across institutions with different identifiers, definitions, update schedules and response formats. This project turns the collection work into a reproducible pipeline:

1. Public APIs provide economic series.
2. `sync/seed.js` normalises and validates them.
3. Supabase stores country, indicator, year and value observations.
4. The browser reads the table through a public read only policy.
5. Offline Node.js trainers build deterministic model artifacts.
6. The static application renders charts, tables and explanations.
7. GitHub Actions repeats the refresh monthly and fails loudly when validation fails.

Measurement, modelling and narration stay separate. Statistical code produces numbers. The browser renders them. An LLM may explain supplied facts, but it never generates a projection.

## Pages and keyboard shortcuts

| Page | Route | Key | Purpose |
|---|---|---:|---|
| Overview | `#overview` | `O` | G20 metrics, rankings, risk register and projected median growth tile |
| Outlook 2026-27 | `#projections` | `U` | Two year headline outlook, five year fan chart, scenarios, league table and reliability panel |
| Countries | `#countries` | `C` | Browse the 19 countries and the EU aggregate |
| Country profile | `#country/IND` | none | Country data, historical charts, outlook strip and comparative standing |
| Prosperity | `#prosperity` | `R` | GDP per capita PPP and growth comparison |
| AI Economy | `#ai-economy` | `A` | AI readiness, exposure and trajectory analysis |
| Compare | `#compare` | `P` | Compare up to six countries across indicators |
| Risk flags | `#flags` | `F` | Rule based macroeconomic warning screens |
| News | `#news` | `N` | Filtered economic headlines |
| About | `#about` | `I` | Sources, audit, projection methodology, backtest table and limits |

The interface supports light and dark themes, Present mode, a mobile navigation rail, 390 px layouts without page level horizontal overflow, source labels and explicit data vintages.

## Projection engine

The trainer lives in [`sync/train-projections.js`](sync/train-projections.js). It is a zero dependency Node.js script using native `fetch`, `fs` and `path` APIs.

### Coverage

| Key | Indicator | Unit |
|---|---|---|
| `GDP_GROWTH` | Real GDP growth | Annual percentage change |
| `INFLATION` | CPI inflation | Annual percentage change |
| `UNEMPLOYMENT` | Unemployment | Percentage of labour force |
| `DEBT_GDP` | Government debt | Percentage of GDP |
| `FISCAL_BAL` | Fiscal balance | Percentage of GDP |
| `CURRENT_ACC` | Current account | Percentage of GDP |

The model is trained across 19 countries. The EU remains a G20 member in the product, but is excluded from modelling and aggregation because several EU member states are already in the country panel.

The output also includes a G20 median and OECD aggregate growth where the OECD Economic Outlook publishes a value.

### Candidate methods

Every indicator and horizon is fitted directly. Five year output does not recursively feed prior projections back into the model.

1. **Naive last value baseline.** Carries the latest observation forward.
2. **Damped trend baseline.** Extends recent movement with a fading trend.
3. **Mean reversion baseline.** Moves the latest value towards a rolling long run anchor.
4. **Pooled ridge regression.** Fits a regularised panel model across the 19 countries separately for each horizon.
5. **Debt dynamics identity.** Reconciles debt with projected growth, fiscal balance and a documented interest rate assumption.

The ridge feature vector contains the target indicator level, its one year lag, one year momentum, the other five headline indicators, and the yield curve term spread where available.

Missing predictors are mean imputed inside each rolling training window. Outcomes are never imputed. This prevents future test information leaking into model training.

### Model selection rule

Rolling origin predictions are collected for all eligible country years. Mean absolute error is calculated for each candidate and the naive baseline. A candidate is shipped only if it beats naive out of sample. Otherwise:

- `noSkill` is `true`
- `status` is `no skill, showing baseline`
- `shippedMethod` is `naive last value baseline`
- the reliability panel says `Baseline only`

This is executable behaviour, asserted in `tests/projections.test.cjs`.

### Rolling origin validation

The backtest uses an expanding window:

1. Train only on observations before an origin year.
2. Predict the target horizon for every eligible country.
3. Advance the origin year and repeat.
4. Pool the resulting out of sample errors.

The artifact reports MAE, RMSE, naive MAE and RMSE, percentage skill, empirical 80% interval coverage, and error results excluding the 2020 and 2022 shocks.

### Uncertainty ranges

Intervals use observed out of sample residual quantiles, not a Gaussian assumption.

- `p25` to `p75` is the central 50% range
- `p10` to `p90` is the central 80% range

Quantiles are computed separately for every indicator and horizon. The central point is kept inside both bands. The UI never presents a projection without its range and vintage.

### Debt identity

Country debt paths use:

```text
Debt(t+1) = Debt(t) × (1 + interest rate) / (1 + real growth) - fiscal balance
```

The current interest rate assumption is 3%. Growth and fiscal balance come from their selected projection paths. Identity inputs are stored on every country debt row so tests can reproduce the calculation.

This is a simplified identity. It uses the available fiscal balance measure, not a reconstructed primary balance. That limitation is disclosed rather than hidden.

### Determinism and output gates

For a fixed panel and generated date, the trainer returns identical output. It exits nonzero when:

- the schema is invalid
- a point or interval contains a non finite value
- interval quantiles are out of order
- historical coverage is insufficient
- a headline horizon is more than 25% worse than naive

No skill models fall back to the naive path, so the artifact does not overstate predictive ability.

## Current backtest results

Skill is the reduction in MAE relative to carrying the last value forward.

| Indicator | H1 | H2 | H3 | H4 | H5 | Practical reading |
|---|---:|---:|---:|---:|---:|---|
| Real GDP growth | 11.1% | 24.9% | 28.0% | 27.0% | 24.2% | Genuine measured skill at every horizon |
| CPI inflation | 2.2% | Baseline | Baseline | Baseline | Baseline | Modest one year skill only |
| Unemployment | Baseline | Baseline | Baseline | Baseline | Baseline | Persistence is difficult to beat in this panel |
| Government debt | Identity | Identity | Identity | Identity | Identity | Accounting consistency instead of an unconstrained path |
| Fiscal balance | 7.7% | 14.4% | 20.4% | 23.0% | 24.1% | Genuine measured skill at every horizon |
| Current account | Baseline | 2.5% | Baseline | 5.9% | 8.3% | Limited and horizon dependent skill |

One year error and coverage:

| Indicator | Shipped MAE | Naive MAE | 80% coverage |
|---|---:|---:|---:|
| Real GDP growth | 2.55 points | 2.87 points | 79.6% |
| CPI inflation | 2.97 points | 3.04 points | 80.0% |
| Unemployment | 0.63 points | 0.63 points | 80.8% |
| Government debt statistical screen | 4.07 points | 4.07 points | 79.9% |
| Fiscal balance | 1.68 points | 1.82 points | 79.6% |
| Current account | 1.50 points | 1.50 points | 80.2% |

The complete 30 row table, including RMSE and shock excluded results, is stored in `app/projections.json` and rendered automatically on the About page. Frontend copy must not hardcode it.

## Scenario layer

Scenarios are deterministic adjustments to the central path. They are illustrative assumptions, not forecasts or causal estimates.

### Global slowdown

- growth effect: `-shock × trade openness / 60`
- trade scale bounded between `0.5` and `1.5`
- unemployment effect: `+0.35 × shock`

### Energy or commodity price shock

| Economy | Inflation | Growth | Current account |
|---|---:|---:|---:|
| Importer | `+0.60 × shock` | `-0.15 × shock` | `-0.25 × shock` |
| Exporter | `+0.15 × shock` | `+0.15 × shock` | `+0.25 × shock` |

The explicit exporter group is Australia, Brazil, Canada, Indonesia, Russia, Saudi Arabia and South Africa.

### Rates increase

- control unit: basis points
- debt and fiscal effects scale with the debt ratio
- higher debt countries receive a larger adjustment

### AI productivity upside

- control unit: percentage point maximum uplift
- growth effect scales to AI Trajectory Index readiness
- unemployment falls by `0.15 × realised growth uplift`

Scenario coefficients, units and assumption source labels are included in the JSON artifact.

## Ask AI and numerical safety

The product has two question answering paths.

### Local data engine

`app/components/insights.js` handles common factual questions without an API key. Projection questions load `projections.json` and return the requested country, indicator, year, point, range, vintage, method, MAE and skill status.

For example, “what is the projected growth for India in 2027 and how uncertain is it” is answered locally from the committed artifact.

### LLM analyst

Open ended questions go to `POST /api/agent`. It supports Gemini when `GEMINI_API_KEY` is set, Anthropic when `ANTHROPIC_API_KEY` is set, and the local engine as a graceful fallback.

The system prompt requires the model to use only supplied numbers and say when a figure is unavailable. Projection context includes intervals and backtest skill. The LLM explains output; it does not calculate projections.

## Data sources and coverage

| Source | Data used |
|---|---|
| [World Bank Open Data](https://data.worldbank.org) | GDP, growth, inflation, unemployment, current account, population and structural indicators |
| [IMF DataMapper and WEO](https://www.imf.org/external/datamapper) | Debt, fiscal balance and source comparisons |
| [OECD Data Explorer](https://data-explorer.oecd.org) | R&D, quarterly accounts and OECD aggregate growth |
| [FRED](https://fred.stlouisfed.org) | Yield curve spread and selected quarterly US series |
| [AI Trajectory Index](https://ai-trajectory-index.vercel.app) | AI readiness, exposure and trajectory data |

### Indicator catalogue

Exact keys are defined in `app/config.js`.

| Key | Indicator | Main source |
|---|---|---|
| `GDP` | GDP, current USD | World Bank |
| `GDP_GROWTH` | Real GDP growth | World Bank and IMF |
| `INFLATION` | CPI inflation | World Bank and IMF |
| `UNEMPLOYMENT` | Unemployment | World Bank and ILO |
| `DEBT_GDP` | Government debt to GDP | IMF |
| `CURRENT_ACC` | Current account to GDP | World Bank |
| `GDP_CAPITA` | GDP per capita | World Bank |
| `CO2_CAPITA` | CO2 per capita | World Bank and EDGAR |
| `TRADE_GDP` | Trade openness | World Bank |
| `POPULATION` | Population | World Bank |
| `HEALTH_EXP` | Health spending | World Bank and WHO |
| `RD_EXP` | R&D spending | OECD and World Bank |
| `GINI` | Gini index | World Bank |
| `YOUTH_UNEMP` | Youth unemployment | World Bank and ILO |
| `CAPITAL_FORM` | Capital formation | World Bank |
| `FDI_INFLOWS` | FDI inflows | World Bank |
| `EDUC_EXP` | Education spending | World Bank and UNESCO |
| `EXPORTS_GDP` | Exports to GDP | World Bank |
| `TAX_REVENUE` | Tax revenue to GDP | World Bank and IMF GFS |
| `MANUFACTURING` | Manufacturing value added | World Bank |
| `FISCAL_BAL` | Fiscal balance to GDP | IMF |
| `LIFE_EXPECT` | Life expectancy | World Bank |
| `FEMALE_LFP` | Female labour force participation | World Bank |
| `GDP_CAPITA_PPP` | GDP per capita PPP | World Bank |
| `RESEARCHERS` | Researchers per million | World Bank and OECD |

`app/data.js` builds:

```text
G20_DATA[iso3][indicatorKey][year] = value
G20_DATA._latest[iso3][indicatorKey] = { value, year }
```

Latest values are capped at 2025 so future IMF observations cannot silently appear as actual current data. Historical and projected lines use separate visual styles.

### Accuracy audit

- 531 of 531 checked IMF values match IMF DataMapper
- 53 of 57 checked World Bank growth values agree within 0.15 percentage points
- four World Bank and IMF methodology differences are disclosed
- public database access is verified as read only
- scheduled refreshes verify their own write timestamps

## Architecture and data flow

```text
World Bank / IMF / OECD / FRED
              │
              ▼
        sync/seed.js
              │ service role writes
              ▼
     Supabase PostgreSQL
              │ public read only REST
              ▼
          app/data.js
              │
       ┌──────┴────────┐
       ▼               ▼
Static dashboard   Offline trainers
components/*.js    train-forecast.js
                   train-projections.js
                           │
                           ▼
                  versioned artifacts
                           │
                           ▼
                   charts and AI context
```

### Browser

- `app/index.html` is the SPA shell.
- `app/config.js` defines countries, indicators, thresholds and navigation.
- `app/data.js` loads and indexes Supabase data.
- `app/main.js` owns hash routing, navigation, Present mode and Ask AI.
- components return markup and mount Chart.js after routing.
- `app/styles/main.css` holds tokens and responsive rules.
- projections are lazy loaded when their route or summary cards need them.

### Backend

Vercel Functions provide status, news, source proxies and the optional AI analyst. The browser reads economic data directly from Supabase through its publishable read only key.

### Why static model artifacts

Offline artifacts make output deterministic, remove fitting latency, allow whole artifact tests, preserve vintages and keep numerical generation separate from LLM narration.

## Run and operate the project

### Requirements

- Node.js 18 or later; Node.js 22 recommended
- a modern browser
- no frontend build step

### Local development

```bash
git clone https://github.com/ankitmishra01/g20-economic-dashboard.git
cd g20-economic-dashboard
npx vercel dev
```

Open `http://localhost:3000`. The public Supabase key is intentionally committed and read only.

A static server works for frontend pages, but `/api/news`, `/api/status` and `/api/agent` require Vercel Functions:

```bash
python3 -m http.server 4173 --directory app
```

### Regenerate projections

```bash
node sync/train-projections.js
```

Expected outputs:

- 30 backtest rows in the terminal
- `app/projections.json`
- an updated date in `app/projection-history.json`

Optional read only overrides:

```bash
SUPABASE_URL=https://example.supabase.co \
SUPABASE_PUBLISHABLE_KEY=sb_publishable_example \
node sync/train-projections.js
```

The one year model is refreshed separately:

```bash
node sync/fetch-term-spread.js
node sync/train-forecast.js
```

### Refresh Supabase

Writes require server credentials:

```bash
SUPABASE_URL=https://example.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=sb_secret_example \
FRED_API_KEY=example \
node sync/seed.js
```

The seed validates the credential, fetches sources, normalises identifiers, checks ranges, timestamps payloads, upserts rows and writes `sync/report.json`.

Never expose the service role key in frontend code, committed environment files or public Vercel variables.

## Testing and validation

### Automated tests

```bash
node --test tests/*.test.cjs
```

The suite covers schema, interval order, finite values, baseline fallback, debt identity, zero shock identity, deterministic training, automation wiring, refresh credentials, ingestion contracts and read only RLS policies.

### Parse all JavaScript

```bash
find app api sync -name '*.js' -print0 | xargs -0 -n1 node --check
```

### Artifact size

```bash
wc -c app/projections.json
```

The target is below about 300 KB. The current artifact is about 134 KB.

### Browser acceptance

Verify:

1. `#projections` renders the outlook and both charts.
2. `#overview` shows projected median growth.
3. `#country/IND` shows the 2026 to 2028 outlook.
4. Present mode resizes without clipping.
5. 390 px has no page level horizontal overflow.
6. every projection shows a range and vintage.
7. zero scenario controls reproduce baseline.
8. the console has no application errors.
9. Ask AI answers the India 2027 question from local facts.

## Automation and deployment

### Monthly workflow

`.github/workflows/refresh.yml` runs at 06:00 UTC on the first day of each month and can be dispatched manually.

It seeds Supabase, refreshes the term spread, retrains both forecast systems, verifies a recent database write, commits generated artifacts, uploads the validation report and opens an issue on failure.

Committed generated files:

```text
app/term-spread.js
app/forecast-model.js
app/forecast-history.json
app/projections.json
app/projection-history.json
```

A failed projection gate exits before the artifact commit.

### Vercel CLI deployment

```bash
vercel login
vercel link --yes --project g20 --scope ankitmishra01s-projects
vercel pull --yes --environment production --scope ankitmishra01s-projects
vercel build --yes --target production --scope ankitmishra01s-projects
vercel deploy --prebuilt --prod --scope ankitmishra01s-projects
```

Verify production:

```bash
curl -I https://g20-gamma.vercel.app/projections.json
curl -sS https://g20-gamma.vercel.app/projections.json | node -e \
  "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const x=JSON.parse(s);console.log(x.schemaVersion,x.generatedDate,x.projections.length)})"
```

### Environment variables

| Variable | Used by | Required | Exposure |
|---|---|---:|---|
| `SUPABASE_URL` | seed and trainers | Optional with committed default | Public URL |
| `SUPABASE_PUBLISHABLE_KEY` | browser and trainers | Optional with committed default | Public and read only |
| `SUPABASE_SERVICE_ROLE_KEY` | database refresh | Yes for writes | Secret |
| `FRED_API_KEY` | source refresh | Required for FRED refresh | Secret |
| `GEMINI_API_KEY` | `/api/agent` | Optional | Secret |
| `ANTHROPIC_API_KEY` | `/api/agent` | Optional fallback | Secret |
| `AI_MODEL` | `/api/agent` | Optional | Model identifier |

## API reference

| Route | Method | Purpose |
|---|---|---|
| `/api/status` | GET | Data freshness, counts and coverage metadata |
| `/api/news` | GET | Filtered and deduplicated economic RSS stories |
| `/api/agent` | POST | Optional Gemini or Claude analysis using supplied context |
| `/api/wb` | GET | World Bank proxy for pipeline workflows |
| `/api/imf` | GET | IMF DataMapper proxy for pipeline workflows |

`POST /api/agent` accepts:

```json
{
  "question": "What is the projected growth for India in 2027?",
  "context": "Economic and projection facts assembled by the browser"
}
```

It validates input length, applies timeouts, tries configured providers and never receives database write credentials.

## Generated artifact reference

### `app/projections.json`

| Field | Meaning |
|---|---|
| `schemaVersion` | Contract version, currently `1` |
| `generatedDate` | Trainer run date |
| `dataVintage` | Latest source fetch date |
| `projectionOriginYear` | Last common observed year |
| `coverage` | Modelled population and EU treatment |
| `indicators` | Six ordered indicator keys |
| `horizons` | `[1, 2, 3, 4, 5]` |
| `methods` | Shipped method by indicator and horizon |
| `features` | Human readable model inputs |
| `missingData` | Missing predictor policy |
| `trainingWindow` | Historical training window |
| `uncertainty` | Interval construction |
| `projections` | Country and aggregate point and interval rows |
| `backtest` | Metrics and skill status |
| `scenarios` | Coefficients, units and source labels |
| `limits` | Modelling limitations |

Projection row shape:

```json
{
  "iso3": "IND",
  "indicator": "GDP_GROWTH",
  "year": 2027,
  "horizon": 2,
  "p10": 1.1,
  "p25": 3.5,
  "point": 5.1,
  "p75": 6.8,
  "p90": 8.6,
  "method": "pooled ridge regression with direct multi horizon fits",
  "isProjection": true
}
```

Values change with each vintage. Consumers must read the artifact rather than hardcode them.

### `app/projection-history.json`

Stores up to 24 dated vintages. A rerun on the same date replaces that date instead of duplicating it.

### Existing forecast artifacts

`app/forecast-model.js` and `app/forecast-history.json` contain the separate one year growth and recession system used by the forecast strip.

## Project structure

```text
.
├── app/
│   ├── index.html                    SPA shell
│   ├── config.js                     Countries, indicators and navigation
│   ├── data.js                       Supabase loader and browser data API
│   ├── main.js                       Router, themes, Present mode and Ask AI
│   ├── styles/main.css               Tokens and responsive layout
│   ├── projections.json              Current projection artifact
│   ├── projection-history.json       Dated projection vintages
│   ├── forecast-model.js             Existing one year model
│   ├── term-spread.js                Generated yield curve history
│   ├── oecd-aggregate.json           OECD aggregate growth
│   └── components/
│       ├── about.js                  Sources, audit and methodology host
│       ├── ai-economy.js             AI readiness analysis
│       ├── atoms.js                  Formatting and escaping helpers
│       ├── commentary.js             Country research briefs
│       ├── compare.js                Multi-country comparison
│       ├── country.js                Country list and profiles
│       ├── flags.js                  Risk flags
│       ├── forecast.js               Existing one year inference UI
│       ├── insights.js               Local question engine
│       ├── news.js                   News page
│       ├── overview.js               Overview and outlook tile
│       ├── projections.js            Outlook, scenarios and projection Q&A
│       └── prosperity.js             Prosperity comparison
├── api/                              Vercel Functions
├── sync/
│   ├── seed.js                       Source ingestion and Supabase writes
│   ├── refresh-utils.js              Credential and timestamp checks
│   ├── fetch-term-spread.js          FRED term spread refresh
│   ├── train-forecast.js             Existing one year trainer
│   ├── train-projections.js          Six indicator projection trainer
│   ├── report.json                   Data validation report
│   └── schema.sql                    Canonical Supabase schema
├── supabase/migrations/              RLS migrations
├── tests/                            Node.js contract tests
├── .github/workflows/                Refresh and keepalive automation
└── vercel.json                       Deployment configuration
```

## Security model

### Public reads

The frontend contains a Supabase publishable key. This is expected. It can read only through RLS policies.

### Protected writes

Writes require `SUPABASE_SERVICE_ROLE_KEY`. The refresh utility rejects missing credentials and rejects a publishable key presented as a writer. Canonical schema tests require public select access and deny public insert, update and delete access.

### Browser and AI boundaries

Dynamic external content is escaped through shared helpers. Provider keys stay in Vercel environment variables. `/api/agent` limits inputs, applies timeouts and instructs providers not to invent unsupported numbers.

## Known limits

- The panel contains 19 modelled countries and roughly 25 annual observations per country.
- Annual data cannot capture every short lived shock or policy change.
- Structural breaks can invalidate historical relationships.
- Forward looking policy announcements are not model inputs.
- The debt identity uses an illustrative interest rate and available fiscal balance.
- Commodity classification is fixed, not a live exposure model.
- AI scenario effects are assumptions, not causal estimates.
- IMF DataMapper cannot always be fetched reliably by automation, so the project does not scrape around access blocks.
- Several 2025 observations are estimates rather than final outturns.
- Data refreshes monthly and is not a market feed.
- Projections are not financial, investment or policy advice.

## Troubleshooting

### Trainer reports `fetch failed`

Confirm outbound HTTPS and DNS access to Supabase, then rerun `node sync/train-projections.js`.

### `/projections.json` returns HTML

The deployment is missing the artifact and the SPA rewrite returned `index.html`. A correct response has `Content-Type: application/json` and a body near 134 KB.

### Projection route opens Overview

Confirm `components/projections.js`, the nav item and `projections.json` exist in the deployed artifact. Use a fresh browser session or cache busting query while validating a new deployment.

### Vercel requires project settings

```bash
vercel link --yes --project g20 --scope ankitmishra01s-projects
vercel pull --yes --environment production --scope ankitmishra01s-projects
```

### Vercel reports `Not authorized`

```bash
vercel teams ls
vercel whoami --scope ankitmishra01s-projects
vercel login
```

### Static local server reports news JSON errors

A static server does not implement `/api/news`; use `vercel dev` to test backend routes.

### Projection tests fail after a refresh

Inspect the specific schema, interval, finite value, debt identity or baseline gate failure. Do not weaken the gate merely to make automation pass.

## Related project

[AI Trajectory Index](https://github.com/ankitmishra01/ai-trajectory-index) scores 186 countries across infrastructure, talent, governance, investment and economic readiness. This dashboard reads it at runtime for the AI Economy page and country AI outlooks.

## Licences and attribution

- [World Bank Open Data](https://data.worldbank.org), CC BY 4.0
- [IMF DataMapper and WEO](https://www.imf.org/external/datamapper), IMF data terms
- [OECD Data Explorer](https://data-explorer.oecd.org), OECD data terms
- [FRED](https://fred.stlouisfed.org), Federal Reserve Bank of St. Louis
- [FlagCDN](https://flagcdn.com), country flag assets
- project code under the [MIT License](LICENSE)

Built by [Ankit Mishra](https://ankitmishra.ca) with AI coding assistance. Statistical models and deterministic rules produce every numerical projection; language models only help explain supplied facts.
