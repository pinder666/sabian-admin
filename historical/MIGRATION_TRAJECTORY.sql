-- MIGRATION_TRAJECTORY.sql
-- Adds trajectory column to convergence_scores table
-- Run once in Supabase SQL editor
-- Trajectory: SHARP_RISE | RISING | STABLE | FALLING | SHARP_FALL
-- Computed by global_scan.cjs comparing current vs previous scan score

ALTER TABLE convergence_scores
ADD COLUMN IF NOT EXISTS trajectory TEXT DEFAULT 'STABLE';

-- Index for crisis mode queries (score + trajectory filter)
CREATE INDEX IF NOT EXISTS idx_conv_scores_crisis
ON convergence_scores (score, trajectory, scan_date)
WHERE trajectory IN ('RISING', 'SHARP_RISE');

-- Backfill existing rows as STABLE (no prior comparison available)
UPDATE convergence_scores
SET trajectory = 'STABLE'
WHERE trajectory IS NULL;
