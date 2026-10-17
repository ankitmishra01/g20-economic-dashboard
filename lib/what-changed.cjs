'use strict';

// "What changed" engine: a deterministic diff of the published data so the
// Overview can say what moved since the last refresh, ranked by how much it
// matters. No model is involved; every item carries its value, as-of date and
// source. The AI narration (api/agent.js, mode "brief") only ever sees these items.
//
// Inputs (all optional except `current`):
//   current  = { latest, realtime }  public/legacy/data/latest.json + realtime.json
//   previous = { latest, realtime }  the copies kept from the previous refresh
//   carry    = items from the previous what-changed.json (kept for WINDOW_DAYS)
//   registry = public/legacy/countries.json
//   now      = Date

const WINDOW_DAYS = 14;          // keep earlier items visible for two weeks
const RECENT_POLICY_MONTHS = 2;  // a policy move "after" this many months back counts as recent
const FX_1D = 2;                 // % move in a day
const FX_30D = 5;                // % move over 30 days
const MAX_ITEMS = 60;

// Indicators whose new annual prints and revisions are worth surfacing.
const PRINT_KEYS = {
  GDP_GROWTH:   { label: 'Real GDP growth', unit: '%',      revision: 0.5 },
  INFLATION:    { label: 'CPI inflation',   unit: '%',      revision: 0.5 },
  UNEMPLOYMENT: { label: 'Unemployment',    unit: '%',      revision: 0.5 },
  DEBT_GDP:     { label: 'Government debt', unit: '% GDP',  revision: 3 },
  FISCAL_BAL:   { label: 'Fiscal balance',  unit: '% GDP',  revision: 1 },
  CURRENT_ACC:  { label: 'Current account', unit: '% GDP',  revision: 1 },
};

// Mirrors FLAGS_CONFIG in public/legacy/config.js (annual basis).
const FLAG_RULES = [
  { id: 'highInflation',     key: 'INFLATION',    threshold: 8,   dir: 'above', label: 'High inflation',       severity: 'high' },
  { id: 'negativeGrowth',    key: 'GDP_GROWTH',   threshold: 0,   dir: 'below', label: 'Contraction',          severity: 'high' },
  { id: 'highDebt',          key: 'DEBT_GDP',     threshold: 120, dir: 'above', label: 'High debt',            severity: 'medium' },
  { id: 'highUnemploy',      key: 'UNEMPLOYMENT', threshold: 10,  dir: 'above', label: 'High unemployment',    severity: 'medium' },
  { id: 'fiscalDeficit',     key: 'FISCAL_BAL',   threshold: -6,  dir: 'below', label: 'Large fiscal deficit', severity: 'medium' },
  { id: 'currentAccDeficit', key: 'CURRENT_ACC',  threshold: -5,  dir: 'below', label: 'Large CA deficit',     severity: 'low' },
];
const SEVERITY_WEIGHT = { high: 3, medium: 2, low: 1 };

// Market moves worth a line, with the size that counts as "1" for ranking.
const MARKET_RULES = {
  US10Y:     { field: 'change',    min: 0.10, unit: 'pp', scale: 0.10, fmt: (v) => `${v.toFixed(2)}%` },
  BRENT:     { field: 'changePct', min: 3,    unit: '%',  scale: 3,    fmt: (v) => `$${v.toFixed(1)}` },
  WTI:       { field: 'changePct', min: 3,    unit: '%',  scale: 3,    fmt: (v) => `$${v.toFixed(1)}` },
  USD_BROAD: { field: 'changePct', min: 1,    unit: '%',  scale: 1,    fmt: (v) => v.toFixed(1) },
  VIX:       { field: 'changePct', min: 10,   unit: '%',  scale: 10,   fmt: (v) => v.toFixed(1) },
};

const EURO_AREA = 'EUU';

