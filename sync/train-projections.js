#!/usr/bin/env node
'use strict';

// Multi-indicator, direct multi-horizon projection trainer. Zero dependencies.
// Models produce every number. The LLM is used only to explain stored results.

const fs = require('node:fs');
const path = require('node:path');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qozknjenyhewmkapsizk.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_8I4WpqENYtTkUNKzqfxkkQ_lrQKG3cG';
const INDICATORS = ['GDP_GROWTH', 'INFLATION', 'UNEMPLOYMENT', 'DEBT_GDP', 'FISCAL_BAL', 'CURRENT_ACC'];
// Modelled economies: the G20 countries from the registry (the EU is an aggregate).
const COUNTRIES = require('../lib/registry.cjs').g20Iso3();
// Latest year treated as observed data; later IMF years are projections.
const LATEST_ACTUAL_YEAR = new Date().getUTCFullYear() - 1;
const NAMES = { USA:'United States', GBR:'United Kingdom', CAN:'Canada', DEU:'Germany', FRA:'France', ITA:'Italy', JPN:'Japan', AUS:'Australia', KOR:'South Korea', CHN:'China', IND:'India', BRA:'Brazil', MEX:'Mexico', ARG:'Argentina', RUS:'Russia', SAU:'Saudi Arabia', ZAF:'South Africa', IDN:'Indonesia', TUR:'Türkiye' };
const HORIZONS = [1, 2, 3, 4, 5];
const SHOCK_YEARS = new Set([2020, 2022]);
const RIDGE_LAMBDA = 4;
const MIN_TRAIN = 70;
const INTEREST_RATE_ASSUMPTION = 3;

const round = (v, d = 2) => +v.toFixed(d);
const finite = v => Number.isFinite(v);
const mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
const median = a => quantile(a, 0.5);
function quantile(values, q) {
  const a = values.filter(finite).sort((x, y) => x - y);
  if (!a.length) return 0;
  const pos = (a.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return a[lo] + (a[hi] - a[lo]) * (pos - lo);
}
function metric(pred, actual) {
  const e = pred.map((p, i) => p - actual[i]);
  return { mae: mean(e.map(Math.abs)), rmse: Math.sqrt(mean(e.map(v => v * v))) };
}
function valueAtOrBefore(panel, iso3, key, year) {
  const series = panel[iso3]?.[key] || {};
  for (let y = year; y >= year - 8; y--) if (finite(series[y])) return series[y];
  return null;
}
function latestYear(panel, countries, key, cap = LATEST_ACTUAL_YEAR) {
  let out = 0;
  for (const c of countries) for (const y of Object.keys(panel[c]?.[key] || {}).map(Number)) if (y <= cap) out = Math.max(out, y);
  return out;
}

function solve(A0, b0) {
  const A = A0.map(r => r.slice()), b = b0.slice(), n = b.length;
  for (let c = 0; c < n; c++) {
    let pivot = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[pivot][c])) pivot = r;
    [A[c], A[pivot]] = [A[pivot], A[c]]; [b[c], b[pivot]] = [b[pivot], b[c]];
    const div = Math.abs(A[c][c]) < 1e-10 ? 1e-10 : A[c][c];
    for (let r = 0; r < n; r++) if (r !== c) {
      const f = A[r][c] / div;
      for (let k = c; k < n; k++) A[r][k] -= f * A[c][k];
      b[r] -= f * b[c];
    }
  }
  return b.map((v, i) => v / (Math.abs(A[i][i]) < 1e-10 ? 1e-10 : A[i][i]));
}

function fitRidge(samples) {
  const p = samples[0].x.length;
  const mu = Array(p).fill(0), sd = Array(p).fill(0), counts = Array(p).fill(0);
  for (const s of samples) for (let j = 0; j < p; j++) if (finite(s.x[j])) { mu[j] += s.x[j]; counts[j]++; }
  for (let j = 0; j < p; j++) mu[j] = counts[j] ? mu[j] / counts[j] : 0;
  for (const s of samples) for (let j = 0; j < p; j++) if (finite(s.x[j])) sd[j] += (s.x[j] - mu[j]) ** 2;
  for (let j = 0; j < p; j++) sd[j] = Math.sqrt(sd[j] / Math.max(1, counts[j])) || 1;
  const z = x => x.map((v, j) => finite(v) ? (v - mu[j]) / sd[j] : 0);
  const d = p + 1, A = Array.from({ length: d }, () => Array(d).fill(0)), b = Array(d).fill(0);
  for (const s of samples) {
    const row = [...z(s.x), 1];
    for (let i = 0; i < d; i++) { b[i] += row[i] * s.y; for (let j = 0; j < d; j++) A[i][j] += row[i] * row[j]; }
  }
  for (let j = 0; j < p; j++) A[j][j] += RIDGE_LAMBDA;
  const beta = solve(A, b);
  return { predict: x => beta[p] + z(x).reduce((s, v, j) => s + v * beta[j], 0), coef: beta.slice(0, p), intercept: beta[p], mu, sd };
}

