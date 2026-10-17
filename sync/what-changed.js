#!/usr/bin/env node
// "What changed" builder (see lib/what-changed.cjs).
//
//   node sync/what-changed.js --stash latest     copy data/latest.json   -> data/previous/latest.json
//   node sync/what-changed.js --stash realtime   copy data/realtime.json -> data/previous/realtime.json
//   node sync/what-changed.js                    diff current vs previous -> data/what-changed.json
//
// The refresh workflows stash the published file before regenerating it, then
// run the builder, so each run compares against what readers saw last.

const fs = require('fs');
const path = require('path');
const { buildWhatChanged } = require('../lib/what-changed.cjs');

const DATA = path.join(__dirname, '..', 'public', 'legacy', 'data');
const PREV = path.join(DATA, 'previous');
const OUT = path.join(DATA, 'what-changed.json');

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return null; }
}

const stashIdx = process.argv.indexOf('--stash');
if (stashIdx !== -1) {
  const which = process.argv[stashIdx + 1];
  if (!['latest', 'realtime'].includes(which)) {
    console.error('Usage: --stash latest|realtime');
    process.exit(1);
  }
  const src = path.join(DATA, `${which}.json`);
  if (!fs.existsSync(src)) { console.log(`No ${which}.json to stash yet`); process.exit(0); }
  fs.mkdirSync(PREV, { recursive: true });
  fs.copyFileSync(src, path.join(PREV, `${which}.json`));
  console.log(`Stashed ${which}.json for the next comparison`);
  process.exit(0);
}

const current = { latest: readJson(path.join(DATA, 'latest.json')), realtime: readJson(path.join(DATA, 'realtime.json')) };
if (!current.latest && !current.realtime) {
  console.error('No current latest.json or realtime.json; nothing to compare');
  process.exit(1);
}
const previous = { latest: readJson(path.join(PREV, 'latest.json')), realtime: readJson(path.join(PREV, 'realtime.json')) };
const carry = readJson(OUT)?.items || [];
const registry = readJson(path.join(__dirname, '..', 'public', 'legacy', 'countries.json'));

const out = buildWhatChanged({ current, previous, carry, registry, now: new Date() });
fs.writeFileSync(OUT, `${JSON.stringify(out, null, 1)}\n`);
console.log(`what-changed.json: ${out.items.length} items ${JSON.stringify(out.counts)} (as of ${out.asOf})`);
for (const i of out.items.slice(0, 8)) console.log(`  ${String(i.materiality).padStart(6)}  ${i.title}  [${i.source}, ${i.asOf}]`);