// Names readers recognise; other economies read "<country>'s central bank".
const CENTRAL_BANKS = {
  EUU: 'The European Central Bank', USA: 'The Federal Reserve', JPN: 'The Bank of Japan', GBR: 'The Bank of England',
  CAN: 'The Bank of Canada', AUS: 'The Reserve Bank of Australia', BRA: 'Brazil\'s central bank', IND: 'The Reserve Bank of India',
  CHN: 'The People\'s Bank of China', KOR: 'The Bank of Korea', MEX: 'Banco de México', ZAF: 'The South African Reserve Bank',
  TUR: 'The Central Bank of Türkiye', SAU: 'The Saudi Central Bank', RUS: 'The Bank of Russia', IDN: 'Bank Indonesia',
  ARG: 'Argentina\'s central bank', CHE: 'The Swiss National Bank', SWE: 'Sweden\'s Riksbank', NOR: 'Norges Bank', NZL: 'The Reserve Bank of New Zealand',
};

const round = (v, d = 2) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d);
const isoDay = (d) => new Date(d).toISOString().slice(0, 10);

function monthIndex(ym) {
  const m = /^(\d{4})-(\d{2})/.exec(ym || '');
  return m ? Number(m[1]) * 12 + Number(m[2]) - 1 : null;
}

function buildContext(registry, latest) {
  const g20 = new Set((registry?.collections?.g20?.members || []).filter((m) => !m.aggregate).map((m) => m.iso3));
  const names = new Map((registry?.countries || []).map((c) => [c.iso3, c.name]));
  for (const m of registry?.collections?.g20?.members || []) if (!names.has(m.iso3)) names.set(m.iso3, m.name);
  names.set(EURO_AREA, 'Euro area');
  const gdp = (iso3) => latest?.values?.[iso3]?.GDP?.[0] ?? null;
  // Systemic weight: G20 economies (and the euro area) matter most for a cross-border reader.
  const weight = (iso3) => {
    if (iso3 === EURO_AREA || g20.has(iso3)) return 3;
    const g = gdp(iso3);
    if (g == null) return 0.8;
    if (g >= 5e11) return 2;
    if (g >= 5e10) return 1.3;
    return 0.8;
  };
  return { g20, name: (iso3) => names.get(iso3) || iso3, weight };
}

function policyItems(cur, prev, ctx, now) {
  const items = [];
  const values = cur?.policyRates?.values || {};
  const prevValues = prev?.policyRates?.values || {};
  const nowMonth = now.getUTCFullYear() * 12 + now.getUTCMonth();
  for (const [iso3, v] of Object.entries(values)) {
    // Euro area members share the ECB rate: report it once, as the euro area.
    if (v.euroArea && iso3 !== EURO_AREA) continue;
    const before = prevValues[iso3]?.rate;
    const lc = v.lastChange;
    let change = null; let fresh = false; let from = null;
    if (before != null && Number.isFinite(before) && Math.abs(v.rate - before) > 1e-9) {
      change = v.rate - before; from = before; fresh = true;
    } else if (lc && monthIndex(lc.after) != null && nowMonth - monthIndex(lc.after) <= RECENT_POLICY_MONTHS) {
      change = lc.change; from = lc.from;
    }
    if (change == null || Math.abs(change) < 1e-9) continue;
    const bp = Math.round(change * 100);
    const name = CENTRAL_BANKS[iso3] || `${ctx.name(iso3)}'s central bank`;
    items.push({
      id: `policy:${iso3}:${v.rate}`,
      kind: 'policy',
      iso3,
      title: `${name} ${bp > 0 ? 'raised' : 'cut'} its policy rate by ${Math.abs(bp)}bp to ${round(v.rate, 3)}%`,
      value: round(v.rate, 3), previous: round(from, 3), change: round(change, 3), unit: '%',
      direction: bp > 0 ? 'up' : 'down',
      asOf: v.date, source: cur.policyRates.source || 'BIS central bank policy rates',
      since: fresh ? null : (lc?.after || null),
      newSinceLastRefresh: fresh,
      materiality: round(ctx.weight(iso3) * (Math.abs(bp) / 25) * (fresh ? 1.5 : 1) * 1.2, 3),
    });
  }
  return items;
}

