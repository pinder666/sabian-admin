-- Sabian Phase 3 Step 8: Hive Observations
-- Run in Supabase SQL editor:
-- https://supabase.com/dashboard/project/qdxgcyawpqxhhjprqyas/sql

CREATE TABLE IF NOT EXISTS hive_observations (
  id              BIGSERIAL PRIMARY KEY,
  pattern_type    TEXT NOT NULL,
  signal_key      TEXT NOT NULL DEFAULT '',
  country         TEXT NOT NULL DEFAULT '',
  severity        TEXT NOT NULL DEFAULT 'info',
  finding         TEXT NOT NULL,
  evidence        JSONB,
  surfaced_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_hive_obs UNIQUE (pattern_type, signal_key, country)
);

CREATE INDEX IF NOT EXISTS idx_hive_obs_type     ON hive_observations (pattern_type);
CREATE INDEX IF NOT EXISTS idx_hive_obs_signal   ON hive_observations (signal_key);
CREATE INDEX IF NOT EXISTS idx_hive_obs_country  ON hive_observations (country);
CREATE INDEX IF NOT EXISTS idx_hive_obs_severity ON hive_observations (severity);
