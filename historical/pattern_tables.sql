-- Pattern Matching Tables for Sabian Intelligence Engine
-- Run this in Supabase SQL Editor to create required tables

-- Daily snapshots of which countries match which findings
CREATE TABLE IF NOT EXISTS pattern_match_history (
  run_date DATE PRIMARY KEY,
  country_count INTEGER,
  finding_count INTEGER,
  country_matches JSONB,
  finding_summary JSONB,
  changes JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Human-readable daily reports
CREATE TABLE IF NOT EXISTS pattern_daily_reports (
  report_date DATE PRIMARY KEY,
  report_text TEXT,
  new_match_count INTEGER DEFAULT 0,
  dropped_match_count INTEGER DEFAULT 0,
  finding_delta_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE pattern_match_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE pattern_daily_reports ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "service_role_pattern_match" ON pattern_match_history
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
CREATE POLICY "service_role_daily_reports" ON pattern_daily_reports
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Index for fast date lookups
CREATE INDEX IF NOT EXISTS idx_pattern_history_date ON pattern_match_history(run_date DESC);
CREATE INDEX IF NOT EXISTS idx_pattern_reports_date ON pattern_daily_reports(report_date DESC);
