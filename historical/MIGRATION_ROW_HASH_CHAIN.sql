-- MIGRATION: Row-level hash chain for convergence_scores and observations
-- Run in Supabase SQL editor.
-- After running: execute `node historical/row_hash_backfill.cjs` to seal existing rows.

-- ── convergence_scores ──────────────────────────────────────────────────────────
ALTER TABLE convergence_scores ADD COLUMN IF NOT EXISTS row_hash TEXT;
ALTER TABLE convergence_scores ADD COLUMN IF NOT EXISTS prev_hash TEXT;
CREATE INDEX IF NOT EXISTS idx_cs_row_hash ON convergence_scores(row_hash);

-- ── observations ────────────────────────────────────────────────────────────────
ALTER TABLE observations ADD COLUMN IF NOT EXISTS row_hash TEXT;
ALTER TABLE observations ADD COLUMN IF NOT EXISTS prev_hash TEXT;
CREATE INDEX IF NOT EXISTS idx_obs_row_hash ON observations(row_hash);
