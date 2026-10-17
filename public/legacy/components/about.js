// About page: the problem, how it works, where AI is used, and how the numbers were checked.
// Figures in the audit panel come from the 12 Oct 2026 cross-check against the IMF WEO DataMapper
// and World Bank APIs; update them when the audit is re-run.

function renderAbout() {
  const indicators = Object.keys(window.INDICATORS || {}).length;
  const members = (window.G20_MEMBERS || window.G20 || []).length || 20;
  const economies = (window.COUNTRY_REGISTRY?.countries || []).length || 217;
  const tiers = Object.values(window.COVERAGE_TIERS || {});
  const tierCount = t => tiers.filter(x => x === t).length;
  const tierText = tiers.length ? ` (${tierCount(1)} / ${tierCount(2)} / ${tierCount(3)} economies today)` : '';
  const card = (title, body) => `
    <div class="panel">
      <div class="panel__head"><span class="panel__title">${title}</span></div>
      <div class="panel__body" style="padding:14px 18px;font-size:14px;line-height:1.65;color:var(--text-2)">${body}</div>
    </div>`;
  const step = (n, title, body) => `
    <div class="panel"><div class="panel__body" style="padding:16px 18px">
      <div style="font-family:var(--font-mono);font-size:12px;color:var(--text-4);margin-bottom:6px">STEP ${n}</div>
      <div style="font-weight:600;font-size:15px;color:var(--text-1);margin-bottom:6px">${title}</div>
      <div style="font-size:13.5px;line-height:1.6;color:var(--text-2)">${body}</div>
    </div></div>`;
  const stat = (val, lbl) => `
    <div class="panel"><div class="panel__body" style="padding:14px 16px">
      <div class="kpi-tile__val" style="font-size:30px">${val}</div>
      <div class="kpi-tile__delta" style="font-size:12.5px;line-height:1.45">${lbl}</div>
    </div></div>`;
  const grid = (cols, inner) => `<div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:14px;margin-bottom:26px" class="about-grid">${inner}</div>`;

  return `
<div class="page-body">

  <div class="sec-head">
    <div class="sec-head__title">About this dashboard <span class="sec-head__sub">the problem, the build, the AI, and how the numbers were checked</span></div>
  </div>

  <div class="panel mb-20"><div class="panel__body" style="padding:20px 24px">
    <p style="margin:0 0 12px;font-size:17px;line-height:1.6;color:var(--text-1)">
      Macro data lives in many places, the World Bank, the IMF, the OECD, the BIS and central banks, each with different formats, update cycles and definitions.
      Comparing economies normally means hours of manual collection and cleaning, and errors slip through unnoticed.
    </p>
    <p style="margin:0;font-size:14.5px;line-height:1.7;color:var(--text-2)">
      This monitor does that work once, automatically: ${indicators} indicators for ${economies} economies, with the ${members} G20 members (19 countries and the EU) as the default view,
      refreshed monthly, plus daily policy rates, FX and market reference data, a ranked "What changed" brief, country profiles, rankings, a risk register, IMF projections and a plain-English analyst you can question.
    </p>
  </div></div>

  <div class="sec-head"><div class="sec-head__title">How it works <span class="sec-head__sub">four steps, no manual data entry</span></div></div>
  ${grid(4,
    step(1, 'Open data sources', 'World Bank Open Data, the IMF World Economic Outlook DataMapper, OECD statistics, BIS policy rates, ECB reference rates and FRED, pulled through their public APIs.') +
    step(2, 'Monthly pipeline', 'A scheduled GitHub Actions job fetches, retries on timeouts, and checks that every write landed. It opens an issue if a run fails.') +
    step(3, 'Database', 'Supabase (PostgreSQL) stores about 114,000 country-year values for ${economies} economies; static data files serve them fast. The public key is read-only, enforced by row-level security and covered by tests.') +
    step(4, 'Dashboard and AI', 'A fast single-page app reads the data directly. Questions go to a built-in data engine or, for open-ended ones, to an AI model.'))}

  <div class="sec-head"><div class="sec-head__title">Coverage and freshness <span class="sec-head__sub">what updates when · daily is not real-time</span></div></div>
  <div class="panel mb-20">
    <div class="panel__body" style="padding:0">
      <div class="table-scroll"><table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead>
          <tr style="border-bottom:1px solid var(--rule)">
            <th class="tbl-th">Layer</th>
            <th class="tbl-th">Source</th>
            <th class="tbl-th">Coverage</th>
            <th class="tbl-th">Cadence</th>
          </tr>
        </thead>
        <tbody>
          ${[
            ['Macro indicators (growth, inflation, debt and more)', 'World Bank · IMF WEO DataMapper · OECD', `${economies} economies`, 'Monthly refresh of annual series'],
            ['G20 quarterly growth, US CPI and unemployment', 'OECD QNA · FRED', 'G20 OECD members · United States', 'Monthly refresh'],
            ['Central bank policy rates', 'BIS (WS_CBPOL)', 'About 60 economies, euro area members share the ECB rate', 'Daily file, refreshed every 6 hours on weekdays'],
            ['FX against the US dollar', 'ECB euro reference rates', 'About 30 currencies', 'Daily (one fixing per business day)'],
            ['US 10Y yield, Brent, WTI, broad dollar, VIX', 'FRED (U.S. Treasury, EIA, Federal Reserve, Cboe)', 'Global markets', 'Daily close'],
            ['What changed', 'Computed from the files above', 'Every scope', 'On each refresh; items listed for 14 days'],
          ].map(([layer, src, cov, cad]) => `
            <tr style="border-bottom:1px solid rgba(0,0,0,.04)">
              <td style="padding:7px 14px;color:var(--text-1)">${layer}</td>
              <td style="padding:7px 14px;color:var(--text-2);font-family:var(--font-mono);font-size:11px">${src}</td>
              <td style="padding:7px 14px;color:var(--text-3)">${cov}</td>
              <td style="padding:7px 14px;color:var(--text-3)">${cad}</td>
            </tr>`).join('')}
        </tbody>
      </table></div>
      <div style="padding:12px 16px;font-size:13px;line-height:1.6;color:var(--text-2);border-top:1px solid var(--rule)">
        Coverage tiers on every country: Tier 1 has quarterly or high-frequency series, Tier 2 has the full annual set, Tier 3 has a partial annual set${tierText}.
        Daily figures are official reference series with an "as of" date and a freshness badge (as of, delayed or stale), not tick-by-tick prices.
        Missing values are left blank, never filled in.
      </div>
    </div>
  </div>

  <div class="sec-head"><div class="sec-head__title">Where the AI is <span class="sec-head__sub">two engines, used for what each does best</span></div></div>
  ${grid(2,
    card('Data engine · instant and exact', 'Factual questions such as rankings, comparisons, debt, inflation or a single country are answered by rules running on the loaded dataset. It is instant, needs no key, and cannot invent a number.') +
    card('AI analyst · for open-ended questions', 'Questions like "why" or "what if" go to a large language model (Google Gemini, with Claude supported) together with a live snapshot of the data. Statistical models, not the language model, produce every projection. The language model can only explain projection values, ranges and backtest results supplied in its context.'))}

  <div id="projection-methodology"><div class="loading-spinner"><div class="spinner"></div><span>Loading projection methodology…</span></div></div>

  <div class="sec-head"><div class="sec-head__title">How the numbers were checked <span class="sec-head__sub">audited 12 October 2026</span></div></div>
  ${grid(4,
    stat('531 / 531', 'values for GDP, growth, inflation, debt, unemployment, current account and fiscal balance (2022 to 2025) match the IMF DataMapper') +
    stat('53 / 57', 'World Bank growth figures agree within 0.15 points. Four differ: Australia 2023 to 2025 and France 2023, from IMF and World Bank methodology') +
    stat('Read-only', 'public access cannot write to the database; the rule is enforced in the database and tested') +
    stat('Self-checking', 'the monthly refresh verifies its own writes and raises an issue on failure'))}

  <div class="sec-head"><div class="sec-head__title">Known limits <span class="sec-head__sub">stated plainly</span></div></div>
  <div class="panel mb-20"><div class="panel__body" style="padding:14px 20px;font-size:14px;line-height:1.75;color:var(--text-2)">
    Latest values are capped at ${window.LATEST_ACTUAL_YEAR}, and several ${window.LATEST_ACTUAL_YEAR} figures are IMF estimates rather than final outturns.
    Aggregate GDP sums the 19 countries only, because the EU's output is already inside its member states.
    The AI labour exposure and AI readiness figures come from third-party research and the AI Trajectory Index, not from the sources above.
    The free-tier AI model can be rate limited, in which case answers come from the data engine.
    Macro data refreshes monthly and market data daily, so this is not a real-time market feed.
    The projection panel covers 19 countries with roughly 25 annual observations, cannot anticipate policy decisions or structural breaks, and is not advice. Scenarios are illustrative.
  </div></div>

  <div class="methodology">
    <h4>Sources and code</h4>
    <a href="https://data.worldbank.org" target="_blank" rel="noopener">World Bank Open Data</a> ·
    <a href="https://www.imf.org/external/datamapper" target="_blank" rel="noopener">IMF DataMapper</a> ·
    <a href="https://www.oecd.org/economic-outlook/" target="_blank" rel="noopener">OECD Economic Outlook</a> ·
    <a href="https://data.bis.org/topics/CBPOL" target="_blank" rel="noopener">BIS policy rates</a> ·
    <a href="https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html" target="_blank" rel="noopener">ECB reference rates</a> ·
    <a href="https://fred.stlouisfed.org" target="_blank" rel="noopener">FRED</a> ·
    <a href="https://ai-trajectory-index.vercel.app" target="_blank" rel="noopener">AI Trajectory Index</a>.
    Source code and tests: <a href="https://github.com/ankitmishra01/g20-economic-dashboard" target="_blank" rel="noopener">github.com/ankitmishra01/g20-economic-dashboard</a>.
    Built by Ankit Mishra with AI coding assistants.
  </div>

  <div class="page-foot"><span>g20.monitor</span><span>World Bank · IMF · OECD · BIS · ECB · FRED</span></div>
</div>`;
}
