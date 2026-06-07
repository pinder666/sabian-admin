-- Sabian Phase 2 Step 6: Synthesis Script Cache
-- Run in Supabase SQL editor:
-- https://supabase.com/dashboard/project/qdxgcyawpqxhhjprqyas/sql

CREATE TABLE IF NOT EXISTS synthesis_scripts (
  id              BIGSERIAL PRIMARY KEY,
  country         TEXT NOT NULL,
  as_of_year      INTEGER NOT NULL,
  headline        TEXT,
  score_line      TEXT,
  trajectory_line TEXT,
  lead_lines      JSONB,
  dark_lines      JSONB,
  analog_line     TEXT,
  full_script     TEXT,
  signal_count    INTEGER,
  generated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_script UNIQUE (country, as_of_year)
);

CREATE INDEX IF NOT EXISTS idx_script_country ON synthesis_scripts (country);
CREATE INDEX IF NOT EXISTS idx_script_year    ON synthesis_scripts (as_of_year);
CREATE INDEX IF NOT EXISTS idx_script_generat ON synthesis_scripts (generated_at);
