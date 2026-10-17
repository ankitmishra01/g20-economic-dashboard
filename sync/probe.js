#!/usr/bin/env node
// Production health probe (run by .github/workflows/health-probe.yml).
// Checks that the dashboard serves, that the data files are fresh enough for their
// cadence, and that /api/status reports healthy. Exits 1 with a summary on failure.
'use strict';

const BASE = (process.env.PRODUCTION_URL || 'https://g20-gamma.vercel.app').replace(/\/$/, '');
const DAY = 86400000;
// Structural data refreshes monthly; daily market data refreshes on weekdays.
const LIMITS = { latest: 40 * DAY, realtime: 4 * DAY };

async function get(path, asJson = true) {
  const r = await fetch(BASE + path, { signal: AbortSignal.timeout(30000), headers: { 'user-agent': 'gei-health-probe' } });
  if (!r.ok) throw new Error(`${path} returned HTTP ${r.status}`);
  return asJson ? r.json() : r.text();
}

function age(iso, now) { const t = Date.parse(iso); return Number.isFinite(t) ? now - t : Infinity; }

async function probe(now = Date.now()) {
  const problems = [];
  const check = async (name, fn) => { try { await fn(); } catch (e) { problems.push(`${name}: ${e.message}`); } };
  await check('dashboard', async () => {
    const html = await get('/', false);
    if (!html.includes('scope-select')) throw new Error('page served without the dashboard shell');
  });
  await check('latest.json', async () => {
    const j = await get('/data/latest.json');
    if (age(j.generatedAt, now) > LIMITS.latest) throw new Error(`generatedAt ${j.generatedAt} is older than 40 days`);
  });
  await check('realtime.json', async () => {
    const j = await get('/data/realtime.json');
    if (age(j.generatedAt, now) > LIMITS.realtime) throw new Error(`generatedAt ${j.generatedAt} is older than 4 days`);
  });
  await check('api/status', async () => {
    const j = await get('/api/status');
    if (!j.healthy) {
      const bad = Object.entries(j.indicators || {}).filter(([, v]) => v.isStale || v.missing.length > 2).map(([k]) => k);
      throw new Error(`healthy=false${bad.length ? ` (${bad.join(', ')})` : ''}${j.error ? ` ${j.error}` : ''}`);
    }
  });
  return problems;
}

if (require.main === module) {
  probe().then((problems) => {
    if (!problems.length) { console.log(`OK ${BASE}`); return; }
    console.log(`Health probe failed for ${BASE}:\n- ${problems.join('\n- ')}`);
    process.exit(1);
  });
}

module.exports = { probe, age, LIMITS };
