# G20 Economic Dashboard

A live, interactive economic dashboard covering all G20 member economies — built with vanilla JS, Chart.js, and open government data.

**[Live demo →](https://g20-economic-dashboard-gamma.vercel.app)**

---

## What it does

- **13 economic indicators** per country: GDP, growth, inflation, unemployment, government debt, current account, GDP per capita, trade openness, CO₂ emissions, health spending, R&D investment, Gini inequality index, and population
- **Interactive country profiles** with 10-year trend charts for each indicator
- **Side-by-side comparison** tool — pick any countries and indicator
- **Economic flags** — automatic alerts for high inflation, contracting economies, fiscal stress, and large current account deficits
- **AI analyst** — ask natural-language questions about the data, answered using real numbers from the dataset
- **Live news ticker** — economic headlines from IMF, BBC Business, and Reuters

## Data sources

| Source | Indicators | Update frequency |
|--------|------------|-----------------|
| [World Bank Open Data](https://data.worldbank.org) | GDP, growth, inflation, unemployment, trade, CO₂, health spending, R&D, Gini | Annual |
| [IMF DataMapper](https://www.imf.org/external/datamapper) | Government debt / GDP | Quarterly |
| [OECD MSTI](https://stats.oecd.org) | R&D expenditure (OECD members, supplements WB) | Annual |

Data is stored in [Supabase](https://supabase.com) and refreshed automatically on the 1st of every month via GitHub Actions.

## Tech stack

- **Frontend**: Vanilla JS, HTML/CSS — no build step, no framework
- **Charts**: [Chart.js](https://www.chartjs.org/) v4
- **Hosting**: [Vercel](https://vercel.com) (static + serverless functions)
- **Database**: [Supabase](https://supabase.com) (PostgreSQL with REST API)
- **AI**: [Claude](https://anthropic.com) (`claude-sonnet-4-6`) via Anthropic API
- **CI/CD**: GitHub Actions — monthly data refresh cron

## Architecture

```
Browser
  └── app/index.html        # Single-page app shell
  └── app/data.js           # Supabase REST client, data indexing
  └── app/components/       # Page renderers (overview, country, compare, flags, news)
  └── app/main.js           # Router, sidebar, news ticker, AI drawer

Vercel Serverless Functions
  └── api/agent.js          # Claude AI proxy
  └── api/news.js           # RSS aggregator (IMF, BBC, Reuters)
  └── api/status.js         # Data quality health endpoint
  └── api/wb.js / imf.js    # Debug proxies for raw data

GitHub Actions (monthly)
  └── sync/seed.js          # Fetches WB + IMF + OECD → upserts to Supabase
```

## Running locally

No npm install required. Node 18+ needed for native fetch.

```bash
# Clone
git clone https://github.com/ankitmishra01/g20-economic-dashboard.git
cd g20-economic-dashboard

# Serve the frontend (any static server works)
npx serve app

# Re-seed the database (needs Supabase credentials)
SUPABASE_URL=... SUPABASE_KEY=... node sync/seed.js
```

## Data quality

Check `/api/status` for a live health report:

```bash
curl https://g20-economic-dashboard-gamma.vercel.app/api/status
```

Returns coverage, latest year, and missing countries per indicator. The seed script also prints a full quality report and writes `sync/report.json` after each run.

## Deployment

Deployed on Vercel under the `ankit-mishras-projects-d1fd7f8e` team. Auto-deploys on push to `main`.

GitHub Actions secrets required (`Settings → Secrets → Actions`):
- `SUPABASE_URL`
- `SUPABASE_KEY`
