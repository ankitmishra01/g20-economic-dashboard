#!/usr/bin/env node
// G20 forecast model trainer — offline, zero-dependency (Node 18+ native fetch).
// Writes coefficients + an out-of-sample backtest to app/forecast-model.js for
// pure-JS inference in the browser. The model produces every number; no LLM.
//
//   1. Growth model    — ridge, 1-yr-ahead real GDP growth, pooled across all 19.
//   2. Recession model — logistic, 1-yr-ahead (next-year growth < 0), trained on
//                        the YIELD-CURVE-COVERED economies adding the term spread
//                        (the canonical recession predictor). EM economies without
//                        a term spread fall back to the descriptive fragility index.
//
// Metrics are leave-one-year-out cross-validated. Recession is reported both
// all-period and cyclical (excluding the unpredictable COVID-2020 forecast year).
//
// Run:  node sync/train-forecast.js

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qozknjenyhewmkapsizk.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_8I4WpqENYtTkUNKzqfxkkQ_lrQKG3cG';
const REC_AUC_GATE = 0.65;

const G20_ISO3 = ['USA','GBR','CAN','DEU','FRA','ITA','JPN','AUS','KOR','CHN','IND','BRA','MEX','ARG','RUS','SAU','ZAF','IDN','TUR'];
const NAMES = { USA:'United States', GBR:'United Kingdom', CAN:'Canada', DEU:'Germany', FRA:'France', ITA:'Italy', JPN:'Japan', AUS:'Australia', KOR:'South Korea', CHN:'China', IND:'India', BRA:'Brazil', MEX:'Mexico', ARG:'Argentina', RUS:'Russia', SAU:'Saudi Arabia', ZAF:'South Africa', IDN:'Indonesia', TUR:'Turkey' };

const FUND_FEATURES = ['GROWTH','MOMENTUM','FISCAL_BAL','DEBT_GDP','CURRENT_ACC','UNEMPLOYMENT','INFLATION'];
const REC_FEATURES = [...FUND_FEATURES, 'TERM_SPREAD'];
const LBL = { GROWTH:'GDP growth', MOMENTUM:'Growth momentum (2y)', FISCAL_BAL:'Fiscal balance', DEBT_GDP:'Govt debt/GDP', CURRENT_ACC:'Current account', UNEMPLOYMENT:'Unemployment', INFLATION:'Inflation', TERM_SPREAD:'Yield-curve term spread' };

