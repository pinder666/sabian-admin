-- Sabian Phase 4 Step 9e: Country Clustering
-- Run in Supabase SQL editor:
-- https://supabase.com/dashboard/project/qdxgcyawpqxhhjprqyas/sql

CREATE TABLE IF NOT EXISTS country_clusters (
  id              BIGSERIAL PRIMARY KEY,
  country         TEXT NOT NULL,
  as_of_year      INTEGER NOT NULL,
  cluster_id      INTEGER NOT NULL,
  cluster_label   TEXT,
  dominant_signal TEXT,
  centroid_dist   NUMERIC,
  cluster_members JSONB,
  computed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_cluster UNIQUE (country, as_of_year)
);

CREATE INDEX IF NOT EXISTS idx_cluster_country    ON country_clusters (country);
CREATE INDEX IF NOT EXISTS idx_cluster_id         ON country_clusters (cluster_id);
CREATE INDEX IF NOT EXISTS idx_cluster_year       ON country_clusters (as_of_year);
CREATE INDEX IF NOT EXISTS idx_cluster_label      ON country_clusters (cluster_label);
