# G20 Economic Monitor

A live economic intelligence dashboard for all G20 member economies. Tracks 25 macroeconomic indicators, IMF forward projections, AI readiness scores, and workforce displacement risk — refreshed automatically every month via GitHub Actions.

**[Live demo →](https://g20-gamma.vercel.app)**

![status](https://img.shields.io/badge/status-live-brightgreen) ![refresh](https://img.shields.io/badge/refresh-monthly-blue) ![deploy](https://img.shields.io/badge/deployed%20on-Vercel-black)

---

## The problem, how AI was used, and what it delivers

**The problem.** G20 macro data lives in three places (World Bank, IMF, OECD) with different formats, update cycles and definitions, so comparing economies means hours of manual collection and cleaning, and errors go unnoticed.

**What this does.** One live dashboard, refreshed monthly by an automated pipeline, with country profiles, rankings, a risk register, IMF projections and a plain-English analyst you can question.

**How AI was used.**
- *To build it:* the dashboard, data pipeline and tests were built with AI coding assistants, with every number checked by hand against the source (see the audit below).
- *Inside the product:* the Ask AI drawer routes factual questions (rankings, comparisons) to a local, rule-based data engine and open-ended questions ("why", "what if") to an LLM (Gemini or Claude) that is given the live data snapshot as context. If the LLM is unavailable, the data engine answers instead.

**Accuracy audit and security.** About 590 stored values were spot-checked against IMF and World Bank sources; a US inflation series stored as an index level was corrected to a year-on-year rate. The database is read-only for the public: write access is restricted with row-level security (`supabase/migrations/20260916021414_restrict_public_writes.sql`) and covered by tests (`tests/schema-policy.test.cjs`, `tests/refresh-contract.test.cjs`). The refresh pipeline verifies its own writes and opens an issue on failure.

**AI provider setup.** Set one of `GEMINI_API_KEY` (free tier from Google AI Studio) or `ANTHROPIC_API_KEY` in the Vercel project environment variables; optionally `AI_MODEL` to override the model id. With no key set, the Ask AI drawer falls back to the data engine.

---

## Pages

| Page | Key | Description |
|---|---|---|
| **Overview** | `O` | Aggregate G20 stats, GDP growth bars, inflation rankings, recession risk scores, 10-year sparklines, and automated risk register |
| **Countries** | `C` | All 19 G20 economies with per-country profiles |
| **Prosperity** | `R` | GDP per capita PPP vs growth bubble chart — population-scaled, region-coloured, quadrant analysis |
| **AI Economy** | `A` | AI readiness rankings, 2028 trajectory projections, displacement risk scatter, AI vs GDP growth correlation |
| **Compare** | `P` | Side-by-side line and bar charts for up to 6 countries across any indicator |
| **Risk Flags** | `F` | Automated severity tagging across 7 macroeconomic risk criteria |
| **News** | `N` | Live global economy headlines from RSS feeds |

---

## Features

### Multi year projection engine

The `#projections` route presents a 2026 to 2027 headline outlook and five year paths for real GDP growth, CPI inflation, unemployment, government debt, fiscal balance and the current account. It covers the 19 G20 countries, a G20 median and OECD aggregate growth. The EU remains a G20 member in the dashboard but is excluded from modelling and aggregation to avoid double counting.

Each indicator and horizon compares a naive last value baseline, damped trend, mean reversion and pooled ridge regression with direct multi horizon fits. A rolling origin backtest selects the lowest error method only when it beats the naive baseline. Otherwise the artifact explicitly records `no skill, showing baseline`. Debt follows a debt dynamics identity using projected growth and fiscal balance with a documented 3% interest rate assumption.

The 50% and 80% ranges are empirical out of sample residual quantiles, not Gaussian confidence intervals. `app/projections.json` stores MAE, RMSE, skill versus naive and interval coverage for every indicator and horizon, both with and without the 2020 and 2022 shocks. The generated About table reads these values from the same artifact, preventing methodology text from drifting from results.

Scenarios are illustrative assumptions layered on the central paths: a trade openness scaled global slowdown, differentiated commodity importer and exporter effects, a rates shock scaled to debt, and an AI productivity uplift scaled to readiness. No LLM produces any projected number. The Ask AI feature receives stored projection facts, ranges and backtest skill only for explanation.

Run `node sync/train-projections.js` to regenerate `app/projections.json` and append the dated archive in `app/projection-history.json`. The monthly workflow runs the trainer after data refresh and fails before committing if schema validation or the headline backtest gate fails.

### Macroeconomic tracking
- **25 indicators** per economy — GDP, growth, inflation, unemployment, debt, current account, fiscal balance, trade, FDI, R&D, health, education, CO₂, manufacturing, capital formation, life expectancy, female labour force participation, youth unemployment, and more
- **IMF forward projections** — dashed forecast lines (2026–2028) on country trend charts, sourced from IMF World Economic Outlook data already in the database
- **Recession risk score** — composite 0–100 signal per country derived from 7 signals (growth trend, fiscal deficit, debt trajectory, current account, unemployment, inflation, momentum decline); rendered as colour-coded pill on the overview table
- **Quarterly data** — OECD QNA and FRED data provide quarterly GDP growth and inflation readings for select G20 members, preferred over annual figures where more recent

### AI Economy (integrated with AI Trajectory Index)
- **AI Readiness Rankings** — stacked bar chart across 5 dimensions (Infrastructure, Talent, Governance, Investment, Economic Readiness) sourced from the [AI Trajectory Index](https://ai-trajectory-index.vercel.app)
- **2028 Trajectory** — projected score change per country with a risers/fallers table; India leads (+8 pts), Russia is the only decliner (−5 pts)
- **Displacement vs Readiness scatter** — x-axis = IMF AI labor exposure %, y-axis = AI readiness score, bubble size = GDP per capita PPP; quadrant zones (Risk Zone / Managed / Insulated / Transitioning) drawn directly on canvas
- **AI Score vs GDP Growth** — scatter with linear regression line; mild positive correlation reflects the current infrastructure phase of AI adoption
- **Country profile AI Outlook card** — 5-dimension inline bar breakdown, trajectory arrow, and link to the full AI Trajectory Index country report

### Country profiles
- Hero stats (GDP, growth, CPI, unemployment, debt) with vintage dates
- Four Chart.js trend charts: GDP, growth, CPI, unemployment — historical lines plus dashed IMF forecasts
- vs-G20-median comparison bars across 11 indicators
- OECD-style 4-paragraph research brief for all 19 non-EU members
- AI Outlook card powered by AI Trajectory Index

### AI agent
- Local insight engine answers questions about rankings, fiscal health, regional comparisons, and growth trends without an API key
- Claude API fallback for deeper analysis
- Country-aware context: when on a country profile, the agent receives the country's indicators, IMF projections, recession risk score, and the 3 most relevant live news headlines
- Drawer accessible from any page via the "Ask AI" button

---

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | Vanilla JS, HTML, CSS — no framework, no build step |
| Fonts | Geist Sans + Geist Mono (via CDN) |
| Charts | Chart.js v4 (trend + scatter + bubble charts), custom SVG sparklines |
| Backend | Vercel serverless functions (Node.js) |
| Database | Supabase (PostgreSQL) — ~12,000 rows, 25 indicators |
| Data sources | World Bank Open Data · IMF WEO · OECD MSTI · OECD QNA · FRED |
| AI Economy data | [AI Trajectory Index](https://github.com/ankitmishra01/ai-trajectory-index) — 186 countries, fetched at runtime |
| News | RSS feeds (BBC Business, FT, Reuters) |
| AI | Provider-agnostic `/api/agent`: Google Gemini (free tier, default `gemini-flash-latest`) or Anthropic Claude (`claude-sonnet-4-6`), chosen by which key is set |
| CI/CD | GitHub Actions — monthly cron + Vercel auto-deploy on push |

---

## Data

25 indicators tracked for all G20 members:

| Indicator | Source | Notes |
|---|---|---|
| GDP (current USD) | World Bank | Annual |
| Real GDP growth (%) | World Bank / IMF WEO | Annual + quarterly (OECD/FRED) |
| CPI inflation (%) | World Bank / IMF WEO | Annual + quarterly (FRED for USA) |
| Unemployment (%) | World Bank | Annual |
| Current account (% GDP) | World Bank | Annual |
| Govt debt / GDP (%) | IMF DataMapper | Annual, incl. 2026–2028 projections |
| Fiscal balance (% GDP) | IMF DataMapper | Annual, incl. 2026–2028 projections |
| GDP per capita (USD) | World Bank | Annual |
| GDP per capita PPP (Int'l $) | World Bank | Annual |
| CO₂ per capita (t) | World Bank | Annual |
| Trade openness (% GDP) | World Bank | Annual |
| Health expenditure (% GDP) | World Bank | Annual |
| Education expenditure (% GDP) | World Bank | Annual |
| R&D expenditure (% GDP) | OECD MSTI | Annual |
| Capital formation (% GDP) | World Bank | Annual |
| FDI inflows (% GDP) | World Bank | Annual |
| Exports (% GDP) | World Bank | Annual |
| Tax revenue (% GDP) | World Bank | Annual |
| Manufacturing (% GDP) | World Bank | Annual |
| Population | World Bank | Annual |
| Gini coefficient | World Bank | Periodic |
| Life expectancy (yrs) | World Bank | Annual |
| Female labour force participation (%) | World Bank | Annual |
| Researchers per million pop | World Bank / OECD | Annual |

Data is loaded from Supabase in a single paginated REST call on page load, then indexed client-side for instant lookups. The `_latest` index is capped at 2025; years 2026+ are flagged `isProjection: true` and rendered as dashed forecast lines.

---

## API routes

| Route | Description |
|---|---|
| `GET /api/status` | Data quality report — row counts, latest year per indicator, coverage gaps |
| `GET /api/news` | Aggregated RSS headlines, deduplicated, filtered for economic relevance |
| `POST /api/agent` | AI Q&A — accepts `{ question, context }`, returns Claude response |
| `GET /api/wb` | World Bank proxy (used during seed) |
| `GET /api/imf` | IMF DataMapper proxy (used during seed) |

---

## Data refresh

A GitHub Actions workflow re-seeds Supabase on the **1st of every month at 06:00 UTC**.

The seed script (`sync/seed.js`) fetches all indicators from World Bank, IMF WEO, OECD, and FRED APIs, upserts into Supabase, then prints a validation report checking coverage and value plausibility. The report is uploaded as a workflow artifact.

**Required GitHub secrets:**
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only refresh writer; never expose it in frontend code or a Vercel public variable)
- `SUPABASE_PUBLISHABLE_KEY` (read-only forecast training client)
- `FRED_API_KEY` (for US quarterly data)

---

## Running locally

No build step required.

```bash
npm i -g vercel
git clone https://github.com/ankitmishra01/g20-economic-dashboard.git
cd g20-economic-dashboard
vercel dev
```

Open `http://localhost:3000`. The app reads from the shared Supabase instance using a publishable read-only key.

To re-seed the database:

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... FRED_API_KEY=... node sync/seed.js
```

---

## Project structure

```
├── app/                        # Static frontend (Vercel output directory)
│   ├── index.html              # Single-page shell — all routing in main.js
│   ├── config.js               # G20 registry, 25 indicator definitions, risk thresholds, nav
│   ├── data.js                 # Supabase client — paginated load, G20Data API, projection support
│   ├── main.js                 # Router, rail nav, keyboard shortcuts, news strip, agent drawer
│   ├── styles/main.css         # Design tokens, layout, all component styles
│   └── components/
│       ├── overview.js         # Overview page, growth/inflation bars, recession risk, sparklines
│       ├── country.js          # Country grid + profile + Chart.js charts + AI Outlook card
│       ├── prosperity.js       # GDP per capita PPP vs growth bubble chart + quadrant analysis
│       ├── ai-economy.js       # AI Economy page — AI Trajectory Index integration
│       ├── compare.js          # Multi-country comparison charts
│       ├── flags.js            # Risk flags view
│       ├── news.js             # News feed page
│       ├── insights.js         # Pre-programmed insight engine + recession risk score
│       ├── commentary.js       # OECD-style research briefs for all 19 economies
│       ├── atoms.js            # Formatting helpers, XSS escaping, shared utilities
│       └── motion.js           # Page transition animations
├── api/                        # Vercel serverless functions
│   ├── agent.js                # Claude AI Q&A endpoint
│   ├── news.js                 # RSS aggregator with keyword filtering
│   ├── status.js               # Data quality health check
│   ├── wb.js                   # World Bank proxy
│   └── imf.js                  # IMF DataMapper proxy
├── sync/
│   ├── seed.js                 # Data pipeline: WB + IMF WEO + OECD + FRED → Supabase
│   └── schema.sql              # Supabase table definitions
├── .github/workflows/
│   └── refresh.yml             # Monthly data refresh cron
└── vercel.json                 # URL rewrites + CORS headers
```

---

## Related project

**[AI Trajectory Index](https://github.com/ankitmishra01/ai-trajectory-index)** — a companion project that scores 186 countries across 5 AI readiness dimensions (Infrastructure, Talent, Governance, Investment, Economic Readiness) with 2028 trajectory projections. The AI Economy page in this dashboard fetches that data at runtime and cross-references it against G20 macroeconomic fundamentals.

---

## Data sources & licences

- [World Bank Open Data](https://data.worldbank.org) — CC BY 4.0
- [IMF DataMapper / WEO](https://www.imf.org/external/datamapper) — IMF open data
- [OECD MSTI / QNA](https://stats.oecd.org) — OECD open data
- [FRED](https://fred.stlouisfed.org) — Federal Reserve Bank of St. Louis, public domain
- [AI Trajectory Index](https://ai-trajectory-index.vercel.app) — own project
- [flagcdn.com](https://flagcdn.com) — flag SVGs

---

*Built with [Claude](https://claude.ai) · [Live dashboard](https://g20-gamma.vercel.app) · [AI Trajectory Index](https://ai-trajectory-index.vercel.app)*
