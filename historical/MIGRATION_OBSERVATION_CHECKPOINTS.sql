-- MIGRATION: observation_checkpoints
-- Run once in Supabase SQL editor.
-- Creates milestone checkpoint records for each observation window.
-- Checkpoint days: 30, 42, 56, 70, 84, 183, 365
-- Real grading at day 84. Days 30-70 are data-only discovery snapshots.
-- Days 183 and 365 are the 6-month and 12-month cycle checkpoints.

CREATE TABLE IF NOT EXISTS observation_checkpoints (
  id                   BIGSERIAL PRIMARY KEY,
  observation_id       BIGINT NOT NULL REFERENCES observations(id) ON DELETE CASCADE,
  country              TEXT NOT NULL,
  checkpoint_day       INTEGER NOT NULL,    -- 30, 42, 56, 70, 84, 183, 365
  checkpoint_date      DATE NOT NULL,       -- scan_date + checkpoint_day
  score_at_checkpoint  INTEGER,             -- convergence_score on that date
  level_at_checkpoint  TEXT,               -- risk_level on that date
  score_delta          INTEGER,             -- score_at_checkpoint - opening score
  top_signals          JSONB DEFAULT '[]',  -- top 3 signals on that date
  summary              TEXT,               -- data-only summary text
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(observation_id, checkpoint_day)
);

CREATE INDEX IF NOT EXISTS idx_oc_observation ON observation_checkpoints(observation_id);
CREATE INDEX IF NOT EXISTS idx_oc_date        ON observation_checkpoints(checkpoint_date);
CREATE INDEX IF NOT EXISTS idx_oc_country     ON observation_checkpoints(country);
