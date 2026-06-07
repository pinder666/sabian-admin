-- Sabian Phase 1 Step 3: Historical Convergence Scores
-- Run in Supabase SQL editor:
-- https://supabase.com/dashboard/project/qdxgcyawpqxhhjprqyas/sql

CREATE TABLE IF NOT EXISTS historical_convergence_scores (
  id                BIGSERIAL PRIMARY KEY,
  country           TEXT NOT NULL,
  year              INTEGER NOT NULL,
  score             NUMERIC NOT NULL,
  signals_used      INTEGER,
  signals_available INTEGER,
  breakdown         JSONB,
  computed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_hist_conv_score UNIQUE (country, year)
);

CREATE INDEX IF NOT EXISTS idx_hist_conv_country ON historical_convergence_scores (country);
CREATE INDEX IF NOT EXISTS idx_hist_conv_year    ON historical_convergence_scores (year);
