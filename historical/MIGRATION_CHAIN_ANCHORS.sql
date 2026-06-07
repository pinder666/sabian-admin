-- MIGRATION: Chain anchors table for external hash timestamping
-- Run in Supabase SQL editor.
-- After running: node historical/chain_anchor.cjs --run-now to create first anchor.

CREATE TABLE IF NOT EXISTS chain_anchors (
  id                   BIGSERIAL PRIMARY KEY,
  anchor_date          DATE NOT NULL UNIQUE,
  anchor_hash          TEXT NOT NULL,
  anchor_payload       JSONB NOT NULL,
  cs_chain_head        TEXT,
  obs_chain_head       TEXT,
  audit_chain_head     TEXT,
  cs_row_count         INTEGER,
  obs_row_count        INTEGER,
  audit_row_count      INTEGER,
  rfc3161_tsr_b64      TEXT,
  rfc3161_submitted_at TIMESTAMPTZ,
  rfc3161_status       TEXT DEFAULT 'pending',
  ots_proof_b64        TEXT,
  ots_submitted_at     TIMESTAMPTZ,
  ots_status           TEXT DEFAULT 'pending',
  ots_confirmed        BOOLEAN DEFAULT FALSE,
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ca_date ON chain_anchors(anchor_date DESC);
