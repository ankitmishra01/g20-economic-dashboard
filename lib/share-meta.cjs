'use strict';

// Shareable links (/c/{ISO3}, /s/{scope}) and their preview cards.
// Pure functions over the published shards so the route handlers, the OG image
// routes and the tests all build the same facts, titles and descriptions.

const SITE_NAME = 'G20 Monitor';
const SITE_TAGLINE = 'Global economic intelligence for 217 economies';
const SOURCES = 'World Bank · IMF · OECD · BIS · ECB · FRED';

// ── Formatting ────────────────────────────────────────────────────────────────
function fmtUsd(v) {
  if (!Number.isFinite(v)) return null;
  const a = Math.abs(v);
  if (a >= 1e12) return `$${(v / 1e12).toFixed(v >= 1e13 ? 1 : 2)}T`;
  if (a >= 1e9) return `$${Math.round(v / 1e9)}B`;
  if (a >= 1e6) return `$${Math.round(v / 1e6)}M`;
  return `$${Math.round(v)}`;
}
function fmtPct(v, { signed = false, digits = 1 } = {}) {
  if (!Number.isFinite(v)) return null;
  const s = v.toFixed(digits);
  return `${signed && v > 0 ? '+' : ''}${s}%`;
}

// Policy rates keep their real precision (3.875%, 13.75%, 4.5%).
function fmtRate(v) {
  if (!Number.isFinite(v)) return null;
  return `${Number(v.toFixed(3)).toString()}%`;
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// '2026-10-13' -> '13 Oct'
function shortDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]}` : null;
}

// ── Facts for one economy ─────────────────────────────────────────────────────
// latest: data/latest.json ({ values: { ISO3: { KEY: [value, year] } } })
// realtime: data/realtime.json; aiIndex: data/ai-index.json; registry: countries.json
function countryFacts({ iso3, latest, realtime = null, aiIndex = null, registry }) {
  const code = String(iso3 || '').toUpperCase();
  const meta = (registry?.countries || []).find((c) => c.iso3 === code);
  if (!meta) return null;
  const vals = latest?.values?.[code] || {};
  const pick = (key) => {
    const v = vals[key];
    return Array.isArray(v) && Number.isFinite(v[0]) ? { value: v[0], year: v[1] } : null;
  };
  const pr = realtime?.policyRates?.values?.[code] || null;
  const ccy = realtime?.fx?.currencyByIso3?.[code] || null;
  const fxv = ccy && ccy !== 'USD' ? realtime?.fx?.values?.[ccy] || null : null;
  const ai = aiIndex?.countries?.[code] || null;
  return {
    iso3: code,
    iso2: meta.iso2 || null,
    name: meta.name,
    region: meta.region || null,
    income: meta.incomeLevel || null,
    gdp: pick('GDP'),
    growth: pick('GDP_GROWTH'),
    inflation: pick('INFLATION'),
    unemployment: pick('UNEMPLOYMENT'),
    debt: pick('DEBT_GDP'),
    fiscal: pick('FISCAL_BAL'),
    currentAccount: pick('CURRENT_ACC'),
    gdpPerCapitaPpp: pick('GDP_CAPITA_PPP'),
    policyRate: pr && Number.isFinite(pr.rate)
      ? { rate: pr.rate, date: pr.date || null, lastChange: pr.lastChange || null, euroArea: !!pr.euroArea }
      : null,
    fx: fxv && Number.isFinite(fxv.perUsd)
      ? { currency: ccy, perUsd: fxv.perUsd, change30dPct: fxv.change30dPct ?? null, date: realtime.fx.date || null }
      : null,
    ai: ai && Number.isFinite(ai.total_score)
      ? { score: ai.total_score, projected2028: ai.projected_score_2028 ?? null, trajectory: ai.trajectory_label || null, live: ai.data_source === 'live', slug: ai.slug || null }
      : null,
    asOfYear: latest?.latestActualYear || null,
  };
}

// Short "key numbers" line used in descriptions and alt text.
function keyNumbers(f) {
  const parts = [];
  if (f.gdp) parts.push(`GDP ${fmtUsd(f.gdp.value)} (${f.gdp.year})`);
  if (f.growth) parts.push(`growth ${fmtPct(f.growth.value, { signed: true })}`);
  if (f.inflation) parts.push(`inflation ${fmtPct(f.inflation.value)}`);
  if (f.debt) parts.push(`debt ${Math.round(f.debt.value)}% of GDP`);
  if (f.policyRate) parts.push(`policy rate ${fmtRate(f.policyRate.rate)}`);
  if (f.ai) parts.push(`AI readiness ${f.ai.score}/100`);
  return parts.join(', ');
}

// ── Scopes ────────────────────────────────────────────────────────────────────
// Mirrors public/legacy/scope.js ids: global, g20, region:{code}, income:{code}.
function resolveScope(scopeId, registry) {
  const id = String(scopeId || 'global');
  if (id === 'global') return { id, label: 'Global', members: (registry?.countries || []).map((c) => c.iso3) };
  if (id === 'g20') return { id, label: 'G20', members: (registry?.collections?.g20?.members || []).filter((m) => !m.aggregate).map((m) => m.iso3) };
  const [kind, code] = id.split(':');
  const list = kind === 'region' ? registry?.collections?.regions : kind === 'income' ? registry?.collections?.income : null;
  const group = (list || []).find((g) => g.code === code);
  if (!group) return null;
  return { id, label: group.name, members: group.members.slice() };
}

function median(xs) {
  const a = xs.filter(Number.isFinite).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

function scopeFacts({ scopeId, latest, registry }) {
  const s = resolveScope(scopeId, registry);
  if (!s) return null;
  const vals = latest?.values || {};
  const series = (key) => s.members.map((iso) => vals[iso]?.[key]?.[0]);
  const gdps = series('GDP').filter(Number.isFinite);
  return {
    ...s,
    economies: s.members.length,
    withData: s.members.filter((iso) => vals[iso]).length,
    aggregateGdp: gdps.length ? gdps.reduce((a, b) => a + b, 0) : null,
    medianGrowth: median(series('GDP_GROWTH')),
    medianInflation: median(series('INFLATION')),
    medianDebt: median(series('DEBT_GDP')),
    asOfYear: latest?.latestActualYear || null,
  };
}

// ── Page metadata ─────────────────────────────────────────────────────────────
function countryMeta(f, origin) {
  const base = String(origin || '').replace(/\/$/, '');
  return {
    title: `${f.name}: economy at a glance · ${SITE_NAME}`,
    description: `${f.name}${f.region ? ` (${f.region})` : ''}: ${keyNumbers(f) || 'latest official data'}. Live macro data, policy rates, FX and AI readiness from ${SOURCES}.`,
    url: `${base}/c/${f.iso3}`,
    image: `${base}/og/c/${f.iso3}`,
    imageAlt: `${f.name} key economic indicators`,
    target: `${base}/#country/${f.iso3}`,
  };
}

