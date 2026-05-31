#!/usr/bin/env node
// G20 forecast model trainer — offline, zero-dependency (Node 18+ native fetch).
//
// Fits two transparent models on the historical Supabase panel and writes the
// fitted coefficients to app/forecast-model.js for pure-JS inference in the browser:
//
//   1. Recession model  — logistic regression, 1-year-ahead.
//      label y = 1 if next-year real GDP growth < 0.
//   2. Growth model     — ridge regression, predicts next-year real GDP growth.
//
// Features (current year t), per country:
//   growth_t, growth_momentum (growth_t - growth_{t-2}), fiscal_t, debt_t,
//   current_account_t, unemployment_t, inflation_t
//
// The LLM never produces these numbers — this script does, and the UI narrates them.
//
// Run:  node sync/train-forecast.js
// Honesty: reports leave-one-year-out cross-validated metrics (AUC / RMSE), not just
// in-sample fit, so the headline accuracy is defensible.

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qozknjenyhewmkapsizk.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_8I4WpqENYtTkUNKzqfxkkQ_lrQKG3cG';

const G20_ISO3 = [
  'USA','GBR','CAN','DEU','FRA','ITA','JPN','AUS','KOR',
  'CHN','IND','BRA','MEX','ARG','RUS','SAU','ZAF','IDN','TUR',
];
const NAMES = {
  USA:'United States', GBR:'United Kingdom', CAN:'Canada', DEU:'Germany', FRA:'France',
  ITA:'Italy', JPN:'Japan', AUS:'Australia', KOR:'South Korea', CHN:'China', IND:'India',
  BRA:'Brazil', MEX:'Mexico', ARG:'Argentina', RUS:'Russia', SAU:'Saudi Arabia',
  ZAF:'South Africa', IDN:'Indonesia', TUR:'Turkey',
};

const FEATURES = ['GROWTH', 'MOMENTUM', 'FISCAL_BAL', 'DEBT_GDP', 'CURRENT_ACC', 'UNEMPLOYMENT', 'INFLATION'];
const FEATURE_LABELS = {
  GROWTH:'GDP growth', MOMENTUM:'Growth momentum (2y)', FISCAL_BAL:'Fiscal balance',
  DEBT_GDP:'Govt debt/GDP', CURRENT_ACC:'Current account', UNEMPLOYMENT:'Unemployment',
  INFLATION:'Inflation',
};

