'use strict';

function safeRedirectPath(candidate, fallback = '/account') {
  if (typeof candidate !== 'string' || !candidate.startsWith('/') || candidate.startsWith('//') || candidate.includes('\\')) return fallback;
  try {
    const origin = 'https://local.invalid';
    const parsed = new URL(candidate, origin);
    return parsed.origin === origin ? `${parsed.pathname}${parsed.search}${parsed.hash}` : fallback;
  } catch {
    return fallback;
  }
}

module.exports = { safeRedirectPath };
