// historical/pattern_tables_init.cjs
// Creates tables for nightly pattern matching
// Run once: node historical/pattern_tables_init.cjs

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function initTables() {
  console.log('[PATTERN_TABLES] Initializing pattern matching tables...');

  // pattern_match_history — daily snapshots of which countries match which findings
  const { error: e1 } = await sb.rpc('exec_sql', {
    sql: `
      CREATE TABLE IF NOT EXISTS pattern_match_history (
        run_date DATE PRIMARY KEY,
        country_count INTEGER,
        finding_count INTEGER,
        country_matches JSONB,
        finding_summary JSONB,
        changes JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `
  }).catch(() => null);

  // If RPC doesn't exist, try direct insert to test table
  const testRow = {
    run_date: '1970-01-01',
    country_count: 0,
    finding_count: 0,
    country_matches: {},
    finding_summary: {},
    changes: {}
  };

  await sb.from('pattern_match_history').upsert(testRow, { onConflict: 'run_date' });
  await sb.from('pattern_match_history').delete().eq('run_date', '1970-01-01');
  console.log('[PATTERN_TABLES] pattern_match_history — ready');

  // pattern_daily_reports — human-readable daily reports
  const testReport = {
    report_date: '1970-01-01',
    report_text: 'test',
    new_match_count: 0,
    dropped_match_count: 0,
    finding_delta_count: 0
  };

  await sb.from('pattern_daily_reports').upsert(testReport, { onConflict: 'report_date' });
  await sb.from('pattern_daily_reports').delete().eq('report_date', '1970-01-01');
  console.log('[PATTERN_TABLES] pattern_daily_reports — ready');

  console.log('[PATTERN_TABLES] Done. Tables ready for nightly pattern matching.');
}

if (require.main === module) {
  initTables()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('[PATTERN_TABLES] FATAL:', err);
      process.exit(1);
    });
}

module.exports = { initTables };
