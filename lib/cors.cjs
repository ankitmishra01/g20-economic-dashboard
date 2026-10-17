'use strict';

// Origin allow-list shared by the legacy /api/*.js functions.
// Production, local development and this project's Vercel preview deployments
// are allowed; extra origins can be added with ALLOWED_ORIGINS (comma separated).
const STATIC_ALLOWED = ['https://g20-gamma.vercel.app'];
const PATTERNS = [
  /^http:\/\/localhost(:\d+)?$/,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/,
  // Preview deployments of this Vercel project only (team ankitmishra01s-projects),
  // including branch previews (g20-git-<branch>-ankitmishra01s-projects.vercel.app).
  /^https:\/\/g20-[a-z0-9-]+-ankitmishra01s-projects\.vercel\.app$/,
];

function allowedOrigins(env = process.env) {
  const extra = String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  return [...STATIC_ALLOWED, ...extra];
}

function isAllowedOrigin(origin, env = process.env) {
  if (!origin || typeof origin !== 'string') return false;
  if (allowedOrigins(env).includes(origin)) return true;
  return PATTERNS.some((re) => re.test(origin));
}

// Sets CORS headers only for allowed origins. Returns true when the origin is
// allowed (or absent, which is how same-origin GETs and server tools arrive).
function applyCors(req, res, env = process.env) {
  const origin = req.headers?.origin;
  res.setHeader('Vary', 'Origin');
  if (origin && isAllowedOrigin(origin, env)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    return true;
  }
  return !origin;
}

module.exports = { isAllowedOrigin, applyCors, allowedOrigins };
