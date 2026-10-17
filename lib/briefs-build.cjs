'use strict';
// Deterministic country briefs built from data/latest.json + data/country/{ISO3}.json.
// Five sections (growth, prices and labour, public finances, external, outlook), every
// figure carries its year, and nothing is stated without a value behind it. Used as the
// fallback when the live in-browser brief cannot run (and as a stable artifact).

const fmt = {
  pct: (v, d = 1) => `${v >= 0 ? '' : '−'}${Math.abs(v).toFixed(d)}%`,
  spct: (v, d = 1) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(d)}%`,
  usd: (v) => (v >= 1e12 ? `$${(v / 1e12).toFixed(2)} trillion` : v >= 1e9 ? `$${(v / 1e9).toFixed(v >= 1e11 ? 0 : 1)} billion` : `$${(v / 1e6).toFixed(0)} million`),
  money: (v) => (v >= 10000 ? `$${Math.round(v / 1000)}K` : `$${Math.round(v).toLocaleString('en-US')}`),
};

function median(arr) {
  const s = arr.filter(Number.isFinite).sort((a, b) => a - b);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function worldMedians(values) {
  const out = {};
  const keys = new Set();
  for (const v of Object.values(values)) for (const k of Object.keys(v)) keys.add(k);
  for (const k of keys) out[k] = median(Object.values(values).map((v) => v[k]?.[0]));
  return out;
}

function rankOf(values, key, iso3, { desc = true } = {}) {
  const list = Object.entries(values).filter(([, v]) => Number.isFinite(v[key]?.[0]))
    .sort((a, b) => (desc ? b[1][key][0] - a[1][key][0] : a[1][key][0] - b[1][key][0]));
  const i = list.findIndex(([k]) => k === iso3);
  return i < 0 ? null : { rank: i + 1, of: list.length };
}

function trend(series, key, n = 4) {
  const s = series?.[key];
  if (!s) return null;
  const ys = Object.keys(s).map(Number).sort((a, b) => a - b).slice(-n);
  if (ys.length < 2) return null;
  const first = s[ys[0]], last = s[ys[ys.length - 1]];
  return { from: first, to: last, fromYear: ys[0], toYear: ys[ys.length - 1], delta: last - first };
}

function ordinal(n) { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }

// Values older than this many years before the latest actual year are left out of the prose.
const MAX_AGE_YEARS = 6;

function buildBrief({ iso3, name, values, shard, medians, generatedAt, latestActualYear }) {
  const v = values[iso3] || {};
  const minYear = Number.isFinite(latestActualYear) ? latestActualYear - MAX_AGE_YEARS : -Infinity;
  const L = (k) => (v[k] && Number.isFinite(v[k][0]) && v[k][1] >= minYear ? { value: v[k][0], year: v[k][1] } : null);
  const gdp = L('GDP'), gr = L('GDP_GROWTH'), pc = L('GDP_CAPITA_PPP'), inf = L('INFLATION'), un = L('UNEMPLOYMENT'),
    yu = L('YOUTH_UNEMP'), debt = L('DEBT_GDP'), fb = L('FISCAL_BAL'), ca = L('CURRENT_ACC'), trade = L('TRADE_GDP'),
    fdi = L('FDI_INFLOWS'), manuf = L('MANUFACTURING'), life = L('LIFE_EXPECT'), pop = L('POPULATION');
  const s = shard?.series || {};
  const m = medians;
  const sections = [];

  // 1. Size and growth
  const p1 = [];
  if (gdp) {
    const r = rankOf(values, 'GDP', iso3);
    const rk = r ? (r.rank === 1 ? `, the world's largest of ${r.of} measured` : `, the world's ${ordinal(r.rank)}-largest of ${r.of} measured`) : '';
    p1.push(`${name} is a ${fmt.usd(gdp.value)} economy (${gdp.year})${rk}.`);
  }
  if (gr) {
    const rel = m.GDP_GROWTH == null ? '' : gr.value > m.GDP_GROWTH + 0.5 ? ', faster than the world median' : gr.value < m.GDP_GROWTH - 0.5 ? ', slower than the world median' : ', close to the world median';
    p1.push(`Real output grew ${fmt.spct(gr.value)} in ${gr.year}${rel}${m.GDP_GROWTH != null ? ` of ${fmt.spct(m.GDP_GROWTH)}` : ''}.`);
  }
  if (pc) p1.push(`Income per person is ${fmt.money(pc.value)} at purchasing-power parity (${pc.year})${m.GDP_CAPITA_PPP ? `, against a world median of ${fmt.money(m.GDP_CAPITA_PPP)}` : ''}.`);
  if (manuf) p1.push(`Manufacturing accounts for ${fmt.pct(manuf.value)} of GDP (${manuf.year}).`);
  sections.push(p1.join(' '));

  // 2. Prices and labour
  const p2 = [];
  if (inf) {
    const band = inf.value > 10 ? 'well above typical central bank targets' : inf.value > 4 ? 'above typical targets' : inf.value < 0 ? 'in deflation' : 'broadly within typical target ranges';
    const t = trend(s, 'INFLATION');
    p2.push(`Consumer prices rose ${fmt.pct(inf.value)} in ${inf.year}, ${band}${t && Math.abs(t.delta) >= 1 ? `, ${t.delta < 0 ? 'down' : 'up'} from ${fmt.pct(t.from)} in ${t.fromYear}` : ''}.`);
  }
  if (un) p2.push(`Unemployment stood at ${fmt.pct(un.value)} (${un.year})${m.UNEMPLOYMENT != null ? `, ${un.value < m.UNEMPLOYMENT ? 'below' : 'above'} the world median of ${fmt.pct(m.UNEMPLOYMENT)}` : ''}.`);
  if (yu) p2.push(`Youth unemployment was ${fmt.pct(yu.value)} (${yu.year}).`);
  sections.push(p2.join(' '));

  // 3. Public finances
  const p3 = [];
  if (debt) {
    const level = debt.value > 100 ? 'very high' : debt.value > 60 ? 'elevated' : debt.value > 40 ? 'moderate' : 'low';
    const t = trend(s, 'DEBT_GDP', 6);
    p3.push(`Gross government debt is ${fmt.pct(debt.value, 0)} of GDP (${debt.year}), a ${level} level${t && Math.abs(t.delta) >= 3 ? ` that has ${t.delta > 0 ? 'risen' : 'fallen'} from ${fmt.pct(t.from, 0)} in ${t.fromYear}` : ''}.`);
  }
  if (fb) p3.push(`The general government balance is ${fmt.spct(fb.value)} of GDP (${fb.year})${fb.value < -3 ? ', a deficit beyond the common 3% benchmark' : fb.value >= 0 ? ', a surplus' : ''}.`);
  sections.push(p3.join(' '));

  // 4. External
  const p4 = [];
  if (ca) p4.push(`The current account balance is ${fmt.spct(ca.value)} of GDP (${ca.year})${ca.value < -4 ? ', a sizeable external financing need' : ca.value > 4 ? ', a large surplus' : ''}.`);
  if (trade) p4.push(`Trade equals ${fmt.pct(trade.value, 0)} of GDP (${trade.year}), ${trade.value > 100 ? 'a highly open economy' : trade.value > 50 ? 'a fairly open economy' : 'a relatively closed economy'}.`);
  if (fdi) p4.push(`Net FDI inflows were ${fmt.pct(fdi.value)} of GDP (${fdi.year}).`);
  sections.push(p4.join(' '));

  // 5. Outlook (IMF projections only; labelled as projections)
  const p5 = [];
  const proj = shard?.projections?.DEBT_GDP;
  if (proj && debt) {
    const ys = Object.keys(proj).map(Number).sort((a, b) => a - b);
    const last = ys[ys.length - 1];
    if (last) p5.push(`IMF projections put government debt at ${fmt.pct(proj[last], 0)} of GDP by ${last}, ${proj[last] > debt.value + 3 ? 'still rising' : proj[last] < debt.value - 3 ? 'on a declining path' : 'broadly stable'} from today's level.`);
  }
  if (life) p5.push(`Life expectancy is ${life.value.toFixed(1)} years (${life.year}).`);
  if (pop) p5.push(`Population: ${pop.value >= 1e6 ? `${(pop.value / 1e6).toFixed(1)} million` : `${Math.round(pop.value / 1000)} thousand`} (${pop.year}).`);
  sections.push(p5.join(' '));

  const years = [gdp, gr, inf, debt].filter(Boolean).map((x) => x.year);
  const headline = gr
    ? `${name}: ${fmt.spct(gr.value)} growth in ${gr.year}${inf ? `, ${fmt.pct(inf.value)} inflation` : ''}${debt ? `, debt ${fmt.pct(debt.value, 0)} of GDP` : ''}`
    : `${name}: latest available indicators`;
  return {
    iso3, name, headline,
    sections: sections.map((x) => x || 'No recent data is available for this section.'),
    asOf: years.length ? Math.max(...years) : null,
    generatedAt,
    source: 'deterministic',
    note: 'Built from official World Bank and IMF data; IMF projections are labelled as projections.',
  };
}

module.exports = { buildBrief, worldMedians, median, rankOf, fmt, MAX_AGE_YEARS };