function loadTermSpread() {
  const source = fs.readFileSync(path.join(__dirname, '../public/legacy/term-spread.js'), 'utf8');
  const match = source.match(/window\.G20_TERM_SPREAD\s*=\s*([\s\S]*);\s*$/);
  return match ? JSON.parse(match[1]) : {};
}
function featureVector(panel, termSpread, iso3, origin, targetKey) {
  const own = valueAtOrBefore(panel, iso3, targetKey, origin);
  const lag = valueAtOrBefore(panel, iso3, targetKey, origin - 1);
  return [own, lag, finite(own) && finite(lag) ? own - lag : null,
    ...INDICATORS.filter(k => k !== targetKey).map(k => valueAtOrBefore(panel, iso3, k, origin)),
    valueAtOrBefore({ [iso3]: { TERM: termSpread[iso3] || {} } }, iso3, 'TERM', origin)];
}
function anchorFor(panel, countries, key, cutoff) {
  const vals = [];
  for (const c of countries) for (let y = Math.max(1995, cutoff - 14); y <= cutoff; y++) {
    const v = panel[c]?.[key]?.[y]; if (finite(v)) vals.push(v);
  }
  return median(vals);
}
function baseline(panel, countries, iso3, key, origin, horizon, kind) {
  const last = valueAtOrBefore(panel, iso3, key, origin);
  const prev = valueAtOrBefore(panel, iso3, key, origin - 1);
  if (kind === 'naive') return last;
  if (kind === 'damped') return last + (finite(prev) ? (last - prev) * (1 - 0.6 ** horizon) / (1 - 0.6) * 0.6 : 0);
  const anchor = anchorFor(panel, countries, key, origin);
  return anchor + (last - anchor) * 0.75 ** horizon;
}
function samplesFor(panel, termSpread, countries, key, horizon, maxOrigin, minTrainYear) {
  const out = [];
  for (const iso3 of countries) for (let origin = minTrainYear + 2; origin <= maxOrigin; origin++) {
    const current = valueAtOrBefore(panel, iso3, key, origin), y = panel[iso3]?.[key]?.[origin + horizon];
    if (!finite(current) || !finite(y)) continue;
    out.push({ iso3, origin, y, x: featureVector(panel, termSpread, iso3, origin, key) });
  }
  return out;
}

function evaluate(panel, termSpread, countries, key, horizon, opts) {
  const all = samplesFor(panel, termSpread, countries, key, horizon, (opts.latestActualYear ?? LATEST_ACTUAL_YEAR) - horizon, opts.minTrainYear);
  const origins = [...new Set(all.map(s => s.origin))].filter(y => y >= opts.firstBacktestOrigin).sort();
  const records = [];
  for (const origin of origins) {
    const train = all.filter(s => s.origin < origin), test = all.filter(s => s.origin === origin);
    if (train.length < Math.min(MIN_TRAIN, Math.max(12, countries.length * 5)) || !test.length) continue;
    const ridge = fitRidge(train);
    for (const s of test) records.push({
      year: s.origin + horizon, actual: s.y,
      naive: baseline(panel, countries, s.iso3, key, s.origin, horizon, 'naive'),
      damped: baseline(panel, countries, s.iso3, key, s.origin, horizon, 'damped'),
      meanReversion: baseline(panel, countries, s.iso3, key, s.origin, horizon, 'meanReversion'),
      ridge: ridge.predict(s.x),
    });
  }
  if (!records.length) throw new Error(`Insufficient backtest data for ${key} h${horizon}`);
  const actual = records.map(r => r.actual);
  const candidates = ['naive', 'damped', 'meanReversion', 'ridge'];
  const scores = Object.fromEntries(candidates.map(k => [k, metric(records.map(r => r[k]), actual)]));
  const best = candidates.slice(1).sort((a, b) => scores[a].mae - scores[b].mae)[0];
  const noSkill = scores[best].mae >= scores.naive.mae;
  const selected = noSkill ? 'naive' : best;
  const residuals = records.map(r => r.actual - r[selected]);
  const widths = { p10: Math.abs(quantile(residuals, 0.1)), p25: Math.abs(quantile(residuals, 0.25)), p75: Math.abs(quantile(residuals, 0.75)), p90: Math.abs(quantile(residuals, 0.9)) };
  const lo80 = quantile(residuals, 0.1), hi80 = quantile(residuals, 0.9);
  const coverage = mean(records.map(r => r.actual >= r[selected] + lo80 && r.actual <= r[selected] + hi80 ? 1 : 0));
  const clean = records.filter(r => !SHOCK_YEARS.has(r.year));
  const cleanActual = clean.map(r => r.actual);
  const cleanSelected = metric(clean.map(r => r[selected]), cleanActual);
  const cleanNaive = metric(clean.map(r => r.naive), cleanActual);
  return { selected, noSkill, records, residuals, widths, coverage, scores, cleanSelected, cleanNaive };
}

