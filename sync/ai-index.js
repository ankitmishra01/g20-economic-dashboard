// Writes public/legacy/data/ai-index.json: AI Trajectory Index scores keyed by ISO3,
// read by the AI Economy page, country profiles and Ask AI.
// Prefers the live scores API; falls back to the repo's published baseline file.
// Keeps the previous file if both fail (exit 0 with a warning, so a refresh is never blocked).
// Run: node sync/ai-index.js
const fs = require('fs');
const path = require('path');
const registry = require('../lib/registry.cjs');
const { buildAiIndex, buildAiDetails } = require('../lib/ai-index-build.cjs');

const OUT = path.join(__dirname, '..', 'public', 'legacy', 'data', 'ai-index.json');
const API = 'https://ai-trajectory-index.vercel.app/api/scores';
const STATIC = 'https://raw.githubusercontent.com/ankitmishra01/ai-trajectory-index/main/data/countries.json';
const UA = { 'User-Agent': 'G20Dashboard-AIIndex/1.0 (+https://g20-gamma.vercel.app)', Accept: 'application/json' };

async function getJson(url, attempts = 3) {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(60000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      if (i >= attempts) throw new Error(`${new URL(url).host}: ${e.message}`);
      await new Promise((res) => setTimeout(res, 2000 * i));
    }
  }
}

async function main() {
  const registryIso3 = new Set(registry.countries.map((c) => c.iso3));
  let out = null;
  let details = null;
  for (const [source, url] of [['api', API], ['static', STATIC]]) {
    try {
      const json = await getJson(url);
      const built = buildAiIndex(json, { source, sourceUrl: url, registryIso3 });
      if (built.counts.economies < 100) throw new Error(`only ${built.counts.economies} economies with ISO3`);
      out = built;
      details = buildAiDetails(json);
      break;
    } catch (e) {
      console.warn(`  ⚠ AI index ${source} failed: ${e.message}`);
    }
  }
  if (!out) {
    console.warn('  ⚠ AI index unavailable; keeping the previous ai-index.json');
    if (process.env.GITHUB_ACTIONS) console.log('::warning::AI Trajectory Index unavailable; previous ai-index.json kept');
    return;
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out));
  const DETAIL_DIR = path.join(path.dirname(OUT), 'ai-index');
  fs.mkdirSync(DETAIL_DIR, { recursive: true });
  for (const [iso3, d] of Object.entries(details || {})) fs.writeFileSync(path.join(DETAIL_DIR, `${iso3}.json`), JSON.stringify(d));
  const c = out.counts;
  console.log(`AI index (${out.source}): ${c.economies} economies by ISO3, ${c.inRegistry} in the registry; not in registry: ${c.notInRegistry.join(', ') || 'none'}; skipped without ISO3: ${c.skippedWithoutIso3}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