// ── Load the annual panel from Supabase ────────────────────────────────────────
async function loadPanel() {
  const PAGE = 1000;
  const rows = [];
  let offset = 0;
  while (true) {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/g20_economic_data?select=country_iso3,indicator_key,year,value&order=year.asc`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Range: `${offset}-${offset + PAGE - 1}` } }
    );
    if (!r.ok) throw new Error(`Supabase fetch failed: ${r.status}`);
    const page = await r.json();
    rows.push(...page);
    if (page.length < PAGE) break;
    offset += PAGE;
  }
  // index[iso3][key][year] = value
  const idx = {};
  for (const { country_iso3: c, indicator_key: k, year, value } of rows) {
    if (!c || !k) continue;
    (idx[c] ||= {});
    (idx[c][k] ||= {});
    idx[c][k][year] = value;
  }
  return idx;
}

const num = v => (v != null && !Number.isNaN(v)) ? v : null;

// Build the training sample. Each row: { iso3, year, x:[features], yRec, yGrowth }
function buildSamples(idx) {
  const samples = [];
  for (const c of G20_ISO3) {
    const d = idx[c];
    if (!d) continue;
    for (let t = 2000; t <= 2024; t++) {
      const growth   = num(d.GDP_GROWTH?.[t]);
      const growth2  = num(d.GDP_GROWTH?.[t - 2]);
      const fiscal   = num(d.FISCAL_BAL?.[t]);
      const debt     = num(d.DEBT_GDP?.[t]);
      const ca       = num(d.CURRENT_ACC?.[t]);
      const unemp    = num(d.UNEMPLOYMENT?.[t]);
      const inf      = num(d.INFLATION?.[t]);
      const next     = num(d.GDP_GROWTH?.[t + 1]); // label horizon
      // Require core features + the label
      if (growth == null || growth2 == null || fiscal == null || debt == null ||
          ca == null || unemp == null || inf == null || next == null) continue;
      const momentum = growth - growth2;
      samples.push({
        iso3: c, year: t,
        x: [growth, momentum, fiscal, debt, ca, unemp, inf],
        yRec: next < 0 ? 1 : 0,
        yGrowth: next,
      });
    }
  }
  return samples;
}

// ── Standardisation ────────────────────────────────────────────────────────────
function standardiser(samples) {
  const p = FEATURES.length;
  const mu = Array(p).fill(0), sigma = Array(p).fill(0);
  for (const s of samples) for (let j = 0; j < p; j++) mu[j] += s.x[j];
  for (let j = 0; j < p; j++) mu[j] /= samples.length;
  for (const s of samples) for (let j = 0; j < p; j++) sigma[j] += (s.x[j] - mu[j]) ** 2;
  for (let j = 0; j < p; j++) sigma[j] = Math.sqrt(sigma[j] / samples.length) || 1;
  return { mu, sigma, z: x => x.map((v, j) => (v - mu[j]) / sigma[j]) };
}

// ── Logistic regression (gradient descent + L2) ────────────────────────────────
function fitLogistic(X, y, { lr = 0.1, iters = 4000, l2 = 0.01 } = {}) {
  const n = X.length, p = X[0].length;
  let w = Array(p).fill(0), b = 0;
  const sig = z => 1 / (1 + Math.exp(-z));
  for (let it = 0; it < iters; it++) {
    const gw = Array(p).fill(0); let gb = 0;
    for (let i = 0; i < n; i++) {
      let z = b; for (let j = 0; j < p; j++) z += w[j] * X[i][j];
      const err = sig(z) - y[i];
      for (let j = 0; j < p; j++) gw[j] += err * X[i][j];
      gb += err;
    }
    for (let j = 0; j < p; j++) w[j] -= lr * (gw[j] / n + l2 * w[j]);
    b -= lr * (gb / n);
  }
  return { w, b, predict: x => sig(b + x.reduce((s, v, j) => s + w[j] * v, 0)) };
}

// ── Ridge regression (closed form, Gaussian elimination) ───────────────────────
function fitRidge(X, y, l2 = 1.0) {
  const n = X.length, p = X[0].length;
  // Design with intercept column at index p
  const d = p + 1;
  const A = Array.from({ length: d }, () => Array(d).fill(0));
  const bvec = Array(d).fill(0);
  for (let i = 0; i < n; i++) {
    const xi = [...X[i], 1];
    for (let a = 0; a < d; a++) {
      for (let b2 = 0; b2 < d; b2++) A[a][b2] += xi[a] * xi[b2];
      bvec[a] += xi[a] * y[i];
    }
  }
  for (let a = 0; a < p; a++) A[a][a] += l2; // do not penalise intercept
  const sol = solve(A, bvec);
  const w = sol.slice(0, p), b = sol[p];
  return { w, b, predict: x => b + x.reduce((s, v, j) => s + w[j] * v, 0) };
}

function solve(Ain, bin) {
  const n = bin.length;
  const A = Ain.map(r => [...r]); const b = [...bin];
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    [A[col], A[piv]] = [A[piv], A[col]]; [b[col], b[piv]] = [b[piv], b[col]];
    const d = A[col][col] || 1e-9;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = A[r][col] / d;
      for (let c = col; c < n; c++) A[r][c] -= f * A[col][c];
      b[r] -= f * b[col];
    }
  }
  return b.map((v, i) => v / (A[i][i] || 1e-9));
}

// ── Metrics ────────────────────────────────────────────────────────────────────
function auc(scores, labels) {
  // Mann-Whitney U / rank-based AUC
  const pos = [], neg = [];
  scores.forEach((s, i) => (labels[i] ? pos : neg).push(s));
  if (!pos.length || !neg.length) return NaN;
  const all = scores.map((s, i) => ({ s, y: labels[i] })).sort((a, b) => a.s - b.s);
  let rank = 0, rankSumPos = 0, i = 0;
  while (i < all.length) {
    let j = i; while (j < all.length && all[j].s === all[i].s) j++;
    const avgRank = (i + j + 1) / 2; // 1-based average rank for ties
    for (let k = i; k < j; k++) if (all[k].y) rankSumPos += avgRank;
    i = j;
  }
  return (rankSumPos - (pos.length * (pos.length + 1)) / 2) / (pos.length * neg.length);
}
const rmse = (pred, y) => Math.sqrt(pred.reduce((s, p, i) => s + (p - y[i]) ** 2, 0) / pred.length);
const mae  = (pred, y) => pred.reduce((s, p, i) => s + Math.abs(p - y[i]), 0) / pred.length;
function r2(pred, y) {
  const m = y.reduce((s, v) => s + v, 0) / y.length;
  const ssTot = y.reduce((s, v) => s + (v - m) ** 2, 0);
  const ssRes = pred.reduce((s, p, i) => s + (p - y[i]) ** 2, 0);
  return 1 - ssRes / ssTot;
}

// ── Leave-one-year-out cross-validation (honest out-of-sample metrics) ─────────
function loyoEval(samples) {
  const years = [...new Set(samples.map(s => s.year))].sort();
  const recScores = [], recLabels = [], grPred = [], grTrue = [];
  for (const Y of years) {
    const train = samples.filter(s => s.year !== Y);
    const test  = samples.filter(s => s.year === Y);
    if (!test.length) continue;
    const std = standardiser(train);
    const Xtr = train.map(s => std.z(s.x));
    const logit = fitLogistic(Xtr, train.map(s => s.yRec));
    const ridge = fitRidge(Xtr, train.map(s => s.yGrowth));
    for (const s of test) {
      const zx = std.z(s.x);
      recScores.push(logit.predict(zx)); recLabels.push(s.yRec);
      grPred.push(ridge.predict(zx));     grTrue.push(s.yGrowth);
    }
  }
  return {
    recAUC: auc(recScores, recLabels),
    grRMSE: rmse(grPred, grTrue),
    grMAE:  mae(grPred, grTrue),
  };
}

// ── Main ───────────────────────────────────────────────────────────────────────
(async () => {
  console.log('Loading panel from Supabase…');
  const idx = await loadPanel();
  const samples = buildSamples(idx);
  const baseRate = samples.reduce((s, x) => s + x.yRec, 0) / samples.length;
  console.log(`Training rows: ${samples.length}  |  recession base rate: ${(baseRate * 100).toFixed(1)}%`);

  // Honest out-of-sample metrics
  console.log('Running leave-one-year-out cross-validation…');
  const cv = loyoEval(samples);

  // Final fit on ALL data (the shipped coefficients)
  const std = standardiser(samples);
  const Xall = samples.map(s => std.z(s.x));
  const logit = fitLogistic(Xall, samples.map(s => s.yRec));
  const ridge = fitRidge(Xall, samples.map(s => s.yGrowth));

  // In-sample metrics (for reference)
  const recIn = samples.map(s => logit.predict(std.z(s.x)));
  const grIn  = samples.map(s => ridge.predict(std.z(s.x)));
  const inAUC = auc(recIn, samples.map(s => s.yRec));
  const inR2  = r2(grIn, samples.map(s => s.yGrowth));

  // ── Report ──
  console.log('\n=== RECESSION MODEL (1-year-ahead, logistic) ===');
  console.log(`LOYO-CV AUC: ${cv.recAUC.toFixed(3)}   (in-sample AUC ${inAUC.toFixed(3)})`);
  console.log('Standardised coefficients (sign = direction of risk):');
  FEATURES.forEach((f, j) =>
    console.log(`  ${FEATURE_LABELS[f].padEnd(22)} ${logit.w[j] >= 0 ? '+' : ''}${logit.w[j].toFixed(3)}`));

  // Naive baselines on the same samples (does the model earn its place?)
  const persistPred = samples.map(s => s.x[0]);                 // next = current growth
  const persistRMSE = rmse(persistPred, samples.map(s => s.yGrowth));
  const meanGrowth  = samples.reduce((a, s) => a + s.yGrowth, 0) / samples.length;
  const meanRMSE    = rmse(samples.map(() => meanGrowth), samples.map(s => s.yGrowth));

  console.log('\n=== GROWTH MODEL (1-year-ahead, ridge) ===');
  console.log(`LOYO-CV RMSE: ${cv.grRMSE.toFixed(2)} pp   MAE: ${cv.grMAE.toFixed(2)} pp   (in-sample R² ${inR2.toFixed(3)})`);
  console.log(`Baselines  — persistence RMSE: ${persistRMSE.toFixed(2)} pp   |   mean RMSE: ${meanRMSE.toFixed(2)} pp`);
  console.log(`Model beats persistence: ${cv.grRMSE < persistRMSE ? 'YES' : 'NO'} (Δ ${(persistRMSE - cv.grRMSE).toFixed(2)} pp)`);

  // ── Per-country latest snapshot (sanity table) ──
  console.log('\n=== LATEST-YEAR FORECASTS (predicting next year) ===');
  console.log('Country           base yr  recession%   growth fc   IMF fc');
  const snapshot = [];
  for (const c of G20_ISO3) {
    const d = idx[c]; if (!d) continue;
    let t = 2025; // find most recent year with complete features
    let x = null;
    for (; t >= 2000; t--) {
      const g = num(d.GDP_GROWTH?.[t]), g2 = num(d.GDP_GROWTH?.[t - 2]),
            f = num(d.FISCAL_BAL?.[t]), db = num(d.DEBT_GDP?.[t]), ca = num(d.CURRENT_ACC?.[t]),
            u = num(d.UNEMPLOYMENT?.[t]), inf = num(d.INFLATION?.[t]);
      if ([g, g2, f, db, ca, u, inf].every(v => v != null)) { x = [g, g - g2, f, db, ca, u, inf]; break; }
    }
    if (!x) continue;
    const zx = std.z(x);
    const prob = logit.predict(zx);
    const gfc  = ridge.predict(zx);
    const imf  = num(d.GDP_GROWTH?.[t + 1]); // IMF projection for next year, if present
    snapshot.push({ iso3: c, baseYear: t, recession: prob, growth: gfc, imf });
    console.log(
      `${NAMES[c].padEnd(16)}  ${t}     ${(prob * 100).toFixed(0).padStart(3)}%        ` +
      `${gfc >= 0 ? '+' : ''}${gfc.toFixed(1)}%      ${imf != null ? (imf >= 0 ? '+' : '') + imf.toFixed(1) + '%' : '  n/a'}`
    );
  }

  // ── Emit the browser model file ──
  const model = {
    features: FEATURES,
    recession: { coef: logit.w, intercept: logit.b, mu: std.mu, sigma: std.sigma },
    growth:    { coef: ridge.w, intercept: ridge.b, mu: std.mu, sigma: std.sigma },
    meta: {
      trainedAt: new Date().toISOString().slice(0, 10),
      n: samples.length,
      baseRate: +baseRate.toFixed(4),
      recAUC: +cv.recAUC.toFixed(3),
      growthRMSE: +cv.grRMSE.toFixed(2),
      growthPersistenceRMSE: +persistRMSE.toFixed(2),
      growthBeatsPersistence: +(persistRMSE - cv.grRMSE).toFixed(2),
      horizonYears: 1,
      notes: 'Logistic (recession) + ridge (growth), 1-year-ahead, pooled G20 panel 2000-2025. ' +
             'Metrics are leave-one-year-out cross-validated. Recession label is GFC-2009 / COVID-2020 heavy: ' +
             'read as a model-implied relative probability, not a calibrated event probability.',
    },
  };

  const fs = await import('node:fs');
  const path = await import('node:path');
  const out = path.resolve(import.meta.dirname ?? '.', '../app/forecast-model.js');
  const banner = '// AUTO-GENERATED by sync/train-forecast.js — do not edit by hand.\n' +
                 `// Trained ${model.meta.trainedAt} on ${model.meta.n} country-year pairs. ` +
                 `LOYO-CV AUC ${model.meta.recAUC}, growth RMSE ${model.meta.growthRMSE}pp.\n`;
  fs.writeFileSync(out, `${banner}window.G20_MODEL = ${JSON.stringify(model, null, 2)};\n`);
  console.log(`\nWrote ${out}`);
})().catch(e => { console.error(e); process.exit(1); });
