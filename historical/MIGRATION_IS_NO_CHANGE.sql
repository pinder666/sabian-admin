-- Add is_no_change column to convergence_scores
-- Tracks when a scan's score is unchanged from the previous day (within tolerance)
-- Used by dashboard to show ◐ indicator for stable readings

ALTER TABLE convergence_scores
ADD COLUMN IF NOT EXISTS is_no_change BOOLEAN DEFAULT false;

-- Index for efficient filtering
CREATE INDEX IF NOT EXISTS idx_convergence_scores_is_no_change
ON convergence_scores (is_no_change)
WHERE is_no_change = true;
