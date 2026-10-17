'use strict';

// Pure parsers and builder for public/legacy/data/realtime.json: the daily market layer.
// Sources (all keyless, official): BIS central bank policy rates (SDMX CSV), ECB euro
// foreign exchange reference rates (XML), FRED daily series (CSV). Values outside
// plausible ranges are dropped, never adjusted.

const { classifyFreshness } = require('./economic-domain.cjs');

// Euro area members share the ECB policy rate and the euro (Bulgaria joined 1 Jan 2026).
const EURO_AREA = ['AUT', 'BEL', 'BGR', 'HRV', 'CYP', 'EST', 'FIN', 'FRA', 'DEU', 'GRC', 'IRL', 'ITA', 'LVA', 'LTU', 'LUX', 'MLT', 'NLD', 'PRT', 'SVK', 'SVN', 'ESP'];

// Currencies in the ECB reference set, by economy.
const CURRENCY_BY_ISO3 = {
  USA: 'USD', JPN: 'JPY', CZE: 'CZK', DNK: 'DKK', GBR: 'GBP', HUN: 'HUF', POL: 'PLN', ROU: 'RON',
  SWE: 'SEK', CHE: 'CHF', ISL: 'ISK', NOR: 'NOK', TUR: 'TRY', AUS: 'AUD', BRA: 'BRL', CAN: 'CAD',
  CHN: 'CNY', HKG: 'HKD', IDN: 'IDR', ISR: 'ILS', IND: 'INR', KOR: 'KRW', MEX: 'MXN', MYS: 'MYR',
  NZL: 'NZD', PHL: 'PHP', SGP: 'SGD', THA: 'THB', ZAF: 'ZAR',
  ...Object.fromEntries(EURO_AREA.map((iso) => [iso, 'EUR'])),
  EUU: 'EUR',
};

const RANGES = {
  policyRate: [-2, 200],
  US10Y: [-2, 25],
  BRENT: [5, 300],
  WTI: [-50, 300],
  USD_BROAD: [50, 250],
  VIX: [5, 150],
};
const inRange = (v, [lo, hi]) => Number.isFinite(v) && v >= lo && v <= hi;

// FRED fredgraph.csv: "observation_date,SERIES\n2026-10-14,4.03\n2026-10-15,." -> ascending rows.
function parseFredSeries(csv) {
  const out = [];
  for (const line of String(csv).trim().split(/\r?\n/).slice(1)) {
    const [date, raw] = line.split(',');
    const value = Number(raw);
    if (date && raw && raw !== '.' && Number.isFinite(value)) out.push({ date, value });
  }
  if (!out.length) throw new Error('FRED response had no observations');
  return out;
}

