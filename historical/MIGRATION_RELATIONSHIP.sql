-- Sabian Phase 1 Step 2: Signal Relationship Map
-- Run in Supabase SQL editor:
-- https://supabase.com/dashboard/project/qdxgcyawpqxhhjprqyas/sql

-- 1. Pairwise signal correlations at lags 0-4 years
CREATE TABLE IF NOT EXISTS signal_correlation_map (
  id               BIGSERIAL PRIMARY KEY,
  signal_a         TEXT NOT NULL,
  signal_b         TEXT NOT NULL,
  correlation_r    NUMERIC,
  lag_years        INTEGER NOT NULL DEFAULT 0,
  countries_observed INTEGER,
  sample_years_avg NUMERIC,
  computed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_corr_pair_lag UNIQUE (signal_a, signal_b, lag_years)
);

CREATE INDEX IF NOT EXISTS idx_corr_signal_a ON signal_correlation_map (signal_a);
CREATE INDEX IF NOT EXISTS idx_corr_signal_b ON signal_correlation_map (signal_b);
CREATE INDEX IF NOT EXISTS idx_corr_lag      ON signal_correlation_map (lag_years);

-- 2. Lead indicator rankings — which signals move first
CREATE TABLE IF NOT EXISTS signal_lead_indicators (
  signal_key         TEXT PRIMARY KEY,
  best_lead_lag      INTEGER,
  best_lead_target   TEXT,
  best_lead_r        NUMERIC,
  avg_lead_years     NUMERIC,
  signals_led        JSONB,
  countries_observed INTEGER,
  computed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Going-dark patterns — what follows when a signal goes silent
CREATE TABLE IF NOT EXISTS going_dark_patterns (
  id                     BIGSERIAL PRIMARY KEY,
  signal_key             TEXT NOT NULL,
  lag_years              INTEGER NOT NULL,
  dark_event_count       INTEGER,
  subsequent_spike_count INTEGER,
  spike_pct              NUMERIC,
  affected_signals       JSONB,
  countries_observed     INTEGER,
  computed_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_dark_pattern UNIQUE (signal_key, lag_years)
);

CREATE INDEX IF NOT EXISTS idx_dark_signal ON going_dark_patterns (signal_key);
