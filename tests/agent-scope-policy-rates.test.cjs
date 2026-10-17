const test = require('node:test');
const assert = require('node:assert');
const { buildRealtimeContext } = require('../lib/agent-context.cjs');

const realtime = {
  markets: {},
  policyRates: { values: {
    BRA: { rate: 13.75, date: '2026-10-13', lastChange: { from: 14, to: 13.75, after: '2026-09', change: -0.25 } },
    JPN: { rate: 1.25, date: '2026-10-13', lastChange: { from: 1, to: 1.25, after: '2026-09', change: 0.25 } },
  } },
};

test('scope questions list the scope policy rates with names and moves', () => {
  const ctx = buildRealtimeContext(realtime, null, { members: ['BRA', 'USA'], nameOf: (x) => ({ BRA: 'Brazil' }[x] || x) });
  assert.match(ctx, /Brazil \(BRA\): 13\.75% as of 2026-10-13; last move -25bp from 14%/);
  assert.doesNotMatch(ctx, /JPN/);
});

test('a single-economy question keeps the per-country layout and no scope list', () => {
  const ctx = buildRealtimeContext(realtime, 'JPN');
  assert.match(ctx, /Policy rate: 1\.25%/);
  assert.doesNotMatch(ctx, /Central bank policy rates \(BIS/);
});
