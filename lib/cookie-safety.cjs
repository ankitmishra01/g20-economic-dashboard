'use strict';

function applyResponseCookies(values, store) {
  try {
    values.forEach(({ name, value, options }) => store.set(name, value, options));
  } catch {
    // Server Components have read-only cookie stores. Route handlers, actions,
    // and the auth callback still persist refreshed cookies when writes are allowed.
  }
}

module.exports = { applyResponseCookies };
