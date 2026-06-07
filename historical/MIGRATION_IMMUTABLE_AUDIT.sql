-- MIGRATION_IMMUTABLE_AUDIT.sql
-- Run ONCE in Supabase SQL editor.
-- Dashboard: https://supabase.com/dashboard/project/qdxgcyawpqxhhjprqyas/sql
--
-- Adds two things:
--   1. immutable_audit_log  — hash-chained event log (append-only)
--   2. data_status column   — on historical_convergence_scores (validated / provisional / backfill)


-- ═══════════════════════════════════════════════════════════════
-- PART 1: Immutable Audit Log
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS immutable_audit_log (
  id             BIGSERIAL PRIMARY KEY,
  event_type     TEXT        NOT NULL,
  logged_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  country        TEXT,
  payload_hash   TEXT        NOT NULL,
  previous_hash  TEXT        NOT NULL DEFAULT 'genesis',
  payload        JSONB       NOT NULL
);

-- No UPDATE or DELETE — rows are append-only.
-- Enforce at the Supabase RLS level if needed.

CREATE INDEX IF NOT EXISTS idx_audit_event_type ON immutable_audit_log (event_type);
CREATE INDEX IF NOT EXISTS idx_audit_country    ON immutable_audit_log (country) WHERE country IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_logged_at  ON immutable_audit_log (logged_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_hash       ON immutable_audit_log (payload_hash);


-- ═══════════════════════════════════════════════════════════════
-- PART 2: data_status on historical_convergence_scores
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE historical_convergence_scores
ADD COLUMN IF NOT EXISTS data_status TEXT DEFAULT 'validated';

-- Back-fill: anything already in the table is validated historical data
UPDATE historical_convergence_scores
SET data_status = 'validated'
WHERE data_status IS NULL;

-- Current-year records from live scan are provisional
UPDATE historical_convergence_scores
SET data_status = 'provisional'
WHERE year = EXTRACT(YEAR FROM NOW())::INTEGER
  AND data_status = 'validated';

CREATE INDEX IF NOT EXISTS idx_hcs_status ON historical_convergence_scores (data_status, year DESC);