function fxItems(cur, ctx) {
  const items = [];
  const fx = cur?.fx;
  if (!fx?.values) return items;
  // One economy per currency for the link: the euro area for EUR, else the largest user.
  const holders = {};
  for (const [iso3, ccy] of Object.entries(fx.currencyByIso3 || {})) (holders[ccy] = holders[ccy] || []).push(iso3);
  for (const [ccy, x] of Object.entries(fx.values)) {
    if (ccy === fx.base) continue;
    const d1 = x.change1dPct; const d30 = x.change30dPct;
    const big1 = d1 != null && Math.abs(d1) >= FX_1D;
    const big30 = d30 != null && Math.abs(d30) >= FX_30D;
    if (!big1 && !big30) continue;
    const members = holders[ccy] || [];
    const iso3 = ccy === 'EUR' ? EURO_AREA : members.sort((a, b) => ctx.weight(b) - ctx.weight(a))[0] || null;
    // perUsd up = the currency weakened against the dollar.
    const move = big1 ? d1 : d30;
    const span = big1 ? '1 day' : '30 days';
    items.push({
      // A 30-day move persists for weeks, so it keeps one id (new only the first time it appears).
      id: big1 ? `fx:${ccy}:${fx.date}:1d` : `fx:${ccy}:30d:${move > 0 ? 'weaker' : 'stronger'}`,
      kind: 'fx',
      iso3, currency: ccy,
      title: `${ccy} ${move > 0 ? 'weakened' : 'strengthened'} ${Math.abs(move).toFixed(1)}% against the US dollar over ${span}`,
      value: x.perUsd, change: round(move, 2), unit: '% vs USD', window: big1 ? '1d' : '30d',
      direction: move > 0 ? 'weaker' : 'stronger',
      asOf: fx.date, source: fx.source || 'ECB euro foreign exchange reference rates',
      newSinceLastRefresh: true,
      materiality: round((iso3 ? ctx.weight(iso3) : 1) * Math.max(Math.abs(d1 || 0) / FX_1D, Math.abs(d30 || 0) / FX_30D), 3),
    });
  }
  return items;
}

function marketItems(cur) {
  const items = [];
  for (const [key, rule] of Object.entries(MARKET_RULES)) {
    const x = cur?.markets?.[key];
    if (!x) continue;
    const move = x[rule.field];
    if (move == null || Math.abs(move) < rule.min) continue;
    const moveText = rule.unit === 'pp' ? `${move > 0 ? '+' : ''}${Math.round(move * 100)}bp` : `${move > 0 ? '+' : ''}${move.toFixed(1)}%`;
    items.push({
      id: `market:${key}:${x.date}`,
      kind: 'market',
      iso3: null, market: key,
      title: `${x.label} ${move > 0 ? 'rose' : 'fell'} ${moveText} to ${rule.fmt(x.value)}`,
      value: x.value, previous: x.previous, change: round(move, 2), unit: rule.unit,
      direction: move > 0 ? 'up' : 'down',
      asOf: x.date, source: x.source,
      newSinceLastRefresh: true,
      materiality: round(2.5 * (Math.abs(move) / rule.scale), 3),
    });
  }
  return items;
}

const flagged = (rule, v) => v != null && (rule.dir === 'above' ? v >= rule.threshold : v < rule.threshold);