const METHOD_NAMES = { naive: 'naive last value baseline', damped: 'damped trend baseline', meanReversion: 'mean reversion to a long run anchor', ridge: 'pooled ridge regression with direct multi horizon fits' };
function finalPredictor(panel, termSpread, countries, key, horizon, selected, origin, minTrainYear) {
  if (selected !== 'ridge') return iso3 => baseline(panel, countries, iso3, key, origin, horizon, selected);
  const samples = samplesFor(panel, termSpread, countries, key, horizon, origin - horizon, minTrainYear);
  const model = fitRidge(samples);
  return iso3 => model.predict(featureVector(panel, termSpread, iso3, origin, key));
}
function interval(point, residuals) {
  const q10 = quantile(residuals, .1), q25 = quantile(residuals, .25), q75 = quantile(residuals, .75), q90 = quantile(residuals, .9);
  return { p10: round(Math.min(point, point + q10)), p25: round(Math.min(point, point + q25)), point: round(point), p75: round(Math.max(point, point + q75)), p90: round(Math.max(point, point + q90)) };
}

function applyScenario(base, shock = {}, meta = {}) {
  const s = { slowdown: 0, commodity: 0, ratesBp: 0, aiProductivity: 0, ...shock };
  if (!Object.values(s).some(v => +v !== 0)) return { ...base };
  const tradeScale = finite(meta.tradeOpenness) ? Math.max(.5, Math.min(1.5, meta.tradeOpenness / 60)) : 1;
  const exporter = meta.commodityExporter ? 1 : -1;
  const aiScale = finite(meta.aiReadiness) ? meta.aiReadiness / 100 : .5;
  const rate = s.ratesBp / 100;
  return {
    ...base,
    GDP_GROWTH: base.GDP_GROWTH - s.slowdown * tradeScale + s.commodity * exporter * .15 + s.aiProductivity * aiScale,
    INFLATION: base.INFLATION + s.commodity * (meta.commodityExporter ? .15 : .6),
    UNEMPLOYMENT: base.UNEMPLOYMENT + s.slowdown * .35 - s.aiProductivity * aiScale * .15,
    DEBT_GDP: base.DEBT_GDP + rate * (base.DEBT_GDP / 100),
    FISCAL_BAL: base.FISCAL_BAL - rate * (base.DEBT_GDP / 100),
    CURRENT_ACC: base.CURRENT_ACC + s.commodity * exporter * .25,
  };
}