function scopeMeta(sf, origin) {
  const base = String(origin || '').replace(/\/$/, '');
  const nums = [];
  if (Number.isFinite(sf.aggregateGdp)) nums.push(`combined GDP ${fmtUsd(sf.aggregateGdp)}`);
  if (Number.isFinite(sf.medianGrowth)) nums.push(`median growth ${fmtPct(sf.medianGrowth, { signed: true })}`);
  if (Number.isFinite(sf.medianInflation)) nums.push(`median inflation ${fmtPct(sf.medianInflation)}`);
  const label = sf.id === 'global' ? 'The world economy' : sf.label;
  return {
    title: `${label}: ${sf.economies} economies · ${SITE_NAME}`,
    description: `${label} (${sf.economies} economies${sf.asOfYear ? `, ${sf.asOfYear}` : ''}): ${nums.join(', ') || 'latest official data'}. What changed, risk flags and live markets from ${SOURCES}.`,
    url: `${base}/s/${encodeURIComponent(sf.id)}`,
    image: `${base}/og/s/${encodeURIComponent(sf.id)}`,
    imageAlt: `${label} key economic indicators`,
    target: sf.id === 'global' ? `${base}/` : `${base}/?scope=${encodeURIComponent(sf.id)}`,
  };
}

// ── Preview-card content ──────────────────────────────────────────────────────
const tone = (v, good) => (!Number.isFinite(v) ? null : good(v) ? 'pos' : 'neg');

