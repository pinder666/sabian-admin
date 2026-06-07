-- Sabian Phase 2 Step 5: Synthesis Records
-- Run in Supabase SQL editor:
-- https://supabase.com/dashboard/project/qdxgcyawpqxhhjprqyas/sql

CREATE TABLE IF NOT EXISTS synthesis_records (
  id              BIGSERIAL PRIMARY KEY,
  country         TEXT NOT NULL,
  as_of_year      INTEGER NOT NULL,
  current_score   NUMERIC,
  baseline_score  NUMERIC,
  score_delta     NUMERIC,
  trajectory      TEXT,
  trajectory_slope NUMERIC,
  active_leads    JSONB,
  dark_signals    JSONB,
  top_analogs     JSONB,
  signal_breakdown JSONB,
  signals_active  INTEGER,
  computed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_synthesis UNIQUE (country, as_of_year)
);

CREATE INDEX IF NOT EXISTS idx_synthesis_country ON synthesis_records (country);
CREATE INDEX IF NOT EXISTS idx_synthesis_score   ON synthesis_records (current_score);
CREATE INDEX IF NOT EXISTS idx_synthesis_year    ON synthesis_records (as_of_year);
