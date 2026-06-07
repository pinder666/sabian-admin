-- historical/MIGRATION_PATTERN_FINDINGS.sql
-- Creates pattern_findings table — live queryable store updated every nightly run.
-- Run once in Supabase SQL editor.

CREATE TABLE IF NOT EXISTS pattern_findings (
  id                INTEGER PRIMARY KEY,
  category          TEXT NOT NULL,
  title             TEXT NOT NULL,
  match_count       INTEGER NOT NULL DEFAULT 0,
  matched_countries JSONB NOT NULL DEFAULT '[]',
  last_run_date     DATE NOT NULL,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pf_category    ON pattern_findings (category);
CREATE INDEX IF NOT EXISTS idx_pf_match_count ON pattern_findings (match_count DESC);