function trainProjectionEngine(panel, options = {}) {
  const countries = options.countries || COUNTRIES;
  const generatedDate = options.generatedDate || new Date().toISOString().slice(0, 10);
  const dataVintage = options.dataVintage || generatedDate;
  const minTrainYear = options.minTrainYear || 1995;
  const firstBacktestOrigin = options.firstBacktestOrigin || 2008;
  const termSpread = options.termSpread || {};
  const origin = Math.min(...INDICATORS.map(k => latestYear(panel, countries, k)).filter(Boolean));
  if (origin < 2020) throw new Error(`Projection origin ${origin} is too old`);
  const projections = [], backtest = [], fits = {};
  for (const key of INDICATORS) {
    fits[key] = {};
    for (const horizon of HORIZONS) {
      const ev = evaluate(panel, termSpread, countries, key, horizon, { minTrainYear, firstBacktestOrigin });
      fits[key][horizon] = ev;
      const selectedMetric = ev.scores[ev.selected], naiveMetric = ev.scores.naive;
      backtest.push({ indicator: key, horizon, shippedMethod: METHOD_NAMES[ev.selected], status: ev.noSkill ? 'no skill, showing baseline' : 'out of sample skill', noSkill: ev.noSkill,
        samples: ev.records.length, mae: round(selectedMetric.mae), rmse: round(selectedMetric.rmse), naiveMae: round(naiveMetric.mae), naiveRmse: round(naiveMetric.rmse),
        skillPct: round(100 * (1 - selectedMetric.mae / naiveMetric.mae), 1), coverage80: round(ev.coverage * 100, 1),
        excludingShocks: { mae: round(ev.cleanSelected.mae), rmse: round(ev.cleanSelected.rmse), naiveMae: round(ev.cleanNaive.mae), naiveRmse: round(ev.cleanNaive.rmse), skillPct: round(100 * (1 - ev.cleanSelected.mae / ev.cleanNaive.mae), 1) } });
      if (key === 'DEBT_GDP') continue;
      const predict = finalPredictor(panel, termSpread, countries, key, horizon, ev.selected, origin, minTrainYear);
      for (const iso3 of countries) projections.push({ iso3, indicator: key, year: origin + horizon, horizon, ...interval(predict(iso3), ev.residuals), method: METHOD_NAMES[ev.selected], isProjection: true });
    }
  }
  const lookup = new Map(projections.map(r => [`${r.iso3}|${r.indicator}|${r.year}`, r]));
  for (const iso3 of countries) {
    let debt = valueAtOrBefore(panel, iso3, 'DEBT_GDP', origin);
    for (const horizon of HORIZONS) {
      const year = origin + horizon, startDebt = debt;
      const growth = lookup.get(`${iso3}|GDP_GROWTH|${year}`).point / 100;
      const fiscal = lookup.get(`${iso3}|FISCAL_BAL|${year}`).point;
      debt = startDebt * (1 + INTEREST_RATE_ASSUMPTION / 100) / (1 + growth) - fiscal;
      const row = { iso3, indicator: 'DEBT_GDP', year, horizon, ...interval(debt, fits.DEBT_GDP[horizon].residuals), method: 'debt dynamics identity', isProjection: true,
        identity: { startDebt: round(startDebt), interestRate: INTEREST_RATE_ASSUMPTION, growth: round(growth * 100), fiscalBalance: round(fiscal) } };
      projections.push(row); lookup.set(`${iso3}|DEBT_GDP|${year}`, row); debt = row.point;
    }
  }
  for (const key of INDICATORS) for (const horizon of HORIZONS) {
    const rows = projections.filter(r => r.indicator === key && r.horizon === horizon);
    const agg = field => median(rows.map(r => r[field]));
    projections.push({ iso3: 'G20_MEDIAN', indicator: key, year: origin + horizon, horizon, p10: round(agg('p10')), p25: round(agg('p25')), point: round(agg('point')), p75: round(agg('p75')), p90: round(agg('p90')), method: 'median of 19 country projections', isProjection: true });
  }
  const oecdPath = options.oecdSeries || {};
  for (const horizon of HORIZONS) {
    const year = origin + horizon, observed = oecdPath[year];
    const g20 = projections.find(r => r.iso3 === 'G20_MEDIAN' && r.indicator === 'GDP_GROWTH' && r.year === year);
    const point = finite(observed) ? observed : g20.point;
    projections.push({ iso3: 'OECD', indicator: 'GDP_GROWTH', year, horizon, ...interval(point, fits.GDP_GROWTH[horizon].residuals), method: finite(observed) ? 'OECD Economic Outlook published projection' : 'G20 median baseline after OECD published horizon', isProjection: true });
  }
  projections.sort((a, b) => a.iso3.localeCompare(b.iso3) || INDICATORS.indexOf(a.indicator) - INDICATORS.indexOf(b.indicator) || a.year - b.year);
  const scenarioCoefficients = {
    slowdown: { unit: 'percentage point global growth shock', growth: '-shock × trade openness divided by 60, bounded from 0.5 to 1.5', unemployment: '+0.35 × shock', source: 'illustrative assumption' },
    commodity: { unit: 'scenario intensity', importer: { inflation: '+0.60', growth: '-0.15', currentAccount: '-0.25' }, exporter: { inflation: '+0.15', growth: '+0.15', currentAccount: '+0.25' }, source: 'illustrative assumption' },
    rates: { unit: 'basis points', debtAndFiscal: 'rate change × debt ratio', source: 'illustrative one year pass through assumption' },
    aiProductivity: { unit: 'percentage point maximum uplift', growth: 'uplift × AI Trajectory Index readiness divided by 100', unemployment: '-0.15 × growth uplift', source: 'illustrative assumption' },
  };
  return { schemaVersion: 1, generatedDate, dataVintage, projectionOriginYear: origin, coverage: '19 G20 countries; European Union excluded from modelling and aggregation', indicators: INDICATORS, horizons: HORIZONS,
    methods: Object.fromEntries(INDICATORS.map(key => [key, Object.fromEntries(HORIZONS.map(h => [h, key === 'DEBT_GDP' ? 'debt dynamics identity' : backtest.find(r => r.indicator === key && r.horizon === h).shippedMethod]))])),
    features: ['own level', 'own one year lag', 'own momentum', 'other five headline indicators', 'yield curve term spread where available'], missingData: 'Missing predictors are mean imputed within each rolling training window. Outcomes are never imputed.',
    trainingWindow: `${minTrainYear} to ${origin}`, uncertainty: 'Empirical out of sample residual quantiles by indicator and horizon. p25 to p75 is the 50% band; p10 to p90 is the 80% band.',
    projections, backtest, scenarios: scenarioCoefficients,
    limits: ['Only 19 countries and roughly 25 annual observations per country', 'Structural breaks can make historical relationships fail', 'No forward looking policy information is used', 'Projections are not advice', 'Scenarios are illustrative assumptions, not forecasts'],
  };
}

