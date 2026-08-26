CREATE TABLE IF NOT EXISTS generated_reports (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL CHECK (scope IN ('run', 'global')),
  public_run_id TEXT REFERENCES public_runs(id) ON DELETE CASCADE,
  response_watermark INTEGER,
  evidence_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'complete', 'failed')),
  scoring_model_id TEXT NOT NULL,
  synthesis_model_id TEXT NOT NULL,
  report_schema_version INTEGER NOT NULL DEFAULT 1,
  title TEXT,
  structured_json TEXT,
  error_code TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_generated_reports_run
  ON generated_reports(public_run_id) WHERE scope = 'run';
CREATE UNIQUE INDEX IF NOT EXISTS idx_generated_reports_watermark
  ON generated_reports(response_watermark) WHERE scope = 'global';
CREATE INDEX IF NOT EXISTS idx_generated_reports_status_time
  ON generated_reports(status, created_at DESC);

CREATE TABLE IF NOT EXISTS report_pair_scores (
  report_id TEXT NOT NULL REFERENCES generated_reports(id) ON DELETE CASCADE,
  pair_index INTEGER NOT NULL,
  run_index INTEGER NOT NULL,
  provider TEXT NOT NULL,
  model_id TEXT NOT NULL,
  score_json TEXT NOT NULL,
  PRIMARY KEY (report_id, pair_index, run_index, provider, model_id)
);
