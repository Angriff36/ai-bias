ALTER TABLE generated_reports ADD COLUMN cohort_fingerprint TEXT;
ALTER TABLE generated_reports ADD COLUMN cohort_snapshot_json TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_generated_reports_cohort_fingerprint
  ON generated_reports(cohort_fingerprint) WHERE scope = 'global' AND cohort_fingerprint IS NOT NULL;
