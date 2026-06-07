-- Sabian Phase 4 Step 9b: Custom Alert Subscriptions
-- Run in Supabase SQL editor:
-- https://supabase.com/dashboard/project/qdxgcyawpqxhhjprqyas/sql

CREATE TABLE IF NOT EXISTS alert_subscriptions (
  id              BIGSERIAL PRIMARY KEY,
  subscriber_id   TEXT NOT NULL,
  country         TEXT NOT NULL,
  alert_type      TEXT NOT NULL,
  threshold_value NUMERIC,
  webhook_url     TEXT,
  label           TEXT,
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_subscription UNIQUE (subscriber_id, country, alert_type)
);

-- alert_type values:
--   score_above       — fires when current_score > threshold_value
--   score_below       — fires when current_score < threshold_value
--   trajectory_change — fires when trajectory changes (ascending/descending/stable)
--   lead_signal_active — fires when any active lead signal is present
--   cluster_change    — fires when country moves to a different cluster

CREATE TABLE IF NOT EXISTS alert_events (
  id              BIGSERIAL PRIMARY KEY,
  subscription_id BIGINT REFERENCES alert_subscriptions(id),
  country         TEXT NOT NULL,
  alert_type      TEXT NOT NULL,
  trigger_value   TEXT,
  threshold_value NUMERIC,
  payload         JSONB,
  delivered       BOOLEAN NOT NULL DEFAULT FALSE,
  delivery_error  TEXT,
  fired_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sub_country    ON alert_subscriptions (country);
CREATE INDEX IF NOT EXISTS idx_sub_active     ON alert_subscriptions (active);
CREATE INDEX IF NOT EXISTS idx_sub_type       ON alert_subscriptions (alert_type);
CREATE INDEX IF NOT EXISTS idx_event_sub      ON alert_events (subscription_id);
CREATE INDEX IF NOT EXISTS idx_event_country  ON alert_events (country);
CREATE INDEX IF NOT EXISTS idx_event_fired    ON alert_events (fired_at);
CREATE INDEX IF NOT EXISTS idx_event_deliver  ON alert_events (delivered);
