-- Sabian Phase 3 Step 7: Country Briefings
-- Run in Supabase SQL editor:
-- https://supabase.com/dashboard/project/qdxgcyawpqxhhjprqyas/sql

CREATE TABLE IF NOT EXISTS country_briefings (
  id              BIGSERIAL PRIMARY KEY,
  country         TEXT NOT NULL,
  as_of_year      INTEGER NOT NULL,
  vertical        TEXT NOT NULL DEFAULT 'sabian',
  briefing_text   TEXT,
  headline        TEXT,
  risk_band       TEXT,
  current_score   NUMERIC,
  signals_active  INTEGER,
  has_leads       BOOLEAN DEFAULT FALSE,
  has_dark        BOOLEAN DEFAULT FALSE,
  has_analog      BOOLEAN DEFAULT FALSE,
  has_hive_flags  BOOLEAN DEFAULT FALSE,
  generated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_briefing UNIQUE (country, as_of_year, vertical)
);

CREATE INDEX IF NOT EXISTS idx_briefing_country  ON country_briefings (country);
CREATE INDEX IF NOT EXISTS idx_briefing_year     ON country_briefings (as_of_year);
CREATE INDEX IF NOT EXISTS idx_briefing_vertical ON country_briefings (vertical);
CREATE INDEX IF NOT EXISTS idx_briefing_score    ON country_briefings (current_score);
