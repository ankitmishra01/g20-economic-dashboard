'use strict';

// Best-effort fixed-window limiter. Serverless instances are reused across
// requests (Fluid compute), so this blocks bursts from one client; it is not a
// global quota.
function createRateLimiter({ limit = 10, windowMs = 60_000, now = () => Date.now() } = {}) {
  const hits = new Map();
  return function check(key) {
    const t = now();
    const entry = hits.get(key);
    if (!entry || t - entry.start >= windowMs) {
      hits.set(key, { start: t, count: 1 });
      if (hits.size > 5000) for (const [k, v] of hits) if (t - v.start >= windowMs) hits.delete(k);
      return { allowed: true, remaining: limit - 1 };
    }
    entry.count += 1;
    return { allowed: entry.count <= limit, remaining: Math.max(0, limit - entry.count), retryAfterMs: windowMs - (t - entry.start) };
  };
}

function clientKey(req) {
  const fwd = req.headers?.['x-forwarded-for'];
  return (typeof fwd === 'string' && fwd.split(',')[0].trim()) || req.headers?.['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
}

module.exports = { createRateLimiter, clientKey };
