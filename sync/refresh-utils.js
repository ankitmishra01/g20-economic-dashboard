'use strict';

function requireServiceRoleKey(env = process.env) {
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for database writes');
  }
  if (key.startsWith('sb_publishable_')) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY cannot be a public client key');
  }
  return key;
}

function stampRows(rows, field, timestamp = new Date().toISOString()) {
  return rows.map((row) => ({ ...row, [field]: timestamp }));
}

module.exports = { requireServiceRoleKey, stampRows };