async function loadPanel() {
  const rows = []; let offset = 0; const pageSize = 1000;
  while (true) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/g20_economic_data?select=country_iso3,indicator_key,year,value,fetched_at&country_iso3=in.(${COUNTRIES.join(',')})&order=year.asc`, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Range: `${offset}-${offset + pageSize - 1}` } });
    if (!response.ok) throw new Error(`Supabase fetch failed: ${response.status}`);
    const page = await response.json(); rows.push(...page);
    if (page.length < pageSize) break; offset += pageSize;
  }
  const panel = {}; let vintage = '';
  for (const row of rows) {
    if (!row.country_iso3 || !row.indicator_key || !finite(row.value) || row.year > LATEST_ACTUAL_YEAR) continue;
    (((panel[row.country_iso3] ||= {})[row.indicator_key] ||= {}))[row.year] = row.value;
    if (row.fetched_at) vintage = [vintage, row.fetched_at.slice(0, 10)].sort().pop();
  }
  return { panel, vintage: vintage || new Date().toISOString().slice(0, 10) };
}
function validateOutput(data) {
  if (data.schemaVersion !== 1 || !data.projections.length || data.projections.some(r => !['point','p10','p25','p75','p90'].every(k => finite(r[k])))) throw new Error('Projection schema validation failed: missing or non finite values');
  if (data.projections.some(r => !(r.p10 <= r.p25 && r.p25 <= r.point && r.point <= r.p75 && r.p75 <= r.p90))) throw new Error('Projection schema validation failed: unordered interval');
  const headlineFailures = data.backtest.filter(r => r.horizon <= 2 && r.mae > r.naiveMae * 1.25);
  if (headlineFailures.length) throw new Error(`Backtest gate failed: ${headlineFailures.map(r => `${r.indicator} h${r.horizon}`).join(', ')}`);
}

async function main() {
  console.log('Loading G20 panel from Supabase');
  const { panel, vintage } = await loadPanel();
  const oecd = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/legacy/oecd-aggregate.json'), 'utf8'));
  const data = trainProjectionEngine(panel, { dataVintage: vintage, termSpread: loadTermSpread(), oecdSeries: oecd.series });
  validateOutput(data);
  console.log('\nIndicator       H  Model MAE  Naive MAE  Skill    80% coverage  Method');
  for (const r of data.backtest) console.log(`${r.indicator.padEnd(15)} ${String(r.horizon).padStart(1)}  ${r.mae.toFixed(2).padStart(9)}  ${r.naiveMae.toFixed(2).padStart(9)}  ${(r.skillPct.toFixed(1) + '%').padStart(7)}  ${(r.coverage80.toFixed(1) + '%').padStart(12)}  ${r.status}`);
  const out = path.join(__dirname, '../public/legacy/projections.json');
  fs.writeFileSync(out, JSON.stringify(data) + '\n');
  const historyPath = path.join(__dirname, '../public/legacy/projection-history.json');
  let history = { schemaVersion: 1, vintages: [] };
  try { history = JSON.parse(fs.readFileSync(historyPath, 'utf8')); } catch (_) {}
  const historyVintage = { generatedDate: data.generatedDate, dataVintage: data.dataVintage, projectionOriginYear: data.projectionOriginYear, projections: data.projections };
  history.vintages = (history.vintages || []).filter(v => v.generatedDate !== data.generatedDate).concat(historyVintage).slice(-24);
  fs.writeFileSync(historyPath, JSON.stringify(history) + '\n');
  console.log(`\nWrote ${out} (${Math.round(fs.statSync(out).size / 1024)} KB) and ${historyPath}`);
}

module.exports = { trainProjectionEngine, applyScenario, validateOutput };
if (require.main === module) main().catch(error => { console.error(error.stack || error); process.exit(1); });