function dataItems(curLatest, prevLatest, ctx, asOf) {
  const items = [];
  if (!prevLatest?.values) return items;
  for (const [iso3, cur] of Object.entries(curLatest?.values || {})) {
    const prev = prevLatest.values[iso3] || {};
    for (const [key, spec] of Object.entries(PRINT_KEYS)) {
      const c = cur[key]; const p = prev[key];
      if (!c) continue;
      const [cv, cy] = c;
      if (p && cy > p[1]) {
        items.push({
          id: `print:${iso3}:${key}:${cy}`, kind: 'print', iso3, indicator: key,
          title: `${ctx.name(iso3)} ${spec.label.toLowerCase()} for ${cy} published at ${round(cv, 1)}${spec.unit === '%' ? '%' : `% of GDP`}`,
          value: round(cv, 2), previous: round(p[0], 2), year: cy, unit: spec.unit,
          asOf, source: 'IMF WEO / World Bank (annual)', newSinceLastRefresh: true,
          materiality: round(ctx.weight(iso3) * 0.8, 3),
        });
      } else if (p && cy === p[1] && Math.abs(cv - p[0]) >= spec.revision) {
        items.push({
          id: `revision:${iso3}:${key}:${cy}:${round(cv, 1)}`, kind: 'revision', iso3, indicator: key,
          title: `${ctx.name(iso3)} ${cy} ${spec.label.toLowerCase()} revised ${cv > p[0] ? 'up' : 'down'} from ${round(p[0], 1)} to ${round(cv, 1)}`,
          value: round(cv, 2), previous: round(p[0], 2), year: cy, unit: spec.unit,
          asOf, source: 'IMF WEO / World Bank (annual)', newSinceLastRefresh: true,
          materiality: round(ctx.weight(iso3) * (Math.abs(cv - p[0]) / spec.revision) * 0.7, 3),
        });
      }
    }
    for (const rule of FLAG_RULES) {
      const c = cur[rule.key]?.[0]; const p = prev[rule.key]?.[0];
      if (c == null || p == null) continue;
      const now = flagged(rule, c); const was = flagged(rule, p);
      if (now === was) continue;
      items.push({
        id: `flag:${iso3}:${rule.id}:${now ? 'on' : 'off'}:${cur[rule.key][1]}`, kind: 'flag', iso3, indicator: rule.key, flag: rule.id,
        title: `${ctx.name(iso3)} ${now ? 'crossed into' : 'moved out of'} the ${rule.label.toLowerCase()} flag (${round(c, 1)} vs threshold ${rule.threshold})`,
        value: round(c, 2), previous: round(p, 2), year: cur[rule.key][1], severity: rule.severity,
        direction: now ? 'flagged' : 'cleared',
        asOf, source: 'Dashboard risk thresholds on IMF / World Bank annual data', newSinceLastRefresh: true,
        materiality: round(ctx.weight(iso3) * SEVERITY_WEIGHT[rule.severity] * (now ? 1 : 0.6), 3),
      });
    }
  }
  return items;
}

function buildWhatChanged({ current, previous = null, carry = [], registry = null, now = new Date() } = {}) {
  const ctx = buildContext(registry, current?.latest);
  const asOf = isoDay(now);
  const fresh = [
    ...policyItems(current?.realtime, previous?.realtime, ctx, now),
    ...fxItems(current?.realtime, ctx),
    ...marketItems(current?.realtime),
    ...dataItems(current?.latest, previous?.latest, ctx, asOf),
  ];
  // FX and market items are recomputed from the current file every run; they count as
  // new only if the previous what-changed.json did not already list them.
  const carryIds = new Set((carry || []).map((i) => i && i.id));
  for (const i of fresh) if (i.kind === 'fx' || i.kind === 'market') i.newSinceLastRefresh = !carryIds.has(i.id);
  const seen = new Set(fresh.map((i) => i.id));
  const cutoff = now.getTime() - WINDOW_DAYS * 864e5;
  // Earlier items stay for two weeks (marked not new) unless this run produced the same id.
  const carried = (carry || [])
    .filter((i) => i && !seen.has(i.id) && i.asOf && new Date(`${i.asOf}T00:00:00Z`).getTime() >= cutoff)
    .map((i) => ({ ...i, newSinceLastRefresh: false, carried: true, materiality: round((i.materiality || 0) * 0.6, 3) }));
  const items = [...fresh, ...carried]
    .sort((a, b) => (b.materiality || 0) - (a.materiality || 0) || String(b.asOf).localeCompare(String(a.asOf)))
    .slice(0, MAX_ITEMS)
    .map((i) => ({ ...i, g20: i.iso3 ? ctx.g20.has(i.iso3) || i.iso3 === EURO_AREA : true }));
  const dates = items.map((i) => i.asOf).filter(Boolean).sort();
  return {
    schemaVersion: 1,
    generatedAt: now.toISOString(),
    asOf: dates.at(-1) || asOf,
    comparedWith: {
      latest: previous?.latest?.generatedAt || null,
      realtime: previous?.realtime?.generatedAt || null,
    },
    note: 'Deterministic diff of the published data; daily official reference series, not tick prices.',
    counts: items.reduce((acc, i) => ({ ...acc, [i.kind]: (acc[i.kind] || 0) + 1 }), {}),
    items,
  };
}

module.exports = { buildWhatChanged, PRINT_KEYS, FLAG_RULES, MARKET_RULES, WINDOW_DAYS, FX_1D, FX_30D };
