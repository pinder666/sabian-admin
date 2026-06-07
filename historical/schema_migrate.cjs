// historical/schema_migrate.cjs
// Creates Phase 1 tables in Supabase.
// Run once: node historical/schema_migrate.cjs
// Safe to re-run — all statements are CREATE TABLE IF NOT EXISTS.

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Supabase does not expose raw DDL via the JS client.
// We use the REST RPC interface to execute raw SQL via a helper function.
// Tables are created via direct Supabase SQL editor migration here as commented DDL.
// The script creates seed rows to validate connectivity, then outputs the DDL for manual execution.

const DDL = `
-- Phase 1: Historical Foundation
-- Run this in Supabase SQL editor > New Query

-- 1. Raw historical signal readings — one row per country + signal + date
CREATE TABLE IF NOT EXISTS historical_signal_readings (
  id            BIGSERIAL PRIMARY KEY,
  country       TEXT NOT NULL,
  signal_key    TEXT NOT NULL,
  signal_name   TEXT NOT NULL,
  date          DATE NOT NULL,
  raw_value     NUMERIC,
  raw_metadata  JSONB,
  source        TEXT,
  gap           BOOLEAN NOT NULL DEFAULT false,
  gap_reason    TEXT,
  ingested_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_historical_reading UNIQUE (country, signal_key, date)
);

CREATE INDEX IF NOT EXISTS idx_hist_country ON historical_signal_readings (country);
CREATE INDEX IF NOT EXISTS idx_hist_signal  ON historical_signal_readings (signal_key);
CREATE INDEX IF NOT EXISTS idx_hist_date    ON historical_signal_readings (date);

-- 2. Signal registry — what we know about each signal's historical record
CREATE TABLE IF NOT EXISTS signal_registry (
  signal_key     TEXT PRIMARY KEY,
  signal_name    TEXT NOT NULL,
  earliest_date  DATE,
  cadence        TEXT NOT NULL,
  data_type      TEXT NOT NULL,
  source         TEXT NOT NULL,
  has_history_api BOOLEAN NOT NULL DEFAULT false,
  history_api_notes TEXT,
  registered_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Signal reliability map — derived from historical data, rebuilt as data grows
CREATE TABLE IF NOT EXISTS signal_reliability_map (
  signal_key            TEXT PRIMARY KEY,
  coverage_pct          NUMERIC,
  mean_value            NUMERIC,
  median_value          NUMERIC,
  std_dev               NUMERIC,
  noise_index           NUMERIC,
  goes_dark_before_event BOOLEAN,
  reliability_tier      TEXT,
  countries_covered     INTEGER,
  total_readings        INTEGER,
  computed_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Country-level signal baselines — what stable looks like per country per signal
CREATE TABLE IF NOT EXISTS signal_baselines (
  id               BIGSERIAL PRIMARY KEY,
  country          TEXT NOT NULL,
  signal_key       TEXT NOT NULL,
  baseline_median  NUMERIC,
  baseline_p10     NUMERIC,
  baseline_p90     NUMERIC,
  sample_years     INTEGER,
  note             TEXT,
  computed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_baseline UNIQUE (country, signal_key)
);

CREATE INDEX IF NOT EXISTS idx_baseline_country ON signal_baselines (country);
CREATE INDEX IF NOT EXISTS idx_baseline_signal  ON signal_baselines (signal_key);

-- 5. Access event log — when a country grants data access
CREATE TABLE IF NOT EXISTS historical_access_events (
  id             BIGSERIAL PRIMARY KEY,
  country        TEXT NOT NULL,
  source_name    TEXT NOT NULL,
  access_granted TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  earliest_data  DATE,
  backfill_status TEXT NOT NULL DEFAULT 'pending',
  notes          TEXT
);
`;

async function run() {
  console.log('\n🛰️  Sabian Phase 1 — Schema Migration\n');
  console.log('This script validates Supabase connectivity and outputs the DDL.');
  console.log('Copy the DDL below and run it in Supabase SQL editor.\n');

  try {
    const { error } = await sb.from('convergence_scores').select('id').limit(1);
    if (error) throw error;
    console.log('✅ Supabase connection confirmed.\n');
  } catch (err) {
    console.error('❌ Supabase connection failed:', err.message);
    process.exit(1);
  }

  console.log('─'.repeat(70));
  console.log('DDL — paste into Supabase SQL editor:');
  console.log('─'.repeat(70));
  console.log(DDL);
  console.log('─'.repeat(70));
  console.log('\nAfter running DDL, execute:');
  console.log('  node historical/ingest_runner.cjs\n');
}

run();
