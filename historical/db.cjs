// db.cjs
// Single source of truth for database access.
// ALL scripts must import from here — never create raw Supabase clients.
// This ensures db_guard protection is always active.

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');
const { guardClient, upsertReadings, upsertBaselines, upsertScores, PROTECTED_TABLES } = require('./db_guard.cjs');

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment');
}

// The ONLY Supabase client — always guarded
const sb = guardClient(
  createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  })
);

module.exports = {
  sb,
  upsertReadings,
  upsertBaselines,
  upsertScores,
  PROTECTED_TABLES
};