function countryCard(f) {
  const stats = [];
  if (f.gdp) stats.push({ label: 'GDP', value: fmtUsd(f.gdp.value), sub: String(f.gdp.year) });
  if (f.growth) stats.push({ label: 'Real growth', value: fmtPct(f.growth.value, { signed: true }), sub: String(f.growth.year), tone: tone(f.growth.value, (v) => v >= 0) });
  if (f.inflation) stats.push({ label: 'Inflation', value: fmtPct(f.inflation.value), sub: String(f.inflation.year), tone: tone(f.inflation.value, (v) => v <= 5) });
  if (f.debt) stats.push({ label: 'Debt / GDP', value: `${Math.round(f.debt.value)}%`, sub: String(f.debt.year) });
  if (f.policyRate) {
    const lc = f.policyRate.lastChange;
    const move = lc && Number.isFinite(lc.change) ? `${lc.change > 0 ? '+' : ''}${Math.round(lc.change * 100)}bp` : 'BIS';
    stats.push({ label: f.policyRate.euroArea ? 'ECB rate' : 'Policy rate', value: fmtRate(f.policyRate.rate), sub: [move, shortDate(f.policyRate.date)].filter(Boolean).join(' · ') });
  }
  if (f.fx) {
    const ch = f.fx.change30dPct;
    stats.push({ label: `${f.fx.currency} per USD`, value: f.fx.perUsd >= 100 ? f.fx.perUsd.toFixed(1) : f.fx.perUsd.toFixed(f.fx.perUsd >= 10 ? 2 : 4), sub: [Number.isFinite(ch) ? `${ch > 0 ? '+' : ''}${ch.toFixed(1)}% 30d` : null, shortDate(f.fx.date)].filter(Boolean).join(' · '), tone: Number.isFinite(ch) ? (ch > 2 ? 'neg' : ch < -2 ? 'pos' : null) : null });
  }
  if (f.ai) stats.push({ label: 'AI readiness', value: `${f.ai.score}/100`, sub: `${f.ai.projected2028 != null ? `${f.ai.projected2028} by 2028 · ` : ''}${f.ai.live ? 'live' : 'baseline'}` });
  if (f.unemployment && stats.length < 8) stats.push({ label: 'Unemployment', value: fmtPct(f.unemployment.value), sub: String(f.unemployment.year) });
  return {
    eyebrow: 'Country brief',
    title: f.name,
    subtitle: [f.region, f.income].filter(Boolean).join(' · '),
    flagIso2: f.iso2,
    stats: stats.slice(0, 8),
    footerLeft: SOURCES,
    footerRight: 'g20-gamma.vercel.app',
  };
}

function scopeCard(sf) {
  const label = sf.id === 'global' ? 'The world economy' : sf.label;
  const stats = [{ label: 'Economies', value: String(sf.economies), sub: `${sf.withData} with data` }];
  if (Number.isFinite(sf.aggregateGdp)) stats.push({ label: 'Combined GDP', value: fmtUsd(sf.aggregateGdp), sub: sf.asOfYear ? String(sf.asOfYear) : '' });
  if (Number.isFinite(sf.medianGrowth)) stats.push({ label: 'Median growth', value: fmtPct(sf.medianGrowth, { signed: true }), tone: sf.medianGrowth >= 0 ? 'pos' : 'neg' });
  if (Number.isFinite(sf.medianInflation)) stats.push({ label: 'Median inflation', value: fmtPct(sf.medianInflation) });
  if (Number.isFinite(sf.medianDebt)) stats.push({ label: 'Median debt / GDP', value: `${Math.round(sf.medianDebt)}%` });
  return {
    eyebrow: sf.id === 'global' ? 'Global view' : 'Scope brief',
    title: label,
    subtitle: 'What changed · risk flags · live markets',
    flagIso2: null,
    stats,
    footerLeft: SOURCES,
    footerRight: 'g20-gamma.vercel.app',
  };
}

// Site-wide card; with global scope facts it carries the world's headline figures.
function defaultCard(globalFacts = null) {
  return {
    eyebrow: globalFacts ? `${globalFacts.economies} economies` : '217 economies',
    title: 'Global economic intelligence',
    subtitle: 'Live macro data, policy rates, FX and AI readiness · what changed and why it matters',
    flagIso2: null,
    stats: globalFacts ? scopeCard(globalFacts).stats : [],
    footerLeft: SOURCES,
    footerRight: 'g20-gamma.vercel.app',
  };
}

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// A tiny HTML page: link-preview crawlers read the meta tags (they do not run JS);
// people are sent straight on to the dashboard view.
function renderShareHtml(m) {
  const t = esc(m.target);
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<title>${esc(m.title)}</title>
<meta name="description" content="${esc(m.description)}">
<link rel="canonical" href="${esc(m.url)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${SITE_NAME}">
<meta property="og:title" content="${esc(m.title)}">
<meta property="og:description" content="${esc(m.description)}">
<meta property="og:url" content="${esc(m.url)}">
<meta property="og:image" content="${esc(m.image)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(m.imageAlt)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(m.title)}">
<meta name="twitter:description" content="${esc(m.description)}">
<meta name="twitter:image" content="${esc(m.image)}">
<meta http-equiv="refresh" content="0; url=${t}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
</head><body style="font-family:system-ui,sans-serif;background:#0a0a0a;color:#fff;padding:32px">
<p>Opening <a style="color:#fff" href="${t}">${esc(m.title)}</a>…</p>
<script>location.replace(${JSON.stringify(m.target)});</script>
</body></html>`;
}

module.exports = {
  SITE_NAME, SITE_TAGLINE, SOURCES,
  fmtUsd, fmtPct, fmtRate, shortDate, countryFacts, keyNumbers, resolveScope, scopeFacts, median,
  countryMeta, scopeMeta, renderShareHtml, countryCard, scopeCard, defaultCard,
};
