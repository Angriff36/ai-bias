CREATE TABLE report_analysis_checkpoints (
  report_id TEXT NOT NULL REFERENCES generated_reports(id) ON DELETE CASCADE,
  analysis_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'complete', 'failed')),
  enqueued_at TEXT,
  completed_at TEXT,
  error_code TEXT,
  PRIMARY KEY (report_id, analysis_id)
);

CREATE INDEX report_analysis_checkpoints_status
  ON report_analysis_checkpoints(report_id, status);
