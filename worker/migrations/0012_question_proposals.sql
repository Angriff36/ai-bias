CREATE TABLE question_proposals (
  id TEXT PRIMARY KEY,
  question_key TEXT NOT NULL UNIQUE,
  question_text TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  sampling_mode TEXT NOT NULL CHECK (sampling_mode IN ('shared-anchor', 'independent-pairs')),
  pairs_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  answered_at TEXT,
  first_run_id TEXT REFERENCES public_runs(id) ON DELETE SET NULL
);

CREATE INDEX idx_question_proposals_status_created
  ON question_proposals(answered_at, created_at DESC);
