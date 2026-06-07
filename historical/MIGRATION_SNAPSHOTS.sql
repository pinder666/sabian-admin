-- MIGRATION_SNAPSHOTS.sql
-- Sabian Snapshot / Audit Layer — Step 6
-- Run once in Supabase SQL editor
-- Table: dossier_snapshots
--
-- Purpose: Immutable daily record of what Sabian saw for each country.
-- Stores full dossier JSON + checksum for forensic/compliance use.
-- Deduplication: changed_from_prior = FALSE when nothing material changed.

CREATE TABLE IF NOT EXISTS dossier_snapshots (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  country             TEXT NOT NULL,
  generated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  score               INTEGER,
  band                TEXT,
  trajectory          TEXT,
  summary_text        TEXT,          -- Sabian Insight narrative (Page 0)
  full_json           JSONB,         -- NULL when changed_from_prior = FALSE
  checksum            TEXT,          -- SHA256 of full_json content
  changed_from_prior  BOOLEAN NOT NULL DEFAULT TRUE,
  signals_count       INTEGER,
  active_lead_count   INTEGER,
  UNIQUE (country, (generated_at::date))
);

CREATE INDEX IF NOT EXISTS idx_snap_country     ON dossier_snapshots (country);
CREATE INDEX IF NOT EXISTS idx_snap_date        ON dossier_snapshots (generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_snap_band        ON dossier_snapshots (band, generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_snap_changed     ON dossier_snapshots (country, changed_from_prior, generated_at DESC);
