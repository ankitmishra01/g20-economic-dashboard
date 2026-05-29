# G20 Economic Monitor

A live economic dashboard for all G20 member economies, built with vanilla JavaScript and deployed on Vercel. Data is sourced from World Bank Open Data, IMF DataMapper, and OECD MSTI — refreshed automatically every month via GitHub Actions.

**[Live demo →](https://g20-economic-dashboard-gamma.vercel.app)**

![status](https://img.shields.io/badge/status-live-brightgreen) ![refresh](https://img.shields.io/badge/refresh-monthly-blue) ![deploy](https://img.shields.io/badge/deployed%20on-Vercel-black)

---

## Features

- **Overview** — aggregate G20 stats, GDP growth bars, inflation rankings, 10-year sparklines, and a risk register (contracting economies, inflation outliers, fiscal stress flags)
- **G20 Outlook** — OECD-style editorial with five-paragraph analysis, key downside risks, and upside factors drawn from 2024 actuals
- **Country profiles** — per-economy hero stats, four Chart.js trend charts (GDP, growth, CPI, unemployment), vs-G20-median comparison bars, and pre-written 4-paragraph research briefs for all 19 non-EU members
- **Compare** — side-by-side line and bar charts for up to 6 countries across any indicator
- **Risk flags** — automated severity tagging (high / medium / low) for every G20 economy based on latest data
- **News feed** — live global economy headlines from RSS feeds, filterable by source
- **AI analyst** — ask any question about G20 data; answers are grounded in the live Supabase dataset via Claude
- **Analyst commentary blocks** — edit or save your own notes per country, persisted in localStorage; pre-seeded with research-grade prose

---

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | Vanilla JS, HTML, CSS — no framework, no build step |
| Fonts | Geist Sans + Geist Mono (via CDN `@font-face`) |
| Charts | Chart.js v4 (trend charts), SVG sparklines (overview) |
| Backend | Vercel serverless functions (Node.js) |
| Database | Supabase (PostgreSQL), ~6,300 rows across 13 indicators |
| Data sources | World Bank Open Data · IMF DataMapper · OECD MSTI |
| News | RSS feeds via `rss-parser` |
| AI | Anthropic Claude API (agent endpoint) |
| CI/CD | GitHub Actions — monthly cron + Vercel auto-deploy on push |

---

## Data

13 economic indicators are tracked for all G20 members:

| Indicator | Source | Notes |
|---|---|---|
| GDP (current USD) | World Bank | Annual |
| Real GDP growth (%) | World Bank | Annual YoY |
| CPI inflation (%) | World Bank | Annual |
| Unemployment (%) | World Bank | Annual |
| Current account (% GDP) | World Bank | Annual |
| GDP per capita (USD) | World Bank | Annual |
| CO₂ per capita (t) | World Bank | Annual |
| Trade openness (% GDP) | World Bank | Annual |
| Population | World Bank | Annual |
| Health expenditure (% GDP) | World Bank | Annual |
| R&D expenditure (% GDP) | OECD MSTI | Annual |
| Gross government debt (% GDP) | IMF DataMapper | Capped at 2024 actuals |
| Gini coefficient | World Bank | Periodic |

Data is loaded from Supabase in a single paginated REST call on page load, then indexed client-side for instant lookups. The `_latest` index is capped at 2024 to prevent IMF multi-year forecasts (through 2031) from appearing as current data.

---

## API routes

| Route | Description |
|---|---|
| `GET /api/status` | Data quality report — row counts, latest year per indicator, coverage gaps |
| `GET /api/news` | Aggregated RSS headlines (BBC, FT, Reuters, etc.) |
| `POST /api/agent` | AI Q&A — accepts `{ question, context }`, returns Claude response |
| `GET /api/wb` | World Bank proxy (used during seed only) |
| `GET /api/imf` | IMF DataMapper proxy (used during seed only) |

---

## Data refresh

A GitHub Actions workflow re-seeds Supabase on the **1st of every month at 06:00 UTC** and can be triggered manually from the Actions tab.

The seed script (`sync/seed.js`) fetches all indicators from World Bank and IMF APIs, upserts into Supabase, then prints a validation report checking coverage (≥17/19 countries per indicator) and value plausibility ranges. The report is uploaded as a downloadable Actions artifact.

**Required GitHub secrets** (Settings → Secrets → Actions):
- `SUPABASE_URL`
- `SUPABASE_KEY`

---

## Running locally

No build step required.

```bash
# Install Vercel CLI (one time)
npm i -g vercel

# Clone and run
git clone https://github.com/ankitmishra01/g20-economic-dashboard.git
cd g20-economic-dashboard
vercel dev
```

Open `http://localhost:3000`. The app reads from the shared Supabase instance using a publishable read-only key.

To re-seed the database:

```bash
SUPABASE_URL=... SUPABASE_KEY=... node sync/seed.js
```

---

## Project structure

```
├── app/                        # Static frontend (Vercel output directory)
│   ├── index.html              # Single-page shell — all routing in main.js
│   ├── config.js               # G20 country list, indicator definitions, risk thresholds
│   ├── data.js                 # Supabase client — loads all rows, exposes G20Data API
│   ├── main.js                 # Router, rail nav, keyboard shortcuts, agent drawer
│   ├── styles/main.css         # Design tokens, layout, all component styles
│   └── components/
│       ├── overview.js         # Overview page + global outlook editorial
│       ├── country.js          # Country grid + profile page + Chart.js charts
│       ├── compare.js          # Multi-country comparison charts
│       ├── flags.js            # Risk flags view
│       ├── news.js             # News feed
│       ├── commentary.js       # Pre-written research briefs for all 19 economies
│       ├── atoms.js            # XSS escape helpers, shared utilities
│       └── motion.js           # Page transition animations
├── api/                        # Vercel serverless functions
│   ├── agent.js                # Claude AI Q&A endpoint
│   ├── news.js                 # RSS aggregator
│   ├── status.js               # Data quality health check
│   ├── wb.js                   # World Bank proxy
│   └── imf.js                  # IMF DataMapper proxy
├── sync/
│   ├── seed.js                 # Data pipeline: WB + IMF APIs → Supabase
│   └── schema.sql              # Supabase table definition
├── .github/workflows/
│   └── refresh.yml             # Monthly data refresh cron
└── vercel.json                 # URL rewrites + CORS headers
```

---

## Data sources & licences

- [World Bank Open Data](https://data.worldbank.org) — CC BY 4.0
- [IMF DataMapper](https://www.imf.org/external/datamapper) — IMF open data
- [OECD MSTI](https://stats.oecd.org) — OECD open data
- [flagcdn.com](https://flagcdn.com) — flag SVGs

---

*Built with [Claude](https://claude.ai) · [Live dashboard](https://g20-economic-dashboard-gamma.vercel.app)*
