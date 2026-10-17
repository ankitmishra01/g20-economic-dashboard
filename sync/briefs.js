#!/usr/bin/env node
// Writes public/legacy/data/briefs/{ISO3}.json for every registry economy, built from the
// published shards (run after sync/shards.js in snapshot-refresh.yml). Deterministic: no
// AI call, so it runs without keys and the text always matches the data.
'use strict';
const fs = require('fs');
const path = require('path');
const { buildBrief, worldMedians } = require('../lib/briefs-build.cjs');

const DATA = path.join(__dirname, '..', 'public', 'legacy', 'data');
const OUT = path.join(DATA, 'briefs');
const registry = require('../public/legacy/countries.json');

const latest = JSON.parse(fs.readFileSync(path.join(DATA, 'latest.json'), 'utf8'));
const medians = worldMedians(latest.values);
fs.mkdirSync(OUT, { recursive: true });
let n = 0;
for (const c of registry.countries) {
  const shardPath = path.join(DATA, 'country', `${c.iso3}.json`);
  const shard = fs.existsSync(shardPath) ? JSON.parse(fs.readFileSync(shardPath, 'utf8')) : null;
  if (!latest.values[c.iso3]) continue;
  const brief = buildBrief({ iso3: c.iso3, name: c.name, values: latest.values, shard, medians, generatedAt: latest.generatedAt, latestActualYear: Number(latest.latestActualYear) });
  fs.writeFileSync(path.join(OUT, `${c.iso3}.json`), JSON.stringify(brief, null, 1) + '\n');
  n++;
}
console.log(`Wrote ${n} briefs to ${path.relative(process.cwd(), OUT)}`);
