-- MIGRATION_ALL_PENDING.sql
-- Run this ONCE in Supabase SQL editor to activate Steps 5, 6, and 7.
-- Dashboard: https://supabase.com/dashboard/project/qdxgcyawpqxhhjprqyas/sql


-- ═══════════════════════════════════════════════════════════════
-- STEP 5: Trajectory column on convergence_scores
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE convergence_scores
ADD COLUMN IF NOT EXISTS trajectory TEXT DEFAULT 'STABLE';

CREATE INDEX IF NOT EXISTS idx_conv_scores_crisis
ON convergence_scores (convergence_score, trajectory, scan_date);

UPDATE convergence_scores
SET trajectory = 'STABLE'
WHERE trajectory IS NULL;


-- ═══════════════════════════════════════════════════════════════
-- STEP 6: Dossier snapshots (audit trail)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS dossier_snapshots (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  country             TEXT NOT NULL,
  snapshot_date       DATE NOT NULL,
  generated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  score               INTEGER,
  band                TEXT,
  trajectory          TEXT,
  summary_text        TEXT,
  full_json           JSONB,
  checksum            TEXT,
  changed_from_prior  BOOLEAN NOT NULL DEFAULT TRUE,
  signals_count       INTEGER,
  active_lead_count   INTEGER,
  UNIQUE (country, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_snap_country ON dossier_snapshots (country);
CREATE INDEX IF NOT EXISTS idx_snap_date    ON dossier_snapshots (snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_snap_band    ON dossier_snapshots (band, snapshot_date DESC);


-- ═══════════════════════════════════════════════════════════════
-- STEP 7: Pattern matching tables
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS pattern_match_history (
  run_date        DATE PRIMARY KEY,
  country_count   INTEGER,
  finding_count   INTEGER,
  country_matches JSONB,
  finding_summary JSONB,
  changes         JSONB,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pattern_daily_reports (
  report_date          DATE PRIMARY KEY,
  report_text          TEXT,
  new_match_count      INTEGER DEFAULT 0,
  dropped_match_count  INTEGER DEFAULT 0,
  finding_delta_count  INTEGER DEFAULT 0,
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pattern_history_date ON pattern_match_history (run_date DESC);
CREATE INDEX IF NOT EXISTS idx_pattern_reports_date ON pattern_daily_reports (report_date DESC);
