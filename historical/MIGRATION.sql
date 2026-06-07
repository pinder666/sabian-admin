-- Sabian Phase 1: Historical Foundation
-- Run this ONCE in Supabase SQL editor:
-- Project: qdxgcyawpqxhhjprqyas.supabase.co
-- Dashboard: https://supabase.com/dashboard/project/qdxgcyawpqxhhjprqyas/sql

-- 1. Raw historical signal readings
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

-- 2. Signal registry
CREATE TABLE IF NOT EXISTS signal_registry (
  signal_key        TEXT PRIMARY KEY,
  signal_name       TEXT NOT NULL,
  earliest_date     DATE,
  cadence           TEXT NOT NULL,
  data_type         TEXT NOT NULL,
  source            TEXT NOT NULL,
  has_history_api   BOOLEAN NOT NULL DEFAULT false,
  history_api_notes TEXT,
  registered_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Signal reliability map
CREATE TABLE IF NOT EXISTS signal_reliability_map (
  signal_key             TEXT PRIMARY KEY,
  coverage_pct           NUMERIC,
  mean_value             NUMERIC,
  median_value           NUMERIC,
  std_dev                NUMERIC,
  noise_index            NUMERIC,
  goes_dark_before_event BOOLEAN,
  reliability_tier       TEXT,
  countries_covered      INTEGER,
  total_readings         INTEGER,
  computed_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Country signal baselines
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

-- 5. Access event log
CREATE TABLE IF NOT EXISTS historical_access_events (
  id              BIGSERIAL PRIMARY KEY,
  country         TEXT NOT NULL,
  source_name     TEXT NOT NULL,
  access_granted  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  earliest_data   DATE,
  backfill_status TEXT NOT NULL DEFAULT 'pending',
  notes           TEXT
);