// Minimal CSV line splitter that respects double-quoted fields (BIS titles contain commas).
function splitCsv(line) {
  const out = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

// BIS SDMX CSV -> { REF_AREA: [{ period, value }] } ascending by period.
function parseBisCsv(csv) {
  const lines = String(csv).trim().split(/\r?\n/);
  const head = splitCsv(lines[0]);
  const iArea = head.indexOf('REF_AREA'); const iPer = head.indexOf('TIME_PERIOD'); const iVal = head.indexOf('OBS_VALUE');
  if (iArea < 0 || iPer < 0 || iVal < 0) throw new Error('BIS response is missing REF_AREA/TIME_PERIOD/OBS_VALUE');
  const series = {};
  for (const line of lines.slice(1)) {
    const f = splitCsv(line);
    const value = Number(f[iVal]);
    if (!f[iArea] || !f[iPer] || f[iVal] === '' || !Number.isFinite(value)) continue;
    (series[f[iArea]] ||= []).push({ period: f[iPer], value });
  }
  for (const s of Object.values(series)) s.sort((a, b) => a.period.localeCompare(b.period));
  return series;
}

// ECB eurofxref-hist-90d.xml / eurofxref-daily.xml -> [{ date, rates: { CCY: per EUR } }] ascending.
function parseEcbHistory(xml) {
  const days = [];
  for (const m of String(xml).matchAll(/<Cube\s+time=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/Cube>/gi)) {
    const rates = {};
    for (const r of m[2].matchAll(/<Cube\s+currency=['"]([A-Z]{3})['"]\s+rate=['"]([0-9.]+)['"]\s*\/>/gi)) rates[r[1]] = Number(r[2]);
    if (Object.keys(rates).length) days.push({ date: m[1], rates });
  }
  if (!days.length) throw new Error('ECB response had no rate sets');
  return days.sort((a, b) => a.date.localeCompare(b.date));
}

const round = (v, d = 4) => Number(Number(v).toFixed(d));

// releaseCadence: how often the source publishes (FRED's broad dollar index is weekly).
function marketEntry(key, label, unit, rows, source, now, releaseCadence = 'daily') {
  const valid = rows.filter((r) => inRange(r.value, RANGES[key]));
  if (!valid.length) return null;
  const last = valid[valid.length - 1]; const prev = valid[valid.length - 2] || null;
  return {
    key, label, unit, value: round(last.value, 3), date: last.date,
    previous: prev ? round(prev.value, 3) : null, previousDate: prev?.date || null,
    change: prev ? round(last.value - prev.value, 3) : null,
    changePct: prev && prev.value ? round(((last.value - prev.value) / Math.abs(prev.value)) * 100, 2) : null,
    source, frequency: 'daily', releaseCadence, freshness: classifyFreshness({ frequency: releaseCadence, fetchedAt: `${last.date}T23:59:59Z` }, now).state,
  };
}

// FX vs USD from ECB EUR-based reference rates: CCY per USD = (CCY per EUR) / (USD per EUR).
function buildFx(days, now) {
  const perUsd = (day, ccy) => (ccy === 'EUR' ? 1 / day.rates.USD : day.rates[ccy] / day.rates.USD);
  const last = days[days.length - 1]; const prev = days[days.length - 2]; const monthAgo = days.find((d) => d.date >= shiftDate(last.date, -30)) || days[0];
  if (!last?.rates.USD) throw new Error('ECB rate set has no USD');
  const values = {};
  for (const ccy of [...new Set(Object.values(CURRENCY_BY_ISO3))]) {
    if (ccy === 'USD' || (ccy !== 'EUR' && !last.rates[ccy])) continue;
    const v = perUsd(last, ccy);
    const p = prev && (ccy === 'EUR' || prev.rates[ccy]) ? perUsd(prev, ccy) : null;
    const m = monthAgo && (ccy === 'EUR' || monthAgo.rates[ccy]) ? perUsd(monthAgo, ccy) : null;
    if (!Number.isFinite(v) || v <= 0) continue;
    // Positive change = more local currency per USD = the local currency weakened.
    values[ccy] = { perUsd: round(v, v >= 100 ? 2 : 4), change1dPct: p ? round(((v - p) / p) * 100, 2) : null, change30dPct: m ? round(((v - m) / m) * 100, 2) : null };
  }
  return {
    base: 'USD', date: last.date, previousDate: prev?.date || null, monthAgoDate: monthAgo?.date || null,
    source: 'European Central Bank euro foreign exchange reference rates', frequency: 'daily',
    freshness: classifyFreshness({ frequency: 'daily', fetchedAt: `${last.date}T23:59:59Z` }, now).state,
    values, currencyByIso3: CURRENCY_BY_ISO3,
  };
}

function shiftDate(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Policy rates: latest daily value per central bank, plus the most recent change found in
// the monthly end-of-period series. BIS areas are ISO2; XM is the euro area (ECB).
function buildPolicyRates(daily, monthly, iso2to3, now) {
  const values = {};
  let latestDate = null;
  for (const [area, rows] of Object.entries(daily)) {
    const valid = rows.filter((r) => inRange(r.value, RANGES.policyRate));
    if (!valid.length) continue;
    const last = valid[valid.length - 1];
    const months = (monthly[area] || []).filter((r) => inRange(r.value, RANGES.policyRate));
    // Most recent month-end whose value differs from the current rate = the last move.
    let lastChange = null;
    for (let i = months.length - 1; i >= 0; i--) {
      if (Math.abs(months[i].value - last.value) > 1e-9) {
        lastChange = { from: months[i].value, to: last.value, after: months[i].period, change: round(last.value - months[i].value, 3) };
        break;
      }
    }
    // BIS refreshes its daily series about weekly, so freshness is judged on a weekly budget.
    const entry = { rate: round(last.value, 3), date: last.period, lastChange, area,
      freshness: classifyFreshness({ frequency: 'weekly', fetchedAt: `${last.period}T23:59:59Z` }, now).state };
    const iso3s = area === 'XM' ? EURO_AREA.concat('EUU') : [iso2to3[area]].filter(Boolean);
    for (const iso3 of iso3s) values[iso3] = { ...entry, euroArea: area === 'XM' };
    if (!latestDate || last.period > latestDate) latestDate = last.period;
  }
  return { source: 'BIS central bank policy rates (WS_CBPOL)', frequency: 'daily', releaseCadence: 'weekly', date: latestDate, values };
}

module.exports = { parseFredSeries, parseBisCsv, parseEcbHistory, splitCsv, marketEntry, buildFx, buildPolicyRates, EURO_AREA, CURRENCY_BY_ISO3, RANGES };