async function loadPanel() {
  const PAGE = 1000; const rows = []; let offset = 0;
  while (true) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/g20_economic_data?select=country_iso3,indicator_key,year,value&order=year.asc`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Range: `${offset}-${offset + PAGE - 1}` } });
    if (!r.ok) throw new Error(`Supabase fetch failed: ${r.status}`);
    const page = await r.json(); rows.push(...page);
    if (page.length < PAGE) break; offset += PAGE;
  }
  const idx = {};
  for (const { country_iso3: c, indicator_key: k, year, value } of rows) {
    if (!c || !k) continue; (idx[c] ||= {}); (idx[c][k] ||= {}); idx[c][k][year] = value;
  }
  return idx;
}
const num = v => (v != null && !Number.isNaN(v)) ? v : null;

// Term spread comes from the committed static asset app/term-spread.js (keyless FRED),
// NOT Supabase — Supabase rows don't survive the monthly reseed.
async function loadTermSpread() {
  const path = await import('node:path'); const url = await import('node:url');
  globalThis.window = globalThis.window || {};
  const p = path.resolve(import.meta.dirname ?? process.cwd(), '../app/term-spread.js');
  try { await import(url.pathToFileURL(p).href); } catch (e) { console.log('term-spread.js not loaded:', e.message); }
  return globalThis.window.G20_TERM_SPREAD || {};
}

function buildSamples(idx, TS) {
  const out = [];
  for (const c of G20_ISO3) {
    const d = idx[c]; if (!d) continue;
    for (let t = 2000; t <= 2024; t++) {
      const g = num(d.GDP_GROWTH?.[t]), g2 = num(d.GDP_GROWTH?.[t - 2]),
        f = num(d.FISCAL_BAL?.[t]), db = num(d.DEBT_GDP?.[t]), ca = num(d.CURRENT_ACC?.[t]),
        u = num(d.UNEMPLOYMENT?.[t]), inf = num(d.INFLATION?.[t]),
        ts = num(TS?.[c]?.[t]), next = num(d.GDP_GROWTH?.[t + 1]);
      if ([g, g2, f, db, ca, u, inf, next].some(v => v == null)) continue;
      out.push({ iso3: c, year: t, fund: [g, g - g2, f, db, ca, u, inf], termSpread: ts, yRec: next < 0 ? 1 : 0, yGrowth: next });
    }
  }
  return out;
}
const growthX = s => s.fund;
const recX = s => [...s.fund, s.termSpread];

function standardiser(samples, extract) {
  const p = extract(samples[0]).length; const mu = Array(p).fill(0), sigma = Array(p).fill(0);
  for (const s of samples) { const x = extract(s); for (let j = 0; j < p; j++) mu[j] += x[j]; }
  for (let j = 0; j < p; j++) mu[j] /= samples.length;
  for (const s of samples) { const x = extract(s); for (let j = 0; j < p; j++) sigma[j] += (x[j] - mu[j]) ** 2; }
  for (let j = 0; j < p; j++) sigma[j] = Math.sqrt(sigma[j] / samples.length) || 1;
  return { mu, sigma, z: x => x.map((v, j) => (v - mu[j]) / sigma[j]) };
}
function fitLogistic(X, y, { lr = 0.1, iters = 5000, l2 = 0.01 } = {}) {
  const n = X.length, p = X[0].length; let w = Array(p).fill(0), b = 0; const sig = z => 1 / (1 + Math.exp(-z));
  for (let it = 0; it < iters; it++) {
    const gw = Array(p).fill(0); let gb = 0;
    for (let i = 0; i < n; i++) { let z = b; for (let j = 0; j < p; j++) z += w[j] * X[i][j]; const e = sig(z) - y[i]; for (let j = 0; j < p; j++) gw[j] += e * X[i][j]; gb += e; }
    for (let j = 0; j < p; j++) w[j] -= lr * (gw[j] / n + l2 * w[j]); b -= lr * (gb / n);
  }
  return { w, b, predict: x => sig(b + x.reduce((s, v, j) => s + w[j] * v, 0)) };
}
function fitRidge(X, y, l2 = 1.0) {
  const n = X.length, p = X[0].length, d = p + 1;
  const A = Array.from({ length: d }, () => Array(d).fill(0)); const bv = Array(d).fill(0);
  for (let i = 0; i < n; i++) { const xi = [...X[i], 1]; for (let a = 0; a < d; a++) { for (let b2 = 0; b2 < d; b2++) A[a][b2] += xi[a] * xi[b2]; bv[a] += xi[a] * y[i]; } }
  for (let a = 0; a < p; a++) A[a][a] += l2;
  const sol = solve(A, bv); return { w: sol.slice(0, p), b: sol[p], predict: x => sol[p] + x.reduce((s, v, j) => s + sol[j] * v, 0) };
}
function solve(Ain, bin) {
  const n = bin.length; const A = Ain.map(r => [...r]); const b = [...bin];
  for (let col = 0; col < n; col++) {
    let piv = col; for (let r = col + 1; r < n; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    [A[col], A[piv]] = [A[piv], A[col]]; [b[col], b[piv]] = [b[piv], b[col]];
    const dv = A[col][col] || 1e-9;
    for (let r = 0; r < n; r++) { if (r === col) continue; const f = A[r][col] / dv; for (let cc = col; cc < n; cc++) A[r][cc] -= f * A[col][cc]; b[r] -= f * b[col]; }
  }
  return b.map((v, i) => v / (A[i][i] || 1e-9));
}
function auc(scores, labels) {
  const pos = labels.filter(Boolean).length, neg = labels.length - pos; if (!pos || !neg) return NaN;
  const all = scores.map((s, i) => ({ s, y: labels[i] })).sort((a, b) => a.s - b.s);
  let rsp = 0, i = 0;
  while (i < all.length) { let j = i; while (j < all.length && all[j].s === all[i].s) j++; const ar = (i + j + 1) / 2; for (let k = i; k < j; k++) if (all[k].y) rsp += ar; i = j; }
  return (rsp - (pos * (pos + 1)) / 2) / (pos * neg);
}
const rmse = (p, y) => Math.sqrt(p.reduce((s, v, i) => s + (v - y[i]) ** 2, 0) / p.length);
const mae = (p, y) => p.reduce((s, v, i) => s + Math.abs(v - y[i]), 0) / p.length;

function loyo(samples, extract, fit) {
  const years = [...new Set(samples.map(s => s.year))].sort(); const pred = new Map();
  for (const Y of years) {
    const tr = samples.filter(s => s.year !== Y), te = samples.filter(s => s.year === Y);
    if (!tr.length || !te.length) continue;
    const std = standardiser(tr, extract); const m = fit(tr.map(s => std.z(extract(s))), tr.map(s => fit === fitLogistic ? s.yRec : s.yGrowth));
    for (const s of te) pred.set(s, m.predict(std.z(extract(s))));
  }
  return pred;
}

(async () => {
  console.log('Loading panel from Supabase…');
  const idx = await loadPanel();
  const TS = await loadTermSpread();
  const samples = buildSamples(idx, TS);
  const covered = [...new Set(samples.filter(s => s.termSpread != null).map(s => s.iso3))].sort();
  const recSamples = samples.filter(s => s.termSpread != null);
  console.log(`Growth samples: ${samples.length}  | recession (covered): ${recSamples.length}  | covered: ${covered.join(', ')}`);

  // Growth (ridge, all)
  const gStd = standardiser(samples, growthX);
  const gFit = fitRidge(samples.map(s => gStd.z(growthX(s))), samples.map(s => s.yGrowth));
  const gOOS = loyo(samples, growthX, fitRidge);
  const gPred = samples.map(s => gOOS.get(s)), gTrue = samples.map(s => s.yGrowth);
  const gRMSE = rmse(gPred, gTrue), gMAE = mae(gPred, gTrue);
  const persistRMSE = rmse(samples.map(s => s.fund[0]), gTrue);

  // Recession (logistic, covered + term spread). Skip gracefully if no term-spread
  // data is present (e.g. TERM_SPREAD not in Supabase) — emit a growth-only model.
  if (!recSamples.length) {
    console.log('\nNo TERM_SPREAD data — emitting growth-only model (recession feature disabled).');
    const model = {
      fundFeatures: FUND_FEATURES, recFeatures: REC_FEATURES,
      growth: { coef: gFit.w, intercept: gFit.b, mu: gStd.mu, sigma: gStd.sigma },
      recession: { coef: [], intercept: 0, mu: [], sigma: [], covered: [], auc: null, aucCyclical: null, gate: REC_AUC_GATE },
      backtest: [...new Set(samples.map(s => s.year))].sort().map(Y => {
        const g = samples.filter(s => s.year === Y), gp = g.map(s => gOOS.get(s)), gt = g.map(s => s.yGrowth);
        return { forecastYear: Y + 1, growthRMSE: gp.length ? +rmse(gp, gt).toFixed(2) : null, recessions: 0, recHits: 0 };
      }),
      meta: { trainedAt: new Date().toISOString().slice(0, 10), nGrowth: samples.length, nRecession: 0,
        growthRMSE: +gRMSE.toFixed(2), growthPersistenceRMSE: +persistRMSE.toFixed(2), growthBeatsPersistence: +(persistRMSE - gRMSE).toFixed(2),
        recAUC: null, recAUCCyclical: null, horizonYears: 1,
        notes: 'Growth: ridge, pooled G20 (beats persistence). Recession model disabled — no yield-curve term spread available in the data.' },
    };
    const fs0 = await import('node:fs'); const path0 = await import('node:path');
    const out0 = path0.resolve(import.meta.dirname ?? process.cwd(), '../app/forecast-model.js');
    fs0.writeFileSync(out0, `// AUTO-GENERATED by sync/train-forecast.js — do not edit.\nwindow.G20_MODEL = ${JSON.stringify(model, null, 2)};\n`);
    console.log(`Wrote ${out0} (growth-only)`);
    return;
  }
  const rStd = standardiser(recSamples, recX);
  const rFit = fitLogistic(recSamples.map(s => rStd.z(recX(s))), recSamples.map(s => s.yRec));
  const rOOS = loyo(recSamples, recX, fitLogistic);
  const rScores = recSamples.map(s => rOOS.get(s)), rLabels = recSamples.map(s => s.yRec);
  const rAUC = auc(rScores, rLabels);
  const exCovid = recSamples.filter(s => s.year !== 2019);
  const rAUC_cyc = auc(exCovid.map(s => rOOS.get(s)), exCovid.map(s => s.yRec));
  // fundamentals-only recession AUC (to show term-spread lift)
  const rOOSf = loyo(recSamples, growthX, fitLogistic);
  const rAUC_fund = auc(recSamples.map(s => rOOSf.get(s)), rLabels);

  console.log(`\nGROWTH  LOYO RMSE ${gRMSE.toFixed(2)}pp (persistence ${persistRMSE.toFixed(2)}pp, beats by ${(persistRMSE - gRMSE).toFixed(2)}pp)`);
  console.log(`RECESSION  AUC ${rAUC.toFixed(3)} all-period | ${rAUC_cyc.toFixed(3)} cyclical | fundamentals-only ${rAUC_fund.toFixed(3)}`);
  REC_FEATURES.forEach((f, j) => console.log(`  ${LBL[f].padEnd(24)} ${rFit.w[j] >= 0 ? '+' : ''}${rFit.w[j].toFixed(3)}`));

  // Backtest per forecast-year (out-of-sample)
  const yrs = [...new Set(samples.map(s => s.year))].sort();
  const backtest = yrs.map(Y => {
    const g = samples.filter(s => s.year === Y), gp = g.map(s => gOOS.get(s)), gt = g.map(s => s.yGrowth);
    const rc = recSamples.filter(s => s.year === Y), rp = rc.map(s => rOOS.get(s)), rl = rc.map(s => s.yRec);
    return { forecastYear: Y + 1, growthRMSE: gp.length ? +rmse(gp, gt).toFixed(2) : null,
      recessions: rl.reduce((a, b) => a + b, 0), recHits: rl.reduce((a, b, i) => a + (b && rp[i] > 0.5 ? 1 : 0), 0) };
  });

  const model = {
    fundFeatures: FUND_FEATURES, recFeatures: REC_FEATURES,
    growth: { coef: gFit.w, intercept: gFit.b, mu: gStd.mu, sigma: gStd.sigma },
    recession: { coef: rFit.w, intercept: rFit.b, mu: rStd.mu, sigma: rStd.sigma, covered, auc: +rAUC.toFixed(3), aucCyclical: +rAUC_cyc.toFixed(3), gate: REC_AUC_GATE },
    backtest,
    meta: {
      trainedAt: new Date().toISOString().slice(0, 10), nGrowth: samples.length, nRecession: recSamples.length,
      growthRMSE: +gRMSE.toFixed(2), growthMAE: +gMAE.toFixed(2), growthPersistenceRMSE: +persistRMSE.toFixed(2),
      growthBeatsPersistence: +(persistRMSE - gRMSE).toFixed(2),
      recAUC: +rAUC.toFixed(3), recAUCCyclical: +rAUC_cyc.toFixed(3), recAUCFundamentalsOnly: +rAUC_fund.toFixed(3),
      horizonYears: 1,
      notes: 'Growth: ridge, pooled G20. Recession: logistic on yield-curve-covered economies (term spread 10y-3m, keyless FRED). LOYO-CV. Recession probability framed as cyclical (AUC ' + (+rAUC_cyc.toFixed(2)) + '); all-period ' + (+rAUC.toFixed(2)) + ' reflects the unpredictable 2020 pandemic.',
    },
  };

  const fs = await import('node:fs'); const path = await import('node:path');
  const dir = import.meta.dirname ?? process.cwd();
  const out = path.resolve(dir, '../app/forecast-model.js');
  fs.writeFileSync(out, `// AUTO-GENERATED by sync/train-forecast.js — do not edit.\nwindow.G20_MODEL = ${JSON.stringify(model, null, 2)};\n`);
  console.log(`\nWrote ${out}`);

  // Forward forecast log (best-effort; the model file carries the backtest).
  try {
    const hp = path.resolve(dir, '../app/forecast-history.json');
    let hist = { vintages: [] }; try { hist = JSON.parse(fs.readFileSync(hp, 'utf8')); } catch (_) {}
    const today = model.meta.trainedAt;
    const vintage = { date: today, forecasts: G20_ISO3.map(c => {
      const cs = samples.filter(s => s.iso3 === c); if (!cs.length) return null; const s = cs[cs.length - 1];
      return { iso3: c, baseYear: s.year, growthForecast: +gFit.predict(gStd.z(growthX(s))).toFixed(2), termSpread: s.termSpread,
        recessionProb: s.termSpread != null ? +rFit.predict(rStd.z(recX(s))).toFixed(3) : null }; }).filter(Boolean) };
    hist.vintages = (hist.vintages || []).filter(v => v.date !== today).concat([vintage]);
    fs.writeFileSync(hp, JSON.stringify(hist, null, 2) + '\n');
    console.log(`Wrote ${hp}`);
  } catch (e) { console.log('history log skipped:', e.message); }
})().catch(e => { console.error(e); process.exit(1); });
